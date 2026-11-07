/**
 * Host-side mind-map parsing, outlining and editing.
 *
 * This module is intentionally dependency-free: it runs in the DSH host,
 * where DOM parsers and browser bundles are unavailable. It supports the four
 * text formats the viewer can edit plus a read-only XMind reader.
 *
 * Nodes are plain objects:
 *   { text, note, link, side, collapsed, children }
 *
 * `mindmap_outline` assigns ids in pre-order (`n1`, `n2`, ...). The same
 * algorithm is used by `mindmap_apply`, so ids from an outline stay valid as
 * long as the file version has not changed.
 */

import { inflateRawSync } from 'node:zlib'

export const MAX_NODES = 20_000
export const MAX_TEXT_BYTES = 8 * 1024 * 1024
export const MAX_XMIND_BYTES = 32 * 1024 * 1024
const MAX_ZIP_ENTRY_BYTES = 24 * 1024 * 1024
const MAX_ZIP_TOTAL_BYTES = 32 * 1024 * 1024
const MAX_ZIP_ENTRIES = 4096
const MAX_OPS = 200

const TEXT_FORMATS = new Set(['.mm', '.opml', '.km', '.vym'])
export const FORMATS = new Set(['.mm', '.opml', '.km', '.vym', '.xmind'])

export function isTextFormat(ext) {
  return TEXT_FORMATS.has(ext)
}

export function isSupportedFormat(ext) {
  return FORMATS.has(ext)
}

export function makeNode(text, extra = {}) {
  return {
    text: cleanText(text),
    note: '',
    link: '',
    side: undefined,
    collapsed: false,
    children: [],
    ...extra,
  }
}

export function countNodes(node) {
  let total = 1
  for (const child of node.children) total += countNodes(child)
  return total
}

// ---------------------------------------------------------------- XML helpers

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

export function decodeEntities(value) {
  return String(value).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body) => {
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X'
      const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    return ENTITIES[body] ?? match
  })
}

export function escapeText(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function escapeAttr(value) {
  return escapeText(value).replace(/"/g, '&quot;').replace(/\r?\n/g, '&#10;')
}

export function stripHtml(value) {
  return cleanText(
    decodeEntities(String(value).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ' ')),
  )
}

export function cleanText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim()
}

function findTagEnd(text, from) {
  let quote = ''
  for (let i = from; i < text.length; i += 1) {
    const char = text[i]
    if (quote !== '') {
      if (char === quote) quote = ''
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === '>') return i
  }
  return -1
}

