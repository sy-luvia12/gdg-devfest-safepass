import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // .env.local 없이 배포용 빌드를 하면 조용히 mock 앱이 만들어진다. Firebase 설정이 없으면 빌드를 막는다.
  if (command === 'build') {
    const env = loadEnv(mode, process.cwd(), 'VITE_')
    const hasFirebase = Boolean(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID)
    if (!hasFirebase && env.VITE_BACKEND !== 'mock') {
      throw new Error(
        'Firebase 설정(VITE_FIREBASE_API_KEY, VITE_FIREBASE_PROJECT_ID)이 없습니다. .env.local을 만들거나, mock 빌드라면 VITE_BACKEND=mock 을 지정하세요.',
      )
    }
  }
  return {
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  }
})
