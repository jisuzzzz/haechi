"""Freeze, calibrate and execute Harbor tasks; never silently adopt guidance."""

import argparse
import asyncio
import hashlib
import importlib.metadata
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
HARBOR_VERSION = "0.25.0"
os.environ.setdefault("LITELLM_LOCAL_MODEL_COST_MAP", "True")
IGNORE = {"node_modules", "__pycache__", ".git", "runs", ".venv", "dist"}
SUITES = {
    "smoke": ("react", "fastapi"),
    "expanded": ("react", "fastapi", "react-request-race", "react-export",
                 "fastapi-tenant-cache", "fastapi-reservations"),
    "swebench-real": ("swebench-babel-babel-16130", "swebench-immutable-js-immutable-js-2006",
                      "swebench-preactjs-preact-4152", "swebench-axios-axios-5316",
                      "swebench-sphinx-doc-sphinx-8056", "swebench-django-django-17087"),
}
CONFIGURED_KINDS = {
    "swebench-babel-babel-16130": "babel",
    "swebench-immutable-js-immutable-js-2006": "immutable",
    "swebench-preactjs-preact-4152": "preact",
    "swebench-axios-axios-5316": "axios",
    "swebench-sphinx-doc-sphinx-8056": "sphinx",
    "swebench-django-django-17087": "django",
}


def configured_files(fixture_id):
    kind = CONFIGURED_KINDS.get(fixture_id)
    if kind is None:
        raise ValueError(f"No configured setup profile for fixture {fixture_id}")
    configured = HERE / "swebench/configured"
    files = {name: configured / "common" / name for name in (
        "babel-scope-build.cjs", "scoped-check.sh", "scoped-check.py",
        "install-data-fact.py", "data-fact.md", "user.json",
    )}
    files.update({name: configured / "profiles" / kind / name
                  for name in (".haechi.json", "repo-profile.json")})
    for path in files.values():
        if not path.is_file():
            raise ValueError(f"Configured setup file is missing: {path}")
    return files


def digest(data):
    return hashlib.sha256(data).hexdigest()


def inventory(folder):
    return {str(p.relative_to(folder)): digest(p.read_bytes())
            for p in sorted(folder.rglob("*")) if p.is_file()
            and not any(part in IGNORE for part in p.relative_to(folder).parts)}


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")
    temporary.replace(path)


def load(path):
    return json.loads(path.read_text())


def stamp():
    return datetime.now(timezone.utc).isoformat()


def auth_mode(requested="auto"):
    if requested != "auto":
        return requested
    if os.environ.get("CODEX_AUTH_JSON_PATH") or os.environ.get("CODEX_FORCE_AUTH_JSON", "").lower() in ("1", "true", "yes"):
        return "login"
    return "api-key" if os.environ.get("OPENAI_API_KEY") or os.environ.get("CODEX_API_KEY") else "login"


def event(out, **row):
    with (out / "dispatch.jsonl").open("a") as f:
        f.write(json.dumps({"timeUtc": stamp(), **row}) + "\n")
    print(json.dumps(row), flush=True)


