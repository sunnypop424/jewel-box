import React, { useEffect, useMemo, useState } from 'react';
import type {
  Character,
  RaidId,
  RaidExclusionMap,
  RaidSettingsMap,
  RaidSwap,
} from './types';
import { buildRaidCandidatesMap, buildRaidSchedule } from './raidLogic';
import { CharacterFormList } from './components/CharacterFormList';
import { RaidScheduleView } from './components/RaidScheduleView';
import { RaidSequenceView } from './components/RaidSequenceView';
import { UserRaidProgressPanel } from './components/UserRaidProgressPanel';
import { fetchCharacters, saveCharacters, fetchRaidSettings, setRaidSetting } from './api/sheetApi';
import {
  fetchRaidExclusions,
  excludeCharacterOnRaid,
  resetRaidExclusions,
  excludeCharactersOnRaid,
} from './api/exclusionApi';
import { fetchSwaps, addSwap } from './api/swapApi';
import { Modal } from './components/Modal';
import { LadderGame } from './components/LadderGame';
import { RouletteGame } from './components/RouletteGame';
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
    () => buildRaidSchedule(schedulingCharacters, raidExclusions, balanceMode, raidSettings, raidSwaps),
    [schedulingCharacters, raidExclusions, balanceMode, raidSettings, raidSwaps],
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
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleToggleSupportShortage = async (raidId: RaidId, next: boolean) => {
    try {
      setStatus('랏폿 설정 저장 중...');
      const updatedBy = localSquad.discordName || '';
      const rs = await setRaidSetting(raidId, next, updatedBy);
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

  const handleExcludeCharacterFromRaid = async (raidId: RaidId, charId: string) => {
    try {
      if (isSwapping) {
        alert('캐릭터 변경 반영 중입니다. 잠시 후 다시 시도해주세요.');
        return;
      }
      setStatus('레이드 제외 처리 중...');
      const next = await excludeCharacterOnRaid(raidId, charId);
      setRaidExclusions(next);
      setStatus('레이드 제외 내역이 업데이트되었습니다.');
    } catch (e) {
      console.error(e);
      alert('레이드 제외 처리에 실패했습니다. 잠시 후 다시 시도해주세요.');
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
      const updatedBy = localSquad.discordName || 'User';
      const next = await excludeCharactersOnRaid(raidId, uniqIds, updatedBy);
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
      const updatedBy = localSquad.discordName || 'User';
      const nextSwaps = await addSwap(raidId, charId1, charId2, updatedBy);
      setRaidSwaps(nextSwaps);
      setStatus('캐릭터 교체가 완료되었습니다.');
    } catch (e) {
      console.error(e);
      alert('캐릭터 교체 실패');
    } finally {
      setIsSwapping(false);
    }
  };

  const handleResetExclusions = async () => {
    const ok = window.confirm('모든 제외 내역과 캐릭터 변경(Swap) 내역을 초기화하시겠습니까?');
    if (!ok) return;

    try {
      setStatus('내역 초기화 중...');
      await resetRaidExclusions();
      await Promise.all([refreshExclusions(), refreshSwaps()]);
      setStatus('모든 내역이 초기화되었습니다.');
    } catch (e) {
      console.error(e);
      alert('초기화 실패');
    }
  };

  const handleRefresh = () => {
    refreshAllCharacters();
    refreshExclusions();
    refreshRaidSettings();
    refreshSwaps();
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
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-zinc-200 bg-white shadow-xl md:shadow-none transition-transform duration-300 dark:border-zinc-800 dark:bg-zinc-900 md:relative md:translate-x-0 ${
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
              새로고침
            </button>

            <button
              onClick={handleResetExclusions}
              disabled={loadingExclusions || isSwapping}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-zinc-600 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-rose-900/20 dark:hover:text-rose-400"
            >
              <Eraser size={18} />
              제외/변경 초기화
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
              룰렛 돌리기
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
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                          <LayoutDashboard className="text-indigo-500" />
                          개인별 진행 현황
                        </h2>

                        <div className="relative">
                          <select
                            value={selectedUserFilter}
                            onChange={(e) => setSelectedUserFilter(e.target.value)}
                            className="appearance-none rounded-lg border border-zinc-200 bg-white pl-3 pr-9 py-1.5 text-sm font-bold text-zinc-700 shadow-sm hover:border-indigo-300 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 cursor-pointer transition-colors"
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
                    />
                  </section>
                }
              />

              <Route
                path="/schedule"
                element={
                  <section className="animate-fade-in space-y-6">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        <ClipboardList className="text-indigo-500" />
                        레이드 배정 결과
                      </h2>
                    </div>

                    {effectiveCharacters.length === 0 && !loading ? (
                      <div className="flex min-h-[300px] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-zinc-200 bg-white/50 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900/50">
                        <div className="mb-4 rounded-full bg-zinc-100 p-4 dark:bg-zinc-800">
                          <Users size={32} className="text-zinc-400" />
                        </div>
                        <p className="text-lg font-medium text-zinc-600 dark:text-zinc-300">등록된 캐릭터가 없습니다.</p>
                        <p className="mt-1 text-sm text-zinc-500">
                          좌측 메뉴의 \"내 원정대 관리\"에서 캐릭터를 등록해주세요.
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
                      <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
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

        <Modal open={isModalOpen} title="내 원정대 관리" onClose={() => !saving && setIsModalOpen(false)}>
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
      </main>
    </div>
  );
};

export default App;
