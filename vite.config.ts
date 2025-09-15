import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import sourceIdentifierPlugin from 'vite-plugin-source-info'

const isProd = process.env.BUILD_MODE === 'prod'

// GitHub Pages 的 base 路径配置
// 如果是用户/组织页面 (username.github.io)，使用 '/'
// 如果是项目页面 (username.github.io/project-name)，使用 '/project-name/'
const base = '/'

export default defineConfig({
  base: base,
  plugins: [
    react(), 
    sourceIdentifierPlugin({
      enabled: !isProd,
      attributePrefix: 'data-matrix',
      includeProps: true,
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: undefined,
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  },
  // 确保 public 目录下的文件使用相对路径
  publicDir: 'public'
})