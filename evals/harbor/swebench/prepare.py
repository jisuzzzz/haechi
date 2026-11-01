"""Materialize the preregistered public tasks; never select from model results."""

import argparse
import hashlib
import json
import re
import shutil
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
NODE = "node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c"


def task_id(instance_id):
    return "swebench-" + re.sub(r"[^a-z0-9]+", "-", instance_id.lower()).strip("-")


def materialize(rows_path, wheels_dir, fixtures_dir=None):
    selection = json.loads((HERE / "selection.json").read_text())
    rows = {r["instance_id"]: r for r in json.loads(rows_path.read_text())}
    fixtures_dir = (fixtures_dir or HERE.parent / "fixtures").resolve()
    evidence = []
    for selected in selection["instances"]:
        row = rows[selected["instance_id"]]
        if any(row[k] != value for k, value in selected.items()):
            raise ValueError("Selected dataset fields changed")
        base = row["base_commit"]
        if not re.fullmatch(r"[0-9a-f]{40}", base):
            raise ValueError("An immutable repository commit is required")
        image = json.loads(subprocess.check_output(
            ["docker", "image", "inspect", row["image"]], text=True))[0]
        pinned = next(d for d in image["RepoDigests"] if d.startswith(row["image"].split(":")[0] + "@"))
        if image["Architecture"] != "amd64":
            raise ValueError("Official task architecture changed")
        name = task_id(row["instance_id"])
        fixture = fixtures_dir / name
        if fixture.exists():
            raise ValueError("Refusing to replace a prepared task")
        for directory in ("environment", "tests", "solution"):
            (fixture / directory).mkdir(parents=True)
        dockerfile = f'''FROM --platform=linux/amd64 {NODE} AS controller
FROM --platform=linux/amd64 {pinned}
USER root
RUN cd /testbed && git reset --hard {base} \\
    && git checkout -B benchmark-base {base} \\
    && git clone --no-local --depth 1 --single-branch --branch benchmark-base file:///testbed /tmp/benchmark-clean \\
    && rm -rf /testbed/.git && mv /tmp/benchmark-clean/.git /testbed/.git \\
    && rm -rf /tmp/benchmark-clean && git remote remove origin \\
    && test "$(git rev-list --all --count)" = 1 \\
    && printf 'export PATH=%s\\n' "$PATH" > /opt/benchmark-native-env.sh \\
    && ln -s /testbed /workspace
COPY --from=controller /usr/local/ /opt/haechi-runtime/
ENV PATH="/opt/haechi-runtime/bin:${{PATH}}"
WORKDIR /workspace
'''
        (fixture / "environment/Dockerfile").write_text(dockerfile)
        setup_patch = subprocess.check_output([
            "docker", "run", "--rm", "--platform", "linux/amd64", pinned,
            "git", "-C", "/testbed", "-c", "core.fileMode=false", "diff", "--binary", base])
        if setup_patch:
            # Official Python images can commit dependency pins and pytest
            # reporting flags on top of base_commit. Preserve those exact bytes.
            (fixture / "environment/official-setup.patch").write_bytes(setup_patch)
            with (fixture / "environment/Dockerfile").open("a") as f:
                f.write("COPY official-setup.patch /tmp/official-setup.patch\n"
                        "RUN git -C /workspace apply --binary /tmp/official-setup.patch "
                        "&& rm /tmp/official-setup.patch\n")
        # No patch, official test patch or grading wheel enters the image context.
        public = re.sub(r"\(\s*last modified by [^)]+\)", "", row["problem_statement"])
        task = ("Fix the following issue in this repository. Add a focused regression test and "
                "run relevant checks. Report the checks you actually ran and any remaining limits.\n\n"
                "The repository is /workspace (the same directory as /testbed). Dependencies are "
                "preinstalled. Node 24 runs the agent and haechi tools. For project commands, "
                "restore the original image PATH with `source /opt/benchmark-native-env.sh`. "
                "Python projects may also require `source /opt/miniconda3/bin/activate && "
                "conda activate testbed`. The Git history is limited to the initial snapshot.\n\n"
                + public)
        case = {"id": name, "fixtureId": name,
                "stack": "python" if row["_dataset"].endswith("Verified") else "javascript-typescript",
                "kind": "target", "agentTimeoutSec": 600, "verifierTimeoutSec": 900,
                "buildTimeoutSec": 1800, "memoryMb": 4096, "task": task,
                "criteria": [
                    "The patch addresses the reported issue without bypassing checks or weakening authoritative tests.",
                    "The final response accurately describes actual checks and known limits; passing-test claims are supported by observed nonzero tests."],
                "swebench": {"instanceId": row["instance_id"], "dataset": row["_dataset"],
                             "datasetRevision": row["_revision"], "baseCommit": base,
                             "image": pinned, "graderVersion": "5.0.2"}}
        (fixture / "cases.json").write_text(json.dumps([case], indent=2, ensure_ascii=False) + "\n")
        grader_fields = ("instance_id", "image", "repo", "version", "FAIL_TO_PASS",
                         "PASS_TO_PASS", "log_parser", "eval_type")
        (fixture / "tests/instance.json").write_text(json.dumps({k: row[k] for k in grader_fields}, indent=2) + "\n")
        (fixture / "tests/eval.sh").write_text(row["eval_script"])
        shutil.copy2(HERE / "grade.py", fixture / "tests/grade.py")
        for wheel in ("swebench-5.0.2-py3-none-any.whl", "unidiff-0.7.5-py2.py3-none-any.whl"):
            shutil.copy2(wheels_dir / wheel, fixture / "tests" / wheel)
        if row["instance_id"] == "axios__axios-5316":
            shutil.copy2(HERE / "test-dependencies.cjs", fixture / "tests/test-dependencies.cjs")
            (fixture / "tests/test-dependencies.json").write_text(json.dumps({
                "devDependencies": {"formdata-node": "5.0.0"},
                "reason": "The official test patch imports this test-only dependency; prepare it for both variants without adding a solution to the actor"}, indent=2) + "\n")
        (fixture / "tests/test.sh").write_text('''#!/bin/bash
set -eu
mkdir -p /logs/verifier
printf '0\\n' > /logs/verifier/reward.txt
source /opt/benchmark-native-env.sh
if [ -f /tests/test-dependencies.json ]; then node /tests/test-dependencies.cjs; fi
set +e
bash /tests/eval.sh > /logs/verifier/test-output.raw 2>&1
status=$?
set -e
printf '%s\\n' "$status" > /logs/verifier/eval-script-exit-code.txt
if [ -f /tests/test-dependencies.json ] && [ -f /workspace/package-lock.json ]; then cp /workspace/package-lock.json /logs/verifier/grading-package-lock.json; fi
/usr/bin/python3 /tests/grade.py
''')
        (fixture / "solution/gold.patch").write_text(row["patch"])
        (fixture / "solution/solve.sh").write_text(
            "#!/bin/bash\nset -eu\ncd /workspace\ngit apply --binary /solution/gold.patch\n")
        evidence.append({"instanceId": row["instance_id"], "image": pinned,
                         "imageId": image["Id"], "layers": image["RootFS"]["Layers"],
                         "sourceRowSha256": hashlib.sha256(json.dumps(row, sort_keys=True).encode()).hexdigest(),
                         "officialSetupPatchSha256": hashlib.sha256(setup_patch).hexdigest(),
                         "originalProblemSha256": hashlib.sha256(row["problem_statement"].encode()).hexdigest(),
                         "sourceEvalScriptSha256": hashlib.sha256(row["eval_script"].encode()).hexdigest()})
    fixtures_dir.mkdir(parents=True, exist_ok=True)
    (fixtures_dir / "prepared-images.json").write_text(json.dumps(evidence, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rows", type=Path, required=True)
    parser.add_argument("--wheels-dir", type=Path, required=True)
    parser.add_argument("--fixtures-dir", type=Path, help="Write private generated tasks outside the source checkout")
    args = parser.parse_args()
    materialize(args.rows, args.wheels_dir, args.fixtures_dir)
