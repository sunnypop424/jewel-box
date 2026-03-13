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
import { UserRaidProgressPanel } from './components/UserRaidProgressPanel';
import { 
  fetchCharacters, saveCharacters, fetchRaidSettings, setRaidSetting,
  fetchSwaps, addSwap, resetSwaps,
  fetchRaidExclusions, toggleCharacterOnRaid, excludeCharactersOnRaid, resetRaidExclusions 
} from './api/firebaseApi';
import { syncCharactersWithLostArkAPI, fetchProfile } from './api/lostArkApi';
import { Modal } from './components/Modal';
import { LadderGame } from './components/LadderGame';
import { RouletteGame } from './components/RouletteGame';
import { PinballGame } from './components/PinballGame';
import { AuctionCalculatorModal } from './components/AuctionCalculatorModal'; // 방금 만든 모달 가져오기
import {
  Swords,
  Sun,
  Moon,
  UserCog,
  RefreshCw,
  LayoutDashboard,
  Eraser,
  ClipboardList,
  ChartGantt,
  Menu,
  X,
  Users,
  ChevronDown,
  Waypoints,
  CircleDot,
  Orbit,
  Calculator
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

const App: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [allCharacters, setAllCharacters] = useState<Character[]>([]);

  const [localSquad, setLocalSquad] = useState<Squad>({
    discordName: '',
    characters: [],
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLadderModalOpen, setIsLadderModalOpen] = useState(false);
  const [isRouletteModalOpen, setIsRouletteModalOpen] = useState(false);
  const [isPinballModalOpen, setIsPinballModalOpen] = useState(false);
  const [isCalcOpen, setIsCalcOpen] = useState(false);

  const [raidExclusions, setRaidExclusions] = useState<RaidExclusionMap>({});
  const [loadingExclusions, setLoadingExclusions] = useState(false);

  const [raidSettings, setRaidSettings] = useState<RaidSettingsMap>({});
  const [loadingRaidSettings, setLoadingRaidSettings] = useState(false);

  const [raidSwaps, setRaidSwaps] = useState<RaidSwap[]>([]);
  const [isSwapping, setIsSwapping] = useState(false);

  const [balanceMode, _setBalanceMode] = useState<BalanceMode>('speed');

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
    } catch (e) {
      console.error('load exclusions error', e);
    } finally {
      setLoadingExclusions(false);
    }
  };

  const refreshRaidSettings = async () => {
    try {
      setLoadingRaidSettings(true);
      const rs = await fetchRaidSettings();
      setRaidSettings(rs);
    } catch (e) {
      console.error('load raid settings error', e);
    } finally {
      setLoadingRaidSettings(false);
    }
  };

  const refreshSwaps = async () => {
    try {
      const s = await fetchSwaps();
      setRaidSwaps(s);
    } catch (e) {
      console.error('load swaps error', e);
    }
  };

  useEffect(() => {
    refreshAllCharacters().catch(console.error);
    refreshExclusions().catch(console.error);
    refreshRaidSettings().catch(console.error);
    refreshSwaps().catch(console.error);
  }, []);

  // 1. 상태 추가 (기존 useState들이 모인 곳)
  const [raidGuests, setRaidGuests] = useState<Partial<Record<RaidId, Character[]>>>({});

  // 2. 게스트 추가 핸들러
  const handleAddGuest = (raidId: RaidId, role: 'DPS' | 'SUPPORT', jobCode: string) => {

    const shortHash = Math.random().toString(36).substring(2, 6);

    const newGuest: Character = {
      id: `guest_${Date.now()}`,
      discordName: `게스트_${shortHash}`, // 중복 방지용 고유 이름
      jobCode: jobCode,
      role: role,
      itemLevel: 1800, // 레이드 참여 가능 레벨로 고정
      combatPower: role === 'SUPPORT' ? 4000000 : 5000000, // 밸런스 평균값 임시 부여
      isGuest: true,
    };

    setRaidGuests(prev => ({
      ...prev,
      [raidId]: [...(prev[raidId] || []), newGuest]
    }));
  };

  // 3. 게스트 삭제 핸들러
  const handleRemoveGuest = (raidId: RaidId, guestId: string) => {
    setRaidGuests(prev => ({
      ...prev,
      [raidId]: (prev[raidId] || []).filter(g => g.id !== guestId)
    }));
  };

  const [guestModalData, setGuestModalData] = useState<{ isOpen: boolean; raidId: RaidId | null }>({
    isOpen: false,
    raidId: null,
  });

  // 모달 열기 함수
  const handleOpenGuestModal = (raidId: RaidId) => {
    setGuestModalData({ isOpen: true, raidId });
  };

  // 모달에서 '추가' 클릭 시 실행
  const handleAddGuestAndClose = (role: 'DPS' | 'SUPPORT', jobCode: string) => {
    if (guestModalData.raidId) {
      handleAddGuest(guestModalData.raidId, role, jobCode);
    }
    setGuestModalData({ isOpen: false, raidId: null });
  };

  const effectiveCharacters = useMemo(() => {
    if (!localSquad.discordName) return allCharacters;
    const others = allCharacters.filter((c) => c.discordName !== localSquad.discordName);
    return [...others, ...localSquad.characters];
  }, [allCharacters, localSquad]);

  const [inactiveUsers, setInactiveUsers] = useState<Set<string>>(new Set());

  const schedulingCharacters = useMemo(() => {
    return effectiveCharacters.filter((c) => !inactiveUsers.has(c.discordName));
  }, [effectiveCharacters, inactiveUsers]);

  const schedule = useMemo(
    () => buildRaidSchedule(schedulingCharacters, raidExclusions, balanceMode, raidSettings, raidSwaps, raidGuests),
    [schedulingCharacters, raidExclusions, balanceMode, raidSettings, raidSwaps, raidGuests], // raidGuests 추가
  );

  const raidCandidates = useMemo(
    () => buildRaidCandidatesMap(schedulingCharacters, raidExclusions, raidSettings),
    [schedulingCharacters, raidExclusions, raidSettings],
  );

  const allUserNames = useMemo(() => {
    return Array.from(new Set(effectiveCharacters.map((c) => c.discordName))).sort();
  }, [effectiveCharacters]);

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

  const handleToggleUserActive = (name: string) => {
    setInactiveUsers((prev) => {
      const next = new Set<string>(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleToggleSupportShortage = async (raidId: RaidId, next: boolean) => {
    try {
      setStatus('랏폿 설정 저장 중...');
      const rs = await setRaidSetting(raidId, next);
      setRaidSettings(rs);
      setStatus('랏폿 설정이 저장되었습니다.');
    } catch (e) {
      console.error(e);
      alert('랏폿 설정 저장에 실패했습니다.');
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

  const handleExcludeCharacterFromRaid = async (raidId: RaidId, charId: string, isCurrentlyExcluded: boolean = false) => {
    try {
      if (isSwapping) {
        alert('캐릭터 변경 반영 중입니다. 잠시 후 다시 시도해주세요.');
        return;
      }
      setStatus(isCurrentlyExcluded ? '레이드 완료 취소 중...' : '레이드 제외 처리 중...');
      const next = await toggleCharacterOnRaid(raidId, charId, isCurrentlyExcluded);
      setRaidExclusions(next);
      setStatus(isCurrentlyExcluded ? '완료가 취소되었습니다.' : '레이드가 완료 처리되었습니다.');
    } catch (e) {
      console.error(e);
      alert('상태 변경에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }
  };

  const handleExcludeRun = async (raidId: RaidId, charIds: string[]) => {
    try {
      if (isSwapping) {
        alert('캐릭터 변경 반영 중입니다. 잠시 후 다시 시도해주세요.');
        return;
      }
      const uniqIds = Array.from(new Set((charIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean)));
      if (uniqIds.length === 0) return;

      setStatus('공격대 완료 처리 중...');
      const next = await excludeCharactersOnRaid(raidId, uniqIds);
      setRaidExclusions(next);
      setStatus('공격대가 완료 처리되었습니다.');
    } catch (e) {
      console.error(e);
      alert('공격대 완료 처리 실패');
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
      console.error(e);
      alert('캐릭터 교체 실패');
    } finally {
      setIsSwapping(false);
    }
  };

  // ✅ 유저 단위 스펙 갱신 핸들러
  const handleRefreshUserCharacters = async (discordName: string, userChars: Character[]) => {
    const ok = window.confirm(
      `${discordName}님의 원정대 정보를 업데이트 하시겠습니까?\n(약간의 시간이 소요될 수 있습니다)`
    );
    if (!ok) return;

    try {
      setStatus(`${discordName}님의 원정대 정보 업데이트 중...`);

      const skippedMessages: string[] = [];

      // 이미 작성해둔 전체 갱신 API 함수를 해당 유저의 캐릭터 배열에만 적용
      const updatedUserChars = await syncCharactersWithLostArkAPI(userChars, saveCharacters, (msg) => {
        skippedMessages.push(msg);
      });

      // 전체 캐릭터 목록 중 해당 유저의 캐릭터만 업데이트된 정보로 교체
      setAllCharacters(prev => {
        const others = prev.filter(c => c.discordName !== discordName);
        return [...others, ...updatedUserChars];
      });

      setStatus(`${discordName}님의 원정대 정보다 업데이트 되었습니다.`);

      // 스킵된 캐릭터가 있다면 팝업으로 알림
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
      setStatus(`${discordName}님 갱신 실패`);
    }
  };

  // ✅ 단일 캐릭터 스펙 갱신 핸들러
  const handleRefreshSingleCharacter = async (char: Character) => {
    if (!char.lostArkName) {
      alert('로스트아크 캐릭터 이름이 설정되지 않았습니다. (원정대 관리에서 설정해주세요)');
      return;
    }
    try {
      setStatus(`${char.discordName}님의 ${char.lostArkName} 갱신 중...`);
      
      const profile = await fetchProfile(char.lostArkName);
      
      if (profile && profile.ItemAvgLevel && profile.CombatPower) {
        const lv = parseFloat(profile.ItemAvgLevel.replace(/,/g, ''));
        const cp = parseFloat(profile.CombatPower.replace(/,/g, ''));

        // 1. 상태 업데이트
        const nextAllChars = allCharacters.map(c => 
          c.id === char.id ? { ...c, itemLevel: Math.floor(lv), combatPower: Math.floor(cp) } : c
        );
        setAllCharacters(nextAllChars);

        // 2. DB 저장 (해당 유저의 캐릭터 배열만 추출해서 저장)
        const userCharsToSave = nextAllChars.filter(c => c.discordName === char.discordName);
        await saveCharacters(char.discordName, userCharsToSave);
        
        setStatus(`${char.lostArkName} 갱신 완료`);
      } else {
        alert('캐릭터 정보를 찾을 수 없거나 올바르지 않은 응답입니다.');
        setStatus('갱신 실패');
      }
    } catch (e: any) {
      console.error(e);
      alert(`갱신 실패: ${e?.message ?? e}`);
      setStatus('갱신 실패');
    }
  };

  const handleResetExclusions = async () => {
    const ok = window.confirm('모든 레이드 완료 내역을 초기화하시겠습니까?');
    if (!ok) return;

    try {
      setStatus('내역 초기화 중...');
      
      await resetRaidExclusions();
      await resetSwaps();
      
      await Promise.all([refreshExclusions(), refreshSwaps()]);
      setStatus('모든 내역이 초기화되었습니다.');
    } catch (e) {
      console.error(e);
      alert('초기화 실패');
      setStatus('초기화 중 오류가 발생했습니다.');
    }
  };

  const handleRefresh = async () => {
    const ok = window.confirm(
      '로아 API를 통해 모든 유저의 정보를 업데이트 하시겠습니까?\n(약 5~10초 정도 소요될 수 있습니다)'
    );
    if (!ok) return;

    try {
      setLoading(true);
      setStatus('전체 유저 정보 업데이트 중... (페이지를 닫지 마세요)');
      
      // DB에서 최신 캐릭터 목록을 먼저 가져옴
      let list = await fetchCharacters();
      
      // 스킵 메시지 수집용 배열
      const skippedMessages: string[] = [];
      
      // 로아 API 연동 (스킵 발생 시 콜백으로 메시지 수집)
      list = await syncCharactersWithLostArkAPI(list, saveCharacters, (msg) => {
        skippedMessages.push(msg);
      });
      
      setAllCharacters(list);
      
      // 기타 설정들도 최신화
      await Promise.all([refreshExclusions(), refreshRaidSettings(), refreshSwaps()]);
      setStatus('모든 캐릭터의 정보가 갱신되었습니다.');

      // 스킵된 캐릭터가 있다면 모아서 알림
      if (skippedMessages.length > 0) {
        alert(
          `[전투력 미갱신 알림]\n\n` +
          `아래 캐릭터들은 현재 전투력이 기존보다 낮아 기존 전투력으로 유지되었습니다.\n\n` +
          `${skippedMessages.join('\n')}\n\n` +
          `의도적으로 전투력을 낮추신 경우, 개인별 현황에서 캐릭터별 새로고침을 진행해주세요.`
        );
      }

    } catch (e) {
      console.error(e);
      alert('정보 갱신 실패');
      setStatus('정보 갱신 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  const handleNavClick = (path: string) => {
    navigate(path);
    setIsSidebarOpen(false);
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-zinc-50 font-['Paperozi'] text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-zinc-200 bg-white shadow-xl transition-transform duration-300 dark:border-zinc-800 dark:bg-zinc-900 md:relative md:translate-x-0 md:shadow-none ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
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
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="rounded-lg p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 md:hidden"
          >
            <X size={20} className="text-zinc-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <nav className="flex flex-col gap-1.5">
            <div className="mb-2 px-2 text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Main Menu
            </div>

            <button
              onClick={() => handleNavClick('/')}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition-all ${
                isActive('/')
                  ? 'bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-300 dark:ring-indigo-900/40'
                  : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
              }`}
            >
              <LayoutDashboard size={18} />
              개인별 진행 현황
            </button>

            <button
              onClick={() => handleNavClick('/schedule')}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition-all ${
                isActive('/schedule')
                  ? 'bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-300 dark:ring-indigo-900/40'
                  : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
              }`}
            >
              <ClipboardList size={18} />
              레이드 배정 결과
            </button>

            <button
              onClick={() => handleNavClick('/sequence')}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition-all ${
                isActive('/sequence')
                  ? 'bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-300 dark:ring-indigo-900/40'
                  : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
              }`}
            >
              <ChartGantt size={18} />
              레이드 진행 순서
            </button>

            <div className="my-4 h-px bg-zinc-100 dark:bg-zinc-800" />

            <div className="mb-2 px-2 text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Actions
            </div>

            <button
              onClick={() => setIsModalOpen(true)}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              <UserCog size={18} />
              내 원정대 관리
            </button>

            <button
              onClick={handleRefresh}
              disabled={loading || saving || isSwapping}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
              전체 전투력 갱신
            </button>

            <button
              onClick={handleResetExclusions}
              disabled={loadingExclusions || isSwapping}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-zinc-600 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-rose-900/20 dark:hover:text-rose-400"
            >
              <Eraser size={18} />
              레이드 완료 내역 초기화
            </button>

            <div className="my-4 h-px bg-zinc-100 dark:bg-zinc-800" />

            <div className="mb-2 px-2 text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Games
            </div>

            <button
              onClick={() => setIsLadderModalOpen(true)}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              <Waypoints size={18} />
              경매 사다리 타기
            </button>

            <button
              onClick={() => setIsRouletteModalOpen(true)}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              <CircleDot size={18} />
              경매 룰렛
            </button>

            <button
              onClick={() => setIsPinballModalOpen(true)}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              <Orbit size={18} />
              마블 레이스
            </button>
            
            <div className="my-4 h-px bg-zinc-100 dark:bg-zinc-800" />

            <div className="mb-2 px-2 text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Utilities
            </div>

            <button
              onClick={() => setIsCalcOpen(true)}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              <Calculator size={18} />
              경매 입찰 계산기
            </button>

          </nav>
        </div>

        <div className="border-t border-zinc-100 p-4 dark:border-zinc-800">
          <button
            onClick={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
            className="flex w-full items-center justify-between rounded-xl bg-zinc-50 px-4 py-3 text-sm font-bold text-zinc-600 transition-colors hover:bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
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
            <button
              onClick={toggleSidebar}
              className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
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
              <Route
                path="/"
                element={
                  <section className="animate-fade-in space-y-6">
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                      <div className="flex items-center gap-4">
                        <h2 className="flex items-center gap-2 text-xl font-bold text-zinc-900 dark:text-zinc-100">
                          <LayoutDashboard className="text-indigo-500" />
                          개인별 진행 현황
                        </h2>

                        <div className="relative">
                          <select
                            value={selectedUserFilter}
                            onChange={(e) => setSelectedUserFilter(e.target.value)}
                            className="cursor-pointer appearance-none rounded-lg border border-zinc-200 bg-white py-1.5 pl-3 pr-9 text-sm font-bold text-zinc-700 shadow-sm transition-colors hover:border-indigo-300 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                          >
                            <option value="ALL">전체 유저</option>
                            {allUserNames.map((name) => (
                              <option key={name} value={name}>
                                {name}
                              </option>
                            ))}
                          </select>
                          <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400">
                            <ChevronDown size={14} strokeWidth={3} />
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        <span className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-amber-400 ring-1 ring-amber-400/50" />
                          대기
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-indigo-500 ring-1 ring-indigo-500/50" />
                          배치됨
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-zinc-300 ring-1 ring-zinc-300/50" />
                          완료
                        </span>
                      </div>
                    </div>

                    <UserRaidProgressPanel
                      characters={filteredCharactersForProgress}
                      raidCandidates={raidCandidates}
                      exclusions={raidExclusions}
                      schedule={schedule}
                      onMarkRaidComplete={handleExcludeCharacterFromRaid}
                      onRefreshCharacter={handleRefreshSingleCharacter}
                      onRefreshUser={handleRefreshUserCharacters}
                    />
                  </section>
                }
              />

              <Route
                path="/schedule"
                element={
                  <section className="animate-fade-in space-y-6">
                    <div className="flex items-center justify-between">
                      <h2 className="flex items-center gap-2 text-xl font-bold text-zinc-900 dark:text-zinc-100">
                        <ClipboardList className="text-indigo-500" />
                        레이드 배정 결과
                      </h2>
                    </div>

                    {effectiveCharacters.length === 0 && !loading ? (
                      <div className="flex min-h-[300px] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-zinc-200 bg-white/50 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900/50">
                        <div className="mb-4 rounded-full bg-zinc-100 p-4 dark:bg-zinc-800">
                          <Users size={32} className="text-zinc-400" />
                        </div>
                        <p className="text-lg font-medium text-zinc-600 dark:text-zinc-300">
                          등록된 캐릭터가 없습니다.
                        </p>
                        <p className="mt-1 text-sm text-zinc-500">
                          좌측 메뉴의 &quot;내 원정대 관리&quot;에서 캐릭터를 등록해주세요.
                        </p>
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

              <Route
                path="/sequence"
                element={
                  <section className="animate-fade-in space-y-6">
                    <div className="flex items-center justify-between">
                      <h2 className="flex items-center gap-2 text-xl font-bold text-zinc-900 dark:text-zinc-100">
                        <ChartGantt className="text-indigo-500" />
                        레이드 진행 순서
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
            onLoadByDiscordName={(targetName: string) => {
              return allCharacters.filter((c) => c.discordName === targetName);
            }}
          />
        </Modal>

        <Modal
          open={isLadderModalOpen}
          title="경매 아이템 사다리 타기"
          onClose={() => setIsLadderModalOpen(false)}
          maxWidth="max-w-5xl"
        >
          <LadderGame onClose={() => setIsLadderModalOpen(false)} allUserNames={allUserNames} />
        </Modal>

        <Modal
          open={isRouletteModalOpen}
          title="경매 아이템 룰렛"
          onClose={() => setIsRouletteModalOpen(false)}
          maxWidth="max-w-4xl"
        >
          <RouletteGame allUserNames={allUserNames} />
        </Modal>

        <Modal
          open={isPinballModalOpen}
          title="경매 아이템 마블 레이스"
          onClose={() => setIsPinballModalOpen(false)}
          maxWidth="max-w-4xl"
        >
          <PinballGame onClose={() => setIsPinballModalOpen(false)} allUserNames={allUserNames} />
        </Modal>

        <GuestAddModal
          isOpen={guestModalData.isOpen}
          onClose={() => setGuestModalData({ isOpen: false, raidId: null })}
          onAdd={handleAddGuestAndClose}
          raidLabel={guestModalData.raidId ? RAID_META[guestModalData.raidId].label : ''}
        />

        {/* ✅ 방금 만든 모달 렌더링 (isOpen 상태에 따라 켜지고 꺼짐) */}
        <AuctionCalculatorModal 
          isOpen={isCalcOpen} 
          onClose={() => setIsCalcOpen(false)} 
        />

      </main>
    </div>
  );
};

export default App;