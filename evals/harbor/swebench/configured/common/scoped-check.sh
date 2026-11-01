#!/bin/bash
set -euo pipefail
# Restore the pristine image's test runtime rather than the controller Node runtime.
source /opt/benchmark-native-env.sh
exec python3 /opt/benchmark/scoped-check.py "$@"
