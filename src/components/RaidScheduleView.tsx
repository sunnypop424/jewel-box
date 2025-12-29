import React, { useState } from 'react';
import type { RaidSchedule, RaidRun, RaidId, RaidExclusionMap, RaidSettingsMap } from '../types';
import { RAID_META } from '../constants';
import { Shield, Swords, Users, User, ChevronDown, X } from 'lucide-react';

// 모드 타입(문자열) – App / raidLogic과 동일한 리터럴 사용
type BalanceMode = 'overall' | 'role' | 'speed';

interface Props {
  schedule: RaidSchedule | null;
  isLoading?: boolean;
  exclusions?: RaidExclusionMap;
  onExcludeCharacter?: (raidId: RaidId, characterId: string) => void;
  balanceMode?: BalanceMode;

  /** ✅ 레이드별 랏폿(서폿 부족) 설정 */
  raidSettings?: RaidSettingsMap;
  isRaidSettingsLoading?: boolean;
  onToggleSupportShortage?: (raidId: RaidId, next: boolean) => void;
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
}) => {
  const [raidOpenState, setRaidOpenState] = useState<Record<string, boolean>>(
    {},
  );
  const [runOpenState, setRunOpenState] = useState<Record<string, boolean>>({});

  const toggleRaid = (raidId: string) => {
    setRaidOpenState((prev) => ({
      ...prev,
      [raidId]: !(prev[raidId] ?? true),
    }));
  };

  const toggleRun = (raidId: string, runIndex: number) => {
    const key = `${raidId}-${runIndex}`;
    setRunOpenState((prev) => ({
      ...prev,
      [key]: !(prev[key] ?? true),
    }));
  };

  // 로딩 스켈레톤
  if (isLoading) {
    return (
      <div className="grid gap-6">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
                <div>
                  <div className="mb-2 h-4 w-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                  <div className="h-3 w-32 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                </div>
              </div>
            </div>
            <div className="space-y-4 p-5">
              <div className="h-12 w-full animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
              <div className="h-12 w-full animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!schedule) return null;

  // 레벨대 순 정렬 (요청한 순서)
  const RAID_ORDER: (keyof RaidSchedule)[] = [
    'ACT3_HARD',      // 1700
    'ACT4_NORMAL',    // 1700
    'FINAL_NORMAL',   // 1710
    'SERKA_NORMAL',   // 1710
    'ACT4_HARD',      // 1720
    'FINAL_HARD',     // 1730
    'SERKA_HARD',     // 1730
    'SERKA_NIGHTMARE' // 1740
  ];

  const raidIds = RAID_ORDER.filter((raidId) => (schedule[raidId]?.length ?? 0) > 0);

  return (
    <div className="grid gap-6">
      {raidIds.map((raidId) => {
        const runs = schedule[raidId];
        if (!runs || runs.length === 0) return null;

        const meta = RAID_META[raidId];
        const DIFF_LABEL: Record<string, string> = {
          NORMAL: '노말',
          HARD: '하드',
          NIGHTMARE: '나이트메어',
        };

        const diff = meta.difficulty;
        const diffStyle =
          diff === 'NORMAL'
            ? {
              borderColor: 'border-sky-200 dark:border-sky-900/50',
              headerBg: 'bg-sky-50 dark:bg-sky-950/30',
              badge: 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300',
              dot: 'bg-sky-500', // ✅ 추가
            }
            : diff === 'HARD'
              ? {
                borderColor: 'border-rose-200 dark:border-rose-900/50',
                headerBg: 'bg-rose-50 dark:bg-rose-950/30',
                badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300',
                dot: 'bg-rose-500', // ✅ 추가
              }
              : {
                borderColor: 'border-violet-200 dark:border-violet-900/50',
                headerBg: 'bg-violet-50 dark:bg-violet-950/30',
                badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300',
                dot: 'bg-violet-500', // ✅ 추가
              };

        const borderColor = diffStyle.borderColor;
        const headerBg = diffStyle.headerBg;

        const titleColor =
          diff === 'NORMAL'
            ? 'text-sky-900 dark:text-sky-100'
            : diff === 'HARD'
              ? 'text-rose-900 dark:text-rose-100'
              : 'text-violet-900 dark:text-violet-100';

        const isRaidOpen = raidOpenState[raidId] ?? true;
        const excludedIdsForRaid = exclusions?.[raidId] ?? [];

        return (
          <div
            key={raidId}
            className={`overflow-hidden rounded-3xl border bg-white shadow-sm dark:bg-zinc-900 ${borderColor}`}
          >
            {/* 레이드 헤더 */}
            <button
              type="button"
              onClick={() => toggleRaid(raidId as string)}
              className={`flex w-full items-center justify-between border-b px-5 py-4 text-left transition-colors hover:bg-white/70 dark:hover:bg-zinc-800/70 ${headerBg} ${borderColor} bg-opacity-50`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`h-3 w-3 rounded-full shadow-sm ring-2 ring-white/50 ${diffStyle.dot}`}
                />
                <div>
                  <h4 className={`text-base font-bold ${titleColor}`}>
                    {meta.label}
                  </h4>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${diffStyle.badge}`}
                    >
                      {DIFF_LABEL[diff] ?? diff}
                    </span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      총 {runs.length}개 공대
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                {/* ✅ 랏폿 체크박스 (레이드명 옆) */}
                {onToggleSupportShortage && (
                  <div
                    className="mr-2 flex items-center"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <label
                      className={`inline-flex select-none items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold shadow-sm transition-colors ${(raidSettings?.[raidId] ?? false)
                          ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200'
                          : 'border-zinc-200 bg-white text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'
                        }`}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(raidSettings?.[raidId])}
                        onChange={(e) => onToggleSupportShortage(raidId as RaidId, e.target.checked)}
                        disabled={isRaidSettingsLoading}
                        className="h-3 w-3 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="whitespace-nowrap">랏폿</span>
                    </label>
                  </div>
                )}

                <span className="inline-block w-10 text-right">
                  {isRaidOpen ? '접기' : '펼치기'}
                </span>
                <ChevronDown
                  size={16}
                  className={`transition-transform duration-200 ${isRaidOpen ? 'rotate-0' : '-rotate-90'
                    }`}
                />
              </div>
            </button>

            {isRaidOpen && (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {runs.map((run: RaidRun) => {
                  const runKey = `${raidId}-${run.runIndex}`;
                  const isRunOpen = runOpenState[runKey] ?? true;

                  // 이 공대에서 "보이는" 멤버 기준 평균
                  const allVisibleMembers = run.parties.flatMap((p) =>
                    p.members.filter((m) => !excludedIdsForRaid.includes(m.id)),
                  );
                  const dpsMembers = allVisibleMembers.filter(
                    (m) => m.role === 'DPS',
                  );
                  const supMembers = allVisibleMembers.filter(
                    (m) => m.role === 'SUPPORT',
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

                  return (
                    <div key={run.runIndex} className="p-5">
                      {/* 공대 헤더 */}
                      <button
                        type="button"
                        onClick={() =>
                          toggleRun(raidId as string, run.runIndex)
                        }
                        className="flex w-full items-center justify-between rounded-xl bg-zinc-50 px-3 py-2 text-left ring-1 ring-transparent transition-colors hover:bg-zinc-100 hover:ring-zinc-200 dark:bg-zinc-900/60 dark:hover:bg-zinc-900 dark:hover:ring-zinc-700"
                      >
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                            {run.runIndex}
                          </span>
                          <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                            공격대
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          {/* ✅ 모드에 따라 평균 전투력 표시 방식 변경 */}
                          <div className="flex flex-wrap items-center gap-2">
                            {balanceMode === 'role' ? (
                              <>
                                <span className="inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-[11px] font-medium text-zinc-500 shadow-sm ring-1 ring-zinc-100 dark:bg-zinc-900 dark:text-zinc-400 dark:ring-zinc-700">
                                  <Swords
                                    size={12}
                                    className="text-zinc-600 dark:text-zinc-300"
                                  />
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
                                  <Shield
                                    size={12}
                                    className="text-emerald-600 dark:text-emerald-300"
                                  />
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
                                <Swords
                                  size={12}
                                  className="text-zinc-600 dark:text-zinc-300"
                                />
                                <span className="tracking-wide">평균 전투력</span>
                                <strong className="ml-1 text-zinc-800 dark:text-zinc-100">
                                  {overallAvg !== null
                                    ? overallAvg.toLocaleString()
                                    : '없음'}
                                </strong>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                            <span className="inline-block w-10 text-right">
                              {isRunOpen ? '접기' : '펼치기'}
                            </span>
                            <ChevronDown
                              size={14}
                              className={`transition-transform duration-200 ${isRunOpen ? 'rotate-0' : '-rotate-90'
                                }`}
                            />
                          </div>
                        </div>
                      </button>

                      {/* 공대 내용 */}
                      {isRunOpen && (
                        <div className="mt-4 grid gap-4 lg:grid-cols-2">
                          {run.parties.map((party) => {
                            const visibleMembers = party.members.filter(
                              (m) => !excludedIdsForRaid.includes(m.id),
                            );
                            const emptySlots = Math.max(
                              0,
                              4 - visibleMembers.length,
                            );

                            return (
                              <div
                                key={party.partyIndex}
                                className="flex flex-col rounded-2xl border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-950/50"
                              >
                                <div className="mb-3 flex items-center justify-between px-1">
                                  <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-500">
                                    <Users size={14} />
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
                                      className="flex items-center justify-between rounded-xl bg-white p-2.5 shadow-sm ring-1 ring-zinc-900/5 dark:bg-zinc-900 dark:ring-zinc-800"
                                    >
                                      <div className="flex items-center gap-3">
                                        <div
                                          className={`flex h-8 w-8 items-center justify-center rounded-lg ${m.role === 'SUPPORT'
                                              ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                                              : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                                            }`}
                                          title={m.role}
                                        >
                                          {m.role === 'SUPPORT' ? (
                                            <Shield size={16} />
                                          ) : (
                                            <Swords size={16} />
                                          )}
                                        </div>
                                        <div>
                                          <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                                            {m.jobCode}
                                          </div>
                                          <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                                            {m.discordName}
                                          </div>
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-2">
                                        <div className="text-right">
                                          <div className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                                            Lv.{m.itemLevel}
                                          </div>
                                          <div className="text-[10px] text-zinc-400">
                                            CP {m.combatPower.toLocaleString()}
                                          </div>
                                        </div>

                                        {onExcludeCharacter && (
                                          <button
                                            type="button"
                                            // text-[10px] font-bold 제거 -> 아이콘 사이즈로 제어
                                            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-red-200 text-red-500 hover:bg-red-50 dark:border-red-700/60 dark:text-red-300 dark:hover:bg-red-900/40"
                                            onClick={() => {
                                              const ok = window.confirm(
                                                `${m.discordName}님의 ${m.jobCode} 캐릭터를 "${meta.label}" 레이드에서 제외하시겠습니까?\n(이 레이드에서만 제외되고, 다른 레이드는 그대로 남습니다.)`,
                                              );
                                              if (!ok) return;
                                              onExcludeCharacter(raidId as RaidId, m.id);
                                            }}
                                          >
                                            <X className="h-3 w-3" />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ))}

                                  {Array.from({ length: emptySlots }).map(
                                    (_, i) => (
                                      <div
                                        key={`empty-${run.runIndex}-${party.partyIndex}-${i}`}
                                        className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-200 py-3 text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-600"
                                      >
                                        <User size={14} className="opacity-50" />
                                        빈 자리 (공팟)
                                      </div>
                                    ),
                                  )}
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
            )}
          </div>
        );
      })}
    </div>
  );
};
