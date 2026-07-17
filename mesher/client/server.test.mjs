import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import path from 'node:path'
import test from 'node:test'

async function listen(server) {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return server.address().port
}

async function close(server) {
  if (!server.listening) return
  server.close()
  await once(server, 'close')
}

test('production bridge contains paths, bounds bodies, times out, and sets security headers', async (t) => {
  let flakyReadAttempts = 0
  let flakySlowReadAttempts = 0
  let flakyWriteAttempts = 0
  const upstream = createServer((req, res) => {
    if (req.url === '/api/v1/slow') {
      setTimeout(() => {
        if (!res.destroyed) res.end('{"ok":true}')
      }, 250)
      return
    }

    if (req.url === '/api/v1/flaky-read') {
      flakyReadAttempts += 1
      if (flakyReadAttempts === 1) {
        req.socket.destroy()
        return
      }
    }

    if (req.url === '/api/v1/flaky-slow-read') {
      flakySlowReadAttempts += 1
      if (flakySlowReadAttempts === 1) {
        setTimeout(() => {
          if (!res.destroyed) res.end('{"ok":true}')
        }, 75)
        return
      }
    }

    if (req.url === '/api/v1/flaky-write') {
      flakyWriteAttempts += 1
      req.socket.destroy()
      return
    }

    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ path: req.url, forwardedHost: req.headers['x-forwarded-host'] }))
  })
  const upstreamPort = await listen(upstream)

  process.env.MESHER_BACKEND_ORIGIN = `http://127.0.0.1:${upstreamPort}`
  process.env.MESHER_PROXY_MAX_BODY_BYTES = '64'
  process.env.MESHER_PROXY_TIMEOUT_MS = '100'
  process.env.MESHER_PROXY_ATTEMPT_TIMEOUT_MS = '25'

  const { server, resolveClientAsset } = await import(`./server.mjs?test=${Date.now()}`)
  const bridgePort = await listen(server)
  const bridgeOrigin = `http://127.0.0.1:${bridgePort}`

  t.after(async () => {
    await close(server)
    await close(upstream)
  })

  assert.equal(resolveClientAsset('/%2e%2e%2fserver.mjs'), null)
  assert.ok(resolveClientAsset('/assets/app.js').endsWith(path.join('dist', 'client', 'assets', 'app.js')))

  const proxied = await fetch(`${bridgeOrigin}/api/v1/projects/default`)
  assert.equal(proxied.status, 200)
  assert.equal(proxied.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(proxied.headers.get('x-frame-options'), 'DENY')
  assert.equal(proxied.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await proxied.json(), {
    path: '/api/v1/projects/default',
    forwardedHost: `127.0.0.1:${bridgePort}`,
  })

  const recoveredRead = await fetch(`${bridgeOrigin}/api/v1/flaky-read`)
  assert.equal(recoveredRead.status, 200)
  assert.equal(flakyReadAttempts, 2)

  const recoveredSlowRead = await fetch(`${bridgeOrigin}/api/v1/flaky-slow-read`)
  assert.equal(recoveredSlowRead.status, 200)
  assert.equal(flakySlowReadAttempts, 2)

  const failedWrite = await fetch(`${bridgeOrigin}/api/v1/flaky-write`, {
    method: 'POST',
    body: '{"write":true}',
  })
  assert.equal(failedWrite.status, 502)
  assert.equal(flakyWriteAttempts, 1)

  const oversized = await fetch(`${bridgeOrigin}/api/v1/events`, {
    method: 'POST',
    body: 'x'.repeat(65),
  })
  assert.equal(oversized.status, 413)
  assert.equal((await oversized.json()).error.code, 'request_too_large')

  const timedOut = await fetch(`${bridgeOrigin}/api/v1/slow`)
  assert.equal(timedOut.status, 504)
  assert.equal((await timedOut.json()).error.code, 'upstream_timeout')

  const page = await fetch(`${bridgeOrigin}/alerts`)
  assert.equal(page.status, 200)
  const contentSecurityPolicy = page.headers.get('content-security-policy') || ''
  const nonce = contentSecurityPolicy.match(/script-src 'self' 'nonce-([^']+)'/)?.[1]
  assert.ok(nonce, 'expected a per-response script nonce in Content-Security-Policy')
  const html = await page.text()
  const stylesheetHrefs = [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/g)].map(
    ([, href]) => href,
  )
  assert.ok(stylesheetHrefs.length > 0, 'expected the application shell to reference built stylesheets')
  for (const href of stylesheetHrefs) {
    const stylesheet = await fetch(new URL(href, bridgeOrigin))
    assert.equal(stylesheet.status, 200, `expected stylesheet ${href} to exist`)
    assert.match(
      stylesheet.headers.get('content-type') || '',
      /^text\/css\b/,
      `expected stylesheet ${href} to be served as CSS`,
    )
  }
  const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map(([tag]) => tag)
  assert.ok(scripts.length > 0, 'expected the application shell to contain hydration scripts')
  assert.ok(scripts.every((tag) => tag.includes(`nonce="${nonce}"`)))
})
