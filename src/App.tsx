import React, { useEffect, useMemo, useState } from 'react';
import type {
  Character,
  RaidId,
  RaidExclusionMap,
  RaidSettingsMap,
  RaidSwap,
} from './types';
import { GuestAddModal } from './components/GuestAddModal'; 
import { RAID_META } from './constants'; 
import { buildRaidCandidatesMap, buildRaidSchedule } from './raidLogic';
import { CharacterFormList } from './components/CharacterFormList';
import { RaidScheduleView } from './components/RaidScheduleView';
import { RaidSequenceView } from './components/RaidSequenceView';

// 누적 골드 정산 헬퍼 가져오기
import { UserRaidProgressPanel, RAID_ORDER_FOR_PROGRESS, getExpectedRaids } from './components/UserRaidProgressPanel';

import { 
  fetchCharacters, saveCharacters, fetchRaidSettings, setRaidSetting,
  fetchSwaps, addSwap, resetSwaps,
  fetchRaidExclusions, toggleCharacterOnRaid, excludeCharactersOnRaid, resetRaidExclusions,
  // 신규 누적 골드 API 호출 함수들
  fetchAccumulatedGold, updateAccumulatedGoldMulti, resetAccumulatedGold, type AccumulatedGoldMap
} from './api/firebaseApi';
import { syncCharactersWithLostArkAPI, fetchProfile } from './api/lostArkApi';
import { Modal } from './components/Modal';
import { LadderGame } from './components/LadderGame';
import { RouletteGame } from './components/RouletteGame';
import { PinballGame } from './components/PinballGame';
import { AuctionCalculatorModal } from './components/AuctionCalculatorModal';
import { GatheringModal } from './components/GatheringModal'; 
import {
  Swords, Sun, Moon, UserCog, LayoutDashboard, 
  ClipboardList, ChartGantt, Menu, X, Users, ChevronDown,  
  Orbit, Megaphone 
} from 'lucide-react';

import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';

type Theme = 'light' | 'dark';
type BalanceMode = 'overall' | 'role' | 'speed';

