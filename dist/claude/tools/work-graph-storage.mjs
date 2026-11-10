import { createHash, randomUUID } from 'node:crypto'
import { closeSync, constants, fstatSync, fsyncSync, linkSync, mkdirSync, openSync, readSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const maxRecordBytes = 8 * 1024 * 1024
export const digest = (data                 ) => createHash('sha256').update(data).digest('hex')
export const isDigest = (value         )                  => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
export const hasCode = (error         , code        ) => (error                         )?.code === code

export function publishFile(path        , data                 , replace         ) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${randomUUID()}.tmp`
  const fd = openSync(temporary, 'wx', 0o600)
  let renamed = false
  try {
    try { writeFileSync(fd, data); fsyncSync(fd) } finally { closeSync(fd) }
    if (replace) {
      renameSync(temporary, path)
      renamed = true
    } else {
      try { linkSync(temporary, path) } catch (error) {
        if (hasCode(error, 'EEXIST')) return
        throw error
      }
    }
  } finally {
    if (!renamed) unlinkSync(temporary)
  }
}

export function readLocalFile(path        ) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK)
  try {
    const stat = fstatSync(fd)
    if (!stat.isFile()) throw Object.assign(new Error('Expected a regular local file'), { code: 'ENOTSUP' })
    if (stat.size > maxRecordBytes) throw Object.assign(new Error('Local file exceeds 8 MiB'), { code: 'EFBIG' })
    const bytes = Buffer.alloc(stat.size + 1)
    let size = 0
    while (size < bytes.length) {
      const count = readSync(fd, bytes, size, bytes.length - size, null)
      if (!count) break
      size += count
    }
    if (size !== stat.size) throw Object.assign(new Error('Local file size changed during read'), { code: 'ESTALE' })
    return bytes.subarray(0, size)
  } finally {
    closeSync(fd)
  }
}

export const evidenceDirectory = (graph        ) => join(dirname(graph), 'evidence')

export function verifyEvidence(path        , expected        ) {
  if (digest(readLocalFile(path)) !== expected) {
    throw Object.assign(new Error(`Evidence content changed: ${path}`), { code: 'HASH_MISMATCH' })
  }
}
