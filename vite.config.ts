// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// repo 이름에 맞게 '/jewel-box/' 수정
export default defineConfig({
  plugins: [react()],
  base: '/jewel-box/',
});