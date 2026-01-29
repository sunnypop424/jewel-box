// src/App.tsx
import React, { useEffect, useMemo, useState } from 'react';
import type {
  Character,
  RaidId,
  RaidExclusionMap,
  RaidSchedule,
  RaidSettingsMap,
  RaidSwap,
} from './types';
import { buildRaidCandidatesMap, buildRaidSchedule } from './raidLogic';
import { CharacterFormList } from './components/CharacterFormList';
import { RaidScheduleView } from './components/RaidScheduleView';
import { RaidSequenceView } from './components/RaidSequenceView';
import { fetchCharacters, saveCharacters, fetchRaidSettings, setRaidSetting } from './api/sheetApi';
import {
  fetchRaidExclusions,
  excludeCharacterOnRaid,
  resetRaidExclusions,
  excludeCharactersOnRaid,
} from './api/exclusionApi';
import { fetchSwaps, addSwap } from './api/swapApi';
import { Modal } from './components/Modal';
import { RAID_META } from './constants';
import {
  Swords,
  Sun,
  Moon,
  UserCog,
  RefreshCw,
  LayoutDashboard,
  Eraser,
  ClipboardClock,
  ChartGantt,
  ArrowLeft,
  ChevronDown,
  Shield,
  Check,
  User,
} from 'lucide-react';

import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';

type Theme = 'light' | 'dark';
type BalanceMode = 'overall' | 'role' | 'speed';

interface Squad {
  discordName: string;
  characters: Character[];
}

const LOCAL_SQUAD_KEY = 'raidSquad_v1';
const THEME_KEY = 'raidTheme_v1';

// ==============================
// ✅ 유저별 진행 현황판
// ==============================

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

