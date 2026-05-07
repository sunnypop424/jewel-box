import React, { useMemo, useState } from 'react';
import type { Character, RaidSchedule, RaidRun, RaidId, RaidExclusionMap, RaidSettingsMap } from '../types';
import { RAID_META } from '../constants';
import { Shield, Swords, Users, ChevronDown, CircleDashed, CheckCircle2, RotateCcw, Check, UserCheck, UserX, Filter } from 'lucide-react';
import { getDifficultyStyle } from '../utils/difficultyStyle';

import { useConfirm } from '../hooks/useConfirm';

interface Props {
  schedule: RaidSchedule | null;
  isLoading?: boolean;
  exclusions?: RaidExclusionMap;
  onExcludeCharacter?: (raidId: RaidId, characterId: string, isCurrentlyExcluded: boolean) => void | Promise<void>;
  raidSettings?: RaidSettingsMap;
  isRaidSettingsLoading?: boolean;
  onToggleSupportShortage?: (raidId: RaidId, next: boolean) => void;
  raidCandidates?: Partial<Record<RaidId, Character[]>>;
  allUserNames?: string[];
  inactiveUsers?: Set<string>;
  onToggleUser?: (name: string) => void;
}


export const RaidScheduleView: React.FC<Props> = ({
  schedule,
  isLoading = false,
  exclusions,
  onExcludeCharacter,
  raidSettings,
  isRaidSettingsLoading = false,
  onToggleSupportShortage,
  raidCandidates,
  allUserNames = [],
  inactiveUsers = new Set(),
  onToggleUser,
}) => {

  const { confirm, ConfirmModal } = useConfirm();

  const [raidOpenState, setRaidOpenState] = useState<Record<string, boolean>>({});

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

  const toggleRaid = (raidId: string, allRaidIds: string[]) => {
    setRaidOpenState((prev) => {
      const isCurrentlyOpen = prev[raidId] ?? (raidId === allRaidIds[0]);
      if (isCurrentlyOpen) {
        return { ...prev, [raidId]: false };
      }
      const next: Record<string, boolean> = {};
      allRaidIds.forEach((id) => { next[id] = false; });
      next[raidId] = true;
      return next;
    });
  };

  const handleExcludeClick = async (
    raidId: RaidId,
    characterId: string,
    isCurrentlyExcluded: boolean
  ) => {
    if (!onExcludeCharacter) return;
    if (!isCurrentlyExcluded) {
      const ok = await confirm('이 캐릭터를 완료 처리하시겠습니까?');
      if (!ok) return;
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
    'KAZEROS_NORMAL',
    'KAZEROS_HARD',
    'KAZEROS_NIGHTMARE',
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

    setRaidOpenState(() => {
      const next: Record<string, boolean> = {};
      raidIds.forEach((id) => { next[String(id)] = false; });
      next[raidId] = true;
      return next;
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
                  <div className={`h-2 w-2 rounded-full ${diffStyle.dotColor}`} />
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
        const isRaidOpen = raidOpenState[raidId] ?? (raidId === raidIds[0]);
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
        const diffStyle = getDifficultyStyle(diff);
        const { containerBorder, titleColor } = diffStyle;
        const dotColor = diffStyle.dotTextColor;
        const headerClass = `${diffStyle.headerClass} ${diffStyle.headerHoverClass}`;

        return (
          <div
            id={`raid-section-${raidId}`}
            key={raidId}
            className={`scroll-mt-36 overflow-hidden rounded-2xl border shadow-sm dark:bg-zinc-900 ${containerBorder}`}
          >
            <div
              onClick={() => toggleRaid(raidId as string, raidIds as string[])}
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

              </div>

              <div className="flex w-full items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400 sm:w-auto sm:shrink-0 sm:justify-end">
                {onToggleSupportShortage && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="mr-2 flex items-center"
                  >
                    <label
                      title="랏 서포터 모드: 서포터 부족 시 딜러 발키리를 서포터 자리에 배정합니다"
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
                        disabled={isRaidSettingsLoading}
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
                <RaidPartnershipBreakdown
                  candidates={
                    raidCandidates?.[raidId] ??
                    candidatesFallback[raidId] ??
                    []
                  }
                  runs={runs}
                  excludedIds={excludedIdsForRaid}
                  allUserNames={allUserNames}
                  inactiveUsers={inactiveUsers}
                />
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
                  canExclude={Boolean(onExcludeCharacter)}
                  getUserCardClass={getUserCardClass}
                  userColorMap={userColorMap}
                />
              </div>
            )}
          </div>
        );
      })}

      <ConfirmModal />
    </div>
  );
};

