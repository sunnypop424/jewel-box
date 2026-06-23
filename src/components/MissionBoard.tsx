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
import { postMissionSettledMessage, postContestOpenMessage, deleteMissionMessage, refreshMissionMessage } from '../api/missionNotifier';
import { getMissionDisplayTitle } from '../utils/missionTitle';
import { Segmented } from '../features/refine/refineUi';
import type { Mission, MissionStatus, NewMission } from '../types';
import { useConfirm } from '../hooks/useConfirm';

interface Props {
  allUserNames: string[];
}

type FilterKey = 'ACTIVE' | 'SETTLING' | 'DONE' | 'ALL';

const FILTERS: { key: FilterKey; label: string; statuses: MissionStatus[] }[] = [
  { key: 'ACTIVE', label: '진행 중', statuses: ['OPEN', 'RESOLVING'] },
  { key: 'SETTLING', label: '정산 대기', statuses: ['SETTLED'] },
  { key: 'DONE', label: '종료', statuses: ['COMPLETED', 'FAILED', 'NO_WINNER', 'VOIDED'] },
  { key: 'ALL', label: '전체', statuses: ['OPEN', 'RESOLVING', 'SETTLED', 'COMPLETED', 'FAILED', 'NO_WINNER', 'VOIDED'] },
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

  const filterCounts = useMemo(
    () =>
      FILTERS.reduce((acc, f) => {
        acc[f.key] = missions.filter((m) => f.statuses.includes(m.status)).length;
        return acc;
      }, {} as Record<FilterKey, number>),
    [missions],
  );

  // 디스코드 게시는 "행동하는 한 클라이언트"가 인라인으로 한 번만 한다 (주간 공지가 cron 단일 주체로
  // 한 번만 올리는 것과 같은 원리). 구독 기반 자동 게시를 두지 않으므로 다른 탭·기기·PWA 가 같은 미션을
  // 중복 게시하지 않는다. 게시 실패해도 다른 클라이언트가 재시도하지 않는다(공지와 동일 — 단일 주체).
  const announceSettled = async (m: Mission, winner: string) => {
    const messageId = await postMissionSettledMessage({
      missionId: m.id,
      issuer: m.issuer,
      winner,
      goldAmount: m.goldAmount,
      // title 비어있는 POOL 미션은 룰/기준 라벨로 폴백.
      title: getMissionDisplayTitle(m),
      type: m.type,
    });
    if (messageId) {
      await updateMission(m.id, { discordMessageId: messageId });
    }
  };

  const handleCreate = async (data: NewMission) => {
    const created = await createMission(data);
    toast.success('미션이 등록되었습니다.');
    if (created.type === 'CONTEST') {
      // 공모전: 참여 모집 메시지 게시 (참여하기 버튼 포함).
      const messageId = await postContestOpenMessage({
        missionId: created.id,
        issuer: created.issuer,
        title: getMissionDisplayTitle(created),
        goldAmount: created.goldAmount,
        description: created.description,
      });
      if (messageId) {
        await updateMission(created.id, { discordMessageId: messageId });
      }
    } else if (created.status === 'SETTLED' && created.winner) {
      // DIRECT 등 생성 즉시 정산 대기로 들어가는 미션 → 정산 메시지 게시.
      await announceSettled(created, created.winner);
    }
  };

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
    const m = rouletteCtx;
    await updateMission(m.id, {
      status: 'SETTLED',
      winner,
      winnerSelectedBy: 'ROULETTE',
      resolvedAt: new Date().toISOString(),
    });
    await announceSettled(m, winner);
    setRouletteCtx(null);
  };

  const handlePickWinner = async (m: Mission, winner: string) => {
    // 공모전이면 OPEN 모집 메시지를 먼저 정리한 뒤 정산 메시지를 새로 올린다.
    if (m.discordMessageId) {
      await deleteMissionMessage(m.discordMessageId);
    }
    await updateMission(m.id, {
      status: 'SETTLED',
      winner,
      winnerSelectedBy: 'ISSUER_PICK',
      resolvedAt: new Date().toISOString(),
    });
    await announceSettled(m, winner);
  };

  // 공모전을 당첨자 없이 종료. 정산 없이 NO_WINNER 로 마감하고 디스코드 모집 메시지를 정리.
  const handleNoWinner = async (m: Mission) => {
    await updateMission(m.id, { status: 'NO_WINNER', resolvedAt: new Date().toISOString() });
    if (m.discordMessageId) {
      await deleteMissionMessage(m.discordMessageId);
      await updateMission(m.id, { discordMessageId: '' });
    }
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between md:h-[38px]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <h2 className="hidden items-center gap-2 text-xl font-bold text-zinc-900 dark:text-zinc-100 md:flex">
            <Coins className="text-indigo-500" /> 미션 보드
          </h2>
          <Segmented
            size="md"
            options={FILTERS.map((f) => [f.key, f.label] as const)}
            value={filter}
            onChange={setFilter}
            badges={filterCounts}
          />
        </div>
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          disabled={allUserNames.length === 0}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50"
        >
          <Plus size={15} /> 미션 걸기
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
              onNoWinner={handleNoWinner}
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
