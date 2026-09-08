#!/usr/bin/env python3
"""Run the Kallo analytics pipeline locally without an AWS account.

This harness cannot prove IAM or LabRole assumability, real Parquet output,
EventBridge wiring, ECR/Fargate/ALB behaviour, Google Monitoring IAM, or AWS
cost. Those require Session 0 against the real AWS Academy Learner Lab.

Production extraction, aggregation, loading, and API handler modules are used
unchanged. Only their AWS client seams are replaced with local adapters.
"""

from __future__ import annotations

import argparse
import base64
import copy
import hmac
import json
import os
import re
import shutil
import sys
import threading
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.parse import parse_qs, unquote, urlsplit

import certifi
import urllib3


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
if str(REPOSITORY_ROOT) not in sys.path:
    sys.path.insert(0, str(REPOSITORY_ROOT))

from glue.transforms import compute_aggregates  # noqa: E402
from lambdas.api import metrics, runs  # noqa: E402
from lambdas.api.api_core import json_response  # noqa: E402
from lambdas.extract.extract_core import (  # noqa: E402
    run_extraction,
    utc_now,
    write_run_status,
)
from lambdas.extract.handler import Urllib3HttpClient  # noqa: E402
from lambdas.loader.loader_core import (  # noqa: E402
    load_aggregates,
    mark_run_failed,
    resolve_load_context,
)


DEFAULT_ROOT = Path(".local/s3")
LOCAL_BUCKET = "local-analytics"
LOCAL_GLUE_JOB = "local-transform"
LOCAL_EXTRACT_FUNCTION = "local-extract"
# Dashboard polling runs every five seconds.  Keep each synthetic async phase
# visible for more than one polling interval so a real browser cannot skip it.
LOCAL_PHASE_SECONDS = 7.5
DEV_SUPABASE_HOST = "jqgmcnlfxzzhrvrzpoye.supabase.co"
MANIFEST_DATE = re.compile(r"(?:^|/)dt=(\d{4}-\d{2}-\d{2})(?:/|$)")


def _utc_text() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _body_bytes(body: Any) -> bytes:
    if hasattr(body, "read"):
        body = body.read()
    if isinstance(body, str):
        return body.encode("utf-8")
    if isinstance(body, bytes):
        return body
    if isinstance(body, bytearray):
        return bytes(body)
    raise TypeError("object Body must be bytes, text, or a readable stream")


