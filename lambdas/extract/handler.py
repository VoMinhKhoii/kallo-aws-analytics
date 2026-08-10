"""AWS Lambda entrypoint for the Supabase-to-S3 analytics extract."""

from __future__ import annotations

import json
import os
from collections.abc import Mapping
from typing import Any

import urllib3

try:  # Lambda ZIPs place both modules at the archive root.
    from extract_core import TransientHttpError, run_extraction
except ImportError:  # Tests import this file as ``lambdas.extract.handler``.
    from .extract_core import TransientHttpError, run_extraction


class Urllib3HttpClient:
    """Adapt urllib3 to the small HTTP protocol used by ``extract_core``."""

    def __init__(self, pool: urllib3.PoolManager) -> None:
        self._pool = pool

    def request(
        self,
        method: str,
        url: str,
        *,
        headers: Mapping[str, str],
        timeout: float,
    ) -> Any:
        try:
            return self._pool.request(
                method,
                url,
                headers=dict(headers),
                timeout=urllib3.Timeout(total=timeout),
                retries=False,
            )
        except urllib3.exceptions.TimeoutError as error:
            raise TransientHttpError(f"PostgREST request timed out: {url}") from error


def _required_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"required environment variable {name} is not set")
    return value


def _load_supabase_credentials(secrets_client: Any, secret_arn: str) -> tuple[str, str, str]:
    response = secrets_client.get_secret_value(SecretId=secret_arn)
    secret_string = response.get("SecretString")
    if not isinstance(secret_string, str):
        raise RuntimeError("Supabase secret must contain a JSON SecretString")
    try:
        secret = json.loads(secret_string)
    except json.JSONDecodeError as error:
        raise RuntimeError("Supabase SecretString must be valid JSON") from error
    if not isinstance(secret, dict):
        raise RuntimeError("Supabase SecretString must be a JSON object")

    base_url = secret.get("url") or secret.get("base_url")
    analytics_jwt = (
        secret.get("analytics_jwt") or secret.get("jwt") or secret.get("key")
    )
    # Supabase's gateway accepts an API key separately from the bearer JWT.  A
    # two-value secret can use its analytics JWT for both headers; deployments
    # that store an explicit gateway key can provide api_key/apikey as well.
    api_key = secret.get("api_key") or secret.get("apikey") or analytics_jwt
    if not all(isinstance(value, str) and value for value in (base_url, analytics_jwt, api_key)):
        raise RuntimeError(
            "Supabase secret requires url and analytics_jwt (or jwt/key) strings"
        )
    return base_url, analytics_jwt, api_key


def handler(event: Mapping[str, Any] | None, context: Any) -> dict[str, Any]:
    """Extract all source views and hand the completed manifest to Glue."""

    # boto3 is part of the managed Lambda runtime and intentionally is not a
    # vendored application dependency.
    import boto3

    secret_arn = _required_env("SUPABASE_SECRET_ARN")
    table_name = _required_env("TABLE_NAME")
    glue_job_name = _required_env("GLUE_JOB_NAME")
    bucket = os.environ.get("BUCKET") or os.environ.get("BUCKET_NAME")
    if not bucket:
        raise RuntimeError("required environment variable BUCKET or BUCKET_NAME is not set")

    secrets_client = boto3.client("secretsmanager")
    base_url, analytics_jwt, api_key = _load_supabase_credentials(
        secrets_client, secret_arn
    )
    result = run_extraction(
        event=event,
        base_url=base_url,
        analytics_jwt=analytics_jwt,
        api_key=api_key,
        bucket=bucket,
        glue_job_name=glue_job_name,
        http_client=Urllib3HttpClient(urllib3.PoolManager()),
        s3_client=boto3.client("s3"),
        table=boto3.resource("dynamodb").Table(table_name),
        glue_client=boto3.client("glue"),
    )
    return {
        "run_id": result.run_id,
        "manifest_key": result.manifest_key,
        "phase": "transform_started",
    }
