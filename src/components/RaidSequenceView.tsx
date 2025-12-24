import React, { useEffect, useMemo, useState } from 'react';
import type {
  RaidSchedule,
  RaidRun,
  RaidId,
  Character,
  RaidExclusionMap,
} from '../types';
import { RAID_META } from '../constants';
import {
  ArrowRight,
  UserPlus,
  UserMinus,
  Repeat2,
  Shield,
  Swords,
  Users,
  X,
  CheckCircle2,
  Filter,
} from 'lucide-react';
import { excludeCharactersOnRaid } from '../api/exclusionApi';

// 모드 타입
type BalanceMode = 'overall' | 'role' | 'speed';

// ----------------------------------------------------------------------
// [LOGIC ZONE]
// ----------------------------------------------------------------------

const RAID_ORDER: RaidId[] = [
  'ACT3_HARD',
  'ACT4_NORMAL',
  'ACT4_HARD',
  'FINAL_NORMAL',
  'FINAL_HARD',
];

interface GlobalStep {
  index: number;
  raidId: RaidId;
  run: RaidRun;
}

interface TransitionDiff {
  leaving: Character[];
  entering: Character[];
  switching: {
    discordName: string;
    from: Character;
    to: Character;
  }[];
}

interface ParticipantGroup {
  key: string;
  size: number;
  participants: string[];
  runs: { raidId: RaidId; run: RaidRun }[];
}

type Role = 'DPS' | 'SUPPORT';
const SUPPORT_JOBS = new Set(
  ['BARD', 'PALADIN', 'HOLYKNIGHT', 'ARTIST'].map((s) => s.toUpperCase()),
);

function getRoleFallbackByJob(jobCode: string): Role {
  const key = (jobCode || '').toUpperCase();
  return SUPPORT_JOBS.has(key) ? 'SUPPORT' : 'DPS';
}

function getRunMembers(run: RaidRun): Character[] {
  return run.parties.flatMap((p) => p.members);
}

function computeDiff(prevRun: RaidRun, nextRun: RaidRun): TransitionDiff {
  const prevMembers = getRunMembers(prevRun);
  const nextMembers = getRunMembers(nextRun);

  const prevByUser: Record<string, Character> = {};
  const nextByUser: Record<string, Character> = {};

  prevMembers.forEach((m) => {
    prevByUser[m.discordName] = m;
  });
  nextMembers.forEach((m) => {
    nextByUser[m.discordName] = m;
  });

  const leaving: Character[] = [];
  const entering: Character[] = [];
  const switching: { discordName: string; from: Character; to: Character }[] = [];

  Object.entries(prevByUser).forEach(([discordName, fromChar]) => {
    const toChar = nextByUser[discordName];
    if (!toChar) {
      leaving.push(fromChar);
      return;
    }
    if (toChar.id !== fromChar.id) {
      switching.push({ discordName, from: fromChar, to: toChar });
    }
  });

  Object.entries(nextByUser).forEach(([discordName, toChar]) => {
    if (!prevByUser[discordName]) {
      entering.push(toChar);
    }
  });

  return { leaving, entering, switching };
}

function localTransitionCost(prevRun: RaidRun, nextRun: RaidRun): number {
  const diff = computeDiff(prevRun, nextRun);
  const userChange = diff.leaving.length + diff.entering.length;
  const charChange = diff.switching.length;
  const BIG = 100;
  return userChange * BIG + charChange;
}

interface OrderedRun {
  raidId: RaidId;
  run: RaidRun;
}

