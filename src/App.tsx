import React, { useEffect, useMemo, useState } from 'react';
import type { Character, RaidId, RaidExclusionMap, RaidSettingsMap, RaidSwap } from './types';
import { GuestAddModal } from './components/GuestAddModal'; 
import { RAID_META } from './constants'; 
import { buildRaidCandidatesMap, buildRaidSchedule } from './raidLogic';
import { CharacterFormList } from './components/CharacterFormList';
import { RaidScheduleView } from './components/RaidScheduleView';
import { RaidSequenceView } from './components/RaidSequenceView';
import { UserRaidProgressPanel, RAID_ORDER_FOR_PROGRESS, getExpectedRaids } from './components/UserRaidProgressPanel';
import { fetchCharacters, saveCharacters, fetchRaidSettings, setRaidSetting, fetchSwaps, addSwap, resetSwaps, fetchRaidExclusions, toggleCharacterOnRaid, excludeCharactersOnRaid, resetRaidExclusions, fetchAccumulatedGold, updateAccumulatedGoldMulti, resetAccumulatedGold, type AccumulatedGoldMap } from './api/firebaseApi';
import { syncCharactersWithLostArkAPI, fetchProfile } from './api/lostArkApi';
import { Modal } from './components/Modal';
import { LadderGame } from './components/LadderGame';
import { RouletteGame } from './components/RouletteGame';
import { PinballGame } from './components/PinballGame';
import { AuctionCalculatorModal } from './components/AuctionCalculatorModal';
import { GatheringModal } from './components/GatheringModal'; 
import { Swords, Sun, Moon, UserCog, LayoutDashboard, ClipboardList, ChartGantt, Menu, X, Users, ChevronDown, Orbit, Megaphone } from 'lucide-react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';

// ✨ Hook 추가
import { useConfirm } from './hooks/useConfirm';
import { toast } from 'sonner';

type Theme = 'light' | 'dark';
type BalanceMode = 'overall' | 'role' | 'speed';

interface Squad { discordName: string; characters: Character[]; }

const THEME_KEY = 'raidTheme_v1';
const USER_FILTER_KEY = 'raid_user_filter_v1';

// --- 주간 정산 시 사용될 골드 계산 헬퍼 함수 ---
function calculateGoldDelta(raidId: RaidId, charId: string, allChars: Character[]): { g: number, b: number } {
    const c = allChars.find(x => x.id === charId);
    if (!c) return { g: 0, b: 0 };
    
    const userChars = allChars.filter(x => x.discordName === c.discordName);
    const mainChar = userChars.reduce((max, curr) => curr.itemLevel > max.itemLevel ? curr : max, userChars[0]);
    const isMain = c.id === mainChar.id;

    const expectedIds = getExpectedRaids(c);
    const raidsForChar = RAID_ORDER_FOR_PROGRESS.filter(id => expectedIds.includes(id));
    
    let ignoreBoundGold = false;
    if (c.receiveBoundGold !== undefined) {
        ignoreBoundGold = !c.receiveBoundGold;
    } else {
        const option = c.goldOption || 'ALL_MAX';
        if (option === 'GENERAL_MAX') ignoreBoundGold = true;
        else if (option === 'MAIN_ALL_ALT_GENERAL' && !isMain) ignoreBoundGold = true;
    }

    const raidYields = raidsForChar.map(id => {
        const meta = RAID_META[id];
        const isAct2Single = id.startsWith('ACT2_') && c.singleRaids?.includes('ACT2_NORMAL');
        const isAct3Single = id.startsWith('ACT3_') && c.singleRaids?.includes('ACT3_NORMAL');
        const isSingle = isAct2Single || isAct3Single;

        let effectiveGold = meta.gold;
        if (isSingle) {
            const normalMeta = id.startsWith('ACT2_') ? RAID_META['ACT2_NORMAL'] : RAID_META['ACT3_NORMAL'];
            effectiveGold = (normalMeta.gold / 2) + (ignoreBoundGold ? 0 : normalMeta.gold / 2);
        } else if (ignoreBoundGold && meta.goldType === 'BOUND') {
            effectiveGold = -1;
        }
        return { id, ...meta, effectiveGold, isSingle };
    }).sort((a, b) => b.effectiveGold - a.effectiveGold);
    
    const top3Yields = raidYields.filter(y => y.effectiveGold > 0).slice(0, 3);
    const targetYield = top3Yields.find(y => y.id === raidId);
    
    if (!targetYield) return { g: 0, b: 0 };
    
    let g = 0; let b = 0;
    if (targetYield.isSingle) {
        const normalMeta = targetYield.id.startsWith('ACT2_') ? RAID_META['ACT2_NORMAL'] : RAID_META['ACT3_NORMAL'];
        g = normalMeta.gold / 2;
        b = normalMeta.gold / 2;
    } else {
        if (targetYield.goldType === 'GENERAL') g = targetYield.gold;
        else b = targetYield.gold;
    }
    return { g, b };
}

