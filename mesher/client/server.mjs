import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { Readable, Transform } from 'node:stream'
import { createReadStream } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolveMesherBackendOrigin } from './mesher-backend-origin.mjs'
import handler from './dist/server/server.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const clientRoot = path.join(__dirname, 'dist/client')
const port = Number(process.env.PORT || 3000)
const mesherBackendOrigin = resolveMesherBackendOrigin()
const proxyTimeoutMs = Number(process.env.MESHER_PROXY_TIMEOUT_MS || 15_000)
const proxyAttemptTimeoutMs = Number(process.env.MESHER_PROXY_ATTEMPT_TIMEOUT_MS || 1_500)
const maxProxyBodyBytes = Number(process.env.MESHER_PROXY_MAX_BODY_BYTES || 5 * 1024 * 1024)
const gracefulShutdownMs = Number(process.env.GRACEFUL_SHUTDOWN_MS || 10_000)
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
])

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
])

async function fileExists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

function resolveClientAsset(url) {
  let pathname
  try {
    pathname = decodeURIComponent(new URL(url, `http://127.0.0.1:${port}`).pathname)
  } catch {
    return null
  }
  const relativePath = pathname.replace(/^\/+/, '')
  const candidate = path.resolve(clientRoot, relativePath)
  const relativeCandidate = path.relative(clientRoot, candidate)

  if (relativeCandidate.startsWith('..') || path.isAbsolute(relativeCandidate)) {
    return null
  }

  return candidate
}

async function maybeServeStatic(req, res) {
  const candidate = resolveClientAsset(req.url || '/')

  if (!candidate || !(await fileExists(candidate))) {
    return false
  }

  const info = await stat(candidate)
  if (!info.isFile()) {
    return false
  }

  const ext = path.extname(candidate)
  res.statusCode = 200
  applySecurityHeaders(res)
  res.setHeader(
    'Cache-Control',
    candidate.includes(`${path.sep}assets${path.sep}`)
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
  )
  res.setHeader('Content-Length', info.size)
  res.setHeader('Content-Type', contentTypes.get(ext) || 'application/octet-stream')
  createReadStream(candidate).pipe(res)
  return true
}

function shouldProxyMesherApi(url = '/') {
  const pathname = new URL(url, `http://127.0.0.1:${port}`).pathname
  return pathname === '/api/v1' || pathname.startsWith('/api/v1/')
}

function buildProxyHeaders(req) {
  const headers = new Headers()

  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null || HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      continue
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        headers.append(key, entry)
      }
      continue
    }

    headers.set(key, value)
  }

  if (req.headers.host) {
    headers.set('x-forwarded-host', req.headers.host)
  }

  headers.set('x-forwarded-proto', 'http')
  return headers
}

class ProxyBodyTooLargeError extends Error {}

function boundedRequestBody(req) {
  let receivedBytes = 0
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      receivedBytes += chunk.length
      if (receivedBytes > maxProxyBodyBytes) {
        callback(new ProxyBodyTooLargeError('request body exceeds proxy limit'))
        return
      }
      callback(null, chunk)
    },
  })
  return Readable.toWeb(req.pipe(limiter))
}

function buildProxyRequestInit(req, signal) {
  const init = {
    method: req.method,
    headers: buildProxyHeaders(req),
    signal,
  }

  if (req.method && !['GET', 'HEAD'].includes(req.method)) {
    init.body = boundedRequestBody(req)
    init.duplex = 'half'
  }

  return init
}

async function fetchMesherUpstream(upstreamUrl, req, signal) {
  const maxAttempts = ['GET', 'HEAD'].includes(req.method || '') ? 2 : 1
  let lastError

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const attemptSignal = maxAttempts > 1
      ? AbortSignal.any([signal, AbortSignal.timeout(proxyAttemptTimeoutMs)])
      : signal
    try {
      return await fetch(upstreamUrl, buildProxyRequestInit(req, attemptSignal))
    } catch (error) {
      lastError = error
      if (signal.aborted || attempt === maxAttempts) {
        throw error
      }
    }
  }

  throw lastError
}

