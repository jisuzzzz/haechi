"""Run the pinned, unmodified official SWE-bench grader after agent execution."""

import json
import sys
import types
from pathlib import Path


def official_modules(directory):
    """Load grading from its wheel without unrelated Docker/Modal entry points."""
    wheels = sorted(directory.glob("*.whl"))
    sys.path[:0] = [str(p) for p in wheels]
    wheel = next(p for p in wheels if p.name.startswith("swebench-"))
    for name in ("swebench", "swebench.harness"):
        package = types.ModuleType(name)
        package.__path__ = [str(wheel) + "/" + name.replace(".", "/")]
        sys.modules[name] = package


def grade(directory, logs):
    official_modules(directory)
    from swebench.harness.grading import get_eval_report, get_logs_eval
    from swebench.types import TestSpec

    row = json.loads((directory / "instance.json").read_text())
    spec = TestSpec(**{k: row[k] for k in (
        "instance_id", "image", "repo", "version", "FAIL_TO_PASS",
        "PASS_TO_PASS", "log_parser", "eval_type")}, eval_script_list=[])
    diff = logs.parent / "agent/final.diff"
    prediction = {"instance_id": row["instance_id"],
                  "model_patch": diff.read_text() if diff.exists() else "calibration"}
    output = logs / "test-output.txt"
    raw = logs / "test-output.raw"
    if raw.exists():
        # Match SWE-bench docker_utils.exec_run_with_timeout's decoding. Git
        # can print non-UTF8 fixture contents; retain the original bytes too.
        output.write_text(raw.read_bytes().decode("utf-8", errors="replace"))
    report = get_eval_report(spec, prediction, str(output), include_tests_status=True)
    statuses, parsed = get_logs_eval(spec, str(output))
    (logs / "swebench-report.json").write_text(json.dumps(report, indent=2) + "\n")
    (logs / "test-statuses.json").write_text(json.dumps({
        "parsed": parsed, "statuses": statuses}, indent=2) + "\n")
    resolved = parsed and report[row["instance_id"]]["resolved"]
    (logs / "reward.txt").write_text("1\n" if resolved else "0\n")


if __name__ == "__main__":
    grade(Path(sys.argv[1] if len(sys.argv) > 1 else "/tests"),
          Path(sys.argv[2] if len(sys.argv) > 2 else "/logs/verifier"))
