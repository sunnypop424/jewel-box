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
  Split,
  GripVertical,
  UserCheck,
  UserX,
  ArrowLeftRight,
  User,
} from 'lucide-react';
import { excludeCharactersOnRaid } from '../api/firebaseApi';

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { SwapModal } from './SwapModal';
import { toast } from 'sonner';
import { useConfirm } from '../hooks/useConfirm';

type BalanceMode = 'overall' | 'role' | 'speed';

// ----------------------------------------------------------------------
// [LOGIC ZONE]
// ----------------------------------------------------------------------

const INITIAL_RAID_ORDER: RaidId[] = [
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

const DIFF_LABEL = {
  NORMAL: '노말',
  HARD: '하드',
  NIGHTMARE: '나이트메어',
  STEP1: '1단계',
  STEP2: '2단계',
  STEP3: '3단계',
} as const;

function getDifficultyStyle(diff: string) {
  if (diff === 'NORMAL') {
    return {
      btn: 'bg-sky-50 border-sky-200 text-sky-700 dark:bg-sky-950/30 dark:border-sky-900 dark:text-sky-200 shadow-sm',
      dot: 'bg-sky-500',
      borderActive: 'border-sky-500',
      badge: 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300',
    };
  }
  if (diff === 'HARD') {
    return {
      btn: 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/30 dark:border-rose-900 dark:text-rose-200 shadow-sm',
      dot: 'bg-rose-500',
      borderActive: 'border-rose-500',
      badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300',
    };
  }
  if (diff === 'STEP1' || diff === 'STEP2' || diff === 'STEP3') {
    return {
      btn: 'bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-950/30 dark:border-orange-900 dark:text-orange-200 shadow-sm',
      dot: 'bg-orange-500',
      borderActive: 'border-orange-500',
      badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
    };
  }
  return {
    btn: 'bg-violet-50 border-violet-200 text-violet-700 dark:bg-violet-950/30 dark:border-violet-900 dark:text-violet-200 shadow-sm',
    dot: 'bg-violet-500',
    borderActive: 'border-violet-500',
    badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300',
  };
}

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

// ----------------------------------------------------------------------
// [HELPER FOR CONCURRENCY]
// ----------------------------------------------------------------------

function areParticipantsDisjoint(groupA: string[], groupB: string[]): boolean {
  const setA = new Set(groupA);
  for (const p of groupB) {
    if (setA.has(p)) return false;
  }
  return true;
}

// ----------------------------------------------------------------------
// [SEQUENCE BUILDING LOGIC]
// ----------------------------------------------------------------------

interface OrderedRun {
  raidId: RaidId;
  run: RaidRun;
}

function orderRunsInsideParticipantGroup(
  group: ParticipantGroup,
  currentOrder: RaidId[],
): OrderedRun[] {
  return [...group.runs].sort((a, b) => {
    const idxA = currentOrder.indexOf(a.raidId);
    const idxB = currentOrder.indexOf(b.raidId);
    if (idxA === idxB) {
      return a.run.runIndex - b.run.runIndex;
    }
    return idxA - idxB;
  });
}

function buildSequence(
  schedule: RaidSchedule,
  order: RaidId[],
): {
  groups: { size: number; participants: string[]; steps: GlobalStep[] }[];
} {
  const flat: { raidId: RaidId; run: RaidRun }[] = [];

  order.forEach((raidId) => {
    const runs = schedule[raidId] || [];
    runs.forEach((run) => flat.push({ raidId, run }));
  });

  if (flat.length === 0) return { groups: [] };

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

    const minIndexA = Math.min(...a.runs.map((r) => order.indexOf(r.raidId)));
    const minIndexB = Math.min(...b.runs.map((r) => order.indexOf(r.raidId)));

    if (minIndexA !== minIndexB) return minIndexA - minIndexB;
    return a.participants.join(',').localeCompare(b.participants.join(','));
  });

  const resultGroups: {
    size: number;
    participants: string[];
    steps: GlobalStep[];
  }[] = [];

  let globalIndex = 1;

  participantGroups.forEach((group) => {
    const orderedRuns = orderRunsInsideParticipantGroup(group, order);
    const stepsForGroup: GlobalStep[] = orderedRuns.map(({ raidId, run }) => {
      const step: GlobalStep = { index: globalIndex++, raidId, run };
      return step;
    });

    resultGroups.push({
      size: group.size,
      participants: group.participants,
      steps: stepsForGroup,
    });
  });

  return { groups: resultGroups };
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

  if (char.isGuest) {
    bgClass = 'bg-amber-50 dark:bg-amber-950/40';
    textClass = 'text-amber-700 dark:text-amber-400 font-bold';
    borderClass = 'border-amber-100 dark:border-amber-900/50';
  } else {
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
        borderClass =
          'border-amber-200 dark:border-amber-900/50 ring-1 ring-amber-300/50 dark:ring-amber-700/50';
        break;
      default:
        bgClass = 'bg-zinc-50 dark:bg-zinc-900';
        textClass = 'text-zinc-700 dark:text-zinc-300';
        borderClass = 'border-zinc-200 dark:border-zinc-800';
    }
  }

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-all ${bgClass} ${borderClass}`}
    >
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

interface StartRosterProps {
  raidId: RaidId;
  run: RaidRun;
  exclusions?: RaidExclusionMap;
  onSwapClick?: (char: Character) => void;
  canSwap?: boolean;
  swapDisabled?: boolean;
}

function StartRoster({
  raidId,
  run,
  exclusions,
  onSwapClick,
  canSwap,
  swapDisabled = false,
}: StartRosterProps) {
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
                    className="flex h-12 items-center justify-between rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-zinc-900/5 dark:bg-zinc-900 dark:ring-zinc-800"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                          m.isGuest
                            ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                            : m.role === 'SUPPORT'
                              ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                              : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                        }`}
                      >
                        {m.role === 'SUPPORT' ? <Shield size={16} /> : <Swords size={16} />}
                      </div>

                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold dark:text-zinc-100">{m.jobCode}</span>
                        </div>
                        <div className="max-w-[80px] overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                          {m.isGuest ? '임시 게스트' : m.lostArkName}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {!m.isGuest && (
                        <div className="text-right">
                          <div className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                            Lv.{m.itemLevel}
                          </div>
                          <div className="text-[10px] text-zinc-400">
                            CP {m.combatPower.toLocaleString()}
                          </div>
                        </div>
                      )}

                      {!m.isGuest && canSwap && onSwapClick && (
                        <button
                          disabled={swapDisabled}
                          onClick={() => {
                            if (swapDisabled) return;
                            onSwapClick(m);
                          }}
                          className="inline-flex items-center gap-1 rounded bg-white px-2 py-1 text-xs font-bold text-zinc-600 shadow-sm ring-1 ring-zinc-200 hover:bg-amber-50 hover:text-amber-700 hover:ring-amber-200 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-700 dark:hover:bg-amber-900/30 dark:hover:text-amber-300 dark:hover:ring-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
                          title="다른 캐릭터로 변경"
                        >
                          <ArrowLeftRight size={12} />
                          변경
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {Array.from({ length: emptySlots }).map((_, i) => (
                  <div
                    key={`empty-${run.runIndex}-${party.partyIndex}-${i}`}
                    className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-200 py-3 text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-600"
                  >
                    <User size={14} className="min-h-[30.5px] opacity-50" />
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

function SortableFilterItem({
  raidId,
  isActive,
  onToggle,
}: {
  raidId: RaidId;
  isActive: boolean;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: raidId });

  const meta = RAID_META[raidId];
  const diff = meta.difficulty;
  const diffStyle = getDifficultyStyle(diff);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 999 : 'auto',
    opacity: isDragging ? 0.5 : 1,
  };

  let btnClass =
    'flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition-all border select-none ';
  if (isActive) {
    btnClass += diffStyle.btn;
  } else {
    btnClass +=
      'bg-transparent border-zinc-200 text-zinc-400 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800';
  }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center">
      <button
        type="button"
        onClick={onToggle}
        className={`${btnClass} group relative pr-7 touch-none`}
      >
        <div className={`h-2 w-2 rounded-full ${diffStyle.dot}`} />
        {meta.label}

        <div
          {...attributes}
          {...listeners}
          className="absolute right-1 top-1/2 -translate-y-1/2 cursor-grab p-1 text-zinc-400 hover:text-zinc-600 active:cursor-grabbing dark:text-zinc-600 dark:hover:text-zinc-400"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-3 w-3" />
        </div>
      </button>
    </div>
  );
}

// ----------------------------------------------------------------------
// [MAIN VIEW COMPONENT]
// ----------------------------------------------------------------------

interface Props {
  schedule: RaidSchedule | null;
  exclusions?: RaidExclusionMap;
  balanceMode?: BalanceMode;
  updatedBy?: string;
  onExclusionsUpdated?: (next: RaidExclusionMap) => void;
  onSwapCharacter?: (
    raidId: RaidId,
    charId1: string,
    charId2: string,
  ) => void | Promise<void>;
  allCharacters?: Character[];
  isSwapping?: boolean;
  allUserNames?: string[];
  inactiveUsers?: Set<string>;
  onToggleUser?: (name: string) => void;
}

export const RaidSequenceView: React.FC<Props> = ({
  schedule,
  exclusions,
  balanceMode = 'overall',
  onExclusionsUpdated,
  onSwapCharacter,
  allCharacters = [],
  isSwapping: isSwappingFromParent = false,
  allUserNames = [],
  inactiveUsers = new Set(),
  onToggleUser,
}) => {
  const { confirm, ConfirmModal } = useConfirm();

  const SHOW_SERKA_FILTER = true;

  const [raidOrder, setRaidOrder] = useState<RaidId[]>(INITIAL_RAID_ORDER);

  const [selectedRaids, setSelectedRaids] = useState<Set<RaidId>>(
    () =>
      new Set(
        INITIAL_RAID_ORDER.filter((id) => SHOW_SERKA_FILTER || !id.startsWith('SERKA_')),
      ),
  );

  const [swapTarget, setSwapTarget] = useState<{ raidId: RaidId; char: Character } | null>(null);
  const [isSwappingLocal, setIsSwappingLocal] = useState(false);

  const isSwapping = isSwappingFromParent || isSwappingLocal;

  const [localExclusions, setLocalExclusions] = useState<RaidExclusionMap>(exclusions ?? {});
  useEffect(() => {
    setLocalExclusions(exclusions ?? {});
  }, [exclusions]);

  const [completingKey, setCompletingKey] = useState<string | null>(null);

  const isBlocking = completingKey !== null || isSwapping;
  const swapDisabled = isBlocking;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    if (active.id !== over.id) {
      setRaidOrder((items) => {
        const oldIndex = items.indexOf(active.id as RaidId);
        const newIndex = items.indexOf(over.id as RaidId);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const filteredSchedule = useMemo(() => {
    if (!schedule) return null;

    const fs: RaidSchedule = {
      ACT2_HARD: [],
      ACT3_HARD: [],
      ACT4_NORMAL: [],
      ACT4_HARD: [],
      SERKA_NORMAL: [],
      SERKA_HARD: [],
      SERKA_NIGHTMARE: [],
      FINAL_NORMAL: [],
      FINAL_HARD: [],
      HORIZON_STEP1: [],
      HORIZON_STEP2: [],
      HORIZON_STEP3: [],
      ACT1_HARD: [],
      ACT2_NORMAL: [],
      ACT3_NORMAL: [],
    };

    selectedRaids.forEach((raidId) => {
      const runs = schedule[raidId];
      if (runs && runs.length > 0) {
        fs[raidId] = runs;
      }
    });

    return fs;
  }, [schedule, selectedRaids]);

  const { groups } = useMemo(() => {
    if (!filteredSchedule) return { groups: [] };
    return buildSequence(filteredSchedule, raidOrder);
  }, [filteredSchedule, raidOrder]);

  const bundledGroups = useMemo(() => {
    const bundles: Array<typeof groups> = [];
    let i = 0;

    while (i < groups.length) {
      const current = groups[i];
      const next = groups[i + 1];

      if (next && areParticipantsDisjoint(current.participants, next.participants)) {
        bundles.push([current, next]);
        i += 2;
      } else {
        bundles.push([current]);
        i += 1;
      }
    }

    return bundles;
  }, [groups]);

  if (!schedule) return null;

  const toggleRaid = (id: RaidId) => {
    const next = new Set(selectedRaids);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedRaids(next);
  };

  const flatSteps: GlobalStep[] = groups.flatMap((g) => g.steps);
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

  const renderStep = (step: GlobalStep, group: (typeof groups)[0], hideTimeline = false) => {
    const currentFlatIdx = flatSteps.indexOf(step);
    const transition = diffs[currentFlatIdx];

    const isFirst = currentFlatIdx === 0;
    const isGroupFirst = step === group.steps[0];

    const meta = RAID_META[step.raidId];
    const difficulty = meta.difficulty;
    const diffStyle = getDifficultyStyle(difficulty);

    let titleClass = '';
    let labelClass = '';

    if (difficulty === 'NORMAL') {
      titleClass = 'text-sky-600 dark:text-sky-400';
      labelClass = 'text-sky-800/60 dark:text-sky-300/60';
    } else if (difficulty === 'HARD') {
      titleClass = 'text-rose-600 dark:text-rose-400';
      labelClass = 'text-rose-800/60 dark:text-rose-300/60';
    } else if (difficulty === 'STEP1' || difficulty === 'STEP2' || difficulty === 'STEP3') {
      titleClass = 'text-orange-600 dark:text-orange-400';
      labelClass = 'text-orange-800/60 dark:text-orange-300/60';
    } else {
      titleClass = 'text-violet-600 dark:text-violet-400';
      labelClass = 'text-violet-800/60 dark:text-violet-300/60';
    }

    const hasLeaving = !!(transition && transition.leaving.length > 0);
    const hasEntering = !!(transition && transition.entering.length > 0);
    const hasSwitching = !!(transition && transition.switching.length > 0);
    const hasChanges = hasLeaving || hasEntering || hasSwitching;

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

    const currentVisibleMembers = getVisibleMembers(step.raidId, step.run, localExclusions);

    const currentKey = Array.from(new Set(currentVisibleMembers.map((m) => m.discordName)))
      .sort()
      .join('|');

    const showStartRoster = isGroupFirst && (isFirst || prevKey !== currentKey);

    const completeTargetIds = Array.from(
      new Set(currentVisibleMembers.map((m) => String(m.id ?? '').trim()).filter(Boolean)),
    );

    const completeBtnKey = `${step.raidId}-${step.run.runIndex}`;
    const isCompleting = completingKey === completeBtnKey;

    const realMembers = currentVisibleMembers.filter((m) => !m.isGuest);
    const dpsMembers = realMembers.filter((m) => resolveRole(m) === 'DPS');
    const supMembers = realMembers.filter((m) => resolveRole(m) === 'SUPPORT');

    const avgDps =
      dpsMembers.length > 0
        ? Math.round(dpsMembers.reduce((sum, m) => sum + m.combatPower, 0) / dpsMembers.length)
        : null;

    const avgSup =
      supMembers.length > 0
        ? Math.round(supMembers.reduce((sum, m) => sum + m.combatPower, 0) / supMembers.length)
        : null;

    const overallAvg =
      currentVisibleMembers.length > 0
        ? Math.round(
            currentVisibleMembers.reduce((sum, m) => sum + m.combatPower, 0) /
              currentVisibleMembers.length,
          )
        : null;

    const renderCharacterWithSwap = (char: Character, raidId: RaidId) => (
      <div key={char.id} className="group relative flex items-center gap-2">
        <CharacterBadge char={char} type="neutral" />
        {!char.isGuest && onSwapCharacter && (
          <button
            disabled={swapDisabled}
            onClick={() => {
              if (swapDisabled) {
                toast.error(
                  completingKey ? '레이드 완료 처리 중입니다.' : '캐릭터 변경 반영 중입니다.',
                );
                return;
              }
              setSwapTarget({ raidId, char });
            }}
            className="inline-flex items-center gap-1 rounded bg-white px-2 py-1 text-xs font-bold text-zinc-600 shadow-sm ring-1 ring-zinc-200 hover:bg-amber-50 hover:text-amber-700 hover:ring-amber-200 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-700 dark:hover:bg-amber-900/30 dark:hover:text-amber-300 dark:hover:ring-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
            title="다른 캐릭터로 변경"
          >
            <ArrowLeftRight size={12} />
            변경
          </button>
        )}
      </div>
    );

    if (hideTimeline) {
      return (
        <div key={`${step.raidId}-${step.run.runIndex}`} className="relative">
          <div className="min-w-0 flex-1 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/50">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-100 text-sm font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {step.index}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className={`font-bold ${titleClass}`}>{meta.label}</h4>
                    <span
                      className={`text-[10px] font-extrabold uppercase tracking-wider ${labelClass}`}
                    >
                      {DIFF_LABEL[difficulty] ?? difficulty}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
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
                      <span className="whitespace-nowrap tracking-wide">평균 전투력</span>
                      <strong className="ml-1 text-zinc-800 dark:text-zinc-100">
                        {overallAvg !== null ? overallAvg.toLocaleString() : '없음'}
                      </strong>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="shrink-0 whitespace-nowrap rounded-md bg-zinc-50 px-2 py-1 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                    #{step.run.runIndex} 공격대
                  </div>

                  <button
                    type="button"
                    disabled={completeTargetIds.length === 0 || isCompleting || isSwapping}
                    onClick={async () => {
                      if (isSwapping) {
                        toast.error('캐릭터 변경 반영 중입니다. 잠시 후 다시 시도해주세요.');
                        return;
                      }

                      const ok = await confirm(
                        `${meta.label} #${step.run.runIndex} 공격대를 완료 처리할까요?\n이 공격대의 멤버들이 이 레이드에서 제외됩니다.`,
                      );
                      if (!ok) return;

                      try {
                        setCompletingKey(completeBtnKey);

                        const next = await excludeCharactersOnRaid(
                          step.raidId,
                          completeTargetIds,
                        );

                        setLocalExclusions(next);
                        onExclusionsUpdated?.(next);
                      } catch (e) {
                        console.error(e);
                        toast.error('레이드 완료 처리 실패');
                      } finally {
                        setCompletingKey(null);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-emerald-200 px-2.5 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900/50 dark:text-emerald-200 dark:hover:bg-emerald-950/40 disabled:cursor-not-allowed disabled:opacity-40"
                    title="레이드 완료"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    레이드 완료
                  </button>
                </div>
              </div>
            </div>

            {showStartRoster ? (
              <StartRoster
                raidId={step.raidId}
                run={step.run}
                exclusions={localExclusions}
                onSwapClick={(char) => setSwapTarget({ raidId: step.raidId, char })}
                canSwap={!!onSwapCharacter && !swapDisabled}
                swapDisabled={swapDisabled}
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
                      {transition!.leaving.map((m) => renderCharacterWithSwap(m, step.raidId))}
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
                      {transition!.switching.map((s) => (
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
                              {renderCharacterWithSwap(s.to, step.raidId)}
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
                      {transition!.entering.map((m) => renderCharacterWithSwap(m, step.raidId))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div key={`${step.raidId}-${step.run.runIndex}`} className="relative flex gap-6">
        <div className="relative z-10 mt-1.5 flex h-3 w-3 shrink-0 items-center justify-center -translate-x-[2px]">
          <div
            className={`h-3 w-3 rounded-full border-2 bg-white dark:bg-zinc-950 ${diffStyle.borderActive}`}
          />
        </div>

        <div className="min-w-0 flex-1 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-100 text-sm font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {step.index}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className={`font-bold ${titleClass}`}>{meta.label}</h4>
                  <span
                    className={`text-[10px] font-extrabold uppercase tracking-wider ${labelClass}`}
                  >
                    {DIFF_LABEL[difficulty] ?? difficulty}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
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
                    <span className="whitespace-nowrap tracking-wide">평균 전투력</span>
                    <strong className="ml-1 text-zinc-800 dark:text-zinc-100">
                      {overallAvg !== null ? overallAvg.toLocaleString() : '없음'}
                    </strong>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="shrink-0 whitespace-nowrap rounded-md bg-zinc-50 px-2 py-1 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  #{step.run.runIndex} 공격대
                </div>

                <button
                  type="button"
                  disabled={completeTargetIds.length === 0 || isCompleting || isSwapping}
                  onClick={async () => {
                    if (isSwapping) {
                      toast.error('캐릭터 변경 반영 중입니다. 잠시 후 다시 시도해주세요.');
                      return;
                    }

                    const ok = await confirm(
                      `${meta.label} #${step.run.runIndex} 공격대를 완료 처리할까요?\n이 공격대의 멤버들이 이 레이드에서 제외됩니다.`,
                    );
                    if (!ok) return;

                    try {
                      setCompletingKey(completeBtnKey);
                      const next = await excludeCharactersOnRaid(step.raidId, completeTargetIds);

                      setLocalExclusions(next);
                      onExclusionsUpdated?.(next);
                    } catch (e) {
                      console.error(e);
                      toast.error('레이드 완료 처리 실패');
                    } finally {
                      setCompletingKey(null);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-emerald-200 px-2.5 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900/50 dark:text-emerald-200 dark:hover:bg-emerald-950/40 disabled:cursor-not-allowed disabled:opacity-40"
                  title="레이드 완료"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  레이드 완료
                </button>
              </div>
            </div>
          </div>

          {showStartRoster ? (
            <StartRoster
              raidId={step.raidId}
              run={step.run}
              exclusions={localExclusions}
              onSwapClick={(char) => setSwapTarget({ raidId: step.raidId, char })}
              canSwap={!!onSwapCharacter && !swapDisabled}
              swapDisabled={swapDisabled}
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
                    {transition!.leaving.map((m) => renderCharacterWithSwap(m, step.raidId))}
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
                    {transition!.switching.map((s) => (
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
                            {renderCharacterWithSwap(s.to, step.raidId)}
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
                    {transition!.entering.map((m) => renderCharacterWithSwap(m, step.raidId))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const visibleRaidIds = raidOrder.filter((id) => SHOW_SERKA_FILTER || !id.startsWith('SERKA_'));

  return (
    <div className="relative mx-auto w-full space-y-4">
      <div className="sticky top-0 z-30 flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/90 sm:top-0">
        {allUserNames.length > 0 && onToggleUser && (
          <div className="flex flex-col gap-2">
            <div className="flex items-start gap-2 text-sm font-semibold text-zinc-600 dark:text-zinc-400 sm:items-center">
              <Users className="h-4 w-4" />
              <span>참여 인원 (토글 시 전체 레이드 배정에서 제외 후 재배정)</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {allUserNames.map((name) => {
                const isInactive = inactiveUsers.has(name);
                const isSelected = !isInactive;

                return (
                  <button
                    key={name}
                    onClick={() => onToggleUser(name)}
                    className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold transition-all ${
                      isSelected
                        ? 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-200'
                        : 'border-zinc-200 bg-transparent text-zinc-400 decoration-zinc-400 line-through dark:border-zinc-800 dark:text-zinc-600'
                    }`}
                  >
                    {isSelected ? (
                      <UserCheck className="h-3 w-3" />
                    ) : (
                      <UserX className="h-3 w-3" />
                    )}
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="h-px w-full bg-zinc-100 dark:bg-zinc-800" />

        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-600 dark:text-zinc-400">
              <Filter className="h-4 w-4" />
              <span>오늘 진행할 레이드 (드래그하여 순서 변경)</span>
            </div>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={visibleRaidIds} strategy={horizontalListSortingStrategy}>
              <div className="flex flex-wrap gap-2">
                {visibleRaidIds.map((raidId) => (
                  <SortableFilterItem
                    key={raidId}
                    raidId={raidId}
                    isActive={selectedRaids.has(raidId)}
                    onToggle={() => toggleRaid(raidId)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </div>

      {isBlocking && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="rounded-2xl bg-white px-5 py-4 text-sm font-bold text-zinc-900 shadow-lg dark:bg-zinc-900 dark:text-zinc-100">
            {completingKey !== null ? '레이드 완료 처리 중...' : '캐릭터 변경 반영 중...'}
          </div>
        </div>
      )}

      {flatSteps.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
          <Filter className="mb-2 h-8 w-8 opacity-20" />
          <p>선택된 레이드가 없거나, 참여 가능한 인원이 없습니다.</p>
        </div>
      )}

      {flatSteps.length > 0 && (
        <>
          {/* Mobile: timeline 제거하고 카드형 세로 나열 */}
          <div className="space-y-6 md:hidden">
            {bundledGroups.map((bundle, bundleIdx) => (
              <div key={`mobile-bundle-${bundleIdx}`} className="space-y-5">
                {bundle.map((group, gIdx) => {
                  const isConcurrent = bundle.length > 1;

                  return (
                    <div
                      key={`mobile-group-${bundleIdx}-${gIdx}`}
                      className="space-y-3"
                    >
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                            {isConcurrent
                              ? `동시진행 그룹 ${String.fromCharCode(65 + gIdx)}`
                              : `그룹 ${bundleIdx + 1}`}
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {group.participants
                              .slice()
                              .sort()
                              .map((name) => (
                                <span
                                  key={name}
                                  className="inline-block rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                                >
                                  {name}
                                </span>
                              ))}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        {group.steps.map((step) => renderStep(step, group, true))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Desktop: 기존 timeline 유지 */}
          <div className="relative hidden md:block">
            {flatSteps.length > 0 && (
              <div className="absolute bottom-0 left-[19px] top-4 w-0.5 bg-zinc-200 dark:bg-zinc-800" />
            )}

            <div className="space-y-16">
              {bundledGroups.map((bundle, bundleIdx) => {
                const isConcurrent = bundle.length > 1;

                return (
                  <div key={`bundle-${bundleIdx}`} className="relative">
                    {!isConcurrent && (
                      <div className="absolute bottom-[-32px] left-[19px] top-8 w-0.5 bg-zinc-200 dark:bg-zinc-800" />
                    )}

                    <div
                      className={`relative mb-8 flex items-start gap-4 ${
                        isConcurrent ? 'flex-col xl:flex-row xl:items-center' : 'items-center'
                      }`}
                    >
                      <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:bg-indigo-500 dark:shadow-none">
                        {isConcurrent ? <Split className="h-5 w-5" /> : <Users className="h-5 w-5" />}
                      </div>

                      <div
                        className={`flex flex-1 flex-col gap-4 ${
                          isConcurrent ? 'w-full xl:flex-row xl:gap-12' : ''
                        }`}
                      >
                        {bundle.map((group, gIdx) => (
                          <div key={gIdx} className="flex-1">
                            {isConcurrent && (
                              <div className="mb-2 text-xs font-bold uppercase text-zinc-400">
                                GROUP {String.fromCharCode(65 + gIdx)}
                              </div>
                            )}
                            <div className="flex flex-wrap gap-1.5">
                              {group.participants
                                .slice()
                                .sort()
                                .map((name) => (
                                  <span
                                    key={name}
                                    className="inline-block rounded bg-zinc-100 px-2 py-0.5 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                                  >
                                    {name}
                                  </span>
                                ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pl-4">
                      <div
                        className={`grid gap-x-12 gap-y-8 ${
                          isConcurrent ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'
                        }`}
                      >
                        <div className="space-y-8">
                          {bundle[0].steps.map((step) => renderStep(step, bundle[0]))}
                        </div>

                        {bundle[1] && (
                          <div className="relative">
                            <div className="absolute bottom-0 left-[3px] top-4 hidden w-0.5 bg-zinc-200 dark:bg-zinc-800 xl:block" />
                            <div className="space-y-8">
                              {bundle[1].steps.map((step) =>
                                renderStep(step, bundle[1], false),
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

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

            if (completingKey !== null) {
              toast.error('레이드 완료 처리 중입니다. 잠시 후 다시 시도해주세요.');
              return;
            }

            try {
              setIsSwappingLocal(true);
              await onSwapCharacter(swapTarget.raidId, swapTarget.char.id, targetCharId);
              setSwapTarget(null);
            } catch (e) {
              console.error(e);
              toast.error('캐릭터 교체 실패');
            } finally {
              setIsSwappingLocal(false);
            }
          }}
        />
      )}

      <ConfirmModal />
    </div>
  );
};