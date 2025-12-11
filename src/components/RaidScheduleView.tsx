import React, { useState } from 'react';
import type { RaidSchedule, RaidRun } from '../types';
import { RAID_META } from '../constants';
import {
  Shield,
  Swords,
  Users,
  User,
  ChevronDown,
} from 'lucide-react';

interface Props {
  schedule: RaidSchedule | null;
  isLoading?: boolean; // 로딩 상태 prop 추가
}

export const RaidScheduleView: React.FC<Props> = ({ schedule, isLoading = false }) => {
  // 레이드(각 카드) 접힘/펼침 상태
  const [raidOpenState, setRaidOpenState] = useState<Record<string, boolean>>({});
  // 공대(각 run) 접힘/펼침 상태
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

  // [추가] 로딩 스켈레톤 UI
  if (isLoading) {
    return (
      <div className="grid gap-6">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            {/* 스켈레톤 헤더 */}
            <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
                <div>
                  <div className="mb-2 h-4 w-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                  <div className="h-3 w-32 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                </div>
              </div>
            </div>
            {/* 스켈레톤 내용 */}
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

  const raidIds = Object.keys(schedule) as (keyof RaidSchedule)[];

  return (
    <div className="grid gap-6">
      {raidIds.map((raidId) => {
        const runs = schedule[raidId];
        if (!runs || runs.length === 0) return null;

        const meta = RAID_META[raidId];
        const isHard = meta.difficulty === 'HARD';
        const borderColor = isHard
          ? 'border-rose-200 dark:border-rose-900/50'
          : 'border-sky-200 dark:border-sky-900/50';
        const headerBg = isHard
          ? 'bg-rose-50 dark:bg-rose-950/30'
          : 'bg-sky-50 dark:bg-sky-950/30';
        const titleColor = isHard
          ? 'text-rose-900 dark:text-rose-100'
          : 'text-sky-900 dark:text-sky-100';

        const isRaidOpen = raidOpenState[raidId] ?? true;

        return (
          <div
            key={raidId}
            className={`overflow-hidden rounded-3xl border bg-white shadow-sm dark:bg-zinc-900 ${borderColor}`}
          >
            {/* 레이드 헤더 (접기/펼치기 토글) */}
            <button
              type="button"
              onClick={() => toggleRaid(raidId)}
              className={`flex w-full items-center justify-between border-b px-5 py-4 text-left transition-colors hover:bg-white/70 dark:hover:bg-zinc-800/70 ${headerBg} ${borderColor} bg-opacity-50`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`h-3 w-3 rounded-full shadow-sm ring-2 ring-white/50 ${meta.colorClass}`}
                />
                <div>
                  <h4 className={`text-base font-bold ${titleColor}`}>
                    {meta.label}
                  </h4>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                        isHard
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300'
                          : 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300'
                      }`}
                    >
                      {meta.difficulty}
                    </span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      총 {runs.length}개 공대
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                {/* 고정 폭 라벨 + 아이콘 회전 애니메이션 */}
                <span className="inline-block w-10 text-right">
                  {isRaidOpen ? '접기' : '펼치기'}
                </span>
                <ChevronDown
                  size={16}
                  className={`transition-transform duration-200 ${
                    isRaidOpen ? 'rotate-0' : '-rotate-90'
                  }`}
                />
              </div>
            </button>

            {/* 레이드 내용 (공대 리스트) */}
            {isRaidOpen && (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {runs.map((run: RaidRun) => {
                  // 이 공대의 전체 멤버 / 딜러 / 서폿 리스트
                  const allMembers = run.parties.flatMap((p) => p.members);
                  const dpsMembers = allMembers.filter(
                    (m) => m.role === 'DPS',
                  );
                  const supMembers = allMembers.filter(
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

                  const runKey = `${raidId}-${run.runIndex}`;
                  const isRunOpen = runOpenState[runKey] ?? true;

                  return (
                    <div key={run.runIndex} className="p-5">
                      {/* 공대 헤더 (접기/펼치기 토글) */}
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
                          {/* 평균 전투력: 딜러 / 서포터 구분 표시 */}
                          <div className="flex flex-wrap items-center gap-2">
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
                          </div>

                          <div className="flex items-center gap-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                            <span className="inline-block w-10 text-right">
                              {isRunOpen ? '접기' : '펼치기'}
                            </span>
                            <ChevronDown
                              size={14}
                              className={`transition-transform duration-200 ${
                                isRunOpen ? 'rotate-0' : '-rotate-90'
                              }`}
                            />
                          </div>
                        </div>
                      </button>

                      {/* 공대 내용 (파티 정보) */}
                      {isRunOpen && (
                        <div className="mt-4 grid gap-4 lg:grid-cols-2">
                          {run.parties.map((party) => (
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
                                  {party.members.length}/4
                                </span>
                              </div>

                              <div className="flex flex-col gap-2">
                                {party.members.map((m) => (
                                  <div
                                    key={m.id}
                                    className="flex items-center justify-between rounded-xl bg-white p-2.5 shadow-sm ring-1 ring-zinc-900/5 dark:bg-zinc-900 dark:ring-zinc-800"
                                  >
                                    <div className="flex items-center gap-3">
                                      <div
                                        className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                                          m.role === 'SUPPORT'
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

                                {/* 빈 슬롯 표시 */}
                                {Array.from({
                                  length: 4 - party.members.length,
                                }).map((_, i) => (
                                  <div
                                    key={`empty-${run.runIndex}-${party.partyIndex}-${i}`}
                                    className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-200 py-3 text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-600"
                                  >
                                    <User size={14} className="opacity-50" />
                                    빈 자리 (공팟)
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
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