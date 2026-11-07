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

const ROUTE = '/dsh-mindmap/save'
const MAX_BODY_BYTES = 8 * 1024 * 1024
const WRITABLE_EXTENSIONS = new Set(['.mm', '.opml', '.km', '.vym'])

export const inject = ['webServer', 'sessions', 'connection', 'fs', 'workingDirectory']

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
