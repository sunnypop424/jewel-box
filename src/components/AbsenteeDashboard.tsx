import React, { useMemo } from 'react';
import type { Character, RaidId } from '../types';
import type { AbsenteeActionReport } from '../raidLogic';
import { RAID_META } from '../constants';
import {
  AlertTriangle,
  Filter,
  Shield,
  Swords,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';

interface Props {
  reports: AbsenteeActionReport[];
  selectedAbsentees?: string[];
  allUserNames?: string[];
  onToggleAbsentee?: (name: string) => void;
}

function getDifficultyStyle(diff: string) {
  if (diff === 'NORMAL') {
    return {
      containerBorder: 'border-sky-200 dark:border-sky-800',
      headerClass:
        'text-sky-900 border-sky-200 bg-sky-50/50 dark:text-sky-100 dark:border-sky-800 dark:bg-sky-900/20',
      titleColor: 'text-sky-900 dark:text-sky-100',
      dotColor: 'bg-sky-500',
      btn: 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200 dark:hover:bg-sky-950/50',
    };
  }

  if (diff === 'HARD') {
    return {
      containerBorder: 'border-rose-200 dark:border-rose-800',
      headerClass:
        'text-rose-900 border-rose-200 bg-rose-50/50 dark:text-rose-100 dark:border-rose-800 dark:bg-rose-900/20',
      titleColor: 'text-rose-900 dark:text-rose-100',
      dotColor: 'bg-rose-500',
      btn: 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200 dark:hover:bg-rose-950/50',
    };
  }

  if (diff === 'STEP1' || diff === 'STEP2' || diff === 'STEP3') {
    return {
      containerBorder: 'border-orange-200 dark:border-orange-800',
      headerClass:
        'text-orange-900 border-orange-200 bg-orange-50/50 dark:text-orange-100 dark:border-orange-800 dark:bg-orange-900/20',
      titleColor: 'text-orange-900 dark:text-orange-100',
      dotColor: 'bg-orange-500',
      btn: 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-200 dark:hover:bg-orange-950/50',
    };
  }

  return {
    containerBorder: 'border-violet-200 dark:border-violet-800',
    headerClass:
      'text-violet-900 border-violet-200 bg-violet-50/50 dark:text-violet-100 dark:border-violet-800 dark:bg-violet-900/20',
    titleColor: 'text-violet-900 dark:text-violet-100',
    dotColor: 'bg-violet-500',
    btn: 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-200 dark:hover:bg-violet-950/50',
  };
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
      'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300',
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

export const AbsenteeDashboard: React.FC<Props> = ({
  reports,
  selectedAbsentees = [],
  allUserNames = [],
  onToggleAbsentee,
}) => {
  const raidIds = useMemo(() => reports.map((report) => report.raidId), [reports]);

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
                    {isSelected ? <UserX className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
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
      ) : reports.length === 0 ? (
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
          {reports.map((report) => {
            const meta = RAID_META[report.raidId];
            const style = getDifficultyStyle(meta.difficulty);

            const holdChars = [
              ...report.recommendations.flatMap((rec) => rec.heldSup),
              ...report.recommendations.flatMap((rec) => rec.heldDps),
            ].sort(sortByDisplayPriority);

            const freeChars = [...report.freeSup, ...report.freeDps].sort(sortByDisplayPriority);
            const shortageTotal = report.shortageSup + report.shortageDps;

            return (
              <div
                key={report.raidId}
                id={`absentee-raid-section-${report.raidId}`}
                className={`overflow-hidden rounded-2xl border shadow-sm dark:bg-zinc-900 ${style.containerBorder}`}
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
                        먼저 진행 가능 {freeChars.length}
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

                    <SectionBlock
                      title="먼저 진행 가능"
                      description="다른 파티에 영향이 적어 먼저 진행해도 되는 캐릭터입니다."
                      characters={freeChars}
                      tone="ready"
                      icon={<Swords size={18} />}
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
