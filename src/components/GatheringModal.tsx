import React, { useState } from 'react';
import { Modal } from './Modal';
import { Megaphone, Calendar, Clock, MessageSquare, Loader2, Swords, ChevronDown } from 'lucide-react';
import { RAID_META } from '../constants';
import { toast } from 'sonner'; // ✨ 추가

interface GatheringModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GatheringModal: React.FC<GatheringModalProps> = ({ isOpen, onClose }) => {
   // ✨ 추가
  const [targetDate, setTargetDate] = useState('');
  const [targetTime, setTargetTime] = useState('21:00');
  const [targetRaid, setTargetRaid] = useState('DECIDE_LATER'); 
  const [memo, setMemo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetDate || !targetTime) {
      toast.error('날짜와 시간을 입력해주세요.'); // ✨ 교체
      return;
    }

    try {
      setIsSubmitting(true);
      const WORKER_URL = 'https://discord-bot.sunnypop424.workers.dev/api/discord-gathering'; 
      const raidLabel = targetRaid === 'DECIDE_LATER' 
        ? '모여서 정합니다' 
        : RAID_META[targetRaid as keyof typeof RAID_META].label;

      const response = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: targetDate, time: targetTime, raid: raidLabel, memo: memo || '숙제 위주로 빠르게 뺍니다!',
        }),
      });

      if (!response.ok) throw new Error('디스코드 알림 전송에 실패했습니다.');

      toast.success('디스코드로 모집 알림이 전송되었습니다!'); // ✨ 교체
      onClose();
      setTargetDate(''); setTargetRaid('DECIDE_LATER'); setMemo('');
      
    } catch (error) {
      console.error(error);
      toast.error('전송 중 오류가 발생했습니다. Worker URL과 상태를 확인해주세요.'); // ✨ 교체
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal open={isOpen} title="레이드 파티 모집" onClose={onClose} maxWidth="max-w-3xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6 pb-2">
        <div className="flex flex-col gap-4 rounded-2xl border border-indigo-100 bg-indigo-50/30 p-5 dark:border-indigo-900/30 dark:bg-indigo-900/10">
          <h4 className="flex items-center gap-2 text-sm font-bold text-indigo-700 dark:text-indigo-400">
            <Megaphone size={18} /> 알림 발송 설정
          </h4>
          <p className="text-[11px] font-medium text-indigo-600/70 dark:text-indigo-300/70 mt-[-8px]">
            디스코드 모집 전용 채널에 파티 알림을 전송합니다. <br/>
            유저들은 디스코드 메시지 내의 [참여하기] 버튼을 통해 신청할 수 있습니다.
          </p>

          <div className="grid gap-4 sm:grid-cols-2 mt-2">
            <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
              <label className="flex items-center gap-1.5 text-xs font-bold text-zinc-500"><Calendar size={14} /> 날짜</label>
              <input type="date" required value={targetDate} onChange={(e) => setTargetDate(e.target.value)} disabled={isSubmitting} className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-700 transition-all focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200" />
            </div>
            
            <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
              <label className="flex items-center gap-1.5 text-xs font-bold text-zinc-500"><Clock size={14} /> 시간</label>
              <input type="time" required value={targetTime} onChange={(e) => setTargetTime(e.target.value)} disabled={isSubmitting} className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-700 transition-all focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200" />
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
            <label className="flex items-center gap-1.5 text-xs font-bold text-zinc-500"><Swords size={14} /> 진행 레이드</label>
            <div className="relative">
              <select value={targetRaid} onChange={(e) => setTargetRaid(e.target.value)} disabled={isSubmitting} className="w-full appearance-none cursor-pointer rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 pr-10 text-sm font-medium text-zinc-700 transition-all focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                <option value="DECIDE_LATER">모여서 정합니다.</option>
                {Object.entries(RAID_META).map(([id, meta]) => <option key={id} value={id}>{meta.label}</option>)}
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
            <label className="flex items-center gap-1.5 text-xs font-bold text-zinc-500"><MessageSquare size={14} /> 추가 메모</label>
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} disabled={isSubmitting} placeholder="예) 종막 하드 1~2관문 가실 분 모집합니다!" rows={2} className="w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-700 transition-all focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200" />
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-zinc-100 pt-6 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-end">
          <button type="button" onClick={onClose} disabled={isSubmitting} className="w-full rounded-xl px-6 py-3 text-sm font-bold text-zinc-500 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 sm:w-auto">취소</button>
          <button type="submit" disabled={isSubmitting} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-8 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition-colors hover:bg-indigo-500 disabled:opacity-70 sm:w-auto">
            {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Megaphone size={18} />}
            {isSubmitting ? '전송 중...' : '디스코드로 알림 보내기'}
          </button>
        </div>
      </form>
    </Modal>
  );
};