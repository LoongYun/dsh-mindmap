/**
 * Client half of the DSH mind-map bundle.
 *
 * Registers one right-sidebar tab type for `.xmind`, `.mm`, `.opml`, `.km` and
 * `.vym`, reads the file through `ctx.remote.workspaceFiles`, and renders it as
 * an interactive SVG map. The text formats are editable; saving posts to the
 * host route registered by index.js with a Blob download fallback.
 */

window.__ModuleLoader__.load({
  id: '@loongyun/dsh-mindmap',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const NS = 'mindmap'
    const TAB_ID = '@loongyun/dsh-mindmap:viewer'
    const TAB_KIND = '@loongyun/dsh-mindmap:mindmap'
    const ADDRESS_PREFIX = 'dsh-resource://file/'
    const TAB_PATTERN = 'dsh-resource://file/**/*.{xmind,mm,opml,km,vym}'
    const FORMATS = new Set(['xmind', 'mm', 'opml', 'km', 'vym'])
    const EDITABLE = new Set(['mm', 'opml', 'km', 'vym'])
    const GAP_X = 64
    const GAP_Y = 18
    const PAD = 48
    const MAX_LINES = 4
    const NODE_FONT = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'

    const DICTS = {
      zh: {
        loading: '正在读取…',
        error: '无法打开这个文件',
        retry: '重试',
        unsupported: '不支持的思维导图格式',
        readOnly: '只读',
        sheet: '画布',
        zoomIn: '放大',
        zoomOut: '缩小',
        fit: '适应窗口',
        addChild: '添加子主题 (Tab)',
        addSibling: '添加同级主题 (Enter)',
        rename: '重命名 (F2)',
        remove: '删除主题 (Delete)',
        undo: '撤销 (⌘Z)',
        redo: '重做 (⇧⌘Z)',
        collapse: '折叠/展开 (空格)',
        save: '保存 (⌘S)',
        saving: '保存中…',
        saved: '已保存',
        export: '导出为 .mm',
        exported: '已导出 .mm 文件',
        saveFallback: '无法原地保存，已下载修改后的文件',
        saveFailed: '保存失败',
        versionConflict: '文件已在磁盘上变化，请重新打开后再保存',
        dirty: '有未保存的修改',
        newTopic: '新主题',
        rootTopic: '中心主题',
        note: '备注',
        empty: '这个文件里没有可显示的主题',
        stats: '{nodes} 个主题',
        menuAddChild: '新建子主题',
        menuAddSibling: '新建同级主题',
        menuRename: '重命名',
        menuRemove: '删除',
        menuCollapse: '折叠',
        menuExpand: '展开',
      },
      en: {
        loading: 'Reading…',
        error: 'Could not open this file',
        retry: 'Retry',
        unsupported: 'Unsupported mind-map format',
        readOnly: 'Read-only',
        sheet: 'Sheet',
        zoomIn: 'Zoom in',
        zoomOut: 'Zoom out',
        fit: 'Fit to window',
        addChild: 'Add child (Tab)',
        addSibling: 'Add sibling (Enter)',
        rename: 'Rename (F2)',
        remove: 'Delete topic (Delete)',
        undo: 'Undo (⌘Z)',
        redo: 'Redo (⇧⌘Z)',
        collapse: 'Collapse / expand (Space)',
        save: 'Save (⌘S)',
        saving: 'Saving…',
        saved: 'Saved',
        export: 'Export as .mm',
        exported: 'Exported .mm file',
        saveFallback: 'Could not save in place; downloaded the edited file',
        saveFailed: 'Save failed',
        versionConflict: 'The file changed on disk; reopen it before saving',
        dirty: 'Unsaved changes',
        newTopic: 'New topic',
        rootTopic: 'Central topic',
        note: 'Note',
        empty: 'No topics to show in this file',
        stats: '{nodes} topics',
        menuAddChild: 'New child topic',
        menuAddSibling: 'New sibling topic',
        menuRename: 'Rename',
        menuRemove: 'Delete',
        menuCollapse: 'Collapse',
        menuExpand: 'Expand',
      },
    }

    // ---------------------------------------------------------------- address

    function decodeSegment(segment) {
      try {
        return decodeURIComponent(segment)
      } catch {
        return segment
      }
    }

    function parseAddress(address) {
      if (typeof address !== 'string' || !address.startsWith(ADDRESS_PREFIX)) return undefined
      const rest = address.slice(ADDRESS_PREFIX.length)
      const slash = rest.indexOf('/')
      if (slash < 0) return undefined
      const scope = rest.slice(0, slash)
      const tail = rest.slice(slash + 1)
      if (scope === 'session') {
        const split = tail.indexOf('/')
        if (split < 0) return undefined
        return {
          scope,
          sessionId: decodeSegment(tail.slice(0, split)),
          path: tail.slice(split + 1).split('/').map(decodeSegment).join('/'),
        }
      }
      if (scope === 'absolute') {
        return { scope, path: '/' + tail.split('/').map(decodeSegment).join('/') }
      }
      return undefined
    }

    function extensionOf(filePath) {
      const match = /\.([a-z0-9]+)$/i.exec(filePath ?? '')
      return match ? match[1].toLowerCase() : ''
    }

    function baseName(filePath) {
      const parts = String(filePath ?? '').split(/[\\/]/)
      return parts[parts.length - 1] || 'mindmap'
    }

    function stemOf(filePath) {
      const name = baseName(filePath)
      const dot = name.lastIndexOf('.')
      return dot > 0 ? name.slice(0, dot) : name
    }

    // ------------------------------------------------------------------- text

    function cleanText(value) {
      return String(value ?? '')
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .trim()
    }

    function stripHtml(value) {
      const html = String(value ?? '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
      if (!/[<&]/.test(html)) return cleanText(html)
      const doc = new DOMParser().parseFromString(html, 'text/html')
      return cleanText(doc.body?.textContent ?? html)
    }

    function attr(element, ...names) {
      for (const name of names) {
        const value = element.getAttribute(name)
        if (value !== null) return value
      }
      return undefined
    }

    function childrenNamed(element, localName) {
      const out = []
      for (const child of element.children ?? []) {
        if (child.localName === localName) out.push(child)
      }
      return out
    }

    function parseXml(text) {
      const doc = new DOMParser().parseFromString(text, 'application/xml')
      if (!doc || !doc.documentElement) throw new Error('Malformed XML')
      if (doc.getElementsByTagName('parsererror').length > 0) throw new Error('Malformed XML')
      return doc
    }

    let nodeSeq = 0
    function nextId(prefix) {
      nodeSeq += 1
      return `${prefix}-${nodeSeq}`
    }

    function makeNode(text, extra) {
      return Object.assign(
        { id: nextId('n'), text: cleanText(text), note: '', link: '', collapsed: false, children: [] },
        extra ?? {},
      )
    }

    function countNodes(node) {
      let total = 1
      for (const child of node.children) total += countNodes(child)
      return total
    }

    // ---------------------------------------------------------------- parsers

    function parseMm(text) {
      const doc = parseXml(text)
      const map = doc.documentElement
      if (!map || map.localName !== 'map') throw new Error('Not a FreeMind map')
      const rootElement = childrenNamed(map, 'node')[0]
      if (!rootElement) throw new Error('FreeMind map has no root node')

      const readNode = (element, side) => {
        const position = (attr(element, 'POSITION', 'position') ?? '').toLowerCase()
        const nodeSide = position === 'left' ? 'left' : position === 'right' ? 'right' : side
        let label = attr(element, 'TEXT', 'text') ?? ''
        let note = ''
        for (const rich of childrenNamed(element, 'richcontent')) {
          const type = (attr(rich, 'TYPE', 'type') ?? '').toUpperCase()
          if (type === 'NOTE') note = cleanText(rich.textContent)
          else if (!label) label = cleanText(rich.textContent)
        }
        const node = makeNode(label, {
          note,
          link: attr(element, 'LINK', 'link') ?? '',
          side: nodeSide,
          collapsed: (attr(element, 'FOLDED', 'folded') ?? '').toLowerCase() === 'true',
        })
        const id = attr(element, 'ID', 'id')
        if (id) node.id = `mm-${id}`
        node.children = childrenNamed(element, 'node').map((child) => readNode(child, nodeSide))
        return node
      }

      const root = readNode(rootElement, 'right')
      if (!root.text) root.text = 'Mind map'
      return {
        format: 'mm',
        editable: true,
        sheets: [{ title: 'Mind map', root }],
      }
    }

    function parseOpml(text) {
      const doc = parseXml(text)
      const body = doc.getElementsByTagName('body')[0]
      if (!body) throw new Error('OPML has no body')
      const outline = childrenNamed(body, 'outline')[0]
      if (!outline) throw new Error('OPML has no outline')

      const readOutline = (element, side) => {
        const node = makeNode(attr(element, 'text', 'title') ?? '', {
          note: cleanText(attr(element, '_note', 'note') ?? ''),
          link: attr(element, '_link', 'url', 'link') ?? '',
          side,
        })
        const id = attr(element, 'id')
        if (id) node.id = `opml-${id}`
        node.children = childrenNamed(element, 'outline').map((child) => readOutline(child, side))
        return node
      }

      const root = readOutline(outline, undefined)
      if (!root.text) root.text = 'Mind map'
      const head = doc.getElementsByTagName('head')[0]
      const title = head ? cleanText(doc.getElementsByTagName('title')[0]?.textContent ?? '') : ''
      return {
        format: 'opml',
        editable: true,
        sheets: [{ title: title || 'Mind map', root }],
      }
    }

    function parseKm(text) {
      let data
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error('Not a KityMinder JSON file')
      }
      const rawRoot = data?.root ?? data
      if (!rawRoot || typeof rawRoot !== 'object') throw new Error('KityMinder file has no root')

      const readNode = (raw, side) => {
        const label = raw?.data?.text ?? raw?.data?.html ?? raw?.text ?? ''
        const node = makeNode(stripHtml(label), {
          note: stripHtml(raw?.data?.note ?? raw?.note ?? ''),
          link: raw?.data?.hyperlink ?? raw?.data?.link ?? '',
          side,
          collapsed: raw?.data?.expandState === 'collapse' || raw?.collapse === true,
        })
        if (raw?.data?.id) node.id = `km-${raw.data.id}`
        const kids = Array.isArray(raw?.children) ? raw.children : []
        node.children = kids.map((child) => readNode(child, side))
        return node
      }

      const root = readNode(rawRoot, undefined)
      if (!root.text) root.text = 'Mind map'
      return {
        format: 'km',
        editable: true,
        sheets: [{ title: cleanText(data?.title ?? '') || 'Mind map', root }],
      }
    }

    function parseVym(text) {
      const doc = parseXml(text)
      const map = doc.documentElement
      if (!map || map.localName !== 'vymmap') throw new Error('Not a VYM map')
      const firstBranch = childrenNamed(map, 'branch')[0]
      if (!firstBranch) throw new Error('VYM map has no branch')

      const readBranch = (branch, side) => {
        const heading = childrenNamed(branch, 'heading')[0]
        const node = makeNode(cleanText(heading?.textContent ?? ''), { side })
        const note = childrenNamed(branch, 'html')[0] ?? childrenNamed(branch, 'note')[0]
        if (note) node.note = cleanText(note.textContent)
        node.children = childrenNamed(branch, 'branch').map((child) => readBranch(child, side))
        return node
      }

      const root = readBranch(firstBranch, undefined)
      if (!root.text) root.text = 'Mind map'
      return {
        format: 'vym',
        editable: true,
        sheets: [{ title: 'Mind map', root }],
      }
    }

    async function parseXmind(bytes) {
      const files = await readZip(bytes)
      const decoder = new TextDecoder()
      const contentJson = files.get('content.json')
      if (contentJson) {
        const data = JSON.parse(decoder.decode(contentJson))
        const sheets = (data.sheets ?? []).map((sheet) => {
          const topic = sheet.rootTopic ?? sheet.root
          if (!topic) throw new Error('XMind sheet has no root topic')
          return { title: cleanText(sheet.title ?? '') || 'Sheet', root: readXmindTopic(topic) }
        })
        if (sheets.length === 0) throw new Error('XMind file has no sheets')
        return { format: 'xmind', editable: false, sheets }
      }

      const contentXml = files.get('content.xml')
      if (!contentXml) throw new Error('Not an XMind file (content.json / content.xml missing)')
      const doc = parseXml(decoder.decode(contentXml))
      const sheetElements = doc.getElementsByTagName('sheet')
      const sheets = []
      for (const sheet of sheetElements) {
        const topic = childrenNamed(sheet, 'topic')[0]
        if (!topic) continue
        const title = childrenNamed(sheet, 'title')[0]?.textContent
        sheets.push({ title: cleanText(title ?? '') || 'Sheet', root: readXmindXmlTopic(topic) })
      }
      if (sheets.length === 0) throw new Error('XMind file has no topics')
      return { format: 'xmind', editable: false, sheets }
    }

    function readXmindTopic(topic) {
      const node = makeNode(topic.title ?? topic.topic ?? '', {
        note: cleanText(topic.notes?.plain?.content ?? ''),
        link: topic.hyperlink ?? '',
        collapsed: topic.folded === true,
      })
      if (topic.id) node.id = `xm-${topic.id}`
      const children = topic.children
      const attached = Array.isArray(children) ? children : (children?.attached ?? [])
      node.children = attached.map(readXmindTopic)
      return node
    }

    function readXmindXmlTopic(topic) {
      const label = childrenNamed(topic, 'title')[0]?.textContent ?? ''
      const notes = childrenNamed(topic, 'notes')[0]
      const plain = notes ? childrenNamed(notes, 'plain')[0] : undefined
      const node = makeNode(label, {
        note: cleanText(plain?.textContent ?? ''),
        collapsed: (attr(topic, 'folded', 'FOLDED') ?? '').toLowerCase() === 'true',
      })
      if (attr(topic, 'id')) node.id = `xm-${attr(topic, 'id')}`
      const topicsGroups = childrenNamed(topic, 'children').flatMap((group) =>
        childrenNamed(group, 'topics').filter((t) => (attr(t, 'type') ?? 'attached') === 'attached'),
      )
      for (const group of topicsGroups) {
        for (const child of childrenNamed(group, 'topic')) node.children.push(readXmindXmlTopic(child))
      }
      return node
    }

    // -------------------------------------------------------------------- zip

    async function readZip(bytes) {
      const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
      const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
      let eocd = -1
      const floor = Math.max(0, u8.length - 65557)
      for (let i = u8.length - 22; i >= floor; i -= 1) {
        if (view.getUint32(i, true) === 0x06054b50) {
          eocd = i
          break
        }
      }
      if (eocd < 0) throw new Error('Not a zip container')
      const count = view.getUint16(eocd + 10, true)
      let offset = view.getUint32(eocd + 16, true)
      const files = new Map()
      for (let i = 0; i < count; i += 1) {
        if (view.getUint32(offset, true) !== 0x02014b50) break
        const method = view.getUint16(offset + 10, true)
        const compressedSize = view.getUint32(offset + 20, true)
        const nameLength = view.getUint16(offset + 28, true)
        const extraLength = view.getUint16(offset + 30, true)
        const commentLength = view.getUint16(offset + 32, true)
        const localOffset = view.getUint32(offset + 42, true)
        const name = new TextDecoder().decode(u8.subarray(offset + 46, offset + 46 + nameLength))
        offset += 46 + nameLength + extraLength + commentLength
        if (view.getUint32(localOffset, true) !== 0x04034b50) continue
        const localNameLength = view.getUint16(localOffset + 26, true)
        const localExtraLength = view.getUint16(localOffset + 28, true)
        const start = localOffset + 30 + localNameLength + localExtraLength
        const raw = u8.subarray(start, start + compressedSize)
        if (method === 0) files.set(name, raw)
        else if (method === 8) files.set(name, await inflateRaw(raw))
      }
      return files
    }

    async function inflateRaw(data) {
      if (typeof DecompressionStream === 'undefined') {
        throw new Error('This browser cannot decompress .xmind files')
      }
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
      return new Uint8Array(await new Response(stream).arrayBuffer())
    }

    function toBytes(value) {
      if (value instanceof Uint8Array) return value
      if (value instanceof ArrayBuffer) return new Uint8Array(value)
      if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
      if (Array.isArray(value)) return new Uint8Array(value)
      if (value && Array.isArray(value.data)) return new Uint8Array(value.data)
      if (value && typeof value.data === 'string') {
        const raw = atob(value.data)
        const out = new Uint8Array(raw.length)
        for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i)
        return out
      }
      throw new Error('Unsupported byte payload')
    }

    async function parseFile(format, bytes) {
      const text = format === 'xmind' ? '' : new TextDecoder().decode(bytes)
      switch (format) {
        case 'mm':
          return parseMm(text)
        case 'opml':
          return parseOpml(text)
        case 'km':
          return parseKm(text)
        case 'vym':
          return parseVym(text)
        case 'xmind':
          return parseXmind(bytes)
        default:
          throw new Error(`Unsupported format: ${format}`)
      }
    }

    // -------------------------------------------------------------- serializers

    function escapeXml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
    }

    function serializeMm(sheet) {
      const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<map version="1.0.1">']
      const emit = (node, depth) => {
        const attrs = [`TEXT="${escapeXml(node.text)}"`]
        if (depth === 1) attrs.push(`POSITION="${node.side === 'left' ? 'left' : 'right'}"`)
        if (node.collapsed && node.children.length > 0) attrs.push('FOLDED="true"')
        if (node.link) attrs.push(`LINK="${escapeXml(node.link)}"`)
        const hasBody = node.note || node.children.length > 0
        if (!hasBody) {
          lines.push(`<node ${attrs.join(' ')}/>`)
          return
        }
        lines.push(`<node ${attrs.join(' ')}>`)
        if (node.note) {
          lines.push(`<richcontent TYPE="NOTE"><html><body><p>${escapeXml(node.note)}</p></body></html></richcontent>`)
        }
        for (const child of node.children) emit(child, depth + 1)
        lines.push('</node>')
      }
      emit(sheet.root, 1)
      lines.push('</map>')
      return lines.join('\n')
    }

    function serializeOpml(sheet) {
      const lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<opml version="2.0">',
        `  <head><title>${escapeXml(sheet.title ?? sheet.root.text)}</title></head>`,
        '  <body>',
      ]
      const emit = (node, indent) => {
        const attrs = [`text="${escapeXml(node.text)}"`]
        if (node.note) attrs.push(`_note="${escapeXml(node.note)}"`)
        if (node.link) attrs.push(`_link="${escapeXml(node.link)}"`)
        if (node.children.length === 0) {
          lines.push(`${indent}<outline ${attrs.join(' ')}/>`)
          return
        }
        lines.push(`${indent}<outline ${attrs.join(' ')}>`)
        for (const child of node.children) emit(child, indent + '  ')
        lines.push(`${indent}</outline>`)
      }
      emit(sheet.root, '    ')
      lines.push('  </body>', '</opml>')
      return lines.join('\n')
    }

    function serializeKm(sheet) {
      const convert = (node) => {
        const data = { text: node.text }
        if (node.note) data.note = node.note
        if (node.link) data.hyperlink = node.link
        if (node.collapsed) data.expandState = 'collapse'
        const out = { data, children: node.children.map(convert) }
        return out
      }
      return JSON.stringify({ root: convert(sheet.root) }, null, 2)
    }

    function serializeVym(sheet) {
      const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<vymmap version="2.0">']
      const emit = (node, indent) => {
        lines.push(`${indent}<branch>`)
        lines.push(`${indent}  <heading>${escapeXml(node.text)}</heading>`)
        if (node.note) lines.push(`${indent}  <html><body><p>${escapeXml(node.note)}</p></body></html>`)
        for (const child of node.children) emit(child, indent + '  ')
        lines.push(`${indent}</branch>`)
      }
      emit(sheet.root, '  ')
      lines.push('</vymmap>')
      return lines.join('\n')
    }

    const SERIALIZERS = { mm: serializeMm, opml: serializeOpml, km: serializeKm, vym: serializeVym }

    // ------------------------------------------------------------------ layout

    let measureContext
    function measureText(text) {
      if (!measureContext) {
        measureContext = document.createElement('canvas').getContext('2d')
      }
      measureContext.font = NODE_FONT
      return measureContext.measureText(text).width
    }

    function wrapLabel(value) {
      const text = cleanText(value).replace(/\s+/g, ' ') || ' '
      const maxWidth = 240
      if (measureText(text) <= maxWidth) {
        return {
          lines: [text],
          width: Math.min(288, Math.max(112, Math.ceil(measureText(text)) + 30)),
          height: 40,
        }
      }
      const lines = []
      let current = ''
      for (const char of Array.from(text)) {
        const candidate = current + char
        if (current !== '' && measureText(candidate) > maxWidth) {
          lines.push(current)
          current = char
          if (lines.length === MAX_LINES) break
        } else {
          current = candidate
        }
      }
      if (lines.length < MAX_LINES && current) lines.push(current)
      if (lines.length === MAX_LINES) {
        let last = lines[MAX_LINES - 1]
        while (last.length > 1 && measureText(last + '…') > maxWidth) last = last.slice(0, -1)
        lines[MAX_LINES - 1] = last + '…'
      }
      const width = Math.max(112, Math.min(288, Math.ceil(Math.max(...lines.map(measureText))) + 30))
      return { lines, width, height: lines.length * 18 + 22 }
    }

    function measureTree(node) {
      const layout = wrapLabel(node.text)
      node._lines = layout.lines
      node._w = layout.width
      node._h = layout.height
      node._visibleChildren = node.collapsed ? [] : node.children
      let total = 0
      if (node._visibleChildren.length === 0) {
        total = node._h
      } else {
        for (const child of node._visibleChildren) total += measureTree(child) + GAP_Y
        total = Math.max(node._h, total - GAP_Y)
      }
      node._sub = total
      return total
    }

    function collectNodes(node, parent, out) {
      out.push({ node, parent })
      for (const child of node._visibleChildren) collectNodes(child, node, out)
      return out
    }

    function layoutMap(root) {
      measureTree(root)
      const kids = root._visibleChildren
      const explicit = kids.some((kid) => kid.side === 'left' || kid.side === 'right')
      if (!explicit && kids.length > 1) {
        let total = 0
        for (const kid of kids) total += kid._sub + GAP_Y
        let running = 0
        for (const kid of kids) {
          running += kid._sub + GAP_Y
          kid.side = running <= total / 2 + GAP_Y / 2 ? 'left' : 'right'
        }
      }
      root._x = -root._w / 2
      root._y = 0
      root._side = 'right'

      const place = (node, side, parent, cursor) => {
        node._side = side
        node._x = side === 'right' ? parent._x + parent._w + GAP_X : parent._x - GAP_X - node._w
        let y
        if (node._visibleChildren.length === 0) {
          y = cursor + node._h / 2
        } else {
          let running = cursor
          for (const child of node._visibleChildren) {
            place(child, side, node, running)
            running += child._sub + GAP_Y
          }
          y = (node._visibleChildren[0]._y + node._visibleChildren[node._visibleChildren.length - 1]._y) / 2
        }
        node._y = y
      }

      for (const side of ['left', 'right']) {
        const sideKids = kids.filter((kid) => (kid.side === 'left' ? 'left' : 'right') === side)
        let total = 0
        for (const kid of sideKids) total += kid._sub + GAP_Y
        total = Math.max(0, total - GAP_Y)
        let cursor = -total / 2
        for (const kid of sideKids) {
          place(kid, side, root, cursor)
          cursor += kid._sub + GAP_Y
        }
      }

      const entries = collectNodes(root, undefined, [])
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const { node } of entries) {
        minX = Math.min(minX, node._x)
        minY = Math.min(minY, node._y - node._h / 2)
        maxX = Math.max(maxX, node._x + node._w)
        maxY = Math.max(maxY, node._y + node._h / 2)
      }
      const shiftX = PAD - minX
      const shiftY = PAD - minY
      for (const { node } of entries) {
        node._x += shiftX
        node._y += shiftY
      }
      return {
        root,
        entries,
        width: maxX - minX + PAD * 2,
        height: maxY - minY + PAD * 2,
        byId: new Map(entries.map((entry) => [entry.node.id, entry])),
        count: entries.length,
      }
    }

    // ---------------------------------------------------------------- component

    const STYLES = `
.mm-root { position: relative; display: flex; flex-direction: column; height: 100%; min-height: 0; color: var(--mm-text, inherit); }
.mm-toolbar { display: flex; align-items: center; gap: 4px; padding: 6px 8px; flex-wrap: wrap; border-bottom: 1px solid var(--mm-line, rgba(127,127,127,.18)); }
.mm-btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border: 0; border-radius: 7px; background: transparent; color: inherit; cursor: pointer; opacity: .82; }
.mm-btn:hover:not(:disabled) { background: var(--mm-hover, rgba(127,127,127,.16)); opacity: 1; }
.mm-btn:disabled { opacity: .32; cursor: default; }
.mm-btn[data-active="true"] { background: var(--mm-hover, rgba(127,127,127,.16)); }
.mm-sep { width: 1px; height: 18px; background: var(--mm-line, rgba(127,127,127,.22)); margin: 0 4px; }
.mm-spacer { flex: 1; }
.mm-select { height: 28px; max-width: 170px; border: 1px solid var(--mm-line, rgba(127,127,127,.28)); border-radius: 7px; background: var(--mm-surface, transparent); color: inherit; font: inherit; font-size: 12px; }
.mm-badge { font-size: 11px; opacity: .62; white-space: nowrap; }
.mm-dirty { width: 6px; height: 6px; border-radius: 50%; background: #f59e0b; }
.mm-stage { position: relative; flex: 1; min-height: 0; overflow: hidden; outline: none; cursor: grab; }
.mm-stage[data-dragging="true"] { cursor: grabbing; }
.mm-stage svg { display: block; width: 100%; height: 100%; user-select: none; }
.mm-edge { fill: none; stroke: currentColor; stroke-width: 1.4; opacity: .32; }
.mm-node { fill: var(--mm-node, rgba(127,127,127,.12)); stroke: var(--mm-node-stroke, rgba(127,127,127,.34)); stroke-width: 1; }
.mm-node-root { fill: var(--mm-node-root, rgba(94,234,212,.18)); stroke: var(--mm-node-root-stroke, rgba(45,212,191,.7)); }
.mm-node-sel { stroke: #3b82f6; stroke-width: 2; fill: rgba(59,130,246,.16); }
.mm-label { fill: currentColor; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; pointer-events: none; }
.mm-toggle { fill: var(--mm-toggle, rgba(127,127,127,.9)); stroke: var(--mm-surface, transparent); stroke-width: 2; cursor: pointer; }
.mm-toggle-text { fill: #fff; font: 600 9px -apple-system, sans-serif; pointer-events: none; }
.mm-input { position: absolute; box-sizing: border-box; padding: 6px 10px; border: 2px solid #3b82f6; border-radius: 9px; background: var(--mm-input, #fff); color: #111827; outline: none; font-family: inherit; z-index: 3; }
.mm-status { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); max-width: 90%; padding: 6px 12px; border-radius: 8px; background: rgba(17,24,39,.9); color: #f9fafb; font-size: 12px; z-index: 4; pointer-events: none; }
.mm-center { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; height: 100%; padding: 24px; text-align: center; font-size: 13px; opacity: .8; }
.mm-center strong { font-size: 14px; opacity: 1; }
.mm-center pre { max-width: 100%; overflow: auto; font-size: 11px; text-align: left; opacity: .7; }
.mm-menu { position: fixed; z-index: 20; min-width: 172px; padding: 5px; border-radius: 9px; background: rgba(24,24,27,.97); color: #f4f4f5; border: 1px solid rgba(255,255,255,.12); box-shadow: 0 10px 30px rgba(0,0,0,.35); backdrop-filter: blur(10px); }
.mm-menu-item { display: flex; align-items: center; width: 100%; padding: 7px 10px; border: 0; border-radius: 6px; background: transparent; color: inherit; font: inherit; font-size: 12.5px; text-align: left; cursor: pointer; }
.mm-menu-item:hover:not(:disabled) { background: rgba(255,255,255,.1); }
.mm-menu-item:disabled { opacity: .35; cursor: default; }
.mm-menu-sep { height: 1px; margin: 4px 6px; background: rgba(255,255,255,.12); }
.mm-link { opacity: .85; }
`

    function Icon({ name, size }) {
      const common = {
        width: size ?? 16,
        height: size ?? 16,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
      }
      switch (name) {
        case 'save':
          return h('svg', common, h('path', { d: 'M5 4h11l3 3v13H5zM8 4v6h8V4M8 20v-6h8v6' }))
        case 'download':
          return h('svg', common, h('path', { d: 'M12 4v11M7 10l5 5 5-5M4 20h16' }))
        case 'undo':
          return h('svg', common, h('path', { d: 'M9 7H5v4M5 11c2-5 7-6 11-3 3 2 4 6 2 9' }))
        case 'redo':
          return h('svg', common, h('path', { d: 'M15 7h4v4M19 11c-2-5-7-6-11-3-3 2-4 6-2 9' }))
        case 'fit':
          return h('svg', common, h('path', { d: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5' }))
        case 'zoomIn':
          return h('svg', common, h('circle', { cx: 10.5, cy: 10.5, r: 6.5 }), h('path', { d: 'M15.5 15.5L21 21M10.5 7.5v6M7.5 10.5h6' }))
        case 'zoomOut':
          return h('svg', common, h('circle', { cx: 10.5, cy: 10.5, r: 6.5 }), h('path', { d: 'M15.5 15.5L21 21M7.5 10.5h6' }))
        default:
          return null
      }
    }

    function MindMapView(props) {
      const { ctx, useTabInfo } = props
      const { tab } = useTabInfo()
      const t = useMemo(() => ctx.locale.bind(NS), [ctx])
      const address = tab.contentId ?? tab.navigation?.address
      const [state, setState] = useState({ status: 'loading' })
      const [reloadKey, setReloadKey] = useState(0)
      const [doc, setDoc] = useState(undefined)
      const [version, setVersion] = useState(undefined)
      const [active, setActive] = useState(0)
      const [dirty, setDirty] = useState(false)
      const [history, setHistory] = useState({ past: [], future: [] })
      const [selected, setSelected] = useState(undefined)
      const [editing, setEditing] = useState(undefined)
      const [menu, setMenu] = useState(undefined)
      const [view, setView] = useState({ x: 0, y: 0, k: 1 })
      const [toast, setToast] = useState('')
      const [saving, setSaving] = useState(false)
      const [needsFit, setNeedsFit] = useState(true)
      const [size, setSize] = useState({ width: 800, height: 600 })
      const stageRef = useRef(null)
      const dragRef = useRef(undefined)
      const toastTimer = useRef(undefined)

      const say = useCallback(
        (message) => {
          setToast(message)
          if (toastTimer.current !== undefined) clearTimeout(toastTimer.current)
          toastTimer.current = setTimeout(() => setToast(''), 2600)
        },
        [setToast],
      )

      useEffect(
        () => () => {
          if (toastTimer.current !== undefined) clearTimeout(toastTimer.current)
        },
        [],
      )

      useEffect(() => {
        const parsed = parseAddress(address)
        if (!parsed || parsed.scope !== 'session') {
          setState({ status: 'error', message: t('unsupported') })
          return undefined
        }
        const controller = new AbortController()
        let alive = true
        setState({ status: 'loading' })
        ;(async () => {
          try {
            const outcome = await ctx.remote.workspaceFiles.readBytes(parsed.sessionId, parsed.path, {}, controller.signal)
            if (!outcome || outcome.ok === false) {
              throw new Error(outcome?.error?.message ?? t('error'))
            }
            const result = outcome.value ?? outcome
            const bytes = toBytes(result.data)
            const format = extensionOf(parsed.path)
            if (!FORMATS.has(format)) throw new Error(t('unsupported'))
            const parsedDoc = await parseFile(format, bytes)
            if (!alive) return
            setDoc({ ...parsedDoc, path: parsed.path, sessionId: parsed.sessionId })
            setVersion(result.version)
            setActive(0)
            setDirty(false)
            setHistory({ past: [], future: [] })
            setSelected(parsedDoc.sheets[0]?.root?.id)
            setNeedsFit(true)
            setState({ status: 'ready' })
          } catch (error) {
            if (!alive || controller.signal.aborted) return
            setState({ status: 'error', message: String(error?.message ?? error) })
          }
        })()
        return () => {
          alive = false
          controller.abort()
        }
      }, [address, reloadKey, ctx, t])

      useEffect(() => {
        if (!dirty) return undefined
        const guard = (event) => {
          event.preventDefault()
          event.returnValue = ''
        }
        window.addEventListener('beforeunload', guard)
        return () => window.removeEventListener('beforeunload', guard)
      }, [dirty])

      const sheet = doc?.sheets?.[active]
      const layout = useMemo(() => (sheet ? layoutMap(sheet.root) : undefined), [sheet])

      const fit = useCallback(() => {
        const stage = stageRef.current
        if (!stage || !layout) return
        const width = stage.clientWidth
        const height = stage.clientHeight
        const k = Math.max(0.16, Math.min(1.25, Math.min((width - 32) / layout.width, (height - 32) / layout.height)))
        setView({ k, x: width / 2 - (layout.width / 2) * k, y: height / 2 - (layout.height / 2) * k })
      }, [layout])

      const zoomCenter = useCallback((factor) => {
        const stage = stageRef.current
        if (!stage) return
        const px = stage.clientWidth / 2
        const py = stage.clientHeight / 2
        setView((v) => {
          const k = Math.max(0.16, Math.min(3, v.k * factor))
          return { k, x: px - ((px - v.x) / v.k) * k, y: py - ((py - v.y) / v.k) * k }
        })
      }, [])

      useEffect(() => {
        if (needsFit && layout) {
          setNeedsFit(false)
          fit()
        }
      }, [needsFit, layout, fit])

      useEffect(() => {
        const stage = stageRef.current
        if (!stage) return undefined
        const update = () => setSize({ width: stage.clientWidth || 800, height: stage.clientHeight || 600 })
        update()
        const observer = new ResizeObserver(update)
        observer.observe(stage)
        return () => observer.disconnect()
      }, [state.status])

      useEffect(() => {
        const stage = stageRef.current
        if (!stage) return undefined
        const onWheel = (event) => {
          event.preventDefault()
          if (event.ctrlKey || event.metaKey) {
            const rect = stage.getBoundingClientRect()
            const px = event.clientX - rect.left
            const py = event.clientY - rect.top
            setView((current) => {
              const next = Math.max(0.16, Math.min(3, current.k * Math.exp(-event.deltaY * 0.002)))
              return { k: next, x: px - ((px - current.x) / current.k) * next, y: py - ((py - current.y) / current.k) * next }
            })
            return
          }
          const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1
          setView((current) => ({ ...current, x: current.x - event.deltaX * unit, y: current.y - event.deltaY * unit }))
        }
        stage.addEventListener('wheel', onWheel, { passive: false })
        return () => stage.removeEventListener('wheel', onWheel)
      }, [state.status])

      useEffect(() => {
        if (!menu) return undefined
        const close = () => setMenu(undefined)
        const onKey = (event) => {
          if (event.key === 'Escape') setMenu(undefined)
        }
        document.addEventListener('pointerdown', close)
        document.addEventListener('keydown', onKey, true)
        return () => {
          document.removeEventListener('pointerdown', close)
          document.removeEventListener('keydown', onKey, true)
        }
      }, [menu])

      const commit = useCallback(
        (nextSheets, nextSelected) => {
          setHistory((current) => ({ past: [...current.past.slice(-49), doc.sheets], future: [] }))
          setDoc((current) => ({ ...current, sheets: nextSheets }))
          setDirty(true)
          if (nextSelected !== undefined) setSelected(nextSelected)
        },
        [doc],
      )

      const mutateNode = useCallback(
        (id, change) => {
          if (!doc) return undefined
          const sheets = doc.sheets.map((item, index) => {
            if (index !== active) return item
            const root = structuredClone(item.root)
            const target = findNode(root, id)
            if (!target) return item
            change(target)
            return { ...item, root }
          })
          return sheets
        },
        [doc, active],
      )

      const findParent = useCallback((root, id) => {
        for (const child of root.children) {
          if (child.id === id) return root
          const found = findParent(child, id)
          if (found) return found
        }
        return undefined
      }, [])

      const addChild = useCallback(() => {
        if (!doc || !EDITABLE.has(doc.format)) return
        const targetId = selected ?? doc.sheets[active].root.id
        const node = makeNode(t('newTopic'), { side: 'right' })
        const sheets = mutateNode(targetId, (target) => {
          target.collapsed = false
          target.children.push(node)
        })
        if (sheets) {
          commit(sheets, node.id)
          setEditing({ id: node.id, value: node.text })
        }
      }, [doc, selected, active, mutateNode, commit, t])

      const addSibling = useCallback(() => {
        if (!doc || !EDITABLE.has(doc.format)) return
        const root = doc.sheets[active].root
        if (!selected || selected === root.id) {
          addChild()
          return
        }
        const parent = findParent(root, selected)
        if (!parent) return
        const index = parent.children.findIndex((child) => child.id === selected)
        const node = makeNode(t('newTopic'), { side: parent.children[index]?.side ?? 'right' })
        const sheets = mutateNode(parent.id, (target) => {
          target.children.splice(index + 1, 0, node)
        })
        if (sheets) {
          commit(sheets, node.id)
          setEditing({ id: node.id, value: node.text })
        }
      }, [doc, selected, active, findParent, mutateNode, commit, t, addChild])

      const removeSelected = useCallback(() => {
        if (!doc || !EDITABLE.has(doc.format)) return
        const root = doc.sheets[active].root
        if (!selected || selected === root.id) return
        const parent = findParent(root, selected)
        if (!parent) return
        const sheets = mutateNode(parent.id, (target) => {
          target.children = target.children.filter((child) => child.id !== selected)
        })
        if (sheets) commit(sheets, parent.id)
      }, [doc, selected, active, findParent, mutateNode, commit])

      const toggleCollapse = useCallback(() => {
        if (!selected) return
        const sheets = mutateNode(selected, (target) => {
          target.collapsed = !target.collapsed
        })
        if (sheets) commit(sheets)
      }, [selected, mutateNode, commit])

      const startRename = useCallback(() => {
        if (!doc || !EDITABLE.has(doc.format) || !selected) return
        const entry = layout?.byId.get(selected)
        if (entry) setEditing({ id: selected, value: entry.node.text })
      }, [doc, selected, layout])

      const applyText = useCallback(
        (id, value) => {
          if (!doc) return
          const text = cleanText(value)
          const sheets = mutateNode(id, (target) => {
            target.text = text || (target.children.length > 0 ? target.text : ' ')
          })
          if (sheets) commit(sheets)
          setEditing(undefined)
        },
        [doc, mutateNode, commit],
      )

      const undo = useCallback(() => {
        if (history.past.length === 0 || !doc) return
        const previous = history.past[history.past.length - 1]
        setDoc({ ...doc, sheets: previous })
        setHistory({ past: history.past.slice(0, -1), future: [doc.sheets, ...history.future].slice(0, 50) })
        setDirty(true)
      }, [history, doc])

      const redo = useCallback(() => {
        if (history.future.length === 0 || !doc) return
        const next = history.future[0]
        setDoc({ ...doc, sheets: next })
        setHistory({ past: [...history.past, doc.sheets].slice(-50), future: history.future.slice(1) })
        setDirty(true)
      }, [history, doc])

      const download = useCallback((content, filename, mime) => {
        const blob = new Blob([content], { type: mime })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = filename
        link.rel = 'noopener'
        document.body.appendChild(link)
        link.click()
        link.remove()
        setTimeout(() => URL.revokeObjectURL(url), 2000)
      }, [])

      const serializeCurrent = useCallback(() => {
        if (!doc) return undefined
        const serializer = SERIALIZERS[doc.format]
        if (!serializer) return undefined
        return serializer(doc.sheets[active])
      }, [doc, active])

      const exportMm = useCallback(() => {
        if (!doc) return
        download(serializeMm(doc.sheets[active]), `${stemOf(doc.path)}.mm`, 'application/xml')
        say(t('exported'))
      }, [doc, active, download, say, t])

      const save = useCallback(async () => {
        if (!doc || !EDITABLE.has(doc.format) || saving) return
        const content = serializeCurrent()
        if (content === undefined) return
        setSaving(true)
        let response
        try {
          response = await fetch('/dsh-mindmap/save', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId: doc.sessionId, path: doc.path, content, baseVersion: version }),
          })
        } catch {
          download(content, baseName(doc.path), 'application/xml')
          say(t('saveFallback'))
          setSaving(false)
          return
        }
        try {
          if (response.status === 409) {
            say(t('versionConflict'))
            return
          }
          if (!response.ok) {
            const payload = await response.json().catch(() => ({}))
            if (response.status === 404 || response.status === 405 || response.status >= 500) {
              download(content, baseName(doc.path), 'application/xml')
              say(t('saveFallback'))
            } else {
              say(`${t('saveFailed')} — ${payload.error ?? response.status}`)
            }
            return
          }
          const payload = await response.json().catch(() => ({}))
          if (typeof payload.version === 'string') setVersion(payload.version)
          setDirty(false)
          say(t('saved'))
        } finally {
          setSaving(false)
        }
      }, [doc, saving, serializeCurrent, version, download, say, t])

      const onKeyDown = useCallback(
        (event) => {
          if (editing !== undefined) return
          const mod = event.metaKey || event.ctrlKey
          const key = event.key
          if (mod && key.toLowerCase() === 's') {
            event.preventDefault()
            save()
            return
          }
          if (mod && key.toLowerCase() === 'z') {
            event.preventDefault()
            if (event.shiftKey) redo()
            else undo()
            return
          }
          if (mod) return
          if (key === 'Tab') {
            event.preventDefault()
            addChild()
          } else if (key === 'Enter') {
            event.preventDefault()
            addSibling()
          } else if (key === 'F2') {
            event.preventDefault()
            startRename()
          } else if (key === 'Delete' || key === 'Backspace') {
            event.preventDefault()
            removeSelected()
          } else if (key === ' ') {
            event.preventDefault()
            toggleCollapse()
          }
        },
        [editing, save, redo, undo, addChild, addSibling, startRename, removeSelected, toggleCollapse],
      )

      const onPointerDown = (event) => {
        if (event.button !== 0) return
        if (event.target.closest?.('[data-mm-node]')) return
        dragRef.current = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y }
        event.currentTarget.setPointerCapture?.(event.pointerId)
        event.currentTarget.dataset.dragging = 'true'
      }
      const onPointerMove = (event) => {
        const drag = dragRef.current
        if (!drag) return
        setView((current) => ({ ...current, x: drag.vx + event.clientX - drag.x, y: drag.vy + event.clientY - drag.y }))
      }
      const endDrag = (event) => {
        if (!dragRef.current) return
        dragRef.current = undefined
        if (event?.currentTarget) event.currentTarget.dataset.dragging = 'false'
      }

      if (state.status === 'loading') {
        return h('div', { className: 'mm-root' }, h('style', null, STYLES), h('div', { className: 'mm-center' }, h('span', null, t('loading'))))
      }
      if (state.status === 'error') {
        return h(
          'div',
          { className: 'mm-root' },
          h('style', null, STYLES),
          h(
            'div',
            { className: 'mm-center' },
            h('strong', null, t('error')),
            h('span', null, state.message),
            h(
              'button',
              { className: 'mm-btn', style: { width: 'auto', padding: '0 12px', height: 30, border: '1px solid currentColor' }, onClick: () => setReloadKey((n) => n + 1) },
              t('retry'),
            ),
          ),
        )
      }
      if (!doc || !sheet || !layout) {
        return h('div', { className: 'mm-root' }, h('style', null, STYLES), h('div', { className: 'mm-center' }, t('empty')))
      }

      const editable = EDITABLE.has(doc.format)
      const editingEntry = editing ? layout.byId.get(editing.id) : undefined
      const inputStyle =
        editingEntry && editing
          ? {
              left: view.x + editingEntry.node._x * view.k,
              top: view.y + (editingEntry.node._y - editingEntry.node._h / 2) * view.k,
              width: Math.max(140, editingEntry.node._w * view.k + 24),
              height: Math.max(30, editingEntry.node._h * view.k),
              fontSize: Math.max(11, 13 * view.k),
            }
          : undefined

      return h(
        'div',
        { className: 'mm-root' },
        h('style', null, STYLES),
        h(
          'div',
          { className: 'mm-toolbar' },
          editable &&
            h(
              React.Fragment,
              null,
              h('button', { className: 'mm-btn', title: t('undo'), 'aria-label': t('undo'), onClick: undo, disabled: history.past.length === 0 }, h(Icon, { name: 'undo' })),
              h('button', { className: 'mm-btn', title: t('redo'), 'aria-label': t('redo'), onClick: redo, disabled: history.future.length === 0 }, h(Icon, { name: 'redo' })),
              h('span', { className: 'mm-sep' }),
            ),
          h('button', { className: 'mm-btn', title: t('zoomOut'), 'aria-label': t('zoomOut'), onClick: () => zoomCenter(1 / 1.2) }, h(Icon, { name: 'zoomOut' })),
          h('button', { className: 'mm-btn', title: t('zoomIn'), 'aria-label': t('zoomIn'), onClick: () => zoomCenter(1.2) }, h(Icon, { name: 'zoomIn' })),
          h('button', { className: 'mm-btn', title: t('fit'), 'aria-label': t('fit'), onClick: fit }, h(Icon, { name: 'fit' })),
          doc.sheets.length > 1 &&
            h(
              'select',
              {
                className: 'mm-select',
                value: active,
                title: t('sheet'),
                onChange: (event) => {
                  setActive(Number(event.target.value))
                  setSelected(undefined)
                  setNeedsFit(true)
                },
              },
              doc.sheets.map((item, index) => h('option', { key: index, value: index }, item.title || `Sheet ${index + 1}`)),
            ),
          h('span', { className: 'mm-spacer' }),
          h('span', { className: 'mm-badge' }, t('stats').replace('{nodes}', String(countNodes(sheet.root)))),
          !editable && h('span', { className: 'mm-badge' }, t('readOnly')),
          dirty && h('span', { className: 'mm-dirty', title: t('dirty') }),
          editable &&
            h(
              'button',
              { className: 'mm-btn', title: t('save'), 'aria-label': t('save'), onClick: save, disabled: saving || !dirty },
              h(Icon, { name: 'save' }),
            ),
          h('button', { className: 'mm-btn', title: t('export'), 'aria-label': t('export'), onClick: exportMm }, h(Icon, { name: 'download' })),
        ),
        h(
          'div',
          {
            className: 'mm-stage',
            ref: stageRef,
            tabIndex: 0,
            onKeyDown,
            onPointerDown,
            onPointerMove,
            onPointerUp: endDrag,
            onPointerCancel: endDrag,
            'data-mm-stage': true,
          },
          h(
            'svg',
            { viewBox: `0 0 ${size.width} ${size.height}`, preserveAspectRatio: 'none' },
            h(
              'g',
              { transform: `translate(${view.x},${view.y}) scale(${view.k})` },
              layout.entries.map(({ node, parent }) => {
                if (!parent) return null
                const p = parent
                const right = (node._side ?? node.side ?? 'right') !== 'left'
                const px = right ? p._x + p._w : p._x
                const cx = right ? node._x : node._x + node._w
                const py = p._y
                const cy = node._y
                const mid = (px + cx) / 2
                return h('path', {
                  key: `e-${node.id}`,
                  className: 'mm-edge',
                  d: `M ${px} ${py} C ${mid} ${py}, ${mid} ${cy}, ${cx} ${cy}`,
                })
              }),
              layout.entries.map(({ node }) => {
                const isRoot = node === sheet.root
                const cls = `mm-node${isRoot ? ' mm-node-root' : ''}${selected === node.id ? ' mm-node-sel' : ''}`
                const textX = 14
                const textY = node._h / 2 - ((node._lines.length - 1) * 18) / 2 + 5
                return h(
                  'g',
                  {
                    key: node.id,
                    'data-mm-node': node.id,
                    transform: `translate(${node._x},${node._y - node._h / 2})`,
                    onClick: (event) => {
                      event.stopPropagation()
                      setSelected(node.id)
                    },
                    onDoubleClick: (event) => {
                      event.stopPropagation()
                      if (editable) setEditing({ id: node.id, value: node.text })
                    },
                    onContextMenu: (event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      setSelected(node.id)
                      setMenu({ x: event.clientX, y: event.clientY, id: node.id })
                    },
                  },
                  h('rect', { className: cls, width: node._w, height: node._h, rx: isRoot ? 12 : 10 }),
                  node._lines.map((line, index) =>
                    h(
                      'text',
                      {
                        key: index,
                        className: 'mm-label',
                        x: textX,
                        y: textY + index * 18,
                        fontSize: isRoot ? 13.5 : 13,
                        fontWeight: isRoot ? 600 : 400,
                      },
                      line,
                    ),
                  ),
                  node.note ? h('circle', { cx: node._w - 9, cy: node._h - 9, r: 3, className: 'mm-node', fill: 'currentColor', opacity: 0.5 }) : null,
                  node.children.length > 0
                    ? h(
                        'g',
                        {
                          className: 'mm-toggle',
                          transform: `translate(${node._w},${node._h / 2})`,
                          onClick: (event) => {
                            event.stopPropagation()
                            setSelected(node.id)
                            const sheets = mutateNode(node.id, (target) => {
                              target.collapsed = !target.collapsed
                            })
                            if (sheets) commit(sheets)
                          },
                        },
                        h('circle', { r: 8, className: 'mm-toggle' }),
                        h(
                          'text',
                          { className: 'mm-toggle-text', x: 0, y: 3.5, textAnchor: 'middle' },
                          node.collapsed ? `+${countNodes({ children: node.children })}` : '−',
                        ),
                      )
                    : null,
                )
              }),
            ),
          ),
          editing && inputStyle
            ? h('input', {
                className: 'mm-input',
                style: inputStyle,
                autoFocus: true,
                ref: (el) => {
                  if (el && el.dataset.mmSelected !== '1') {
                    el.dataset.mmSelected = '1'
                    el.select()
                  }
                },
                value: editing.value,
                onChange: (event) => setEditing({ ...editing, value: event.target.value }),
                onBlur: () => applyText(editing.id, editing.value),
                onKeyDown: (event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    event.currentTarget.blur()
                  } else if (event.key === 'Escape') {
                    event.preventDefault()
                    setEditing(undefined)
                  }
                },
              })
            : null,
          menu
            ? (() => {
                const menuNode = layout.byId.get(menu.id)?.node
                const atRoot = menu.id === sheet.root.id
                const left = Math.max(8, Math.min(menu.x, (window.innerWidth || 1200) - 190))
                const top = Math.max(8, Math.min(menu.y, (window.innerHeight || 800) - 230))
                const item = (label, action, disabled) =>
                  h(
                    'button',
                    {
                      type: 'button',
                      role: 'menuitem',
                      className: 'mm-menu-item',
                      disabled: !!disabled,
                      onClick: () => {
                        setMenu(undefined)
                        action()
                      },
                    },
                    label,
                  )
                return h(
                  'div',
                  {
                    className: 'mm-menu',
                    role: 'menu',
                    style: { left, top },
                    onPointerDown: (event) => event.stopPropagation(),
                    onContextMenu: (event) => event.preventDefault(),
                  },
                  item(t('menuAddChild'), addChild, !editable),
                  item(t('menuAddSibling'), addSibling, !editable || atRoot),
                  h('div', { className: 'mm-menu-sep' }),
                  item(t('menuRename'), startRename, !editable),
                  item(menuNode?.collapsed ? t('menuExpand') : t('menuCollapse'), toggleCollapse),
                  h('div', { className: 'mm-menu-sep' }),
                  item(t('menuRemove'), removeSelected, !editable || atRoot),
                )
              })()
            : null,
          toast ? h('div', { className: 'mm-status' }, toast) : null,
        ),
      )
    }

    function findNode(root, id) {
      if (root.id === id) return root
      for (const child of root.children) {
        const found = findNode(child, id)
        if (found) return found
      }
      return undefined
    }

    return {
      inject: ['sidebarRightTabs', 'slots', 'remote', 'remote.workspaceFiles', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICTS), 'dsh-mindmap: dictionaries')
        ctx.effect(
          () =>
            ctx.sidebarRightTabs.register({
              id: TAB_ID,
              kind: TAB_KIND,
              patterns: [TAB_PATTERN],
              priority: 'extension',
              title: (address) => baseName(parseAddress(address)?.path ?? address),
              canOpen: (address) => FORMATS.has(extensionOf(parseAddress(address)?.path ?? '')),
            }),
          'dsh-mindmap: tab type',
        )
        ctx.slots.inject('sidebar.right.pane.tab', () =>
          ctx.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID }, (props) => h(MindMapView, { ...props, ctx })),
        )
      },
    }
  },
})