const App: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();

    // ✨ Hook 초기화
    const { confirm, ConfirmModal } = useConfirm();

    // ✨ 전체 화면 오버레이용 상태 추가
    const [isUpdating, setIsUpdating] = useState(false);

    const [allCharacters, setAllCharacters] = useState<Character[]>([]);
    const [localSquad, setLocalSquad] = useState<Squad>({ discordName: '', characters: [] });

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isLadderModalOpen, setIsLadderModalOpen] = useState(false);
    const [isRouletteModalOpen, setIsRouletteModalOpen] = useState(false);
    const [isPinballModalOpen, setIsPinballModalOpen] = useState(false);
    const [isCalcOpen, setIsCalcOpen] = useState(false);
    const [isGatheringModalOpen, setIsGatheringModalOpen] = useState(false); 

    const [raidExclusions, setRaidExclusions] = useState<RaidExclusionMap>({});
    const [loadingExclusions, setLoadingExclusions] = useState(false);

    const [raidSettings, setRaidSettings] = useState<RaidSettingsMap>({});
    const [loadingRaidSettings, setLoadingRaidSettings] = useState(false);

    const [raidSwaps, setRaidSwaps] = useState<RaidSwap[]>([]);
    const [isSwapping, setIsSwapping] = useState(false);
    const [balanceMode, _setBalanceMode] = useState<BalanceMode>('speed');

    const [raidGuests, setRaidGuests] = useState<Partial<Record<RaidId, Character[]>>>({});
    const [guestModalData, setGuestModalData] = useState<{ isOpen: boolean; raidId: RaidId | null }>({
        isOpen: false, raidId: null,
    });

    const [accumulatedGold, setAccumulatedGold] = useState<AccumulatedGoldMap>({});

    const [theme, setTheme] = useState<Theme>(() => {
        if (typeof window === 'undefined') return 'light';
        const stored = window.localStorage.getItem(THEME_KEY) as Theme | null;
        if (stored === 'light' || stored === 'dark') return stored;
        return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    });

    useEffect(() => {
        if (typeof document === 'undefined') return;
        const root = document.documentElement;
        if (theme === 'dark') root.classList.add('dark');
        else root.classList.remove('dark');
        window.localStorage.setItem(THEME_KEY, theme);
    }, [theme]);

    const refreshAllCharacters = async () => {
        try {
            setLoading(true);
            const list = await fetchCharacters();
            setAllCharacters(list);
            // 초기 진입 시 반복되는 성공 토스트 제거
        } catch (e: any) {
            console.error(e);
            toast.error(`데이터 불러오기에 실패했습니다.`);
        } finally {
            setLoading(false);
        }
    };

    const refreshExclusions = async () => {
        try { setLoadingExclusions(true); const ex = await fetchRaidExclusions(); setRaidExclusions(ex); } 
        finally { setLoadingExclusions(false); }
    };

    const refreshRaidSettings = async () => {
        try { setLoadingRaidSettings(true); const rs = await fetchRaidSettings(); setRaidSettings(rs); } 
        finally { setLoadingRaidSettings(false); }
    };

    const refreshSwaps = async () => {
        try { const s = await fetchSwaps(); setRaidSwaps(s); } catch(e) {}
    };

    const refreshAccumulatedGold = async () => {
        try { const data = await fetchAccumulatedGold(); setAccumulatedGold(data); } catch(e) {}
    };

    useEffect(() => {
        refreshAllCharacters().catch(console.error);
        refreshExclusions().catch(console.error);
        refreshRaidSettings().catch(console.error);
        refreshSwaps().catch(console.error);
        refreshAccumulatedGold().catch(console.error); 
    }, []);

    const effectiveCharacters = useMemo(() => {
        if (!localSquad.discordName) return allCharacters;
        const others = allCharacters.filter((c) => c.discordName !== localSquad.discordName);
        return [...others, ...localSquad.characters];
    }, [allCharacters, localSquad]);

    const allUserNames = useMemo(() => {
        return Array.from(new Set(effectiveCharacters.map((c) => c.discordName))).sort();
    }, [effectiveCharacters]);

    const inactiveUsers = useMemo(() => {
        const inactive = new Set<string>();
        allUserNames.forEach(name => {
            const userChars = effectiveCharacters.filter(c => c.discordName === name);
            if (userChars.length > 0 && userChars.every(c => c.isParticipating === false)) {
                inactive.add(name);
            }
        });
        return inactive;
    }, [effectiveCharacters, allUserNames]);

    const schedulingCharacters = useMemo(() => {
        return effectiveCharacters.filter((c) => !inactiveUsers.has(c.discordName));
    }, [effectiveCharacters, inactiveUsers]);

    const schedule = useMemo(
        () => buildRaidSchedule(schedulingCharacters, raidExclusions, balanceMode, raidSettings, raidSwaps, raidGuests),
        [schedulingCharacters, raidExclusions, balanceMode, raidSettings, raidSwaps, raidGuests],
    );

    const raidCandidates = useMemo(
        () => buildRaidCandidatesMap(schedulingCharacters, raidExclusions, raidSettings),
        [schedulingCharacters, raidExclusions, raidSettings],
    );

    const [selectedUserFilter, setSelectedUserFilter] = useState<string>(() => {
        if (typeof window === 'undefined') return 'ALL';
        return window.localStorage.getItem(USER_FILTER_KEY) || 'ALL';
    });

    useEffect(() => {
        window.localStorage.setItem(USER_FILTER_KEY, selectedUserFilter);
    }, [selectedUserFilter]);

    useEffect(() => {
        if (selectedUserFilter !== 'ALL' && allUserNames.length > 0 && !allUserNames.includes(selectedUserFilter)) {
            setSelectedUserFilter('ALL');
        }
    }, [allUserNames, selectedUserFilter]);

    const filteredCharactersForProgress = useMemo(() => {
        if (selectedUserFilter === 'ALL') return effectiveCharacters;
        return effectiveCharacters.filter((c) => c.discordName === selectedUserFilter);
    }, [effectiveCharacters, selectedUserFilter]);

    const handleToggleUserActive = async (name: string) => {
        const isCurrentlyInactive = inactiveUsers.has(name);
        const isNowParticipating = isCurrentlyInactive; 

        const userChars = allCharacters.filter(c => c.discordName === name);
        const updatedUserChars = userChars.map(c => ({
            ...c, isParticipating: isNowParticipating
        }));

        setAllCharacters((prev) => prev.map(c => 
            c.discordName === name ? { ...c, isParticipating: isNowParticipating } : c
        ));

        try { await saveCharacters(name, updatedUserChars); } catch (error) { }
    };

    const handleAddGuest = (raidId: RaidId, role: 'DPS' | 'SUPPORT', jobCode: string) => {
        const shortHash = Math.random().toString(36).substring(2, 6);
        const newGuest: Character = {
            id: `guest_${Date.now()}`, discordName: `게스트_${shortHash}`, jobCode: jobCode, role: role,
            itemLevel: 1800, combatPower: role === 'SUPPORT' ? 4000000 : 5000000, isGuest: true,
        };
        setRaidGuests(prev => ({
            ...prev, [raidId]: [...(prev[raidId] || []), newGuest]
        }));
    };

    const handleRemoveGuest = (raidId: RaidId, guestId: string) => {
        setRaidGuests(prev => ({
            ...prev, [raidId]: (prev[raidId] || []).filter(g => g.id !== guestId)
        }));
    };

    const handleOpenGuestModal = (raidId: RaidId) => { setGuestModalData({ isOpen: true, raidId }); };

    const handleAddGuestAndClose = (role: 'DPS' | 'SUPPORT', jobCode: string) => {
        if (guestModalData.raidId) handleAddGuest(guestModalData.raidId, role, jobCode);
        setGuestModalData({ isOpen: false, raidId: null });
    };

    const handleToggleSupportShortage = async (raidId: RaidId, next: boolean) => {
        try {
            const rs = await setRaidSetting(raidId, next);
            setRaidSettings(rs);
            // 잦은 설정 토글이므로 토스트 생략
        } catch (e) {
            toast.error('설정 저장에 실패했습니다.');
            refreshRaidSettings().catch(console.error);
        }
    };

    const handleSaveAndSync = async (discordName: string, characters: Character[]) => {
        try {
            setSaving(true);
            await saveCharacters(discordName, characters);
            const newSquad: Squad = { discordName, characters };
            setLocalSquad(newSquad);
            await Promise.all([refreshAllCharacters(), refreshSwaps()]);
            setIsModalOpen(false);
            toast.success(`${discordName}님의 정보가 저장되었습니다.`);
        } catch (e: any) {
            console.error(e);
            toast.error(`저장 실패: ${e?.message ?? e}`);
        } finally {
            setSaving(false);
        }
    };

    const handleExcludeCharacterFromRaid = async (raidId: RaidId, charId: string, isCurrentlyExcluded: boolean = false) => {
        try {
            if (isSwapping) return;
            const next = await toggleCharacterOnRaid(raidId, charId, isCurrentlyExcluded);
            setRaidExclusions(next);
            // 단일 체크박스 클릭이므로 토스트 생략
        } catch (e) {
            toast.error('상태 변경에 실패했습니다.');
        }
    };

    const handleExcludeRun = async (raidId: RaidId, charIds: string[]) => {
        try {
            if (isSwapping) return;
            const uniqIds = Array.from(new Set((charIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean)));
            if (uniqIds.length === 0) return;

            const next = await excludeCharactersOnRaid(raidId, uniqIds);
            setRaidExclusions(next);
            toast.success('공격대가 완료 처리되었습니다.');
        } catch (e) {
            toast.error('공격대 완료 처리에 실패했습니다.');
        }
    };

    const handleResetExclusions = async () => {
        const ok = await confirm('모든 레이드 완료 내역을 초기화하시겠습니까?\n\n(이번 주 획득한 골드는 이전 누적 골드에 안전하게 합산되어 이관됩니다.)', '주간 내역 초기화');
        if (!ok) return;

        setIsUpdating(true);
        try {
            const updatesMap: Record<string, { g: number, b: number }> = {};
            
            for (const [raidId, charIds] of Object.entries(raidExclusions)) {
                for (const charId of charIds) {
                    const { g, b } = calculateGoldDelta(raidId as RaidId, charId, effectiveCharacters);
                    const char = effectiveCharacters.find(c => c.id === charId);
                    if (char && (g > 0 || b > 0)) {
                        if (!updatesMap[char.discordName]) updatesMap[char.discordName] = { g: 0, b: 0 };
                        updatesMap[char.discordName].g += g;
                        updatesMap[char.discordName].b += b;
                    }
                }
            }
            
            const updates = Object.entries(updatesMap).map(([discordName, val]) => ({
                discordName, deltaGeneral: val.g, deltaBound: val.b
            }));
            
            if (updates.length > 0) {
                await updateAccumulatedGoldMulti(updates);
            }

            await resetRaidExclusions();
            await resetSwaps();
            
            await Promise.all([refreshExclusions(), refreshSwaps(), refreshAccumulatedGold()]); 
            
            toast.success('모든 내역이 초기화되었습니다.');
        } catch (e) {
            console.error(e);
            toast.error('초기화에 실패했습니다.');
        } finally {
            setIsUpdating(false);
        }
    };

    const handleResetAccumulatedGold = async (discordName: string, offsetGeneral: number, offsetBound: number) => {
        if (await confirm(`[${discordName}]님의 누적 골드를 완전히 초기화하시겠습니까?`, '누적 골드 초기화')) {
            try {
                const nextGold = await resetAccumulatedGold(discordName, offsetGeneral, offsetBound);
                setAccumulatedGold(nextGold);
                toast.success(`${discordName}님의 누적 골드가 초기화되었습니다.`);
            } catch (e) {
                console.error(e);
                toast.error('누적 골드 초기화에 실패했습니다.');
            }
        }
    };

    const handleSwapCharacter = async (raidId: RaidId, charId1: string, charId2: string) => {
        try {
            setIsSwapping(true);
            const nextSwaps = await addSwap(raidId, charId1, charId2);
            setRaidSwaps(nextSwaps);
            toast.success('캐릭터 교체가 완료되었습니다.');
        } catch (e) {
            toast.error('캐릭터 교체에 실패했습니다.');
        } finally {
            setIsSwapping(false);
        }
    };

    const handleRefreshUserCharacters = async (discordName: string, userChars: Character[]) => {
        const ok = await confirm(`${discordName}님의 원정대 정보를 업데이트하시겠습니까?`, '원정대 업데이트');
        if (!ok) return;

        let skippedMessages: string[] = [];
        setIsUpdating(true);
        try {
            const updatedUserChars = await syncCharactersWithLostArkAPI(userChars, saveCharacters, (msg) => {
                skippedMessages.push(msg);
            });
            setAllCharacters(prev => {
                const others = prev.filter(c => c.discordName !== discordName);
                return [...others, ...updatedUserChars];
            });
            toast.success(`${discordName}님의 원정대 정보가 업데이트되었습니다.`); 
        } catch (e: any) {
            console.error(e);
            toast.error(`업데이트 실패: ${e?.message ?? e}`);
        } finally {
            setIsUpdating(false);
        }

        if (skippedMessages.length > 0) {
            await confirm(
                `[전투력 미업데이트 알림]\n\n` +
                `아래 캐릭터들은 현재 전투력이 기존보다 낮아 기존 전투력으로 유지되었습니다.\n\n` +
                `${skippedMessages.join('\n')}\n\n` +
                `의도적으로 전투력을 낮추신 경우, 개인별 현황에서 캐릭터별 새로고침을 진행해 주세요.`,
                '안내'
            );
        }
    };

    const handleRefreshSingleCharacter = async (char: Character) => {
        if (!char.lostArkName) return;

        setIsUpdating(true);
        try {
            const profile = await fetchProfile(char.lostArkName);
            
            if (profile && profile.ItemAvgLevel && profile.CombatPower) {
                const lv = parseFloat(profile.ItemAvgLevel.replace(/,/g, ''));
                const cp = parseFloat(profile.CombatPower.replace(/,/g, ''));

                const nextAllChars = allCharacters.map(c => 
                    c.id === char.id ? { ...c, itemLevel: Math.floor(lv), combatPower: Math.floor(cp) } : c
                );
                setAllCharacters(nextAllChars);

                const userCharsToSave = nextAllChars.filter(c => c.discordName === char.discordName);
                await saveCharacters(char.discordName, userCharsToSave);
                
                toast.success(`${char.lostArkName} 캐릭터의 정보가 업데이트되었습니다.`);
            }
        } catch (e: any) { 
            toast.error('캐릭터 업데이트에 실패했습니다.');
        } finally {
            setIsUpdating(false);
        }
    };

    const handleRefresh = async () => {
        const ok = await confirm('로아 API를 통해 모든 유저의 정보를 업데이트하시겠습니까?', '전체 유저 업데이트');
        if (!ok) return;

        let skippedMessages: string[] = [];
        setIsUpdating(true);
        try {
            setLoading(true);
            let list = await fetchCharacters();
            
            list = await syncCharactersWithLostArkAPI(list, saveCharacters, (msg) => {
                skippedMessages.push(msg);
            });
            
            setAllCharacters(list);
            await Promise.all([refreshExclusions(), refreshRaidSettings(), refreshSwaps()]);
            toast.success('모든 캐릭터의 정보가 업데이트되었습니다.'); 
        } catch (e) {
            toast.error('전체 업데이트 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
            setIsUpdating(false);
        }

        if (skippedMessages.length > 0) {
            await confirm(
                `[전투력 미업데이트 알림]\n\n` +
                `아래 캐릭터들은 현재 전투력이 기존보다 낮아 기존 전투력으로 유지되었습니다.\n\n` +
                `${skippedMessages.join('\n')}\n\n` +
                `의도적으로 전투력을 낮추신 경우, 개인별 현황에서 캐릭터별 새로고침을 진행해 주세요.`,
                '안내'
            );
        }
    };

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isManageMenuOpen, setIsManageMenuOpen] = useState(false);
    const [isToolMenuOpen, setIsToolMenuOpen] = useState(false);
    const [isGameMenuOpen, setIsGameMenuOpen] = useState(true);
    const [isUserFilterOpen, setIsUserFilterOpen] = useState(false);
    const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
    const handleNavClick = (path: string) => {
        navigate(path);
        setIsSidebarOpen(false);
    };
    const isActive = (path: string) => location.pathname === path;

    const currentPageMeta = useMemo(() => {
        if (location.pathname === '/schedule') {
            return { title: '레이드 배정 결과', Icon: ClipboardList };
        }
        if (location.pathname === '/sequence') {
            return { title: '레이드 진행 순서', Icon: ChartGantt };
        }
        return { title: '개인별 진행 현황', Icon: LayoutDashboard };
    }, [location.pathname]);

    const isUserProgressPage = currentPageMeta.title === '개인별 진행 현황';

    const mobileUserFilterLabel =
    selectedUserFilter === 'ALL'
        ? '전체'
        : selectedUserFilter.length > 3
            ? `${selectedUserFilter.slice(0, 3)}…`
            : selectedUserFilter;

    const navButtonClass = (active: boolean) =>
    `flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition-all ${
        active
            ? 'bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-300 dark:ring-indigo-900/40'
            : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
    }`;

    const subMenuButtonClass =
    'rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100';

    return (
        <div className="flex min-h-[100dvh] w-full overflow-hidden bg-zinc-50 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 md:h-screen">
            {/* ✨ 저장 및 업데이트 시 화면 조작을 막는 오버레이 */}
            {(saving || isUpdating) && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-zinc-900/20 backdrop-blur-[2px] touch-none cursor-wait dark:bg-black/40">
                    <div className="flex flex-col items-center gap-4 rounded-2xl bg-white/95 px-8 py-6 shadow-2xl dark:bg-zinc-900/95 border border-zinc-200 dark:border-zinc-800">
                        <div className="h-10 w-10 animate-spin rounded-full border-4 border-zinc-200 border-t-indigo-600 dark:border-zinc-700 dark:border-t-indigo-500" />
                        <p className="text-sm font-bold text-zinc-700 dark:text-zinc-200 text-center whitespace-pre-wrap">
                            데이터를 처리하고 있습니다.
                        </p>
                    </div>
                </div>
            )}

            {isSidebarOpen && (
                <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden" onClick={() => setIsSidebarOpen(false)} />
            )}

            <aside className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-zinc-200 bg-white shadow-xl transition-transform duration-300 dark:border-zinc-800 dark:bg-zinc-900 md:relative md:translate-x-0 md:shadow-none ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="flex h-20 items-center justify-between px-6">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-500/30">
                            <Swords size={22} strokeWidth={2.5} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-medium text-zinc-400">
                                Dintto's Jewel Box
                            </span>
                            <h1 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white">
                                Raid <span className="text-indigo-600 dark:text-indigo-400">Manager</span>
                            </h1>
                        </div>
                    </div>
                    <button onClick={() => setIsSidebarOpen(false)} className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 md:hidden">
                        <X size={20} className="text-zinc-500" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4">
                    <nav className="flex flex-col gap-2">
                        <div className="mb-2 px-2 text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                            운영
                        </div>

                        <button onClick={() => handleNavClick('/')} className={navButtonClass(isActive('/'))}>
                            <LayoutDashboard size={18} /> 개인별 진행 현황
                        </button>

                        <button onClick={() => handleNavClick('/schedule')} className={navButtonClass(isActive('/schedule'))}>
                            <ClipboardList size={18} /> 레이드 배정 결과
                        </button>

                        <button onClick={() => handleNavClick('/sequence')} className={navButtonClass(isActive('/sequence'))}>
                            <ChartGantt size={18} /> 레이드 진행 순서
                        </button>

                        <div className="my-3 h-px bg-zinc-100 dark:bg-zinc-800" />

                        <button
                            onClick={() => setIsGameMenuOpen((prev) => !prev)}
                            className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-bold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                        >
                            <span className="flex items-center gap-3">
                                <Orbit size={18} /> 게임
                            </span>
                            <ChevronDown size={16} className={isGameMenuOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
                        </button>

                        {isGameMenuOpen && (
                            <div className="ml-3 flex flex-col gap-1 border-l border-zinc-200 pl-3 dark:border-zinc-800">
                                <button onClick={() => setIsLadderModalOpen(true)} className={subMenuButtonClass}>경매 사다리 타기</button>
                                <button onClick={() => setIsRouletteModalOpen(true)} className={subMenuButtonClass}>경매 룰렛</button>
                                <button onClick={() => setIsPinballModalOpen(true)} className={subMenuButtonClass}>마블 레이스</button>
                            </div>
                        )}

                        <button
                            onClick={() => setIsManageMenuOpen((prev) => !prev)}
                            className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-bold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                        >
                            <span className="flex items-center gap-3">
                                <UserCog size={18} /> 관리
                            </span>
                            <ChevronDown size={16} className={isManageMenuOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
                        </button>

                        {isManageMenuOpen && (
                            <div className="ml-3 flex flex-col gap-1 border-l border-zinc-200 pl-3 dark:border-zinc-800">
                                <button onClick={() => setIsModalOpen(true)} className={subMenuButtonClass}>
                                    내 원정대 관리
                                </button>
                                <button onClick={handleRefresh} disabled={loading || saving || isSwapping} className={subMenuButtonClass}>
                                    전체 전투력 업데이트
                                </button>
                                <button onClick={handleResetExclusions} disabled={loadingExclusions || isSwapping} className={`${subMenuButtonClass} text-rose-600 dark:text-rose-400`}>
                                    레이드 완료 내역 초기화
                                </button>
                            </div>
                        )}

                        <button
                            onClick={() => setIsToolMenuOpen((prev) => !prev)}
                            className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-bold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                        >
                            <span className="flex items-center gap-3">
                                <Megaphone size={18} /> 도구
                            </span>
                            <ChevronDown size={16} className={isToolMenuOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
                        </button>

                        {isToolMenuOpen && (
                            <div className="ml-3 flex flex-col gap-1 border-l border-zinc-200 pl-3 dark:border-zinc-800">
                                <button onClick={() => setIsGatheringModalOpen(true)} className={subMenuButtonClass}>
                                    레이드 파티 모집
                                </button>
                                <button onClick={() => setIsCalcOpen(true)} className={subMenuButtonClass}>
                                    경매 입찰 계산기
                                </button>
                            </div>
                        )}

                    </nav>
                </div>

                <div className="border-t border-zinc-100 p-4 dark:border-zinc-800">
                    <button onClick={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))} className="flex w-full items-center justify-between rounded-xl bg-zinc-50 px-4 py-3 text-sm font-bold text-zinc-600 transition-colors hover:bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700">
                        <div className="flex items-center gap-3">
                            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
                            <span>{theme === 'light' ? '다크 모드' : '라이트 모드'}</span>
                        </div>
                    </button>
                </div>
            </aside>

            <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <header className="mobile-app-header sticky top-0 z-30 border-b border-zinc-200/80 bg-white/78 px-3 pb-3 pt-[calc(env(safe-area-inset-top)+0.7rem)] shadow-[0_12px_30px_rgba(15,23,42,0.06)] backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-950/82 md:hidden">
                <div className="relative flex items-center justify-between gap-2">
                    <button
                        onClick={toggleSidebar}
                        className="z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-zinc-200/80 bg-white/90 text-zinc-700 shadow-sm transition-colors hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/90 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        aria-label="메뉴 열기"
                    >
                        <Menu size={22} />
                    </button>

                    <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-center gap-2.5">
                        <div className="flex flex-col items-center leading-none gap-0.5">
                            <span className="text-[0.7rem] font-black uppercase tracking-[0.22em] text-zinc-400 dark:text-zinc-500">
                                Raid Manager
                            </span>
                            <span className="max-w-[140px] truncate text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                                {currentPageMeta.title}
                            </span>
                        </div>
                    </div>

                    {isUserProgressPage ? (
                        <button
                            onClick={() => setIsUserFilterOpen(true)}
                            className="z-10 inline-flex h-11 min-w-[56px] max-w-[84px] shrink-0 items-center justify-center gap-1 rounded-2xl border border-zinc-200/80 bg-white/90 px-3 text-xs font-bold text-zinc-700 shadow-sm transition-colors hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/90 dark:text-zinc-200 dark:hover:bg-zinc-800"
                            aria-label="유저 선택 열기"
                            type="button"
                        >
                            <span className="max-w-[40px] truncate">
                                {mobileUserFilterLabel}
                            </span>
                            <ChevronDown size={12} strokeWidth={3} className="shrink-0" />
                        </button>
                    ) : (
                        <div className="h-11 w-11 shrink-0" aria-hidden="true" />
                    )}
                </div>
            </header>

            {isUserProgressPage && isUserFilterOpen && (
                <>
                    <div
                        className="fixed inset-0 z-40 bg-black/30 md:hidden"
                        onClick={() => setIsUserFilterOpen(false)}
                    />

                    <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl border border-zinc-200 bg-white p-4 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 md:hidden">
                        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-zinc-200 dark:bg-zinc-700" />

                        <div className="mb-3 flex items-center justify-between">
                            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                                유저 선택
                            </h3>
                            <button
                                type="button"
                                onClick={() => setIsUserFilterOpen(false)}
                                className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="max-h-[50vh] overflow-y-auto space-y-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
                            <button
                                type="button"
                                onClick={() => {
                                    setSelectedUserFilter('ALL');
                                    setIsUserFilterOpen(false);
                                }}
                                className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-bold transition ${
                                    selectedUserFilter === 'ALL'
                                        ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-900'
                                        : 'bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700'
                                }`}
                            >
                                <span>전체 유저</span>
                            </button>

                            {allUserNames.map((name) => (
                                <button
                                    key={name}
                                    type="button"
                                    onClick={() => {
                                        setSelectedUserFilter(name);
                                        setIsUserFilterOpen(false);
                                    }}
                                    className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-bold transition ${
                                        selectedUserFilter === name
                                            ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-900'
                                            : 'bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700'
                                    }`}
                                >
                                    <span>{name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )}

                <div className="flex-1 overflow-y-auto bg-zinc-50/50 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] dark:bg-zinc-950 sm:p-6 lg:p-8">
                    <div className="mx-auto space-y-6">
                        <Routes>
                            <Route path="/" element={
                                <section className="flex flex-col gap-6">
                                    <div className="hidden flex-col justify-between gap-3 sm:flex-row sm:items-center md:flex">
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                                            <h2 className="flex items-center gap-2 text-xl font-bold text-zinc-900 dark:text-zinc-100">
                                                <LayoutDashboard className="text-indigo-500" />
                                                개인별 진행 현황
                                            </h2>

                                            <div className="relative">
                                                <select value={selectedUserFilter} onChange={(e) => setSelectedUserFilter(e.target.value)} className="w-full cursor-pointer appearance-none rounded-lg border border-zinc-200 bg-white py-2 pl-3 pr-9 text-sm font-bold text-zinc-700 shadow-sm transition-colors hover:border-indigo-300 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 sm:w-auto">
                                                    <option value="ALL">전체 유저</option>
                                                    {allUserNames.map((name) => (
                                                        <option key={name} value={name}>{name}</option>
                                                    ))}
                                                </select>
                                                <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400">
                                                    <ChevronDown size={14} strokeWidth={3} />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap gap-2.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                                            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400 ring-1 ring-amber-400/50" />대기</span>
                                            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-indigo-500 ring-1 ring-indigo-500/50" />배치됨</span>
                                            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-zinc-300 ring-1 ring-zinc-300/50" />완료</span>
                                        </div>
                                    </div>

                                    <UserRaidProgressPanel
                                        characters={filteredCharactersForProgress}
                                        raidCandidates={raidCandidates}
                                        exclusions={raidExclusions}
                                        schedule={schedule}
                                        accumulatedGold={accumulatedGold} 
                                        onMarkRaidComplete={handleExcludeCharacterFromRaid}
                                        onRefreshCharacter={handleRefreshSingleCharacter}
                                        onRefreshUser={handleRefreshUserCharacters}
                                        onResetAccumulatedGold={handleResetAccumulatedGold} 
                                    />
                                </section>
                            } />

                            <Route path="/schedule" element={
                                <section className="flex flex-col gap-6">
                                    <div className="hidden flex-col gap-3 sm:flex-row sm:items-center sm:justify-between md:flex">
                                        <h2 className="flex items-center gap-2 text-xl font-bold text-zinc-900 dark:text-zinc-100">
                                            <ClipboardList className="text-indigo-500" /> 레이드 배정 결과
                                        </h2>
                                    </div>

                                    {effectiveCharacters.length === 0 && !loading ? (
                                        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-zinc-200 bg-white/50 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900/50">
                                            <div className="mb-4 rounded-full bg-zinc-100 p-4 dark:bg-zinc-800">
                                                <Users size={32} className="text-zinc-400" />
                                            </div>
                                            <p className="text-lg font-medium text-zinc-600 dark:text-zinc-300">등록된 캐릭터가 없습니다.</p>
                                            <p className="mt-1 text-sm text-zinc-500">좌측 메뉴의 &quot;내 원정대 관리&quot;에서 캐릭터를 등록해 주세요.</p>
                                        </div>
                                    ) : (
                                        <RaidScheduleView
                                            schedule={schedule}
                                            isLoading={loading}
                                            exclusions={raidExclusions}
                                            onExcludeCharacter={handleExcludeCharacterFromRaid}
                                            balanceMode={balanceMode}
                                            raidSettings={raidSettings}
                                            isRaidSettingsLoading={loadingRaidSettings}
                                            onToggleSupportShortage={handleToggleSupportShortage}
                                            raidCandidates={raidCandidates}
                                            onSwapCharacter={handleSwapCharacter}
                                            onExcludeRun={handleExcludeRun} 
                                            allCharacters={effectiveCharacters}
                                            isSwapping={isSwapping}
                                            allUserNames={allUserNames}
                                            inactiveUsers={inactiveUsers}
                                            onToggleUser={handleToggleUserActive}
                                            onOpenGuestAdd={handleOpenGuestModal}
                                            onRemoveGuest={handleRemoveGuest}
                                        />
                                    )}
                                </section>
                            } />

                            <Route path="/sequence" element={
                                <section className="flex flex-col gap-6">
                                    <div className="hidden flex-col gap-3 sm:flex-row sm:items-center sm:justify-between md:flex">
                                        <h2 className="flex items-center gap-2 text-xl font-bold text-zinc-900 dark:text-zinc-100">
                                            <ChartGantt className="text-indigo-500" /> 레이드 진행 순서
                                        </h2>
                                    </div>

                                    <RaidSequenceView
                                        schedule={schedule}
                                        balanceMode={balanceMode}
                                        onSwapCharacter={handleSwapCharacter}
                                        allCharacters={effectiveCharacters}
                                        onExclusionsUpdated={(next) => setRaidExclusions(next)}
                                        isSwapping={isSwapping}
                                        updatedBy={localSquad.discordName || 'User'}
                                        allUserNames={allUserNames}
                                        inactiveUsers={inactiveUsers}
                                        onToggleUser={handleToggleUserActive}
                                    />
                                </section>
                            } />
                        </Routes>
                    </div>
                </div>

                <Modal open={isModalOpen} title="내 원정대 관리" onClose={() => !saving && setIsModalOpen(false)} maxWidth="max-w-6xl">
                    <CharacterFormList
                        discordName={localSquad.discordName}
                        characters={localSquad.characters}
                        isLoading={saving}
                        onSubmit={handleSaveAndSync}
                        onCancel={() => setIsModalOpen(false)}
                        onLoadByDiscordName={(targetName: string) => { return allCharacters.filter((c) => c.discordName === targetName); }}
                    />
                </Modal>

                <Modal open={isLadderModalOpen} title="경매 아이템 사다리 타기" onClose={() => setIsLadderModalOpen(false)} maxWidth="max-w-5xl">
                    <LadderGame onClose={() => setIsLadderModalOpen(false)} allUserNames={allUserNames} />
                </Modal>

                <Modal open={isRouletteModalOpen} title="경매 아이템 룰렛" onClose={() => setIsRouletteModalOpen(false)} maxWidth="max-w-4xl">
                    <RouletteGame allUserNames={allUserNames} />
                </Modal>

                <Modal open={isPinballModalOpen} title="경매 아이템 마블 레이스" onClose={() => setIsPinballModalOpen(false)} maxWidth="max-w-4xl">
                    <PinballGame onClose={() => setIsPinballModalOpen(false)} allUserNames={allUserNames} />
                </Modal>

                <GuestAddModal
                    isOpen={guestModalData.isOpen}
                    onClose={() => setGuestModalData({ isOpen: false, raidId: null })}
                    onAdd={handleAddGuestAndClose}
                    raidLabel={guestModalData.raidId ? RAID_META[guestModalData.raidId].label : ''}
                />

                <AuctionCalculatorModal isOpen={isCalcOpen} onClose={() => setIsCalcOpen(false)} />

                <GatheringModal isOpen={isGatheringModalOpen} onClose={() => setIsGatheringModalOpen(false)} />
                
                {/* ✨ 최상단 Confirm Modal 마운트 */}
                <ConfirmModal />
            </main>
        </div>
    );
};

export default App;