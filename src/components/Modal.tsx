import React from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ open, title, onClose, children }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      
      {/* Content */}
      <div className="font-['Paperozi'] relative z-10 w-full max-w-3xl transform overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-zinc-900/5 transition-all dark:bg-zinc-900 dark:ring-zinc-800">
        <div className="flex items-center justify-between border-b border-zinc-100 bg-white/50 px-6 py-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/50">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            {title ?? '정보'}
          </h2>
          <button
            type="button"
            className="rounded-full bg-zinc-100 p-2 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto px-6 py-6 scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700">
          {children}
        </div>
      </div>
    </div>
  );
};