#!/usr/bin/env python3
"""Append only the authorized benchmark data fact; preserve existing instructions."""
from pathlib import Path

root = Path('/testbed')
path = root / 'AGENTS.md'
fact = (Path(__file__).parent / 'data-fact.md').read_text()
current = path.read_text() if path.exists() else ''
if fact.strip() not in current:
    with path.open('a') as stream:
        if current:
            stream.write('\n\n')
        stream.write(fact)
