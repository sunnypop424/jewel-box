import React, { useMemo } from 'react';
import type { Character, RaidId, RaidRun } from '../types';
import type { AbsenteeActionReport } from '../raidLogic';
import { RAID_META } from '../constants';
import { getDifficultyStyle } from '../utils/difficultyStyle';
import {
  AlertTriangle,
  Filter,
  Shield,
  Swords,
  User,
  UserX,
  Users,
} from 'lucide-react';

interface Props {
  reports: AbsenteeActionReport[];
  selectedAbsentees?: string[];
  allUserNames?: string[];
  onToggleAbsentee?: (name: string) => void;
}


function sortByDisplayPriority(a: Character, b: Character) {
  if (a.combatPower !== b.combatPower) return b.combatPower - a.combatPower;
  if (a.itemLevel !== b.itemLevel) return b.itemLevel - a.itemLevel;
  return a.discordName.localeCompare(b.discordName, 'ko');
}

function groupByUser(chars: Character[]) {
  const grouped = new Map<string, Character[]>();

  chars.forEach((char) => {
    if (!grouped.has(char.discordName)) {
      grouped.set(char.discordName, []);
    }
    grouped.get(char.discordName)!.push(char);
  });

  return Array.from(grouped.entries())
    .map(([discordName, characters]) => ({
      discordName,
      characters: [...characters].sort(sortByDisplayPriority),
    }))
    .sort((a, b) => a.discordName.localeCompare(b.discordName, 'ko'));
}

type SectionTone = 'absent' | 'hold' | 'ready';

function getSectionStyle(tone: SectionTone) {
  if (tone === 'absent') {
    return {
      wrapper:
        'border-rose-200 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/20',
      iconBox:
        'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300',
      badge:
        'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
      userCountBadge:
        'border-rose-200 bg-white text-rose-700 dark:border-rose-900 dark:bg-zinc-900 dark:text-rose-200',
    };
  }

  if (tone === 'hold') {
    return {
      wrapper:
        'border-indigo-200 bg-indigo-50/60 dark:border-indigo-900 dark:bg-indigo-950/20',
      iconBox:
        'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300',
      badge:
        'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-200',
      userCountBadge:
        'border-indigo-200 bg-white text-indigo-700 dark:border-indigo-900 dark:bg-zinc-900 dark:text-indigo-200',
    };
  }

  return {
    wrapper:
      'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20',
    iconBox:
      'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    badge:
      'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
    userCountBadge:
      'border-emerald-200 bg-white text-emerald-700 dark:border-emerald-900 dark:bg-zinc-900 dark:text-emerald-200',
  };
}

