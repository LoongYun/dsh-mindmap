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
    const { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } = React

    const NS = 'mindmap'
    const TAB_ID = '@loongyun/dsh-mindmap:viewer'
    const TAB_KIND = '@loongyun/dsh-mindmap:mindmap'
    const ADDRESS_PREFIX = 'dsh-resource://file/'
    const TAB_PATTERN = 'dsh-resource://file/**/*.{xmind,mm,opml,km,vym}'
    const FORMATS = new Set(['xmind', 'mm', 'opml', 'km', 'vym'])
    const EDITABLE = new Set(['mm', 'opml', 'km', 'vym'])
    const GAP_X = 64
    const GAP_Y = 18
    const DOWN_GAP_X = 24
    const DOWN_GAP_Y = 56
    const PAD = 48
    const MAX_LINES = 4
    const MAX_NODES = 20000
    const LARGE_MAP_NODES = 4000
    const MAX_TEXT_BYTES = 8 * 1024 * 1024
    const MAX_ZIP_ENTRY_BYTES = 24 * 1024 * 1024
    const MAX_ZIP_TOTAL_BYTES = 32 * 1024 * 1024
    const MAX_ZIP_ENTRIES = 4096
    const NODE_FONT = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'

    const DICTS = {
      zh: {
        loading: '正在读取…',
        error: '无法打开这个文件',
        retry: '重试',
        unsupported: '不支持的思维导图格式',
        readOnly: '只读',
        sheet: '画布',
        structure: '结构',
        structureRight: '向右',
        structureBalanced: '双向',
        structureDown: '向下',
        structureLeft: '向左',
        branch: '分支线',
        branchCurve: '曲线',
        branchStraight: '直线',
        branchElbow: '折线',
        format: '格式',
        resetZoom: '恢复 100%',
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
        convert: '转为可编辑 .mm',
        convertExists: '「{name}」已存在，要覆盖它吗？',
        convertConflict: '目标文件已在磁盘上变化，请重试',
        converted: '已生成 {name}，可在新标签页中编辑',
        convertFailed: '转换失败',
        saveFallback: '无法原地保存，已下载修改后的文件',
        saveFailed: '保存失败',
        versionConflict: '文件已在磁盘上变化，请重新打开后再保存',
        dirty: '有未保存的修改',
        unsaved: '未保存',
        newTopic: '新主题',
        rootTopic: '中心主题',
        note: '备注',
        empty: '这个文件里没有可显示的主题',
        stats: '{nodes} 个主题',
        tooManyNodes: '这个文件有 {count} 个主题，超过 {limit} 个的处理上限，已停止加载',
        fileTooLarge: '文件过大（超过 8 MB），暂不支持打开',
        largeMap: '大图模式：{count} 个主题，交互仍可能变慢',
        menuAddChild: '新建子主题',
        menuAddSibling: '新建同级主题',
        menuRename: '重命名',
        menuRemove: '删除',
        menuCollapse: '折叠',
        menuExpand: '展开',
        collapseAll: '全部折叠',
        expandAll: '全部展开',
        toEnglish: 'Switch to English',
        toChinese: '切换到中文',
      },
      en: {
        loading: 'Reading…',
        error: 'Could not open this file',
        retry: 'Retry',
        unsupported: 'Unsupported mind-map format',
        readOnly: 'Read-only',
        sheet: 'Sheet',
        structure: 'Structure',
        structureRight: 'Right',
        structureBalanced: 'Balanced',
        structureDown: 'Down',
        structureLeft: 'Left',
        branch: 'Branch line',
        branchCurve: 'Curved',
        branchStraight: 'Straight',
        branchElbow: 'Elbow',
        format: 'Format',
        resetZoom: 'Reset to 100%',
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
        convert: 'Convert to editable .mm',
        convertExists: '“{name}” already exists. Overwrite it?',
        convertConflict: 'The target file changed on disk; please retry',
        converted: 'Created {name}; opening it for editing',
        convertFailed: 'Conversion failed',
        saveFallback: 'Could not save in place; downloaded the edited file',
        saveFailed: 'Save failed',
        versionConflict: 'The file changed on disk; reopen it before saving',
        dirty: 'Unsaved changes',
        unsaved: 'Unsaved',
        newTopic: 'New topic',
        rootTopic: 'Central topic',
        note: 'Note',
        empty: 'No topics to show in this file',
        stats: '{nodes} topics',
        tooManyNodes: 'This file has {count} topics, above the {limit}-topic limit',
        fileTooLarge: 'This file is larger than the 8 MB text limit',
        largeMap: 'Large map: {count} topics; interaction may still be slow',
        menuAddChild: 'New child topic',
        menuAddSibling: 'New sibling topic',
        menuRename: 'Rename',
        menuRemove: 'Delete',
        menuCollapse: 'Collapse',
        menuExpand: 'Expand',
        collapseAll: 'Collapse all',
        expandAll: 'Expand all',
        toEnglish: 'Switch to English',
        toChinese: '切换到中文',
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

    function addressOf(sessionId, filePath) {
      return `${ADDRESS_PREFIX}session/${encodeURIComponent(sessionId)}/${filePath.split('/').map(encodeURIComponent).join('/')}`
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
          sheets.push({ title: cleanText(sheet.title ?? '') || 'Sheet', root: readXmindTopic(topic) })
        }
        if (sheets.length > 0) return { format: 'xmind', editable: false, sheets }
      }

      const contentXml = files.get('content.xml')
      if (!contentXml) throw new Error('XMind file has no sheets')
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
      if (count > MAX_ZIP_ENTRIES) throw new Error('XMind archive has too many entries')
      let offset = view.getUint32(eocd + 16, true)
      const files = new Map()
      let total = 0
      for (let i = 0; i < count; i += 1) {
        if (offset + 46 > u8.length || view.getUint32(offset, true) !== 0x02014b50) break
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
        if (uncompressedSize > MAX_ZIP_ENTRY_BYTES) throw new Error('XMind content is too large')
        if (total + uncompressedSize > MAX_ZIP_TOTAL_BYTES) throw new Error('XMind content is too large')
        if (localOffset + 30 > u8.length || view.getUint32(localOffset, true) !== 0x04034b50) continue
        const localNameLength = view.getUint16(localOffset + 26, true)
        const localExtraLength = view.getUint16(localOffset + 28, true)
        const start = localOffset + 30 + localNameLength + localExtraLength
        const end = start + compressedSize
        if (end > u8.length) throw new Error('Damaged zip container')
        const raw = u8.subarray(start, end)
        if (method === 0) {
          files.set(name, raw)
          total += raw.length
        } else if (method === 8) {
          const limit = uncompressedSize > 0 ? Math.min(MAX_ZIP_ENTRY_BYTES, uncompressedSize) : MAX_ZIP_ENTRY_BYTES
          const data = await inflateRaw(raw, limit)
          files.set(name, data)
          total += data.length
        }
      }
      return files
    }

    async function inflateRaw(data, limit = MAX_ZIP_ENTRY_BYTES) {
      if (typeof DecompressionStream === 'undefined') {
        throw new Error('This browser cannot decompress .xmind files')
      }
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
      const reader = stream.getReader()
      const chunks = []
      let total = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.length
        if (total > limit) {
          reader.cancel().catch(() => {})
          throw new Error('XMind content is too large')
        }
        chunks.push(value)
      }
      const out = new Uint8Array(total)
      let at = 0
      for (const chunk of chunks) {
        out.set(chunk, at)
        at += chunk.length
      }
      return out
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
      if (format !== 'xmind' && bytes.length > MAX_TEXT_BYTES) throw new Error('FILE_TOO_LARGE')
      const text = format === 'xmind' ? '' : new TextDecoder().decode(bytes)
      let doc
      switch (format) {
        case 'mm':
          doc = parseMm(text)
          break
        case 'opml':
          doc = parseOpml(text)
          break
        case 'km':
          doc = parseKm(text)
          break
        case 'vym':
          doc = parseVym(text)
          break
        case 'xmind':
          doc = await parseXmind(bytes)
          break
        default:
          throw new Error(`Unsupported format: ${format}`)
      }
      let total = 0
      for (const sheet of doc.sheets) total += countNodes(sheet.root)
      if (total > MAX_NODES) throw new Error(`TOO_MANY_NODES:${total}`)
      doc.totalNodes = total
      return doc
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
        if (depth === 1) attrs.push(`POSITION="${(node._side ?? node.side) === 'left' ? 'left' : 'right'}"`)
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

    const labelCache = new Map()
    function wrapLabel(value) {
      const text = cleanText(value).replace(/\s+/g, ' ') || ' '
      const cached = labelCache.get(text)
      if (cached) return cached
      const maxWidth = 240
      if (measureText(text) <= maxWidth) {
        const result = {
          lines: [text],
          width: Math.min(288, Math.max(112, Math.ceil(measureText(text)) + 30)),
          height: 40,
        }
        if (labelCache.size > 4000) labelCache.clear()
        labelCache.set(text, result)
        return result
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
      const result = { lines, width, height: lines.length * 18 + 22 }
      if (labelCache.size > 4000) labelCache.clear()
      labelCache.set(text, result)
      return result
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

    function countTree(node) {
      node._count = 1
      for (const child of node.children) node._count += countTree(child)
      return node._count
    }

    function collectNodes(node, parent, out) {
      out.push({ node, parent })
      for (const child of node._visibleChildren) collectNodes(child, node, out)
      return out
    }

    function layoutMap(root, structure = 'balanced') {
      countTree(root)
      measureTree(root)
      const kids = root._visibleChildren

      if (structure === 'down') {
        const measureDown = (node) => {
          let childWidth = 0
          let childHeight = 0
          for (const child of node._visibleChildren) {
            measureDown(child)
            childWidth += child._dw
          }
          if (node._visibleChildren.length > 0) childWidth += DOWN_GAP_X * (node._visibleChildren.length - 1)
          for (const child of node._visibleChildren) childHeight = Math.max(childHeight, child._dh)
          node._dw = Math.max(node._w, childWidth)
          node._dh = node._h + (node._visibleChildren.length > 0 ? DOWN_GAP_Y + childHeight : 0)
        }
        const placeDown = (node, left, top) => {
          const children = node._visibleChildren
          node._x = left + (node._dw - node._w) / 2
          node._y = top + node._h / 2
          delete node._side
          if (children.length === 0) return
          let total = 0
          for (const child of children) total += child._dw
          total += DOWN_GAP_X * (children.length - 1)
          let cursor = left + (node._dw - total) / 2
          for (const child of children) {
            placeDown(child, cursor, top + node._h + DOWN_GAP_Y)
            cursor += child._dw + DOWN_GAP_X
          }
        }
        measureDown(root)
        placeDown(root, 0, 0)
      } else {
        if (structure === 'balanced') {
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

        const sides = structure === 'right' || structure === 'left' ? [structure] : ['left', 'right']
        for (const side of sides) {
          const sideKids =
            structure === 'balanced' ? kids.filter((kid) => (kid.side === 'left' ? 'left' : 'right') === side) : kids
          let total = 0
          for (const kid of sideKids) total += kid._sub + GAP_Y
          total = Math.max(0, total - GAP_Y)
          let cursor = -total / 2
          for (const kid of sideKids) {
            place(kid, side, root, cursor)
            cursor += kid._sub + GAP_Y
          }
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
.mm-btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border: 0; border-radius: 7px; background: transparent; color: inherit; cursor: pointer; opacity: .82; }
.mm-btn:hover:not(:disabled) { background: var(--mm-hover, rgba(127,127,127,.16)); opacity: 1; }
.mm-btn:disabled { opacity: .32; cursor: default; }
.mm-btn[data-active="true"] { background: var(--mm-hover, rgba(127,127,127,.16)); }
.mm-corner { position: absolute; left: 12px; bottom: 12px; z-index: 4; display: flex; align-items: center; gap: 6px; }
.mm-corner-lang { height: 20px; min-width: 26px; padding: 0 6px; border: 1px solid rgba(127,127,127,.22); border-radius: 6px; background: transparent; color: inherit; font: inherit; font-size: 10px; font-weight: 650; letter-spacing: .02em; opacity: .6; cursor: pointer; }
.mm-corner-lang:hover { opacity: .95; background: rgba(127,127,127,.12); }
.mm-sep { width: 1px; height: 18px; background: var(--mm-line, rgba(127,127,127,.22)); margin: 0 4px; }
.mm-dock { position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%); box-sizing: border-box; width: fit-content; max-width: calc(100% - 200px); display: flex; flex-direction: column; gap: 3px; padding: 5px 6px 4px; border-radius: 14px; background: rgba(127,127,127,.10); border: 1px solid rgba(127,127,127,.16); box-shadow: 0 10px 30px rgba(15,23,42,.16); -webkit-backdrop-filter: blur(18px) saturate(150%); backdrop-filter: blur(18px) saturate(150%); z-index: 5; }
.mm-dock-main { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 1px; }
.mm-count { font-size: 11px; opacity: .55; white-space: nowrap; pointer-events: none; }
.mm-dock .mm-btn { width: 30px; height: 30px; opacity: .78; }
.mm-dock .mm-sep { margin: 0 3px; }
.mm-zoom { width: auto !important; min-width: 44px; padding: 0 4px; font-size: 11px; font-variant-numeric: tabular-nums; letter-spacing: .01em; opacity: .7 !important; }
.mm-format-panel { position: absolute; bottom: calc(100% + 9px); left: 50%; transform: translateX(-50%); width: 300px; max-width: calc(100vw - 32px); padding: 13px 13px 11px; border-radius: 14px; background: rgba(127,127,127,.10); border: 1px solid rgba(127,127,127,.16); box-shadow: 0 18px 46px rgba(15,23,42,.22); -webkit-backdrop-filter: blur(24px) saturate(160%); backdrop-filter: blur(24px) saturate(160%); text-align: left; }
.mm-format-title { margin: 1px 2px 8px; font-size: 11px; font-weight: 650; letter-spacing: .02em; opacity: .55; }
.mm-format-title + .mm-format-grid { margin-bottom: 13px; }
.mm-format-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.mm-format-grid-3 { grid-template-columns: repeat(3, 1fr); }
.mm-format-option { display: flex; align-items: center; justify-content: center; height: 46px; padding: 0; border: 0; border-radius: 9px; background: transparent; color: inherit; cursor: pointer; opacity: .62; }
.mm-format-option:hover { background: rgba(127,127,127,.14); opacity: .95; }
.mm-format-option[data-active="true"] { background: rgba(59,130,246,.16); color: #3b82f6; opacity: 1; }

.mm-select { height: 28px; max-width: 170px; border: 1px solid var(--mm-line, rgba(127,127,127,.28)); border-radius: 7px; background: var(--mm-surface, transparent); color: inherit; font: inherit; font-size: 12px; }
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
.mm-status { position: absolute; left: 50%; top: 12px; transform: translateX(-50%); max-width: 90%; padding: 6px 12px; border-radius: 8px; background: rgba(17,24,39,.9); color: #f9fafb; font-size: 12px; z-index: 4; pointer-events: none; }
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
        case 'convert':
          return h('svg', common, h('path', { d: 'M4 8h10l-3-3M20 16H10l3 3' }))
        case 'undo':
          return h('svg', common, h('path', { d: 'M9 7H5v4M5 11c2-5 7-6 11-3 3 2 4 6 2 9' }))
        case 'redo':
          return h('svg', common, h('path', { d: 'M15 7h4v4M19 11c-2-5-7-6-11-3-3 2-4 6-2 9' }))
        case 'fit':
          return h('svg', common, h('path', { d: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5' }))
        case 'collapseAll':
          return h('svg', common, h('path', { d: 'M6 8l6 4 6-4M6 16l6-4 6 4' }))
        case 'expandAll':
          return h('svg', common, h('path', { d: 'M6 10l6-4 6 4M6 14l6 4 6-4' }))
        case 'zoomIn':
          return h('svg', common, h('circle', { cx: 10.5, cy: 10.5, r: 6.5 }), h('path', { d: 'M15.5 15.5L21 21M10.5 7.5v6M7.5 10.5h6' }))
        case 'zoomOut':
          return h('svg', common, h('circle', { cx: 10.5, cy: 10.5, r: 6.5 }), h('path', { d: 'M15.5 15.5L21 21M7.5 10.5h6' }))
        case 'structureRight':
          return h('svg', common, h('rect', { x: 3, y: 9, width: 5, height: 6, rx: 1.5 }), h('path', { d: 'M8 12h3M11 12V6h7M11 12v6h7' }))
        case 'structureLeft':
          return h('svg', common, h('rect', { x: 16, y: 9, width: 5, height: 6, rx: 1.5 }), h('path', { d: 'M16 12h-3M13 12V6H6M13 12v6H6' }))
        case 'structureBalanced':
          return h(
            'svg',
            common,
            h('rect', { x: 9, y: 9, width: 6, height: 6, rx: 1.5 }),
            h('path', { d: 'M9 12H3M15 12h6M3 12V6h3M3 12v6h3M21 12V6h-3M21 12v6h-3' }),
          )
        case 'structureDown':
          return h(
            'svg',
            common,
            h('rect', { x: 9, y: 2.5, width: 6, height: 5, rx: 1.5 }),
            h('path', { d: 'M12 7.5V12M3 12h18M3 12v4M12 12v4M21 12v4' }),
          )
        case 'branchCurve':
          return h('svg', common, h('path', { d: 'M4 6c8 0 8 12 16 12' }))
        case 'branchStraight':
          return h('svg', common, h('path', { d: 'M4 6l16 12' }))
        case 'branchElbow':
          return h('svg', common, h('path', { d: 'M4 6h8v12h8' }))
        case 'format':
          return h(
            'svg',
            common,
            h('path', { d: 'M4 7h6M14 7h6M4 12h3M11 12h9M4 17h11M19 17h1' }),
            h('circle', { cx: 12, cy: 7, r: 2 }),
            h('circle', { cx: 9, cy: 12, r: 2 }),
            h('circle', { cx: 17, cy: 17, r: 2 }),
          )
        default:
          return null
      }
    }

    function storedChoice(key, allowed, fallback) {
      try {
        const value = localStorage.getItem(key)
        return allowed.includes(value) ? value : fallback
      } catch {
        return fallback
      }
    }

    function storeChoice(key, value) {
      try {
        localStorage.setItem(key, value)
      } catch {
        /* storage may be unavailable */
      }
    }

    function historyLimitFor(totalNodes) {
      if (totalNodes > 8000) return 10
      if (totalNodes > LARGE_MAP_NODES) return 25
      return 50
    }

    const MapNode = React.memo(function MapNode({ node, isRoot, selected, editable, onSelect, onEdit, onMenu, onToggle }) {
      const cls = `mm-node${isRoot ? ' mm-node-root' : ''}${selected ? ' mm-node-sel' : ''}`
      const textX = 14
      const textY = node._h / 2 - ((node._lines.length - 1) * 18) / 2 + 5
      return h(
        'g',
        {
          'data-mm-node': node.id,
          transform: `translate(${node._x},${node._y - node._h / 2})`,
          onClick: (event) => {
            event.stopPropagation()
            onSelect(node.id)
          },
          onDoubleClick: (event) => {
            event.stopPropagation()
            if (editable) onEdit(node.id, node.text)
          },
          onContextMenu: (event) => {
            event.preventDefault()
            event.stopPropagation()
            onMenu(node.id, event.clientX, event.clientY)
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
                  onToggle(node.id)
                },
              },
              h('circle', { r: 8, className: 'mm-toggle' }),
              h('text', { className: 'mm-toggle-text', x: 0, y: 3.5, textAnchor: 'middle' }, node.collapsed ? `+${Math.max(0, (node._count ?? 1) - 1)}` : '−'),
            )
          : null,
      )
    })

    function MindMapView(props) {
      const { ctx, useTabInfo } = props
      const { tab } = useTabInfo()
      const [lang, setLang] = useState(() => {
        try {
          return localStorage.getItem('dsh-mindmap:lang') === 'en' ? 'en' : 'zh'
        } catch {
          return 'zh'
        }
      })
      const t = useCallback((key) => (DICTS[lang] ?? DICTS.zh)[key] ?? key, [lang])
      const tRef = useRef(t)
      tRef.current = t
      const address = tab.contentId ?? tab.navigation?.address
      const [state, setState] = useState({ status: 'loading' })
      const [reloadKey, setReloadKey] = useState(0)
      const [doc, setDoc] = useState(undefined)
      const docRef = useRef(doc)
      docRef.current = doc
      const [version, setVersion] = useState(undefined)
      const [active, setActive] = useState(0)
      const [dirty, setDirty] = useState(false)
      const [history, setHistory] = useState({ past: [], future: [] })
      const [selected, setSelected] = useState(undefined)
      const [editing, setEditing] = useState(undefined)
      const [menu, setMenu] = useState(undefined)
      const [formatOpen, setFormatOpen] = useState(false)
      const [structure, setStructure] = useState(() => storedChoice('dsh-mindmap:structure', ['right', 'balanced', 'down', 'left'], 'balanced'))
      const [branch, setBranch] = useState(() => storedChoice('dsh-mindmap:branch', ['curve', 'straight', 'elbow'], 'curve'))
      const [view, setView] = useState({ x: 0, y: 0, k: 1 })
      const [toast, setToast] = useState('')
      const [saving, setSaving] = useState(false)
      const [needsFit, setNeedsFit] = useState(true)
      const [size, setSize] = useState({ width: 800, height: 600 })
      const stageRef = useRef(null)
      const dockRef = useRef(null)
      const cornerRef = useRef(null)
      const [cornerLift, setCornerLift] = useState(0)
      const contentRef = useRef(null)
      const viewRef = useRef({ x: 0, y: 0, k: 1 })
      const wheelRef = useRef({ frame: 0, data: undefined })
      const focusRef = useRef(undefined)
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
          setState({ status: 'error', message: tRef.current('unsupported') })
          return undefined
        }
        const controller = new AbortController()
        let alive = true
        setState({ status: 'loading' })
        ;(async () => {
          try {
            const outcome = await ctx.remote.workspaceFiles.readBytes(parsed.sessionId, parsed.path, {}, controller.signal)
            if (!outcome || outcome.ok === false) {
              throw new Error(outcome?.error?.message ?? tRef.current('error'))
            }
            const result = outcome.value ?? outcome
            const bytes = toBytes(result.data)
            const format = extensionOf(parsed.path)
            if (!FORMATS.has(format)) throw new Error(tRef.current('unsupported'))
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
            if (parsedDoc.totalNodes > LARGE_MAP_NODES) {
              say(tRef.current('largeMap').replace('{count}', String(parsedDoc.totalNodes)))
            }
          } catch (error) {
            if (!alive || controller.signal.aborted) return
            const raw = String(error?.message ?? error)
            let message = raw
            if (raw.startsWith('TOO_MANY_NODES:')) {
              message = tRef.current('tooManyNodes')
                .replace('{count}', raw.slice('TOO_MANY_NODES:'.length))
                .replace('{limit}', String(MAX_NODES))
            } else if (raw === 'FILE_TOO_LARGE') {
              message = tRef.current('fileTooLarge')
            }
            setState({ status: 'error', message })
          }
        })()
        return () => {
          alive = false
          controller.abort()
        }
      }, [address, reloadKey, ctx, say])

      useEffect(() => {
        if (!dirty) return undefined
        const guard = (event) => {
          event.preventDefault()
          event.returnValue = ''
        }
        window.addEventListener('beforeunload', guard)
        return () => window.removeEventListener('beforeunload', guard)
      }, [dirty])

      useEffect(() => {
        viewRef.current = view
      }, [view])

      const sheet = doc?.sheets?.[active]
      const layout = useMemo(() => (sheet ? layoutMap(sheet.root, structure) : undefined), [sheet, structure])

      useLayoutEffect(() => {
        const corner = cornerRef.current
        const dock = dockRef.current
        if (!corner || !dock) return
        const overlaps = corner.getBoundingClientRect().right > dock.getBoundingClientRect().left - 8
        const lift = overlaps ? dock.offsetHeight + 10 : 0
        setCornerLift((current) => (current === lift ? current : lift))
      }, [layout, size.width, size.height, lang, doc?.format, dirty])

      const fit = useCallback(() => {
        const stage = stageRef.current
        if (!stage || !layout) return
        const width = stage.clientWidth
        const height = stage.clientHeight
        const k = Math.max(0.16, Math.min(1.25, Math.min((width - 32) / layout.width, (height - 32) / layout.height)))
        setView({ k, x: width / 2 - (layout.width / 2) * k, y: height / 2 - (layout.height / 2) * k })
      }, [layout])

      const anyExpanded = useMemo(() => {
        if (!sheet) return false
        const walk = (node) => (node.children.length > 0 && !node.collapsed) || node.children.some(walk)
        return walk(sheet.root)
      }, [sheet])

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
        const pending = focusRef.current
        if (!pending || !layout) return
        focusRef.current = undefined
        if (pending.fit) {
          fit()
          return
        }
        const stage = stageRef.current
        const entry = layout.byId.get(pending.id)
        if (!stage || !entry) return
        setView((current) => ({ ...current, x: pending.x - entry.node._x * current.k, y: pending.y - entry.node._y * current.k }))
      }, [layout, fit])

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
        const flushWheel = () => {
          const data = wheelRef.current.data
          wheelRef.current.frame = 0
          if (!data) return
          setView((current) => {
            if (data.zoom) {
              const next = Math.max(0.16, Math.min(3, current.k * Math.exp(-data.deltaY * 0.002)))
              return { k: next, x: data.px - ((data.px - current.x) / current.k) * next, y: data.py - ((data.py - current.y) / current.k) * next }
            }
            return { ...current, x: current.x - data.deltaX * data.unit, y: current.y - data.deltaY * data.unit }
          })
        }
        const onWheel = (event) => {
          event.preventDefault()
          const rect = stage.getBoundingClientRect()
          const zoom = event.ctrlKey || event.metaKey
          const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1
          wheelRef.current.data = {
            zoom,
            px: event.clientX - rect.left,
            py: event.clientY - rect.top,
            deltaX: event.deltaX,
            deltaY: event.deltaY,
            unit,
          }
          if (!wheelRef.current.frame) wheelRef.current.frame = requestAnimationFrame(flushWheel)
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

      const historyLimit = historyLimitFor(doc?.totalNodes ?? 0)

      const commit = useCallback(
        (nextSheets, nextSelected) => {
          const current = docRef.current
          if (!current) return
          setHistory((history) => ({ past: [...history.past.slice(-(historyLimit - 1)), current.sheets], future: [] }))
          setDoc((latest) => ({ ...latest, sheets: nextSheets }))
          if (EDITABLE.has(current.format)) setDirty(true)
          if (nextSelected !== undefined) setSelected(nextSelected)
        },
        [historyLimit],
      )

      const toggleAll = useCallback(() => {
        if (!doc) return
        const collapse = anyExpanded
        const rootId = doc.sheets[active]?.root?.id
        const sheets = doc.sheets.map((item, index) => {
          if (index !== active) return item
          const root = structuredClone(item.root)
          const walk = (node) => {
            if (node.children.length > 0) node.collapsed = collapse
            node.children.forEach(walk)
          }
          walk(root)
          return { ...item, root }
        })
        if (rootId) focusRef.current = { id: rootId, fit: true, x: 0, y: 0 }
        commit(sheets)
      }, [doc, active, anyExpanded, commit])

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

      const toggleNode = useCallback(
        (id) => {
          if (!id) return
          const entry = layout?.byId.get(id)
          const stage = stageRef.current
          const rootId = doc?.sheets?.[active]?.root?.id
          if (entry) {
            focusRef.current = {
              id,
              fit: id === rootId,
              x: stage ? view.x + entry.node._x * view.k : 0,
              y: stage ? view.y + entry.node._y * view.k : 0,
            }
          }
          stageRef.current?.focus?.({ preventScroll: true })
          const sheets = mutateNode(id, (target) => {
            target.collapsed = !target.collapsed
          })
          if (sheets) commit(sheets)
        },
        [layout, view, doc, active, mutateNode, commit],
      )

      const toggleCollapse = useCallback(() => {
        if (selected) toggleNode(selected)
      }, [selected, toggleNode])

      const startRename = useCallback(() => {
        if (!doc || !EDITABLE.has(doc.format) || !selected) return
        const entry = layout?.byId.get(selected)
        if (entry) setEditing({ id: selected, value: entry.node.text })
      }, [doc, selected, layout])

      const applyText = useCallback(
        (id, value) => {
          // Read the latest document at event time. A blur can fire from a
          // handler captured before the preceding add/rename committed, and
          // mutating that stale tree would silently drop the new node.
          const current = docRef.current
          if (!current) return
          const text = cleanText(value)
          let found = false
          const sheets = current.sheets.map((item, index) => {
            if (index !== active) return item
            const root = structuredClone(item.root)
            const target = findNode(root, id)
            if (!target) return item
            found = true
            target.text = text || (target.children.length > 0 ? target.text : ' ')
            return { ...item, root }
          })
          if (found) commit(sheets)
          setEditing(undefined)
        },
        [active, commit],
      )

      const undo = useCallback(() => {
        if (history.past.length === 0 || !doc) return
        const previous = history.past[history.past.length - 1]
        setDoc({ ...doc, sheets: previous })
        setHistory({ past: history.past.slice(0, -1), future: [doc.sheets, ...history.future].slice(0, historyLimit) })
        setDirty(true)
      }, [history, doc, historyLimit])

      const redo = useCallback(() => {
        if (history.future.length === 0 || !doc) return
        const next = history.future[0]
        setDoc({ ...doc, sheets: next })
        setHistory({ past: [...history.past, doc.sheets].slice(-historyLimit), future: history.future.slice(1) })
        setDirty(true)
      }, [history, doc, historyLimit])

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

      const convertToEditable = useCallback(async () => {
        if (!doc || doc.format !== 'xmind' || saving) return
        const slash = doc.path.lastIndexOf('/')
        const dir = slash >= 0 ? doc.path.slice(0, slash + 1) : ''
        const targetPath = `${dir}${stemOf(doc.path)}.mm`
        const targetName = baseName(targetPath)
        let baseVersion
        try {
          const statOutcome = await ctx.remote.workspaceFiles.stat(doc.sessionId, targetPath)
          if (statOutcome?.ok) {
            baseVersion = statOutcome.value?.version
            if (!window.confirm(t('convertExists').replace('{name}', targetName))) return
          }
        } catch {
          /* treat as absent; the host route re-checks */
        }
        const content = serializeMm(doc.sheets[active])
        setSaving(true)
        try {
          const response = await fetch('/dsh-mindmap/save', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              sessionId: doc.sessionId,
              path: targetPath,
              content,
              create: baseVersion === undefined,
              baseVersion,
            }),
          })
          if (response.status === 409) {
            say(t('convertConflict'))
            return
          }
          if (!response.ok) {
            const payload = await response.json().catch(() => ({}))
            if (response.status === 404 || response.status === 405 || response.status >= 500) {
              download(content, targetName, 'application/xml')
              say(t('saveFallback'))
            } else {
              say(`${t('convertFailed')} — ${payload.error ?? response.status}`)
            }
            return
          }
          say(t('converted').replace('{name}', targetName))
          ctx.sidebarRight?.openResource?.(addressOf(doc.sessionId, targetPath))
        } catch {
          download(content, targetName, 'application/xml')
          say(t('saveFallback'))
        } finally {
          setSaving(false)
        }
      }, [doc, active, saving, ctx, download, say, t])

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

      const applyView = (next) => {
        viewRef.current = next
        contentRef.current?.setAttribute('transform', `translate(${next.x},${next.y}) scale(${next.k})`)
      }
      const selectNode = useCallback((id) => setSelected(id), [])
      const chooseStructure = useCallback((value) => {
        setStructure(value)
        setNeedsFit(true)
        storeChoice('dsh-mindmap:structure', value)
      }, [])
      const chooseBranch = useCallback((value) => {
        setBranch(value)
        storeChoice('dsh-mindmap:branch', value)
      }, [])

      useEffect(() => {
        if (!formatOpen) return undefined
        const onPointerDown = (event) => {
          if (!dockRef.current?.contains(event.target)) setFormatOpen(false)
        }
        const onKeyDown = (event) => {
          if (event.key === 'Escape') setFormatOpen(false)
        }
        document.addEventListener('pointerdown', onPointerDown, true)
        document.addEventListener('keydown', onKeyDown)
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true)
          document.removeEventListener('keydown', onKeyDown)
        }
      }, [formatOpen])
      const beginEdit = useCallback((id, value) => setEditing({ id, value }), [])
      const openNodeMenu = useCallback((id, x, y) => {
        setSelected(id)
        setMenu({ x, y, id })
      }, [])

      const onPointerDown = (event) => {
        if (event.button !== 0) return
        if (event.target.closest?.('[data-mm-node]')) return
        const origin = viewRef.current
        dragRef.current = { x: event.clientX, y: event.clientY, vx: origin.x, vy: origin.y, next: undefined }
        event.currentTarget.setPointerCapture?.(event.pointerId)
        event.currentTarget.dataset.dragging = 'true'
      }
      const onPointerMove = (event) => {
        const drag = dragRef.current
        if (!drag) return
        const next = { ...viewRef.current, x: drag.vx + event.clientX - drag.x, y: drag.vy + event.clientY - drag.y }
        drag.next = next
        applyView(next)
      }
      const endDrag = (event) => {
        const drag = dragRef.current
        if (!drag) return
        dragRef.current = undefined
        if (drag.next) setView(drag.next)
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
              { ref: contentRef, transform: `translate(${view.x},${view.y}) scale(${view.k})` },
              layout.entries.map(({ node, parent }) => {
                if (!parent) return null
                const p = parent
                let d
                if (structure === 'down') {
                  const px = p._x + p._w / 2
                  const py = p._y + p._h / 2
                  const cx = node._x + node._w / 2
                  const cy = node._y - node._h / 2
                  const mid = (py + cy) / 2
                  if (branch === 'straight') d = `M ${px} ${py} L ${cx} ${cy}`
                  else if (branch === 'elbow') d = `M ${px} ${py} V ${mid} H ${cx} V ${cy}`
                  else d = `M ${px} ${py} C ${px} ${mid}, ${cx} ${mid}, ${cx} ${cy}`
                } else {
                  const right = (node._side ?? node.side ?? 'right') !== 'left'
                  const px = right ? p._x + p._w : p._x
                  const cx = right ? node._x : node._x + node._w
                  const py = p._y
                  const cy = node._y
                  const mid = (px + cx) / 2
                  if (branch === 'straight') d = `M ${px} ${py} L ${cx} ${cy}`
                  else if (branch === 'elbow') d = `M ${px} ${py} H ${mid} V ${cy} H ${cx}`
                  else d = `M ${px} ${py} C ${mid} ${py}, ${mid} ${cy}, ${cx} ${cy}`
                }
                return h('path', { key: `e-${node.id}`, className: 'mm-edge', d })
              }),
              layout.entries.map(({ node }) =>
                h(MapNode, {
                  key: node.id,
                  node,
                  isRoot: node === sheet.root,
                  selected: selected === node.id,
                  editable,
                  onSelect: selectNode,
                  onEdit: beginEdit,
                  onMenu: openNodeMenu,
                  onToggle: toggleNode,
                }),
              ),
            ),
          ),
          h(
            'div',
            {
              className: 'mm-dock',
              ref: dockRef,
              onPointerDown: (event) => event.stopPropagation(),
              onDoubleClick: (event) => event.stopPropagation(),
            },
            h(
              'div',
              { className: 'mm-dock-main' },
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
              editable &&
                h('button', { type: 'button', className: 'mm-btn', title: t('undo'), 'aria-label': t('undo'), onClick: undo, disabled: history.past.length === 0 }, h(Icon, { name: 'undo' })),
              editable &&
                h('button', { type: 'button', className: 'mm-btn', title: t('redo'), 'aria-label': t('redo'), onClick: redo, disabled: history.future.length === 0 }, h(Icon, { name: 'redo' })),
              editable && h('span', { className: 'mm-sep' }),
              h(
                'button',
                {
                  type: 'button',
                  className: 'mm-btn',
                  title: anyExpanded ? t('collapseAll') : t('expandAll'),
                  'aria-label': anyExpanded ? t('collapseAll') : t('expandAll'),
                  onClick: toggleAll,
                },
                h(Icon, { name: anyExpanded ? 'collapseAll' : 'expandAll' }),
              ),
              h('span', { className: 'mm-sep' }),
              h('button', { type: 'button', className: 'mm-btn', title: t('zoomOut'), 'aria-label': t('zoomOut'), onClick: () => zoomCenter(1 / 1.2) }, h(Icon, { name: 'zoomOut' })),
              h(
                'button',
                {
                  type: 'button',
                  className: 'mm-btn mm-zoom',
                  title: t('resetZoom'),
                  'aria-label': t('resetZoom'),
                  onClick: () => zoomCenter(1 / view.k),
                },
                `${Math.round(view.k * 100)}%`,
              ),
              h('button', { type: 'button', className: 'mm-btn', title: t('zoomIn'), 'aria-label': t('zoomIn'), onClick: () => zoomCenter(1.2) }, h(Icon, { name: 'zoomIn' })),
              h('button', { type: 'button', className: 'mm-btn', title: t('fit'), 'aria-label': t('fit'), onClick: fit }, h(Icon, { name: 'fit' })),
              h('span', { className: 'mm-sep' }),
              h(
                'button',
                {
                  type: 'button',
                  className: 'mm-btn',
                  title: t('format'),
                  'aria-label': t('format'),
                  'aria-expanded': formatOpen,
                  'data-active': formatOpen,
                  onClick: () => setFormatOpen((open) => !open),
                },
                h(Icon, { name: 'format' }),
              ),
              h('span', { className: 'mm-sep' }),
              editable &&
                h(
                  'button',
                  { type: 'button', className: 'mm-btn', title: t('save'), 'aria-label': t('save'), onClick: save, disabled: saving || !dirty },
                  h(Icon, { name: 'save' }),
                ),
              doc.format === 'xmind' &&
                h('button', { type: 'button', className: 'mm-btn', title: t('convert'), 'aria-label': t('convert'), onClick: convertToEditable, disabled: saving }, h(Icon, { name: 'convert' })),
              h('button', { type: 'button', className: 'mm-btn', title: t('export'), 'aria-label': t('export'), onClick: exportMm }, h(Icon, { name: 'download' })),
              formatOpen &&
                h(
                  'div',
                  { className: 'mm-format-panel', role: 'dialog', 'aria-label': t('format') },
                  h('div', { className: 'mm-format-title' }, t('structure')),
                  h(
                    'div',
                    { className: 'mm-format-grid' },
                    [
                      ['right', 'structureRight'],
                      ['balanced', 'structureBalanced'],
                      ['down', 'structureDown'],
                      ['left', 'structureLeft'],
                    ].map(([value, label]) =>
                      h(
                        'button',
                        {
                          key: value,
                          type: 'button',
                          className: 'mm-format-option',
                          'data-active': structure === value,
                          title: t(label),
                          'aria-label': t(label),
                          'aria-pressed': structure === value,
                          onClick: () => chooseStructure(value),
                        },
                        h(Icon, { name: label, size: 22 }),
                      ),
                    ),
                  ),
                  h('div', { className: 'mm-format-title' }, t('branch')),
                  h(
                    'div',
                    { className: 'mm-format-grid mm-format-grid-3' },
                    [
                      ['curve', 'branchCurve'],
                      ['straight', 'branchStraight'],
                      ['elbow', 'branchElbow'],
                    ].map(([value, label]) =>
                      h(
                        'button',
                        {
                          key: value,
                          type: 'button',
                          className: 'mm-format-option',
                          'data-active': branch === value,
                          title: t(label),
                          'aria-label': t(label),
                          'aria-pressed': branch === value,
                          onClick: () => chooseBranch(value),
                        },
                        h(Icon, { name: label, size: 22 }),
                      ),
                    ),
                  ),
                ),
            ),
          ),
          h(
            'div',
            {
              className: 'mm-corner',
              ref: cornerRef,
              style: { bottom: 12 + cornerLift },
              onPointerDown: (event) => event.stopPropagation(),
              onDoubleClick: (event) => event.stopPropagation(),
            },
            h(
              'button',
              {
                type: 'button',
                className: 'mm-corner-lang',
                title: lang === 'zh' ? t('toEnglish') : t('toChinese'),
                'aria-label': lang === 'zh' ? t('toEnglish') : t('toChinese'),
                onClick: () => {
                  const next = lang === 'zh' ? 'en' : 'zh'
                  setLang(next)
                  try {
                    localStorage.setItem('dsh-mindmap:lang', next)
                  } catch {
                    /* storage may be unavailable */
                  }
                },
              },
              lang === 'zh' ? 'EN' : '中',
            ),
            h(
              'span',
              { className: 'mm-count' },
              `${t('stats').replace('{nodes}', String(sheet?.root?._count ?? layout.count))}${editable ? '' : ` · ${t('readOnly')}`}${dirty ? ` · ${t('unsaved')}` : ''}`,
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
      inject: ['sidebarRightTabs', 'sidebarRight', 'slots', 'remote', 'remote.workspaceFiles', 'locale'],
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