def freeze(args):
    out = args.out.resolve()
    if out == HERE or (out.is_relative_to(HERE) and out.relative_to(HERE).parts[0] != "runs"):
        raise ValueError("Use evals/harbor/runs/ or an output directory outside the harness")
    if out.exists():
        raise ValueError("Output already exists; choose a new comparison directory")
    if args.trials < 2:
        raise ValueError("At least two trials per side and case are required")
    suite = getattr(args, "suite", "smoke")
    jobs = getattr(args, "jobs", 1)
    setup_profile = getattr(args, "setup_profile", "unconfigured")
    if suite not in SUITES or jobs not in (1, 2):
        raise ValueError("Unknown suite or unsupported concurrency (use 1 or 2)")
    if setup_profile not in ("unconfigured", "configured"):
        raise ValueError("Unknown setup profile")
    if setup_profile == "configured" and suite != "swebench-real":
        raise ValueError("Configured setup is available only for suite swebench-real")
    setup_files = ({name: configured_files(name) for name in SUITES[suite]}
                   if setup_profile == "configured" else {})
    additions = ((HERE / "swebench/configured/Dockerfile.additions").read_bytes()
                 if setup_profile == "configured" else b"")
    package = (getattr(args, "package_dir", None) or ROOT / "dist/codex").resolve()
    for name in ("hooks/hooks.json", "tools/eval-report.mjs", ".codex-plugin/plugin.json"):
        if not (package / name).is_file():
            raise ValueError(f"Package is missing {name}")
    fixture_root = (getattr(args, "fixtures_dir", None) or HERE / "fixtures").resolve()
    for fixture_id in SUITES[suite]:
        fixture = fixture_root / fixture_id
        if not (fixture / "cases.json").is_file() or any(
                not (fixture / name).is_dir() for name in ("environment", "tests", "solution")):
            raise ValueError(f"Fixture is missing or incomplete: {fixture}; materialize selected tasks before freeze")
    out.mkdir(parents=True)
    shutil.copytree(package, out / "snapshot")
    cases = []
    ids = set()
    for fixture_id in SUITES[suite]:
        fixture = fixture_root / fixture_id
        for case in load(fixture / "cases.json"):
            if not re.fullmatch(r"[a-z][a-z0-9-]*", case["id"]) or case["id"] in ids:
                raise ValueError("Task IDs must be unique lowercase slugs")
            ids.add(case["id"])
            timeout = case.get("agentTimeoutSec", 300)
            if type(timeout) is not int or not 1 <= timeout <= 900:
                raise ValueError("Agent timeout must be an integer from 1 to 900 seconds")
            stack = case.get("stack", fixture_id.split("-")[0])
            cases.append({**case, "stack": stack, "fixtureId": fixture_id, "agentTimeoutSec": timeout})
            task = out / "tasks" / case["id"]
            for name in ("environment", "tests", "solution"):
                shutil.copytree(fixture / name, task / name,
                                ignore=shutil.ignore_patterns(*IGNORE))
            if setup_profile == "configured":
                setup = task / "environment/benchmark-setup"
                setup.mkdir()
                for name, source in setup_files[fixture_id].items():
                    shutil.copy2(source, setup / name)
                dockerfile = task / "environment/Dockerfile"
                dockerfile.write_bytes(dockerfile.read_bytes() + b"\n" + additions)
            (task / "instruction.md").write_text(case["task"] + "\n")
            (task / "task.toml").write_text(
                'schema_version = "1.4"\n'
                '[metadata]\ncategory = "programming"\n'
                f'[agent]\ntimeout_sec = {timeout}.0\n'
                f'[verifier]\ntimeout_sec = {case.get("verifierTimeoutSec", 180)}.0\n'
                f'[environment]\ncpus = 2\nmemory_mb = {case.get("memoryMb", 2048)}\n'
                f'build_timeout_sec = {case.get("buildTimeoutSec", 600)}.0\n'
            )
    # Alternating order controls drift without giving either side another run's
    # transcript. Each schedule entry is a fresh Harbor trial/container.
    schedule = []
    for trial in range(1, args.trials + 1):
        for index, case in enumerate(cases):
            order = ("baseline", "candidate") if (trial + index) % 2 else ("candidate", "baseline")
            for variant in order:
                schedule.append({"id": f"run-{len(schedule) + 1:02d}", "caseId": case["id"],
                                 "trial": trial, "variant": variant})
    snapshot = inventory(out / "snapshot")
    shutil.copytree(HERE, out / "harness-source", ignore=shutil.ignore_patterns(*IGNORE))
    baseline = {"package": None, "skills": [], "config": {
        "features": {"plugins": False, "apps": False, "remote_plugin": False},
        "web_search": "disabled",
    }}
    save(out / "baseline.json", baseline)
    plan = {
        "hypothesis": (("Haechi improves issue resolution and evidence-aware completion during setup-complete coding on frozen real JS/TS and Python repositories."
                        if setup_profile == "configured" else
                        "Haechi improves issue resolution and evidence-aware completion during unattended first-use on frozen real JS/TS and Python repositories.")
                       if suite == "swebench-real" else
                       "Haechi improves evidence-aware completion on React and FastAPI tasks while preserving ordinary fixes."),
        "baseline": "sha256:" + digest((out / "baseline.json").read_bytes()),
        "candidate": "sha256:" + digest(json.dumps(snapshot, sort_keys=True).encode()),
        "conditions": f"Harbor {HARBOR_VERSION}; Docker; {args.model}; Codex {args.codex_version}; auth {auth_mode(getattr(args, 'auth_mode', 'auto'))}; reasoning medium; agent limits recorded per case; at most {jobs} isolated trials concurrently, alternating launch order within pairs; no host config; same task and initial image per pair. Small screening, not statistical proof. Functional grades and independent trace judgments are separate.",
        "suite": suite, "jobs": jobs, "setupProfile": setup_profile,
        "model": args.model, "codexVersion": args.codex_version,
        "authMode": auth_mode(getattr(args, "auth_mode", "auto")),
        "harborVersion": HARBOR_VERSION, "trials": args.trials,
        "cases": cases, "schedule": schedule,
        "calibrationFixtures": [{"fixtureId": name, "caseId": next(c["id"] for c in cases if c["fixtureId"] == name)} for name in SUITES[suite]],
        "snapshotManifest": snapshot, "taskManifest": inventory(out / "tasks"),
        "harnessManifest": inventory(out / "harness-source"),
    }
    if suite == "swebench-real":
        plan["swebenchProtocol"] = {
            "setup": ("Setup-complete coding: both variants receive identical frozen repository commands, synthetic-data facts and user preferences in the initial image; setup interaction is outside this experiment."
                      if setup_profile == "configured" else
                      "Unattended first-use: no repository or user setup profile is preinstalled; any setup interaction is part of the actor's coding budget."),
            "selectionSha256": digest((HERE / "swebench/selection.json").read_bytes()),
            "primaryFunctionalScore": "Official tests in a fresh container receiving only the exported source patch and frozen grader",
            "actorStateScore": "Diagnostic only; never overrides the fresh source-patch score",
            "freshGrader": {"timeoutSec": 900, "cpus": 2, "memoryMb": 4096,
                            "image": "Exact initial actor image ID; no actor credentials or mutated dependencies"},
            "budget": "600 seconds per actor on both sides; no hard total-token cap; actual usage retained",
            "calibrationReuse": "Allowed only for the identical taskManifest and pinned Harbor version; original raw results and source plan retained",
            "interpretation": "Six selected public issues, not a full SWE-bench score; no model sampling seed is set",
            "reporting": "Each real issue includes official F2P targets and P2P regressions; no frozen case kinds are relabeled. Missing execution/grade/judgment is inconclusive, any candidate combined-criteria failure rejects the improvement hypothesis, all-side passes are inconclusive, and repeated baseline-fail/candidate-pass requires every candidate case to pass. No automatic adoption.",
        }
    save(out / "plan.json", plan)
    plan_hash = digest((out / "plan.json").read_bytes())
    (out / "plan.sha256").write_text(plan_hash + "\n")
    # Preserve raw JSONL bytes across checkouts when selected evidence is archived.
    (out / ".gitattributes").write_text("* -text\n*.diff -whitespace\n*.log -whitespace\n")
    event(out, event="frozen", planSha256=plan_hash, runs=len(schedule))
    return plan


