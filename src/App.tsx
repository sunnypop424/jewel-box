import React, { useEffect, useMemo, useState } from 'react';
import type { Character } from './types';
import { buildRaidSchedule } from './raidLogic';
import { CharacterFormList } from './components/CharacterFormList';
import { RaidScheduleView } from './components/RaidScheduleView';
import { fetchCharacters, saveCharacters } from './api/sheetApi';
import { Modal } from './components/Modal';
import { 
  Swords, 
  Sun, 
  Moon, 
  UserCog, 
  RefreshCw, 
  LayoutDashboard 
} from 'lucide-react';

type Theme = 'light' | 'dark';

interface Squad {
  discordName: string;
  characters: Character[];
}

const LOCAL_SQUAD_KEY = 'raidSquad_v1';
const THEME_KEY = 'raidTheme_v1';

const App: React.FC = () => {
  const [allCharacters, setAllCharacters] = useState<Character[]>([]);
  
  // 내 원정대 정보
  const [localSquad, setLocalSquad] = useState<Squad>({
    discordName: '',
    characters: [],
  });

  const [loading, setLoading] = useState(false); // 전체 데이터 로딩용
  const [saving, setSaving] = useState(false);   // 저장(API 호출) 중 상태
  const [status, setStatus] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 테마 설정
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

  // 초기 로컬 스토리지 로드
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

  // 로컬 스토리지 자동 저장 (localSquad 변경 시)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(LOCAL_SQUAD_KEY, JSON.stringify(localSquad));
  }, [localSquad]);

  // 전체 캐릭터 데이터 새로고침
  const refreshAllCharacters = async () => {
    try {
      setLoading(true);
      setStatus('데이터 동기화 중...');

      const list = await fetchCharacters();
      setAllCharacters(list);

      // 디스코드 닉네임 기준 유저 수 계산
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

  // 앱 시작 시 데이터 로드
  useEffect(() => {
    refreshAllCharacters().catch(console.error);
  }, []);

  // 레이드 배정 로직용 캐릭터 목록
  const effectiveCharacters = useMemo(() => {
    if (!localSquad.discordName) return allCharacters;
    // 전체 목록에서 내 닉네임 제거하고, 현재 로컬 데이터로 교체 (최신 반영)
    const others = allCharacters.filter((c) => c.discordName !== localSquad.discordName);
    return [...others, ...localSquad.characters];
  }, [allCharacters, localSquad]);

  const schedule = useMemo(() => buildRaidSchedule(effectiveCharacters), [effectiveCharacters]);

  // [수정됨] 저장 & 동기화 핸들러 (모달에서 호출)
  const handleSaveAndSync = async (discordName: string, characters: Character[]) => {
    try {
      setSaving(true); // 저장 로딩 시작
      
      // 1. 구글 시트 저장 API 호출
      await saveCharacters(discordName, characters);

      // 2. 로컬 상태 업데이트 (localStorage는 useEffect에 의해 자동 처리됨)
      const newSquad: Squad = { discordName, characters };
      setLocalSquad(newSquad);

      // 3. 전체 데이터 새로고침 (내 데이터가 반영된 시트 다시 불러오기)
      await refreshAllCharacters();

      // 4. 성공 시 모달 닫기
      setIsModalOpen(false);
      setStatus(`${discordName}님의 정보가 저장되고 동기화되었습니다.`);
    } catch (e: any) {
      console.error(e);
      alert(`저장 실패: ${e?.message ?? e}`);
    } finally {
      setSaving(false); // 저장 로딩 종료
    }
  };

  return (
    <div className="font-['Paperozi'] min-h-screen bg-zinc-50 text-zinc-900 transition-colors duration-300 dark:bg-zinc-950 dark:text-zinc-100">
      
      {/* 네비게이션 바 */}
      <nav className="sticky top-0 z-30 w-full border-b border-zinc-200 bg-white/80 backdrop-blur-md transition-colors dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-indigo-600 p-1.5 text-white shadow-lg shadow-indigo-500/30">
              <Swords size={20} strokeWidth={2.5} />
            </div>
            <h1 className="text-lg font-bold tracking-tight sm:text-xl">
              Lost Ark <span className="text-indigo-600 dark:text-indigo-400">Raid Plan</span>
            </h1>
          </div>
          
          <button
            onClick={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')}
            className="rounded-full bg-zinc-100 p-2 text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </div>
      </nav>

      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
        
        {/* 컨트롤 패널 */}
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
              <UserCog size={18} className="text-zinc-500 transition-colors group-hover:text-zinc-900 dark:text-zinc-400 dark:group-hover:text-zinc-100" />
              <span>내 원정대 관리</span>
            </button>
            <button
              onClick={refreshAllCharacters}
              disabled={loading || saving}
              className="group inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <RefreshCw size={18} className={`text-zinc-400 transition-all group-hover:text-zinc-600 dark:group-hover:text-zinc-200 ${loading ? 'animate-spin' : ''}`} />
              <span>새로고침</span>
            </button>
          </div>
        </section>

        <div className="h-px bg-zinc-200 dark:bg-zinc-800" />

        {/* 메인 컨텐츠: 레이드 스케줄 */}
        <section>
          {effectiveCharacters.length === 0 ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-zinc-200 bg-zinc-50/50 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900/50">
              <div className="mb-4 rounded-full bg-zinc-100 p-4 dark:bg-zinc-800">
                <UserCog size={32} className="text-zinc-400" />
              </div>
              <p className="text-lg font-medium text-zinc-400">등록된 캐릭터가 없습니다.</p>
              <p className="mt-1 text-sm text-zinc-500">"내 원정대 관리" 버튼을 눌러 캐릭터를 등록해주세요.</p>
            </div>
          ) : (
             <div className="space-y-4">
               <div className="flex items-center justify-between px-1">
                 <h3 className="flex items-center gap-2 text-lg font-bold text-zinc-900 dark:text-zinc-100">
                   <LayoutDashboard size={20} className="text-indigo-500" />
                   레이드 배정 결과
                 </h3>
               </div>
               <RaidScheduleView schedule={schedule} />
             </div>
          )}
        </section>
      </main>

      <Modal
        open={isModalOpen}
        title="내 원정대 편집"
        onClose={() => !saving && setIsModalOpen(false)} // 저장 중일 땐 닫기 방지
      >
        <CharacterFormList
          discordName={localSquad.discordName}
          characters={localSquad.characters}
          isLoading={saving}
          onSubmit={handleSaveAndSync}
          onCancel={() => setIsModalOpen(false)}
        />
      </Modal>
    </div>
  );
};

export default App;