import { defineConfig } from 'astro/config'
import unocss from 'unocss/astro'
import solidJs from '@astrojs/solid-js'
import AstroPWA from '@vite-pwa/astro'
import wasm from 'vite-plugin-wasm'

// https://astro.build/config
export default defineConfig({
  integrations: [
    unocss(),
    solidJs(),
    AstroPWA({
      registerType: 'autoUpdate',
      injectRegister: 'inline',
      // Rest of your PWA configuration
    }),
  ],
  output: 'server',
  vite: {
    plugins: [
      wasm(),
    ],
    optimizeDeps: {
      include: ['tiktoken'],
    },
  },
})
