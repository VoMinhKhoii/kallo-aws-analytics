from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _resource_block(template: str, logical_id: str, next_logical_id: str) -> str:
    return template.split(f"  {logical_id}:\n", 1)[1].split(
        f"  {next_logical_id}:\n", 1
    )[0]


def test_dashboard_reads_have_two_bounded_execution_lanes() -> None:
    template = (ROOT / "infra" / "data-stack.yaml").read_text(encoding="utf-8")
    metrics = _resource_block(template, "ApiMetricsFunction", "ApiRunsFunction")
    authorizer = _resource_block(template, "AuthorizerFunction", "DashboardApi")
    extract = _resource_block(template, "ExtractFunction", "LoaderFunction")

    assert "ReservedConcurrentExecutions: 2" in metrics
    assert "ReservedConcurrentExecutions: 2" in authorizer
    assert "ReservedConcurrentExecutions: 1" in extract
    assert sum(
        int(line.rsplit(":", 1)[1])
        for line in template.splitlines()
        if "ReservedConcurrentExecutions:" in line
    ) == 8


def test_static_bearer_authorization_is_cached_for_one_dashboard_window() -> None:
    template = (ROOT / "infra" / "data-stack.yaml").read_text(encoding="utf-8")
    authorizer = _resource_block(template, "DashboardAuthorizer", "MetricsResource")

    assert "Type: TOKEN" in authorizer
    assert "AuthorizerResultTtlInSeconds: 300" in authorizer
    assert "ApiDeploymentV3:" in template
    assert "DeploymentId: !Ref ApiDeploymentV3" in template


def test_observe_pages_use_their_intended_data_paths() -> None:
    today = (ROOT / "dashboard" / "app" / "page.tsx").read_text(encoding="utf-8")
    system = (ROOT / "dashboard" / "app" / "system" / "page.tsx").read_text(
        encoding="utf-8"
    )

    assert today.count("useMetricBundle(") == 1
    assert system.count("useCloudMonitoring(") == 1
    assert "useMetricBundle(" not in system
    assert '"app_health"' not in today
    assert '"app_health"' not in system
    assert 'fetch("/api/aws-status"' not in system


def test_data_heavy_navigation_does_not_prefetch_aws_routes() -> None:
    sidebar = (ROOT / "dashboard" / "components" / "shell" / "sidebar.tsx").read_text(
        encoding="utf-8"
    )

    assert "prefetch={false}" in sidebar


def test_metric_cache_namespace_excludes_pre_fix_error_bundles() -> None:
    api = (ROOT / "dashboard" / "app" / "lib" / "api.ts").read_text(
        encoding="utf-8"
    )

    assert '"aws-dashboard-selected-metrics-operational-v4"' in api
    assert '"aws-dashboard-selected-metrics-operational-v3"' not in api
