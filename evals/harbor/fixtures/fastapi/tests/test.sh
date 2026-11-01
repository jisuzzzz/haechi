#!/bin/sh
set -eu
# Harbor uploads this directory only for grading, after the agent has finished.
exec /opt/venv/bin/python /tests/check_api.py