function RaidPartnershipBreakdown(props: {
  candidates: Character[];
  runs: RaidRun[];
  excludedIds: string[];
  allUserNames: string[];
  inactiveUsers: Set<string>;
}) {
  const { candidates, runs, excludedIds, allUserNames, inactiveUsers } = props;

  const breakdown = useMemo(() => {
    const excludedSet = new Set(excludedIds);
    const placedRunIndex = new Map<string, number>();
    const runUserSets: Set<string>[] = runs.map(() => new Set<string>());

    runs.forEach((run, i) => {
      run.parties.forEach((p) =>
        p.members.forEach((m) => {
          if (excludedSet.has(m.id)) return;
          placedRunIndex.set(m.id, i);
          if (m.discordName) runUserSets[i].add(m.discordName);
        })
      );
    });

    const uniqueCandidates = Array.from(
      new Map(candidates.map((c) => [c.id, c])).values()
    );
    const map = new Map<string, { together: number; alone: number }>();
    allUserNames.forEach((n) => map.set(n, { together: 0, alone: 0 }));

    uniqueCandidates.forEach((c) => {
      if (excludedSet.has(c.id) || c.isGuest) return;
      const entry = map.get(c.discordName) ?? { together: 0, alone: 0 };
      const idx = placedRunIndex.get(c.id);
      if (idx === undefined) entry.alone++;
      else if (runUserSets[idx].size > 1) entry.together++;
      else entry.alone++;
      map.set(c.discordName, entry);
    });
    return map;
  }, [candidates, runs, excludedIds, allUserNames]);

  const visibleUsers = allUserNames.filter((name) => {
    if (inactiveUsers.has(name)) return false;
    const entry = breakdown.get(name);
    if (!entry) return false;
    return entry.together + entry.alone > 0;
  });

  if (visibleUsers.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 px-4 pt-4 sm:px-6 sm:pt-6">
      <div className="flex items-center gap-2 text-sm font-bold text-zinc-600 dark:text-zinc-400">
        <Users className="h-4 w-4" />
        <span>유저별 함께 / 혼자 현황</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {visibleUsers.map((name) => {
          const entry = breakdown.get(name) ?? { together: 0, alone: 0 };
          return (
            <div
              key={name}
              className="rounded-xl bg-white shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800"
            >
              <div className="px-3 pt-2 pb-1.5">
                <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  {name}
                </span>
              </div>
              <div className="flex items-center justify-around border-t border-zinc-100 px-3 py-2 dark:border-zinc-800">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-base font-bold tabular-nums text-blue-600 dark:text-blue-300">
                    {entry.together}
                  </span>
                  <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
                    함께
                  </span>
                </div>
                <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-700" />
                <div className="flex items-baseline gap-1.5">
                  <span className="text-base font-bold tabular-nums text-amber-600 dark:text-amber-300">
                    {entry.alone}
                  </span>
                  <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
                    혼자
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3 max-h-[45vh] lg:max-h-[274px]">
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
            {isCompleted ? <RotateCcw size={12} /> : <Check size={12} />}
            {isCompleted ? '취소' : '완료'}
          </button>
        )}
      </div>
    </div>
  );
}