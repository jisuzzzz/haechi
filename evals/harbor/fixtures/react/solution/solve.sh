#!/bin/sh
set -eu
python3 - <<'PY'
from pathlib import Path
path = Path('/workspace/src/App.tsx')
text = path.read_text()
before = 'item.includes(query.trim())'
after = 'item.toLowerCase().includes(query.trim().toLowerCase())'
assert before in text
path.write_text(text.replace(before, after))
PY
