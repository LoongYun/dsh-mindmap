/**
 * Host half of the DSH mind-map bundle.
 *
 * The only host capability the viewer needs is writing an edited text-format
 * map back to the workspace. The browser half cannot call `ctx.fs` directly,
 * so this plugin exposes one fenced JSON route:
 *
 *   POST /dsh-mindmap/save  { sessionId, path, content, baseVersion?, create? }
 *
 * The route enforces the connection fence, the session's workspace boundary,
 * the extension allow-list, the body size limit and an optimistic version
 * check before it writes. Both workspace-relative and absolute paths are
 * accepted; containment is decided after resolution, so an absolute path
 * outside the session's workspace is rejected.
 */

import { realpath } from 'node:fs/promises'
import path from 'node:path'
import {
  MAX_NODES,
  MAX_TEXT_BYTES,
  MAX_XMIND_BYTES,
  applyOps,
  isSupportedFormat,
  isTextFormat,
  outlineTree,
  parseText,
  parseXmind,
  serialize,
} from './lib/mindmap.js'

// Local equivalent of the harness `defineTool` helper, so this bundle has no
// runtime dependency on @deepseek-ai/dsh-tools (linked plugins resolve bare
// specifiers from their own directory, not from the host application).
function defineTool({ name, description, parameters, output, execute }) {
  const required = []
  const properties = {}
  for (const [key, spec] of Object.entries(parameters)) {
    if (spec.required === true) required.push(key)
    properties[key] = jsonSchema(spec)
  }
  const schema = { type: 'object', additionalProperties: false, properties, required }
  return { name, description, parameters: schema, output, execute }
}

function jsonSchema(spec) {
  const node = { type: spec.type }
  if (spec.description !== undefined) node.description = spec.description
  if (spec.enum !== undefined) node.enum = spec.enum
  if (spec.type === 'array' && spec.items !== undefined) node.items = jsonSchema(spec.items)
  if (spec.type === 'object') {
    const required = []
    const properties = {}
    for (const [key, child] of Object.entries(spec.properties ?? {})) {
      if (child.required === true) required.push(key)
      properties[key] = jsonSchema(child)
    }
    node.properties = properties
    node.required = required
    node.additionalProperties = false
  }
  return node
}

const ROUTE = '/dsh-mindmap/save'
const MAX_BODY_BYTES = 8 * 1024 * 1024
const WRITABLE_EXTENSIONS = new Set(['.mm', '.opml', '.km', '.vym'])

export const inject = ['webServer', 'sessions', 'connection', 'fs', 'workingDirectory', 'tools']

export function apply(ctx) {
  const saveRoute = (req, res) => {
    handleSave(ctx, req, res).catch((error) => {
      ctx.logger?.warn?.(`dsh-mindmap: save failed: ${String(error?.message ?? error)}`)
      if (!res.headersSent) respond(res, 500, { ok: false, error: 'internal-error' })
      else res.end()
    })
  }

  ctx.effect(
    () => ctx.webServer.register({ kind: 'exact', path: ROUTE, handler: saveRoute }),
    'dsh-mindmap: save route',
  )

  ctx.effect(() => ctx.tools.register(createOutlineTool(ctx)), 'dsh-mindmap: outline tool')
  ctx.effect(() => ctx.tools.register(createApplyTool(ctx)), 'dsh-mindmap: apply tool')
}

