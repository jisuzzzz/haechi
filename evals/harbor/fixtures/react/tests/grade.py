"""Grade a copied final source with evaluator-owned tests and dependencies."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

logs = Path('/logs/verifier')
logs.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix='haechi-react-grade-') as folder:
    root = Path(folder)
    shutil.copytree('/workspace/src', root / 'src')
    for name in ('hidden.test.tsx', 'vite.config.mjs'):
        shutil.copyfile(Path('/tests') / name, root / name)
    (root / 'package.json').write_text('{"type":"module"}\n')
    os.symlink('/opt/fixture-deps/node_modules', root / 'node_modules')
    command = ['/opt/fixture-deps/node_modules/.bin/vitest', 'run', '--root', str(root), '--config', str(root / 'vite.config.mjs')]
    result = subprocess.run(command, cwd=root, text=True, capture_output=True, timeout=60)
    (logs / 'hidden-tests.log').write_text(result.stdout + result.stderr)
    checks = {
        'grader': 'evaluator-owned React interaction assertions in jsdom; not a browser render',
        'command': command,
        'exitCode': result.returncode,
        'behaviorPassed': result.returncode == 0,
    }
    (logs / 'checks.json').write_text(json.dumps(checks, indent=2) + '\n')
    (logs / 'reward.txt').write_text('1\n' if result.returncode == 0 else '0\n')
