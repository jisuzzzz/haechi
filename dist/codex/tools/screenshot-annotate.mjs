// Adds numbered borders to an actual PNG capture without changing the source file.
// Usage: node screenshot-annotate.mjs --image original.png --regions regions.json --out marked.png
// regions.json: { "regions": [{ "x": 120, "y": 80, "width": 250, "height": 60, "label": "Empty list" }] }
// Coordinates are integer pixels in the original image, not CSS pixels unless captured at scale: 'css'.
// Output is PNG plus JSON on stdout describing paths, dimensions, the source offset and numbered labels.
// Only normal 8-bit noninterlaced RGB/RGBA PNG is supported. No browser or image library is required.
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync, inflateSync } from 'node:zlib'









const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const MAX_PIXELS = 16_000_000
const MAX_FILE = 64 * 1024 * 1024
const PADDING = 28
const RED = [188, 32, 43, 255]
const WHITE = [255, 255, 255, 255]
const COLOR_CHUNKS = new Set(['cHRM', 'gAMA', 'iCCP', 'sRGB', 'cICP', 'mDCV', 'cLLI', 'pHYs'])
const DIGITS = [
  ['111', '101', '101', '101', '111'], ['010', '110', '010', '010', '111'],
  ['111', '001', '111', '100', '111'], ['111', '001', '111', '001', '111'],
  ['101', '101', '111', '001', '001'], ['111', '100', '111', '001', '111'],
  ['111', '100', '111', '101', '111'], ['111', '001', '010', '010', '010'],
  ['111', '101', '111', '101', '111'], ['111', '101', '111', '001', '111'],
]

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1
  return n >>> 0
})
const crc32 = (buffer        ) => {
  let crc = 0xffffffff
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
const chunk = (type        , data        ) => {
  const buffer = Buffer.alloc(data.length + 12)
  buffer.writeUInt32BE(data.length)
  buffer.write(type, 4, 4, 'ascii')
  data.copy(buffer, 8)
  buffer.writeUInt32BE(crc32(buffer.subarray(4, -4)), buffer.length - 4)
  return buffer
}
const dimensions = (width        , height        ) => {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > MAX_PIXELS) {
    throw new Error(`image dimensions must be positive and at most ${MAX_PIXELS} pixels`)
  }
}
const paeth = (a        , b        , c        ) => {
  const p = a + b - c
  const da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c)
  return da <= db && da <= dc ? a : db <= dc ? b : c
}

