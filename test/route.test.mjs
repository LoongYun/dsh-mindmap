import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import path from 'node:path'
import test from 'node:test'
import { apply } from '../index.js'

const ROOT = '/ws'

function makeCtx({ policy = { mode: 'danger-full-access' }, writeError } = {}) {
  let handler
  const writes = []
  const files = new Map()
  const ctx = {
    logger: { warn() {} },
    connection: { requestRejection: () => undefined },
    sessions: { get: () => ({ id: 's1' }) },
    workingDirectory: { get: () => ROOT },
    webServer: {
      register(definition) {
        handler = definition.handler
        return () => {}
      },
    },
    tools: { register: () => () => {} },
    sandboxPolicy: { resolve: () => policy },
    effect(fn) {
      return fn()
    },
    fs: {
      resolve: async (p, opts) => ({ path: path.resolve(opts?.cwd ?? ROOT, p) }),
      processPath: () => undefined,
      stat: async (target) => files.get(target.path),
      writeText: async (target, content, _expected, _signal, passedPolicy) => {
        if (writeError) throw writeError
        writes.push({ path: target.path, content, policy: passedPolicy })
        files.set(target.path, { version: 'v2' })
      },
    },
  }
  apply(ctx)
  return { handler, writes, files }
}

function request(body) {
  const stream = Readable.from([Buffer.from(JSON.stringify(body))])
  stream.method = 'POST'
  stream.headers = { 'content-type': 'application/json' }
  return stream
}

function response() {
  let finish
  const finished = new Promise((resolve) => {
    finish = resolve
  })
  return {
    headersSent: false,
    status: 0,
    body: '',
    finished,
    writeHead(status) {
      this.status = status
      this.headersSent = true
    },
    end(text) {
      this.body = text ?? ''
      finish()
    },
  }
}

async function call(handler, body) {
  const res = response()
  await handler(request(body), res)
  await res.finished
  return { status: res.status, body: JSON.parse(res.body) }
}

const base = { sessionId: 's1', content: '<map/>' }

test('writes a new relative path', async () => {
  const ctx = makeCtx()
  const result = await call(ctx.handler, { ...base, path: 'new.mm', create: true })
  assert.equal(result.status, 200)
  assert.equal(ctx.writes[0].path, '/ws/new.mm')
  assert.deepEqual(ctx.writes[0].policy, { mode: 'danger-full-access' })
})

test('accepts an absolute path outside the workspace when the policy allows it', async () => {
  const ctx = makeCtx()
  const result = await call(ctx.handler, { ...base, path: '/tmp/outside.mm', create: true })
  assert.equal(result.status, 200)
  assert.equal(ctx.writes[0].path, '/tmp/outside.mm')
})

test('rejects path traversal before resolution', async () => {
  const ctx = makeCtx()
  const result = await call(ctx.handler, { ...base, path: '../outside.mm', create: true })
  assert.equal(result.status, 400)
  assert.equal(result.body.error, 'invalid-path')
})

test('maps a sandbox denial to 403', async () => {
  const error = Object.assign(new Error('denied'), { code: 'FS_SANDBOX_DENIED' })
  const ctx = makeCtx({ writeError: error })
  const result = await call(ctx.handler, { ...base, path: 'new.mm', create: true })
  assert.equal(result.status, 403)
  assert.equal(result.body.error, 'sandbox-denied')
})

test('refuses to overwrite when create has no base version', async () => {
  const ctx = makeCtx()
  ctx.files.set('/ws/existing.mm', { version: 'v1' })
  const result = await call(ctx.handler, { ...base, path: 'existing.mm', create: true })
  assert.equal(result.status, 409)
  assert.equal(result.body.error, 'file-exists')
})

test('refuses a stale base version', async () => {
  const ctx = makeCtx()
  ctx.files.set('/ws/existing.mm', { version: 'v2' })
  const result = await call(ctx.handler, { ...base, path: 'existing.mm', baseVersion: 'v1' })
  assert.equal(result.status, 409)
  assert.equal(result.body.error, 'version-conflict')
})
