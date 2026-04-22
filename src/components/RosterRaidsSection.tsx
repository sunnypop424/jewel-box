import { useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Character, WeeklyClears, RosterRaidState } from '../types';
import type { RaidFamily, DifficultyTier, RaidId } from '../data/raids';
import { getRosterScopeRaids, suggestDefaultRep } from '../data/raids';

// -----------------------------------------------------------------------------
// 원정대 스코프 레이드 (카제로스 등) 섹션.
// 각 원정대 × 활성 원정대 레이드 조합마다 한 줄씩: 대표 캐릭 드롭다운 + 난이도
// 선택 + 클리어 체크. 클리어된 상태에서는 대표/난이도 변경 잠김.
// -----------------------------------------------------------------------------
export function RosterRaidsSection({
    rosterGroups,
    clears,
    rosterRaidState,
    onSetRosterRep,
    onClearRosterRep,
}: {
    rosterGroups: Array<{ rosterId: string; label: string; discordName: string; chars: Character[] }>;
    clears: WeeklyClears;
    rosterRaidState: RosterRaidState;
    onSetRosterRep?: (rosterId: string, family: string, selection: { selectedCharId: string; difficulty: string }) => void | Promise<void>;
    onClearRosterRep?: (rosterId: string, family: string) => void | Promise<void>;
}) {
    const rosterScopeRaids = getRosterScopeRaids();

    // 자동 기본값 주입: 선택이 없고 자격자가 있으면 최고 itemLevel 캐릭을 rep 으로 즉시 저장.
    // (Q4 답변=B: 자동 기본값 = 가장 높은 아이템 레벨).
    // ⚠️ ref 에 key 를 쓰기 "전에" 표시해야 async 쓰기가 끝나기 전 effect 재실행으로 인한 중복 호출을 방지.
    const autoWrittenRef = useRef<Set<string>>(new Set());
    useEffect(() => {
        if (!onSetRosterRep) return;
        for (const raid of rosterScopeRaids) {
            for (const roster of rosterGroups) {
                const key = `${roster.rosterId}:${raid.family}`;
                if (autoWrittenRef.current.has(key)) continue;
                const selection = rosterRaidState[roster.rosterId]?.[raid.family as RaidFamily];
                if (selection) continue; // 이미 저장돼 있으면 skip
                const qualifiedChars = roster.chars.filter(ch => raid.difficulties.some(d => {
                    if (ch.itemLevel < d.minItemLevel) return false;
                    if (d.requiresFlag && !(ch as any)[d.requiresFlag]) return false;
                    return true;
                }));
                if (qualifiedChars.length === 0) continue;
                const suggest = suggestDefaultRep(raid.family, qualifiedChars);
                if (!suggest) continue;
                // async 호출 전에 먼저 가드 표시 (race 방지).
                autoWrittenRef.current.add(key);
                onSetRosterRep(roster.rosterId, raid.family, { selectedCharId: suggest.charId, difficulty: suggest.difficulty });
            }
        }
    }, [rosterScopeRaids, rosterGroups, rosterRaidState, onSetRosterRep]);

    if (rosterGroups.length === 0 || rosterScopeRaids.length === 0) return null;

    return (
        <div className="rounded-2xl border border-pink-200 bg-pink-50/40 p-5 shadow-sm dark:border-pink-900/40 dark:bg-pink-950/10">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-pink-700 dark:text-pink-300">
                원정대 레이드
                <span className="rounded-full bg-pink-100 px-2 py-0.5 text-[10px] font-bold text-pink-600 dark:bg-pink-900/40 dark:text-pink-300">원정대당 1회</span>
            </h2>
            <div className="flex flex-col gap-2">
                {rosterScopeRaids.map(raid => (
                    rosterGroups.map(roster => {
                        const selection = rosterRaidState[roster.rosterId]?.[raid.family as RaidFamily];
                        const repChar = selection ? roster.chars.find(c => c.id === selection.selectedCharId) : null;
                        const raidIdForSelection = selection ? `${raid.family}_${selection.difficulty}` as RaidId : null;
                        const isCleared = Boolean(repChar && raidIdForSelection && clears[repChar.id]?.[raidIdForSelection]);

                        const qualifiedChars = roster.chars.filter(ch => {
                            return raid.difficulties.some(d => {
                                if (ch.itemLevel < d.minItemLevel) return false;
                                if (d.requiresFlag && !(ch as any)[d.requiresFlag]) return false;
                                return true;
                            });
                        });

                        const defaultSuggest = !selection && qualifiedChars.length > 0
                            ? suggestDefaultRep(raid.family, qualifiedChars)
                            : null;

                        const displayDifficulty = selection?.difficulty;
                        const availableDifficultiesForRep = repChar
                            ? raid.difficulties.filter(d => {
                                if (repChar.itemLevel < d.minItemLevel) return false;
                                if (d.requiresFlag && !(repChar as any)[d.requiresFlag]) return false;
                                return true;
                            })
                            : [];

                        return (
                            <div
                                key={`${roster.rosterId}-${raid.family}`}
                                className="flex flex-wrap items-center gap-3 rounded-xl border border-pink-100 bg-white px-4 py-3 text-sm shadow-sm dark:border-pink-900/40 dark:bg-zinc-900"
                            >
                                <div className="flex min-w-[140px] flex-col">
                                    <span className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100">{raid.label}</span>
                                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{roster.label}</span>
                                </div>

                                {qualifiedChars.length === 0 ? (
                                    <span className="text-[12px] text-zinc-400 italic">자격 가능 캐릭 없음</span>
                                ) : (
                                    <>
                                        <div className="relative">
                                            <select
                                                disabled={isCleared}
                                                value={selection?.selectedCharId || defaultSuggest?.charId || ''}
                                                onChange={(e) => {
                                                    const charId = e.target.value;
                                                    if (!charId) {
                                                        onClearRosterRep?.(roster.rosterId, raid.family);
                                                        return;
                                                    }
                                                    const ch = roster.chars.find(c => c.id === charId);
                                                    if (!ch) return;
                                                    const preferredTier = selection?.difficulty || defaultSuggest?.difficulty;
                                                    const validTiers = raid.difficulties.filter(d => ch.itemLevel >= d.minItemLevel && (!d.requiresFlag || (ch as any)[d.requiresFlag]));
                                                    if (validTiers.length === 0) return;
                                                    const tier = validTiers.some(d => d.tier === preferredTier)
                                                        ? preferredTier!
                                                        : validTiers.reduce((hi, d) => d.minItemLevel > hi.minItemLevel ? d : hi).tier;
                                                    onSetRosterRep?.(roster.rosterId, raid.family, { selectedCharId: charId, difficulty: tier });
                                                }}
                                                className="appearance-none rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 pr-9 text-sm font-medium text-zinc-700 focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 disabled:opacity-50"
                                            >
                                                <option value="">대표 선택</option>
                                                {qualifiedChars.map(ch => (
                                                    <option key={ch.id} value={ch.id}>
                                                        {ch.lostArkName || ch.jobCode} (Lv.{ch.itemLevel})
                                                    </option>
                                                ))}
                                            </select>
                                            <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                                        </div>

                                        {repChar && (
                                            <div className="relative">
                                                <select
                                                    disabled={isCleared}
                                                    value={displayDifficulty || ''}
                                                    onChange={(e) => {
                                                        const tier = e.target.value as DifficultyTier;
                                                        if (!tier) return;
                                                        onSetRosterRep?.(roster.rosterId, raid.family, { selectedCharId: repChar.id, difficulty: tier });
                                                    }}
                                                    className="appearance-none rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 pr-9 text-sm font-medium text-zinc-700 focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 disabled:opacity-50"
                                                >
                                                    <option value="">난이도</option>
                                                    {availableDifficultiesForRep.map(d => (
                                                        <option key={d.tier} value={d.tier}>{d.label}</option>
                                                    ))}
                                                </select>
                                                <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        );
                    })
                ))}
            </div>
        </div>
    );
}
