import path from 'path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  // Load ALL env vars (empty prefix = include non-VITE_ ones like LIVEBLOCKS_SECRET_KEY)
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'liveblocks-api',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            // POST /api/log — debug connection events, prints to terminal
            if (req.url?.startsWith('/api/log') && req.method === 'POST') {
              let body = ''
              req.on('data', (chunk) => { body += chunk })
              req.on('end', () => {
                try {
                  const { event, name, roomId, total } = JSON.parse(body)
                  if (event === 'connect') {
                    console.log(`[room] → JOIN   ${String(name).padEnd(20)} room=${roomId}`)
                  } else if (event === 'disconnect') {
                    console.log(`[room] ← LEAVE  ${String(name).padEnd(20)} room=${roomId}`)
                  } else if (event === 'count') {
                    console.log(`[room] ● total  ${String(total).padEnd(20)} room=${roomId}`)
                  }
                } catch {
                  console.log('[room] log parse error:', body)
                }
                res.statusCode = 204
                res.end()
              })
              return
            }

            if (!req.url?.startsWith('/api/delete-room') || (req.method !== 'DELETE' && req.method !== 'POST')) {
              next()
              return
            }

            const url = new URL(req.url, 'http://localhost')
            const roomId = url.searchParams.get('roomId')

            if (!roomId) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'roomId required' }))
              return
            }

            const secretKey = env.LIVEBLOCKS_SECRET_KEY
            if (!secretKey) {
              console.error('[liveblocks-api] LIVEBLOCKS_SECRET_KEY is not set in .env.local')
              res.statusCode = 500
              res.end(JSON.stringify({ error: 'LIVEBLOCKS_SECRET_KEY not configured' }))
              return
            }

            try {
              console.log(`[liveblocks-api] Deleting room: ${roomId}`)
              const lb = await fetch(
                `https://api.liveblocks.io/v2/rooms/${encodeURIComponent(roomId)}`,
                {
                  method: 'DELETE',
                  headers: { Authorization: `Bearer ${secretKey}` },
                }
              )
              console.log(`[liveblocks-api] Liveblocks responded: ${lb.status}`)
              res.statusCode = lb.status
              res.end()
            } catch (err) {
              console.error('[liveblocks-api] Fetch failed:', err)
              res.statusCode = 502
              res.end(JSON.stringify({ error: 'Liveblocks unreachable' }))
            }
          })
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})
