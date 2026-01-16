import React, { useMemo, useState } from 'react';
import type { Character, RaidSchedule, RaidRun, RaidId, RaidExclusionMap, RaidSettingsMap } from '../types';
import { RAID_META } from '../constants';
import { Shield, Swords, Users, User, ChevronDown, X, CircleDashed, CheckCircle2 } from 'lucide-react';

// 모드 타입(문자열) – App / raidLogic과 동일한 리터럴 사용
type BalanceMode = 'overall' | 'role' | 'speed';

// ✅ [NEW] 연쇄 제외 설정
// 상위 난이도를 완료(제외)하면, 하위 난이도나 대체 레이드(3막)도 같이 제외해야 리스트에서 사라짐
const CASCADE_EXCLUSIONS: Partial<Record<RaidId, RaidId[]>> = {
  'SERKA_NIGHTMARE': ['SERKA_NIGHTMARE', 'SERKA_HARD', 'SERKA_NORMAL', 'ACT3_HARD'],
  'SERKA_HARD': ['SERKA_HARD', 'SERKA_NORMAL', 'ACT3_HARD'],
  'SERKA_NORMAL': ['SERKA_NORMAL', 'ACT3_HARD'],
  'FINAL_HARD': ['FINAL_HARD', 'FINAL_NORMAL'],
  'ACT4_HARD': ['ACT4_HARD', 'ACT4_NORMAL'],
};

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

  /** ✅ [NEW] 레이드별 후보풀(=대상자/대기풀 포함) */
  raidCandidates?: Partial<Record<RaidId, Character[]>>;
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
}) => {
  const [raidOpenState, setRaidOpenState] = useState<Record<string, boolean>>(
    {},
  );
  const [runOpenState, setRunOpenState] = useState<Record<string, boolean>>({});

  // ✅ [FIX] Hook 순서 안정화
  // isLoading / schedule 유무에 따라 early-return 하더라도 Hook 호출 개수/순서가
  // 바뀌지 않도록, useMemo 등 모든 Hook은 return 이전에 항상 호출되게 둡니다.

  // ✅ 후보풀 빠졌을 때도 안전하게 동작하도록 fallback 구성
  // - raidCandidates가 없는 경우: 현재 스케줄에 배치된 사람만이라도 "남은"으로 표시
  // - schedule이 null인 렌더에서도 Hook 호출을 유지하기 위해 null-safe 처리
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

  // ✅ [NEW] 제외 핸들러 (연쇄 제외 적용)
  const handleExcludeClick = (raidId: RaidId, characterId: string, characterName: string, raidLabel: string) => {
    if (!onExcludeCharacter) return;

    const ok = window.confirm(
      `${characterName} 캐릭터를 "${raidLabel}" 레이드에서 완료(제외) 처리하시겠습니까?\n\n(완료 시 하위 난이도 및 대체 레이드에서도 자동으로 제외되어 리스트에서 사라집니다.)`
    );
    if (!ok) return;

    // 1. 현재 레이드 제외
    onExcludeCharacter(raidId, characterId);

    // 2. 연관된 하위/대체 레이드도 같이 제외 (Cascade)
    // 예: 나메 완료 시 -> 하드, 노말, 3막하드 목록에서도 제거
    const cascadeTargets = CASCADE_EXCLUSIONS[raidId];
    if (cascadeTargets) {
      cascadeTargets.forEach((targetId) => {
        if (targetId !== raidId) {
          onExcludeCharacter(targetId, characterId);
        }
      });
    }
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
              dot: 'bg-sky-500', 
            }
            : diff === 'HARD'
              ? {
                borderColor: 'border-rose-200 dark:border-rose-900/50',
                headerBg: 'bg-rose-50 dark:bg-rose-950/30',
                badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300',
                dot: 'bg-rose-500', 
              }
              : {
                borderColor: 'border-violet-200 dark:border-violet-900/50',
                headerBg: 'bg-violet-50 dark:bg-violet-950/30',
                badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300',
                dot: 'bg-violet-500', 
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
                {/* 랏폿 체크박스 */}
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
                

            {/* ✅ [NEW] 후보풀 기반 현황판 (완료/남음/미배치) */}
            <RaidStatusBoard
              raidId={raidId as RaidId}
              raidLabel={meta.label}
              // ✅ 후보풀이 없을 때도 "현재 스케줄에 등장한 멤버"를 최소 후보로 사용
              candidates={raidCandidates?.[raidId] ?? candidatesFallback[raidId] ?? []}
              runs={runs}
              excludedIds={excludedIdsForRaid}
              onExclude={(m) =>
                handleExcludeClick(
                  raidId as RaidId,
                  m.id,
                  m.discordName,
                  meta.label,
                )
              }
              canExclude={Boolean(onExcludeCharacter)}
            />
                {runs.map((run: RaidRun) => {
                  const runKey = `${raidId}-${run.runIndex}`;
                  const isRunOpen = runOpenState[runKey] ?? true;

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
                                            // ✅ [MODIFIED] 커스텀 제외 핸들러 호출 (Cascade 적용)
                                            onClick={() => handleExcludeClick(raidId as RaidId, m.id, m.discordName, meta.label)}
                                            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-red-200 text-red-500 hover:bg-red-50 dark:border-red-700/60 dark:text-red-300 dark:hover:bg-red-900/40"
                                            title="완료(제외) 처리"
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
type Member = Character;

// ==============================
// 1. (NEW) 요청하신 레이아웃이 적용된 카드
// ==============================
function RaidMemberCard(props: {
  member: Member;
  canExclude: boolean;
  onExclude: (m: Member) => void;
  isReadOnly?: boolean;
}) {
  const { member, canExclude, onExclude, isReadOnly } = props;
  const isSup = member.role === 'SUPPORT';

  return (
    <div className="group relative flex items-center justify-between rounded-xl bg-white p-2.5 shadow-sm ring-1 ring-zinc-900/5 transition-all hover:border-zinc-300 hover:shadow-md dark:bg-zinc-900 dark:ring-zinc-800 dark:hover:border-zinc-700">
      
      {/* [Left Group] 아이콘 + 직업 + 닉네임 */}
      <div className="flex items-center gap-3">
        {/* 아이콘 박스 (32px) */}
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm ${
            isSup
              ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
              : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
          }`}
          title={member.role}
        >
          {isSup ? <Shield size={16} /> : <Swords size={16} />}
        </div>

        {/* 텍스트: 직업(상단), 닉네임(하단) */}
        <div>
          <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
            {member.jobCode}
          </div>
          <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            {member.discordName}
          </div>
        </div>
      </div>

      {/* [Right Group] 레벨/CP + 액션 버튼 */}
      <div className="flex items-center gap-3">
        {/* 수치 정보 (우측 정렬) */}
        <div className="text-right">
          <div className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
            Lv.{member.itemLevel}
          </div>
          <div className="text-[10px] text-zinc-400">
            CP {member.combatPower.toLocaleString()}
          </div>
        </div>

        {/* 액션 버튼 (아까 만든 '완료 처리' 스타일) */}
        {!isReadOnly && canExclude && (
          <button
            type="button"
            onClick={() => onExclude(member)}
            className="invisible group-hover:visible flex h-7 shrink-0 items-center rounded-lg bg-zinc-100 px-2 text-[10px] font-bold text-zinc-600 transition-colors hover:bg-emerald-100 hover:text-emerald-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-300"
            title="완료(제외) 처리"
          >
            완료
          </button>
        )}
      </div>
    </div>
  );
}

// ==============================
// 2. 메인 현황판 (레이아웃)
// ==============================

function dedupeById(list: Member[]): Member[] {
  const map = new Map<string, Member>();
  list.forEach((m) => {
    if (!map.has(m.id)) map.set(m.id, m);
  });
  return Array.from(map.values());
}

export function RaidStatusBoard(props: {
  raidId: RaidId;
  raidLabel: string;
  candidates: Member[];
  runs: RaidRun[];
  excludedIds: string[];
  canExclude: boolean;
  onExclude: (m: Member) => void;
}) {
  const { candidates, runs, excludedIds, canExclude, onExclude } = props;

  // 데이터 분류
  const { unassigned, assigned, completed } = useMemo(() => {
    const uniqueCandidates = dedupeById(candidates);
    const excludedSet = new Set(excludedIds);
    const placedIds = new Set<string>();
    
    runs
      .flatMap((r) => r.parties.flatMap((p) => p.members))
      .forEach((m) => placedIds.add(m.id));

    const sortKey = (a: Member, b: Member) =>
      b.combatPower - a.combatPower || b.itemLevel - a.itemLevel || a.id.localeCompare(b.id);

    const completedList: Member[] = [];
    const assignedList: Member[] = [];
    const unassignedList: Member[] = [];

    uniqueCandidates.forEach((m) => {
      if (excludedSet.has(m.id)) completedList.push(m);
      else if (placedIds.has(m.id)) assignedList.push(m);
      else unassignedList.push(m);
    });

    return {
      completed: completedList.sort(sortKey),
      assigned: assignedList.sort(sortKey),
      unassigned: unassignedList.sort(sortKey),
    };
  }, [candidates, excludedIds, runs]);

  return (
    <div className="flex flex-col gap-5 p-6">
      <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
        
        {/* 1. 미배치/대기 */}
        <StatusColumn
          title="미배치 / 대기"
          count={unassigned.length}
          icon={<CircleDashed size={16} />}
          headerColor="text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-900/20 dark:border-amber-900/30"
        >
          {unassigned.map((m) => (
            <RaidMemberCard
              key={m.id}
              member={m}
              canExclude={canExclude}
              onExclude={onExclude}
            />
          ))}
        </StatusColumn>

        {/* 2. 배치됨 */}
        <StatusColumn
          title="배치됨 / 진행 중"
          count={assigned.length}
          icon={<Users size={16} />}
          headerColor="text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-900/20 dark:border-blue-900/30"
        >
          {assigned.map((m) => (
            <RaidMemberCard
              key={m.id}
              member={m}
              canExclude={canExclude}
              onExclude={onExclude}
            />
          ))}
        </StatusColumn>

        {/* 3. 완료됨 */}
        <StatusColumn
          title="완료 (제외됨)"
          count={completed.length}
          icon={<CheckCircle2 size={16} />}
          headerColor="text-zinc-700 bg-zinc-100 border-zinc-200 dark:text-zinc-400 dark:bg-zinc-800 dark:border-zinc-700"
        >
          {completed.map((m) => (
            <div key={m.id} className="opacity-60 grayscale hover:opacity-100 hover:grayscale-0 transition-all">
              <RaidMemberCard
                member={m}
                canExclude={false}
                onExclude={onExclude}
                isReadOnly={true}
              />
            </div>
          ))}
        </StatusColumn>

      </div>
    </div>
  );
}

// ==============================
// 3. 컬럼 레이아웃 (수정됨)
// ==============================
function StatusColumn({
  title,
  count,
  icon,
  headerColor,
  children,
}: {
  title: string;
  count: number;
  icon: React.ReactNode;
  headerColor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-zinc-200 bg-zinc-50/50 h-full dark:border-zinc-800 dark:bg-zinc-950/20">
      {/* 헤더 */}
      <div className={`flex items-center justify-between border-b px-4 py-3 rounded-t-2xl ${headerColor} border-inherit`}>
        <div className="flex items-center gap-2 text-sm font-bold">
          {icon}
          <span>{title}</span>
        </div>
        <span className="rounded-full bg-white/60 px-2 py-0.5 text-xs font-extrabold shadow-sm dark:bg-black/20">
          {count}
        </span>
      </div>

      {/* ✅ [수정됨] 리스트 영역 
         - max-h-[600px]: 내용이 600px을 넘어가면 스크롤 발생
         - custom-scrollbar: (선택사항) 스크롤바 스타일링을 위해 클래스 추가 가능
      */}
      <div className="flex-1 overflow-y-auto p-3 max-h-[274px]">
        <div className="flex flex-col gap-2">
          {React.Children.count(children) === 0 ? (
            <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-white/40 text-xs text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/20">
              데이터 없음
            </div>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}