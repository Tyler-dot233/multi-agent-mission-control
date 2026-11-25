// Standalone / embedded production server: dist/ static files + local monitor APIs.
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanAgents, killAgentPid } from './scanner.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const defaultDistDir = path.join(__dirname, '..', 'dist')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(obj))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > 16 * 1024) reject(new Error('request body too large'))
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

/** Start the loopback-only monitor server. port=0 selects a free port (desktop mode). */
export function startMonitorServer({ port = 4173, host = '127.0.0.1', distDir = defaultDistDir } = {}) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost')
    try {
      if (url.pathname === '/api/scan') {
        return sendJson(res, 200, await scanAgents())
      }
      if (url.pathname === '/api/kill' && req.method === 'POST') {
        const body = JSON.parse((await readBody(req)) || '{}')
        return sendJson(res, 200, await killAgentPid(body.pid))
      }

      // Static files with SPA fallback. Decode first and keep every request inside distDir.
      const pathname = decodeURIComponent(url.pathname)
      let file = path.resolve(distDir, `.${pathname === '/' ? '/index.html' : pathname}`)
      if (file !== distDir && !file.startsWith(`${distDir}${path.sep}`)) {
        return sendJson(res, 403, { error: 'forbidden' })
      }
      if (!existsSync(file)) file = path.join(distDir, 'index.html')
      const ext = path.extname(file)
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
      res.end(await readFile(file))
    } catch (err) {
      sendJson(res, 500, { error: String(err?.message || err) })
    }
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      const address = server.address()
      const actualPort = typeof address === 'object' && address ? address.port : port
      console.log(`[agent-monitor] listening on http://${host}:${actualPort}`)
      resolve({ server, port: actualPort, host })
    })
  })
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isCli) {
  startMonitorServer({ port: Number(process.env.PORT || 4173) }).catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
}
