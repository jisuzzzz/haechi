// Compose a playbook-selected worker task. Only assemble writes explicitly requested task artifacts.
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, realpathSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'













const limit = 128 * 1024
const digest = (value                                  ) => createHash('sha256').update(value).digest('hex')
const canonical = (value         ) => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v)
const nonempty = (value         )                  => typeof value === 'string' && value.trim().length > 0
const names = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const list = (value         , key        , allowEmpty = false) => {
  if (!Array.isArray(value) || (!allowEmpty && !value.length) || value.some(v => !nonempty(v))) throw new Error(`${key}: expected ${allowEmpty ? 'an' : 'a nonempty'} array of nonempty strings`)
  if (new Set(value).size !== value.length) throw new Error(`${key}: duplicate entries`)
}
const pathInRoot = (root        , path        ) => {
  const real = realpathSync(resolve(root, path)), rel = relative(root, real)
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`Outside plugin root: ${path}`)
  return real
}
const object = (value         , label        ) => {
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(`${label}: expected object`)
}
const allowedKeys = (value         , keys          , label        ) => {
  object(value, label)
  for (const key of Object.keys(value          )) if (!keys.includes(key)) throw new Error(`${label}: unknown field ${key}`)
}
const bounded = (text        ) => {
  if (Buffer.byteLength(text) > limit) throw new Error('Packet exceeds 128 KiB; narrow the task instead of truncating instructions')
  return text
}

export function validateBrief(brief       ) {
  allowedKeys(brief, ['playbook','step','playbookSha256','objective','context','writeScope','ownedPaths','artifactPaths','constraints','completion'], 'brief')
  for (const key of ['playbook','step']         ) if (!nonempty(brief[key]) || !names.test(brief[key])) throw new Error(`Invalid ${key}`)
  if (Object.hasOwn(brief, 'playbookSha256') && !/^[a-f0-9]{64}$/.test(brief.playbookSha256 )) throw new Error('Invalid playbookSha256')
  if (!nonempty(brief.objective)) throw new Error('objective is required')
  object(brief.context, 'context')
  if (!Object.keys(brief.context).length || Object.values(brief.context).some(v => !nonempty(v))) throw new Error('context: nonempty named evidence is required')
  for (const key of ['constraints','completion']         ) list(brief[key], key)
  for (const key of ['ownedPaths','artifactPaths']         ) list(brief[key], key, true)
  if (!['read-only','scoped'].includes(brief.writeScope)) throw new Error('writeScope must be read-only or scoped')
  if ((brief.writeScope === 'read-only') !== (brief.ownedPaths.length === 0)) throw new Error('ownedPaths must be empty for read-only and nonempty for scoped work')
  for (const path of brief.ownedPaths) {
    if (isAbsolute(path) || path.includes('\\') || path.includes('\0') || /[*?\[\]]/.test(path) || path.replace(/\/$/, '').split('/').some(p => !p || p === '.' || p === '..')) throw new Error(`Invalid owned path: ${path}`)
  }
  for (const path of brief.artifactPaths) {
    if (!isAbsolute(path) || path === '/' || path.includes('\0') || /[*?\[\]\\]/.test(path) || path.slice(1).replace(/\/$/, '').split('/').some(p => !p || p === '.' || p === '..')) throw new Error(`Invalid artifact path: ${path}`)
  }
}

