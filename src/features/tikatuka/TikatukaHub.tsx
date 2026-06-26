// 티카투카 허브 — RefineHub와 동일한 셸 패턴(타이틀 + Segmented 탭).
// 모드: 랭크전 / 자유전 / 1:1 대전 / 랭킹보드. 이름은 헤더의 작은 컨트롤로 관리.
import { useEffect, useRef, useState } from 'react';
import { Dices, UserRound, Pencil } from 'lucide-react';
import { TikatukaGame } from './TikatukaGame';
import { TikatukaPvp } from './TikatukaPvp';
import { TikatukaLeaderboard } from './TikatukaLeaderboard';
import {
  fetchPlayer,
  fetchLeaderboard,
  applyResult,
  saveActiveRanked,
  clearActiveRanked,
  type ActiveRanked,
  type ApplyResultOutcome,
} from './playerStore';
import { starForTp, levelForTp, tpToNextLevel } from './tp';
import { cardClass, inputClass, btnPrimary, CHROME } from './ui';
import { cleanupStaleRooms, deleteMyLeftoverRoom } from './online/room';
import { Segmented } from '../refine/refineUi';
import type { AiLevel, GameState, ResultDetail } from './types';

const NAME_KEY = 'tikatuka_name_v1';

const MODE_TABS = [
  ['ranked', '랭크전'],
  ['free', '자유전'],
  ['pvp', '1:1 대전'],
  ['leaderboard', '랭킹보드'],
] as const;
type View = (typeof MODE_TABS)[number][0];

export function TikatukaHub({ allUserNames }: { allUserNames: string[] }) {
  const [name, setName] = useState<string>(() => localStorage.getItem(NAME_KEY) ?? '');
  const [view, setView] = useState<View>('ranked');
  const [recordedNames, setRecordedNames] = useState<string[]>([]);

  // 게임 기록(랭크/PvP)이 1개 이상 있는 사람 이름도 선택 리스트에 노출 → 직접입력 후 플레이한 사람 포함.
  useEffect(() => {
    fetchLeaderboard()
      .then((players) =>
        setRecordedNames(players.filter((p) => p.winsAi + p.lossesAi + p.winsPvp + p.lossesPvp > 0).map((p) => p.name))
      )
      .catch(() => {});
  }, []);

  const pickNames = Array.from(new Set([...allUserNames, ...recordedNames])).sort((a, b) => a.localeCompare(b, 'ko'));

  const setNamePersist = (n: string) => {
    setName(n);
    if (n) localStorage.setItem(NAME_KEY, n);
    else localStorage.removeItem(NAME_KEY);
  };

  // 티카투카 진입(새로고침 포함)마다 죽은 방 정리 + 내가 만들고 떠난 대기방 즉시 삭제.
  useEffect(() => {
    deleteMyLeftoverRoom().catch(() => {});
    cleanupStaleRooms().catch(() => {});
  }, []);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        <h2 className="hidden items-center gap-2 text-xl font-bold text-zinc-900 dark:text-zinc-100 md:flex">
          <Dices className="text-indigo-500" /> 티카투카
        </h2>
        {name && <Segmented size="md" options={MODE_TABS} value={view} onChange={setView} />}
        {name && (
          <div className="flex items-center gap-2 sm:ml-auto">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1.5 text-sm font-bold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
              <UserRound size={15} /> {name}
            </span>
            <button
              onClick={() => setNamePersist('')}
              className="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-2.5 py-1.5 text-xs font-bold text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:border-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <Pencil size={12} /> 이름 변경
            </button>
          </div>
        )}
      </div>

      {!name ? (
        <div className={CHROME}>
          <NamePicker allUserNames={pickNames} onPick={setNamePersist} />
        </div>
      ) : view === 'ranked' ? (
        <RankedView myName={name} />
      ) : view === 'free' ? (
        <TikatukaGame mode="free" />
      ) : view === 'pvp' ? (
        <div className={CHROME}>
          <TikatukaPvp myName={name} />
        </div>
      ) : (
        <div className={CHROME}>
          <TikatukaLeaderboard myName={name} />
        </div>
      )}
    </section>
  );
}