async function handleSave(ctx, req, res) {
  if (ctx.connection.requestRejection(req) !== undefined) {
    respond(res, 403, { ok: false, error: 'rejected' })
    return
  }
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST')
    respond(res, 405, { ok: false, error: 'method-not-allowed' })
    return
  }
  const contentType = String(req.headers['content-type'] ?? '')
  if (!contentType.toLowerCase().startsWith('application/json')) {
    respond(res, 415, { ok: false, error: 'unsupported-media-type' })
    return
  }

  let body
  try {
    body = await readJsonBody(req)
  } catch (error) {
    respond(res, error?.code === 'too-large' ? 413 : 400, {
      ok: false,
      error: error?.code === 'too-large' ? 'body-too-large' : 'invalid-json',
    })
    return
  }

  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : ''
  const relativePath = typeof body?.path === 'string' ? body.path : ''
  const content = typeof body?.content === 'string' ? body.content : ''
  const baseVersion = typeof body?.baseVersion === 'string' ? body.baseVersion : undefined
  const create = body?.create === true

  if (sessionId === '' || relativePath === '' || content === '') {
    respond(res, 400, { ok: false, error: 'invalid-request' })
    return
  }
  if (relativePath.includes('\u0000')) {
    respond(res, 400, { ok: false, error: 'invalid-path' })
    return
  }
  if (relativePath.split(/[\\/]+/).includes('..')) {
    respond(res, 400, { ok: false, error: 'invalid-path' })
    return
  }
  if (!WRITABLE_EXTENSIONS.has(path.extname(relativePath).toLowerCase())) {
    respond(res, 400, { ok: false, error: 'read-only-format' })
    return
  }

  const fs = ctx.fs
  const workingDirectory = ctx.workingDirectory
  const session = ctx.sessions.get(sessionId)
  if (session === undefined) {
    respond(res, 404, { ok: false, error: 'unknown-session' })
    return
  }
  if (fs === undefined || workingDirectory === undefined) {
    respond(res, 503, { ok: false, error: 'workspace-unavailable' })
    return
  }

  let root
  let target
  try {
    const cwd = workingDirectory.get(session)
    root = await fs.resolve(cwd)
    target = await fs.resolve(relativePath, { cwd })
  } catch {
    respond(res, 400, { ok: false, error: 'invalid-path' })
    return
  }

  if (!fs.contains(root, target)) {
    respond(res, 403, { ok: false, error: 'outside-workspace' })
    return
  }
  if (!(await staysInside(fs, root, target))) {
    respond(res, 403, { ok: false, error: 'outside-workspace' })
    return
  }

  const info = await fs.stat(target).catch(() => undefined)
  if (info === undefined) {
    if (!create) {
      respond(res, 404, { ok: false, error: 'file-not-found' })
      return
    }
  } else if (create && baseVersion === undefined) {
    respond(res, 409, { ok: false, error: 'file-exists' })
    return
  }
  if (info !== undefined && baseVersion !== undefined && typeof info.version === 'string' && info.version !== baseVersion) {
    respond(res, 409, { ok: false, error: 'version-conflict' })
    return
  }

  try {
    await fs.writeText(target, content)
  } catch {
    respond(res, 500, { ok: false, error: 'write-failed' })
    return
  }

  const after = await fs.stat(target).catch(() => undefined)
  respond(res, 200, {
    ok: true,
    version: typeof after?.version === 'string' ? after.version : undefined,
  })
}

/**
 * Reject a path whose real location escaped the real workspace root through a
 * symlink. Providers that do not expose a host path keep the lexical check.
 */
async function staysInside(fs, root, target) {
  let hostRoot
  let hostTarget
  try {
    hostRoot = fs.processPath(root)
    hostTarget = fs.processPath(target)
  } catch {
    return true
  }
  if (!hostRoot || !hostTarget) return true
  const [realRoot, realTarget] = await Promise.all([
    realpath(hostRoot).catch(() => undefined),
    realpath(hostTarget).catch(() => undefined),
  ])
  if (realRoot === undefined || realTarget === undefined) return true
  const relative = path.relative(realRoot, realTarget)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        const error = new Error('body too large')
        error.code = 'too-large'
        reject(error)
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('error', reject)
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (error) {
        reject(error)
      }
    })
  })
}

function respond(res, status, payload) {
  if (res.headersSent) {
    res.end()
    return
  }
  const text = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(Buffer.byteLength(text)),
    'cache-control': 'no-store',
  })
  res.end(text)
}

// ------------------------------------------------------------------ agent tools

const OUTLINE_OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      path: { type: 'string' },
      format: { type: 'string' },
      version: { type: 'string' },
      count: { type: 'integer' },
      editable: { type: 'boolean' },
      outline: { type: 'string' },
    },
    required: ['path', 'format', 'version', 'count', 'editable', 'outline'],
  },
  render(_args, value) {
    const mode = value.editable ? 'editable' : 'read-only'
    return [
      {
        type: 'text',
        text: `${value.outline}\n\ntopics: ${value.count}\nformat: ${value.format} (${mode})\nversion: ${value.version}`,
      },
    ]
  },
}