function orderRunsInsideParticipantGroup(group: ParticipantGroup): OrderedRun[] {
  const runs = group.runs;
  const g = runs.length;
  if (g <= 1) return [...runs];

  const costMatrix: number[][] = Array.from({ length: g }, () =>
    Array(g).fill(0),
  );
  for (let i = 0; i < g; i++) {
    for (let j = 0; j < g; j++) {
      if (i === j) costMatrix[i][j] = Number.POSITIVE_INFINITY;
      else costMatrix[i][j] = localTransitionCost(runs[i].run, runs[j].run);
    }
  }

  let bestOrderPos: number[] = [];
  let bestCost = Number.POSITIVE_INFINITY;

  for (let start = 0; start < g; start++) {
    const visited = new Array<boolean>(g).fill(false);
    const orderPos: number[] = [];
    let totalCost = 0;

    let current = start;
    visited[current] = true;
    orderPos.push(current);

    for (let step = 1; step < g; step++) {
      let bestNext = -1;
      let bestNextCost = Number.POSITIVE_INFINITY;

      for (let cand = 0; cand < g; cand++) {
        if (visited[cand]) continue;
        const c = costMatrix[current][cand];
        if (c < bestNextCost || (c === bestNextCost && cand < bestNext)) {
          bestNextCost = c;
          bestNext = cand;
        }
      }

      if (bestNext === -1) break;
      visited[bestNext] = true;
      orderPos.push(bestNext);
      totalCost += bestNextCost;
      current = bestNext;
    }

    if (orderPos.length < g) {
      for (let i = 0; i < g; i++) if (!visited[i]) orderPos.push(i);
    }

    if (totalCost < bestCost) {
      bestCost = totalCost;
      bestOrderPos = orderPos;
    } else if (totalCost === bestCost) {
      const aKey = bestOrderPos
        .map((p) => {
          const r = runs[p];
          return `${RAID_ORDER.indexOf(r.raidId)}-${r.run.runIndex}`;
        })
        .join(',');
      const bKey = orderPos
        .map((p) => {
          const r = runs[p];
          return `${RAID_ORDER.indexOf(r.raidId)}-${r.run.runIndex}`;
        })
        .join(',');
      if (bKey < aKey) bestOrderPos = orderPos;
    }
  }

  return bestOrderPos.map((pos) => runs[pos]);
}

// ✅ 스케줄 객체를 받아서 시퀀스를 생성하는 함수
// (필터링된 스케줄이 들어오면 그에 맞춰 그룹과 Diff가 자동 재계산됨)
function buildSequence(schedule: RaidSchedule): {
  groups: { size: number; participants: string[]; steps: GlobalStep[] }[];
  totalCost: number;
} {
  const flat: { raidId: RaidId; run: RaidRun }[] = [];
  
  // RAID_ORDER 순서대로 순회하지만 schedule에 없는 키는 건너뜀
  RAID_ORDER.forEach((raidId) => {
    const runs = schedule[raidId] || [];
    runs.forEach((run) => flat.push({ raidId, run }));
  });

  if (flat.length === 0) return { groups: [], totalCost: 0 };

  const groupMap = new Map<string, ParticipantGroup>();

  flat.forEach(({ raidId, run }) => {
    const members = getRunMembers(run);
    const userSet = new Set<string>();
    members.forEach((m) => userSet.add(m.discordName));
    const participants = Array.from(userSet).sort();
    const key = participants.join('|');
    const size = participants.length;

    if (!groupMap.has(key)) {
      groupMap.set(key, { key, size, participants, runs: [] });
    }
    groupMap.get(key)!.runs.push({ raidId, run });
  });

  const participantGroups = Array.from(groupMap.values()).sort((a, b) => {
    if (b.size !== a.size) return b.size - a.size;
    return a.participants.join(',').localeCompare(b.participants.join(','));
  });

  const resultGroups: {
    size: number;
    participants: string[];
    steps: GlobalStep[];
  }[] = [];
  const flatSteps: GlobalStep[] = [];
  let globalIndex = 1;

  participantGroups.forEach((group) => {
    const orderedRuns = orderRunsInsideParticipantGroup(group);
    const stepsForGroup: GlobalStep[] = orderedRuns.map(({ raidId, run }) => {
      const step: GlobalStep = { index: globalIndex++, raidId, run };
      flatSteps.push(step);
      return step;
    });

    resultGroups.push({
      size: group.size,
      participants: group.participants,
      steps: stepsForGroup,
    });
  });

  let totalCost = 0;
  for (let i = 1; i < flatSteps.length; i++) {
    totalCost += localTransitionCost(flatSteps[i - 1].run, flatSteps[i].run);
  }

  return { groups: resultGroups, totalCost };
}

// ----------------------------------------------------------------------
// [DISPLAY HELPERS]
// ----------------------------------------------------------------------

function getExcludedIds(exclusions: RaidExclusionMap | undefined, raidId: RaidId) {
  return exclusions?.[raidId] ?? [];
}

