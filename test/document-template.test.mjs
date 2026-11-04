import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { composeDocument, formatDocument, headingAnchor, loadKit, validateNotes } from '../dist/claude/tools/document-template.mjs'

const tool = resolve('dist/claude/tools/document-template.mjs')
const assets = resolve('skills/document/assets')
const cli = (...args) => spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8' })
const temp = (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'haechi-document-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

test('lists every shipped document type, conditional Part and human review responsibility', () => {
  const result = cli('--list')
  assert.equal(result.status, 0, result.stderr)
  const index = JSON.parse(result.stdout)
  assert.deepEqual(index.types.map((p) => p.id), ['fact', 'change', 'bug', 'retirement', 'performance', 'handoff'])
  assert.equal(index.parts.length, 18)
  for (const part of index.parts) {
    assert.ok(part.requirement && part.author && part.reviewer && part.review_check, part.id)
  }
  for (const type of index.types) {
    assert.ok(['P01', 'P02', 'P05', 'P14'].every((id) => type.required.includes(id)), type.id)
  }
  assert.deepEqual(index.conditions.find((c) => c.id === 'C-ASYNC').required, ['P17', 'P15'])
})

test('each CLI preset reproduces its maintained first-draft template without invented evidence', (t) => {
  const dir = temp(t)
  const kit = loadKit()
  for (const preset of kit.config.presets) {
    const out = join(dir, `${preset.id}.md`)
    const result = cli('--type', preset.id, '--out', out)
    assert.equal(result.status, 0, result.stderr)
    const text = readFileSync(out, 'utf8')
    assert.equal(text, readFileSync(join(assets, 'templates', preset.file), 'utf8'), preset.id)
    assert.ok(text.indexOf('## 0. Summary') < text.indexOf('## Table of contents'), preset.id)
    assert.ok(text.includes('Status: pending review.'), preset.id)
    assert.doesNotMatch(text, /<!-- part:|\b(?:REQ|DIFF)-\d+|^\[\^[^\]]+\]:/m)
    validateNotes(text)
  }
})

test('conditional Parts retain narrative order and endnotes follow attachments and review records', () => {
  const text = composeDocument('bug', { conditions: ['C-ASYNC', 'C-EVIDENCE', 'C-POLICY'], parts: ['P08', 'P15'] })
  const headings = text.split('\n').filter((line) => /^#{2,3} \d/.test(line))
  const locate = (name) => {
    const index = headings.findIndex((h) => h.includes(name))
    assert.notEqual(index, -1, name)
    return index
  }
  assert.ok(locate('What problem occurred') < locate('Current assessment of the cause and remaining hypotheses'))
  assert.ok(locate('Current assessment of the cause and remaining hypotheses') < locate('Processing flow and failure behavior'))
  assert.ok(locate('Processing flow and failure behavior') < locate('Investigation and fix requests'))
  assert.ok(locate('Investigation and fix requests') < locate('Document and review records'))
  assert.ok(locate('Human confirmation') < locate('Attachments'))
  assert.ok(locate('Attachments') < locate('Evidence notes'))
  assert.equal(headings.filter((h) => h.includes('Attachments')).length, 1)
  assert.doesNotMatch(text, /^\[\^[^\]]+\]:/m)
})