const APPLY_OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      ok: { type: 'boolean' },
      path: { type: 'string' },
      version: { type: 'string' },
      count: { type: 'integer' },
      created: { type: 'array', items: { type: 'string' } },
      outline: { type: 'string' },
    },
    required: ['ok', 'path', 'version', 'count', 'created', 'outline'],
  },
  render(_args, value) {
    const created = value.created.length > 0 ? `\ncreated: ${value.created.join(', ')}` : ''
    return [
      {
        type: 'text',
        text: `${value.outline}\n\ntopics: ${value.count}\nversion: ${value.version}${created}`,
      },
    ]
  },
}

function createOutlineTool(ctx) {
  return defineTool({
    name: 'mindmap_outline',
    description:
      'Read a mind map as an indented outline with stable node ids (n1, n2, ...). Supports .mm, .opml, .km, .vym and .xmind (read-only). Use the ids with mindmap_apply; pass the returned version back as baseVersion. The path may be workspace-relative or absolute and must stay inside the session workspace.',
    parameters: {
      path: {
        type: 'string',
        required: true,
        description: 'Mind-map file path, relative to the session workspace or absolute.',
      },
      includeNotes: {
        type: 'boolean',
        description: 'Append each node note after its text.',
      },
      maxDepth: {
        type: 'integer',
        description: 'Maximum outline depth; 0 or omitted means unlimited.',
      },
    },
    output: OUTLINE_OUTPUT,
    async execute(args, exec) {
      if (!args || typeof args.path !== 'string') throw new Error('path is required')
      const { target, ext } = await resolveToolTarget(ctx, exec, args.path)
      const info = await ctx.fs.stat(target, exec.signal)
      if (info === undefined) throw new Error(`file-not-found: ${args.path}`)

      const doc = await readDocument(ctx, target, ext, info, exec.signal)
      const sheet = doc.sheets[0]
      if (!sheet) throw new Error('mindmap-has-no-sheets')
      const depth = Number.isInteger(args.maxDepth) && args.maxDepth > 0 ? args.maxDepth : 0
      const outline = outlineTree(sheet.root, {
        includeNotes: args.includeNotes === true,
        maxDepth: depth,
      })
      return {
        path: args.path,
        format: doc.format,
        version: versionOf(info),
        count: outline.count,
        editable: doc.editable === true,
        outline: outline.text,
      }
    },
  })
}

