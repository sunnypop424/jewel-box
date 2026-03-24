import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';

interface ToastOptions {
  type?: 'success' | 'error' | 'info';
  description?: string;
}

interface ToastContextType {
  // 기존 문자열 타입과 객체 옵션을 모두 지원하도록 오버로딩
  toast: (title: string, typeOrOptions?: 'success' | 'error' | 'info' | ToastOptions) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Array<{ id: number; title: string; description?: string; type: string }>>([]);

  const toast = useCallback((title: string, typeOrOptions?: 'success' | 'error' | 'info' | ToastOptions) => {
    let type = 'info';
    let description = '';

    // 기존처럼 toast.success('메시지') 로 호출한 경우
    if (typeof typeOrOptions === 'string') {
      type = typeOrOptions;
    } 
    // 새로운 방식으로 toast.success('제목', { type: 'error', description: '설명' }) 형태로 호출한 경우
    else if (typeOrOptions) {
      type = typeOrOptions.type || 'info';
      description = typeOrOptions.description || '';
    }

    const id = Date.now();
    setToasts((prev) => [...prev, { id, title, description, type }]);

    // 4초 후 자동 삭제
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* 토스트 컨테이너 - 우측 하단 고정, 최신 알림이 아래로 쌓이도록 flex-col 유지 */}
      <div className="fixed bottom-0 right-0 z-[9999] m-0 flex w-full flex-col gap-3 p-4 pointer-events-none sm:w-auto sm:min-w-[356px]">
        {toasts.map((t) => (
          <div
            key={t.id}
            // 올려주신 소스와 동일한 팝오버 스타일 + 하단에서 스르륵 올라오는 부드러운 애니메이션
            className="group pointer-events-auto relative flex w-full items-start gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-lg transition-all duration-300 ease-out animate-in fade-in-0 slide-in-from-bottom-5 dark:border-zinc-800 dark:bg-zinc-950"
          >
            {/* 우측 상단 닫기 버튼 (평소엔 투명, 마우스 올리면 나타남) */}
            <button
              onClick={() => removetoast.success(t.id)}
              className="absolute right-2 top-2 rounded-md p-1 text-zinc-400 opacity-0 transition-opacity hover:text-zinc-900 group-hover:opacity-100 dark:hover:text-zinc-100"
            >
              <X className="h-4 w-4" />
            </button>

            {/* 좌측 아이콘 영역 */}
            <div className="shrink-0 mt-0.5">
              {t.type === 'error' && <AlertCircle className="h-5 w-5 text-rose-500 fill-rose-500/20" />}
              {t.type === 'success' && <CheckCircle2 className="h-5 w-5 text-emerald-500 fill-emerald-500/20" />}
              {t.type === 'info' && <Info className="h-5 w-5 text-blue-500 fill-blue-500/20" />}
            </div>

            {/* 컨텐츠 (제목 + 설명) 영역 */}
            <div className="flex flex-1 flex-col gap-1 pr-6">
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {t.title}
              </div>
              {t.description && (
                <div className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                  {t.description}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
};