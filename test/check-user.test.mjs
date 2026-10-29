import assert from 'node:assert/strict'
import { test } from 'node:test'

import { loggedInHosts, parseCodexTrust } from '../core/tools/check-user.mjs'

test('login is read per host, not from the exit code', () => {
  const status = 'gitlab.com\n  x No token provided\ncode.example.org\n  ✓ Logged in to code.example.org as dev (token)\n'
  assert.deepEqual(loggedInHosts(status), ['code.example.org'])
  assert.deepEqual(loggedInHosts('github.com\n  ✓ Logged in to github.com account dev (keyring)'), ['github.com'])
})

const config = `model = "x"

[hooks.state]

[hooks.state."haechi@haechi:hooks/hooks.json:session_start:0:0"]
trusted_hash = "sha256:aaa"

[hooks.state."haechi@haechi:hooks/hooks.json:user_prompt_submit:0:0"]
trusted_hash = "sha256:bbb"

[hooks.state."haechi-probe@probe-market:hooks/hooks.json:post_compact:0:0"]
trusted_hash = "sha256:ccc"

[hooks.state."haechi@haechi:hooks/hooks.json:subagent_start:0:0"]
enabled = false

[plugins."haechi@haechi"]
enabled = true
`

test('only this plugin entries with a trusted hash count', () => {
  assert.deepEqual(parseCodexTrust(config), {
    trusted: ['session_start', 'user_prompt_submit'],
    missing: ['post_compact', 'subagent_start'],
  })
})

test('a config without hook trust reports every event missing', () => {
  assert.deepEqual(parseCodexTrust('model = "x"\n').trusted, [])
})