def verify(out, active_harness=True):
    plan = load(out / "plan.json")
    if digest((out / "plan.json").read_bytes()) != (out / "plan.sha256").read_text().strip():
        raise ValueError("Frozen plan changed")
    if "sha256:" + digest((out / "baseline.json").read_bytes()) != plan["baseline"]:
        raise ValueError("Frozen baseline configuration changed")
    for folder, key in ((out / "snapshot", "snapshotManifest"), (out / "tasks", "taskManifest"),
                        (out / "harness-source", "harnessManifest")):
        if inventory(folder) != plan[key]:
            raise ValueError(f"Frozen inputs changed: {folder}")
    if active_harness and inventory(HERE) != plan["harnessManifest"]:
        raise ValueError("Active harness changed; start a new plan before executing more trials")
    return plan


def runtime_check(mode=None, require_credentials=True):
    version = importlib.metadata.version("harbor")
    if version != HARBOR_VERSION:
        raise ValueError(f"Need Harbor {HARBOR_VERSION}, got {version}")
    docker = subprocess.run(["docker", "info", "--format", "{{.ServerVersion}}"],
                            check=True, text=True, capture_output=True).stdout.strip()
    mode = mode or auth_mode()
    if require_credentials:
        if mode == "login":
            auth = Path(os.environ.get("CODEX_AUTH_JSON_PATH") or Path.home() / ".codex/auth.json")
            if not auth.is_file() or auth.stat().st_size == 0:
                raise ValueError("Codex login file is missing; sign in first or choose --auth-mode api-key")
        elif not (os.environ.get("OPENAI_API_KEY") or os.environ.get("CODEX_API_KEY")):
            raise ValueError("API-key mode needs OPENAI_API_KEY or CODEX_API_KEY")
    return {"harbor": version, "docker": docker, "python": sys.version.split()[0], "authMode": mode}