function createApplyTool(ctx) {
  return defineTool({
    name: 'mindmap_apply',
    description:
      'Edit a text-format mind map (.mm, .opml, .km, .vym) by node id. Read it with mindmap_outline first and pass that version as baseVersion; the whole batch is rejected if any operation fails. Supported actions: add (parent, text), rename (id, text), remove (id), move (id, parent, optional index). .xmind is read-only: export it as .mm in the viewer first.',
    parameters: {
      path: {
        type: 'string',
        required: true,
        description: 'Mind-map file path, relative to the session workspace or absolute.',
      },
      baseVersion: {
        type: 'string',
        required: true,
        description: 'Version returned by mindmap_outline; rejects the edit if the file changed.',
      },
      ops: {
        type: 'array',
        required: true,
        description: 'Operations applied in order against the ids in the outline.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            action: {
              type: 'string',
              required: true,
              enum: ['add', 'rename', 'remove', 'move'],
            },
            id: { type: 'string', description: 'Target node id (rename, remove, move).' },
            parent: { type: 'string', description: 'Parent node id (add, move).' },
            index: { type: 'integer', description: 'Insert position under parent; default last.' },
            text: { type: 'string', description: 'New or added node text (add, rename).' },
          },
        },
      },
    },
    output: APPLY_OUTPUT,
    async execute(args, exec) {
      if (!args || typeof args.path !== 'string') throw new Error('path is required')
      if (!Array.isArray(args.ops)) throw new Error('ops must be an array')
      const { target, ext } = await resolveToolTarget(ctx, exec, args.path)
      if (!isTextFormat(ext)) {
        throw new Error('read-only-format: .xmind must be exported as .mm in the viewer first')
      }
      const info = await ctx.fs.stat(target, exec.signal)
      if (info === undefined) throw new Error(`file-not-found: ${args.path}`)
      const version = versionOf(info)
      if (typeof args.baseVersion !== 'string' || args.baseVersion !== version) {
        throw new Error(`version-conflict: file is at ${version}; re-run mindmap_outline`)
      }

      let doc
      try {
        doc = parseText(await ctx.fs.readText(target, exec.signal), ext)
      } catch (error) {
        throw new Error(`parse-failed: ${messageOf(error)}`)
      }
      const sheet = doc.sheets[0]
      if (!sheet) throw new Error('mindmap-has-no-sheets')

      let applied
      try {
        applied = applyOps(sheet.root, args.ops)
      } catch (error) {
        throw new Error(`edit-rejected: ${messageOf(error)}`)
      }
      if (applied.count > MAX_NODES) throw new Error(`too-many-nodes: at most ${MAX_NODES}`)

      const next = serialize({ format: doc.format, sheets: [{ title: sheet.title, root: applied.root }] })
      if (Buffer.byteLength(next, 'utf8') > MAX_TEXT_BYTES) {
        throw new Error('file-too-large: result exceeds 8 MiB')
      }

      await ctx.fs.writeText(target, next, undefined, exec.signal)
      const after = await ctx.fs.stat(target, exec.signal)
      const outline = outlineTree(applied.root)
      return {
        ok: true,
        path: args.path,
        version: after === undefined ? '' : versionOf(after),
        count: outline.count,
        created: applied.created,
        outline: outline.text,
      }
    },
  })
}

async function readDocument(ctx, target, ext, info, signal) {
  if (ext === '.xmind') {
    if (typeof info.size === 'number' && info.size > MAX_XMIND_BYTES) {
      throw new Error('file-too-large: XMind map exceeds 32 MiB')
    }
    const bytes = await ctx.fs.readBytes(target, signal, MAX_XMIND_BYTES)
    return parseXmind(bytes)
  }
  if (typeof info.size === 'number' && info.size > MAX_TEXT_BYTES) {
    throw new Error('file-too-large: text map exceeds 8 MiB')
  }
  const text = await ctx.fs.readText(target, signal)
  if (Buffer.byteLength(text, 'utf8') > MAX_TEXT_BYTES) {
    throw new Error('file-too-large: text map exceeds 8 MiB')
  }
  return parseText(text, ext)
}

async function resolveToolTarget(ctx, exec, rawPath) {
  if (typeof rawPath !== 'string' || rawPath.trim() === '') throw new Error('path is required')
  if (rawPath.includes('\u0000')) throw new Error('invalid-path')
  if (rawPath.split(/[\\/]+/).includes('..')) throw new Error('invalid-path')
  if (!exec.agent) throw new Error('no-agent-session')
  if (ctx.fs === undefined || ctx.workingDirectory === undefined) {
    throw new Error('workspace-unavailable')
  }

  const cwd = await ctx.workingDirectory.ensure(exec.agent, exec.signal)
  const root = await ctx.fs.resolve(cwd, { signal: exec.signal })
  const target = await ctx.fs.resolve(rawPath, { cwd, signal: exec.signal })
  if (!ctx.fs.contains(root, target)) throw new Error('outside-workspace')
  if (!(await staysInside(ctx.fs, root, target))) throw new Error('outside-workspace')

  let filePath = rawPath
  try {
    filePath = ctx.fs.processPath(target) || rawPath
  } catch {
    filePath = rawPath
  }
  const ext = path.extname(filePath).toLowerCase()
  if (!isSupportedFormat(ext)) throw new Error(`unsupported-format: ${ext || '(none)'}`)
  return { target, ext }
}

function versionOf(info) {
  return typeof info?.version === 'string' ? info.version : String(info?.version ?? '')
}

function messageOf(error) {
  return String(error?.message ?? error)
}
