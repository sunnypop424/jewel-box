// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate', // 서비스 워커 자동 업데이트
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'safari-pinned-tab.svg'], // 정적 에셋 포함
      manifest: {
        name: 'Jewel Box',
        short_name: 'Jewel Box',
        description: '로스트아크 주간 레이드 및 일정 관리 앱',
        theme_color: '#121212', // 예: 다크 모드를 기본으로 가정
        background_color: '#121212',
        display: 'standalone', // 브라우저 UI 없이 앱처럼 보이게 설정
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable' // 안드로이드 등에서 아이콘에 마스크를 씌울 수 있도록 허용
          }
        ]
      }
    })
  ],
  // repo 이름에 맞게 '/jewel-box/' 수정
  base: '/jewel-box/',
});