export const decodePng = (buffer         )           => {
  if (!Buffer.isBuffer(buffer) || buffer.length > MAX_FILE || !buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('expected a PNG file of at most 64 MiB')
  let offset = 8, width                    , height                    , channels                    , ended = false, idatClosed = false, chunks = 0
  const compressed           = [], metadata                = []
  while (offset < buffer.length) {
    if (++chunks > 10_000 || offset + 12 > buffer.length) throw new Error('invalid PNG chunk structure')
    const length = buffer.readUInt32BE(offset)
    if (length > buffer.length - offset - 12) throw new Error('truncated PNG chunk')
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    if (!/^[A-Za-z]{4}$/.test(type)) throw new Error('invalid PNG chunk type')
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (crc32(buffer.subarray(offset + 4, offset + 8 + length)) !== buffer.readUInt32BE(offset + 8 + length)) throw new Error(`invalid PNG checksum in ${type}`)
    offset += length + 12
    if (width === undefined && type !== 'IHDR') throw new Error('PNG must start with IHDR')
    if (type !== 'IDAT' && compressed.length) idatClosed = true
    if (type === 'IHDR') {
      if (width !== undefined || length !== 13) throw new Error('invalid PNG IHDR')
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      dimensions(width, height)
      if (data[8] !== 8 || ![2, 6].includes(data[9]) || data[10] || data[11] || data[12]) throw new Error('unsupported PNG: use 8-bit noninterlaced RGB or RGBA')
      channels = data[9] === 2 ? 3 : 4
    } else if (type === 'IDAT') {
      if (idatClosed) throw new Error('PNG IDAT chunks must be consecutive')
      compressed.push(data)
    } else if (type === 'IEND') {
      if (length || !compressed.length || offset !== buffer.length) throw new Error('invalid PNG ending')
      ended = true
      break
    } else if (type === 'PLTE') {
      if (compressed.length || !length || length % 3 || length > 768) throw new Error('invalid PNG palette')
    } else if (['tRNS', 'acTL', 'fcTL', 'fdAT'].includes(type)) {
      throw new Error(`unsupported PNG ${type}: capture a static RGB or RGBA image`)
    } else if (COLOR_CHUNKS.has(type)) {
      metadata.push({ type, data: Buffer.from(data) })
    } else if (type[0] === type[0].toUpperCase()) throw new Error(`unsupported PNG critical chunk ${type}`)
  }
  if (!ended) throw new Error('PNG is missing IEND')
  const stride = width  * channels , size = (stride + 1) * height
  let rows
  try { rows = inflateSync(Buffer.concat(compressed), { maxOutputLength: size }) }
  catch { throw new Error('PNG pixel data could not be decompressed within its dimensions') }
  if (rows.length !== size) throw new Error('PNG pixel data does not match its dimensions')
  const pixels = Buffer.alloc(width  * height  * 4), previous = Buffer.alloc(stride)
  for (let y = 0; y < height ; y++) {
    const start = y * (stride + 1), filter = rows[start]
    if (filter > 4) throw new Error(`unsupported PNG row filter ${filter}`)
    const row = rows.subarray(start + 1, start + 1 + stride)
    for (let x = 0; x < stride; x++) {
      const a = x >= channels  ? row[x - channels ] : 0, b = previous[x], c = x >= channels  ? previous[x - channels ] : 0
      const prediction = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : paeth(a, b, c)
      row[x] = (row[x] + prediction) & 255
    }
    for (let x = 0; x < width ; x++) {
      const dest = (y * width  + x) * 4, src = x * channels
      pixels[dest] = row[src]; pixels[dest + 1] = row[src + 1]; pixels[dest + 2] = row[src + 2]
      pixels[dest + 3] = channels  === 4 ? row[src + 3] : 255
    }
    row.copy(previous)
  }
  return { width, height, pixels, metadata }
}

export const encodePng = ({ width, height, pixels, metadata = [] }          )         => {
  dimensions(width, height)
  if (!Buffer.isBuffer(pixels) || pixels.length !== width * height * 4) throw new Error('RGBA pixels do not match image dimensions')
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6
  const rows = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) pixels.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), ...metadata.filter(({ type }) => COLOR_CHUNKS.has(type)).map(({ type, data }) => chunk(type, data)), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))])
}