function getVisibleMembers(
  raidId: RaidId,
  run: RaidRun,
  exclusions: RaidExclusionMap | undefined,
): Character[] {
  const excluded = new Set(getExcludedIds(exclusions, raidId));
  return run.parties.flatMap((p) => p.members.filter((m) => !excluded.has(m.id)));
}

function computeDiffByMembers(
  prevMembers: Character[],
  nextMembers: Character[],
): TransitionDiff {
  const prevByUser: Record<string, Character> = {};
  const nextByUser: Record<string, Character> = {};

  prevMembers.forEach((m) => {
    prevByUser[m.discordName] = m;
  });
  nextMembers.forEach((m) => {
    nextByUser[m.discordName] = m;
  });

  const leaving: Character[] = [];
  const entering: Character[] = [];
  const switching: { discordName: string; from: Character; to: Character }[] = [];

  Object.entries(prevByUser).forEach(([discordName, fromChar]) => {
    const toChar = nextByUser[discordName];
    if (!toChar) {
      leaving.push(fromChar);
      return;
    }
    if (toChar.id !== fromChar.id) {
      switching.push({ discordName, from: fromChar, to: toChar });
    }
  });

  Object.entries(nextByUser).forEach(([discordName, toChar]) => {
    if (!prevByUser[discordName]) {
      entering.push(toChar);
    }
  });

  return { leaving, entering, switching };
}

function resolveRole(char: Character): Role {
  if (char.role === 'SUPPORT') return 'SUPPORT';
  if (char.role === 'DPS') return 'DPS';
  return getRoleFallbackByJob(char.jobCode);
}

// ----------------------------------------------------------------------
// [UI COMPONENTS]
// ----------------------------------------------------------------------

function RoleIcon({ role, className }: { role: Role; className?: string }) {
  const Icon = role === 'SUPPORT' ? Shield : Swords;
  return <Icon className={className} />;
}

