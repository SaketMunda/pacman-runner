"""Manual probe against the real OpenRouter Decisions API. NOT a test -- run by hand:

    cd backend && ../scripts/probe_jev.py   # or: python scripts/probe_jev.py from repo root

Resolves the UNCONFIRMED items in
.claude/skills/jev-integration-and-testing/references/decisions-api.md before questions.py
is written against them: the model slug, the `score` criteria encoding, and the 401 body
shape. Prints status, wall-clock latency and the raw body for each call. Never logs the key.

pytest must never collect this file -- it lives outside backend/tests (pyproject.toml's
testpaths is ["tests"]) and takes no fixtures, so nothing pulls it in.
"""

import json
import time
from pathlib import Path

import httpx

REPO_ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = REPO_ROOT / "backend" / ".env"
REQUEST_FIXTURE = (
    REPO_ROOT
    / ".claude"
    / "skills"
    / "jev-integration-and-testing"
    / "examples"
    / "junction-request.json"
)

CANDIDATE_MODELS = ["~typesafe/jev-latest", "typesafe/jev-1.13"]


def load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        env[key.strip()] = value.strip()
    return env


def call(client: httpx.Client, url: str, headers: dict[str, str], body: dict) -> dict:
    start = time.perf_counter()
    try:
        resp = client.post(url, headers=headers, json=body, timeout=15.0)
    except httpx.HTTPError as exc:
        latency_ms = round((time.perf_counter() - start) * 1000)
        return {"status": None, "latency_ms": latency_ms, "body": f"<transport error: {exc!r}>"}
    latency_ms = round((time.perf_counter() - start) * 1000)
    try:
        body_out = resp.json()
    except json.JSONDecodeError:
        body_out = resp.text
    return {"status": resp.status_code, "latency_ms": latency_ms, "body": body_out}


def report(label: str, result: dict) -> None:
    print(f"\n=== {label} ===")
    print(f"status: {result['status']}  latency_ms: {result['latency_ms']}")
    print(json.dumps(result["body"], indent=2)[:4000])


def main() -> None:
    env = load_env(ENV_PATH)
    api_key = env.get("OPENROUTER_API_KEY", "")
    if not api_key or not api_key.startswith("sk-or-"):
        raise SystemExit("backend/.env has no usable OPENROUTER_API_KEY; aborting probe.")
    base_url = env.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/alpha")
    url = f"{base_url.rstrip('/')}/decisions"

    fixture = json.loads(REQUEST_FIXTURE.read_text())
    questions = fixture["questions"]
    state = fixture["state"]

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    results: dict[str, dict] = {}

    with httpx.Client() as client:
        # 1-2: resolve the model slug, with score criteria as a JSON array first.
        working_model: str | None = None
        for model in CANDIDATE_MODELS:
            body = {"model": model, "state": state, "questions": questions}
            res = call(client, url, headers, body)
            report(f"model={model} (array criteria)", res)
            results[f"model_array_{model}"] = res
            if res["status"] == 200:
                working_model = model
                break
            if res["status"] not in (404, 400) and not (
                isinstance(res["body"], dict)
                and "model" in json.dumps(res["body"]).lower()
                and res["status"] == 400
            ):
                # Any other status (e.g. a criteria-shape rejection) still tells us the model
                # itself resolved -- keep it as a candidate.
                working_model = model
                break

        if working_model is None:
            print("\nNeither candidate model slug resolved. Stopping probe.")
            return

        # 3: try index-keyed object criteria for `score`, in case the array form was rejected.
        array_result = results.get(f"model_array_{working_model}")
        array_ok = bool(array_result and array_result["status"] == 200)
        if not array_ok:
            indexed_questions = dict(questions)
            agg = dict(indexed_questions["aggression"])
            agg["criteria"] = {str(i): text for i, text in enumerate(agg["criteria"])}
            indexed_questions["aggression"] = agg
            body = {"model": working_model, "state": state, "questions": indexed_questions}
            res = call(client, url, headers, body)
            report(f"model={working_model} (index-keyed criteria)", res)
            results["indexed_criteria"] = res

        # 4: invalid key, to capture the 401 body shape.
        bad_headers = {"Authorization": "Bearer sk-or-invalid-probe-key", "Content-Type": "application/json"}
        body = {"model": working_model, "state": state, "questions": questions}
        res = call(client, url, bad_headers, body)
        report("invalid key (expect 401)", res)
        results["invalid_key"] = res

    print(f"\n\nWorking model slug: {working_model}")
    print("Use this to update JEV_MODEL default in config.py / .env.example.")


if __name__ == "__main__":
    main()
