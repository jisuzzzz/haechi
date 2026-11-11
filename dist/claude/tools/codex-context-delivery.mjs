import { randomUUID } from 'node:crypto'
import { accessSync, constants, existsSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { digest, hasCode, isDigest, publishFile, readLocalFile } from './work-graph-storage.mjs'




export const findRepoRoot = (start        ) => {
  const resolved = realpathSync(start)
  for (let dir = resolved; ; dir = dirname(dir)) {
    if (existsSync(join(dir, '.git'))) return dir
    if (dirname(dir) === dir) return resolved
  }
}

const sessionDirectory = (input           , dataDir        ) =>
  typeof input.session_id === 'string' && input.session_id.trim()
    ? join(dataDir, 'codex-delivery', digest(input.session_id))
    : undefined

const readDigest = (path        ) => {
  try {
    const value = readLocalFile(path).toString('utf8')
    return isDigest(value) ? value : undefined
  } catch (error) {
    return hasCode(error, 'ENOENT') ? 'initial' : undefined
  }
}

export function markCodexCompaction(input           , dataDir        ) {
  const directory = sessionDirectory(input, dataDir)
  if (directory) publishFile(join(directory, 'generation'), digest(randomUUID()), true)
}

export function deliverCodexContext(
  component                                 ,
  event        ,
  input           ,
  dataDir        ,
  render               ,
  repeat                             ,
) {
  const directory = sessionDirectory(input, dataDir)
  // SessionStart hooks can run concurrently. Each writes only its own record.
  // Read the generation before rendering so a concurrent compaction invalidates it.
  const generation = directory && readDigest(join(directory, 'generation'))
  const text = render()
  if (!directory || !generation) return text
  try {
    const root = findRepoRoot(input.cwd ?? process.cwd())
    const path = join(directory, component)
    const fingerprint = digest(JSON.stringify([generation, root, text ?? null]))
    if (event !== 'SessionStart' && readDigest(path) === fingerprint) {
      accessSync(directory, constants.W_OK)
      return repeat?.(text)
    }
    publishFile(path, fingerprint, true)
  } catch {
    // A failed cache must not hide context.
  }
  return text
}