export const annotate = (source          , input         )             => {
  const { width, height } = source
  if (!input || !Array.isArray((input                         ).regions) || !(input                          ).regions.length || (input                          ).regions.length > 99) throw new Error('regions must contain 1 to 99 rectangles')
  const regions = (input                         ).regions.map((region, index) => {
    if (!region || !['x', 'y', 'width', 'height'].every((key) => Number.isSafeInteger(region[key                   ]))) throw new Error(`region ${index + 1}: coordinates must be integer image pixels`)
    const { x, y, width: w, height: h, label } = region
    if (x < 0 || y < 0 || w < 1 || h < 1 || x + w > width || y + h > height) throw new Error(`region ${index + 1}: rectangle is outside the source image`)
    if (typeof label !== 'string' || !label.trim()) throw new Error(`region ${index + 1}: label must be a nonempty description`)
    return { number: index + 1, x, y, width: w, height: h, label: label.trim() }
  })
  const intersects = (a           , b           )          => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
  for (let i = 0; i < regions.length; i++) for (let j = i + 1; j < regions.length; j++) {
    if (intersects(regions[i], regions[j])) throw new Error(`regions ${i + 1} and ${j + 1} overlap; use disjoint regions or separate images to preserve their contents`)
  }
  const marked = { width: width + PADDING * 2, height: height + PADDING * 2, metadata: source.metadata }
  dimensions(marked.width, marked.height)
  // Plan all badges before drawing. A nearby label must not cover another region or number.
  const frames = regions.map((region) => ({ x: region.x + PADDING - 4, y: region.y + PADDING - 4, width: region.width + 8, height: region.height + 8 }))
  const badges              = []
  for (const region of regions) {
    const x = region.x + PADDING, y = region.y + PADDING, w = String(region.number).length * 8 + 8, h = 20
    const positions = [
      [x - 4, y - 4 - h], [x + region.width + 4 - w, y - 4 - h],
      [x - 4, y + region.height + 4], [x + region.width + 4 - w, y + region.height + 4],
      [x - 4 - w, y - 4], [x + region.width + 4, y - 4],
      [x - 4 - w, y + region.height + 4 - h], [x + region.width + 4, y + region.height + 4 - h],
    ]
    const badge = positions.map(([bx, by]) => ({ x: bx, y: by, width: w, height: h })).find((candidate) =>
      candidate.x >= 0 && candidate.y >= 0 && candidate.x + w <= marked.width && candidate.y + h <= marked.height &&
      !frames.some((frame) => intersects(candidate, frame)) && !badges.some((other) => intersects(candidate, other)))
    if (!badge) throw new Error(`cannot place number ${region.number} without hiding a region or number; use fewer or more widely spaced regions, or separate images`)
    badges.push(badge)
  }
  const protectedPixels = new Uint8Array(width * height)
  for (const region of regions) for (let y = region.y; y < region.y + region.height; y++) protectedPixels.fill(1, y * width + region.x, y * width + region.x + region.width)
  marked.pixels = Buffer.alloc(marked.width * marked.height * 4, 255)
  for (let y = 0; y < height; y++) source.pixels.copy(marked.pixels, ((y + PADDING) * marked.width + PADDING) * 4, y * width * 4, (y + 1) * width * 4)
  const paint = (x        , y        , color      )       => {
    if (x < 0 || y < 0 || x >= marked.width || y >= marked.height) return
    const sx = x - PADDING, sy = y - PADDING
    if (sx >= 0 && sy >= 0 && sx < width && sy < height && protectedPixels[sy * width + sx]) return
    const at = (y * marked.width + x) * 4
    for (let c = 0; c < 4; c++) marked.pixels[at + c] = color[c]
  }
  const fill = (x        , y        , w        , h        , color      )       => {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) paint(x + dx, y + dy, color)
  }
  const outline = (x        , y        , w        , h        , thickness        , color      )       => {
    fill(x - thickness, y - thickness, w + thickness * 2, thickness, color)
    fill(x - thickness, y + h, w + thickness * 2, thickness, color)
    fill(x - thickness, y, thickness, h, color)
    fill(x + w, y, thickness, h, color)
  }
  for (const [index, region] of regions.entries()) {
    const x = region.x + PADDING, y = region.y + PADDING
    outline(x, y, region.width, region.height, 4, WHITE)
    outline(x, y, region.width, region.height, 3, RED)
    const digits = String(region.number), bx = badges[index].x + 1, by = badges[index].y + 1, bw = digits.length * 8 + 6
    fill(bx - 1, by - 1, bw + 2, 20, WHITE)
    fill(bx, by, bw, 18, RED)
    for (let digit = 0; digit < digits.length; digit++) {
      for (let row = 0; row < 5; row++) for (let column = 0; column < 3; column++) {
        if (DIGITS[Number(digits[digit])][row][column] === '1') fill(bx + 3 + digit * 8 + column * 2, by + 4 + row * 2, 2, 2, WHITE)
      }
    }
  }
  return { image: marked, regions, sourceOffset: { x: PADDING, y: PADDING } }
}

const main = () => {
  const usage = 'Usage: node screenshot-annotate.mjs --image original.png --regions regions.json --out marked.png'
  try {
    const options                         = {}
    for (let i = 2; i < process.argv.length; i++) {
      const key = process.argv[i]
      if (!['--image', '--regions', '--out'].includes(key) || options[key] || !process.argv[i + 1] || process.argv[i + 1].startsWith('--')) throw new Error(`invalid option ${key}`)
      options[key] = process.argv[++i]
    }
    if (!options['--image'] || !options['--regions'] || !options['--out']) throw new Error('image, regions and out are required')
    const original = resolve(options['--image']), annotated = resolve(options['--out'])
    if (original === annotated) throw new Error('output must differ from the original capture')
    if (extname(annotated).toLowerCase() !== '.png') throw new Error('output must have a .png extension')
    if (statSync(original).size > MAX_FILE) throw new Error('source PNG exceeds 64 MiB')
    if (statSync(options['--regions']).size > 1024 * 1024) throw new Error('region metadata exceeds 1 MiB')
    const source = decodePng(readFileSync(original))
    const input          = JSON.parse(readFileSync(options['--regions'], 'utf8').replace(/^\uFEFF/, ''))
    const result = annotate(source, input)
    mkdirSync(dirname(annotated), { recursive: true })
    writeFileSync(annotated, encodePng(result.image), { flag: 'wx' })
    console.log(JSON.stringify({ original, annotated, source: { width: source.width, height: source.height }, output: { width: result.image.width, height: result.image.height, sourceOffset: result.sourceOffset }, regions: result.regions }, null, 2))
  } catch (error) {
    console.error(`${(error         ).message}\n${usage}`)
    process.exitCode = 2
  }
}

if (process.argv[1] && existsSync(process.argv[1]) && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) main()
