// Tells whether the premises of rejected performance ideas still hold: for each entry in a rejected-ideas file it
// counts the commits and changed lines in the entry's paths since its base commit, and compares each recorded
// dependency version with the one the repo pins now. Changes nothing.
// Usage: node rejected-staleness.mjs <rejected.md> [--repo <dir>] [--json]
// The file path is resolved against the repo (default: the current directory). Entry format (see skills/perf):
//   ## <title>
//   Base: <commit>
//   Paths: src/orders, src/list
//   Dependencies: react-window@1.8.9, numpy@1.26.4   (optional)
//   Revisit when: <free text>
//   Tried: … / Result: …                              (optional, free text)
// Status per entry: changed · unchanged · unknown-base (Base is not in the history of HEAD) · invalid (a required key is
// missing, a dependency has no version, or a path exists neither at Base nor at HEAD).
// Exit 0 after a successful read, 2 on bad arguments, a missing file or a directory that is not a git repo.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REQUIRED = ['base', 'paths', 'revisit when']

// Backticks are stripped because markdown authors often write `src/orders`; left in, the path would match nothing
const splitList = (value) => value.split(',').map((item) => item.trim().replace(/^`+|`+$/g, '').trim()).filter(Boolean)
const stripBom = (text) => text.replace(/^\uFEFF/, '')

