// Grader-only dependencies imported by the official test patch.
const fs = require('node:fs')
const spec = JSON.parse(fs.readFileSync('/tests/test-dependencies.json', 'utf8'))
const file = '/workspace/package.json'
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
pkg.devDependencies = { ...pkg.devDependencies, ...spec.devDependencies }
fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n')
fs.writeFileSync('/logs/verifier/test-dependency-preparation.json', JSON.stringify(spec, null, 2) + '\n')
