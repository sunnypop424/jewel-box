import { useMemo } from 'react';
import { User, Shield, Swords } from 'lucide-react';
import { RAID_META } from '../constants';
import type { Character, RaidId, RaidExclusionMap, RaidSchedule } from '../types';

type RaidProgressState = 'DONE' | 'ASSIGNED' | 'UNASSIGNED';

const RAID_ORDER_FOR_PROGRESS: RaidId[] = [
    'ACT4_NORMAL',
    'FINAL_NORMAL',
    'SERKA_NORMAL',
    'ACT4_HARD',
    'FINAL_HARD',
    'SERKA_HARD',
    'SERKA_NIGHTMARE',
];

/**
 * 스케줄 데이터를 기반으로 레이드별 배정된 캐릭터 ID 집합을 생성합니다.
 */
function buildAssignedIndex(schedule: RaidSchedule | null) {
    const assignedByRaid: Partial<Record<RaidId, Set<string>>> = {};
    if (!schedule) return assignedByRaid;

    (Object.keys(schedule) as RaidId[]).forEach((raidId) => {
        const runs = schedule[raidId] ?? [];
        const set = new Set<string>();
        runs
            .flatMap((r) => r.parties.flatMap((p) => p.members))
            .forEach((m) => set.add(m.id));
        assignedByRaid[raidId] = set;
    });

    return assignedByRaid;
}

interface UserRaidProgressPanelProps {
    characters: Character[];
    raidCandidates?: Partial<Record<RaidId, Character[]>>;
    exclusions?: RaidExclusionMap;
    schedule: RaidSchedule | null;
}

export function UserRaidProgressPanel({
    characters,
    raidCandidates,
    exclusions,
    schedule,
}: UserRaidProgressPanelProps) {
    const assignedByRaid = useMemo(() => buildAssignedIndex(schedule), [schedule]);

    // 캐릭터를 유저(DiscordName)별로 그룹화하고 정렬
    const users = useMemo(() => {
        const byUser = new Map<string, Character[]>();
        characters.forEach((c) => {
            const key = c.discordName || '(이름 없음)';
            if (!byUser.has(key)) byUser.set(key, []);
            byUser.get(key)!.push(c);
        });

        const arr = Array.from(byUser.entries()).map(([discordName, chars]) => ({
            discordName,
            chars: chars.slice().sort((a, b) => b.combatPower - a.combatPower),
        }));

        // 캐릭터 많은 순, 이름 순 정렬
        arr.sort(
            (a, b) =>
                b.chars.length - a.chars.length || a.discordName.localeCompare(b.discordName),
        );
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

    const getStatusStyles = (state: RaidProgressState) => {
        switch (state) {
            case 'DONE':
                return 'bg-zinc-100 text-zinc-400 decoration-zinc-400 line-through dark:bg-zinc-800 dark:text-zinc-500';
            case 'ASSIGNED':
                return 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-300 dark:ring-indigo-900/40';
            case 'UNASSIGNED':
            default:
                return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:ring-amber-900/40';
        }
    };

    return (
        <div className="space-y-6">

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {users.map(({ discordName, chars }) => (
                    <div
                        key={discordName}
                        className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/80"
                    >
                        <div className="flex items-center justify-between border-b border-zinc-100 pb-3 dark:border-zinc-800">
                            <div className="flex items-center gap-2.5">
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                                    <User size={16} />
                                </div>
                                <span className="font-bold text-zinc-900 dark:text-zinc-100">
                                    {discordName}
                                </span>
                            </div>
                            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                                {chars.length} Chars
                            </span>
                        </div>

                        <div className="flex flex-col gap-2">
                            {chars.map((c) => {
                                const raidsForChar = RAID_ORDER_FOR_PROGRESS.filter((raidId) =>
                                    (candidatesByRaid[raidId] ?? []).some((m) => m.id === c.id),
                                );
                                const isSup = c.role === 'SUPPORT';

                                return (
                                    <div
                                        key={c.id}
                                        className="group flex flex-col gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-zinc-900/5 transition-all hover:shadow-md dark:bg-zinc-900 dark:ring-zinc-800"
                                    >
                                        {/* 상단: 캐릭터 기본 정보 영역 */}
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                {/* 역할 아이콘 (서포터/딜러) */}
                                                <div
                                                    className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${isSup
                                                            ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                                                            : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                                                        }`}
                                                >
                                                    {isSup ? <Shield size={16} /> : <Swords size={16} />}
                                                </div>

                                                {/* 직업명 및 추가 정보 (필요시) */}
                                                <div>
                                                    <div className="text-sm font-bold text-zinc-800 dark:text-zinc-100">
                                                        {c.jobCode}
                                                    </div>
                                                    <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                                                        {discordName}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* 우측: 레벨 및 전투력 */}
                                            <div className="text-right">
                                                <div className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                                                    Lv.{c.itemLevel}
                                                </div>
                                                <div className="text-[10px] font-medium text-zinc-400">
                                                    CP {c.combatPower.toLocaleString()}
                                                </div>
                                            </div>
                                        </div>

                                        {/* 하단: 레이드 진행 상태 배지 영역 */}
                                        <div className="flex flex-wrap items-center justify-end gap-1.5 border-t border-zinc-100 pt-2.5 dark:border-zinc-800">
                                            {raidsForChar.length === 0 ? (
                                                <span className="text-[10px] text-zinc-400 ml-1">잔여 레이드 없음</span>
                                            ) : (
                                                raidsForChar.map((raidId) => {
                                                    const state = getState(raidId, c.id);
                                                    const meta = RAID_META[raidId];
                                                    const style = getStatusStyles(state);

                                                    return (
                                                        <span
                                                            key={raidId}
                                                            className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium transition-colors shadow-sm ${style}`}
                                                        >
                                                            {meta.label}
                                                        </span>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}