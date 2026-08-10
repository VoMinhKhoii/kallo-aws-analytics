from __future__ import annotations

from lambdas.authorizer import handler as authorizer


METHOD_ARN = "arn:aws:execute-api:us-east-1:123456789012:api/prod/GET/metrics/dau_wau"


def effect(policy):
    return policy["policyDocument"]["Statement"][0]["Effect"]


def test_authorizer_allows_exact_bearer_token_and_uses_api_arn():
    policy = authorizer.authorize(
        {"authorizationToken": "Bearer dashboard-secret", "methodArn": METHOD_ARN},
        "dashboard-secret",
    )

    assert effect(policy) == "Allow"
    assert policy["policyDocument"]["Statement"][0]["Resource"] == METHOD_ARN
    assert policy["usageIdentifierKey"] == "dashboard-secret"


def test_authorizer_denies_wrong_or_malformed_tokens():
    wrong = authorizer.authorize(
        {"authorizationToken": "Bearer wrong", "methodArn": METHOD_ARN},
        "dashboard-secret",
    )
    malformed = authorizer.authorize(
        {"authorizationToken": "dashboard-secret", "methodArn": METHOD_ARN},
        "dashboard-secret",
    )

    assert effect(wrong) == "Deny"
    assert effect(malformed) == "Deny"
    assert "usageIdentifierKey" not in wrong


def test_allow_and_deny_both_take_compare_digest_path(monkeypatch):
    calls = []

    def fake_compare(left, right):
        calls.append((left, right))
        return left == right

    monkeypatch.setattr(authorizer.hmac, "compare_digest", fake_compare)

    assert authorizer.constant_time_token_matches(
        "Bearer dashboard-secret", "dashboard-secret"
    )
    assert not authorizer.constant_time_token_matches("not-a-bearer", "dashboard-secret")
    assert calls == [
        (b"dashboard-secret", b"dashboard-secret"),
        (b"", b"dashboard-secret"),
    ]


class FakeSecrets:
    def __init__(self):
        self.calls = []

    def get_secret_value(self, **kwargs):
        self.calls.append(kwargs)
        return {"SecretString": "cached-token"}


def test_token_secret_loader_accepts_plain_secret_string():
    client = FakeSecrets()

    assert authorizer.load_token_secret(client, "token-arn") == "cached-token"
    assert client.calls == [{"SecretId": "token-arn"}]