function parseAttrs(raw) {
  const attrs = {}
  const pattern = /([:\w.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g
  let match
  while ((match = pattern.exec(raw)) !== null) {
    attrs[match[1]] = decodeEntities(match[3] ?? match[4] ?? '')
  }
  return attrs
}

/** A forgiving XML tree builder: enough for mind-map files, no external deps. */
export function parseXmlTree(text) {
  const root = { name: '#root', attrs: {}, children: [], text: '' }
  const stack = [root]
  let i = 0
  const addText = (raw, decode = true) => {
    if (!raw) return
    stack[stack.length - 1].text += decode ? decodeEntities(raw) : raw
  }

  while (i < text.length) {
    const lt = text.indexOf('<', i)
    if (lt < 0) {
      addText(text.slice(i))
      break
    }
    if (lt > i) addText(text.slice(i, lt))
    if (text.startsWith('<!--', lt)) {
      const end = text.indexOf('-->', lt + 4)
      i = end < 0 ? text.length : end + 3
      continue
    }
    if (text.startsWith('<![CDATA[', lt)) {
      const end = text.indexOf(']]>', lt + 9)
      addText(text.slice(lt + 9, end < 0 ? text.length : end), false)
      i = end < 0 ? text.length : end + 3
      continue
    }
    if (text.startsWith('<?', lt)) {
      const end = text.indexOf('?>', lt + 2)
      i = end < 0 ? text.length : end + 2
      continue
    }
    if (text.startsWith('<!', lt)) {
      const end = text.indexOf('>', lt + 2)
      i = end < 0 ? text.length : end + 1
      continue
    }
    const gt = findTagEnd(text, lt + 1)
    if (gt < 0) break
    const raw = text.slice(lt + 1, gt).trim()
    i = gt + 1
    if (raw.startsWith('/')) {
      const name = localName(raw.slice(1).trim())
      for (let k = stack.length - 1; k > 0; k -= 1) {
        if (localName(stack[k].name) === name) {
          stack.length = k
          break
        }
      }
      continue
    }
    const self = raw.endsWith('/')
    const body = self ? raw.slice(0, -1).trim() : raw
    const space = body.search(/\s/)
    const name = localName(space < 0 ? body : body.slice(0, space))
    const node = {
      name,
      attrs: space < 0 ? {} : parseAttrs(body.slice(space + 1)),
      children: [],
      text: '',
    }
    stack[stack.length - 1].children.push(node)
    if (!self) stack.push(node)
  }
  return root
}

export function localName(name) {
  return String(name).split(':').pop()
}

export function childrenOf(element, name) {
  return element.children.filter((child) => child.name === name)
}

export function childOf(element, name) {
  return element.children.find((child) => child.name === name)
}

export function textOf(element) {
  if (element === undefined) return ''
  let text = element.text ?? ''
  for (const child of element.children) text += textOf(child)
  return text
}

export function attr(element, ...names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(element.attrs, name)) return element.attrs[name]
  }
  const lower = names.map((name) => name.toLowerCase())
  for (const [key, value] of Object.entries(element.attrs)) {
    if (lower.includes(key.toLowerCase())) return value
  }
  return undefined
}

// -------------------------------------------------------------------- parsing

export function parseText(text, ext) {
  switch (ext) {
    case '.mm':
      return parseMm(text)
    case '.opml':
      return parseOpml(text)
    case '.km':
      return parseKm(text)
    case '.vym':
      return parseVym(text)
    default:
      throw new Error(`unsupported-format: ${ext}`)
  }
}

export function parseMm(text) {
  const tree = parseXmlTree(text)
  const map = tree.children.find((child) => child.name === 'map') ?? collectByLocalName(tree, 'map')[0]
  if (!map) throw new Error('not-a-freemind-map')
  const rootElement = childOf(map, 'node')
  if (!rootElement) throw new Error('freemind-map-has-no-root')

  const readNode = (element, inheritedSide) => {
    const position = String(attr(element, 'POSITION', 'position') ?? '').toLowerCase()
    const side = position === 'left' || position === 'right' ? position : inheritedSide
    let label = attr(element, 'TEXT', 'text') ?? ''
    let note = ''
    for (const rich of childrenOf(element, 'richcontent')) {
      const type = String(attr(rich, 'TYPE', 'type') ?? '').toUpperCase()
      if (type === 'NOTE') note = stripHtml(textOf(rich))
      else if (label === '') label = stripHtml(textOf(rich))
    }
    const node = makeNode(label, {
      note,
      link: attr(element, 'LINK', 'link') ?? '',
      side,
      collapsed: String(attr(element, 'FOLDED', 'folded') ?? '').toLowerCase() === 'true',
    })
    node.children = childrenOf(element, 'node').map((child) => readNode(child, side))
    return node
  }

  const root = readNode(rootElement, 'right')
  if (root.text === '') root.text = 'Mind map'
  return { format: 'mm', editable: true, sheets: [{ title: 'Mind map', root }] }
}

