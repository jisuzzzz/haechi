// Repo setup, last step: is .haechi.json complete? Uses the same rule the hooks use, so "complete" here
// means the hooks stop showing REPO SETUP INCOMPLETE.
// Usage: node check-settings.mjs [repo-root]  → prints JSON, exit 1 when something required is missing
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { missingRequired, parseSettings } from '../hooks/rules.mjs'

const root = process.argv[2] ?? process.cwd()
const path = join(root, '.haechi.json')
const missing = missingRequired(parseSettings(existsSync(path) ? readFileSync(path, 'utf8') : undefined))
console.log(JSON.stringify({ path, complete: missing.length === 0, missing }, null, 2))
if (missing.length) process.exit(1)
