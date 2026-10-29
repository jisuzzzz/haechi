# haechi

An agent workflow plugin for Claude Code and Codex.

Haechi is a creature from Korean folklore that tells right from wrong. This plugin does the same for agent work: it routes each request to a playbook, delegates to subagents when that pays off, and calls work done only with evidence.

Status: design stage. Nothing is installable yet.

## Planned

- Repo setup that detects your commands, test layout and git conventions, then proves each command runs.
- Playbooks for bug fixes, features, refactors, performance work, reviews and test hardening.
- Subagents: implementer, adversarial tester, verifier, screen checkers, experiment runner and auditor.
- Completion only with evidence: verify output run after the last change, failing-before and passing-after output for bugs.

## License

MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