async def job(out, plan, job_id, case_id, agent):
    from harbor.job import Job
    from harbor.models.job.config import JobConfig
    fresh_grader = case_id.startswith("swebench-") and bool(agent.get("import_path"))
    if fresh_grader:
        agent = {**agent, "kwargs": {**agent.get("kwargs", {}), "fresh_grader": True}}
    config = JobConfig.model_validate({
        "job_name": job_id, "jobs_dir": str(out / "jobs"), "n_attempts": 1,
        "n_concurrent_trials": 1, "retry": {"max_retries": 0}, "quiet": True,
        "environment": {"type": "docker", "delete": True},
        "tasks": [{"path": str(out / "tasks" / case_id)}], "agents": [agent],
    })
    save(out / "configs" / (job_id + ".json"), config.model_dump(mode="json"))
    runner = await Job.create(config)
    try:
        await runner.run()
        trial_files = list((out / "jobs" / job_id).glob("*/result.json"))
        if len(trial_files) != 1:
            raise ValueError(f"Expected exactly one trial in {job_id}, got {len(trial_files)}")
        trial = trial_files[0].parent
        if fresh_grader:
            from .swebench.replay import grade_patch
            # Harbor has stopped the actor before Job.run returns. The verifier
            # receives only the frozen tests and the actor's exported patch.
            await asyncio.to_thread(grade_patch, out, case_id, trial)
        return trial
    finally:
        if fresh_grader:
            from .swebench.replay import cleanup_graders
            cleanup_graders(out / "jobs" / job_id)


async def calibrate(out):
    plan = verify(out)
    runtime = runtime_check(plan["authMode"], require_credentials=False)
    save(out / "runtime.json", runtime)
    rows = []
    # Calibrate every distinct fixture, including target-only hard tasks.
    # No calibration invokes a model.
    for fixture in plan["calibrationFixtures"]:
        for name, expected in (("nop", 0), ("oracle", 1)):
            job_id = f"calibrate-{fixture['fixtureId']}-{name}"
            if (out / "jobs" / job_id).exists():
                raise ValueError(f"Calibration already exists: {job_id}")
            event(out, event="calibration-start", jobId=job_id)
            trial = await job(out, plan, job_id, fixture["caseId"], {"name": name})
            result = load(trial / "result.json")
            reward = (trial / "verifier/reward.txt").read_text().strip()
            row = {"jobId": job_id, "fixtureId": fixture["fixtureId"], "agent": name, "expected": expected, "reward": reward,
                   "result": str(trial.relative_to(out)),
                   "evidenceManifest": inventory(trial),
                   "passed": not result.get("exception_info") and float(reward) == expected}
            rows.append(row)
            save(out / "calibration.json", rows)
            event(out, event="calibration-end", **row)
            if not row["passed"]:
                raise ValueError("Grader calibration failed; do not start comparison")


def validate_calibration(out, plan):
    rows = load(out / "calibration.json")
    expected = {f"calibrate-{f['fixtureId']}-{a}": reward for f in plan["calibrationFixtures"]
                for a, reward in (("nop", 0), ("oracle", 1))}
    if len(rows) != len(expected) or {r["jobId"] for r in rows} != set(expected):
        raise ValueError("Every selected fixture needs one broken and one oracle calibration")
    for row in rows:
        trial = out / row["result"]
        if not trial.resolve().is_relative_to((out / "jobs" / row["jobId"]).resolve()):
            raise ValueError("Calibration evidence is outside its job")
        reward = float((trial / "verifier/reward.txt").read_text())
        if (inventory(trial) != row["evidenceManifest"] or load(trial / "result.json").get("exception_info")
                or reward != expected[row["jobId"]] or not row["passed"]):
            raise ValueError("Calibration evidence is changed, incomplete or failed")