export function parseOpml(text) {
  const tree = parseXmlTree(text)
  const body = collectByLocalName(tree, 'body')[0]
  if (!body) throw new Error('opml-has-no-body')
  const outline = childOf(body, 'outline')
  if (!outline) throw new Error('opml-has-no-outline')

  const readOutline = (element, inheritedSide) => {
    const node = makeNode(attr(element, 'text', 'title') ?? '', {
      note: stripHtml(attr(element, '_note', 'note') ?? ''),
      link: attr(element, '_link', 'url', 'link') ?? '',
      side: inheritedSide,
    })
    node.children = childrenOf(element, 'outline').map((child) => readOutline(child, inheritedSide))
    return node
  }

  const root = readOutline(outline, undefined)
  if (root.text === '') root.text = 'Mind map'
  const titleEl = collectByLocalName(tree, 'title')[0]
  const title = cleanText(textOf(titleEl))
  return { format: 'opml', editable: true, sheets: [{ title: title || 'Mind map', root }] }
}

export function parseKm(text) {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('not-a-kityminder-file')
  }
  const rawRoot = data?.root ?? data
  if (!rawRoot || typeof rawRoot !== 'object') throw new Error('kityminder-has-no-root')

  const readNode = (raw, inheritedSide) => {
    const label = raw?.data?.text ?? raw?.data?.html ?? raw?.text ?? ''
    const node = makeNode(stripHtml(label), {
      note: stripHtml(raw?.data?.note ?? raw?.note ?? ''),
      link: raw?.data?.hyperlink ?? raw?.data?.link ?? '',
      side: inheritedSide,
      collapsed: raw?.data?.expandState === 'collapse' || raw?.collapse === true,
    })
    const children = Array.isArray(raw?.children) ? raw.children : []
    node.children = children.map((child) => readNode(child, inheritedSide))
    return node
  }

  const root = readNode(rawRoot, undefined)
  if (root.text === '') root.text = 'Mind map'
  return { format: 'km', editable: true, sheets: [{ title: cleanText(data?.title) || 'Mind map', root }] }
}

export function parseVym(text) {
  const tree = parseXmlTree(text)
  const map = tree.children.find((child) => child.name === 'vymmap') ?? collectByLocalName(tree, 'vymmap')[0]
  if (!map) throw new Error('not-a-vym-map')
  const firstBranch = childOf(map, 'branch')
  if (!firstBranch) throw new Error('vym-map-has-no-branch')

  const readBranch = (branch, inheritedSide) => {
    const heading = childOf(branch, 'heading')
    const node = makeNode(textOf(heading), { side: inheritedSide })
    const note = childOf(branch, 'note') ?? childOf(branch, 'html')
    if (note) node.note = stripHtml(textOf(note))
    node.children = childrenOf(branch, 'branch').map((child) => readBranch(child, inheritedSide))
    return node
  }

  const root = readBranch(firstBranch, undefined)
  if (root.text === '') root.text = 'Mind map'
  return { format: 'vym', editable: true, sheets: [{ title: 'Mind map', root }] }
}

// ---------------------------------------------------------------------- XMind

export function parseXmind(bytes) {
  const files = readZip(bytes)
  const decoder = new TextDecoder()
  const contentJson = files.get('content.json')
  if (contentJson) {
    let data
    try {
      data = JSON.parse(decoder.decode(contentJson))
    } catch {
      data = undefined
    }
    const rawSheets = data ? (Array.isArray(data) ? data : (data.sheets ?? [])) : []
    const sheets = []
    for (const sheet of rawSheets) {
      const topic = sheet?.rootTopic ?? sheet?.root
      if (!topic) continue
      sheets.push({ title: cleanText(sheet.title) || 'Sheet', root: readXmindTopic(topic) })
    }
    if (sheets.length > 0) return { format: 'xmind', editable: false, sheets }
  }

  const contentXml = files.get('content.xml')
  if (!contentXml) throw new Error('xmind-has-no-sheets')
  const doc = parseXmlTree(decoder.decode(contentXml))
  const sheets = []
  for (const sheet of collectByLocalName(doc, 'sheet')) {
    const topic = childrenOf(sheet, 'topic')[0]
    if (!topic) continue
    const title = textOf(childrenOf(sheet, 'title')[0])
    sheets.push({ title: cleanText(title) || 'Sheet', root: readXmindXmlTopic(topic) })
  }
  if (sheets.length === 0) throw new Error('xmind-has-no-topics')
  return { format: 'xmind', editable: false, sheets }
}

