import { defineConfig } from 'vite'

export default defineConfig({
  server: { host: true, port: 5183 },
  preview: { host: true, port: 5183 },
  build: { target: 'es2019' },
})