function CharacterBadge({
  char,
  type,
}: {
  char: Character;
  type: 'neutral' | 'leave' | 'enter' | 'switch-from' | 'switch-to';
}) {
  const role = resolveRole(char);

  let bgClass = '';
  let textClass = '';
  let borderClass = '';

  switch (type) {
    case 'leave':
      bgClass = 'bg-red-50 dark:bg-red-950/40';
      textClass = 'text-red-700 dark:text-red-200';
      borderClass = 'border-red-100 dark:border-red-900/50';
      break;
    case 'enter':
      bgClass = 'bg-emerald-50 dark:bg-emerald-950/40';
      textClass = 'text-emerald-700 dark:text-emerald-200';
      borderClass = 'border-emerald-100 dark:border-emerald-900/50';
      break;
    case 'switch-from':
      bgClass = 'bg-zinc-50 dark:bg-zinc-800/50';
      textClass = 'text-zinc-500 dark:text-zinc-400 decoration-zinc-400 line-through';
      borderClass = 'border-zinc-200 dark:border-zinc-700';
      break;
    case 'switch-to':
      bgClass = 'bg-amber-50 dark:bg-amber-950/40';
      textClass = 'text-amber-800 dark:text-amber-100 font-bold';
      borderClass = 'border-amber-200 dark:border-amber-900/50 ring-1 ring-amber-300/50 dark:ring-amber-700/50';
      break;
    default:
      bgClass = 'bg-zinc-50 dark:bg-zinc-900';
      textClass = 'text-zinc-700 dark:text-zinc-300';
      borderClass = 'border-zinc-200 dark:border-zinc-800';
  }

  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-all ${bgClass} ${borderClass}`}>
      <div className={`flex items-center gap-1.5 ${textClass}`}>
        <RoleIcon role={role} className="h-3.5 w-3.5 opacity-80" />
        <span className="font-medium">{char.jobCode}</span>
      </div>
      <span className="text-xs text-zinc-400 dark:text-zinc-500">Lv.{char.itemLevel}</span>
      {type !== 'switch-from' && type !== 'switch-to' && (
        <span className="ml-1 border-l border-zinc-300 pl-2 text-xs font-semibold text-zinc-900 dark:border-zinc-700 dark:text-zinc-100">
          {char.discordName}
        </span>
      )}
    </div>
  );
}

function StartRoster({
  raidId,
  run,
  exclusions,
}: {
  raidId: RaidId;
  run: RaidRun;
  exclusions?: RaidExclusionMap;
}) {
  const excludedIdsForRaid = getExcludedIds(exclusions, raidId);
  const excluded = new Set(excludedIdsForRaid);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {run.parties.map((party) => {
          const visibleMembers = party.members.filter((m) => !excluded.has(m.id));
          const emptySlots = Math.max(0, 4 - visibleMembers.length);

          return (
            <div
              key={party.partyIndex}
              className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-950/40"
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-500">
                  <Users className="h-4 w-4" />
                  <span>PARTY {party.partyIndex}</span>
                </div>
                <span className="text-[10px] text-zinc-400">{visibleMembers.length}/4</span>
              </div>

              <div className="flex flex-col gap-2">
                {visibleMembers.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-zinc-900/5 dark:bg-zinc-900 dark:ring-zinc-800"
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                          resolveRole(m) === 'SUPPORT'
                            ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300'
                            : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
                        }`}
                      >
                        <RoleIcon role={resolveRole(m)} className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">
                          {m.jobCode}
                        </div>
                        <div className="truncate text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                          {m.discordName}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                        Lv.{m.itemLevel}
                      </div>
                      <div className="text-[10px] text-zinc-400">CP {m.combatPower.toLocaleString()}</div>
                    </div>
                  </div>
                ))}
                {Array.from({ length: emptySlots }).map((_, i) => (
                  <div
                    key={`empty-${run.runIndex}-${party.partyIndex}-${i}`}
                    className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-200 py-3 text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-600"
                  >
                    빈 자리 (공팟)
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// [MAIN VIEW]
// ----------------------------------------------------------------------

interface Props {
  schedule: RaidSchedule | null;
  exclusions?: RaidExclusionMap;
  balanceMode?: BalanceMode;
  updatedBy?: string;
  onExclusionsUpdated?: (next: RaidExclusionMap) => void;
}

export const RaidSequenceView: React.FC<Props> = ({
  schedule,
  exclusions,
  balanceMode = 'overall',
  updatedBy,
  onExclusionsUpdated,
}) => {
  // ✅ 1. 레이드 필터 상태 (기본값: 전체 선택)
  const [selectedRaids, setSelectedRaids] = useState<Set<RaidId>>(new Set(RAID_ORDER));

  const [localExclusions, setLocalExclusions] = useState<RaidExclusionMap>(
    exclusions ?? {},
  );
  useEffect(() => {
    setLocalExclusions(exclusions ?? {});
  }, [exclusions]);

  const [completingKey, setCompletingKey] = useState<string | null>(null);
  const isBlocking = completingKey !== null;

  // ✅ 2. 필터가 적용된 스케줄 생성
  const filteredSchedule = useMemo(() => {
    if (!schedule) return null;
    const fs: RaidSchedule = {
      ACT3_HARD: [],
      ACT4_NORMAL: [],
      ACT4_HARD: [],
      FINAL_NORMAL: [],
      FINAL_HARD: [],
    };
    
    // 선택된 레이드 키의 데이터만 복사
    selectedRaids.forEach((raidId) => {
      if (schedule[raidId]) {
        fs[raidId] = schedule[raidId];
      }
    });
    return fs;
  }, [schedule, selectedRaids]);

  // ✅ 3. 필터링된 스케줄 기준으로 시퀀스(그룹 및 diff) 다시 생성
  const { groups } = useMemo(() => {
    if (!filteredSchedule) return { groups: [], totalCost: 0 };
    return buildSequence(filteredSchedule);
  }, [filteredSchedule]);

  if (!schedule) return null;

  const toggleRaid = (id: RaidId) => {
    const next = new Set(selectedRaids);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedRaids(next);
  };

  const flatSteps: GlobalStep[] = groups.flatMap((g) => g.steps);
  // steps가 없어도 필터 UI는 보여주기 위해 조건문 위치 조정 필요할 수 있으나, 데이터가 없으면 null 리턴 유지

  // Diff 계산 (보이는 멤버 기준 + 필터링된 인접 스텝 기준)
  const diffs: (TransitionDiff | null)[] = [];
  flatSteps.forEach((step, idx) => {
    if (idx === 0) {
      diffs.push(null);
      return;
    }
    const prev = flatSteps[idx - 1];
    const prevMembers = getVisibleMembers(prev.raidId, prev.run, localExclusions);
    const nextMembers = getVisibleMembers(step.raidId, step.run, localExclusions);
    diffs.push(computeDiffByMembers(prevMembers, nextMembers));
  });

  let flatIdx = 0;

  return (
    <div className="relative mx-auto w-full max-w-4xl space-y-4">
      
      {/* ✅ Filter Controls UI */}
      <div className="sticky top-0 z-30 flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/90">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-600 dark:text-zinc-400">
          <Filter className="h-4 w-4" />
          <span>오늘 진행할 레이드 선택</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {RAID_ORDER.map((raidId) => {
            const isActive = selectedRaids.has(raidId);
            const meta = RAID_META[raidId];
            const isHard = meta.difficulty === 'HARD';
            
            // 버튼 스타일 계산
            let btnClass = 'flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition-all border ';
            if (isActive) {
              if (isHard) {
                btnClass += 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/30 dark:border-rose-900 dark:text-rose-200 shadow-sm';
              } else {
                btnClass += 'bg-sky-50 border-sky-200 text-sky-700 dark:bg-sky-950/30 dark:border-sky-900 dark:text-sky-200 shadow-sm';
              }
            } else {
              btnClass += 'bg-transparent border-zinc-200 text-zinc-400 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800';
            }

            return (
              <button
                key={raidId}
                onClick={() => toggleRaid(raidId)}
                className={btnClass}
              >
                <div className={`h-2 w-2 rounded-full ${isActive ? (isHard ? 'bg-rose-500' : 'bg-sky-500') : 'bg-zinc-300 dark:bg-zinc-700'}`} />
                {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      {isBlocking && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="rounded-2xl bg-white px-5 py-4 text-sm font-bold text-zinc-900 shadow-lg dark:bg-zinc-900 dark:text-zinc-100">
            레이드 완료 처리 중...
          </div>
        </div>
      )}

      {/* Empty State when filters are all off */}
      {flatSteps.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
          <Filter className="mb-2 h-8 w-8 opacity-20" />
          <p>선택된 레이드가 없습니다.</p>
        </div>
      )}

      <div className="relative">
        {/* Continuous Timeline Line */}
        {flatSteps.length > 0 && (
          <div className="absolute bottom-0 left-[19px] top-4 w-0.5 bg-zinc-200 dark:bg-zinc-800" />
        )}

        <div className="space-y-16">
          {groups.map((group, groupIdx) => {
            const firstStep = group.steps[0];
            const startUsers = Array.from(
              new Set(
                getVisibleMembers(firstStep.raidId, firstStep.run, localExclusions).map(
                  (m) => m.discordName,
                ),
              ),
            ).sort();

            return (
              <div key={`group-${groupIdx}`} className="relative">
                {/* Group Header */}
                <div className="relative mb-8 flex items-center gap-4">
                  <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:bg-indigo-500 dark:shadow-none">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="flex flex-wrap gap-1.5">
                        {startUsers.map((name) => (
                          <span
                            key={name}
                            className="inline-block rounded bg-zinc-100 px-2 py-0.5 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Steps Timeline */}
                <div className="space-y-8 pl-4">
                  {group.steps.map((step) => {
                    const currentFlatIdx = flatIdx;
                    const diff = diffs[currentFlatIdx];

                    const isFirst = currentFlatIdx === 0;
                    const isGroupFirst = step === group.steps[0];

                    const meta = RAID_META[step.raidId];
                    const isHard = meta.difficulty === 'HARD';

                    const hasLeaving = diff && diff.leaving.length > 0;
                    const hasEntering = diff && diff.entering.length > 0;
                    const hasSwitching = diff && diff.switching.length > 0;
                    const hasChanges = hasLeaving || hasEntering || hasSwitching;

                    // 그룹이 바뀌는 지점에서는 입장/퇴장/교체 대신 시작 멤버만
                    // (필터링된 flatSteps 기준이므로, 중간 레이드가 생략되면 건너뛰고 비교함)
                    const prevKey =
                      currentFlatIdx > 0
                        ? Array.from(
                            new Set(
                              getVisibleMembers(
                                flatSteps[currentFlatIdx - 1].raidId,
                                flatSteps[currentFlatIdx - 1].run,
                                localExclusions,
                              ).map((m) => m.discordName),
                            ),
                          )
                            .sort()
                            .join('|')
                        : null;

                    const currentVisibleMembers = getVisibleMembers(
                      step.raidId,
                      step.run,
                      localExclusions,
                    );

                    const currentKey = Array.from(
                      new Set(currentVisibleMembers.map((m) => m.discordName)),
                    )
                      .sort()
                      .join('|');

                    const showStartRoster = isGroupFirst && (isFirst || prevKey !== currentKey);

                    const completeTargetIds = Array.from(
                      new Set(currentVisibleMembers.map((m) => m.id)),
                    );
                    const completeBtnKey = `${step.raidId}-${step.run.runIndex}`;
                    const isCompleting = completingKey === completeBtnKey;

                    const dpsMembers = currentVisibleMembers.filter(
                      (m) => resolveRole(m) === 'DPS',
                    );
                    const supMembers = currentVisibleMembers.filter(
                      (m) => resolveRole(m) === 'SUPPORT',
                    );

                    const avgDps = dpsMembers.length > 0
                        ? Math.round(dpsMembers.reduce((sum, m) => sum + m.combatPower, 0) / dpsMembers.length)
                        : null;
                    const avgSup = supMembers.length > 0
                        ? Math.round(supMembers.reduce((sum, m) => sum + m.combatPower, 0) / supMembers.length)
                        : null;
                    const overallAvg = currentVisibleMembers.length > 0
                        ? Math.round(currentVisibleMembers.reduce((sum, m) => sum + m.combatPower, 0) / currentVisibleMembers.length)
                        : null;

                    flatIdx++;

                    return (
                      <div
                        key={`${step.raidId}-${step.run.runIndex}`}
                        className="relative flex gap-6"
                      >
                        {/* Timeline Node */}
                        <div className="relative z-10 mt-1.5 flex h-3 w-3 shrink-0 items-center justify-center -translate-x-[2px]">
                          <div
                            className={`h-3 w-3 rounded-full border-2 bg-white dark:bg-zinc-950 ${
                              isHard ? 'border-rose-500' : 'border-sky-500'
                            }`}
                          />
                        </div>

                        {/* Content Card */}
                        <div className="min-w-0 flex-1 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/50">
                          {/* Card Header */}
                          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-100 text-sm font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                                {step.index}
                              </span>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className={`font-bold ${isHard ? 'text-rose-600 dark:text-rose-400' : 'text-sky-600 dark:text-sky-400'}`}>
                                    {meta.label}
                                  </h4>
                                  <span className={`text-[10px] font-extrabold uppercase tracking-wider ${isHard ? 'text-rose-800/60 dark:text-rose-300/60' : 'text-sky-800/60 dark:text-sky-300/60'}`}>
                                    {meta.difficulty}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {/* 평균 전투력 표시 */}
                              <div className="flex flex-wrap items-center gap-2">
                                {balanceMode === 'role' ? (
                                  <>
                                    <span className="inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-[11px] font-medium text-zinc-500 shadow-sm ring-1 ring-zinc-100 dark:bg-zinc-900 dark:text-zinc-400 dark:ring-zinc-700">
                                      <Swords className="h-3 w-3 text-zinc-600 dark:text-zinc-300" />
                                      <span className="uppercase tracking-wide">DPS</span>
                                      <strong className="ml-1 text-zinc-800 dark:text-zinc-100">
                                        {avgDps !== null ? avgDps.toLocaleString() : '없음'}
                                      </strong>
                                    </span>
                                    <span className="inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-[11px] font-medium text-zinc-500 shadow-sm ring-1 ring-zinc-100 dark:bg-zinc-900 dark:text-zinc-400 dark:ring-zinc-700">
                                      <Shield className="h-3 w-3 text-emerald-600 dark:text-emerald-300" />
                                      <span className="uppercase tracking-wide">SUP</span>
                                      <strong className="ml-1 text-zinc-800 dark:text-zinc-100">
                                        {avgSup !== null ? avgSup.toLocaleString() : '없음'}
                                      </strong>
                                    </span>
                                  </>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-[11px] font-medium text-zinc-500 shadow-sm ring-1 ring-zinc-100 dark:bg-zinc-900 dark:text-zinc-400 dark:ring-zinc-700">
                                    <Swords className="h-3 w-3 text-zinc-600 dark:text-zinc-300" />
                                    <span className="tracking-wide whitespace-nowrap">평균 전투력</span>
                                    <strong className="ml-1 text-zinc-800 dark:text-zinc-100">
                                      {overallAvg !== null ? overallAvg.toLocaleString() : '없음'}
                                    </strong>
                                  </span>
                                )}
                              </div>

                              {/* 레이드 완료 버튼 */}
                              <div className="flex items-center gap-2">
                                <div className="shrink-0 whitespace-nowrap rounded-md bg-zinc-50 px-2 py-1 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                                  #{step.run.runIndex} 공대
                                </div>
                                <button
                                  type="button"
                                  disabled={completeTargetIds.length === 0 || isCompleting}
                                  onClick={async () => {
                                    const ok = window.confirm(`${meta.label} #${step.run.runIndex} 공대를 완료 처리할까요?\n\n이 공대의 멤버들이 이 레이드에서 제외됩니다.`);
                                    if (!ok) return;
                                    try {
                                      setCompletingKey(completeBtnKey);
                                      const next = await excludeCharactersOnRaid(step.raidId, completeTargetIds, updatedBy);
                                      setLocalExclusions(next);
                                      onExclusionsUpdated?.(next);
                                    } catch (e) {
                                      console.error(e);
                                      alert('레이드 완료 처리 실패');
                                    } finally {
                                      setCompletingKey(null);
                                    }
                                  }}
                                  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold border border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900/50 dark:text-emerald-200 dark:hover:bg-emerald-950/40 disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap"
                                  title="레이드 완료"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  레이드 완료
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Changes Section */}
                          {showStartRoster ? (
                            <StartRoster
                              raidId={step.raidId}
                              run={step.run}
                              exclusions={localExclusions}
                            />
                          ) : !hasChanges ? (
                            <div className="flex items-center gap-2 rounded-xl border border-dashed border-zinc-200 p-3 text-sm text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
                              <X className="h-4 w-4" />
                              <span>캐릭터 변동 없음 (Same Members)</span>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-3">
                              {hasLeaving && (
                                <div className="flex flex-col gap-2">
                                  <div className="flex items-center gap-2 text-xs font-semibold text-red-600 dark:text-red-400">
                                    <UserMinus className="h-3.5 w-3.5" />
                                    <span>퇴장 (Leaving)</span>
                                  </div>
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    {diff!.leaving.map((m) => (
                                      <CharacterBadge key={m.id} char={m} type="leave" />
                                    ))}
                                  </div>
                                </div>
                              )}

                              {hasSwitching && (
                                <div className="flex flex-col gap-2">
                                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-600 dark:text-amber-400">
                                    <Repeat2 className="h-3.5 w-3.5" />
                                    <span>캐릭터 교체</span>
                                  </div>
                                  <div className="flex flex-col gap-2">
                                    {diff!.switching.map((s) => (
                                      <div
                                        key={s.discordName}
                                        className="flex flex-col gap-2 rounded-xl bg-amber-50/50 p-2 dark:bg-amber-950/20 sm:flex-row sm:items-center sm:justify-between sm:p-1.5 sm:pr-2"
                                      >
                                        <div className="flex items-center gap-2 pl-1">
                                          <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                                            {s.discordName}
                                          </span>
                                        </div>
                                        <div className="flex flex-1 items-center gap-2 sm:justify-end">
                                          <div className="hidden items-center gap-2 sm:flex">
                                            <CharacterBadge char={s.from} type="switch-from" />
                                            <ArrowRight className="h-3 w-3 text-amber-400" />
                                          </div>
                                          <div className="w-full sm:w-auto">
                                            <CharacterBadge char={s.to} type="switch-to" />
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {hasEntering && (
                                <div className="flex flex-col gap-2">
                                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                    <UserPlus className="h-3.5 w-3.5" />
                                    <span>입장 (Entering)</span>
                                  </div>
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    {diff!.entering.map((m) => (
                                      <CharacterBadge key={m.id} char={m} type="enter" />
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
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
      </div>
    </div>
  );
};