async function maybeProxyMesherApi(req, res) {
  if (!shouldProxyMesherApi(req.url)) {
    return false
  }

  const upstreamUrl = new URL(req.url || '/', mesherBackendOrigin)
  const contentLength = Number(req.headers['content-length'] || 0)
  if (Number.isFinite(contentLength) && contentLength > maxProxyBodyBytes) {
    sendProxyError(res, 413, 'request_too_large', 'Request body exceeds the proxy limit')
    return true
  }

  const clientAbort = new AbortController()
  const onClientAbort = () => clientAbort.abort(new Error('client disconnected'))
  req.once('aborted', onClientAbort)
  const signal = AbortSignal.any([clientAbort.signal, AbortSignal.timeout(proxyTimeoutMs)])

  try {
    const response = await fetchMesherUpstream(upstreamUrl, req, signal)
    await sendResponse(res, response)
  } catch (error) {
    if (req.aborted || res.destroyed) {
      return true
    }
    const message = error instanceof Error ? error.message : 'unknown error'
    console.error('[mesher-client] failed to proxy request to Mesher backend', message)
    if (error instanceof ProxyBodyTooLargeError || error?.cause instanceof ProxyBodyTooLargeError) {
      sendProxyError(res, 413, 'request_too_large', 'Request body exceeds the proxy limit')
    } else if (signal.aborted || error?.name === 'TimeoutError') {
      sendProxyError(res, 504, 'upstream_timeout', 'Mesher backend timed out')
    } else {
      sendProxyError(res, 502, 'upstream_unavailable', 'Mesher backend unavailable')
    }
  } finally {
    req.off('aborted', onClientAbort)
  }

  return true
}

function applySecurityHeaders(res, scriptNonce = '') {
  const scriptPolicy = scriptNonce ? `'self' 'nonce-${scriptNonce}'` : "'self'"
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'self'; base-uri 'self'; connect-src 'self' http: https: ws: wss:; font-src 'self' data:; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: blob:; object-src 'none'; script-src ${scriptPolicy}; style-src 'self' 'unsafe-inline'`,
  )
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
}

function sendProxyError(res, status, code, message) {
  if (res.headersSent || res.destroyed) return
  res.statusCode = status
  applySecurityHeaders(res)
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify({ error: { code, message } }))
}

function toRequest(req) {
  const url = new URL(req.url || '/', `http://${req.headers.host || `127.0.0.1:${port}`}`)
  const init = {
    method: req.method,
    headers: req.headers,
  }

  if (req.method && !['GET', 'HEAD'].includes(req.method)) {
    init.body = Readable.toWeb(req)
    init.duplex = 'half'
  }

  return new Request(url, init)
}

function applyHeaders(res, headers) {
  const setCookie = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : []

  for (const [key, value] of headers.entries()) {
    if (key.toLowerCase() === 'set-cookie') {
      continue
    }
    res.setHeader(key, value)
  }

  if (setCookie.length > 0) {
    res.setHeader('set-cookie', setCookie)
  }
}

async function sendResponse(res, response) {
  res.statusCode = response.status
  res.statusMessage = response.statusText
  applyHeaders(res, response.headers)
  const contentType = response.headers.get('content-type') || ''
  if (response.body && contentType.includes('text/html')) {
    const nonce = randomBytes(18).toString('base64url')
    const html = (await response.text()).replace(
      /<script(?![^>]*\bnonce=)/g,
      `<script nonce="${nonce}"`,
    )
    applySecurityHeaders(res, nonce)
    res.setHeader('Content-Length', Buffer.byteLength(html))
    res.end(html)
    return
  }

  applySecurityHeaders(res)
  if (!res.hasHeader('Cache-Control')) {
    res.setHeader('Cache-Control', 'no-store')
  }

  if (!response.body) {
    res.end()
    return
  }

  Readable.fromWeb(response.body).pipe(res)
}

export const server = createServer(async (req, res) => {
  try {
    if (await maybeProxyMesherApi(req, res)) {
      return
    }

    if (await maybeServeStatic(req, res)) {
      return
    }

    const request = toRequest(req)
    const response = await handler.fetch(request)
    await sendResponse(res, response)
  } catch (error) {
    console.error(error)
    res.statusCode = 500
    applySecurityHeaders(res)
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.end('Internal Server Error')
  }
})

export function startServer() {
  server.listen(port, () => {
    console.log(`TanStack Start server listening on http://localhost:${port}`)
  })
}

function beginGracefulShutdown(signal) {
  console.log(`[mesher-client] ${signal} received; draining connections`)
  const forceTimer = setTimeout(() => {
    console.error('[mesher-client] graceful shutdown timed out; closing active connections')
    server.closeAllConnections()
  }, gracefulShutdownMs)
  forceTimer.unref()
  server.close((error) => {
    clearTimeout(forceTimer)
    if (error) {
      console.error('[mesher-client] shutdown failed', error)
      process.exitCode = 1
    }
  })
  server.closeIdleConnections()
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer()
  process.once('SIGTERM', () => beginGracefulShutdown('SIGTERM'))
  process.once('SIGINT', () => beginGracefulShutdown('SIGINT'))
}

export { resolveClientAsset }
