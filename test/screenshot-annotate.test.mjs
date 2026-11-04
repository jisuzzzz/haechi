import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, linkSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { deflateSync, inflateSync } from 'node:zlib'
import { annotate, decodePng } from '../dist/claude/tools/screenshot-annotate.mjs'

const tool = join(import.meta.dirname, '..', 'dist', 'claude', 'tools', 'screenshot-annotate.mjs')
const run = (args) => spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8' })
const crc = (bytes) => {
  let c = 0xffffffff
  for (const byte of bytes) {
    c ^= byte
    for (let bit = 0; bit < 8; bit++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
  }
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, bytes) => {
  const buffer = Buffer.alloc(12 + bytes.length)
  buffer.writeUInt32BE(bytes.length)
  buffer.write(type, 4)
  bytes.copy(buffer, 8)
  buffer.writeUInt32BE(crc(buffer.subarray(4, -4)), buffer.length - 4)
  return buffer
}
const signature = Buffer.from('89504e470d0a1a0a', 'hex')
const fixture = ({ width = 80, height = 50, channels = 4, filters = [0], bitDepth = 8, interlace = 0, extra = [], solid } = {}) => {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4)
  header[8] = bitDepth; header[9] = channels === 4 ? 6 : 2; header[12] = interlace
  const stride = width * channels, pixels = Buffer.alloc(stride * height), scan = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    const filter = filters[y % filters.length]
    scan[y * (stride + 1)] = filter
    for (let x = 0; x < stride; x++) {
      const value = solid ?? ((x * 17 + y * 11 + 41) & 255)
      pixels[y * stride + x] = value
      const left = x >= channels ? pixels[y * stride + x - channels] : 0
      const above = y > 0 ? pixels[(y - 1) * stride + x] : 0
      const upperLeft = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0
      const guess = left + above - upperLeft
      const distances = [Math.abs(guess - left), Math.abs(guess - above), Math.abs(guess - upperLeft)]
      const paeth = distances[0] <= distances[1] && distances[0] <= distances[2] ? left : distances[1] <= distances[2] ? above : upperLeft
      const prediction = [0, left, above, Math.floor((left + above) / 2), paeth][filter] ?? 0
      scan[y * (stride + 1) + x + 1] = (value - prediction) & 255
    }
  }
  const png = Buffer.concat([signature, chunk('IHDR', header), ...extra, chunk('IDAT', deflateSync(scan)), chunk('IEND', Buffer.alloc(0))])
  return { png, pixels, width, height, channels }
}
// Read the tool's filter-0 RGBA output without using the production decoder.
const readOutput = (file) => {
  const buffer = readFileSync(file)
  assert.deepEqual(buffer.subarray(0, 8), signature)
  let width, height, offset = 8
  const compressed = []
  while (offset < buffer.length) {
    const size = buffer.readUInt32BE(offset), type = buffer.toString('ascii', offset + 4, offset + 8)
    assert.equal(buffer.readUInt32BE(offset + size + 8), crc(buffer.subarray(offset + 4, offset + size + 8)), `${type} checksum`)
    const bytes = buffer.subarray(offset + 8, offset + size + 8)
    if (type === 'IHDR') {
      width = bytes.readUInt32BE(); height = bytes.readUInt32BE(4)
      assert.equal(bytes[8], 8); assert.equal(bytes[9], 6)
    } else if (type === 'IDAT') compressed.push(bytes)
    offset += size + 12
  }
  const scan = inflateSync(Buffer.concat(compressed))
  assert.equal(scan.length, (width * 4 + 1) * height)
  for (let y = 0; y < height; y++) assert.equal(scan[y * (width * 4 + 1)], 0)
  const pixel = (x, y) => [...scan.subarray(y * (width * 4 + 1) + 1 + x * 4, y * (width * 4 + 1) + 5 + x * 4)]
  return { width, height, pixel }
}
const setup = (t, options) => {
  const dir = mkdtempSync(join(tmpdir(), 'haechi-annotate-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const source = join(dir, 'capture.png'), boxes = join(dir, 'regions.json'), out = join(dir, 'marked.png')
  const input = fixture(options)
  writeFileSync(source, input.png)
  writeFileSync(boxes, JSON.stringify({ regions: [{ x: 20, y: 25, width: 30, height: 15, label: '빈 목록' }] }))
  const args = ['--image', source, '--regions', boxes, '--out', out]
  return { ...input, dir, source, boxes, out, args }
}

test('CLI draws a border and readable number outside the selected pixels, preserving the original capture', (t) => {
  const f = setup(t)
  const result = run(f.args)
  assert.equal(result.status, 0, result.stderr)
  const metadata = JSON.parse(result.stdout)
  assert.deepEqual(metadata.source, { width: 80, height: 50 })
  assert.deepEqual(metadata.output, { width: 136, height: 106, sourceOffset: { x: 28, y: 28 } })
  assert.equal(metadata.original, f.source); assert.equal(metadata.annotated, f.out)
  assert.deepEqual(metadata.regions, [{ number: 1, x: 20, y: 25, width: 30, height: 15, label: '빈 목록' }])
  assert.deepEqual(readFileSync(f.source), f.png)
  const image = readOutput(f.out), red = [188, 32, 43, 255], white = [255, 255, 255, 255]
  assert.deepEqual(image.pixel(47, 53), red, 'left border immediately outside the region')
  assert.deepEqual(image.pixel(48, 52), red, 'top border immediately outside the region')
  assert.deepEqual(image.pixel(44, 53), white, 'white border underlay')
  assert.deepEqual(image.pixel(45, 30), red, 'number badge background')
  assert.deepEqual(image.pixel(50, 34), white, 'top stroke of digit 1')
  assert.deepEqual(image.pixel(48, 34), red, 'space beside digit 1')
  for (let y = 25; y < 40; y++) for (let x = 20; x < 50; x++) {
    assert.deepEqual(image.pixel(x + 28, y + 28), [...f.pixels.subarray((y * f.width + x) * 4, (y * f.width + x + 1) * 4)], `original region pixel ${x},${y}`)
  }
})

test('RGB and RGBA inputs decode every standard row filter without changing pixels', () => {
  for (const channels of [3, 4]) {
    const f = fixture({ width: 5, height: 10, channels, filters: [0, 1, 2, 3, 4] })
    const decoded = decodePng(f.png)
    for (let p = 0; p < f.width * f.height; p++) {
      assert.deepEqual([...decoded.pixels.subarray(p * 4, p * 4 + 4)], [...f.pixels.subarray(p * channels, p * channels + 3), channels === 4 ? f.pixels[p * channels + 3] : 255])
    }
  }
})

test('edge-to-edge regions are visible in added padding and multiple regions keep sequential labels', (t) => {
  const f = setup(t, { width: 12, height: 10, channels: 3 })
  writeFileSync(f.boxes, JSON.stringify({ regions: [{ x: 0, y: 0, width: 12, height: 10, label: '전체 화면' }] }))
  const result = run(f.args)
  assert.equal(result.status, 0, result.stderr)
  const image = readOutput(f.out)
  for (const p of [[27, 28], [40, 28], [28, 27], [28, 38]]) assert.deepEqual(image.pixel(...p), [188, 32, 43, 255])
  for (let y = 0; y < 10; y++) for (let x = 0; x < 12; x++) assert.deepEqual(image.pixel(x + 28, y + 28), [...f.pixels.subarray((y * 12 + x) * 3, (y * 12 + x + 1) * 3), 255])
  const marked = annotate(decodePng(f.png), { regions: [{ x: 0, y: 0, width: 1, height: 1, label: '왼쪽' }, { x: 11, y: 9, width: 1, height: 1, label: '오른쪽' }] })
  assert.deepEqual(marked.regions.map(({ number, label }) => [number, label]), [[1, '왼쪽'], [2, '오른쪽']])
})

test('the second rectangle visibly carries digit 2, not just numbered metadata', (t) => {
  const f = setup(t, { width: 100, height: 100 })
  writeFileSync(f.boxes, JSON.stringify({ regions: [
    { x: 10, y: 30, width: 25, height: 15, label: '집계' },
    { x: 60, y: 70, width: 25, height: 15, label: '목록' },
  ] }))
  const result = run(f.args)
  assert.equal(result.status, 0, result.stderr)
  const image = readOutput(f.out)
  // The top stroke of 2 spans all three columns; its middle-left is background, middle-right is white.
  for (const x of [88, 90, 92]) assert.deepEqual(image.pixel(x, 79), [255, 255, 255, 255])
  assert.deepEqual(image.pixel(88, 81), [188, 32, 43, 255])
  assert.deepEqual(image.pixel(92, 81), [255, 255, 255, 255])
})

test('adjacent regions protect each other from borders and badges', (t) => {
  const f = setup(t, { width: 80, height: 80, solid: 255 })
  const regions = [{ x: 10, y: 10, width: 30, height: 20, label: 'first' }, { x: 10, y: 32, width: 30, height: 20, label: 'second' }]
  writeFileSync(f.boxes, JSON.stringify({ regions }))
  const result = run(f.args)
  assert.equal(result.status, 0, result.stderr)
  const image = readOutput(f.out)
  assert.deepEqual(image.pixel(12 + 28, 15 + 28), [255, 255, 255, 255], 'second badge must not obscure first region')
  for (const region of regions) for (let y = region.y; y < region.y + region.height; y++) for (let x = region.x; x < region.x + region.width; x++) {
    assert.deepEqual(image.pixel(x + 28, y + 28), [255, 255, 255, 255], `protected pixel ${x},${y}`)
  }
  assert.deepEqual(readFileSync(f.source), f.png)
})

test('nearby numbers move apart and overlapping or crowded regions fail actionably', (t) => {
  const f = setup(t, { width: 80, height: 80, solid: 255 })
  writeFileSync(f.boxes, JSON.stringify({ regions: [
    { x: 10, y: 30, width: 2, height: 2, label: 'first' },
    { x: 14, y: 30, width: 2, height: 2, label: 'second' },
  ] }))
  let result = run(f.args)
  assert.equal(result.status, 0, result.stderr)
  const image = readOutput(f.out)
  assert.deepEqual(image.pixel(42, 69), [255, 255, 255, 255], 'digit 2 moves below the region')
  assert.deepEqual(image.pixel(42, 71), [188, 32, 43, 255], 'digit 2 remains legible')
  rmSync(f.out)
  writeFileSync(f.boxes, JSON.stringify({ regions: [
    { x: 10, y: 10, width: 30, height: 20, label: 'outer' },
    { x: 15, y: 15, width: 2, height: 2, label: 'inner' },
  ] }))
  result = run(f.args)
  assert.equal(result.status, 2)
  assert.match(result.stderr, /overlap.*separate/i)
  assert.equal(existsSync(f.out), false)
  writeFileSync(f.boxes, JSON.stringify({ regions: Array.from({ length: 81 }, (_, i) => ({ x: i % 9, y: Math.floor(i / 9), width: 1, height: 1, label: `pixel ${i}` })) }))
  result = run(f.args)
  assert.equal(result.status, 2)
  assert.match(result.stderr, /number.*separate images/i)
  assert.equal(existsSync(f.out), false)
})

test('CLI executes when installed behind a symlink directory or file alias', (t) => {
  const f = setup(t)
  const directory = join(f.dir, 'installed-tools'), alias = join(f.dir, 'annotate.mjs')
  symlinkSync(dirname(tool), directory, 'dir')
  symlinkSync(tool, alias)
  for (const script of [join(directory, 'screenshot-annotate.mjs'), alias]) {
    const result = spawnSync(process.execPath, [script, ...f.args], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(existsSync(f.out), true, 'the CLI must actually run, not exit silently')
    assert.equal(JSON.parse(result.stdout).annotated, f.out)
    rmSync(f.out)
  }
})

test('coordinates use original image pixels and reject invalid, fractional or scaled-outside rectangles', (t) => {
  const f = setup(t)
  for (const region of [
    { x: -1, y: 0, width: 10, height: 10, label: 'x' },
    { x: 0.5, y: 0, width: 10, height: 10, label: 'x' },
    { x: 20, y: 25, width: 60, height: 50, label: 'wrong device scale' },
    { x: 0, y: 0, width: 0, height: 1, label: 'x' },
    { x: 0, y: 0, width: 1, height: 1, label: ' ' },
    { x: '0', y: 0, width: 1, height: 1, label: 'x' },
    null,
  ]) {
    writeFileSync(f.boxes, JSON.stringify({ regions: [region] }))
    const result = run(f.args)
    assert.equal(result.status, 2, result.stderr)
    assert.equal(existsSync(f.out), false)
    assert.deepEqual(readFileSync(f.source), f.png)
  }
  for (const regions of [[], Array.from({ length: 100 }, () => ({ x: 0, y: 0, width: 1, height: 1, label: 'x' }))]) {
    assert.throws(() => annotate(decodePng(f.png), { regions }), /1 to 99/)
  }
})

test('output cannot replace an original, existing file, symbolic link or hard link', (t) => {
  const f = setup(t)
  assert.equal(run(['--image', f.source, '--regions', f.boxes, '--out', f.source]).status, 2)
  writeFileSync(f.out, 'keep this existing file')
  assert.equal(run(f.args).status, 2)
  assert.equal(readFileSync(f.out, 'utf8'), 'keep this existing file')
  for (const makeAlias of [symlinkSync, linkSync]) {
    const path = join(f.dir, makeAlias === symlinkSync ? 'symlink.png' : 'hardlink.png')
    makeAlias(f.source, path)
    const result = run(['--image', f.source, '--regions', f.boxes, '--out', path])
    assert.equal(result.status, 2, result.stderr)
    assert.deepEqual(readFileSync(f.source), f.png)
  }
})

test('malformed/unsupported PNG and metadata fail explicitly without creating an image', (t) => {
  const f = setup(t)
  const badCrc = Buffer.from(f.png); badCrc[29] ^= 1
  const unknownCritical = fixture({ extra: [chunk('ABCD', Buffer.alloc(0))] }).png
  const trns = fixture({ channels: 3, extra: [chunk('tRNS', Buffer.alloc(6))] }).png
  const animation = fixture({ extra: [chunk('acTL', Buffer.alloc(8))] }).png
  for (const png of [Buffer.from('not a png'), f.png.subarray(0, -5), badCrc, fixture({ bitDepth: 16 }).png, fixture({ interlace: 1 }).png, fixture({ filters: [5] }).png, unknownCritical, trns, animation]) {
    writeFileSync(f.source, png)
    const result = run(f.args)
    assert.equal(result.status, 2, result.stderr)
    assert.equal(existsSync(f.out), false)
    assert.deepEqual(readFileSync(f.source), png)
  }
  writeFileSync(f.source, f.png)
  writeFileSync(f.boxes, '{broken json')
  assert.equal(run(f.args).status, 2)
  assert.equal(existsSync(f.out), false)
  assert.equal(run(['--image', f.source, '--regions', f.boxes, '--out', '--unknown']).status, 2)
})

test('PNG dimensions and decompressed size are bounded before allocation', () => {
  const png = fixture({ width: 1, height: 1 }).png
  const hugeHeader = Buffer.from(png.subarray(16, 29))
  hugeHeader.writeUInt32BE(100_000); hugeHeader.writeUInt32BE(100_000, 4)
  const huge = Buffer.concat([signature, chunk('IHDR', hugeHeader), png.subarray(33)])
  assert.throws(() => decodePng(huge), /at most 16000000 pixels/)
  const header = png.subarray(16, 29)
  const bomb = Buffer.concat([signature, chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.alloc(100_000))), chunk('IEND', Buffer.alloc(0))])
  assert.throws(() => decodePng(bomb), /within its dimensions/)
  const wrongLength = Buffer.concat([signature, chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.from([0, 1]))), chunk('IEND', Buffer.alloc(0))])
  assert.throws(() => decodePng(wrongLength), /does not match its dimensions/)
})

test('color metadata survives the annotation PNG so colors retain their interpretation', (t) => {
  const gamma = Buffer.alloc(4); gamma.writeUInt32BE(45455)
  const f = setup(t, { extra: [chunk('gAMA', gamma), chunk('sRGB', Buffer.from([0]))] })
  const result = run(f.args)
  assert.equal(result.status, 0, result.stderr)
  const decoded = decodePng(readFileSync(f.out))
  assert.deepEqual(decoded.metadata, [{ type: 'gAMA', data: gamma }, { type: 'sRGB', data: Buffer.from([0]) }])
})
