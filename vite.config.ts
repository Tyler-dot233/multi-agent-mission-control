import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'
import { scanAgents, killAgentPid } from './server/scanner.mjs'

// Dev-server middleware exposing the local machine monitor API.
// (Production equivalent lives in server/serve.mjs)
function monitorApi(): Plugin {
  const json = (res: any, code: number, obj: unknown) => {
    res.statusCode = code
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(obj))
  }
  return {
    name: 'agent-monitor-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          if (req.url === '/api/scan') {
            return json(res, 200, await scanAgents())
          }
          if (req.url === '/api/kill' && req.method === 'POST') {
            let body = ''
            req.on('data', (c) => (body += c))
            req.on('end', async () => {
              try {
                const { pid } = JSON.parse(body || '{}')
                json(res, 200, await killAgentPid(pid))
              } catch (err: any) {
                json(res, 400, { error: String(err?.message || err) })
              }
            })
            return
          }
          next()
        } catch (err: any) {
          json(res, 500, { error: String(err?.message || err) })
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [inspectAttr(), react(), monitorApi()],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
