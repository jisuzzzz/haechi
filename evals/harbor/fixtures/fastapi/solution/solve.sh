#!/bin/sh
set -eu
python - <<'PY'
from pathlib import Path
path = Path('/workspace/app/main.py')
source = path.read_text()
old = '"total": len(page)'
assert source.count(old) == 1, 'Oracle expected the original fixture defect'
path.write_text(source.replace(old, '"total": len(ITEMS)'))
PY
