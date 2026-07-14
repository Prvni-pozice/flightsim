import { defineConfig } from 'vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { resolve } from 'node:path'

// HTTPS je NUTNÉ: iOS Safari dává DeviceOrientation (náklon telefonu)
// jen v secure contextu. Self-signed cert → telefon jednou potvrdí výjimku.
export default defineConfig({
  plugins: [basicSsl()],
  server: { host: true, port: 5183 },
  preview: { host: true, port: 5183 },
  build: {
    target: 'es2019',
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        skrysov: resolve(__dirname, 'skrysov.html'),
        redbull: resolve(__dirname, 'redbull.html'),
      },
    },
  },
})
