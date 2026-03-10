import { useMemo } from 'react';
import { User, Shield, Swords, Coins } from 'lucide-react';
import { RAID_META } from '../constants';
import type { Character, RaidId, RaidExclusionMap, RaidSchedule } from '../types';

type RaidProgressState = 'DONE' | 'ASSIGNED' | 'UNASSIGNED';

const RAID_ORDER_FOR_PROGRESS: RaidId[] = [
    'ACT2_HARD', 'ACT3_HARD',
    'ACT4_NORMAL', 'FINAL_NORMAL', 'SERKA_NORMAL',
    'ACT4_HARD', 'FINAL_HARD', 'SERKA_HARD', 'SERKA_NIGHTMARE',
    'HORIZON_STEP1', 'HORIZON_STEP2', 'HORIZON_STEP3'
];

function buildAssignedIndex(schedule: RaidSchedule | null) {
    const assignedByRaid: Partial<Record<RaidId, Set<string>>> = {};
    if (!schedule) return assignedByRaid;

    (Object.keys(schedule) as RaidId[]).forEach((raidId) => {
        const runs = schedule[raidId] ?? [];
        const set = new Set<string>();
        runs.flatMap((r) => r.parties.flatMap((p) => p.members)).forEach((m) => set.add(m.id));
        assignedByRaid[raidId] = set;
    });

    return assignedByRaid;
}

interface UserRaidProgressPanelProps {
    characters: Character[];
    raidCandidates?: Partial<Record<RaidId, Character[]>>;
    exclusions?: RaidExclusionMap;
    schedule: RaidSchedule | null;
    onMarkRaidComplete?: (raidId: RaidId, charId: string) => void;
}