const CharacterCard: React.FC<{ char: Character; tone: SectionTone }> = ({ char, tone }) => {
  const isSupport = char.role === 'SUPPORT';
  const displayName = char.lostArkName?.trim() || char.jobCode;
  const sectionStyle = getSectionStyle(tone);

  return (
    <div className="flex items-center justify-between rounded-xl bg-white p-3 shadow-sm ring-1 ring-zinc-900/5 dark:bg-zinc-900 dark:ring-zinc-800">
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
            isSupport
              ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
              : sectionStyle.iconBox
          }`}
        >
          {isSupport ? <Shield size={17} /> : <Swords size={17} />}
        </div>

        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">
            {displayName}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            <span>{char.jobCode}</span>
          </div>
        </div>
      </div>

      <div className="ml-3 shrink-0 text-right">
        <div className="text-xs font-bold text-zinc-700 dark:text-zinc-200">Lv.{char.itemLevel}</div>
        <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
          CP {char.combatPower.toLocaleString()}
        </div>
      </div>
    </div>
  );
};

interface SectionBlockProps {
  title: string;
  description: string;
  characters: Character[];
  tone: SectionTone;
  icon: React.ReactNode;
}

const SectionBlock: React.FC<SectionBlockProps> = ({
  title,
  description,
  characters,
  tone,
  icon,
}) => {
  const groups = useMemo(() => groupByUser(characters), [characters]);
  const sectionStyle = getSectionStyle(tone);

  return (
    <section className={`flex h-full flex-col gap-4 rounded-2xl border p-4 shadow-sm ${sectionStyle.wrapper}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${sectionStyle.iconBox}`}>
            {icon}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-base font-bold text-zinc-900 dark:text-zinc-100">{title}</h4>
              <span className={`rounded-lg border px-2 py-1 text-[11px] font-bold ${sectionStyle.badge}`}>
                {characters.length}캐릭
              </span>
            </div>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
          </div>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="flex min-h-[140px] items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-white/70 px-4 text-center text-sm font-medium text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-500">
          해당 캐릭터가 없습니다.
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {groups.map((group) => (
            <div
              key={group.discordName}
              className="rounded-xl bg-white/80 p-4 shadow-sm ring-1 ring-zinc-900/5 dark:bg-zinc-950/70 dark:ring-zinc-800"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  {group.discordName}
                </div>
                <span
                  className={`shrink-0 rounded-lg border px-2 py-1 text-[11px] font-bold ${sectionStyle.userCountBadge}`}
                >
                  {group.characters.length}캐릭
                </span>
              </div>

              <div className="flex flex-col gap-2">
                {group.characters.map((char) => (
                  <CharacterCard key={char.id} char={char} tone={tone} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

// 온전한 공대의 파티 구성을 보여주는 섹션 — RaidScheduleView 디자인 기준
const FreeRunsSection: React.FC<{ freeRuns: RaidRun[]; extraFreeChars: Character[] }> = ({
  freeRuns,
  extraFreeChars,
}) => {
  const style = getSectionStyle('ready');
  const hasContent = freeRuns.length > 0 || extraFreeChars.length > 0;

  const userCharCount = useMemo(() => {
    const map = new Map<string, number>();
    freeRuns.forEach(r => r.parties.flatMap(p => p.members).forEach(m => {
      map.set(m.discordName, (map.get(m.discordName) ?? 0) + 1);
    }));
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], 'ko'));
  }, [freeRuns]);

  return (
    <section className={`flex h-full flex-col gap-4 rounded-2xl border p-4 shadow-sm ${style.wrapper}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${style.iconBox}`}>
          <Swords size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-base font-bold text-zinc-900 dark:text-zinc-100">먼저 진행 가능</h4>
          {userCharCount.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {userCharCount.map(([name, count]) => (
                <span key={name} className={`rounded-lg border px-2 py-1 text-[11px] font-bold ${style.badge}`}>
                  {name} {count}캐릭
                </span>
              ))}
            </div>
          )}
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            결석자 없이 편성된 공격대입니다. 파티 구성 그대로 진행하면 됩니다.
          </p>
        </div>
      </div>

      {!hasContent ? (
        <div className="flex min-h-[140px] items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-white/70 px-4 text-center text-sm font-medium text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-500">
          먼저 진행 가능한 공격대가 없습니다.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {freeRuns.map((run) => (
            <div key={run.runIndex} className="rounded-xl bg-white/80 shadow-sm ring-1 ring-zinc-900/5 dark:bg-zinc-950/70 dark:ring-zinc-800">
              {/* 공격대 헤더 — RaidScheduleView 동일 */}
              <div className="flex items-center gap-2 rounded-t-xl bg-zinc-50 px-3 py-2.5 dark:bg-zinc-900/60">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {run.runIndex}
                </span>
                <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">공격대</span>
                <span className="ml-auto text-xs text-zinc-400 dark:text-zinc-500">
                  평균 CP {Math.round(run.averageCombatPower).toLocaleString()}
                </span>
              </div>

              {/* 파티 그리드 — RaidScheduleView 동일 */}
              <div className="grid gap-3 p-3 lg:grid-cols-2">
                {run.parties.map((party) => {
                  const partySize = 4;
                  const emptySlots = Math.max(0, partySize - party.members.length);
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
                        <span className="text-[10px] text-zinc-400">{party.members.length}/{partySize}</span>
                      </div>

                      <div className="flex flex-col gap-2">
                        {party.members.map((m) => {
                          const isSupport = m.role === 'SUPPORT';
                          return (
                            <div
                              key={m.id}
                              className="flex items-center justify-between rounded-xl bg-white p-2.5 shadow-sm ring-1 ring-zinc-900/5 dark:bg-zinc-900 dark:ring-zinc-800"
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${isSupport ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                                  {isSupport ? <Shield size={16} /> : <Swords size={16} />}
                                </div>
                                <div>
                                  <div className="text-sm font-bold dark:text-zinc-100">{m.jobCode}</div>
                                  <div className="max-w-[80px] overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                                    {m.lostArkName || m.discordName}
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-xs font-bold dark:text-zinc-300">Lv.{m.itemLevel}</div>
                                <div className="text-[10px] text-zinc-400">CP {m.combatPower.toLocaleString()}</div>
                              </div>
                            </div>
                          );
                        })}

                        {Array.from({ length: emptySlots }).map((_, i) => (
                          <div
                            key={`empty-${run.runIndex}-${party.partyIndex}-${i}`}
                            className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-200 py-3 text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-600"
                          >
                            <User size={14} className="opacity-50" /> 빈 자리
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {extraFreeChars.length > 0 && (
            <div className="rounded-xl bg-white/80 p-4 shadow-sm ring-1 ring-zinc-900/5 dark:bg-zinc-950/70 dark:ring-zinc-800">
              <div className="mb-3 flex items-center gap-2 text-xs font-bold text-zinc-500 dark:text-zinc-400">
                <Users size={14} />
                <span>추가 합류 가능</span>
                <span className="ml-auto text-[10px] font-medium text-zinc-400">스케줄 미배정 {extraFreeChars.length}캐릭</span>
              </div>
              <div className="flex flex-col gap-2">
                {extraFreeChars.map((m) => {
                  const isSupport = m.role === 'SUPPORT';
                  return (
                    <div
                      key={m.id}
                      className="flex items-center justify-between rounded-xl bg-white p-2.5 shadow-sm ring-1 ring-zinc-900/5 dark:bg-zinc-900 dark:ring-zinc-800"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${isSupport ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                          {isSupport ? <Shield size={16} /> : <Swords size={16} />}
                        </div>
                        <div>
                          <div className="text-sm font-bold dark:text-zinc-100">{m.jobCode}</div>
                          <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                            {m.discordName} · {m.lostArkName}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold dark:text-zinc-300">Lv.{m.itemLevel}</div>
                        <div className="text-[10px] text-zinc-400">CP {m.combatPower.toLocaleString()}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

const RAID_SORT_ORDER: RaidId[] = [
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

export const AbsenteeDashboard: React.FC<Props> = ({
  reports,
  selectedAbsentees = [],
  allUserNames = [],
  onToggleAbsentee,
}) => {
  const sortedReports = useMemo(() => {
    return [...reports].sort((a, b) => {
      const indexA = RAID_SORT_ORDER.indexOf(a.raidId);
      const indexB = RAID_SORT_ORDER.indexOf(b.raidId);
      const weightA = indexA !== -1 ? indexA : 999;
      const weightB = indexB !== -1 ? indexB : 999;
      return weightA - weightB;
    });
  }, [reports]);

  const raidIds = useMemo(() => sortedReports.map((report) => report.raidId), [sortedReports]);

  const scrollToRaid = (raidId: RaidId) => {
    const el = document.getElementById(`absentee-raid-section-${raidId}`);
    if (!el) return;

    el.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  return (
    <div className="grid gap-6">
      <div className="sticky top-0 sm:top-0 z-30 flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/90">
        {allUserNames.length > 0 && onToggleAbsentee && (
          <div className="flex flex-col gap-2">
            <div className="flex items-start gap-2 text-sm font-semibold text-zinc-600 dark:text-zinc-400 sm:items-center">
              <Users className="h-4 w-4" />
              <span>결석 인원</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {allUserNames.map((name) => {
                const isSelected = selectedAbsentees.includes(name);

                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => onToggleAbsentee(name)}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all border ${
                      isSelected
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/30 dark:border-indigo-900 dark:text-indigo-200'
                        : 'bg-transparent border-zinc-200 text-zinc-400 decoration-zinc-400 line-through dark:border-zinc-800 dark:text-zinc-600'
                    }`}
                  >
                    {isSelected ? <UserX className="h-3 w-3" /> : <User className="h-3 w-3" />}
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {allUserNames.length > 0 && onToggleAbsentee && raidIds.length > 0 && (
          <div className="h-px w-full bg-zinc-100 dark:bg-zinc-800" />
        )}

        {raidIds.length > 0 && (
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
        )}
      </div>

      {selectedAbsentees.length === 0 ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-zinc-200 bg-white/50 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="mb-4 rounded-full bg-zinc-100 p-4 dark:bg-zinc-800">
            <UserX size={32} className="text-zinc-400" />
          </div>
          <p className="text-lg font-medium text-zinc-600 dark:text-zinc-300">
            결석 인원을 선택해 주세요.
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            선택된 인원을 기준으로 레이드별 결석 캐릭터, 대기 권장, 먼저 진행 가능 대상을 보여줍니다.
          </p>
        </div>
      ) : sortedReports.length === 0 ? (
        <div className="flex min-h-[280px] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-zinc-200 bg-white/50 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="text-lg font-bold text-zinc-700 dark:text-zinc-200">
            조정이 필요한 레이드가 없습니다.
          </div>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            선택한 결석 인원 기준으로 대기 권장이나 선행 진행 조정이 필요한 레이드가 없었습니다.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {sortedReports.map((report) => {
            const meta = RAID_META[report.raidId];
            const style = getDifficultyStyle(meta.difficulty);

            const holdChars = [
              ...report.recommendations.flatMap((rec) => rec.heldSup),
              ...report.recommendations.flatMap((rec) => rec.heldDps),
            ].sort(sortByDisplayPriority);

            const shortageTotal = report.shortageSup + report.shortageDps;
            const freeTotal = report.freeRuns.reduce((acc, r) => acc + r.parties.flatMap(p => p.members).length, 0)
              + report.extraFreeChars.length;

            return (
              <div
                key={report.raidId}
                id={`absentee-raid-section-${report.raidId}`}
                className={`scroll-mt-44 overflow-hidden rounded-2xl border shadow-sm dark:bg-zinc-900 ${style.containerBorder}`}
              >
                <div
                  className={`flex flex-col gap-3 border-b px-4 py-4 sm:px-5 ${style.headerClass}`}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className={`h-3 w-3 shrink-0 rounded-full shadow-sm ring-2 ring-white/50 ${style.dotColor}`} />
                      <h3 className={`truncate text-base font-bold ${style.titleColor}`}>{meta.label}</h3>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 shadow-sm dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
                        결석 캐릭터 {report.absentChars.length}
                      </span>
                      <span className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700 shadow-sm dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-200">
                        대기 권장 {holdChars.length}
                      </span>
                      <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                        먼저 진행 가능 {freeTotal}
                      </span>
                      {shortageTotal > 0 && (
                        <span className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 shadow-sm dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                          외부 구인 {shortageTotal}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-6 bg-white p-4 dark:bg-zinc-900 sm:p-6">
                  <div className="grid gap-4 xl:grid-cols-3">
                    <SectionBlock
                      title="결석 캐릭터"
                      description="이번 계산 기준에서 해당 레이드에 참여하지 않는 캐릭터입니다."
                      characters={report.absentChars}
                      tone="absent"
                      icon={<UserX size={18} />}
                    />

                    <SectionBlock
                      title="대기 권장"
                      description="결석 보충을 위해 현재 레이드 출발을 잠시 보류하는 편이 좋은 캐릭터입니다."
                      characters={holdChars}
                      tone="hold"
                      icon={<Users size={18} />}
                    />

                    <FreeRunsSection
                      freeRuns={report.freeRuns}
                      extraFreeChars={report.extraFreeChars}
                    />
                  </div>

                  {shortageTotal > 0 && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/20">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300">
                          <AlertTriangle size={18} />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-amber-700 dark:text-amber-300">
                            외부 구인이 필요합니다.
                          </div>
                          <div className="mt-1 text-sm text-amber-700/90 dark:text-amber-200/90">
                            {report.shortageSup > 0 && <span>서포터 {report.shortageSup}명 </span>}
                            {report.shortageDps > 0 && <span>딜러 {report.shortageDps}명</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