def trial_observation(out, row, trial):
    result = load(trial / "result.json")
    trace = trial / "agent/codex.txt"
    events = []
    if trace.exists():
        for line in trace.read_text().splitlines():
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    completed = any(e.get("type") == "turn.completed" for e in events)
    failed = any(e.get("type") in ("turn.failed", "error") for e in events)
    audit_path = trial / "agent/hook-audit.jsonl"
    audit = [json.loads(s) for s in audit_path.read_text().splitlines()] if audit_path.exists() else []
    delivered = any(a["status"] == 0 and "[haechi]" in a["output"]
                    and "SessionStart" in a["command"] for a in audit)
    clean_control = not audit
    reward_path = trial / "verifier/reward.txt"
    reward = reward_path.read_text().strip() if reward_path.exists() else None
    actor_reward = reward
    fresh = trial / "fresh-verifier"
    if row["caseId"].startswith("swebench-"):
        reward_path = fresh / "reward.txt"
        reward = reward_path.read_text().strip() if reward_path.exists() else None
    image_path = trial / "agent/image-id.txt"
    image_id = image_path.read_text().strip() if image_path.exists() else None
    layers_path = trial / "agent/image-layers.json"
    layers_hash = digest(layers_path.read_bytes()) if layers_path.exists() else None
    budget_exceeded = (result.get("exception_info") or {}).get("exception_type") == "AgentTimeoutError"
    started = any(e.get("type") in ("turn.started", "item.started", "item.completed") for e in events)
    valid = (completed and not failed and not result.get("exception_info")) or (budget_exceeded and started)
    valid = valid and reward in ("0", "1") and bool(image_id) and bool(layers_hash) and (delivered if row["variant"] == "candidate" else clean_control)
    official_path = (fresh if row["caseId"].startswith("swebench-") else trial / "verifier") / "swebench-report.json"
    official = load(official_path) if official_path.exists() else None
    if row["caseId"].startswith("swebench-") and not official:
        valid = False
    if row["caseId"].startswith("swebench-"):
        runtime_path = fresh / "runtime.json"
        runtime = load(runtime_path) if runtime_path.exists() else {}
        valid = (valid and not (fresh / "execution-error.txt").exists()
                 and runtime.get("imageId") == image_id and runtime.get("credentialsCopied") is False)
    if official:
        valid = valid and not any(r.get("infra_failure") for r in official.values())
        expected_reward = "1" if all(r.get("resolved") is True for r in official.values()) else "0"
        valid = valid and reward == expected_reward
    observation = {**row, "trialDir": str(trial.relative_to(out)), "validExecution": valid,
            "turnCompleted": completed, "haechiDelivered": delivered,
            "controlHasNoHooks": clean_control, "functionalReward": reward,
            "imageId": image_id, "imageLayersSha256": layers_hash,
            "exception": result.get("exception_info"),
            "evidenceManifest": inventory(trial),
            "usage": [e.get("usage") for e in events if e.get("type") == "turn.completed"]}
    if budget_exceeded:
        observation["budgetExceeded"] = True
    if official is not None:
        observation["swebenchReport"] = official
    if row["caseId"].startswith("swebench-"):
        observation["actorStateFunctionalReward"] = actor_reward
    return observation


def read_observations(out, plan):
    rows = load(out / "observations.json") if (out / "observations.json").exists() else []
    scheduled = {r["id"]: r for r in plan["schedule"]}
    seen = set()
    images = {}
    for row in rows:
        expected = scheduled.get(row["id"])
        if not expected or row["id"] in seen or any(row.get(k) != v for k, v in expected.items()):
            raise ValueError("Unknown, duplicate or relabeled execution observation")
        seen.add(row["id"])
        trial = out / row["trialDir"]
        if not trial.resolve().is_relative_to((out / "jobs" / row["id"]).resolve()):
            raise ValueError("Trial evidence is outside its scheduled job")
        if inventory(trial) != row["evidenceManifest"]:
            raise ValueError("Execution evidence changed after collection")
        if trial_observation(out, expected, trial) != row:
            raise ValueError("Execution classification differs from its actual evidence")
        case = next(c for c in plan["cases"] if c["id"] == row["caseId"])
        fixture_id = case.get("fixtureId", case["stack"])
        if row["imageLayersSha256"] and images.setdefault(fixture_id, row["imageLayersSha256"]) != row["imageLayersSha256"]:
            raise ValueError("Fixture image changed between executions; comparison is invalid")
    return rows


