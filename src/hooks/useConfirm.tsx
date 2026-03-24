import { useState, useCallback } from 'react';
import { Modal } from '../components/Modal';

export const useConfirm = () => {
  const [promise, setPromise] = useState<{ resolve: (value: boolean) => void } | null>(null);
  const [options, setOptions] = useState({ title: '확인', message: '' });

  // confirm 함수를 호출하면 Promise를 반환합니다.
  const confirm = useCallback((message: string, title: string = '확인') => {
    return new Promise<boolean>((resolve) => {
      setOptions({ title, message });
      setPromise({ resolve }); // Promise의 resolve 함수를 상태로 저장
    });
  }, []);

  const handleClose = useCallback(() => {
    promise?.resolve(false); // 취소 시 false 반환
    setPromise(null);
  }, [promise]);

  const handleConfirm = useCallback(() => {
    promise?.resolve(true); // 확인 시 true 반환
    setPromise(null);
  }, [promise]);

  // Hook을 사용하는 곳에서 렌더링할 모달 컴포넌트
  const ConfirmModal = useCallback(() => (
    <Modal open={promise !== null} title={options.title} onClose={handleClose} maxWidth="max-w-md">
      <div className="space-y-6">
        <p className="whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-300">
          {options.message}
        </p>
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={handleClose}
            className="rounded-xl px-4 py-2 text-sm font-bold text-zinc-500 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            취소
          </button>
          <button
            onClick={handleConfirm}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-md transition-colors hover:bg-indigo-500"
          >
            확인
          </button>
        </div>
      </div>
    </Modal>
  ), [promise, options, handleClose, handleConfirm]);

  return { confirm, ConfirmModal };
};