test('every optional Part can be composed once without leaking library comments', () => {
  const kit = loadKit()
  const parts = [...kit.parts.keys()]
  for (const preset of kit.config.presets) {
    const text = composeDocument(preset.id, { parts })
    assert.equal(text.split('\n').filter((line) => /^## \d+\. Evidence notes$/.test(line)).length, 1)
    assert.doesNotMatch(text, /<!-- (?:part:|body:|notes:)/)
    assert.equal(formatDocument(text), text)
  }
})

test('format regenerates hierarchical navigation and preserves fenced example headings verbatim', (t) => {
  const file = join(temp(t), 'edited.md')
  const code = '````markdown\n## Not a section\n```\n<!-- part:P15 -->\n[^example]\n````'
  writeFileSync(file, `# 요청\n\n## 요약\n\n내용.\n\n## 목차\n\n- stale\n\n## 문제\n\n${code}\n\n<!-- part:P04 -->\n### 재현 조건\n\n설명.\n\n## 다음 행동\n\n답변 대기.\n`)
  const result = cli('--format', file)
  assert.equal(result.status, 0, result.stderr)
  const text = readFileSync(file, 'utf8')
  assert.ok(text.includes(code))
  assert.doesNotMatch(text, /- stale|<!-- part:P04 -->/)
  assert.match(text, /^## 1\. 문제$/m)
  assert.match(text, /^### 1\.1 재현 조건$/m)
  assert.ok(text.includes('  - [1.1 재현 조건](#11-재현-조건)'))
  assert.ok(text.includes('- [2. 다음 행동](#2-다음-행동)'))
  assert.equal(formatDocument(text), text)
})

test('real endnotes are matched and confined to the last section; example code is ignored', (t) => {
  const valid = '# 요청\n\n## 요약\n\n확인한 현상.[^capture]\n\n## 첨부 자료\n\n![표시본](media/problem.png)\n\n## 근거 주석\n\n[^capture]: 개발 서버, 실제 캡처 범위와 미확인 사항.\n'
  const file = join(temp(t), 'request.md')
  writeFileSync(file, valid)
  assert.equal(cli('--format', file).status, 0)
  const formatted = readFileSync(file, 'utf8')
  assert.equal(formatted.indexOf('[^capture]:'), formatted.lastIndexOf('[^capture]:'))
  validateNotes(formatted)
  validateNotes('# 요청\n\n## 요약\n\n`[^inline]`\n\n```md\n[^fake]: example\n[^another]\n```\n')
  const invalid = [
    valid.replace('[^capture]:', '[^different]:'),
    `${valid}\n[^capture]: duplicate\n`,
    `${valid}\n## 이후 내용\n잘못된 순서.\n`,
    valid.replace('[^capture]: 개발 서버, 실제 캡처 범위와 미확인 사항.\n', '').replace('## 첨부 자료', '[^capture]: misplaced\n\n## 첨부 자료'),
  ]
  for (const input of invalid) {
    writeFileSync(file, input)
    const result = cli('--format', file)
    assert.equal(result.status, 2)
    assert.equal(readFileSync(file, 'utf8'), input, result.stderr)
  }
})

test('English documents retain their language with real footnotes and an idempotent linked contents list', (t) => {
  const file = join(temp(t), 'english-request.md')
  const draft = '# Failed upload list\n\n## Summary\n\nThe Failed tab shows no rows.[^capture]\n\n## Observed behavior\n\n### Reproduction\n\nOpen the Failed tab.\n\n## Attachments\n\n![Annotated capture](media/failed.png)\n\n## Evidence notes\n\n[^capture]: Development server capture; backend cause remains unverified.\n'
  writeFileSync(file, draft)
  const result = cli('--format', file)
  assert.equal(result.status, 0, result.stderr)
  const text = readFileSync(file, 'utf8')
  assert.match(text, /^## Table of contents$/m)
  assert.match(text, /^## 0\. Summary$/m)
  assert.ok(text.includes('  - [1.1 Reproduction](#11-reproduction)'))
  assert.match(text, /^## 3\. Evidence notes$/m)
  assert.doesNotMatch(text, /요약|목차|근거 주석/)
  validateNotes(text)
  assert.equal(formatDocument(text), text)
  const alternate = text.replace('## Table of contents', '## Contents').replace(/^## 3\. Evidence notes$/m, '## 3. Endnotes')
  const formattedAlternate = formatDocument(alternate)
  assert.match(formattedAlternate, /^## Contents$/m)
  assert.match(formattedAlternate, /^## 3\. Endnotes$/m)
  validateNotes(formattedAlternate)
  assert.equal(formatDocument(formattedAlternate), formattedAlternate)
  const koreanToc = draft.replace('## Observed behavior', '## 목차\n\n- stale\n\n## Observed behavior')
  assert.match(formatDocument(koreanToc), /^## Table of contents$/m)
  assert.throws(() => validateNotes(draft.replace('## Evidence notes', '## Unrelated heading')), /final/)
})

test('bad inputs and existing files fail without overwriting documents', (t) => {
  const out = join(temp(t), 'request.md')
  writeFileSync(out, 'existing human draft')
  assert.equal(cli('--type', 'fact', '--out', out).status, 2)
  assert.equal(readFileSync(out, 'utf8'), 'existing human draft')
  const bad = join(dirname(out), 'new.md')
  for (const args of [
    ['--type', 'unknown', '--out', bad],
    ['--type', 'fact', '--out', bad, '--parts', 'P99'],
    ['--type', 'fact', '--out', bad, '--conditions', 'C-TYPO'],
    ['--type', 'fact', '--out', bad, '--type', 'bug'],
    ['--format', out, '--parts', 'P15'],
    ['--list', '--out', bad],
    ['--type'],
  ]) {
    const result = cli(...args)
    assert.equal(result.status, 2, JSON.stringify(args))
    assert.ok(result.stderr.trim())
    assert.equal(existsSync(bad), false)
  }
  assert.throws(() => formatDocument('# 제목\n\n## 설명\n\n내용'), /요약/)
  assert.throws(() => formatDocument('# 제목\n\n## 요약\n\n#### 건너뜀\n'), /parent heading/)
})

test('the tool runs from a relocated plugin and all packaged relative links resolve', (t) => {
  const root = temp(t)
  mkdirSync(join(root, 'tools'))
  cpSync(tool, join(root, 'tools/document-template.mjs'))
  cpSync(assets, join(root, 'skills/document/assets'), { recursive: true })
  const out = join(root, 'new.md')
  const result = spawnSync(process.execPath, [join(root, 'tools/document-template.mjs'), '--type', 'fact', '--out', out, '--conditions', 'C-VISUAL'], { encoding: 'utf8', cwd: tmpdir() })
  assert.equal(result.status, 0, result.stderr)
  assert.match(readFileSync(out, 'utf8'), /^## \d+\. Attachments$/m)
  const files = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)])
  for (const file of files(assets).filter((p) => p.endsWith('.md'))) {
    const text = readFileSync(file, 'utf8')
    assert.doesNotMatch(text, /\/Users\/|evidence-sources\.json|media\/annotation-demo|build\.py/)
    if (dirname(file) === join(assets, 'examples') && !file.endsWith('SCENARIOS.md')) {
      validateNotes(text)
      assert.equal(formatDocument(text), text, file)
    }
    for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1]
      if (/^[a-z]+:|^#/i.test(target)) continue
      const [path, fragment] = target.split('#')
      const linked = resolve(dirname(file), path)
      assert.ok(existsSync(linked), `${file}: ${target}`)
      if (fragment) {
        const headings = readFileSync(linked, 'utf8').split('\n').filter((l) => /^#{1,6} /.test(l)).map((l) => headingAnchor(l.replace(/^#{1,6} /, '')))
        assert.ok(headings.includes(fragment), `${file}: ${target}`)
      }
    }
  }
})