class LocalS3:
    """Filesystem-backed implementation of the S3 calls used in production."""

    def __init__(self, root: Path, bucket: str = LOCAL_BUCKET) -> None:
        self.root = root.resolve()
        self.bucket = bucket
        self._lock = threading.RLock()

    def _path(self, bucket: str, key: str) -> Path:
        if bucket != self.bucket:
            raise ValueError(f"unknown local bucket: {bucket}")
        pure_key = PurePosixPath(key)
        if pure_key.is_absolute() or ".." in pure_key.parts or not pure_key.parts:
            raise ValueError(f"unsafe S3 object key: {key!r}")
        path = self.root.joinpath(*pure_key.parts).resolve()
        if path != self.root and self.root not in path.parents:
            raise ValueError(f"S3 object key escapes local root: {key!r}")
        return path

    def put_object(
        self,
        *,
        Bucket: str,
        Key: str,
        Body: Any,
        ContentType: str | None = None,
        Metadata: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        del ContentType, Metadata
        path = self._path(Bucket, Key)
        payload = _body_bytes(Body)
        with self._lock:
            path.parent.mkdir(parents=True, exist_ok=True)
            temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
            temporary.write_bytes(payload)
            os.replace(temporary, path)
        return {"ETag": f'"local-{len(payload)}"'}

    def get_object(self, *, Bucket: str, Key: str) -> dict[str, Any]:
        path = self._path(Bucket, Key)
        with self._lock:
            return {"Body": BytesIO(path.read_bytes())}

    def list_objects_v2(
        self,
        *,
        Bucket: str,
        Prefix: str,
        ContinuationToken: str | None = None,
    ) -> dict[str, Any]:
        if ContinuationToken is not None:
            raise ValueError("LocalS3 listings are never paginated")
        self._path(Bucket, Prefix or ".placeholder")
        with self._lock:
            contents = []
            if self.root.exists():
                for path in self.root.rglob("*"):
                    if not path.is_file() or ".tmp" in path.name:
                        continue
                    key = path.relative_to(self.root).as_posix()
                    if not key.startswith(Prefix):
                        continue
                    contents.append(
                        {
                            "Key": key,
                            "LastModified": datetime.fromtimestamp(
                                path.stat().st_mtime, timezone.utc
                            ),
                        }
                    )
            contents.sort(key=lambda item: str(item["Key"]))
            return {"Contents": contents, "IsTruncated": False}


class LocalTable:
    """JSON-backed implementation of the DynamoDB table calls in production."""

    _QUERY_EXPRESSION = (
        "#metric = :metric AND #date BETWEEN :from_date AND :to_date"
    )

    def __init__(self, path: Path) -> None:
        self.path = path.resolve()
        self._lock = threading.RLock()

    @staticmethod
    def _item_key(item: dict[str, Any]) -> tuple[str, str]:
        metric = item.get("metric")
        item_date = item.get("date")
        if not isinstance(metric, str) or not isinstance(item_date, str):
            raise ValueError("DynamoDB items require string metric and date keys")
        return metric, item_date

    def _read_items(self) -> list[dict[str, Any]]:
        if not self.path.exists():
            return []
        payload = json.loads(self.path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict) or not isinstance(payload.get("items"), list):
            raise ValueError(f"invalid local DynamoDB file: {self.path}")
        if not all(isinstance(item, dict) for item in payload["items"]):
            raise ValueError(f"invalid item in local DynamoDB file: {self.path}")
        return payload["items"]

    def _write_items(self, items: list[dict[str, Any]]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_name(f".{self.path.name}.{uuid.uuid4().hex}.tmp")
        temporary.write_text(
            json.dumps(
                {"items": items},
                ensure_ascii=False,
                indent=2,
                sort_keys=True,
                allow_nan=False,
            )
            + "\n",
            encoding="utf-8",
        )
        os.replace(temporary, self.path)

    def put_item(self, *, Item: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
        if kwargs:
            raise ValueError(f"unsupported LocalTable put_item options: {sorted(kwargs)}")
        item = copy.deepcopy(Item)
        key = self._item_key(item)
        with self._lock:
            items = self._read_items()
            items = [existing for existing in items if self._item_key(existing) != key]
            items.append(item)
            items.sort(key=self._item_key)
            self._write_items(items)
        return {}

    def get_item(
        self,
        *,
        Key: dict[str, Any],
        ConsistentRead: bool | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        del ConsistentRead
        if kwargs:
            raise ValueError(f"unsupported LocalTable get_item options: {sorted(kwargs)}")
        key = self._item_key(Key)
        with self._lock:
            for item in self._read_items():
                if self._item_key(item) == key:
                    return {"Item": copy.deepcopy(item)}
        return {}

    def update_item(
        self,
        *,
        Key: dict[str, Any],
        UpdateExpression: str,
        ExpressionAttributeNames: dict[str, str] | None = None,
        ExpressionAttributeValues: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        if kwargs:
            raise ValueError(
                f"unsupported LocalTable update_item options: {sorted(kwargs)}"
            )
        if not UpdateExpression.startswith("SET "):
            raise ValueError(f"unsupported update expression: {UpdateExpression!r}")
        names = ExpressionAttributeNames or {}
        values = ExpressionAttributeValues or {}
        assignments: list[tuple[str, Any]] = []
        for raw_assignment in UpdateExpression[4:].split(","):
            parts = raw_assignment.strip().split("=", 1)
            if len(parts) != 2:
                raise ValueError(f"invalid SET assignment: {raw_assignment!r}")
            raw_name, value_token = (part.strip() for part in parts)
            attribute_name = names.get(raw_name, raw_name)
            if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", attribute_name):
                raise ValueError(f"invalid update attribute: {attribute_name!r}")
            if value_token not in values:
                raise ValueError(f"missing expression value: {value_token}")
            assignments.append((attribute_name, copy.deepcopy(values[value_token])))

        key = self._item_key(Key)
        with self._lock:
            items = self._read_items()
            item = next(
                (existing for existing in items if self._item_key(existing) == key),
                {"metric": key[0], "date": key[1]},
            )
            if item not in items:
                items.append(item)
            for attribute_name, value in assignments:
                item[attribute_name] = value
            items.sort(key=self._item_key)
            self._write_items(items)
        return {}

    def query(
        self,
        *,
        KeyConditionExpression: str,
        ExpressionAttributeNames: dict[str, str],
        ExpressionAttributeValues: dict[str, Any],
        ScanIndexForward: bool = True,
        ExclusiveStartKey: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        if kwargs or ExclusiveStartKey is not None:
            raise ValueError("unsupported LocalTable query options")
        if KeyConditionExpression != self._QUERY_EXPRESSION:
            raise ValueError(
                f"unsupported LocalTable query expression: {KeyConditionExpression!r}"
            )
        if ExpressionAttributeNames != {"#metric": "metric", "#date": "date"}:
            raise ValueError("unsupported LocalTable query attribute names")
        required_values = {":metric", ":from_date", ":to_date"}
        if set(ExpressionAttributeValues) != required_values:
            raise ValueError("unsupported LocalTable query attribute values")
        metric = ExpressionAttributeValues[":metric"]
        from_date = ExpressionAttributeValues[":from_date"]
        to_date = ExpressionAttributeValues[":to_date"]
        if not all(isinstance(value, str) for value in (metric, from_date, to_date)):
            raise ValueError("LocalTable query values must be strings")
        with self._lock:
            matches = [
                copy.deepcopy(item)
                for item in self._read_items()
                if item.get("metric") == metric
                and from_date <= str(item.get("date", "")) <= to_date
            ]
        matches.sort(key=lambda item: str(item["date"]), reverse=not ScanIndexForward)
        return {"Items": matches}


class RecordingGlueClient:
    """Record StartJobRun calls without contacting Glue."""

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self._lock = threading.Lock()

    def start_job_run(self, **kwargs: Any) -> dict[str, Any]:
        job_run_id = f"local-{uuid.uuid4()}"
        with self._lock:
            self.calls.append(copy.deepcopy(kwargs))
        return {"JobRunId": job_run_id}


@dataclass(frozen=True)
class PipelineResult:
    run_id: str
    manifest_key: str
    row_counts: dict[str, int]
    metrics: tuple[str, ...]


def _read_json_object(s3_client: LocalS3, bucket: str, key: str) -> dict[str, Any]:
    raw = s3_client.get_object(Bucket=bucket, Key=key)["Body"].read()
    payload = json.loads(raw.decode("utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"object must contain a JSON object: {key}")
    return payload


def local_transform(
    *,
    s3_client: LocalS3,
    bucket: str,
    manifest_key: str,
    run_id: str,
) -> tuple[dict[str, int], tuple[str, ...]]:
    """Mirror glue/job.py using JSONL stand-ins instead of Spark/Parquet."""

    date_match = MANIFEST_DATE.search(manifest_key)
    if date_match is None:
        raise ValueError(f"manifest key has no dt=YYYY-MM-DD segment: {manifest_key}")
    extraction_date = date_match.group(1)
    manifest = _read_json_object(s3_client, bucket, manifest_key)
    if manifest.get("run_id") != run_id:
        raise ValueError("run_id does not match the manifest run_id")
    views = manifest.get("views")
    if not isinstance(views, dict):
        raise ValueError("manifest must have a views object")

    rows_by_view: dict[str, list[dict[str, Any]]] = {}
    row_counts: dict[str, int] = {}
    for view_name, view_manifest in sorted(views.items()):
        if not isinstance(view_name, str) or not isinstance(view_manifest, dict):
            raise ValueError("manifest views must be objects keyed by view name")
        files = view_manifest.get("files")
        if not isinstance(files, list) or not all(
            isinstance(key, str) for key in files
        ):
            raise ValueError(f"manifest files for {view_name} must be a string list")

        rows: list[dict[str, Any]] = []
        for key in files:
            raw = s3_client.get_object(Bucket=bucket, Key=key)["Body"].read()
            for line_number, line in enumerate(raw.decode("utf-8").splitlines(), 1):
                if not line.strip():
                    continue
                row = json.loads(line)
                if not isinstance(row, dict):
                    raise ValueError(f"{key}:{line_number} is not a JSON object")
                rows.append(row)
        expected_rows = view_manifest.get("rows")
        if isinstance(expected_rows, int) and expected_rows != len(rows):
            raise ValueError(
                f"manifest expected {expected_rows} {view_name} rows, read {len(rows)}"
            )
        rows_by_view[view_name] = rows
        row_counts[view_name] = len(rows)

        # Like glue/job.py, an empty view leaves the previous curated snapshot.
        if files:
            curated = b"".join(
                json.dumps(
                    row,
                    ensure_ascii=False,
                    sort_keys=True,
                    separators=(",", ":"),
                    allow_nan=False,
                ).encode("utf-8")
                + b"\n"
                for row in rows
            )
            s3_client.put_object(
                Bucket=bucket,
                Key=f"curated/{view_name}/snapshot.jsonl",
                Body=curated,
                ContentType="application/x-ndjson",
                Metadata={"run-id": run_id, "local-stand-in": "true"},
            )

    aggregates = compute_aggregates(rows_by_view)
    for metric, payload in aggregates.items():
        s3_client.put_object(
            Bucket=bucket,
            Key=f"aggregates/dt={extraction_date}/run={run_id}/{metric}.json",
            Body=json.dumps(
                payload,
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
                allow_nan=False,
            ).encode("utf-8"),
            ContentType="application/json",
            Metadata={"run-id": run_id},
        )
    return row_counts, tuple(sorted(aggregates))


class LocalPipeline:
    """Orchestrate the production modules in the same order as the AWS chain."""

    def __init__(
        self,
        *,
        s3_client: LocalS3,
        table: LocalTable,
        base_url: str,
        analytics_jwt: str,
        api_key: str,
    ) -> None:
        self.s3_client = s3_client
        self.table = table
        self.base_url = base_url
        self.analytics_jwt = analytics_jwt
        self.api_key = api_key
        self.http_client = Urllib3HttpClient(
            urllib3.PoolManager(ca_certs=certifi.where())
        )
        self.glue_client = RecordingGlueClient()

    def run(
        self,
        event: dict[str, Any] | None = None,
        *,
        make_phases_observable: bool = False,
    ) -> PipelineResult:
        event = event or {}
        supplied_run_id = event.get("run_id")
        if make_phases_observable and event.get("mode") == "on_demand":
            if not isinstance(supplied_run_id, str) or not supplied_run_id:
                raise ValueError("on-demand local pipeline requires a run_id")
            write_run_status(
                self.table, supplied_run_id, "extracting", utc_now()
            )
            time.sleep(LOCAL_PHASE_SECONDS)

        extracted = run_extraction(
            event=event,
            base_url=self.base_url,
            analytics_jwt=self.analytics_jwt,
            api_key=self.api_key,
            bucket=LOCAL_BUCKET,
            glue_job_name=LOCAL_GLUE_JOB,
            http_client=self.http_client,
            s3_client=self.s3_client,
            table=self.table,
            glue_client=self.glue_client,
        )
        if make_phases_observable:
            time.sleep(LOCAL_PHASE_SECONDS)

        row_counts, _ = local_transform(
            s3_client=self.s3_client,
            bucket=LOCAL_BUCKET,
            manifest_key=extracted.manifest_key,
            run_id=extracted.run_id,
        )
        glue_event = {
            "detail": {
                "state": "SUCCEEDED",
                "arguments": {
                    "--bucket": LOCAL_BUCKET,
                    "--manifest_key": extracted.manifest_key,
                    "--run_id": extracted.run_id,
                },
            }
        }
        context = resolve_load_context(
            event=glue_event,
            default_bucket=LOCAL_BUCKET,
            s3_client=self.s3_client,
        )
        loaded = load_aggregates(
            table=self.table,
            s3_client=self.s3_client,
            context=context,
        )
        return PipelineResult(
            extracted.run_id,
            extracted.manifest_key,
            row_counts,
            loaded.metrics,
        )


class LocalLambdaClient:
    """Run the local extraction chain asynchronously for POST /runs."""

    def __init__(self, pipeline: LocalPipeline) -> None:
        self.pipeline = pipeline
        self.threads: list[threading.Thread] = []
        self._lock = threading.Lock()

    def invoke(
        self,
        *,
        FunctionName: str,
        InvocationType: str,
        Payload: Any,
    ) -> dict[str, Any]:
        if FunctionName != LOCAL_EXTRACT_FUNCTION or InvocationType != "Event":
            raise ValueError("unsupported local Lambda invocation")
        event = json.loads(_body_bytes(Payload).decode("utf-8"))
        if not isinstance(event, dict):
            raise ValueError("local Lambda payload must be a JSON object")

        thread = threading.Thread(
            target=self._run,
            args=(event,),
            name=f"local-pipeline-{event.get('run_id', 'unknown')}",
            daemon=True,
        )
        with self._lock:
            self.threads.append(thread)
        thread.start()
        return {"StatusCode": 202}

    def _run(self, event: dict[str, Any]) -> None:
        run_id = event.get("run_id")
        try:
            # Let the POST response expose its production-written queued state.
            time.sleep(0.25)
            self.pipeline.run(event, make_phases_observable=True)
        except Exception as error:
            if isinstance(run_id, str) and run_id:
                mark_run_failed(
                    table=self.pipeline.table,
                    run_id=run_id,
                    failure_reason=type(error).__name__,
                    updated_at=_utc_text(),
                )
            print(
                f"local pipeline {run_id or 'unknown'} failed: {type(error).__name__}",
                file=sys.stderr,
                flush=True,
            )


class LocalApiServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(
        self,
        address: tuple[str, int],
        *,
        table: LocalTable,
        lambda_client: LocalLambdaClient,
        dashboard_token: str | None,
    ) -> None:
        super().__init__(address, LocalRequestHandler)
        self.table = table
        self.lambda_client = lambda_client
        self.dashboard_token = dashboard_token


class LocalRequestHandler(BaseHTTPRequestHandler):
    server: LocalApiServer

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._write_response(json_response(204, {}))

    def do_GET(self) -> None:  # noqa: N802
        self._handle()

    def do_POST(self) -> None:  # noqa: N802
        self._handle()

    def log_message(self, format_string: str, *args: Any) -> None:
        print(
            f"local API {self.address_string()} - {format_string % args}",
            file=sys.stderr,
        )

    def _authorized(self) -> bool:
        expected = self.server.dashboard_token
        if expected is None:
            return True
        supplied = self.headers.get("Authorization", "")
        return hmac.compare_digest(supplied, f"Bearer {expected}")

    def _event(
        self,
        *,
        path_parameters: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        parsed = urlsplit(self.path)
        length_text = self.headers.get("Content-Length", "0")
        try:
            length = int(length_text)
        except ValueError:
            length = 0
        body = self.rfile.read(length).decode("utf-8") if length else None
        query = {
            name: values[-1]
            for name, values in parse_qs(
                parsed.query, keep_blank_values=True
            ).items()
        }
        return {
            "httpMethod": self.command,
            "pathParameters": path_parameters,
            "queryStringParameters": query or None,
            "body": body,
            "isBase64Encoded": False,
        }

    def _handle(self) -> None:
        if not self._authorized():
            self._write_response(json_response(401, {"error": "Unauthorized"}))
            return

        parsed = urlsplit(self.path)
        path = unquote(parsed.path)
        response: dict[str, Any]
        metric_match = re.fullmatch(r"/metrics/([^/]+)", path)
        run_match = re.fullmatch(r"/runs/([^/]+)", path)
        if metric_match:
            response = metrics.handle(
                self._event(path_parameters={"metric": metric_match.group(1)}),
                self.server.table,
            )
        elif path == "/runs":
            response = runs.handle(
                self._event(),
                table=self.server.table,
                lambda_client=self.server.lambda_client,
                function_name=LOCAL_EXTRACT_FUNCTION,
            )
        elif run_match:
            response = runs.handle(
                self._event(path_parameters={"run_id": run_match.group(1)}),
                table=self.server.table,
            )
        elif path == "/cloud-monitoring":
            response = json_response(501, {
                "error": "Cloud Monitoring is exercised by the deployed collector, not the local AWS adapter"
            })
        else:
            response = json_response(404, {"error": "Not found"})
        self._write_response(response)

    def _write_response(self, response: dict[str, Any]) -> None:
        status = int(response["statusCode"])
        headers = response.get("headers") or {}
        body = str(response.get("body", "")).encode("utf-8")
        self.send_response(status)
        for name, value in headers.items():
            self.send_header(str(name), str(value))
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def _required_environment(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"required environment variable {name} is not set")
    return value


def _validate_dev_credentials(base_url: str, analytics_jwt: str) -> None:
    parsed_url = urlsplit(base_url)
    if parsed_url.scheme != "https" or parsed_url.hostname != DEV_SUPABASE_HOST:
        raise RuntimeError(
            f"SUPABASE_URL must target the DEV project at {DEV_SUPABASE_HOST}"
        )
    try:
        encoded_claims = analytics_jwt.split(".")[1]
        padding = "=" * (-len(encoded_claims) % 4)
        claims = json.loads(base64.urlsafe_b64decode(encoded_claims + padding))
    except (IndexError, UnicodeDecodeError, ValueError, json.JSONDecodeError) as error:
        raise RuntimeError("ANALYTICS_READER_JWT is not a valid JWT") from error
    if not isinstance(claims, dict) or claims.get("role") != "analytics_reader":
        raise RuntimeError(
            "ANALYTICS_READER_JWT must have role=analytics_reader; "
            "service-role and user-session tokens are forbidden"
        )
    expires_at = claims.get("exp")
    if not isinstance(expires_at, (int, float)) or expires_at <= time.time():
        raise RuntimeError("ANALYTICS_READER_JWT is expired or has no numeric exp claim")


def _reset_root(root: Path) -> None:
    resolved = root.resolve()
    forbidden = {
        Path("/").resolve(),
        Path.home().resolve(),
        REPOSITORY_ROOT.resolve(),
        REPOSITORY_ROOT.parent.resolve(),
    }
    if resolved in forbidden or len(resolved.parts) < 4:
        raise ValueError(f"refusing to reset unsafe local root: {resolved}")
    if resolved.exists():
        shutil.rmtree(resolved)


def _arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--reset", action="store_true")
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--serve", action="store_true")
    parser.add_argument("--port", type=int, default=8000)
    arguments = parser.parse_args()
    if not arguments.once and not arguments.serve:
        parser.error("at least one of --once or --serve is required")
    if not 1 <= arguments.port <= 65_535:
        parser.error("--port must be between 1 and 65535")
    return arguments


def main() -> None:
    arguments = _arguments()
    root = arguments.root.resolve()
    if arguments.reset:
        _reset_root(root)

    base_url = _required_environment("SUPABASE_URL")
    analytics_jwt = _required_environment("ANALYTICS_READER_JWT")
    api_key = _required_environment("SUPABASE_API_KEY")
    _validate_dev_credentials(base_url, analytics_jwt)
    dashboard_token = os.environ.get("DASHBOARD_TOKEN")
    if dashboard_token is not None and len(dashboard_token) < 20:
        raise RuntimeError("DASHBOARD_TOKEN must be at least 20 characters")

    s3_client = LocalS3(root)
    table = LocalTable(root / "dynamodb.json")
    pipeline = LocalPipeline(
        s3_client=s3_client,
        table=table,
        base_url=base_url,
        analytics_jwt=analytics_jwt,
        api_key=api_key,
    )

    if arguments.once:
        result = pipeline.run()
        print(f"run_id: {result.run_id}")
        print(f"manifest: {result.manifest_key}")
        print("rows:")
        for view_name, row_count in sorted(result.row_counts.items()):
            print(f"  {view_name}: {row_count}")
        print("metrics loaded:")
        for metric in result.metrics:
            print(f"  {metric}")

    if arguments.serve:
        server = LocalApiServer(
            ("127.0.0.1", arguments.port),
            table=table,
            lambda_client=LocalLambdaClient(pipeline),
            dashboard_token=dashboard_token,
        )
        print(
            f"local API listening on http://127.0.0.1:{arguments.port}",
            flush=True,
        )
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()


if __name__ == "__main__":
    main()