function collectByLocalName(element, name, out = []) {
  for (const child of element.children) {
    if (child.name === name) out.push(child)
    collectByLocalName(child, name, out)
  }
  return out
}

function readXmindTopic(topic) {
  const node = makeNode(topic.title ?? topic.topic ?? '', {
    note: stripHtml(topic.notes?.plain?.content ?? ''),
    link: topic.hyperlink ?? '',
    collapsed: topic.folded === true,
  })
  const children = topic.children
  const attached = Array.isArray(children) ? children : (children?.attached ?? [])
  node.children = attached.map(readXmindTopic)
  return node
}

function readXmindXmlTopic(topic) {
  const label = textOf(childOf(topic, 'title'))
  const notes = childOf(topic, 'notes')
  const plain = notes ? childOf(notes, 'plain') : undefined
  const node = makeNode(label, {
    note: stripHtml(textOf(plain)),
    collapsed: String(attr(topic, 'folded', 'FOLDED') ?? '').toLowerCase() === 'true',
  })
  for (const group of childrenOf(topic, 'children')) {
    for (const topics of childrenOf(group, 'topics')) {
      if (String(attr(topics, 'type') ?? 'attached') !== 'attached') continue
      for (const child of childrenOf(topics, 'topic')) node.children.push(readXmindXmlTopic(child))
    }
  }
  return node
}

