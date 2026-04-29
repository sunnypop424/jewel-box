import React, { useEffect, useMemo, useState } from 'react';
import { Coins, Plus, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from './Modal';
import { MissionCard } from './MissionCard';
import { MissionCreateModal } from './MissionCreateModal';
import { RouletteGame } from './RouletteGame';
import {
  subscribeMissions,
  createMission,
  updateMission,
  deleteMission,
} from '../api/firebaseApi';
import { postMissionSettledMessage, deleteMissionMessage, refreshMissionMessage } from '../api/missionNotifier';
import { getMissionDisplayTitle } from '../utils/missionTitle';
import type { Mission, MissionStatus, NewMission } from '../types';
import { useConfirm } from '../hooks/useConfirm';

interface Props {
  allUserNames: string[];
}

type FilterKey = 'ACTIVE' | 'SETTLING' | 'DONE' | 'ALL';

const FILTERS: { key: FilterKey; label: string; statuses: MissionStatus[] }[] = [
  { key: 'ACTIVE', label: '진행 중', statuses: ['OPEN', 'RESOLVING'] },
  { key: 'SETTLING', label: '정산 대기', statuses: ['SETTLED'] },
  { key: 'DONE', label: '종료', statuses: ['COMPLETED', 'FAILED', 'VOIDED'] },
  { key: 'ALL', label: '전체', statuses: ['OPEN', 'RESOLVING', 'SETTLED', 'COMPLETED', 'FAILED', 'VOIDED'] },
];

export const MissionBoard: React.FC<Props> = ({ allUserNames }) => {
  const { confirm, ConfirmModal } = useConfirm();

  const [missions, setMissions] = useState<Mission[]>([]);
  const [filter, setFilter] = useState<FilterKey>('ACTIVE');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [rouletteCtx, setRouletteCtx] = useState<Mission | null>(null);
  const [voidCtx, setVoidCtx] = useState<{ mission: Mission; reason: string } | null>(null);

  // 실시간 구독
  useEffect(() => {
    const unsub = subscribeMissions(
      (list) => setMissions(list),
      (err) => {
        console.error('[MissionBoard] subscribe error:', err);
        toast.error('미션 보드를 불러오지 못했습니다.');
      },
    );
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter);
    if (!f) return missions;
    return missions.filter((m) => f.statuses.includes(m.status));
  }, [missions, filter]);

  const handleCreate = async (data: NewMission) => {
    await createMission(data);
    toast.success('미션이 등록되었습니다.');
    // SETTLED 상태로 들어간 미션(DIRECT 또는 결정 후)은 아래 useEffect 가 알림을 발송함.
  };

  // SETTLED 인데 discordMessageId 가 없는 미션 → 한번만 알림 발송 후 messageId 저장.
  // 여러 클라이언트가 동시에 시도할 수 있지만, Firestore 의 onSnapshot 으로 동기화되며 중복 발송은 워커 측에서
  // 알림이 이미 게시된 미션은 messageId 가 곧 채워지므로 race window 가 짧다.
  // 완벽한 멱등성은 transaction 으로 가능하지만 여기서는 race 를 허용 (캐주얼 도구).
  const sendingRef = React.useRef<Set<string>>(new Set());
  useEffect(() => {
    const candidates = missions.filter((m) => m.status === 'SETTLED' && !m.discordMessageId && m.winner);
    candidates.forEach(async (m) => {
      if (sendingRef.current.has(m.id)) return;
      sendingRef.current.add(m.id);
      const messageId = await postMissionSettledMessage({
        missionId: m.id,
        issuer: m.issuer,
        winner: m.winner!,
        goldAmount: m.goldAmount,
        // title 비어있는 POOL 미션은 룰/기준 라벨로 폴백.
        title: getMissionDisplayTitle(m),
        type: m.type,
      });
      if (messageId) {
        await updateMission(m.id, { discordMessageId: messageId });
      }
      // 실패해도 sendingRef 에서 제거하여 재시도는 가능하도록.
      sendingRef.current.delete(m.id);
    });
  }, [missions]);

  const handleMarkSuccess = async (m: Mission) => {
    if (m.type === 'DIRECT') return; // DIRECT 는 OPEN 상태가 없음
    await updateMission(m.id, { status: 'RESOLVING' });
  };

  const handleMarkFailed = async (m: Mission) => {
    await updateMission(m.id, { status: 'FAILED' });
    if (m.discordMessageId) {
      await deleteMissionMessage(m.discordMessageId);
      await updateMission(m.id, { discordMessageId: undefined });
    }
  };

  const handleRequestVoid = (m: Mission) => {
    setVoidCtx({ mission: m, reason: '' });
  };

  const handleConfirmVoid = async () => {
    if (!voidCtx) return;
    const reason = voidCtx.reason.trim();
    if (!reason) {
      toast.error('무효 사유를 입력해주세요.');
      return;
    }
    await updateMission(voidCtx.mission.id, { status: 'VOIDED', voidReason: reason });
    if (voidCtx.mission.discordMessageId) {
      await deleteMissionMessage(voidCtx.mission.discordMessageId);
      await updateMission(voidCtx.mission.id, { discordMessageId: undefined });
    }
    setVoidCtx(null);
  };

  const handleRequestRouletteSpin = (m: Mission) => {
    setRouletteCtx(m);
  };

  const handleRouletteWinner = async (winner: string) => {
    if (!rouletteCtx) return;
    await updateMission(rouletteCtx.id, {
      status: 'SETTLED',
      winner,
      winnerSelectedBy: 'ROULETTE',
      resolvedAt: new Date().toISOString(),
    });
    setRouletteCtx(null);
  };

  const handlePickWinner = async (m: Mission, winner: string) => {
    await updateMission(m.id, {
      status: 'SETTLED',
      winner,
      winnerSelectedBy: 'ISSUER_PICK',
      resolvedAt: new Date().toISOString(),
    });
  };

  const handleTogglePaid = async (m: Mission, next: boolean) => {
    const becomeCompleted = next && !!m.receivedByWinner;
    await updateMission(m.id, {
      paidByIssuer: next,
      ...(becomeCompleted ? { status: 'COMPLETED' as const, completedAt: new Date().toISOString() } : {}),
    });
    if (becomeCompleted && m.discordMessageId) {
      await deleteMissionMessage(m.discordMessageId);
      await updateMission(m.id, { discordMessageId: undefined });
    } else if (m.discordMessageId) {
      // 메시지가 살아있으면 디스코드 측 ☐/☑ 마크도 동기화.
      await refreshMissionMessage(m.id);
    }
  };

  const handleToggleReceived = async (m: Mission, next: boolean) => {
    const becomeCompleted = next && !!m.paidByIssuer;
    await updateMission(m.id, {
      receivedByWinner: next,
      ...(becomeCompleted ? { status: 'COMPLETED' as const, completedAt: new Date().toISOString() } : {}),
    });
    if (becomeCompleted && m.discordMessageId) {
      await deleteMissionMessage(m.discordMessageId);
      await updateMission(m.id, { discordMessageId: undefined });
    } else if (m.discordMessageId) {
      await refreshMissionMessage(m.id);
    }
  };

  const handleDelete = async (m: Mission) => {
    const ok = await confirm(`"${m.title}" 미션을 삭제하시겠습니까?`, '미션 삭제');
    if (!ok) return;
    if (m.discordMessageId) await deleteMissionMessage(m.discordMessageId);
    await deleteMission(m.id);
    toast.success('미션이 삭제되었습니다.');
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            const count = missions.filter((m) => f.statuses.includes(m.status)).length;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                  active
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300'
                }`}
              >
                {f.label}
                <span className={`rounded-full px-1.5 text-[10px] ${active ? 'bg-white/20' : 'bg-zinc-200 dark:bg-zinc-700'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          disabled={allUserNames.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-500/25 transition-colors hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50"
        >
          <Plus size={16} /> 미션 걸기
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-zinc-200 bg-white/50 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="mb-4 rounded-full bg-zinc-100 p-4 dark:bg-zinc-800">
            <Inbox size={32} className="text-zinc-400" />
          </div>
          <p className="text-base font-bold text-zinc-600 dark:text-zinc-300">
            {filter === 'ACTIVE' ? '진행 중인 미션이 없습니다.' : '표시할 미션이 없습니다.'}
          </p>
          <p className="mt-1 text-xs text-zinc-500">상단의 "미션 걸기" 로 새 미션을 등록해주세요.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((m) => (
            <MissionCard
              key={m.id}
              mission={m}
              onMarkSuccess={handleMarkSuccess}
              onMarkFailed={handleMarkFailed}
              onRequestVoid={handleRequestVoid}
              onRequestRouletteSpin={handleRequestRouletteSpin}
              onPickWinner={handlePickWinner}
              onTogglePaid={handleTogglePaid}
              onToggleReceived={handleToggleReceived}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <MissionCreateModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        allUserNames={allUserNames}
        onCreate={handleCreate}
      />

      <Modal
        open={!!rouletteCtx}
        title={rouletteCtx ? `${rouletteCtx.title} — 룰렛` : '룰렛'}
        onClose={() => setRouletteCtx(null)}
        maxWidth="max-w-4xl"
      >
        {rouletteCtx && (
          <RouletteGame
            allUserNames={allUserNames}
            initialNames={rouletteCtx.poolMembers}
            onWinnerDetermined={handleRouletteWinner}
          />
        )}
      </Modal>

      <Modal
        open={!!voidCtx}
        title="미션 무효 처리"
        onClose={() => setVoidCtx(null)}
        maxWidth="max-w-md"
      >
        {voidCtx && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              <span className="font-bold">{voidCtx.mission.title}</span> 미션을 무효 처리합니다. 사유를 입력해주세요.
            </p>
            <textarea
              value={voidCtx.reason}
              onChange={(e) => setVoidCtx({ ...voidCtx, reason: e.target.value })}
              rows={3}
              placeholder="예: 워프되어 도중 종료"
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm font-medium text-zinc-700 transition-colors placeholder:font-medium placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            />
            <div className="flex flex-col-reverse gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={() => setVoidCtx(null)}
                className="inline-flex items-center justify-center rounded-xl bg-zinc-100 px-5 py-2.5 text-sm font-bold text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmVoid}
                className="inline-flex items-center justify-center rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-rose-500/25 transition-colors hover:bg-rose-500 active:bg-rose-700"
              >
                무효 처리
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal />
    </div>
  );
};

// 헤더에서 lucide Coins 아이콘 export 용도.
export const MissionBoardIcon = Coins;
