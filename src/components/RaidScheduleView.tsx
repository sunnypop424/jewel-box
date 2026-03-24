import React, { useMemo, useState } from 'react';
import type { Character, RaidSchedule, RaidRun, RaidId, RaidExclusionMap, RaidSettingsMap } from '../types';
import { RAID_META } from '../constants';
import { Shield, Swords, Users, User, ChevronDown, CircleDashed, CheckCircle2, ArrowLeftRight, Check, UserCheck, UserX, Filter, Trash } from 'lucide-react';
import { SwapModal } from './SwapModal';

// ✨ Hook 추가
import { toast } from 'sonner';
import { useConfirm } from '../hooks/useConfirm';

type BalanceMode = 'overall' | 'role' | 'speed';

interface Props {
  schedule: RaidSchedule | null;
  isLoading?: boolean;
  exclusions?: RaidExclusionMap;
  onExcludeCharacter?: (raidId: RaidId, characterId: string, isCurrentlyExcluded: boolean) => void | Promise<void>;
  balanceMode?: BalanceMode;
  raidSettings?: RaidSettingsMap;
  isRaidSettingsLoading?: boolean;
  onToggleSupportShortage?: (raidId: RaidId, next: boolean) => void;
  raidCandidates?: Partial<Record<RaidId, Character[]>>;
  onSwapCharacter?: (raidId: RaidId, charId1: string, charId2: string) => void | Promise<void>;
  allCharacters?: Character[];
  onExcludeRun?: (raidId: RaidId, charIds: string[]) => void | Promise<void>;
  isSwapping?: boolean;
  allUserNames?: string[];
  inactiveUsers?: Set<string>;
  onToggleUser?: (name: string) => void;
  onOpenGuestAdd?: (raidId: RaidId) => void;
  onRemoveGuest?: (raidId: RaidId, guestId: string) => void;
}

function getDifficultyStyle(diff: string) {
  if (diff === 'NORMAL') {
    return {
      btn: 'bg-sky-50 border-sky-200 text-sky-700 dark:bg-sky-950/30 dark:border-sky-900 dark:text-sky-200 shadow-sm',
      dot: 'bg-sky-500',
    };
  }
  if (diff === 'HARD') {
    return {
      btn: 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/30 dark:border-rose-900 dark:text-rose-200 shadow-sm',
      dot: 'bg-rose-500',
    };
  }
  if (diff === 'STEP1' || diff === 'STEP2' || diff === 'STEP3') {
    return {
      btn: 'bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-950/30 dark:border-orange-900 dark:text-orange-200 shadow-sm',
      dot: 'bg-orange-500',
    };
  }
  return {
    btn: 'bg-violet-50 border-violet-200 text-violet-700 dark:bg-violet-950/30 dark:border-violet-900 dark:text-violet-200 shadow-sm',
    dot: 'bg-violet-500',
  };
}

