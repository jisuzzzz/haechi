"""Pinned Harbor adapter: same Codex runtime, optional audited haechi delivery."""

import json
import shlex
import subprocess
from pathlib import Path
from typing import Literal

from harbor.agents.installed.codex import Codex, CodexOptions


class ComparisonOptions(CodexOptions):
    variant: Literal["baseline", "candidate"]
    snapshot: str
    fresh_grader: bool = False


class HaechiCodex(Codex):
    options_model = ComparisonOptions

    async def install(self, environment):
        # Harbor's default installer selects Node 22 through nvm. Keep Node 24
        # from the fixture image and install exactly the frozen CLI version.
        if not self._version:
            raise ValueError("A pinned Codex version is required")
        await self.exec_as_root(
            environment,
            command="npm install -g " + shlex.quote("@openai/codex@" + self._version),
        )

    async def run(self, instruction, environment, context):
        logs = self.environment_logs_dir.as_posix()
        # Resolve the running container, rather than assuming Harbor's internal
        # image tag is present in the generated Compose definition.
        container = (await environment._run_docker_compose_command(["ps", "-q", "main"])).stdout.strip()
        image_id = subprocess.run(["docker", "inspect", container, "--format", "{{.Image}}"],
                                  check=True, text=True, capture_output=True).stdout.strip()
        layers = subprocess.run(["docker", "image", "inspect", image_id, "--format", "{{json .RootFS.Layers}}"],
                                check=True, text=True, capture_output=True).stdout.strip()
        (self.logs_dir / "image-id.txt").write_text(image_id + "\n")
        (self.logs_dir / "image-layers.json").write_text(layers + "\n")
        if self.options.fresh_grader:
            from .swebench.replay import prepare_grader
            # A stopped container pins the exact image across Harbor's Compose
            # cleanup. Only creation occurs inside the actor's time budget.
            prepare_grader(self.logs_dir.parent, image_id)
        config = json.loads((Path(self.options.snapshot).parent / "baseline.json").read_text())["config"]
        await self.exec_as_root(environment, command=(
            "cd /workspace && git init -q && git config user.name 'Evaluation fixture' "
            "&& git config user.email 'fixture@example.invalid' "
            "&& git add . && git commit --allow-empty -qm 'Initial fixture' "
            "&& printf '\\n.agents/\\n' >> .git/info/exclude "
            "&& mkdir -p " + shlex.quote(logs)
            + " && git rev-parse HEAD > " + shlex.quote(logs + "/initial-head.txt")
        ))
        await self.exec_as_root(environment, command=(
            "node --version > " + shlex.quote(logs + "/node-version.txt")
            + " && codex --version > " + shlex.quote(logs + "/codex-version.txt")
        ))
        if self.options.variant == "candidate":
            await environment.upload_dir(Path(self.options.snapshot), "/opt/haechi")
            wrapper = Path(__file__).with_name("hook-audit.mjs")
            await environment.upload_file(wrapper, "/opt/hook-audit.mjs")
            await self.exec_as_root(environment, command=(
                "mkdir -p /workspace/.agents && "
                "ln -s /opt/haechi/skills /workspace/.agents/skills && "
                "ln -s /opt/haechi/tools /workspace/.agents/tools && "
                "ln -s /opt/haechi/principles /workspace/.agents/principles"
            ))
            config["shell_environment_policy"] = {"set": {"PLUGIN_ROOT": "/opt/haechi"}}
            hooks = json.loads((Path(self.options.snapshot) / "hooks/hooks.json").read_text())["hooks"]
            for event, groups in hooks.items():
                for group in groups:
                    for hook in group["hooks"]:
                        original = hook["command"].replace("${PLUGIN_ROOT}", "/opt/haechi")
                        hook["command"] = "node /opt/hook-audit.mjs " + shlex.quote(original)
                        hook["additionalContextLimit"] = 16000
            config["hooks"] = hooks
        # Both sides receive an empty, isolated CODEX_HOME from Harbor. No host
        # config/plugins are loaded. Trust is invocation-only, for frozen hooks.
        self.options.dangerously_bypass_hook_trust = True
        self._base_config = config
        try:
            await super().run(instruction, environment, context)
        finally:
            await self.exec_as_root(environment, command=(
                "cd /workspace && git add -N . && git diff --binary "
                + '"$(cat ' + shlex.quote(logs + "/initial-head.txt") + ')" > '
                + shlex.quote(logs + "/final.diff")
                + " && git status --porcelain=v1 > " + shlex.quote(logs + "/final-status.txt")
                + " && mkdir -p " + shlex.quote(logs + "/final-files")
                + " && for name in src app tests; do if [ -d /workspace/$name ]; then "
                + "cp -R /workspace/$name " + shlex.quote(logs + "/final-files/") + "; fi; done"
            ))