function loadContract(pluginRoot        , playbookName        , step        ) {
  if (!nonempty(playbookName) || !names.test(playbookName) || !nonempty(step) || !names.test(step)) throw new Error('Invalid playbook or step')
  const root = realpathSync(pluginRoot)
  const playbookPath = `skills/${playbookName}/SKILL.md`
  const playbook = readFileSync(pathInRoot(root, playbookPath), 'utf8')
  const blocks = [...playbook.matchAll(/^```haechi-handoffs\r?\n([\s\S]*?)^```\s*$/gm)]
  if (blocks.length !== 1) throw new Error(`${playbookPath}: expected one haechi-handoffs block`)
  const contracts = JSON.parse(blocks[0][1])
  object(contracts, 'contracts')
  if (!Object.hasOwn(contracts, step)) throw new Error(`Unknown playbook step: ${step}; available: ${Object.keys(contracts).join(', ')}`)
  const contract = contracts[step]
  allowedKeys(contract, ['skills','principles','checks','writeScope','contextRequired','completion'], 'contract')
  for (const key of ['skills','principles','checks','contextRequired','completion']         ) list(contract[key], key, ['principles','checks'].includes(key))
  if (!['read-only','scoped'].includes(contract.writeScope)) throw new Error('Invalid contract writeScope')
  for (const key of ['skills','principles','checks']         ) for (const name of contract[key]) if (!names.test(name)) throw new Error(`Invalid ${key} reference: ${name}`)
  return { root, contract, playbookSource: { path: playbookPath, sha256: digest(playbook) } }
}

// Coordinator view: task input and acceptance contract, never worker procedure bodies.
export function describeStep(pluginRoot        , playbook        , step        ) {
  const { contract, playbookSource } = loadContract(pluginRoot, playbook, step)
  return {
    status: 'input-required', playbookSource,
    input: { playbook, step, playbookSha256: playbookSource.sha256, objective: '',
      context: Object.fromEntries(contract.contextRequired.map(key => [key, ''])),
      writeScope: contract.writeScope, ownedPaths: [], artifactPaths: [], constraints: [], completion: [] },
    requiredGuidance: { skills: contract.skills, principles: contract.principles, checks: contract.checks },
    requiredCompletion: contract.completion,
  }
}