function readZip(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
  let eocd = -1
  const floor = Math.max(0, u8.length - 65_557)
  for (let i = u8.length - 22; i >= floor; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('damaged-zip-container')
  const count = view.getUint16(eocd + 10, true)
  if (count > MAX_ZIP_ENTRIES) throw new Error('xmind-archive-has-too-many-entries')
  let offset = view.getUint32(eocd + 16, true)
  const files = new Map()
  let total = 0

  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > u8.length || view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error('damaged-zip-container')
    }
    const method = view.getUint16(offset + 10, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const uncompressedSize = view.getUint32(offset + 24, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const localOffset = view.getUint32(offset + 42, true)
    const name = new TextDecoder().decode(u8.subarray(offset + 46, offset + 46 + nameLength))
    offset += 46 + nameLength + extraLength + commentLength

    if (name !== 'content.json' && name !== 'content.xml') continue
    if (uncompressedSize > MAX_ZIP_ENTRY_BYTES) throw new Error('xmind-content-is-too-large')
    total += uncompressedSize
    if (total > MAX_ZIP_TOTAL_BYTES) throw new Error('xmind-content-is-too-large')

    if (localOffset + 30 > u8.length || view.getUint32(localOffset, true) !== 0x04034b50) {
      throw new Error('damaged-zip-container')
    }
    const localNameLength = view.getUint16(localOffset + 26, true)
    const localExtraLength = view.getUint16(localOffset + 28, true)
    const start = localOffset + 30 + localNameLength + localExtraLength
    const end = start + compressedSize
    if (end > u8.length) throw new Error('damaged-zip-container')
    const raw = u8.subarray(start, end)
    const data = method === 0 ? raw : new Uint8Array(inflateRawSync(raw, { maxOutputLength: MAX_ZIP_ENTRY_BYTES }))
    if (data.length > MAX_ZIP_ENTRY_BYTES) throw new Error('xmind-content-is-too-large')
    files.set(name, data)
  }
  return files
}

// ------------------------------------------------------------------- outline

export function indexTree(root) {
  const byId = new Map()
  const parent = new Map()
  const ids = new Map()
  let count = 0
  const walk = (node, up) => {
    count += 1
    const id = `n${count}`
    byId.set(id, node)
    ids.set(node, id)
    if (up) parent.set(node, up)
    for (const child of node.children) walk(child, node)
  }
  walk(root, undefined)
  return { byId, parent, ids, count }
}

export function outlineTree(root, options = {}) {
  const { includeNotes = false, maxDepth = 0 } = options
  const lines = []
  let count = 0
  const ids = new Map()
  let lastId = ''

  const walk = (node, depth) => {
    count += 1
    const id = `n${count}`
    ids.set(node, id)
    lastId = id
    const note = includeNotes && node.note ? `  — ${oneLine(node.note)}` : ''
    lines.push(`${'  '.repeat(depth)}[${id}] ${oneLine(node.text)}${note}`)
    if (maxDepth > 0 && depth + 1 >= maxDepth) return
    for (const child of node.children) walk(child, depth + 1)
  }

  walk(root, 0)
  return { text: lines.join('\n'), count, ids, lastId }
}

function oneLine(value) {
  return cleanText(value).replace(/\s*\n\s*/g, ' / ')
}

// --------------------------------------------------------------------- apply

export function applyOps(root, ops) {
  if (!Array.isArray(ops) || ops.length === 0) throw new Error('ops-must-be-a-non-empty-array')
  if (ops.length > MAX_OPS) throw new Error(`too-many-ops: at most ${MAX_OPS}`)

  const draft = structuredClone(root)
  const { byId, parent } = indexTree(draft)
  const created = []

  ops.forEach((op, index) => {
    const at = `op ${index + 1}`
    if (!op || typeof op !== 'object') throw new Error(`${at}: operation must be an object`)
    const action = String(op.action ?? '')
    const text = typeof op.text === 'string' ? op.text.trim() : ''
    const id = typeof op.id === 'string' ? op.id : ''
    const parentId = typeof op.parent === 'string' ? op.parent : ''
    const node = id ? byId.get(id) : undefined

    if (action === 'add') {
      const target = byId.get(parentId)
      if (!target) throw new Error(`${at} (add): parent "${parentId}" not found`)
      if (text === '') throw new Error(`${at} (add): text is required`)
      if (text.length > 4000) throw new Error(`${at} (add): text is too long`)
      const child = makeNode(text)
      target.children.push(child)
      created.push(child)
      return
    }

    if (action === 'rename') {
      if (!node) throw new Error(`${at} (rename): node "${id}" not found`)
      if (text === '') throw new Error(`${at} (rename): text is required`)
      if (text.length > 4000) throw new Error(`${at} (rename): text is too long`)
      node.text = cleanText(text)
      return
    }

    if (action === 'remove') {
      if (!node) throw new Error(`${at} (remove): node "${id}" not found`)
      if (node === draft) throw new Error(`${at} (remove): cannot remove the root`)
      const up = parent.get(node)
      if (!up) throw new Error(`${at} (remove): node has no parent`)
      up.children.splice(up.children.indexOf(node), 1)
      return
    }

    if (action === 'move') {
      if (!node) throw new Error(`${at} (move): node "${id}" not found`)
      if (node === draft) throw new Error(`${at} (move): cannot move the root`)
      const target = byId.get(parentId)
      if (!target) throw new Error(`${at} (move): parent "${parentId}" not found`)
      if (target === node || isDescendant(node, target)) {
        throw new Error(`${at} (move): cannot move a node into its own subtree`)
      }
      const up = parent.get(node)
      if (!up) throw new Error(`${at} (move): node has no parent`)
      up.children.splice(up.children.indexOf(node), 1)
      const atIndex = Number.isInteger(op.index)
        ? Math.max(0, Math.min(op.index, target.children.length))
        : target.children.length
      target.children.splice(atIndex, 0, node)
      return
    }

    throw new Error(`${at}: unknown action "${action}"`)
  })

  if (countNodes(draft) > MAX_NODES) throw new Error(`too-many-nodes: at most ${MAX_NODES}`)
  const final = indexTree(draft)
  return {
    root: draft,
    count: final.count,
    created: created
      .map((node) => final.ids.get(node))
      .filter((value) => value !== undefined),
  }
}

function isDescendant(ancestor, node) {
  if (ancestor === node) return true
  return ancestor.children.some((child) => isDescendant(child, node))
}

// ---------------------------------------------------------------- serializing

export function serialize(doc) {
  const sheet = doc.sheets[0]
  if (!sheet) throw new Error('mindmap-has-no-sheets')
  switch (doc.format) {
    case 'mm':
      return serializeMm(sheet.root)
    case 'opml':
      return serializeOpml(sheet)
    case 'km':
      return serializeKm(sheet.root)
    case 'vym':
      return serializeVym(sheet.root)
    default:
      throw new Error(`read-only-format: ${doc.format}`)
  }
}

function serializeMm(root) {
  const out = ['<?xml version="1.0" encoding="UTF-8"?>', '<map version="1.0.1">']
  const write = (node, depth) => {
    const pad = '  '.repeat(depth)
    const attrs = [`TEXT="${escapeAttr(node.text)}"`]
    if (node.side === 'left' || node.side === 'right') attrs.push(`POSITION="${node.side}"`)
    if (node.collapsed) attrs.push('FOLDED="true"')
    if (node.link) attrs.push(`LINK="${escapeAttr(node.link)}"`)
    if (node.children.length === 0 && !node.note) {
      out.push(`${pad}<node ${attrs.join(' ')}/>`)
      return
    }
    out.push(`${pad}<node ${attrs.join(' ')}>`)
    if (node.note) {
      out.push(
        `${pad}  <richcontent TYPE="NOTE"><html><body><p>${escapeText(node.note).replace(/\n/g, '<br/>')}</p></body></html></richcontent>`,
      )
    }
    for (const child of node.children) write(child, depth + 1)
    out.push(`${pad}</node>`)
  }
  write(root, 1)
  out.push('</map>')
  return `${out.join('\n')}\n`
}

function serializeOpml(sheet) {
  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    `  <head><title>${escapeText(sheet.title || 'Mind map')}</title></head>`,
    '  <body>',
  ]
  const write = (node, depth) => {
    const pad = '  '.repeat(depth)
    const attrs = [`text="${escapeAttr(node.text)}"`]
    if (node.note) attrs.push(`_note="${escapeAttr(node.note)}"`)
    if (node.link) attrs.push(`_link="${escapeAttr(node.link)}"`)
    if (node.children.length === 0) {
      out.push(`${pad}<outline ${attrs.join(' ')}/>`)
      return
    }
    out.push(`${pad}<outline ${attrs.join(' ')}>`)
    for (const child of node.children) write(child, depth + 1)
    out.push(`${pad}</outline>`)
  }
  write(sheet.root, 2)
  out.push('  </body>', '</opml>')
  return `${out.join('\n')}\n`
}

function serializeKm(root) {
  const convert = (node) => {
    const data = { text: node.text }
    if (node.note) data.note = node.note
    if (node.link) data.hyperlink = node.link
    if (node.collapsed) data.expandState = 'collapse'
    return {
      data,
      children: node.children.map(convert),
    }
  }
  return `${JSON.stringify({ root: convert(root) }, null, 2)}\n`
}

function serializeVym(root) {
  const out = ['<?xml version="1.0" encoding="UTF-8"?>', '<vymmap>']
  const write = (node, depth) => {
    const pad = '  '.repeat(depth)
    out.push(`${pad}<branch>`)
    out.push(`${pad}  <heading>${escapeText(node.text)}</heading>`)
    if (node.note) {
      out.push(`${pad}  <note><html><body><p>${escapeText(node.note)}</p></body></html></note>`)
    }
    for (const child of node.children) write(child, depth + 1)
    out.push(`${pad}</branch>`)
  }
  write(root, 1)
  out.push('</vymmap>')
  return `${out.join('\n')}\n`
}