export const parseRejected = (text) => {
  const entries = []
  let current = null
  stripBom(text).replace(/\r\n/g, '\n').split('\n').forEach((line, index) => {
    const heading = line.match(/^##\s+(.+?)\s*$/)
    if (heading) {
      current = { title: heading[1], line: index + 1, fields: {} }
      entries.push(current)
      return
    }
    const field = current && line.match(/^([A-Za-z][A-Za-z ]*?)\s*:\s*(.*?)\s*$/)
    if (field) current.fields[field[1].toLowerCase()] = field[2]
  })
  return entries.map(({ title, line, fields }) => {
    const missing = REQUIRED.filter((key) => !fields[key])
    const dependencies = fields.dependencies ? splitList(fields.dependencies).map(parseDependency) : []
    // A dependency with no recorded version would always compare as different and keep the entry "changed" forever
    const problems = [
      ...missing.map((key) => `missing key: ${key}`),
      ...dependencies.filter((dep) => !dep.recorded).map((dep) => `dependency without version: ${dep.name}`),
    ]
    return {
      title,
      line,
      missing,
      problems,
      base: fields.base?.replace(/^`+|`+$/g, '') ?? null,
      paths: fields.paths ? splitList(fields.paths) : [],
      dependencies,
      revisitWhen: fields['revisit when'] ?? null,
      fields,
    }
  })
}

// The last "@" splits name and version, so scoped packages like @scope/pkg@1.0.0 keep their name
export const parseDependency = (spec) => {
  const at = spec.lastIndexOf('@')
  return at > 0 ? { name: spec.slice(0, at), recorded: spec.slice(at + 1) || null } : { name: spec, recorded: null }
}

const normalizeVersion = (version) => version?.replace(/^[\s^~=<>v]+/, '').trim() || null
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Python treats "-", "_" and "." in names as the same and ignores case; extras like name[fast] are skipped.
// No line anchor, because pyproject lists several pins on one line: dependencies = ["a==1", "b>=2"]
const pythonPin = (text, name) => {
  const flexibleName = escapeRegex(name).replace(/(?:\\\.|-|_)+/g, '[-_.]+')
  const pattern = new RegExp(`(?<![\\w.-])${flexibleName}\\s*(?:\\[[^\\]]*\\])?\\s*(?:==|>=|~=)\\s*([\\w.+-]+)`, 'i')
  return text.match(pattern)?.[1] ?? null
}

// package.json first, then requirements*.txt, then pyproject.toml. version is null when the name is pinned nowhere;
// note says why a file could not be read, so "unknown" is not mistaken for "not a dependency".
export const currentVersion = (repo, name) => {
  let note = null
  const packageJson = join(repo, 'package.json')
  if (existsSync(packageJson)) {
    let pkg = null
    try {
      pkg = JSON.parse(stripBom(readFileSync(packageJson, 'utf8')))
    } catch {
      note = 'package.json is not valid JSON'
    }
    const range = pkg?.dependencies?.[name] ?? pkg?.devDependencies?.[name]
    if (range) return { version: normalizeVersion(range), note }
  }
  const pythonFiles = readdirSync(repo).filter((file) => /^requirements.*\.txt$/i.test(file)).sort()
  if (existsSync(join(repo, 'pyproject.toml'))) pythonFiles.push('pyproject.toml')
  for (const file of pythonFiles) {
    const version = pythonPin(readFileSync(join(repo, file), 'utf8'), name)
    if (version) return { version: normalizeVersion(version), note }
  }
  return { version: null, note }
}

// C locale keeps --shortstat in English ("5 insertions(+)") so parseShortstat works under a localized git
const GIT_ENV = { ...process.env, LC_ALL: 'C', LANG: 'C' }
const git = (repo, args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', env: GIT_ENV, stdio: ['ignore', 'pipe', 'ignore'] }).trim()
const succeeds = (repo, args) => {
  try {
    git(repo, args)
    return true
  } catch {
    return false
  }
}
// ls-tree refuses magic pathspecs (`:(glob)…`) and paths outside the repo; those count as not found, not as a crash
const existsAt = (repo, rev, path) => {
  try {
    return git(repo, ['ls-tree', '-r', '--name-only', rev, '--', path]) !== ''
  } catch {
    return false
  }
}

export const parseShortstat = (text) => {
  const count = (word) => Number(text.match(new RegExp(`(\\d+) ${word}`))?.[1] ?? 0)
  return count('insertion') + count('deletion')
}

export const checkEntry = (repo, entry) => {
  const dependencies = entry.dependencies.map(({ name, recorded }) => {
    const { version, note } = currentVersion(repo, name)
    const state = version === null ? 'unknown' : normalizeVersion(recorded) === version ? 'same' : 'differs'
    return { name, recorded, current: version ?? 'unknown', state, ...(note ? { note } : {}) }
  })
  const result = { title: entry.title, line: entry.line, base: entry.base, paths: entry.paths, revisitWhen: entry.revisitWhen, dependencies }
  if (entry.problems.length) return { ...result, status: 'invalid', problems: entry.problems }
  // A base on a side branch would diff against unrelated history, so it counts as unknown too
  const baseKnown =
    succeeds(repo, ['rev-parse', '--verify', '--quiet', `${entry.base}^{commit}`]) && succeeds(repo, ['merge-base', '--is-ancestor', entry.base, 'HEAD'])
  if (!baseKnown) return { ...result, status: 'unknown-base' }
  // A path matching nothing (typo, rename before Base) always shows zero changes and would bury the idea as "unchanged"
  const notFound = entry.paths.filter((path) => !existsAt(repo, entry.base, path) && !existsAt(repo, 'HEAD', path))
  if (notFound.length) return { ...result, status: 'invalid', problems: notFound.map((path) => `path not found: ${path}`) }
  const range = `${entry.base}..HEAD`
  const commits = Number(git(repo, ['rev-list', '--count', range, '--', ...entry.paths]))
  const changedLines = parseShortstat(git(repo, ['diff', '--shortstat', range, '--', ...entry.paths]))
  const changed = commits > 0 || changedLines > 0 || dependencies.some((dep) => dep.state === 'differs')
  return { ...result, status: changed ? 'changed' : 'unchanged', commits, changedLines }
}

export const parseArgs = (argv) => {
  const options = { file: null, repo: '.', json: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--json') options.json = true
    else if (arg === '--repo' && i + 1 < argv.length) options.repo = argv[++i]
    else if (!arg.startsWith('--') && !options.file) options.file = arg
    else throw new Error(`unknown or extra argument "${arg}"`)
  }
  if (!options.file) throw new Error('the rejected-ideas file is required')
  return options
}

const describe = (entry) => {
  const lines = [`## ${entry.title}  (line ${entry.line})`, `  status: ${entry.status}`]
  if (entry.status === 'invalid') for (const problem of entry.problems) lines.push(`  ${problem}`)
  if (entry.status === 'unknown-base') lines.push(`  base ${entry.base} is not a commit in the history of HEAD`)
  if (entry.commits !== undefined) {
    lines.push(`  since ${entry.base} in ${entry.paths.join(', ')}: ${entry.commits} commit(s), ${entry.changedLines} line(s) changed`)
  }
  for (const dep of entry.dependencies) lines.push(`  ${dep.name}: recorded ${dep.recorded ?? 'no version'}, now ${dep.current} (${dep.state}${dep.note ? `; ${dep.note}` : ''})`)
  if (entry.revisitWhen) lines.push(`  revisit when: ${entry.revisitWhen}`)
  return lines.join('\n')
}

const main = () => {
  let options
  try {
    options = parseArgs(process.argv.slice(2))
    options.repo = resolve(options.repo)
    options.file = resolve(options.repo, options.file)
    if (!existsSync(options.file)) throw new Error(`${options.file} does not exist`)
    try {
      git(options.repo, ['rev-parse', '--git-dir'])
    } catch {
      throw new Error(`${options.repo} is not a git repository`)
    }
  } catch (error) {
    console.error(`rejected-staleness: ${error.message}`)
    console.error('usage: node rejected-staleness.mjs <rejected.md> [--repo <dir>] [--json]')
    process.exit(2)
  }
  const entries = parseRejected(readFileSync(options.file, 'utf8')).map((entry) => checkEntry(options.repo, entry))
  if (options.json) console.log(JSON.stringify({ file: options.file, entries }, null, 2))
  else console.log(entries.length ? entries.map(describe).join('\n\n') : `rejected-staleness: no "## " entries in ${options.file}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