export const RaidScheduleView: React.FC<Props> = ({
  schedule,
  isLoading = false,
  exclusions,
  onExcludeCharacter,
  balanceMode = 'overall',
  raidSettings,
  isRaidSettingsLoading = false,
  onToggleSupportShortage,
  raidCandidates,
  onSwapCharacter,
  allCharacters = [],
  onExcludeRun,
  isSwapping = false,
  allUserNames = [],
  inactiveUsers = new Set(),
  onToggleUser,
  onOpenGuestAdd,
  onRemoveGuest,
}) => {
  
  const { confirm, ConfirmModal } = useConfirm();

  const [raidOpenState, setRaidOpenState] = useState<Record<string, boolean>>({});
  const [runOpenState, setRunOpenState] = useState<Record<string, boolean>>({});

  const [swapTarget, setSwapTarget] = useState<{
    raidId: RaidId;
    char: Character;
  } | null>(null);

  const [completingKey, setCompletingKey] = useState<string | null>(null);

  const candidatesFallback = useMemo(() => {
    const map: Partial<Record<RaidId, Character[]>> = {};
    const safeSchedule = schedule ?? ({} as RaidSchedule);
    (Object.keys(safeSchedule) as RaidId[]).forEach((raidId) => {
      const runs = safeSchedule[raidId] ?? [];
      const members = runs.flatMap((r) => r.parties.flatMap((p) => p.members));
      map[raidId] = members;
    });
    return map;
  }, [schedule]);

  if (!schedule) return null;

  const nameCollator = useMemo(
    () => new Intl.Collator('ko', { sensitivity: 'base', numeric: true }),
    []
  );

  const userColorMap = useMemo(() => {
    const names: string[] = [];

    (Object.keys(schedule) as RaidId[]).forEach((raidId) => {
      const runs = schedule[raidId] ?? [];
      runs.forEach((r) =>
        r.parties.forEach((p) =>
          p.members.forEach((m) => {
            if (m?.discordName) names.push(m.discordName);
          })
        )
      );
    });

    (Object.keys(candidatesFallback) as RaidId[]).forEach((raidId) => {
      (candidatesFallback[raidId] ?? []).forEach((m) => {
        if (m?.discordName) names.push(m.discordName);
      });
    });

    const uniq = Array.from(new Set(names)).sort((a, b) =>
      nameCollator.compare(a, b)
    );

    const map = new Map<string, number>();
    uniq.forEach((n, i) => map.set(n, i));
    return map;
  }, [schedule, candidatesFallback, nameCollator]);

  const getUserCardClass = (discordName: string) => {
    const idx = userColorMap.get(discordName) ?? 0;

    const palette = [
      'bg-blue-50 ring-blue-200 dark:bg-blue-950/30 dark:ring-blue-900/50',
      'bg-rose-50 ring-rose-200 dark:bg-rose-950/30 dark:ring-rose-900/50',
      'bg-amber-50 ring-amber-200 dark:bg-amber-950/30 dark:ring-amber-900/50',
      'bg-emerald-50 ring-emerald-200 dark:bg-emerald-950/30 dark:ring-emerald-900/50',
      'bg-violet-50 ring-violet-200 dark:bg-violet-950/30 dark:ring-violet-900/50',
      'bg-cyan-50 ring-cyan-200 dark:bg-cyan-950/30 dark:ring-cyan-900/50',
      'bg-lime-50 ring-lime-200 dark:bg-lime-950/30 dark:ring-lime-900/50',
      'bg-fuchsia-50 ring-fuchsia-200 dark:bg-fuchsia-950/30 dark:ring-fuchsia-900/50',
      'bg-slate-50 ring-slate-200 dark:bg-slate-950/30 dark:ring-slate-900/50',
      'bg-stone-50 ring-stone-200 dark:bg-stone-950/30 dark:ring-stone-900/50',
    ];

    return palette[idx % palette.length];
  };

  const toggleRaid = (raidId: string) => {
    setRaidOpenState((prev) => ({ ...prev, [raidId]: !(prev[raidId] ?? false) }));
  };

  const toggleRun = (raidId: string, runIndex: number) => {
    const key = `${raidId}-${runIndex}`;
    setRunOpenState((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
  };

  // ✨ 불필요한 confirm 창 완전 삭제
  const handleExcludeClick = async (
    raidId: RaidId,
    characterId: string,
    isCurrentlyExcluded: boolean
  ) => {
    if (!onExcludeCharacter) return;
    if (isSwapping) {
      toast.error('캐릭터 변경을 반영하고 있습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    await onExcludeCharacter(raidId, characterId, isCurrentlyExcluded);
  };

  if (isLoading) {
    return (
      <div className="grid gap-6">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-40 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800"
          />
        ))}
      </div>
    );
  }

  const RAID_ORDER: (keyof RaidSchedule)[] = [
    'ACT4_NORMAL',
    'ACT4_HARD',
    'FINAL_NORMAL',
    'FINAL_HARD',
    'SERKA_NORMAL',
    'SERKA_HARD',
    'SERKA_NIGHTMARE',
    'HORIZON_STEP1',
    'HORIZON_STEP2',
    'HORIZON_STEP3',
  ];

  const raidIds = RAID_ORDER.filter((raidId) => (schedule[raidId]?.length ?? 0) > 0);

  const scrollToRaid = (raidId: RaidId) => {
    const el = document.getElementById(`raid-section-${raidId}`);
    if (!el) return;

    el.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });

    setRaidOpenState((prev) => {
      if (prev[raidId]) return prev;
      return { ...prev, [raidId]: true };
    });
  };

  return (
    <div className="grid gap-6">
      <div className="sticky top-0 sm:top-0 z-30 flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/90">
        {allUserNames.length > 0 && onToggleUser && (
          <div className="flex flex-col gap-2">
            <div className="flex items-start gap-2 text-sm font-semibold text-zinc-600 dark:text-zinc-400 sm:items-center">
              <Users className="h-4 w-4" />
              <span>참여 인원</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {allUserNames.map((name) => {
                const isInactive = inactiveUsers.has(name);
                const isSelected = !isInactive;
                return (
                  <button
                    key={name}
                    onClick={() => onToggleUser(name)}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all border ${
                      isSelected
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/30 dark:border-indigo-900 dark:text-indigo-200'
                        : 'bg-transparent border-zinc-200 text-zinc-400 decoration-zinc-400 line-through dark:border-zinc-800 dark:text-zinc-600'
                    }`}
                  >
                    {isSelected ? <UserCheck className="h-3 w-3" /> : <UserX className="h-3 w-3" />}
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {allUserNames.length > 0 && onToggleUser && (
          <div className="h-px w-full bg-zinc-100 dark:bg-zinc-800" />
        )}

        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-2 text-sm font-semibold text-zinc-600 dark:text-zinc-400 sm:items-center">
            <Filter className="h-4 w-4" />
            <span>레이드 바로가기</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {raidIds.map((raidId) => {
              const meta = RAID_META[raidId];
              const diffStyle = getDifficultyStyle(meta.difficulty);

              return (
                <button
                  key={raidId}
                  type="button"
                  onClick={() => scrollToRaid(raidId as RaidId)}
                  className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition-all border select-none ${diffStyle.btn}`}
                >
                  <div className={`h-2 w-2 rounded-full ${diffStyle.dot}`} />
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {raidIds.map((raidId) => {
        const runs = schedule[raidId];
        if (!runs || runs.length === 0) return null;

        const meta = RAID_META[raidId];
        const isRaidOpen = raidOpenState[raidId] ?? false;
        const excludedIdsForRaid = exclusions?.[raidId] ?? [];

        const candidatesForThisRaid = raidCandidates?.[raidId] ?? candidatesFallback[raidId] ?? [];

        const userRemainingCountsForThisRaid = new Map<string, number>();
        candidatesForThisRaid.forEach((c) => {
          if (!excludedIdsForRaid.includes(c.id) && !c.isGuest) {
            userRemainingCountsForThisRaid.set(
              c.discordName,
              (userRemainingCountsForThisRaid.get(c.discordName) || 0) + 1
            );
          }
        });

        const diff = meta.difficulty;

        let containerBorder = '';
        let headerClass = '';
        let titleColor = '';
        let dotColor = '';

        if (diff === 'NORMAL') {
          containerBorder = 'border-sky-200 dark:border-sky-800';
          headerClass =
            'text-sky-900 border-sky-200 bg-sky-50/50 hover:bg-sky-100 dark:text-sky-100 dark:border-sky-800 dark:bg-sky-900/20 dark:hover:bg-sky-900/40';
          titleColor = 'text-sky-900 dark:text-sky-100';
          dotColor = 'text-sky-500';
        } else if (diff === 'HARD') {
          containerBorder = 'border-rose-200 dark:border-rose-800';
          headerClass =
            'text-rose-900 border-rose-200 bg-rose-50/50 hover:bg-rose-100 dark:text-rose-100 dark:border-rose-800 dark:bg-rose-900/20 dark:hover:bg-rose-900/40';
          titleColor = 'text-rose-900 dark:text-rose-100';
          dotColor = 'text-rose-500';
        } else if (diff === 'STEP1' || diff === 'STEP2' || diff === 'STEP3') {
          containerBorder = 'border-orange-200 dark:border-orange-800';
          headerClass =
            'text-orange-900 border-orange-200 bg-orange-50/50 hover:bg-orange-100 dark:text-orange-100 dark:border-orange-800 dark:bg-orange-900/20 dark:hover:bg-orange-900/40';
          titleColor = 'text-orange-900 dark:text-orange-100';
          dotColor = 'text-orange-500';
        } else {
          containerBorder = 'border-violet-200 dark:border-violet-800';
          headerClass =
            'text-violet-900 border-violet-200 bg-violet-50/50 hover:bg-violet-100 dark:text-violet-100 dark:border-violet-800 dark:bg-violet-900/20 dark:hover:bg-violet-900/40';
          titleColor = 'text-violet-900 dark:text-violet-100';
          dotColor = 'text-violet-500';
        }

        return (
          <div
            id={`raid-section-${raidId}`}
            key={raidId}
            className={`scroll-mt-36 overflow-hidden rounded-2xl border shadow-sm dark:bg-zinc-900 ${containerBorder}`}
          >
            <div
              onClick={() => toggleRaid(raidId as string)}
              className={`flex w-full flex-col items-start gap-3 border-b px-4 py-4 text-left transition-colors cursor-pointer select-none sm:flex-row sm:items-center sm:justify-between sm:px-5 ${headerClass} ${
                isRaidOpen
                  ? 'border-b-zinc-100 dark:border-b-zinc-800'
                  : 'border-transparent'
              }`}
            >
              <div className="flex w-full flex-wrap items-center gap-2 sm:flex-1 sm:mr-4">
                <div
                  className={`h-3 w-3 rounded-full shadow-sm ring-2 ring-white/50 bg-current shrink-0 ${dotColor}`}
                />
                <h4 className={`text-base font-bold whitespace-nowrap shrink-0 ${titleColor}`}>
                  {meta.label}
                </h4>

                {allUserNames.length > 0 && (
                  <div className="flex basis-full flex-wrap items-center gap-1.5 border-current/20 pt-1 sm:ml-2 sm:basis-auto sm:border-l sm:pl-3 sm:pt-0">
                    {allUserNames.map((name) => {
                      const remainingCount = userRemainingCountsForThisRaid.get(name) || 0;
                      const isActive = remainingCount > 0;
                      return (
                        <span
                          key={name}
                          className={`text-xs px-2 py-1 rounded transition-all ${
                            isActive
                              ? 'font-medium bg-white/60 text-zinc-800 shadow-sm ring-1 ring-black/5 dark:bg-black/30 dark:text-zinc-100 dark:ring-white/10'
                              : 'font-medium text-current opacity-40 line-through decoration-current/40'
                          }`}
                        >
                          {name}{isActive ? ` ${remainingCount}` : ''}
                        </span>
                      );
                    })}
                  </div>
                )}

                {onOpenGuestAdd && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenGuestAdd(raidId as RaidId);
                    }}
                    className="w-full rounded-md bg-indigo-50 px-2 py-1.5 text-center text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-100 dark:bg-indigo-900/40 dark:text-indigo-300 sm:ml-2 sm:w-auto sm:py-1 whitespace-nowrap"
                  >
                    + 게스트 추가
                  </button>
                )}
              </div>

              <div className="flex w-full items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400 sm:w-auto sm:shrink-0 sm:justify-end">
                {onToggleSupportShortage && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="mr-2 flex items-center"
                  >
                    <label
                      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold cursor-pointer transition-colors ${
                        raidSettings?.[raidId]
                          ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300'
                          : 'border-zinc-200 bg-white/50 hover:bg-white dark:bg-zinc-900/50 dark:border-zinc-700 dark:hover:bg-zinc-900'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={!!raidSettings?.[raidId]}
                        onChange={(e) =>
                          onToggleSupportShortage(
                            raidId as RaidId,
                            e.target.checked
                          )
                        }
                        disabled={isRaidSettingsLoading || isSwapping}
                        className="h-3 w-3 text-amber-600 rounded border-zinc-300 focus:ring-amber-500"
                      />
                      <span className="dark:text-zinc-300">랏폿</span>
                    </label>
                  </div>
                )}
                <ChevronDown
                  size={16}
                  className={`transition-transform ${isRaidOpen ? '' : '-rotate-90'}`}
                />
              </div>
            </div>

            {isRaidOpen && (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                <RaidStatusBoard
                  raidId={raidId as RaidId}
                  raidLabel={meta.label}
                  candidates={
                    raidCandidates?.[raidId] ??
                    candidatesFallback[raidId] ??
                    []
                  }
                  runs={runs}
                  excludedIds={excludedIdsForRaid}
                  onExclude={(m: Character, isCompleted: boolean) =>
                    handleExcludeClick(raidId as RaidId, m.id, isCompleted)
                  }
                  canExclude={Boolean(onExcludeCharacter) && !isSwapping}
                  getUserCardClass={getUserCardClass}
                  userColorMap={userColorMap}
                />
                <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-3 lg:gap-6">
                  {runs.map((run: RaidRun) => {
                    const runKey = `${raidId}-${run.runIndex}`;
                    const isRunOpen = runOpenState[runKey] ?? true;

                    const visibleMembers = run.parties.flatMap((p) =>
                      p.members.filter((m) => !excludedIdsForRaid.includes(m.id))
                    );

                    const realMembers = visibleMembers.filter(m => !m.isGuest);

                    const dpsMembers = realMembers.filter((m) => m.role === 'DPS');
                    const supMembers = realMembers.filter((m) => m.role === 'SUPPORT');

                    const overallAvg =
                      realMembers.length > 0
                        ? Math.round(realMembers.reduce((sum, m) => sum + m.combatPower, 0) / realMembers.length)
                        : 0;

                    const dpsAvg =
                      dpsMembers.length > 0
                        ? Math.round(dpsMembers.reduce((sum, m) => sum + m.combatPower, 0) / dpsMembers.length)
                        : 0;

                    const supAvg =
                      supMembers.length > 0
                        ? Math.round(supMembers.reduce((sum, m) => sum + m.combatPower, 0) / supMembers.length)
                        : 0;

                    const completeBtnKey = `${raidId}-${run.runIndex}`;
                    const isCompleting = completingKey === completeBtnKey;

                    return (
                      <div key={run.runIndex}>
                        <div className="flex flex-col gap-3 rounded-xl bg-zinc-50 px-3 py-3 dark:bg-zinc-900/60 sm:flex-row sm:items-center sm:justify-between sm:py-2">
                          <button
                            onClick={() => toggleRun(raidId as string, run.runIndex)}
                            className="flex flex-1 items-center gap-2 text-left"
                          >
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                              {run.runIndex}
                            </span>
                            <span className="text-sm font-semibold dark:text-zinc-200">
                              공격대
                            </span>
                          </button>

                          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:gap-3">
                            {balanceMode === 'role' ? (
                              <div className="flex gap-2 text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
                                <span className="flex items-center gap-1">
                                  <Swords size={10} /> {dpsAvg.toLocaleString()}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Shield size={10} /> {supAvg.toLocaleString()}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                                CP {overallAvg.toLocaleString()}
                              </span>
                            )}

                            {onExcludeRun && visibleMembers.length > 0 && (
                              <button
                                disabled={isSwapping || isCompleting}
                                onClick={async (e) => {
                                  e.stopPropagation();

                                  if (isSwapping) {
                                    toast.error('캐릭터 변경을 반영하고 있습니다. 잠시 후 다시 시도해 주세요.');
                                    return;
                                  }
                                  if (isCompleting) return;

                                  const ok = await confirm(
                                    `${meta.label} ${run.runIndex} 공격대를 완료 처리하시겠습니까?`
                                  );
                                  if (!ok) return;

                                  const ids = Array.from(
                                    new Set(
                                      visibleMembers
                                        .map((m) => String(m?.id ?? '').trim())
                                        .filter(Boolean)
                                    )
                                  );

                                  try {
                                    setCompletingKey(completeBtnKey);
                                    await onExcludeRun(raidId as RaidId, ids);
                                  } finally {
                                    setCompletingKey(null);
                                  }
                                }}
                                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold border border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-50 dark:border-emerald-900/50 dark:text-emerald-200 dark:bg-transparent dark:hover:bg-emerald-950/40 disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                {isCompleting ? '처리하고 있습니다.' : '레이드 완료'}
                              </button>
                            )}

                            <ChevronDown
                              size={14}
                              onClick={() => toggleRun(raidId as string, run.runIndex)}
                              className={`cursor-pointer text-zinc-400 transition-transform ${
                                isRunOpen ? '' : '-rotate-90'
                              }`}
                            />
                          </div>
                        </div>

                        {isRunOpen && (
                          <div className="mt-4 grid gap-4 lg:grid-cols-2">
                            {run.parties.map((party) => {
                              const pMembers = party.members.filter(
                                (m) => !excludedIdsForRaid.includes(m.id)
                              );
                              const emptySlots = Math.max(0, 4 - pMembers.length);

                              return (
                                <div
                                  key={party.partyIndex}
                                  className="flex flex-col rounded-2xl border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-950/20"
                                >
                                  <div className="mb-3 flex items-center justify-between px-1 text-xs font-bold text-zinc-500 dark:text-zinc-400">
                                    <div className="flex items-center gap-1.5">
                                      <Users size={14} />
                                      <span>PARTY {party.partyIndex}</span>
                                    </div>
                                    <span className="text-[10px] text-zinc-400">
                                      {pMembers.length}/4
                                    </span>
                                  </div>

                                  <div className="flex flex-col gap-2">
                                    {pMembers.map((m) => (
                                      <div
                                        key={m.id}
                                        className="flex items-center justify-between rounded-xl bg-white p-2.5 shadow-sm ring-1 ring-zinc-900/5 dark:bg-zinc-900 dark:ring-zinc-800"
                                      >
                                        <div className="flex min-w-0 items-center gap-3">
                                          <div
                                            className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                                              m.isGuest
                                                ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                                                : m.role === 'SUPPORT'
                                                ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                                                : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                                            }`}
                                          >
                                            {m.role === 'SUPPORT' ? (
                                              <Shield size={16} />
                                            ) : (
                                              <Swords size={16} />
                                            )}
                                          </div>
                                          <div>
                                            <div className="flex items-center gap-1.5">
                                              <span className="text-sm font-bold dark:text-zinc-100">
                                                {m.jobCode}
                                              </span>
                                            </div>
                                            <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 max-w-[80px] overflow-hidden text-ellipsis whitespace-nowrap">
                                              {m.isGuest ? '임시 게스트' : m.lostArkName}
                                            </div>
                                          </div>
                                        </div>

                                        <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
                                          {!m.isGuest && (
                                            <div className="text-right">
                                              <div className="text-xs font-bold dark:text-zinc-300">
                                                Lv.{m.itemLevel}
                                              </div>
                                              <div className="text-[10px] text-zinc-400">
                                                CP {m.combatPower.toLocaleString()}
                                              </div>
                                            </div>
                                          )}

                                          {m.isGuest ? (
                                            <button
                                              onClick={() =>
                                                onRemoveGuest?.(raidId as RaidId, m.id)
                                              }
                                              className="inline-flex items-center gap-1 rounded bg-rose-50 px-2 py-1 text-xs font-bold text-rose-600 shadow-sm ring-1 ring-rose-200 hover:bg-rose-100 dark:bg-rose-950/30 dark:text-rose-400 dark:ring-rose-900/50"
                                            >
                                              <Trash size={12} />
                                              삭제
                                            </button>
                                          ) : (
                                            onSwapCharacter && (
                                              <button
                                                disabled={isSwapping}
                                                onClick={() => {
                                                  if (isSwapping) {
                                                    toast.error('캐릭터 변경을 반영하고 있습니다. 잠시 후 다시 시도해 주세요.');
                                                    return;
                                                  }
                                                  setSwapTarget({
                                                    raidId: raidId as RaidId,
                                                    char: m,
                                                  });
                                                }}
                                                className="inline-flex items-center gap-1 rounded bg-white px-2 py-1 text-xs font-bold text-zinc-600 shadow-sm ring-1 ring-zinc-200 hover:bg-amber-50 hover:text-amber-700 hover:ring-amber-200 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-700 dark:hover:bg-amber-900/30 dark:hover:text-amber-300 dark:hover:ring-amber-800 disabled:opacity-50 disabled:cursor-not-allowed"
                                                title="다른 캐릭터로 변경"
                                              >
                                                <ArrowLeftRight size={12} />
                                                변경
                                              </button>
                                            )
                                          )}
                                        </div>
                                      </div>
                                    ))}

                                    {Array.from({ length: emptySlots }).map((_, i) => (
                                      <div
                                        key={`empty-${run.runIndex}-${party.partyIndex}-${i}`}
                                        className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-200 py-3 text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-600"
                                      >
                                        <User size={14} className="opacity-50 min-h-[30.5px]" /> 빈 자리
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {swapTarget && (
        <SwapModal
          isOpen={!!swapTarget}
          onClose={() => {
            if (isSwapping) return;
            setSwapTarget(null);
          }}
          target={swapTarget}
          allCharacters={allCharacters}
          onConfirm={async (targetCharId: string) => {
            if (!onSwapCharacter) return;
            if (isSwapping) return;

            await onSwapCharacter(
              swapTarget.raidId,
              swapTarget.char.id,
              targetCharId
            );
            setSwapTarget(null);
          }}
        />
      )}
      
      <ConfirmModal />
    </div>
  );
};

function RaidStatusBoard(props: {
  raidId: RaidId;
  raidLabel: string;
  candidates: Character[];
  runs: RaidRun[];
  excludedIds: string[];
  canExclude: boolean;
  onExclude: (m: Character, isCompleted: boolean) => void | Promise<void>;
  getUserCardClass: (discordName: string) => string;
  userColorMap: Map<string, number>;
}) {
  const { candidates, runs, excludedIds, getUserCardClass, userColorMap } = props;

  const uniqueCandidates = Array.from(
    new Map(candidates.map((c) => [c.id, c])).values()
  );

  const excludedSet = new Set(excludedIds);
  const placedIds = new Set(
    runs.flatMap((r) => r.parties.flatMap((p) => p.members.map((m) => m.id)))
  );

  const sortByUserThenPower = (a: Character, b: Character) => {
    const ia = userColorMap.get(a.discordName || '') ?? 999999;
    const ib = userColorMap.get(b.discordName || '') ?? 999999;
    if (ia !== ib) return ia - ib;

    const byPower = (b.combatPower ?? 0) - (a.combatPower ?? 0);
    if (byPower !== 0) return byPower;

    const byJob = String(a.jobCode || '').localeCompare(String(b.jobCode || ''), 'ko');
    if (byJob !== 0) return byJob;

    return String(a.id).localeCompare(String(b.id));
  };

  const completed = uniqueCandidates
    .filter((c) => excludedSet.has(c.id))
    .sort(sortByUserThenPower);

  const assigned = uniqueCandidates
    .filter((c) => !excludedSet.has(c.id) && placedIds.has(c.id))
    .sort(sortByUserThenPower);

  const unassigned = uniqueCandidates
    .filter((c) => !excludedSet.has(c.id) && !placedIds.has(c.id))
    .sort(sortByUserThenPower);

  return (
    <div className="flex flex-col gap-5 p-6">
      <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
        <StatusColumn
          title="미배치 / 대기"
          count={unassigned.length}
          icon={<CircleDashed size={16} />}
          color="amber"
        >
          {unassigned.map((m) => (
            <RaidMemberCard
              key={m.id}
              member={m}
              {...props}
              userCardClass={getUserCardClass(m.discordName)}
            />
          ))}
        </StatusColumn>

        <StatusColumn
          title="배치됨"
          count={assigned.length}
          icon={<Users size={16} />}
          color="blue"
        >
          {assigned.map((m) => (
            <RaidMemberCard
              key={m.id}
              member={m}
              {...props}
              userCardClass={getUserCardClass(m.discordName)}
            />
          ))}
        </StatusColumn>

        <StatusColumn title="완료" count={completed.length} icon={<CheckCircle2 size={16} />} color="zinc">
          {completed.map((m) => (
            <div key={m.id} className="opacity-60">
              <RaidMemberCard
                member={m}
                {...props}
                isCompleted={true}
                canExclude={props.canExclude}
                userCardClass={getUserCardClass(m.discordName)}
              />
            </div>
          ))}
        </StatusColumn>
      </div>
    </div>
  );
}

function StatusColumn({ title, count, icon, color, children }: any) {
  const colors: any = {
    amber:
      'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-900/20 dark:border-amber-900/30',
    blue:
      'text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-900/20 dark:border-blue-900/30',
    zinc:
      'text-zinc-700 bg-zinc-100 border-zinc-200 dark:text-zinc-400 dark:bg-zinc-800 dark:border-zinc-700',
  };

  return (
    <div className="flex h-full flex-col rounded-2xl border border-zinc-200 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-950/20">
      <div
        className={`flex items-center justify-between border-b px-4 py-3 rounded-t-2xl ${colors[color]} border-inherit`}
      >
        <div className="flex items-center gap-2 text-sm font-bold">
          {icon}
          <span>{title}</span>
        </div>
        <span className="rounded-full bg-white/60 px-2 py-0.5 text-xs font-extrabold dark:bg-black/20">
          {count}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3 lg:max-h-[274px]">
        {React.Children.count(children) === 0 ? (
          <div className="py-8 text-center text-xs text-zinc-400">없음</div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function RaidMemberCard({
  member,
  canExclude,
  onExclude,
  isCompleted, 
  userCardClass = '',
}: any) {
  return (
    <div
      className={`group flex flex-col gap-3 rounded-xl p-2.5 shadow-sm ring-1 hover:shadow-md sm:flex-row sm:items-center sm:justify-between
      ${userCardClass}
      ring-zinc-900/5 dark:ring-zinc-800`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${
            member.isGuest
              ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
              : member.role === 'SUPPORT'
                ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                : 'bg-white/60 text-zinc-600 dark:bg-zinc-900/40 dark:text-zinc-300'
          }`}
        >
          {member.role === 'SUPPORT' ? <Shield size={16} /> : <Swords size={16} />}
        </div>

        <div>
          <div className="text-sm font-bold dark:text-zinc-100">
            {member.jobCode}
          </div>
          <div className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
            {member.discordName} · {member.lostArkName}
          </div>
        </div>
      </div>

      <div className="flex w-full items-center justify-between gap-3 sm:w-auto">
        <div className="text-right">
          <div className="text-xs font-bold dark:text-zinc-200">
            Lv.{member.itemLevel}
          </div>
          <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
            CP {member.combatPower.toLocaleString()}
          </div>
        </div>

        {canExclude && (
          <button
            onClick={() => onExclude(member, isCompleted)}
            className={`inline-flex items-center gap-1 rounded bg-white px-2 py-1 text-xs font-bold shadow-sm ring-1 transition-colors ${
              isCompleted 
                ? 'text-rose-600 ring-rose-200 hover:bg-rose-50 dark:bg-zinc-800 dark:text-rose-400 dark:ring-rose-900/50 dark:hover:bg-rose-900/30' 
                : 'text-zinc-600 ring-zinc-200 hover:bg-emerald-50 hover:text-emerald-700 hover:ring-emerald-200 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-700 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-300'
            }`}
            title={isCompleted ? "완료 취소" : "완료(제외) 처리"}
          >
            {isCompleted ? <ArrowLeftRight size={12} /> : <Check size={12} />}
            {isCompleted ? '취소' : '완료'}
          </button>
        )}
      </div>
    </div>
  );
}