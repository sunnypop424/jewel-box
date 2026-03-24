import React, { useState } from 'react';
import { Modal } from './Modal';
import { Shield, Swords, ChevronDown, UserPlus } from 'lucide-react';
import { JOB_OPTIONS, ROLE_OPTIONS } from '../constants';
import type { Role } from '../types';
import { toast } from 'sonner'; // ✨ 추가

interface GuestAddModalProps {
    isOpen: boolean; onClose: () => void; onAdd: (role: Role, jobCode: string) => void; raidLabel: string;
}

export const GuestAddModal: React.FC<GuestAddModalProps> = ({ isOpen, onClose, onAdd, raidLabel }) => {
     // ✨ 추가
    const [role, setRole] = useState<Role>('DPS');
    const [jobCode, setJobCode] = useState('');

    const handleAdd = () => {
        if (!jobCode) {
            toast.error('직업을 선택해주세요.'); // ✨ 교체
            return;
        }
        onAdd(role, jobCode);
        setJobCode('');
        onClose();
    };

    return (
        <Modal open={isOpen} onClose={onClose} title={`${raidLabel} 게스트 추가`} maxWidth="max-w-md">
            <div className="space-y-6 py-2">
                <div className="space-y-2">
                    <label className="text-sm font-bold text-zinc-900 dark:text-zinc-100">포지션</label>
                    <div className="relative">
                        <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400">
                            {role === 'SUPPORT' ? <Shield size={18} /> : <Swords size={18} />}
                        </div>
                        <select className={`w-full appearance-none rounded-xl border px-4 py-3 pl-11 text-sm font-bold transition-all focus:outline-none ${role === 'SUPPORT' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-400' : 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100'}`} value={role} onChange={(e) => setRole(e.target.value as Role)}>
                            {ROLE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                        <ChevronDown size={18} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-bold text-zinc-900 dark:text-zinc-100">직업</label>
                    <div className="relative">
                        <select className="w-full appearance-none rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-bold text-zinc-700 transition-all focus:border-indigo-500 focus:bg-white dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" value={jobCode} onChange={(e) => setJobCode(e.target.value)}>
                            <option value="">직업을 선택하세요</option>
                            {JOB_OPTIONS.map(job => <option key={job} value={job}>{job}</option>)}
                        </select>
                        <ChevronDown size={18} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                    </div>
                </div>

                <div className="flex flex-col-reverse gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-800 sm:flex-row">
                    <button onClick={onClose} className="w-full flex-1 rounded-xl bg-zinc-100 py-3 text-sm font-bold text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700">취소</button>
                    <button onClick={handleAdd} className="inline-flex w-full flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 transition-all hover:bg-indigo-500"><UserPlus size={18} />게스트 추가하기</button>
                </div>
            </div>
        </Modal>
    );
};