interface Squad {
  discordName: string;
  characters: Character[];
}

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

  const [allCharacters, setAllCharacters] = useState<Character[]>([]);
  const [localSquad, setLocalSquad] = useState<Squad>({ discordName: '', characters: [] });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

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
      setStatus('데이터 동기화 중...');
      const list = await fetchCharacters();
      setAllCharacters(list);
      const uniqueUsers = new Set(list.map((c) => c.discordName)).size;
      const totalChars = list.length;
      setStatus(`유저 ${uniqueUsers}명 / 캐릭터 ${totalChars}개 로드 완료`);
    } catch (e: any) {
      console.error(e);
      setStatus(`로드 실패: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  };

  const refreshExclusions = async () => {
    try {
      setLoadingExclusions(true);
      const ex = await fetchRaidExclusions();
      setRaidExclusions(ex);
    } finally {
      setLoadingExclusions(false);
    }
  };

  const refreshRaidSettings = async () => {
    try {
      setLoadingRaidSettings(true);
      const rs = await fetchRaidSettings();
      setRaidSettings(rs);
    } finally {
      setLoadingRaidSettings(false);
    }
  };

  const refreshSwaps = async () => {
    try {
      const s = await fetchSwaps();
      setRaidSwaps(s);
    } catch(e) {}
  };

  const refreshAccumulatedGold = async () => {
    try {
      const data = await fetchAccumulatedGold();
      setAccumulatedGold(data);
    } catch(e) {}
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
      setStatus('랏폿 설정 저장 중...');
      const rs = await setRaidSetting(raidId, next);
      setRaidSettings(rs);
      setStatus('랏폿 설정이 저장되었습니다.');
    } catch (e) {
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
      setStatus(`${discordName}님의 정보가 저장되었습니다.`);
    } catch (e: any) {
      console.error(e);
      alert(`저장 실패: ${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  };

  // ✅ 누적 골드 실시간 화면 합산을 위해, 개별 클릭 시 DB 호출 없이 UI 상태만 토글
  const handleExcludeCharacterFromRaid = async (raidId: RaidId, charId: string, isCurrentlyExcluded: boolean = false) => {
    try {
      if (isSwapping) return;
      setStatus(isCurrentlyExcluded ? '레이드 완료 취소 중...' : '레이드 제외 처리 중...');
      const next = await toggleCharacterOnRaid(raidId, charId, isCurrentlyExcluded);
      setRaidExclusions(next);
      setStatus(isCurrentlyExcluded ? '완료가 취소되었습니다.' : '레이드가 완료 처리되었습니다.');
    } catch (e) { }
  };

  // ✅ 공격대 일괄 완료 처리 시에도 상태만 토글
  const handleExcludeRun = async (raidId: RaidId, charIds: string[]) => {
    try {
      if (isSwapping) return;
      const uniqIds = Array.from(new Set((charIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean)));
      if (uniqIds.length === 0) return;

      setStatus('공격대 완료 처리 중...');
      const next = await excludeCharactersOnRaid(raidId, uniqIds);
      setRaidExclusions(next);
      setStatus('공격대가 완료 처리되었습니다.');
    } catch (e) { }
  };

  // ✅ 주간 초기화 실행 시: 현재 주간에 완료된(체크된) 골드를 모아서 누적 DB로 이관!
  const handleResetExclusions = async () => {
    const ok = window.confirm('모든 레이드 완료 내역을 초기화하시겠습니까?\n\n(이번 주 획득한 골드는 이전 누적 골드에 안전하게 합산되어 이관됩니다.)');
    if (!ok) return;

    try {
      setStatus('내역 초기화 및 누적 골드 이관 중...');
      
      const updatesMap: Record<string, { g: number, b: number }> = {};
      
      // 현재 exclusions에 저장된 이번 주 완료 내역을 바탕으로 유저별 골드 델타 계산
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
      
      // 계산된 이번주 총 골드를 DB 업데이트 포맷으로 변경
      const updates = Object.entries(updatesMap).map(([discordName, val]) => ({
          discordName, deltaGeneral: val.g, deltaBound: val.b
      }));
      
      // 누적 골드 DB에 합산 (이관)
      if (updates.length > 0) {
          await updateAccumulatedGoldMulti(updates);
      }

      // 완료 내역 리셋
      await resetRaidExclusions();
      await resetSwaps();
      
      // 최신 상태 모두 갱신
      await Promise.all([refreshExclusions(), refreshSwaps(), refreshAccumulatedGold()]); 
      
      setStatus('모든 내역이 초기화되고 골드가 이관되었습니다.');
    } catch (e) {
      console.error(e);
      alert('초기화 실패');
    }
  };

  // ✅ 수동 누적 골드 초기화 핸들러 (화면상의 현재 획득골드만큼 오프셋을 줘서 0으로 만듦)
  const handleResetAccumulatedGold = async (discordName: string, offsetGeneral: number, offsetBound: number) => {
    if (window.confirm(`[${discordName}]님의 누적 골드를 완전히 초기화하시겠습니까?`)) {
      try {
        setStatus(`${discordName}님의 누적 골드 초기화 중...`);
        const nextGold = await resetAccumulatedGold(discordName, offsetGeneral, offsetBound);
        setAccumulatedGold(nextGold);
        setStatus(`${discordName}님의 누적 골드가 초기화되었습니다.`);
      } catch (e) {
        console.error(e);
        alert('누적 골드 초기화에 실패했습니다.');
      }
    }
  };

  const handleSwapCharacter = async (raidId: RaidId, charId1: string, charId2: string) => {
    try {
      setIsSwapping(true);
      setStatus('캐릭터 교체 중...');
      const nextSwaps = await addSwap(raidId, charId1, charId2);
      setRaidSwaps(nextSwaps);
      setStatus('캐릭터 교체가 완료되었습니다.');
    } catch (e) {
    } finally {
      setIsSwapping(false);
    }
  };

  const handleRefreshUserCharacters = async (discordName: string, userChars: Character[]) => {
    const ok = window.confirm(`${discordName}님의 원정대 정보를 업데이트 하시겠습니까?`);
    if (!ok) return;

    try {
      setStatus(`${discordName}님의 원정대 정보 업데이트 중...`);
      const skippedMessages: string[] = [];
      const updatedUserChars = await syncCharactersWithLostArkAPI(userChars, saveCharacters, (msg) => {
        skippedMessages.push(msg);
      });
      setAllCharacters(prev => {
        const others = prev.filter(c => c.discordName !== discordName);
        return [...others, ...updatedUserChars];
      });
      setStatus(`${discordName}님의 원정대 정보다 업데이트 되었습니다.`);

      if (skippedMessages.length > 0) {
        alert(
          `[전투력 미갱신 알림]\n\n` +
          `아래 캐릭터들은 현재 전투력이 기존보다 낮아 기존 전투력으로 유지되었습니다.\n\n` +
          `${skippedMessages.join('\n')}\n\n` +
          `의도적으로 전투력을 낮추신 경우, 개인별 현황에서 캐릭터별 새로고침을 진행해주세요.`
        );
      }
    } catch (e: any) {
      console.error(e);
      alert(`갱신 실패: ${e?.message ?? e}`);
    }
  };

  const handleRefreshSingleCharacter = async (char: Character) => {
    if (!char.lostArkName) return;
    try {
      setStatus(`${char.discordName}님의 ${char.lostArkName} 갱신 중...`);
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
        
        setStatus(`${char.lostArkName} 갱신 완료`);
      }
    } catch (e: any) { }
  };

  const handleRefresh = async () => {
    const ok = window.confirm('로아 API를 통해 모든 유저의 정보를 업데이트 하시겠습니까?');
    if (!ok) return;

    try {
      setLoading(true);
      setStatus('전체 유저 정보 업데이트 중... (페이지를 닫지 마세요)');
      
      let list = await fetchCharacters();
      const skippedMessages: string[] = [];
      
      list = await syncCharactersWithLostArkAPI(list, saveCharacters, (msg) => {
        skippedMessages.push(msg);
      });
      
      setAllCharacters(list);
      await Promise.all([refreshExclusions(), refreshRaidSettings(), refreshSwaps()]);
      setStatus('모든 캐릭터의 정보가 갱신되었습니다.');

      if (skippedMessages.length > 0) {
        alert(
          `[전투력 미갱신 알림]\n\n` +
          `아래 캐릭터들은 현재 전투력이 기존보다 낮아 기존 전투력으로 유지되었습니다.\n\n` +
          `${skippedMessages.join('\n')}\n\n` +
          `의도적으로 전투력을 낮추신 경우, 개인별 현황에서 캐릭터별 새로고침을 진행해주세요.`
        );
      }

    } catch (e) {
    } finally {
      setLoading(false);
    }
  };

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isManageMenuOpen, setIsManageMenuOpen] = useState(false);
  const [isToolMenuOpen, setIsToolMenuOpen] = useState(false);
  const [isGameMenuOpen, setIsGameMenuOpen] = useState(false);
  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
  const handleNavClick = (path: string) => {
    navigate(path);
    setIsSidebarOpen(false);
  };
  const isActive = (path: string) => location.pathname === path;

  const navButtonClass = (active: boolean) =>
  `flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition-all ${
    active
      ? 'bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-300 dark:ring-indigo-900/40'
      : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
  }`;

  const subMenuButtonClass =
  'rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100';

  return (
    <div className="flex h-screen w-full overflow-hidden bg-zinc-50 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
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
              <h1 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white">
                Raid <span className="text-indigo-600 dark:text-indigo-400">Manager</span>
              </h1>
              <span className="text-[10px] font-medium text-zinc-400">
                {status || (loading ? '데이터 불러오는 중...' : '시스템 정상 작동 중')}
              </span>
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
        전체 전투력 갱신
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

      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between border-b border-zinc-200 bg-white/90 px-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90 md:hidden">
          <div className="flex items-center gap-3">
            <button onClick={toggleSidebar} className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">
              <Menu size={24} />
            </button>
            <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              {location.pathname === '/' && '개인별 현황'}
              {location.pathname === '/schedule' && '배정 결과'}
              {location.pathname === '/sequence' && '진행 순서'}
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto bg-zinc-50/50 p-4 dark:bg-zinc-950 sm:p-6 lg:p-8">
          <div className="mx-auto space-y-6">
            <Routes>
              <Route path="/" element={
                  <section className="animate-fade-in space-y-6">
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                      <div className="flex items-center gap-4">
                        <h2 className="flex items-center gap-2 text-xl font-bold text-zinc-900 dark:text-zinc-100">
                          <LayoutDashboard className="text-indigo-500" />
                          개인별 진행 현황
                        </h2>

                        <div className="relative">
                          <select value={selectedUserFilter} onChange={(e) => setSelectedUserFilter(e.target.value)} className="cursor-pointer appearance-none rounded-lg border border-zinc-200 bg-white py-1.5 pl-3 pr-9 text-sm font-bold text-zinc-700 shadow-sm transition-colors hover:border-indigo-300 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
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

                      <div className="flex gap-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">
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
                }
              />

              <Route path="/schedule" element={
                  <section className="animate-fade-in space-y-6">
                    <div className="flex items-center justify-between">
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
                        <p className="mt-1 text-sm text-zinc-500">좌측 메뉴의 &quot;내 원정대 관리&quot;에서 캐릭터를 등록해주세요.</p>
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
                }
              />

              <Route path="/sequence" element={
                  <section className="animate-fade-in space-y-6">
                    <div className="flex items-center justify-between">
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
                }
              />
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
      </main>
    </div>
  );
};

export default App;