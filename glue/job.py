"""AWS Glue 4.0 entrypoint for Kallo raw, curated, and aggregate data."""

from __future__ import annotations

import json
import re
import sys
from collections.abc import Mapping, Sequence
from typing import Any

import boto3
from pyspark.sql import SparkSession
from pyspark.sql.functions import lit

from transforms import compute_aggregates


MANIFEST_DATE = re.compile(r"(?:^|/)dt=(\d{4}-\d{2}-\d{2})(?:/|$)")


def _argument(name: str, *, aliases: Sequence[str] = ()) -> str:
    """Read a Glue ``--name value`` argument without requiring awsglue in tests."""

    for candidate in (name, *aliases):
        flag = f"--{candidate}"
        if flag in sys.argv:
            index = sys.argv.index(flag)
            if index + 1 < len(sys.argv) and not sys.argv[index + 1].startswith("--"):
                return sys.argv[index + 1]
    aliases_text = ", ".join(f"--{value}" for value in aliases)
    suffix = f" (or {aliases_text})" if aliases_text else ""
    raise ValueError(f"missing required Glue argument --{name}{suffix}")


def _manifest_date(manifest_key: str) -> str:
    match = MANIFEST_DATE.search(manifest_key)
    if not match:
        raise ValueError(f"manifest key has no dt=YYYY-MM-DD partition: {manifest_key}")
    return match.group(1)


def _s3_uri(bucket: str, key: str) -> str:
    return key if key.startswith("s3://") else f"s3://{bucket}/{key.lstrip('/')}"


def _load_manifest(s3_client: Any, bucket: str, key: str) -> dict[str, Any]:
    response = s3_client.get_object(Bucket=bucket, Key=key)
    manifest = json.loads(response["Body"].read().decode("utf-8"))
    if not isinstance(manifest, dict) or not isinstance(manifest.get("views"), dict):
        raise ValueError("manifest must be an object with a views object")
    return manifest


def main() -> None:
    run_id = _argument("run_id")
    manifest_key = _argument("manifest_key", aliases=("manifest",))
    # --source_bucket is retained for the existing stack's default argument;
    # deployments should pass the requested --bucket name directly.
    bucket = _argument("bucket", aliases=("source_bucket",))
    extraction_date = _manifest_date(manifest_key)

    s3_client = boto3.client("s3")
    manifest = _load_manifest(s3_client, bucket, manifest_key)
    if manifest.get("run_id") != run_id:
        raise ValueError("--run_id does not match the manifest run_id")

    spark = SparkSession.builder.appName("kallo-analytics-etl").getOrCreate()
    spark.conf.set("spark.sql.sources.partitionOverwriteMode", "dynamic")
    rows_by_view: dict[str, list[dict[str, Any]]] = {}

    views = manifest["views"]
    for view_name, view_manifest in sorted(views.items()):
        if not isinstance(view_name, str) or not isinstance(view_manifest, Mapping):
            raise ValueError("manifest view entries must be objects keyed by view name")
        files = view_manifest.get("files")
        if not isinstance(files, list) or not all(
            isinstance(key, str) for key in files
        ):
            raise ValueError(f"manifest files for {view_name} must be a string list")
        if not files:
            rows_by_view[view_name] = []
            continue

        frame = spark.read.json([_s3_uri(bucket, key) for key in files])
        # The Learner Lab extract is only thousands of sanitized rows per run.
        # Collecting here is intentionally bounded and keeps all business logic
        # in pure Python functions that pytest can execute without PySpark.
        rows = [row.asDict(recursive=True) for row in frame.collect()]
        expected_rows = view_manifest.get("rows")
        if isinstance(expected_rows, int) and expected_rows != len(rows):
            raise ValueError(
                f"manifest expected {expected_rows} {view_name} rows, read {len(rows)}"
            )
        rows_by_view[view_name] = rows

        curated_uri = f"s3://{bucket}/curated/{view_name}/"
        (
            frame.withColumn("dt", lit(extraction_date))
            .write.mode("overwrite")
            .partitionBy("dt")
            .parquet(curated_uri)
        )

    for metric, payload in compute_aggregates(rows_by_view).items():
        key = f"aggregates/dt={extraction_date}/{metric}.json"
        s3_client.put_object(
            Bucket=bucket,
            Key=key,
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

    spark.stop()


if __name__ == "__main__":
    main()