// ── 이름 선택 ─────────────────────────────────────────
const MANUAL = '__manual__';
function NamePicker({ allUserNames, onPick }: { allUserNames: string[]; onPick: (n: string) => void }) {
  const [sel, setSel] = useState('');
  const [manual, setManual] = useState('');
  const isManual = sel === MANUAL;
  const finalName = (isManual ? manual : sel).trim();

  return (
    <div className={`${cardClass} flex flex-col gap-4`}>
      <p className="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
        티카투카를 시작하려면 내 이름을 정해주세요. 이 이름으로 승점(TP)과 랭킹이 기록돼요.
      </p>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">이름 선택</span>
        <select value={sel} onChange={(e) => setSel(e.target.value)} className={`${inputClass} cursor-pointer font-bold`}>
          <option value="" disabled>
            이름을 선택하세요
          </option>
          {allUserNames.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
          <option value={MANUAL}>직접입력</option>
        </select>
      </label>

      {isManual && (
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="이름을 입력하세요"
          autoFocus
          className={`${inputClass} font-bold`}
        />
      )}

      <button onClick={() => finalName && onPick(finalName)} disabled={!finalName} className={`${btnPrimary} w-full`}>
        시작
      </button>
    </div>
  );
}

// ── 자유전 ────────────────────────────────────────────
// (TikatukaGame 자체가 난이도 선택/플레이 UI를 가짐)

// ── 랭크전 ────────────────────────────────────────────
function RankedView({ myName }: { myName: string }) {
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<'intro' | 'play'>('intro');
  const [tp, setTp] = useState(0);
  const [star, setStar] = useState<AiLevel>(0);
  const [resume, setResume] = useState<GameState | undefined>(undefined);
  const [gameKey, setGameKey] = useState(0);
  const [banner, setBanner] = useState<ApplyResultOutcome | null>(null);
  const stateRef = useRef<GameState | null>(null);
  const finishedRef = useRef(false);

  // 진입/복귀 시 플레이어 로드. 진행 중 게임(activeRanked)이 있으면 강제 이어하기(도망 방지).
  const load = async () => {
    setLoading(true);
    const p = await fetchPlayer(myName);
    setTp(p.tpAi);
    if (p.activeRanked) {
      setStar(p.activeRanked.star);
      setResume(p.activeRanked.state);
      setBanner(null);
      finishedRef.current = false;
      setGameKey((k) => k + 1);
      setPhase('play');
    } else {
      setStar(starForTp(p.tpAi));
      setResume(undefined);
      setPhase('intro');
    }
    setLoading(false);
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myName]);

  const begin = () => {
    setBanner(null);
    finishedRef.current = false;
    setResume(undefined);
    setGameKey((k) => k + 1);
    setPhase('play');
  };

  const handleStateChange = (s: GameState) => {
    stateRef.current = s;
    if (star == null) return;
    const boundary = (s.phase === 'rolling' || s.phase === 'aiThinking') && s.rolledDie === null && s.winner === null;
    if (!boundary) return;
    const active: ActiveRanked = { state: s, star, startedAt: new Date().toISOString() };
    saveActiveRanked(myName, active).catch((e) => console.error(e));
  };

  const handleFinish = async (result: ResultDetail, declaredByMe: boolean) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const out = await applyResult(myName, 'ai', {
      won: result.winner === 'me',
      isDraw: result.winner === 'draw',
      declared: declaredByMe,
      rankedStar: star,
    });
    await clearActiveRanked(myName);
    setBanner(out);
    setTp(out.after);
  };

  const handleReplay = async () => {
    const p = await fetchPlayer(myName);
    setTp(p.tpAi);
    setStar(starForTp(p.tpAi));
    begin();
  };

  const handleForfeit = async () => {
    const declared = stateRef.current?.tikatukaUsed.me ?? false;
    await applyResult(myName, 'ai', { won: false, declared, rankedStar: star });
    await clearActiveRanked(myName);
    load();
  };

  if (loading) {
    return (
      <div className={`${CHROME} flex flex-col items-center gap-3 py-12 text-zinc-400`}>
        <Dices size={28} className="animate-spin text-indigo-400" /> 불러오는 중…
      </div>
    );
  }

  if (phase === 'intro') {
    const next = tpToNextLevel(tp);
    return (
      <div className={CHROME}>
        <div className={`${cardClass} flex flex-col items-center gap-4 text-center`}>
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">내 랭크</span>
            <span className="text-3xl font-black text-indigo-600 dark:text-indigo-300">Lv.{levelForTp(tp)}</span>
            <span className="text-sm font-bold text-zinc-600 dark:text-zinc-300">{tp.toLocaleString()} TP</span>
            {next != null && <span className="text-xs text-zinc-400">다음 레벨까지 {next.toLocaleString()} TP</span>}
          </div>
          <div className="rounded-lg bg-zinc-50 px-4 py-2 text-sm font-bold text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300">
            매칭 상대 난이도 <span className="text-amber-500">★{star}</span>
          </div>
          <button onClick={begin} className={`${btnPrimary} w-full`}>
            랭크전 시작
          </button>
        </div>
      </div>
    );
  }

  return (
    <TikatukaGame
      key={gameKey}
      mode="ranked"
      fixedStar={star}
      resumeState={resume}
      tpBanner={banner && <TpBanner outcome={banner} />}
      onStateChange={handleStateChange}
      onFinish={handleFinish}
      onReplay={handleReplay}
      onExit={load}
      onForfeit={handleForfeit}
    />
  );
}

function TpBanner({ outcome }: { outcome: ApplyResultOutcome }) {
  const up = outcome.delta >= 0;
  const next = tpToNextLevel(outcome.after);
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg bg-zinc-50 px-4 py-3 dark:bg-zinc-800/60">
      <div className={`text-lg font-black ${up ? 'text-emerald-500' : 'text-rose-500'}`}>
        {up ? '+' : ''}
        {outcome.delta.toLocaleString()} TP
      </div>
      <div className="text-sm font-bold text-zinc-700 dark:text-zinc-200">
        Lv.{outcome.level} · {outcome.after.toLocaleString()} TP
      </div>
      {next != null && <div className="text-[11px] text-zinc-400">다음 레벨까지 {next.toLocaleString()} TP</div>}
    </div>
  );
}
