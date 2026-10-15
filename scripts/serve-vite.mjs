import { createServer } from 'vite'

const server = await createServer({
  server: {
    port: 3000,
    host: true,
  },
})

await server.listen()
server.printUrls()

// Keep the event loop alive indefinitely
setInterval(() => {}, 2147483647)
