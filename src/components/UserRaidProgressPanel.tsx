import { useState, useMemo } from 'react';
import { User, Shield, Swords, Coins, RefreshCw, UserCog } from 'lucide-react';
import { RAID_META } from '../constants';
import {
    RAID_ORDER_FOR_PROGRESS,
    getEligibleRaids,
    getAllQualifiedRaids,
    getRaidFamily,
    getRosterRaidsForChar,
    isRosterScopeRaid,
} from '../data/raids';
import type { Character, RaidId, RaidSchedule, WeeklyClears, ClearEntry, RosterRaidState } from '../types';

// ✨ Hook 및 Toast 추가
import { useConfirm } from '../hooks/useConfirm';
import { toast } from 'sonner';

type RaidProgressState = 'DONE' | 'ASSIGNED' | 'UNASSIGNED';

// 기존 호출부 호환을 위해 레지스트리 함수/상수를 재수출.
export { RAID_ORDER_FOR_PROGRESS };
export const getExpectedRaids = getEligibleRaids;

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
    clears?: WeeklyClears;
    rosterRaidState?: RosterRaidState;
    schedule: RaidSchedule | null;
    accumulatedGold?: Record<string, { general: number; bound: number }>;
    onEditRoster?: (discordName: string) => void;  // 카드에서 해당 유저 원정대 관리 열기.
    onMarkRaidComplete?: (raidId: RaidId, charId: string, isDone: boolean) => void;
    onRefreshCharacter?: (char: Character) => Promise<void>;
    onRefreshUser?: (discordName: string, chars: Character[]) => Promise<void>;
    onResetAccumulatedGold?: (discordName: string, currentGen: number, currentBnd: number) => void;
}

