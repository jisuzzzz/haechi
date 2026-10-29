// Fails when tracked files contain words that must not be published (internal domains, names, project paths).
// The word list itself is private: it comes from HAECHI_SCAN_PATTERNS (one per line, or comma separated)
// or from the file named by HAECHI_SCAN_FILE, never from this repository.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

export const parsePatterns = (text) =>
  text
    .split(/[\n,]/)
    .map((pattern) => pattern.trim())
    .filter((pattern) => pattern && !pattern.startsWith('#'))

export const findHits = (files, patterns) => {
  const lowered = patterns.map((pattern) => pattern.toLowerCase())
  const hits = []
  for (const [path, text] of files) {
    text.split(/\r?\n/).forEach((line, index) => {
      const lower = line.toLowerCase()
      // Report the line number only — echoing the matched word into public CI logs would publish it
      if (lowered.some((pattern) => lower.includes(pattern))) hits.push(`${path}:${index + 1}`)
    })
  }
  return hits
}

const main = () => {
  const source = process.env.HAECHI_SCAN_PATTERNS ?? (process.env.HAECHI_SCAN_FILE ? readFileSync(process.env.HAECHI_SCAN_FILE, 'utf8') : '')
  const patterns = parsePatterns(source)
  if (patterns.length === 0) {
    console.warn('scan-public: no patterns configured (HAECHI_SCAN_PATTERNS or HAECHI_SCAN_FILE) — skipped')
    return
  }
  const paths = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)
  const files = paths.map((path) => [path, readFileSync(path, 'utf8')])
  const hits = findHits(files, patterns)
  if (hits.length) {
    console.error(`scan-public: ${hits.length} line(s) contain private words:\n${hits.join('\n')}`)
    process.exit(1)
  }
  console.log(`scan-public: ${paths.length} files clean`)
}

if (process.argv[1]?.endsWith('scan-public.mjs')) main()
