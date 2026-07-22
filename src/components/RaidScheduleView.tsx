import React, { useMemo, useState } from 'react';
import type { Character, RaidSchedule, RaidRun, RaidId, RaidExclusionMap, RaidSettingsMap } from '../types';
import { RAID_META } from '../constants';
import { Shield, Swords, Users, CircleDashed, CheckCircle2, RotateCcw, Check, UserCheck, UserX, Filter } from 'lucide-react';
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

  const [activeRaidId, setActiveRaidId] = useState<RaidId | null>(null);

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

  // 유저 구분은 유저명 배지 색으로 표시한다.
  // 캐릭터명(주 정보)과 역할 아이콘 색(서포터/딜러)은 건드리지 않아야 목록이 조용하게 읽힌다.
  const getUserBadgeClass = (discordName: string) => {
    const idx = userColorMap.get(discordName) ?? 0;

    const palette = [
      'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
      'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
      'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
      'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
      'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
      'bg-cyan-100 text-cyan-800 dark:bg-cyan-500/15 dark:text-cyan-300',
      'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
      'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300',
      'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
      'bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300',
    ];

    return palette[idx % palette.length];
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

  const raidIds = RAID_ORDER.filter((raidId) => (schedule[raidId]?.length ?? 0) > 0) as RaidId[];

  // 활성 탭이 사라지면(전원 완료 등) 첫 레이드로 되돌린다.
  const activeRaid = activeRaidId && raidIds.includes(activeRaidId) ? activeRaidId : raidIds[0];

  const getCandidatesFor = (rid: RaidId) =>
    raidCandidates?.[rid] ?? candidatesFallback[rid] ?? [];

  // 탭 배지 — 해당 레이드에서 아직 가야 하는 캐릭터 수.
  const getRemainingCount = (rid: RaidId) => {
    const excluded = new Set(exclusions?.[rid] ?? []);
    const seen = new Set<string>();
    let count = 0;
    getCandidatesFor(rid).forEach((c) => {
      if (seen.has(c.id) || excluded.has(c.id) || c.isGuest) return;
      seen.add(c.id);
      count++;
    });
    return count;
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
            <span>레이드 선택</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {raidIds.map((raidId) => {
              const meta = RAID_META[raidId];
              const diffStyle = getDifficultyStyle(meta.difficulty);
              const isActive = raidId === activeRaid;
              const remaining = getRemainingCount(raidId);

              return (
                <button
                  key={raidId}
                  type="button"
                  onClick={() => setActiveRaidId(raidId)}
                  className={`flex select-none items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${
                    isActive
                      ? `${diffStyle.btn} ${diffStyle.borderActive} ring-1 ring-inset ring-current`
                      : 'border-zinc-200 bg-transparent text-zinc-400 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-500 dark:hover:bg-zinc-800/50'
                  }`}
                >
                  <div className={`h-2 w-2 rounded-full ${isActive ? diffStyle.dotColor : 'bg-zinc-300 dark:bg-zinc-700'}`} />
                  {meta.label}
                  {remaining > 0 && (
                    <span
                      className={`rounded-full px-1.5 text-[10px] font-extrabold tabular-nums ${
                        isActive ? 'bg-white/70 dark:bg-black/30' : 'bg-zinc-100 dark:bg-zinc-800'
                      }`}
                    >
                      {remaining}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {activeRaid && (() => {
        const runs = schedule[activeRaid] ?? [];
        const meta = RAID_META[activeRaid];
        const diffStyle = getDifficultyStyle(meta.difficulty);
        const excludedIdsForRaid = exclusions?.[activeRaid] ?? [];

        // 유저별 남은 캐릭터 수 — 편성표에서는 배지를 일일이 세야 알 수 있어 항상 노출한다.
        const excludedSet = new Set(excludedIdsForRaid);
        const seenIds = new Set<string>();
        const remainingByUser = new Map<string, number>();
        getCandidatesFor(activeRaid).forEach((c) => {
          if (seenIds.has(c.id) || excludedSet.has(c.id) || c.isGuest) return;
          seenIds.add(c.id);
          remainingByUser.set(c.discordName, (remainingByUser.get(c.discordName) ?? 0) + 1);
        });

        const userRows = (allUserNames.length > 0
          ? allUserNames
          : Array.from(remainingByUser.keys()).sort(
              (a, b) => (userColorMap.get(a) ?? 0) - (userColorMap.get(b) ?? 0),
            )
        ).filter((name) => !inactiveUsers.has(name));

        return (
          <div
            className={`overflow-hidden rounded-2xl border bg-white shadow-sm dark:bg-zinc-900 ${diffStyle.containerBorder}`}
          >
            <div className="flex flex-col gap-2.5 border-b border-zinc-100 px-4 py-3.5 dark:border-zinc-800 sm:px-5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${diffStyle.dotColor}`} />
                  <h4 className="truncate text-base font-bold text-zinc-900 dark:text-zinc-100">
                    {meta.label}
                  </h4>
                </div>

                {onToggleSupportShortage && (
                  <label
                    title="랏 서포터 모드: 서포터 부족 시 딜러 발키리를 서포터 자리에 배정합니다"
                    className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-semibold transition-colors ${
                      raidSettings?.[activeRaid]
                        ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-300'
                        : 'border-zinc-200 text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={!!raidSettings?.[activeRaid]}
                      onChange={(e) => onToggleSupportShortage(activeRaid, e.target.checked)}
                      disabled={isRaidSettingsLoading}
                      className="h-3 w-3 rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
                    />
                    랏폿
                  </label>
                )}
              </div>

              {userRows.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                  <span className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500">남은 인원</span>
                  {userRows.map((name) => {
                    const count = remainingByUser.get(name) ?? 0;
                    if (count === 0) {
                      return (
                        <span
                          key={name}
                          className="rounded px-1.5 py-0.5 text-[11px] font-medium text-zinc-300 line-through dark:text-zinc-600"
                        >
                          {name}
                        </span>
                      );
                    }
                    return (
                      <span
                        key={name}
                        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-bold ${getUserBadgeClass(name)}`}
                      >
                        {name}
                        <span className="tabular-nums opacity-70">{count}</span>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            <RaidRunBoard
              raidId={activeRaid}
              candidates={getCandidatesFor(activeRaid)}
              runs={runs}
              excludedIds={excludedIdsForRaid}
              onExclude={(m: Character, isCompleted: boolean) =>
                handleExcludeClick(activeRaid, m.id, isCompleted)
              }
              canExclude={Boolean(onExcludeCharacter)}
              getUserBadgeClass={getUserBadgeClass}
              userColorMap={userColorMap}
            />
          </div>
        );
      })()}

      <ConfirmModal />
    </div>
  );
};

type PartySlot =
  | { kind: 'member'; member: Character }
  | { kind: 'empty'; role: 'SUPPORT' | 'DPS' };

// 멤버 행과 빈자리 행이 같은 높이로 정렬되도록 고정.
const SLOT_ROW_CLASS = 'flex min-h-[56px] items-center gap-2.5 px-3 py-2';

// 공대 구분 — 번호 칩과 1px 테두리에만 색을 쓴다(면은 흰색 유지).
const RUN_ACCENTS = [
  { chip: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800/70' },
  { chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800/70' },
  { chip: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300', border: 'border-violet-200 dark:border-violet-800/70' },
  { chip: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800/70' },
  { chip: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300', border: 'border-rose-200 dark:border-rose-800/70' },
  { chip: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300', border: 'border-cyan-200 dark:border-cyan-800/70' },
  { chip: 'bg-lime-100 text-lime-700 dark:bg-lime-500/20 dark:text-lime-300', border: 'border-lime-200 dark:border-lime-800/70' },
  { chip: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/20 dark:text-fuchsia-300', border: 'border-fuchsia-200 dark:border-fuchsia-800/70' },
];

// 파티 슬롯은 서포터 1 + 딜러 3 고정. 빈 자리는 구인 슬롯으로 표시한다.
function buildPartySlots(members: Character[]): PartySlot[] {
  const supports = members.filter((m) => m.role === 'SUPPORT');
  const dealers = members.filter((m) => m.role === 'DPS');

  const slots: PartySlot[] = [];
  slots.push(supports[0] ? { kind: 'member', member: supports[0] } : { kind: 'empty', role: 'SUPPORT' });
  for (let i = 0; i < 3; i++) {
    slots.push(dealers[i] ? { kind: 'member', member: dealers[i] } : { kind: 'empty', role: 'DPS' });
  }

  // 엣지(파티에 서포터 2명 등): 초과 인원도 누락 없이 뒤에 덧붙인다.
  supports.slice(1).forEach((m) => slots.push({ kind: 'member', member: m }));
  dealers.slice(3).forEach((m) => slots.push({ kind: 'member', member: m }));

  return slots;
}

function EmptySlotCard({ role }: { role: 'SUPPORT' | 'DPS' }) {
  const isSupport = role === 'SUPPORT';
  return (
    <div
      className={`${SLOT_ROW_CLASS} ${
        isSupport ? 'text-emerald-500/50 dark:text-emerald-500/50' : 'text-zinc-300 dark:text-zinc-600'
      }`}
    >
      <span className="shrink-0">
        {isSupport ? <Shield size={15} /> : <Swords size={15} />}
      </span>
      <span className="text-xs font-medium">
        {isSupport ? '서포터 구인' : '딜러 구인'}
      </span>
    </div>
  );
}

function RaidRunBoard(props: {
  raidId: RaidId;
  raidLabel: string;
  candidates: Character[];
  runs: RaidRun[];
  excludedIds: string[];
  canExclude: boolean;
  onExclude: (m: Character, isCompleted: boolean) => void | Promise<void>;
  getUserBadgeClass: (discordName: string) => string;
  userColorMap: Map<string, number>;
}) {
  const { raidId, candidates, runs, excludedIds, canExclude, onExclude, getUserBadgeClass, userColorMap } = props;

  const partySize = RAID_META[raidId].partySize;
  const partyCount = partySize === 8 ? 2 : 1;

  const placedCount = runs.reduce(
    (sum, r) => sum + r.parties.reduce((s, p) => s + p.members.length, 0),
    0,
  );
  const openSlots = runs.length * partySize - placedCount;

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

  const unassigned = uniqueCandidates
    .filter((c) => !excludedSet.has(c.id) && !placedIds.has(c.id))
    .sort(sortByUserThenPower);

  return (
    <div className="flex flex-col gap-4 bg-zinc-50/70 p-3 dark:bg-zinc-950/30 sm:p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
        <span>
          공대 <span className="font-bold tabular-nums text-zinc-700 dark:text-zinc-200">{runs.length}</span>
        </span>
        <span>
          배치 <span className="font-bold tabular-nums text-zinc-700 dark:text-zinc-200">{placedCount}</span>명
        </span>
        {openSlots > 0 && (
          <span className="text-amber-600 dark:text-amber-400">
            빈자리 <span className="font-bold tabular-nums">{openSlots}</span>
          </span>
        )}
      </div>

      <div
        className={`grid gap-3 ${partyCount === 2 ? 'xl:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-3'}`}
      >
        {runs.map((run, runIdx) => {
          const memberCount = run.parties.reduce((sum, p) => sum + p.members.length, 0);
          const isFull = memberCount >= partySize;
          const accent = RUN_ACCENTS[runIdx % RUN_ACCENTS.length];

          return (
            <div
              key={`${run.raidId}-${run.runIndex}-${runIdx}`}
              className={`overflow-hidden rounded-xl border bg-white dark:bg-zinc-900 ${accent.border}`}
            >
              <div className="flex items-center gap-2 px-3 py-2.5">
                <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${accent.chip}`}>
                  {runIdx + 1}공대
                </span>
                <span
                  className={`text-[11px] font-semibold tabular-nums ${
                    isFull ? 'text-zinc-400 dark:text-zinc-500' : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {memberCount}/{partySize}
                </span>
                <span className="ml-auto flex items-baseline gap-1">
                  <span className="text-[11px] text-zinc-400 dark:text-zinc-500">평균</span>
                  <span className="text-sm font-bold tabular-nums text-zinc-800 dark:text-zinc-100">
                    {run.averageCombatPower.toLocaleString()}
                  </span>
                </span>
              </div>

              <div className={`grid ${partyCount === 2 ? 'sm:grid-cols-2 sm:divide-x sm:divide-zinc-100 sm:dark:divide-zinc-800' : ''}`}>
                {Array.from({ length: partyCount }, (_, partyIdx) => {
                  const members = run.parties[partyIdx]?.members ?? [];
                  const slots = buildPartySlots(members);

                  return (
                    <div key={partyIdx} className="min-w-0">
                      {partyCount === 2 && (
                        <div className="border-t border-zinc-100 px-3 py-1 text-[10px] font-bold tracking-wide text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
                          {partyIdx + 1}파티
                        </div>
                      )}
                      <div className="divide-y divide-zinc-100 border-t border-zinc-100 dark:divide-zinc-800 dark:border-zinc-800">
                        {slots.map((slot, slotIdx) =>
                          slot.kind === 'member' ? (
                            <RaidMemberRow
                              key={slot.member.id}
                              member={slot.member}
                              canExclude={canExclude}
                              onExclude={onExclude}
                              userBadgeClass={getUserBadgeClass(slot.member.discordName)}
                            />
                          ) : (
                            <EmptySlotCard key={`empty-${slotIdx}`} role={slot.role} />
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <MemberStrip
        title="미배치"
        icon={<CircleDashed size={13} />}
        members={unassigned}
        canExclude={canExclude}
        onExclude={onExclude}
        getUserBadgeClass={getUserBadgeClass}
      />

      <MemberStrip
        title="완료"
        icon={<CheckCircle2 size={13} />}
        members={completed}
        canExclude={canExclude}
        onExclude={onExclude}
        getUserBadgeClass={getUserBadgeClass}
        isCompleted
      />
    </div>
  );
}

function MemberStrip(props: {
  title: string;
  icon: React.ReactNode;
  members: Character[];
  canExclude: boolean;
  onExclude: (m: Character, isCompleted: boolean) => void | Promise<void>;
  getUserBadgeClass: (discordName: string) => string;
  isCompleted?: boolean;
}) {
  const { title, icon, members, canExclude, onExclude, getUserBadgeClass, isCompleted } = props;
  if (members.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs font-bold text-zinc-500 dark:text-zinc-400">
          {icon}
          {title}
        </span>
        <span className="rounded-full bg-zinc-200/70 px-1.5 text-[11px] font-bold tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          {members.length}
        </span>
        <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
      </div>
      <div
        className={`grid overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${
          isCompleted ? 'opacity-60' : ''
        }`}
      >
        {members.map((m) => (
          <div key={m.id} className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800">
            <RaidMemberRow
              member={m}
              canExclude={canExclude}
              onExclude={onExclude}
              isCompleted={isCompleted}
              userBadgeClass={getUserBadgeClass(m.discordName)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function RaidMemberRow({
  member,
  canExclude,
  onExclude,
  isCompleted,
  userBadgeClass = '',
}: any) {
  const charName = member.lostArkName || member.discordName;
  const roleColor = member.isGuest
    ? 'text-amber-500'
    : member.role === 'SUPPORT'
      ? 'text-emerald-500'
      : 'text-zinc-400 dark:text-zinc-500';

  return (
    <div className={`group ${SLOT_ROW_CLASS} transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/40`}>
      <span className={`shrink-0 ${roleColor}`} title={member.role === 'SUPPORT' ? '서포터' : '딜러'}>
        {member.role === 'SUPPORT' ? <Shield size={15} /> : <Swords size={15} />}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="truncate text-sm font-semibold leading-snug text-zinc-900 dark:text-zinc-100">
            {charName}
          </span>
          <span className="shrink-0 text-[11px] leading-snug text-zinc-400 dark:text-zinc-500">
            {member.jobCode}
          </span>
        </div>
        <div className="mt-1 flex">
          <span
            className={`max-w-full truncate rounded px-1.5 py-0.5 text-[10px] font-bold leading-tight ${userBadgeClass}`}
          >
            {member.discordName}
          </span>
        </div>
      </div>

      <div className="shrink-0 text-right">
        <div className="flex items-baseline justify-end gap-1 leading-snug">
          <span className="text-[10px] text-zinc-400 dark:text-zinc-600">전투력</span>
          <span className="text-sm font-bold tabular-nums text-zinc-800 dark:text-zinc-100">
            {member.combatPower.toLocaleString()}
          </span>
        </div>
        <div className="mt-1 flex items-baseline justify-end gap-1 leading-snug">
          <span className="text-[10px] text-zinc-400 dark:text-zinc-600">레벨</span>
          <span className="text-[11px] font-semibold tabular-nums text-zinc-600 dark:text-zinc-300">
            {member.itemLevel}
          </span>
        </div>
      </div>

      {canExclude && (
        <button
          onClick={() => onExclude(member, isCompleted)}
          className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-bold transition-colors ${
            isCompleted
              ? 'border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-400 dark:hover:bg-rose-900/30'
              : 'border-zinc-200 text-zinc-500 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-emerald-600 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-300'
          }`}
          title={isCompleted ? '완료 취소' : '완료(제외) 처리'}
        >
          {isCompleted ? <RotateCcw size={12} /> : <Check size={12} />}
          {isCompleted ? '취소' : '완료'}
        </button>
      )}
    </div>
  );
}