export function UserRaidProgressPanel({
    characters,
    clears,
    rosterRaidState,
    schedule,
    accumulatedGold,
    onEditRoster,
    onMarkRaidComplete,
    onRefreshCharacter,
    onRefreshUser,
    onResetAccumulatedGold,
}: UserRaidProgressPanelProps) {
    const { confirm, ConfirmModal } = useConfirm(); 
    
    const [refreshingId, setRefreshingId] = useState<string | null>(null);
    const [refreshingUser, setRefreshingUser] = useState<string | null>(null);
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
            chars: chars,
        }));

        arr.sort((a, b) => b.chars.length - a.chars.length || a.discordName.localeCompare(b.discordName));
        return arr;
    }, [characters]);

    const getState = (raidId: RaidId, charId: string): RaidProgressState => {
        const done = Boolean(clears?.[charId]?.[raidId]);
        if (done) return 'DONE';
        const assignedSet = assignedByRaid[raidId];
        if (assignedSet?.has(charId)) return 'ASSIGNED';
        return 'UNASSIGNED';
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-6">
                {users.map(({ discordName, chars }) => {
                    const mainChar = chars.reduce((max, curr) => curr.itemLevel > max.itemLevel ? curr : max, chars[0]);

                    // 이 유저가 2개 이상의 원정대를 운영하는지 (캐릭 배지 노출 여부)
                    const distinctRosterIds = new Set(chars.map(c => c.rosterId || c.discordName));
                    const hasMultipleRosters = distinctRosterIds.size > 1;

                    let userTotalGeneral = 0; let userTotalBound = 0;
                    let userCollectedGeneral = 0; let userCollectedBound = 0;

                    const charDataList = chars.map((c) => {
                        const isSup = c.role === 'SUPPORT';
                        const isMain = c.id === mainChar.id;

                        let ignoreBoundGold = false;
                        if (c.receiveBoundGold !== undefined) {
                            ignoreBoundGold = !c.receiveBoundGold;
                        } else {
                            const option = c.goldOption || 'ALL_MAX';
                            if (option === 'GENERAL_MAX') ignoreBoundGold = true;
                            else if (option === 'MAIN_ALL_ALT_GENERAL' && !isMain) ignoreBoundGold = true;
                        }

                        // Ledger 기반: family 당 1개 후보. 클리어된 엔트리가 있으면 ledger 스냅샷 우선,
                        // 없으면 현재 meta 에서 해당 family 의 자격 최고 tier 사용.
                        // 원정대 레이드(카제로스 등)는 3회 골드 제한에 포함되지 않으므로 별도 집계.
                        const ledgerEntries: ClearEntry[] = Object.values(clears?.[c.id] || {}).filter(Boolean) as ClearEntry[];

                        type Cand = { id: RaidId; general: number; bound: number; isCleared: boolean };
                        const charCandByFamily = new Map<string, Cand>();
                        const rosterCandByFamily = new Map<string, Cand>();

                        // 1) 클리어된 엔트리: clearScope 에 따라 버킷 분류.
                        for (const e of ledgerEntries) {
                            const fam = getRaidFamily(e.raidId);
                            const target = isRosterScopeRaid(e.raidId) ? rosterCandByFamily : charCandByFamily;
                            target.set(fam, { id: e.raidId, general: e.generalGold, bound: e.boundGold, isCleared: true });
                        }

                        // 2) 자격 가능 레이드 — scope 별로 이미 분리됨.
                        const charQualified = getAllQualifiedRaids(c);
                        for (const id of charQualified) {
                            const fam = getRaidFamily(id);
                            if (charCandByFamily.has(fam)) continue;
                            const meta = RAID_META[id];
                            charCandByFamily.set(fam, { id, general: meta.generalGold, bound: meta.boundGold, isCleared: false });
                        }
                        const rosterQualified = getRosterRaidsForChar(c, rosterRaidState);
                        for (const id of rosterQualified) {
                            const fam = getRaidFamily(id);
                            if (rosterCandByFamily.has(fam)) continue;
                            const meta = RAID_META[id];
                            rosterCandByFamily.set(fam, { id, general: meta.generalGold, bound: meta.boundGold, isCleared: false });
                        }

                        // 3) 캐릭 스코프 top3 + 원정대 스코프 전부.
                        // split 레이드(일반+귀속 동시 지급)는 receiveBoundGold 무관하게 항상 귀속 포함.
                        // ignoreBoundGold 는 순수 귀속만인 레이드(지평의 성당 등)에만 적용.
                        const toYield = (cand: Cand) => {
                            const isSplit = cand.general > 0 && cand.bound > 0;
                            return { ...cand, effective: cand.general + (isSplit || !ignoreBoundGold ? cand.bound : 0) };
                        };

                        const charTop3Yields = Array.from(charCandByFamily.values())
                            .map(toYield).filter(y => y.effective > 0)
                            .sort((a, b) => b.effective - a.effective).slice(0, 3);

                        const rosterYields = Array.from(rosterCandByFamily.values())
                            .map(toYield).filter(y => y.effective > 0);

                        const activeYields = [...charTop3Yields, ...rosterYields];
                        const activeIds = new Set(activeYields.map(y => y.id));

                        const raidsForChar = RAID_ORDER_FOR_PROGRESS.filter(id => activeIds.has(id));

                        // 이 캐릭의 주간 골드 — 전체 합(최대) 과 클리어된 것만 합(획득).
                        let charTotalGeneral = 0, charTotalBound = 0;
                        let charCollectedGeneral = 0, charCollectedBound = 0;
                        for (const y of activeYields) {
                            const isSplit = y.general > 0 && y.bound > 0;
                            charTotalGeneral += y.general;
                            if (!ignoreBoundGold || isSplit) charTotalBound += y.bound;
                            if (y.isCleared) {
                                charCollectedGeneral += y.general;
                                if (!ignoreBoundGold || isSplit) charCollectedBound += y.bound;
                            }
                        }
                        userTotalGeneral += charTotalGeneral;
                        userTotalBound += charTotalBound;
                        userCollectedGeneral += charCollectedGeneral;
                        userCollectedBound += charCollectedBound;

                        return {
                            c, isSup, isMain, raidsForChar, activeIds,
                            charTotalGeneral, charTotalBound, charCollectedGeneral, charCollectedBound,
                            raidYieldById: new Map(activeYields.map(y => [y.id, y])),
                            ignoreBoundGold,
                        };
                    });

                    const totalPossibleGold = userTotalGeneral + userTotalBound;
                    const totalCollectedGold = userCollectedGeneral + userCollectedBound;
                    const generalPercent = totalPossibleGold > 0 ? (userCollectedGeneral / totalPossibleGold) * 100 : 0;
                    const boundPercent = totalPossibleGold > 0 ? (userCollectedBound / totalPossibleGold) * 100 : 0;
                    const totalPercent = totalPossibleGold > 0 ? (totalCollectedGold / totalPossibleGold) * 100 : 0;

                    const userAccGold = accumulatedGold?.[discordName] || { general: 0, bound: 0 };
                    const displayGeneral = Math.max(0, userAccGold.general + userCollectedGeneral);
                    const displayBound = Math.max(0, userAccGold.bound + userCollectedBound);
                    const totalAccGold = displayGeneral + displayBound;

                    return (
                        <div key={discordName} className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-all hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/80">

                            <div className="flex flex-col gap-3">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="flex items-start gap-3">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                                            <User size={20} />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{discordName}</span>
                                                {onEditRoster && (
                                                    <button
                                                        onClick={() => onEditRoster(discordName)}
                                                        className="p-1 rounded text-zinc-400 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-400 transition-colors"
                                                        title={`${discordName}님의 원정대 관리`}
                                                    >
                                                        <UserCog size={15} />
                                                    </button>
                                                )}
                                                {onRefreshUser && (
                                                    <button
                                                        onClick={async () => {
                                                            if (refreshingUser) return;
                                                            setRefreshingUser(discordName);
                                                            await onRefreshUser(discordName, chars);
                                                            setRefreshingUser(null);
                                                        }}
                                                        disabled={refreshingUser === discordName}
                                                        className="p-1 rounded text-zinc-400 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-400 transition-colors disabled:opacity-50"
                                                        title={`${discordName}님의 원정대 정보 업데이트`}
                                                    >
                                                        <RefreshCw size={15} className={refreshingUser === discordName ? "animate-spin" : ""} />
                                                    </button>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
                                                <span className="text-zinc-500 dark:text-zinc-400">
                                                    이번주 <span className="text-zinc-800 dark:text-zinc-200">{totalCollectedGold.toLocaleString()}G</span> / {totalPossibleGold.toLocaleString()}G
                                                </span>
                                                <div className="h-3 w-px bg-zinc-300 dark:bg-zinc-700"></div>
                                                <span className="text-zinc-500 dark:text-zinc-400">
                                                    일반 <span className="text-amber-600 dark:text-amber-400">{userCollectedGeneral.toLocaleString()}G</span> / {userTotalGeneral.toLocaleString()}G
                                                </span>
                                                <span className="text-zinc-500 dark:text-zinc-400">
                                                    귀속 <span className="text-orange-600 dark:text-orange-400">{userCollectedBound.toLocaleString()}G</span> / {userTotalBound.toLocaleString()}G
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-1.5 flex flex-wrap items-center gap-2.5 lg:justify-end">
                                        <div className="flex flex-wrap items-center gap-2 text-[12px] sm:text-[13px]">
                                            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded text-zinc-700 bg-zinc-50 dark:text-zinc-300 dark:bg-zinc-900/30 font-bold">
                                                <Coins size={12} />
                                                전체 누적 {totalAccGold.toLocaleString()}G
                                            </div>

                                            <div className="flex items-center gap-1.5 font-medium text-zinc-500 dark:text-zinc-400">
                                                <span>
                                                    일반 <span className="text-amber-600 dark:text-amber-400 font-bold">{displayGeneral.toLocaleString()}G</span>
                                                </span>
                                                <span className="w-px h-2.5 bg-zinc-300 dark:bg-zinc-700"></span>
                                                <span>
                                                    귀속 <span className="text-orange-600 dark:text-orange-400 font-bold">{displayBound.toLocaleString()}G</span>
                                                </span>
                                            </div>
                                        </div>

                                        {onResetAccumulatedGold && (
                                            <button
                                                onClick={() => onResetAccumulatedGold(discordName, userCollectedGeneral, userCollectedBound)}
                                                className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[12px] font-bold text-zinc-400 transition-all hover:bg-rose-50 hover:text-rose-500 dark:bg-zinc-700 dark:hover:bg-rose-900/20 sm:text-[13px]"
                                                title="누적 골드 초기화"
                                            >
                                                초기화
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="mt-1 flex items-center gap-2 sm:gap-3">
                                    <div className="flex flex-1 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                                        <div
                                            className="bg-amber-400 dark:bg-amber-500 transition-all duration-500 ease-out"
                                            style={{ width: `${generalPercent}%` }}
                                        />
                                        <div
                                            className="bg-orange-400 dark:bg-orange-500 transition-all duration-500 ease-out"
                                            style={{ width: `${boundPercent}%` }}
                                        />
                                    </div>
                                    <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 min-w-[2.5rem] text-right">
                                        {Math.round(totalPercent)}%
                                    </span>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                                {charDataList.map(({ c, isSup, isMain, raidsForChar, activeIds, charTotalGeneral, charTotalBound, charCollectedGeneral, charCollectedBound, raidYieldById, ignoreBoundGold }) => {
                                    const isExcluded = c.isParticipating === false;

                                    return (
                                        <div
                                            key={c.id}
                                            className="group flex h-full flex-col gap-3 rounded-xl bg-zinc-50/50 p-4 shadow-sm ring-1 ring-zinc-900/5 transition-all hover:shadow-md dark:bg-zinc-950/50 dark:ring-zinc-800"
                                        >
                                            <div className="flex flex-col gap-3">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${isSup ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-white shadow-sm ring-1 ring-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:ring-zinc-700 dark:text-zinc-400'}`}>
                                                            {isSup ? <Shield size={18} /> : <Swords size={18} />}
                                                        </div>
                                                        <div className='flex flex-col'>
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <span className="text-[15px] font-bold text-zinc-800 dark:text-zinc-100">{c.jobCode}</span>
                                                                {isMain && <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[9px] font-bold text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400">본캐</span>}
                                                                {isExcluded && <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[9px] font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">배정 제외</span>}
                                                                {hasMultipleRosters && c.rosterLabel && (
                                                                    <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">{c.rosterLabel}</span>
                                                                )}
                                                            </div>
                                                            {c.lostArkName && (
                                                                <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 truncate">
                                                                    {c.lostArkName}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center">
                                                        <div className="flex flex-col items-end">
                                                            <div className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Lv.{c.itemLevel}</div>
                                                            <div className="text-[11px] font-medium text-zinc-400">CP {c.combatPower.toLocaleString()}</div>
                                                        </div>
                                                        {c.lostArkName && (
                                                            <button
                                                                onClick={async () => {
                                                                    if (onRefreshCharacter && !refreshingId) {
                                                                        const isConfirmed = await confirm(
                                                                            `${c.lostArkName}의 정보를 업데이트하시겠습니까?\n\n` +
                                                                            `※ 안내: 전체 업데이트와 달리, 캐릭터 정보 업데이트는 현재 전투력이 이전보다 낮아진 경우(의도적인 스펙 하락)에도 그대로 반영됩니다.`,
                                                                            '캐릭터 정보 업데이트'
                                                                        );
                                                                        if (!isConfirmed) return;

                                                                        setRefreshingId(c.id);
                                                                        await onRefreshCharacter(c);
                                                                        setRefreshingId(null);
                                                                    }
                                                                }}
                                                                disabled={refreshingId === c.id}
                                                                className="p-1 ml-2 rounded text-zinc-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-all disabled:opacity-50"
                                                                title={`${c.lostArkName} 정보 업데이트`}
                                                            >
                                                                <RefreshCw size={13} className={refreshingId === c.id ? "animate-spin" : ""} />
                                                            </button>
                                                        )}
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
                                                    <span className="text-xs text-zinc-400 text-center py-2">잔여 레이드가 없습니다.</span>
                                                ) : (
                                                    raidsForChar.map((raidId) => {
                                                        const state = getState(raidId, c.id);
                                                        const meta = RAID_META[raidId];
                                                        const isTop3 = activeIds.has(raidId);
                                                        const isDone = state === 'DONE';
                                                        const raidLabel = meta.label;

                                                        // 클리어된 것은 ledger 스냅샷, 아닌 것은 현재 meta 골드.
                                                        const yieldData = raidYieldById.get(raidId);
                                                        const displayGeneral = yieldData?.general ?? meta.generalGold;
                                                        const rawBound = yieldData?.bound ?? meta.boundGold;
                                                        const isSplitRaid = displayGeneral > 0 && rawBound > 0;
                                                        const displayBound = (isSplitRaid || !ignoreBoundGold) ? rawBound : 0;

                                                        // 분할 골드 레이드는 "일반 + 귀속", 단일은 "일반" 또는 "귀속 X".
                                                        const goldText =
                                                            displayGeneral > 0 && displayBound > 0
                                                                ? `${displayGeneral.toLocaleString()}G + 귀속 ${displayBound.toLocaleString()}G`
                                                                : displayGeneral > 0
                                                                    ? `${displayGeneral.toLocaleString()}G`
                                                                    : `귀속 ${displayBound.toLocaleString()}G`;

                                                        return (
                                                            <label
                                                                key={raidId}
                                                                className={`flex items-center justify-between rounded-lg border px-2.5 py-2 transition-all ${isDone
                                                                    ? 'bg-zinc-100/50 border-transparent opacity-60 cursor-default dark:bg-zinc-900/30 dark:border-transparent'
                                                                    : 'bg-white border-zinc-200 cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/50 dark:bg-zinc-900 dark:border-zinc-700 dark:hover:border-indigo-500/50 dark:hover:bg-indigo-900/30 shadow-sm'
                                                                    }`}
                                                            >
                                                                <div className="flex items-center gap-2.5">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isDone}
                                                                        onChange={() => {
                                                                            onMarkRaidComplete?.(raidId, c.id, isDone);
                                                                            // ✨ Toast 알림 추가
                                                                            const charName = c.lostArkName || c.jobCode;
                                                                            if (!isDone) {
                                                                                toast.success(`${charName} 캐릭터의 ${raidLabel} 레이드 완료 처리했습니다.`);
                                                                            } else {
                                                                                toast.success(`${charName} 캐릭터의 ${raidLabel} 레이드 완료를 취소했습니다.`);
                                                                            }
                                                                        }}
                                                                        className="h-3.5 w-3.5 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer dark:border-zinc-600 dark:bg-zinc-800"
                                                                    />
                                                                    <span className={`text-xs font-bold transition-colors ${isDone ? 'text-zinc-400 line-through dark:text-zinc-600' : 'text-zinc-700 dark:text-zinc-200'}`}>
                                                                        {raidLabel}
                                                                    </span>
                                                                </div>

                                                                <div className="flex items-center gap-1">
                                                                    <span className={`text-[11px] font-bold ${isTop3 ? (isDone ? 'text-zinc-400 dark:text-zinc-500' : 'text-amber-600 dark:text-amber-400') : 'text-zinc-500 dark:text-zinc-500 opacity-50 line-through'}`}>
                                                                        {goldText}
                                                                    </span>
                                                                    {!isTop3 && (
                                                                        <span className="text-[10px] text-rose-400 dark:text-rose-500 font-bold leading-none">
                                                                            (제외)
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </label>
                                                        );
                                                    })
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
            
            <ConfirmModal />
        </div>
    );
}

