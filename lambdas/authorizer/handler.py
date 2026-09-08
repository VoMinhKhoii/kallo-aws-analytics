"""Constant-time static bearer TOKEN authorizer for API Gateway."""

from __future__ import annotations

import hmac
import json
import os
from collections.abc import Mapping
from typing import Any


_cached_secret: str | None = None


def load_token_secret(secrets_client: Any, secret_arn: str) -> str:
    response = secrets_client.get_secret_value(SecretId=secret_arn)
    secret = response.get("SecretString")
    if not isinstance(secret, str) or not secret:
        raise RuntimeError("token secret has no SecretString")
    try:
        parsed = json.loads(secret)
    except json.JSONDecodeError:
        return secret
    if isinstance(parsed, Mapping):
        token = parsed.get("token") or parsed.get("bearer_token")
        if isinstance(token, str) and token:
            return token
    raise RuntimeError("token secret must be a token string or JSON object with token")


def supplied_bearer_token(authorization: Any) -> str:
    if not isinstance(authorization, str) or not authorization.startswith("Bearer "):
        return ""
    return authorization[len("Bearer ") :]


def constant_time_token_matches(authorization: Any, expected_token: str) -> bool:
    """Always traverse the same ``compare_digest`` path, including malformed input."""

    supplied = supplied_bearer_token(authorization)
    return hmac.compare_digest(
        supplied.encode("utf-8"), expected_token.encode("utf-8")
    )


def cached_allow_resource(method_arn: str) -> str:
    """Authorize every configured method in this API stage for a cached token."""

    arn_parts = method_arn.split("/")
    if len(arn_parts) < 2 or not arn_parts[0] or not arn_parts[1]:
        raise ValueError("TOKEN authorizer methodArn has no API stage")
    return f"{arn_parts[0]}/{arn_parts[1]}/*/*"


def build_policy(method_arn: str, allowed: bool, expected_token: str) -> dict[str, Any]:
    resource = cached_allow_resource(method_arn) if allowed else method_arn
    policy: dict[str, Any] = {
        "principalId": "dashboard",
        "policyDocument": {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Action": "execute-api:Invoke",
                    "Effect": "Allow" if allowed else "Deny",
                    "Resource": resource,
                }
            ],
        },
    }
    # The data stack uses ApiKeySourceType AUTHORIZER; successful requests use
    # the same static token as their usage-plan identifier.
    if allowed:
        policy["usageIdentifierKey"] = expected_token
    return policy


def authorize(event: Mapping[str, Any], expected_token: str) -> dict[str, Any]:
    method_arn = event.get("methodArn")
    if not isinstance(method_arn, str) or not method_arn:
        raise ValueError("TOKEN authorizer event has no methodArn")
    allowed = constant_time_token_matches(
        event.get("authorizationToken"), expected_token
    )
    return build_policy(method_arn, allowed, expected_token)


def handler(event: Mapping[str, Any] | None, context: Any) -> dict[str, Any]:
    global _cached_secret

    import boto3

    secret_arn = os.environ.get("TOKEN_SECRET_ARN")
    if not secret_arn:
        raise RuntimeError("TOKEN_SECRET_ARN is not set")
    if _cached_secret is None:
        _cached_secret = load_token_secret(
            boto3.client("secretsmanager"), secret_arn
        )
    return authorize(event or {}, _cached_secret)
