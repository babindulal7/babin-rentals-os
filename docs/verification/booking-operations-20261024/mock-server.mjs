import { createServer } from 'vite'
process.env.VITE_DATA_SOURCE = 'mock'
const server = await createServer({
  mode: 'mock',
  cacheDir: 'artifacts/booking-operations-20261024/vite-cache',
  server: { host: '127.0.0.1', port: 3021, strictPort: true, open: false },
})
await server.listen()
console.log('Local mock preview: http://127.0.0.1:3021')
