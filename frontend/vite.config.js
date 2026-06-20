import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Strip problematic CSS properties that cause Firefox warnings
const stripLegacyCss = () => ({
  name: 'strip-legacy-css',
  generateBundle(_, bundle) {
    for (const file of Object.values(bundle)) {
      if (file.type === 'asset' && file.fileName.endsWith('.css')) {
        let css = file.source
        // Remove -webkit-text-size-adjust (Firefox warns about this)
        css = css.replace(/-webkit-text-size-adjust:100%;?/g, '')
        // Remove @media (prefers-contrast: high){...} blocks (unsupported in some browsers)
        css = css.replace(/@media\s*\(prefers-contrast:\s*high\)\s*\{[^}]*\{[^}]*\}\s*[^}]*\{[^}]*\}\s*\}/g, '')
        // Balance braces: remove trailing excess closing braces left by regex removals
        {
          const opens = (css.match(/\{/g) || []).length
          const closes = (css.match(/\}/g) || []).length
          if (closes > opens) {
            for (let i = 0; i < closes - opens; i++) {
              css = css.replace(/\}(\s*)$/, '$1')
            }
          }
        }
        // Remove image-rendering: -webkit-optimize-contrast (IE/legacy)
        css = css.replace(/image-rendering:\s*-webkit-optimize-contrast;?/g, '')
        // Remove behavior: url(#default#VML) (IE VML)
        css = css.replace(/behavior:\s*url\(#default#VML\);?/g, '')
        // Remove progid DX filters (IE)
        css = css.replace(/-ms-filter:\s*"progid:[^"]*";?/g, '')
        css = css.replace(/filter:\s*progid:[^;]*;?/g, '')
        // Remove ::-webkit- only rulesets that Firefox rejects as bad selectors
        css = css.replace(/::-webkit-inner-spin-button,::-webkit-outer-spin-button\{[^}]*\}/g, '')
        css = css.replace(/::-webkit-search-decoration\{[^}]*\}/g, '')
        css = css.replace(/::-webkit-file-upload-button\{[^}]*\}/g, '')
        file.source = css
      }
    }
  }
})

export default defineConfig({
  plugins: [react(), stripLegacyCss()],
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      external: ['@capacitor/camera'],
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-charts': ['recharts'],
          'vendor-map': ['leaflet', 'react-leaflet'],
          'vendor-ui': ['lucide-react'],
        }
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8084',
        changeOrigin: true
      }
    }
  }
})