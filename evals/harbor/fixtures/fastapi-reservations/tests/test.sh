#!/bin/sh
set -eu
output="${HAECHI_VERIFIER_OUTPUT:-/logs/verifier}"
mkdir -p "$output"
# If Python cannot launch, preserve a failing reward and a visible diagnostic.
printf '0\n' > "$output/reward.txt"
printf '{"passed":false,"error":"verifier did not complete; inspect verifier stdout/stderr"}\n' > "$output/checks.json"
exec /opt/venv/bin/python /tests/check_api.py