function UserRaidProgressPanel(props: {
  characters: Character[];
  raidCandidates?: Partial<Record<RaidId, Character[]>>;
  exclusions?: RaidExclusionMap;
  schedule: RaidSchedule | null;
}) {
  const { characters, raidCandidates, exclusions, schedule } = props;

  const [isExpanded, setIsExpanded] = useState(false);

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
      chars: chars.slice().sort((a, b) => b.combatPower - a.combatPower),
    }));

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
        return 'bg-blue-50 text-blue-600 ring-1 ring-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:ring-blue-900/40';
      case 'UNASSIGNED':
      default:
        return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:ring-amber-900/40';
    }
  };

  return (
    <section className="rounded-3xl bg-white shadow-sm ring-1 ring-zinc-900/5 transition-all dark:bg-zinc-900 dark:ring-zinc-800">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between rounded-3xl px-6 py-5 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      >
        <div className="flex items-center gap-4">
          <div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              개인별 진행 현황
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {isExpanded
                ? '유저별 상세 진행 상황을 확인합니다.'
                : '클릭하여 유저별 상세 진행 상황을 확인하세요.'}
            </p>
          </div>
        </div>

        <ChevronDown
          className={`text-zinc-400 transition-transform duration-300 ${
            isExpanded ? 'rotate-180' : 'rotate-0'
          }`}
          size={24}
        />
      </button>

      {isExpanded && (
        <div className="border-t border-zinc-100 px-6 py-6 dark:border-zinc-800">
          <div className="mb-4 flex justify-end gap-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-400 ring-1 ring-amber-400/50" />
              대기
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-blue-500 ring-1 ring-blue-500/50" />
              배치
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-zinc-300 ring-1 ring-zinc-300/50" />
              완료
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {users.map(({ discordName, chars }) => (
              <div
                key={discordName}
                className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50"
              >
                <div className="flex items-center justify-between border-b border-zinc-200/60 pb-2 dark:border-zinc-700/60">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded bg-white text-zinc-500 shadow-sm dark:bg-zinc-800 dark:text-zinc-400">
                      <User size={14} />
                    </div>
                    <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      {discordName}
                    </span>
                  </div>
                  <span className="text-[10px] font-medium text-zinc-400">
                    {chars.length} Characters
                  </span>
                </div>

                <div className="flex flex-col gap-1.5">
                  {chars.map((c) => {
                    const raidsForChar = RAID_ORDER_FOR_PROGRESS.filter((raidId) =>
                      (candidatesByRaid[raidId] ?? []).some((m) => m.id === c.id),
                    );

                    const isSup = c.role === 'SUPPORT';

                    return (
                      <div
                        key={c.id}
                        className="group flex items-center justify-between gap-2 rounded-lg bg-white p-1.5 shadow-sm ring-1 ring-zinc-900/5 dark:bg-zinc-900 dark:ring-zinc-800"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <div
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-[10px] ${
                              isSup
                                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
                                : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                            }`}
                            title={`${c.jobCode} (${c.role})`}
                          >
                            {isSup ? <Shield size={12} /> : <Swords size={12} />}
                          </div>

                          <div className="flex flex-col leading-none">
                            <div className="flex items-center gap-1">
                              <span className="truncate text-xs font-bold text-zinc-800 dark:text-zinc-200">
                                {c.jobCode}
                              </span>
                            </div>
                            <div className="mt-0.5 text-[9px] text-zinc-400">
                              {c.itemLevel} · {c.combatPower.toLocaleString()}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap justify-end gap-1 text-right">
                          {raidsForChar.length === 0 ? (
                            <span className="text-[9px] text-zinc-300 px-1">-</span>
                          ) : (
                            raidsForChar.map((raidId) => {
                              const state = getState(raidId, c.id);
                              const meta = RAID_META[raidId];
                              const style = getStatusStyles(state);

                              return (
                                <span
                                  key={raidId}
                                  className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold ${style}`}
                                >
                                  {state === 'DONE' && <Check size={8} className="mr-0.5" />}
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
      )}
    </section>
  );
}

// ==============================
// ✅ App
// ==============================

const App: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isSequencePage = location.pathname === '/sequence';

  const [allCharacters, setAllCharacters] = useState<Character[]>([]);

  const [localSquad, setLocalSquad] = useState<Squad>({
    discordName: '',
    characters: [],
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);

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

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      const raw = window.localStorage.getItem(LOCAL_SQUAD_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.discordName === 'string' && Array.isArray(parsed.characters)) {
          setLocalSquad(parsed);
        }
      }
    } catch (e) {
      console.error('localStorage load error', e);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(LOCAL_SQUAD_KEY, JSON.stringify(localSquad));
  }, [localSquad]);

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

  const schedule = useMemo(
    () => buildRaidSchedule(effectiveCharacters, raidExclusions, balanceMode, raidSettings, raidSwaps),
    [effectiveCharacters, raidExclusions, balanceMode, raidSettings, raidSwaps],
  );

  const raidCandidates = useMemo(
    () => buildRaidCandidatesMap(effectiveCharacters, raidExclusions, raidSettings),
    [effectiveCharacters, raidExclusions, raidSettings],
  );

  const handleToggleSupportShortage = async (raidId: RaidId, next: boolean) => {
    try {
      setStatus('랏폿 설정 저장 중...');
      const updatedBy = localSquad.discordName || '';
      const rs = await setRaidSetting(raidId, next, updatedBy);
      setRaidSettings(rs);
      setStatus('랏폿 설정이 저장되었습니다.');
    } catch (e) {
      console.error(e);
      alert('랏폿 설정 저장에 실패했습니다. 잠시 후 다시 시도해주세요.');
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
      setStatus(`${discordName}님의 정보가 저장되고 동기화되었습니다.`);
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

      // ✅ API 스펙상 resetExclusions가 swap도 함께 초기화
      await resetRaidExclusions();

      await Promise.all([refreshExclusions(), refreshSwaps()]);
      setStatus('모든 내역이 초기화되었습니다.');
    } catch (e) {
      console.error(e);
      alert('초기화 실패');
    }
  };

  return (
    <div className="font-['Paperozi'] min-h-screen bg-zinc-50 text-zinc-900 transition-colors duration-300 dark:bg-zinc-950 dark:text-zinc-100">
      <nav className="sticky top-0 z-30 w-full border-b border-zinc-200 bg-white/80 backdrop-blur-md transition-colors dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-indigo-600 p-1.5 text-white shadow-lg shadow-indigo-500/30">
                <Swords size={20} strokeWidth={2.5} />
              </div>
              <h1 className="text-lg font-bold tracking-tight sm:text-xl">
                Lost Ark <span className="text-indigo-600 dark:text-indigo-400">Raid Plan</span>
              </h1>
            </div>

            {!isSequencePage ? (
              <button
                type="button"
                onClick={() => navigate('/sequence')}
                className="group inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <ChartGantt className="h-4 w-4 text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-100" />
                진행 순서
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate('/')}
                className="group inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <ArrowLeft className="h-4 w-4 text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-100" />
                배정 결과
              </button>
            )}
          </div>

          <button
            onClick={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
            className="rounded-full bg-zinc-100 p-2 text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </div>
      </nav>

      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
        <section className="flex flex-col gap-4 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-900/5 transition-all dark:bg-zinc-900 dark:ring-zinc-800 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="hidden rounded-2xl bg-zinc-50 p-3 dark:bg-zinc-800 sm:block">
              <LayoutDashboard className="h-6 w-6 text-zinc-400" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-bold">대시보드</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {status || '전체 데이터를 불러와 자동으로 파티를 구성합니다.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setIsModalOpen(true)}
              className="group inline-flex items-center gap-2 rounded-xl bg-zinc-100 px-5 py-2.5 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
            >
              <UserCog
                size={18}
                className="text-zinc-500 transition-colors group-hover:text-zinc-900 dark:text-zinc-400 dark:group-hover:text-zinc-100"
              />
              <span>내 원정대 관리</span>
            </button>

            <button
              onClick={() => {
                refreshAllCharacters();
                refreshExclusions();
                refreshRaidSettings();
                refreshSwaps();
              }}
              disabled={loading || saving || isSwapping}
              className="group inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <RefreshCw
                size={18}
                className={`text-zinc-400 transition-all group-hover:text-zinc-600 dark:group-hover:text-zinc-200 ${
                  loading ? 'animate-spin' : ''
                }`}
              />
              <span>새로고침</span>
            </button>

            <button
              onClick={handleResetExclusions}
              disabled={loadingExclusions || isSwapping}
              className="group inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <Eraser
                size={18}
                className={`text-zinc-400 transition-all group-hover:text-zinc-700 dark:group-hover:text-zinc-100 ${
                  loadingExclusions ? 'animate-spin' : ''
                }`}
              />
              <span>제외/변경 초기화</span>
            </button>
          </div>
        </section>

        <UserRaidProgressPanel
          characters={effectiveCharacters}
          raidCandidates={raidCandidates}
          exclusions={raidExclusions}
          schedule={schedule}
        />

        <div className="h-px bg-zinc-200 dark:bg-zinc-800" />

        <Routes>
          <Route
            path="/"
            element={
              <>
                <section>
                  {effectiveCharacters.length === 0 && !loading ? (
                    <div className="flex min-h-[300px] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-zinc-200 bg-zinc-50/50 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900/50">
                      <div className="mb-4 rounded-full bg-zinc-100 p-4 dark:bg-zinc-800">
                        <UserCog size={32} className="text-zinc-400" />
                      </div>
                      <p className="text-lg font-medium text-zinc-400">등록된 캐릭터가 없습니다.</p>
                      <p className="mt-1 text-sm text-zinc-500">
                        "내 원정대 관리" 버튼을 눌러 캐릭터를 등록해주세요.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {!loading && (
                        <div className="flex items-center justify-between px-1">
                          <h3 className="flex items-center gap-2 text-lg font-bold text-zinc-900 dark:text-zinc-100">
                            <ClipboardClock size={20} className="text-indigo-500" />
                            레이드 배정 결과
                          </h3>

                          <button
                            type="button"
                            onClick={() => navigate('/sequence')}
                            className="group inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                          >
                            <ChartGantt className="h-4 w-4 text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-100" />
                            진행 순서
                          </button>
                        </div>
                      )}

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
                      />
                    </div>
                  )}
                </section>

                <Modal
                  open={isModalOpen}
                  title="내 원정대 관리"
                  onClose={() => !saving && setIsModalOpen(false)}
                >
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
              </>
            }
          />

          <Route
            path="/sequence"
            element={
              <section className="space-y-4">
                <div className="flex items-center justify-between px-1">
                  <h3 className="flex items-center gap-2 text-lg font-bold text-zinc-900 dark:text-zinc-100">
                    <ChartGantt size={20} className="text-indigo-500" />
                    레이드 진행 순서
                  </h3>

                  <button
                    type="button"
                    onClick={() => navigate('/')}
                    className="group inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    <ArrowLeft className="h-4 w-4 text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-100" />
                    배정 결과
                  </button>
                </div>

                <RaidSequenceView
                  schedule={schedule}
                  balanceMode={balanceMode}
                  onSwapCharacter={handleSwapCharacter}
                  allCharacters={effectiveCharacters}
                  onExclusionsUpdated={(next) => setRaidExclusions(next)}
                  isSwapping={isSwapping}
                  updatedBy={localSquad.discordName || 'User'}
                />
              </section>
            }
          />
        </Routes>
      </main>
    </div>
  );
};

export default App;
