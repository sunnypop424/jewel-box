import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { BrowserRouter } from 'react-router-dom';

// ✨ sonner 라이브러리에서 Toaster 불러오기
import { Toaster } from 'sonner';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter basename="/jewel-box/">
      <App />
      {/* ✨ 앱의 최상단에 Toaster 컴포넌트를 마운트합니다. */}
      <Toaster 
        richColors 
        position="top-center" 
        toastOptions={{
          style: { fontFamily: "'Paperozi', sans-serif" },
          className: "font-sans" // Tailwind의 font-sans도 함께 적용
        }}
        expand={true} // (선택) 여러 개 띄울 때 예쁘게 펼쳐지게 하고 싶다면
      />
    </BrowserRouter>
  </React.StrictMode>,
);