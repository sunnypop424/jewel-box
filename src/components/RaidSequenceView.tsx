// src/components/RaidSequenceView.tsx
import React, { useMemo } from 'react';
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
  X
} from 'lucide-react';

// 모드 타입(문자열) – App / raidLogic과 동일한 리터럴 사용
type BalanceMode = 'overall' | 'role' | 'speed';

// ----------------------------------------------------------------------
// [LOGIC ZONE] - 기존 로직은 그대로 두고, "표시용" 보조 로직만 아래쪽(UI)에서 추가합니다.
// ----------------------------------------------------------------------

// 출력용 레이드 정렬 우선순위
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
  const switching: { discordName: string; from: Character; to: Character }[] =
    [];

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

function buildSequence(schedule: RaidSchedule): {
  groups: { size: number; participants: string[]; steps: GlobalStep[] }[];
  totalCost: number;
} {
  const flat: { raidId: RaidId; run: RaidRun }[] = [];
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
// [DISPLAY HELPERS] - ✅ RaidScheduleView.tsx와 "동일하게 보이도록" 표시용 보조 로직만 추가
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

function computeDiffByMembers(prevMembers: Character[], nextMembers: Character[]): TransitionDiff {
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
  // ✅ Sheet API에서 내려온 role을 우선 사용 (DPS / SUPPORT)
  if (char.role === 'SUPPORT') return 'SUPPORT';
  if (char.role === 'DPS') return 'DPS';
  // 혹시 role이 없는 데이터가 섞여있을 때만 fallback
  return getRoleFallbackByJob(char.jobCode);
}

// ----------------------------------------------------------------------
// [NEW UI COMPONENTS]
// ----------------------------------------------------------------------

function RoleIcon({
  role,
  className,
}: {
  role: Role;
  className?: string;
}) {
  const isSupport = role === 'SUPPORT';
  const Icon = isSupport ? Shield : Swords;
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
      textClass =
        'text-zinc-500 dark:text-zinc-400 decoration-zinc-400 line-through';
      borderClass = 'border-zinc-200 dark:border-zinc-700';
      break;
    case 'switch-to':
      bgClass = 'bg-amber-50 dark:bg-amber-950/40';
      textClass = 'text-amber-800 dark:text-amber-100 font-bold';
      borderClass =
        'border-amber-200 dark:border-amber-900/50 ring-1 ring-amber-300/50 dark:ring-amber-700/50';
      break;
    default:
      bgClass = 'bg-zinc-50 dark:bg-zinc-900';
      textClass = 'text-zinc-700 dark:text-zinc-300';
      borderClass = 'border-zinc-200 dark:border-zinc-800';
  }

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-all ${bgClass} ${borderClass}`}
    >
      <div className={`flex items-center gap-1.5 ${textClass}`}>
        <RoleIcon role={role} className="h-3.5 w-3.5 opacity-80" />
        <span className="font-medium">{char.jobCode}</span>
      </div>
      <span className="text-xs text-zinc-400 dark:text-zinc-500">
        Lv.{char.itemLevel}
      </span>

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
                <span className="text-[10px] text-zinc-400">
                  {visibleMembers.length}/4
                </span>
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
                        title={resolveRole(m)}
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
                      <div className="text-[10px] text-zinc-400">
                        CP {m.combatPower.toLocaleString()}
                      </div>
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
// [MAIN VIEW] - Timeline Style
// ----------------------------------------------------------------------

interface Props {
  schedule: RaidSchedule | null;
  exclusions?: RaidExclusionMap; // ✅ RaidScheduleView.tsx와 동일한 제외 반영
  balanceMode?: BalanceMode; // ✅ RaidScheduleView.tsx와 동일하게 평균 전투력 표시용
}

export const RaidSequenceView: React.FC<Props> = ({
  schedule,
  exclusions,
  balanceMode = 'overall',
}) => {
  const { groups } = useMemo(() => {
    if (!schedule) return { groups: [], totalCost: 0 };
    return buildSequence(schedule);
  }, [schedule]);

  if (!schedule || groups.length === 0) return null;

  const flatSteps: GlobalStep[] = groups.flatMap((g) => g.steps);
  if (flatSteps.length <= 1) return null;

  // ✅ Diff도 "보이는 멤버(=RaidScheduleView 기준)"로 계산
  const diffs: (TransitionDiff | null)[] = [];
  flatSteps.forEach((step, idx) => {
    if (idx === 0) {
      diffs.push(null);
      return;
    }
    const prev = flatSteps[idx - 1];
    const prevMembers = getVisibleMembers(prev.raidId, prev.run, exclusions);
    const nextMembers = getVisibleMembers(step.raidId, step.run, exclusions);
    diffs.push(computeDiffByMembers(prevMembers, nextMembers));
  });

  let flatIdx = 0;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-12">
      <div className="relative">
        {/* Continuous Timeline Line */}
        <div className="absolute bottom-0 left-[19px] top-4 w-0.5 bg-zinc-200 dark:bg-zinc-800" />

        <div className="space-y-16">
          {groups.map((group, groupIdx) => {
            // ✅ 그룹 헤더의 참가자도 "보이는 멤버" 기준으로 맞춤
            const firstStep = group.steps[0];
            const startUsers = Array.from(
              new Set(
                getVisibleMembers(firstStep.raidId, firstStep.run, exclusions).map(
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

                    // 변경 사항이 있는지 확인
                    const hasLeaving = diff && diff.leaving.length > 0;
                    const hasEntering = diff && diff.entering.length > 0;
                    const hasSwitching = diff && diff.switching.length > 0;
                    const hasChanges = hasLeaving || hasEntering || hasSwitching;

                    // ✅ 그룹이 바뀌는 지점(=이전 스텝과 "참가자 구성"이 달라지는 지점)에서는
                    //    입장/퇴장/교체 UI 대신 "시작 멤버"만 보여주기
                    const prevKey =
                      currentFlatIdx > 0
                        ? Array.from(
                            new Set(
                              getVisibleMembers(
                                flatSteps[currentFlatIdx - 1].raidId,
                                flatSteps[currentFlatIdx - 1].run,
                                exclusions,
                              ).map((m) => m.discordName),
                            ),
                          )
                            .sort()
                            .join('|')
                        : null;

                    const currentKey = Array.from(
                      new Set(
                        getVisibleMembers(step.raidId, step.run, exclusions).map(
                          (m) => m.discordName,
                        ),
                      ),
                    )
                      .sort()
                      .join('|');

                    const showStartRoster =
                      isGroupFirst && (isFirst || prevKey !== currentKey);

                    // ✅ 이 공대의 "보이는 멤버" 기준 평균 전투력 (RaidScheduleView와 동일)
                    const allVisibleMembers = getVisibleMembers(
                      step.raidId,
                      step.run,
                      exclusions,
                    );
                    const dpsMembers = allVisibleMembers.filter(
                      (m) => resolveRole(m) === 'DPS',
                    );
                    const supMembers = allVisibleMembers.filter(
                      (m) => resolveRole(m) === 'SUPPORT',
                    );

                    const avgDps =
                      dpsMembers.length > 0
                        ? Math.round(
                            dpsMembers.reduce(
                              (sum, m) => sum + m.combatPower,
                              0,
                            ) / dpsMembers.length,
                          )
                        : null;

                    const avgSup =
                      supMembers.length > 0
                        ? Math.round(
                            supMembers.reduce(
                              (sum, m) => sum + m.combatPower,
                              0,
                            ) / supMembers.length,
                          )
                        : null;

                    const overallAvg =
                      allVisibleMembers.length > 0
                        ? Math.round(
                            allVisibleMembers.reduce(
                              (sum, m) => sum + m.combatPower,
                              0,
                            ) / allVisibleMembers.length,
                          )
                        : null;

                    // advance global index
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
                                  <h4
                                    className={`font-bold ${
                                      isHard
                                        ? 'text-rose-600 dark:text-rose-400'
                                        : 'text-sky-600 dark:text-sky-400'
                                    }`}
                                  >
                                    {meta.label}
                                  </h4>
                                  <span
                                    className={`text-[10px] font-extrabold uppercase tracking-wider ${
                                      isHard
                                        ? 'text-rose-800/60 dark:text-rose-300/60'
                                        : 'text-sky-800/60 dark:text-sky-300/60'
                                    }`}
                                  >
                                    {meta.difficulty}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {/* ✅ 모드에 따라 평균 전투력 표시 방식 변경 */}
                              <div className="flex flex-wrap items-center gap-2">
                                {balanceMode === 'role' ? (
                                  <>
                                    <span className="inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-[11px] font-medium text-zinc-500 shadow-sm ring-1 ring-zinc-100 dark:bg-zinc-900 dark:text-zinc-400 dark:ring-zinc-700">
                                      <Swords className="h-3 w-3 text-zinc-600 dark:text-zinc-300" />
                                      <span className="uppercase tracking-wide">
                                        DPS
                                      </span>
                                      <strong className="ml-1 text-zinc-800 dark:text-zinc-100">
                                        {avgDps !== null
                                          ? avgDps.toLocaleString()
                                          : '없음'}
                                      </strong>
                                    </span>
                                    <span className="inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-[11px] font-medium text-zinc-500 shadow-sm ring-1 ring-zinc-100 dark:bg-zinc-900 dark:text-zinc-400 dark:ring-zinc-700">
                                      <Shield className="h-3 w-3 text-emerald-600 dark:text-emerald-300" />
                                      <span className="uppercase tracking-wide">
                                        SUP
                                      </span>
                                      <strong className="ml-1 text-zinc-800 dark:text-zinc-100">
                                        {avgSup !== null
                                          ? avgSup.toLocaleString()
                                          : '없음'}
                                      </strong>
                                    </span>
                                  </>
                                ) : (
                                  // overall + speed는 전체 평균 표시
                                  <span className="inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-[11px] font-medium text-zinc-500 shadow-sm ring-1 ring-zinc-100 dark:bg-zinc-900 dark:text-zinc-400 dark:ring-zinc-700">
                                    <Swords className="h-3 w-3 text-zinc-600 dark:text-zinc-300" />
                                    <span className="tracking-wide">
                                      평균 전투력
                                    </span>
                                    <strong className="ml-1 text-zinc-800 dark:text-zinc-100">
                                      {overallAvg !== null
                                        ? overallAvg.toLocaleString()
                                        : '없음'}
                                    </strong>
                                  </span>
                                )}
                              </div>

                              <div className="rounded-md bg-zinc-50 px-2 py-1 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                                #{step.run.runIndex} 공대
                              </div>
                            </div>
                          </div>

                          {/* Changes Section */}
                          {showStartRoster ? (
                            <StartRoster
                              raidId={step.raidId}
                              run={step.run}
                              exclusions={exclusions}
                            />
                          ) : !hasChanges ? (
                            <div className="flex items-center gap-2 rounded-xl border border-dashed border-zinc-200 p-3 text-sm text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
                              <X className="h-4 w-4" />
                              <span>캐릭터 변동 없음 (Same Members)</span>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-3">
                              {/* 1. Leaving */}
                              {hasLeaving && (
                                <div className="flex flex-col gap-2">
                                  <div className="flex items-center gap-2 text-xs font-semibold text-red-600 dark:text-red-400">
                                    <UserMinus className="h-3.5 w-3.5" />
                                    <span>퇴장 (Leaving)</span>
                                  </div>
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    {diff!.leaving.map((m) => (
                                      <CharacterBadge
                                        key={m.id}
                                        char={m}
                                        type="leave"
                                      />
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* 2. Switching */}
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
                                          <CharacterBadge
                                            char={s.from}
                                            type="switch-from"
                                          />
                                          <ArrowRight className="h-3 w-3 text-amber-400" />
                                          <CharacterBadge
                                            char={s.to}
                                            type="switch-to"
                                          />
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* 3. Entering */}
                              {hasEntering && (
                                <div className="flex flex-col gap-2">
                                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                    <UserPlus className="h-3.5 w-3.5" />
                                    <span>입장 (Entering)</span>
                                  </div>
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    {diff!.entering.map((m) => (
                                      <CharacterBadge
                                        key={m.id}
                                        char={m}
                                        type="enter"
                                      />
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