async def execute(out):
    plan = verify(out)
    runtime_check(plan["authMode"])
    validate_calibration(out, plan)
    observations = read_observations(out, plan)
    done = {row["id"] for row in observations}
    pending = [row for row in plan["schedule"] if row["id"] not in done]
    async def attempt(row):
        return await job(out, plan, row["id"], row["caseId"], {
            "import_path": "evals.harbor.agent:HaechiCodex", "model_name": plan["model"],
            "env": ({"CODEX_FORCE_AUTH_JSON": "1"} if plan["authMode"] == "login" else
                    {"CODEX_FORCE_AUTH_JSON": "0", "CODEX_AUTH_JSON_PATH": ""}),
            "kwargs": {"variant": row["variant"], "snapshot": str(out / "snapshot"),
                       "version": plan["codexVersion"], "reasoning_effort": "medium"},
        })
    for offset in range(0, len(pending), plan.get("jobs", 1)):
        verify(out)
        batch = pending[offset:offset + plan.get("jobs", 1)]
        for row in batch:
            if (out / "jobs" / row["id"]).exists():
                raise ValueError(f"Interrupted job {row['id']} exists; inspect it, do not silently retry")
        for row in batch:
            event(out, event="started", **row)
        results = await asyncio.gather(*(attempt(row) for row in batch), return_exceptions=True)
        errors = []
        for row, trial in zip(batch, results):
            if isinstance(trial, BaseException):
                errors.append(str(trial))
                event(out, event="runtime-error", reason=str(trial), **row)
                continue
            try:
                observation = trial_observation(out, row, trial)
            except (ValueError, OSError, KeyError) as error:
                errors.append(f"{row['id']}: evidence parsing: {error}")
                event(out, event="runtime-error", reason=str(error), **row)
                continue
            observations.append(observation)
            event(out, event="finished", **observation)
            if not observation["validExecution"]:
                errors.append(f"{row['id']}: execution/delivery failure")
        save(out / "observations.json", observations)
        read_observations(out, plan)
        if errors:
            raise ValueError("Runtime failure preserved; no silent retry: " + "; ".join(errors))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("freeze", "verify", "preflight", "calibrate", "run"))
    parser.add_argument("--out", type=Path, default=HERE / "runs/local")
    parser.add_argument("--model", default="openai/gpt-6-astra")
    parser.add_argument("--codex-version", default="0.153.4")
    parser.add_argument("--trials", type=int, default=2)
    parser.add_argument("--auth-mode", choices=("auto", "login", "api-key"), default="auto")
    parser.add_argument("--suite", choices=tuple(SUITES), default="smoke")
    parser.add_argument("--setup-profile", choices=("unconfigured", "configured"), default="unconfigured")
    parser.add_argument("--jobs", type=int, choices=(1, 2), default=1)
    parser.add_argument("--fixtures-dir", type=Path, help="Read externally materialized task fixtures (default: bundled constructed tasks)")
    parser.add_argument("--package-dir", type=Path, help="Use a saved package to hold the treatment constant")
    args = parser.parse_args()
    args.out = args.out.resolve()
    if args.command == "freeze":
        freeze(args)
    elif args.command == "verify":
        verify(args.out)
        print("Frozen inputs match")
    elif args.command == "preflight":
        print(json.dumps(runtime_check(auth_mode(args.auth_mode))))
    else:
        asyncio.run(calibrate(args.out) if args.command == "calibrate" else execute(args.out))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError, importlib.metadata.PackageNotFoundError) as error:
        print(f"harbor comparison: {error}", file=sys.stderr)
        sys.exit(1)
