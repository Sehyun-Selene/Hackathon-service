import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' — 어떤 하위 경로에 배포해도 동작하도록 상대 경로 사용
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5173 },
})
