import React, { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: 'max-w-md' | 'max-w-lg' | 'max-w-xl' | 'max-w-2xl' | 'max-w-3xl' | 'max-w-4xl' | 'max-w-5xl' | 'max-w-6xl' | 'max-w-7xl';
}

export const Modal: React.FC<ModalProps> = ({ 
  open, 
  title, 
  onClose, 
  children,
  maxWidth = 'max-w-3xl'
}) => {
  // 🌟 애니메이션 처리를 위한 2단계 상태 관리
  const [isMounted, setIsMounted] = useState(false); // DOM 렌더링 여부
  const [isVisible, setIsVisible] = useState(false); // CSS 애니메이션 (opacity, transform) 여부

  useEffect(() => {
    if (open) {
      setIsMounted(true);
      // DOM이 마운트된 직후 애니메이션이 발동하도록 아주 짧은 지연을 줍니다.
      const timer = setTimeout(() => setIsVisible(true), 10);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
      // 닫힐 때는 애니메이션 시간(300ms)이 끝난 후 DOM에서 완전히 제거합니다.
      const timer = setTimeout(() => setIsMounted(false), 300);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // 마운트조차 되지 않았다면 렌더링하지 않음
  if (!isMounted) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 🌟 Backdrop (배경 흐림) 애니메이션 */}
      <div 
        className={`absolute inset-0 bg-zinc-900/60 backdrop-blur-sm transition-opacity duration-300 ease-out ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />
      
      {/* 🌟 Content (모달 창) 애니메이션 */}
      <div 
        className={`relative z-10 w-full ${maxWidth} transform overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-zinc-900/5 transition-all duration-300 ease-out dark:bg-zinc-900 dark:ring-zinc-800 ${
          isVisible 
            ? 'translate-y-0 scale-100 opacity-100' // 열렸을 때 (정위치, 원래 크기)
            : 'translate-y-8 scale-95 opacity-0'    // 닫혔을 때 (아래로 쳐짐, 약간 축소)
        }`}
      >
        <div className="flex items-center justify-between border-b border-zinc-100 bg-white/50 px-6 py-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/50">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            {title ?? '정보'}
          </h2>
          <button
            type="button"
            className="rounded-full bg-zinc-100 p-2 text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[85vh] overflow-y-auto px-6 py-6 scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700">
          {children}
        </div>
      </div>
    </div>
  );
};