export function preparePacket(pluginRoot        , brief       )         {
  validateBrief(brief)
  const { root, contract, playbookSource } = loadContract(pluginRoot, brief.playbook, brief.step)
  if (brief.playbookSha256 && brief.playbookSha256 !== playbookSource.sha256) throw new Error('Playbook changed since input form; describe the step again and review the changed contract')
  if (contract.writeScope !== brief.writeScope) throw new Error('writeScope contradicts the playbook step')
  for (const field of contract.contextRequired) if (!Object.hasOwn(brief.context, field) || !nonempty(brief.context[field])) throw new Error(`Missing playbook context: ${field}`)
  const assets             = [], seen = new Set        ()
  const add = (path        , section         ) => {
    const key = `${path}${section ? `#${section}` : ''}`
    if (seen.has(key)) return
    const source = readFileSync(pathInRoot(root, path), 'utf8')
    let text = source
    if (section) {
      const match = source.match(new RegExp(`^## ${section}\\r?\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'))
      if (!match) throw new Error(`${path}: missing ${section} section`)
      text = match[1].trim()
    }
    text = text.replaceAll('{{PLUGIN_ROOT}}', root).replaceAll('${PLUGIN_ROOT}', root).replaceAll('${CLAUDE_PLUGIN_ROOT}', root)
    assets.push({ path, ...(section ? { section } : {}), sourceSha256: digest(source), text })
    seen.add(key)
  }
  for (const key of ['skills','principles','checks']         ) for (const name of contract[key]) {
    add(key === 'skills' ? `skills/${name}/SKILL.md` : `principles/${name}.md`, key === 'skills' ? undefined : key === 'principles' ? 'Do' : 'Check')
  }
  const packet = { version: 1, brief, contract, playbookSource, assets }
  const result = { ...packet, packetSha256: digest(canonical(packet)) }
  bounded(JSON.stringify(result, null, 2))
  return result
}

export function renderPacket(pluginRoot        , packet        ) {
  const expected = preparePacket(pluginRoot, packet.brief)
  if (canonical(expected) !== canonical(packet)) throw new Error('Packet does not match its brief and current source; rebuild and review before dispatch')
  const { brief, contract } = packet
  const bullets = (values          ) => values.length ? values.map(v => `- ${v}`).join('\n') : '(none)'
  return bounded([
    `# Delegated task\n\nPacket: ${packet.packetSha256}\nPlaybook step: ${brief.playbook}/${brief.step}`,
    `## Objective\n${brief.objective}`,
    `## Context\n${Object.entries(brief.context).map(([k,v]) => `- ${k}: ${v}`).join('\n')}`,
    `## Repository write scope\n${brief.writeScope}\n${bullets(brief.ownedPaths)}`,
    `## Authorized artifact paths\n${bullets(brief.artifactPaths)}\nThese paths do not expand repository ownership or grant host permissions.`,
    `## Constraints\n${bullets(brief.constraints)}`,
    `## Completion evidence\n${bullets([...new Set([...contract.completion, ...brief.completion])])}`,
    '## Required task guidance\nThe main session selected this playbook step. Apply its skills and principles within the task boundaries. You may read additional relevant skills. Do not restart the main workflow.',
    ...packet.assets.map(a => `---\nSource: ${a.path}${a.section ? `#${a.section}` : ''} · SHA-256: ${a.sourceSha256}\n\n${a.text}`),
    `---\nEnd of packet: ${packet.packetSha256}\nReturn this identifier with the actual outcomes and gaps.`,
  ].join('\n\n') + '\n')
}

// The host reads message.txt directly for dispatch. stdout is only the coordinator receipt.
// Existing prepare/render callers retain their exact packet and message formats.
export function assembleTask(pluginRoot        , brief       , outputDirectory        ) {
  if (!nonempty(outputDirectory)) throw new Error('A new task output directory is required')
  const packet = preparePacket(pluginRoot, brief), message = renderPacket(pluginRoot, packet)
  const directory = resolve(outputDirectory)
  const files = { packet: resolve(directory, 'packet.json'), message: resolve(directory, 'message.txt') }
  // Require a fresh directory: do not replace an earlier task or partially overwrite its evidence.
  mkdirSync(directory)
  const created = []
  try {
    writeFileSync(files.packet, JSON.stringify(packet, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
    created.push(files.packet)
    writeFileSync(files.message, message, { flag: 'wx', mode: 0o600 })
    created.push(files.message)
  } catch (error) {
    for (const file of created) try { unlinkSync(file) } catch { /* retain the original error */ }
    try { rmdirSync(directory) } catch { /* leave unexpected files intact */ }
    throw error
  }
  return {
    status: 'prepared-not-dispatched', packetSha256: packet.packetSha256, files,
    task: { ...brief, completion: [...new Set([...packet.contract.completion, ...brief.completion])] },
    playbookSource: packet.playbookSource,
    guidance: packet.assets.map(({ path, section, sourceSha256, text }) => ({ path, ...(section ? { section } : {}), sourceSha256, bytes: Buffer.byteLength(text) })),
    messageBytes: Buffer.byteLength(message),
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [mode, root, input, output, ...extra] = process.argv.slice(2)
    const usage = 'Usage: delegate-task.mjs describe ROOT PLAYBOOK STEP | assemble ROOT BRIEF_JSON NEW_OUTPUT_DIR | prepare|render ROOT INPUT_JSON'
    if (mode === '--help') process.stdout.write(usage + '\n')
    else {
      if (!['describe','assemble','prepare','render'].includes(mode) || !root || !input || extra.length || Boolean(output) !== ['describe','assemble'].includes(mode)) throw new Error(usage)
      const value = mode === 'describe' ? input : JSON.parse(readFileSync(input, 'utf8'))
      const result = mode === 'describe' ? describeStep(root, value, output )
        : mode === 'assemble' ? assembleTask(root, value, output )
        : mode === 'prepare' ? preparePacket(root, value) : renderPacket(root, value)
      process.stdout.write(typeof result === 'string' ? result : JSON.stringify(result, null, 2) + '\n')
    }
  } catch (error) { process.stderr.write(`${(error         ).message}\n`); process.exitCode = 1 }
}