export function UserRaidProgressPanel({
    characters,
    raidCandidates,
    exclusions,
    schedule,
    onMarkRaidComplete,
}: UserRaidProgressPanelProps) {
    const assignedByRaid = useMemo(() => buildAssignedIndex(schedule), [schedule]);

    const users = useMemo(() => {
        const byUser = new Map<string, Character[]>();
        characters.forEach((c) => {
            const key = c.discordName || '(이름 없음)';
            if (!byUser.has(key)) byUser.set(key, []);
            byUser.get(key)!.push(c);
        });

        const arr = Array.from(byUser.entries()).map(([discordName, chars]) => ({
            discordName,
            // 🌟 강제 전투력 정렬 제거! (구글 시트 저장 순서대로 노출)
            chars: chars, 
        }));

        arr.sort((a, b) => b.chars.length - a.chars.length || a.discordName.localeCompare(b.discordName));
        return arr;
    }, [characters]);

    const getState = (raidId: RaidId, charId: string): RaidProgressState => {
        const done = (exclusions?.[raidId] ?? []).includes(charId);
        if (done) return 'DONE';
        const assignedSet = assignedByRaid[raidId];
        if (assignedSet?.has(charId)) return 'ASSIGNED';
        return 'UNASSIGNED';
    };

    const candidatesByRaid = raidCandidates ?? {};

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-6">
                {users.map(({ discordName, chars }) => {
                    const mainChar = chars.reduce((max, curr) => curr.itemLevel > max.itemLevel ? curr : max, chars[0]);
                    
                    let userTotalGeneral = 0; let userTotalBound = 0;
                    let userCollectedGeneral = 0; let userCollectedBound = 0;

                    const charDataList = chars.map((c) => {
                        const raidsForChar = RAID_ORDER_FOR_PROGRESS.filter((raidId) =>
                            (candidatesByRaid[raidId] ?? []).some((m) => m.id === c.id),
                        );
                        
                        const isSup = c.role === 'SUPPORT';
                        const isMain = c.id === mainChar.id;

                        const option = c.goldOption || 'ALL_MAX';
                        let ignoreBoundGold = false;
                        if (option === 'GENERAL_MAX') ignoreBoundGold = true;
                        else if (option === 'MAIN_ALL_ALT_GENERAL' && !isMain) ignoreBoundGold = true;
                        
                        const raidYields = raidsForChar.map(id => {
                            const meta = RAID_META[id];
                            const effectiveGold = (ignoreBoundGold && meta.goldType === 'BOUND') ? -1 : meta.gold;
                            return { id, ...meta, effectiveGold };
                        }).sort((a, b) => b.effectiveGold - a.effectiveGold);
                        
                        const top3Yields = raidYields.filter(y => y.effectiveGold > 0).slice(0, 3);
                        const top3Ids = new Set(top3Yields.map(y => y.id));
                        
                        let charTotalGeneral = 0; let charTotalBound = 0;
                        let charCollectedGeneral = 0; let charCollectedBound = 0;

                        top3Yields.forEach(y => {
                            const isDone = getState(y.id, c.id) === 'DONE';
                            if (y.goldType === 'GENERAL') {
                                charTotalGeneral += y.gold;
                                userTotalGeneral += y.gold;
                                if (isDone) {
                                    charCollectedGeneral += y.gold;
                                    userCollectedGeneral += y.gold;
                                }
                            } else if (y.goldType === 'BOUND') {
                                charTotalBound += y.gold;
                                userTotalBound += y.gold;
                                if (isDone) {
                                    charCollectedBound += y.gold;
                                    userCollectedBound += y.gold;
                                }
                            }
                        });

                        return {
                            c, isSup, isMain, raidsForChar, top3Ids,
                            charTotalGeneral, charTotalBound, charCollectedGeneral, charCollectedBound
                        };
                    });

                    return (
                        <div key={discordName} className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-all hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/80">
                            
                            {/* 헤더 영역 */}
                            <div className="flex items-start justify-between border-b border-zinc-100 pb-4 dark:border-zinc-800">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                                        <User size={20} />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{discordName}</span>
                                        <div className="flex items-center gap-3 text-xs font-semibold">
                                            <span className="text-zinc-500 dark:text-zinc-400">
                                                일반 <span className="text-amber-600 dark:text-amber-400">{userCollectedGeneral.toLocaleString()}G</span> / {userTotalGeneral.toLocaleString()}G
                                            </span>
                                            <span className="text-zinc-500 dark:text-zinc-400">
                                                귀속 <span className="text-orange-600 dark:text-orange-400">{userCollectedBound.toLocaleString()}G</span> / {userTotalBound.toLocaleString()}G
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <span className="shrink-0 rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                                    {charDataList.length} Chars
                                </span>
                            </div>

                            {/* 그리드 영역 */}
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                                {charDataList.map(({ c, isSup, isMain, raidsForChar, top3Ids, charTotalGeneral, charTotalBound, charCollectedGeneral, charCollectedBound }) => (
                                    <div key={c.id} className="group flex h-full flex-col justify-between gap-3 rounded-xl bg-zinc-50/50 p-4 shadow-sm ring-1 ring-zinc-900/5 transition-all hover:shadow-md dark:bg-zinc-950/50 dark:ring-zinc-800">
                                        
                                        <div className="flex flex-col gap-3">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${isSup ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-white shadow-sm ring-1 ring-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:ring-zinc-700 dark:text-zinc-400'}`}>
                                                        {isSup ? <Shield size={18} /> : <Swords size={18} />}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[15px] font-bold text-zinc-800 dark:text-zinc-100">{c.jobCode}</span>
                                                            {isMain && <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[9px] font-bold text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400">본캐</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Lv.{c.itemLevel}</div>
                                                    <div className="text-[11px] font-medium text-zinc-400">CP {c.combatPower.toLocaleString()}</div>
                                                </div>
                                            </div>

                                            <div className="flex flex-col gap-1.5 rounded-lg bg-amber-50/70 p-2.5 dark:bg-amber-950/20 border border-amber-100/50 dark:border-amber-900/30">
                                                <div className="flex items-center justify-between mb-0.5">
                                                    <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                                                        <Coins size={14} />
                                                        <span className="text-xs font-bold">예상 수익</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center justify-between text-xs font-semibold">
                                                    <span className="text-zinc-500 dark:text-zinc-400">일반 골드</span>
                                                    <div className="text-zinc-800 dark:text-zinc-200">
                                                        <span className="text-amber-600 dark:text-amber-400">{charCollectedGeneral.toLocaleString()}G</span>
                                                        <span className="text-zinc-300 dark:text-zinc-600 mx-1">/</span>
                                                        {charTotalGeneral.toLocaleString()}G
                                                    </div>
                                                </div>
                                                <div className="flex items-center justify-between text-xs font-semibold">
                                                    <span className="text-zinc-500 dark:text-zinc-400">귀속 골드</span>
                                                    <div className="text-zinc-800 dark:text-zinc-200">
                                                        <span className="text-orange-600 dark:text-orange-400">{charCollectedBound.toLocaleString()}G</span>
                                                        <span className="text-zinc-300 dark:text-zinc-600 mx-1">/</span>
                                                        {charTotalBound.toLocaleString()}G
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-1.5 border-t border-zinc-100 pt-3 dark:border-zinc-800 mt-1">
                                            {raidsForChar.length === 0 ? (
                                                <span className="text-xs text-zinc-400 text-center py-2">잔여 레이드 없음</span>
                                            ) : (
                                                raidsForChar.map((raidId) => {
                                                    const state = getState(raidId, c.id);
                                                    const meta = RAID_META[raidId];
                                                    const isTop3 = top3Ids.has(raidId);
                                                    const isDone = state === 'DONE';

                                                    return (
                                                        <label 
                                                            key={raidId} 
                                                            className={`flex items-center justify-between rounded-lg border px-2.5 py-2 transition-all ${
                                                                isDone 
                                                                ? 'bg-zinc-100/50 border-transparent opacity-60 cursor-default dark:bg-zinc-900/30 dark:border-transparent' 
                                                                : 'bg-white border-zinc-200 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/50 dark:bg-zinc-900 dark:border-zinc-700 dark:hover:border-indigo-500/50 dark:hover:bg-indigo-900/30 shadow-sm'
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-2.5">
                                                                <input 
                                                                    type="checkbox" 
                                                                    checked={isDone}
                                                                    disabled={isDone}
                                                                    onChange={(e) => {
                                                                        if (e.target.checked && !isDone) {
                                                                            const confirmed = window.confirm(`Lv.${c.itemLevel} ${c.jobCode}, ${meta.label} 완료하시겠습니까?`);
                                                                            if (confirmed) {
                                                                                onMarkRaidComplete?.(raidId, c.id);
                                                                            }
                                                                        }
                                                                    }}
                                                                    className="h-3.5 w-3.5 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed dark:border-zinc-600 dark:bg-zinc-800"
                                                                />
                                                                <span className={`text-xs font-bold transition-colors ${isDone ? 'text-zinc-400 line-through dark:text-zinc-600' : 'text-zinc-700 dark:text-zinc-200'}`}>
                                                                    {meta.label}
                                                                </span>
                                                            </div>
                                                            
                                                            {isTop3 ? (
                                                                <span className={`text-xs font-bold ${isDone ? 'text-zinc-400 dark:text-zinc-500' : 'text-amber-600 dark:text-amber-400'}`}>
                                                                    {meta.goldType === 'GENERAL' ? '' : '귀속 '}{meta.gold.toLocaleString()}G
                                                                </span>
                                                            ) : (
                                                                <span className="text-xs font-medium text-zinc-400 dark:text-zinc-600">
                                                                    골드 제외
                                                                </span>
                                                            )}
                                                        </label>
                                                    );
                                                })
                                            )}
                                        </div>

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