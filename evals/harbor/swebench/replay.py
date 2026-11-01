"""Grade only the exported source patch in a fresh, credential-free container."""

import hashlib
import json
import os
import subprocess
import uuid


LABEL = "haechi.fresh-grader"


def docker(*args, check=True, commands=None, timeout=60):
    # A host default must not silently turn an image-ID create into a request
    # for a different platform than the exact actor image's metadata.
    env = {key: value for key, value in os.environ.items() if key != "DOCKER_DEFAULT_PLATFORM"}
    result = subprocess.run(["docker", *args], text=True, capture_output=True, timeout=timeout, env=env)
    if commands is not None:
        commands.append({"args": list(args), "exitCode": result.returncode,
                         "stdout": result.stdout, "stderr": result.stderr})
    if check and result.returncode:
        raise RuntimeError("Fresh grader Docker operation failed: " + args[0])
    return result


def owner(trial):
    return hashlib.sha256(str(trial.resolve()).encode()).hexdigest()


def prepare_grader(trial, image):
    """Pin an initial-image container before Harbor can remove its image.

    Do not request a platform: some Apple Silicon Docker builders label an
    AMD64 RootFS as arm64. Reusing the exact image without an override follows
    the same Docker execution path that successfully started the actor.
    """
    name = "haechi-swe-replay-" + uuid.uuid4().hex[:16]
    commands = []
    try:
        container = docker("create", "--name", name, "--label", LABEL + "=" + owner(trial),
                           "--cpus", "2", "--memory", "4096m", "--workdir", "/workspace",
                           image, "sleep", "infinity", commands=commands).stdout.strip()
        actual = json.loads(docker("inspect", container, commands=commands).stdout)[0]
        if actual["Image"] != image or actual["State"]["Status"] != "created":
            raise ValueError("Prepared grader differs from the actor's initial image or is already running")
        image_info = json.loads(docker("image", "inspect", image, commands=commands).stdout)[0]
        record = {"containerId": actual["Id"], "containerName": name, "imageId": image,
                  "imageArchitecture": image_info["Architecture"], "imageOs": image_info["Os"],
                  "imageLayers": image_info["RootFS"]["Layers"], "platformOverride": None,
                  "createdBeforeActorCleanup": True}
        # The trial root is outside the actor-writable /logs/agent bind mount.
        (trial / "fresh-grader.json").write_text(json.dumps(record, indent=2) + "\n")
    except BaseException:
        docker("rm", "-f", name, check=False, commands=commands)
        raise
    finally:
        (trial / "fresh-grader-prepare-dispatch.json").write_text(json.dumps(commands, indent=2) + "\n")


def owned_container(trial, record, commands):
    result = docker("inspect", record["containerId"], check=False, commands=commands)
    if result.returncode:
        return None
    actual = json.loads(result.stdout)[0]
    if (actual["Config"].get("Labels", {}).get(LABEL) != owner(trial)
            or actual["Name"] != "/" + record["containerName"]):
        raise ValueError("Prepared grader ownership differs from this trial")
    return actual


def cleanup_grader(trial, commands=None):
    path = trial / "fresh-grader.json"
    if not path.exists():
        return
    record = json.loads(path.read_text())
    if owned_container(trial, record, commands) is not None:
        removed = docker("rm", "-f", record["containerId"], check=False, commands=commands)
        # Cancellation can race the grading thread's own finally. Treat an
        # already removed owned container as successful cleanup.
        if removed.returncode and owned_container(trial, record, commands) is not None:
            raise RuntimeError("Fresh grader container could not be removed")


def cleanup_graders(job_dir):
    # Also covers exceptions, actor timeouts and failures before result.json.
    for path in job_dir.glob("*/fresh-grader.json"):
        commands = []
        try:
            cleanup_grader(path.parent, commands)
        finally:
            (path.parent / "fresh-grader-cleanup-dispatch.json").write_text(json.dumps(commands, indent=2) + "\n")


def grade_patch(out, case_id, trial):
    destination = trial / "fresh-verifier"
    destination.mkdir()
    commands = []
    try:
        record = json.loads((trial / "fresh-grader.json").read_text())
        image = (trial / "agent/image-id.txt").read_text().strip()
        actual = owned_container(trial, record, commands)
        if (actual is None or actual["Image"] != image or image != record["imageId"]
                or actual["State"]["Status"] != "created"):
            raise ValueError("Fresh grader is missing, already used or differs from the agent's initial image")
        name = record["containerId"]
        # Start only after Job.run has crossed the actor's cleanup boundary.
        docker("start", name, commands=commands)
        docker("cp", str(out / "tasks" / case_id / "tests") + "/.", name + ":/tests", commands=commands)
        docker("cp", str(trial / "agent/final.diff"), name + ":/model.patch", commands=commands)
        # No login, package hooks, agent home, node_modules mutations or other
        # state is copied from the actor. Empty patches retain the original task.
        command = ("mkdir -p /logs/agent /logs/verifier && cp /model.patch /logs/agent/final.diff "
                   "&& git -c user.name='Evaluation fixture' -c user.email=fixture@example.invalid "
                   "commit --allow-empty -qm 'Grader initial snapshot' "
                   "&& if [ -s /model.patch ]; then git apply --binary /model.patch; fi")
        applied = docker("exec", name, "bash", "-c", command, check=False, commands=commands)
        if applied.returncode:
            # A non-applicable model patch is a model failure. Keep the original
            # repository and run the same tests; calibration proves it fails.
            docker("exec", name, "bash", "-c", "printf '%s\\n' 'model patch did not apply' > /logs/verifier/patch-apply-failed.txt", commands=commands)
        tested = docker("exec", name, "timeout", "900", "bash", "/tests/test.sh",
                        check=False, commands=commands, timeout=960)
        docker("cp", name + ":/logs/verifier/.", str(destination), commands=commands)
        if tested.returncode:
            raise RuntimeError("Fresh grader script failed or exceeded its frozen 900-second limit")
        if applied.returncode:
            (destination / "reward.txt").write_text("0\n")
        (destination / "runtime.json").write_text(json.dumps({
            "imageId": actual["Image"], "copiedInputs": ["frozen tests", "exported source patch"],
            "credentialsCopied": False, "patchApplied": applied.returncode == 0,
            "preparedContainerId": name, "createdBeforeActorCleanup": True,
            "imageArchitecture": record["imageArchitecture"], "platformOverride": None,
            "timeoutSec": 900, "cpus": 2, "memoryMb": 4096}, indent=2) + "\n")
    except (OSError, ValueError, RuntimeError, KeyError, subprocess.SubprocessError) as error:
        (destination / "execution-error.txt").write_text(str(error) + "\n")
    finally:
        try:
            cleanup_grader(trial, commands)
        finally:
            (destination / "dispatch.json").write_text(json.dumps(commands, indent=2) + "\n")
