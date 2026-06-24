// 티카투카 게임 루트 — 난이도 선택 / 플레이(보드+컨트롤) / 결과.
import { useState } from 'react';
import { Dices, Hand, Megaphone, Sparkles, Trophy, RotateCcw, Info } from 'lucide-react';
import { useTikatuka } from './useTikatuka';
import { Board } from './components/Board';
import { DiceTray } from './components/DiceTray';
import type { RollAnim } from './components/DiceTray';
import type { AiLevel } from './types';
import './tikatuka.css';

const LEVELS: { lv: AiLevel; name: string; desc: string }[] = [
  { lv: 0, name: '★☆☆☆☆ 랜덤', desc: '완전 무작위' },
  { lv: 1, name: '★★☆☆☆ 하수', desc: '탐욕적 자기합' },
  { lv: 2, name: '★★★☆☆ 중수', desc: '2라인 승리 전략' },
  { lv: 3, name: '★★★★☆ 상수', desc: '타짜·캡·필드잠금' },
  { lv: 4, name: '★★★★★ 고수', desc: '기대값 기반' },
  { lv: 5, name: '★★★★★ 마스터', desc: '몬테카를로 탐색' },
];

export function TikatukaGame({ onClose }: { onClose?: () => void }) {
  const g = useTikatuka();
  const { state } = g;
  const [level, setLevel] = useState<AiLevel>(2);

  // ── 난이도 선택 화면 ──
  if (state.phase === 'coinToss') {
    return (
      <div className="flex flex-col gap-5">
        <Intro />
        <div>
          <div className="mb-2 text-sm font-bold text-zinc-700 dark:text-zinc-300">컴퓨터 난이도</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {LEVELS.map((l) => (
              <button
                key={l.lv}
                onClick={() => setLevel(l.lv)}
                className={`flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-colors ${
                  level === l.lv
                    ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-500 dark:bg-indigo-950/40'
                    : 'border-zinc-200 bg-white hover:border-indigo-300 dark:border-zinc-800 dark:bg-zinc-900/50'
                }`}
              >
                <span className="text-xs font-bold text-amber-500">{l.name}</span>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{l.desc}</span>
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => g.start(level)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-3.5 text-base font-bold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-500"
        >
          <Dices size={18} /> 게임 시작 (선공 무작위)
        </button>
      </div>
    );
  }

  // 트레이 굴림 연출 — 내 쪽은 상태에서 파생, 상대 쪽은 타이머 공개값(aiReveal)에서.
  const meAnim: RollAnim | null =
    state.turn === 'me' && state.phase === 'rolling'
      ? { owner: 'me', values: [], tumbling: true, chosen: null }
      : state.turn === 'me' && state.phase === 'choosingDie' && state.rolledChoices
        ? {
            owner: 'me',
            values: [state.rolledChoices[0].value, state.rolledChoices[1].value],
            tumbling: false,
            chosen: null,
          }
        : state.turn === 'me' && state.phase === 'acting' && state.rolledDie
          ? { owner: 'me', values: [state.rolledDie.value], tumbling: false, chosen: null }
          : null;
  // 상대 트레이: 굴리는 중엔 tumbling, 눈이 나오면 정착 표시.
  const aiAnim: RollAnim | null =
    state.turn === 'ai' && state.phase === 'aiThinking'
      ? g.aiReveal
        ? { owner: 'ai', values: g.aiReveal.values, tumbling: false, chosen: g.aiReveal.chosen }
        : { owner: 'ai', values: [], tumbling: true, chosen: null }
      : null;
  // 굴림은 고민 없이 바로. 고민은 '눈이 나온 뒤' — 어디 놓을지/밀어낼지 정하는 동안 표시.
  const aiPondering =
    state.turn === 'ai' && state.phase === 'aiThinking' && !!g.aiReveal;
  // AI가 밀어내고 얻은 쉴드 — 트레이에 보여주며 둘 곳 고민.
  const aiPlacingShield = state.turn === 'ai' && state.phase === 'placingShield';

  const myTurn = state.turn === 'me' && state.winner === null;
  const tazzaEnabled = myTurn && state.phase === 'acting' && !state.tazzaUsed.me;
  const holdEnabled = myTurn && (state.phase === 'acting' || state.phase === 'rolling') && !state.held;
  const tikatukaEnabled =
    myTurn && !state.tikatukaUsed && state.phase !== 'rolling';

  return (
    <div className="flex flex-col gap-4">
      {/* 상태 바 */}
      <div className="flex items-center justify-between gap-2 rounded-xl bg-zinc-50 px-3 py-2 text-xs font-bold dark:bg-zinc-900/50">
        <span className="text-zinc-500">
          난이도 <span className="text-amber-500">★{state.aiLevel}</span>
          {state.held && <span className="ml-2 text-indigo-500">홀드 중</span>}
          {state.tikatukaUsed && <span className="ml-2 text-fuchsia-500">티카투카!</span>}
        </span>
        <StatusText state={state} />
      </div>

      <Board
        state={state}
        flingIds={g.flingIds}
        pushFx={g.pushFx}
        aiShieldTarget={g.aiShieldTarget}
        onPlace={g.place}
        onPush={g.push}
        onPlaceShield={g.placeShield}
      />

      {/* 주사위 던지는 곳 — 내 주사위(왼쪽) / 상대 주사위(오른쪽) */}
      {state.winner === null && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="grid w-full grid-cols-2 gap-2.5">
            <DiceTray
              owner="me"
              active={state.turn === 'me'}
              anim={meAnim}
              shield={
                state.phase === 'placingShield' && state.turn === 'me'
                  ? state.pendingShield
                  : state.turn === 'me' && state.phase === 'acting' && state.rolledDie?.shield
                    ? state.rolledDie // 선공 첫 쉴드 주사위 — 트레이에 쉴드로 표시
                    : null
              }
              pickable={state.phase === 'choosingDie' && state.turn === 'me'}
              onPick={g.chooseDie}
              hint={
                state.phase === 'placingShield' && state.turn === 'me'
                  ? '쉴드 놓을 칸 선택'
                  : state.phase === 'choosingDie' && state.turn === 'me'
                    ? '하나 선택'
                    : undefined
              }
            />
            <DiceTray
              owner="ai"
              active={state.turn === 'ai'}
              anim={aiAnim}
              shield={aiPlacingShield ? state.pendingShield : null}
              hint={
                aiPlacingShield ? '쉴드 둘 곳 고민…' : aiPondering ? '고민 중…' : undefined
              }
            />
          </div>

          {/* 버튼 */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <GameBtn
              onClick={g.useTazza}
              disabled={!tazzaEnabled}
              icon={<Dices size={14} />}
              label="타짜의 손놀림"
              tip={state.tazzaUsed.me ? '이미 사용함 (게임당 1회)' : '주사위를 하나 더 굴려 둘 중 선택'}
            />
            <GameBtn
              onClick={g.hold}
              disabled={!holdEnabled}
              icon={<Hand size={14} />}
              label="홀드"
              tip="나는 더 던지지 않음. 컴퓨터 필드가 다 차면 종료"
            />
            <GameBtn
              onClick={g.tikatuka}
              disabled={!tikatukaEnabled}
              icon={<Megaphone size={14} />}
              label="티카투카!"
              tip={state.tikatukaUsed ? '이미 외침' : '패널티 없음. 이기면 보너스 승점'}
              accent
            />
          </div>
        </div>
      )}

      {/* 결과 */}
      {state.phase === 'gameOver' && state.result && (
        <ResultPanel
          result={state.result}
          onReplay={() => g.start(state.aiLevel)}
          onSetup={g.reset}
        />
      )}

      {/* 로그 */}
      <Log lines={state.log} />

      {onClose && state.phase === 'gameOver' && (
        <button
          onClick={onClose}
          className="text-xs font-bold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          닫기
        </button>
      )}
    </div>
  );
}

function StatusText({ state }: { state: ReturnType<typeof useTikatuka>['state'] }) {
  let msg = '';
  if (state.winner !== null) msg = '게임 종료';
  else if (state.turn === 'ai') msg = '컴퓨터가 두는 중...';
  else if (state.phase === 'rolling') msg = '주사위 굴리는 중...';
  else if (state.phase === 'choosingDie') msg = '두 주사위 중 선택';
  else if (state.phase === 'placingShield') msg = '쉴드 놓을 칸 선택 (낮으면 상대, 높으면 내 필드)';
  else if (state.phase === 'acting') msg = '배치할 라인 또는 밀어낼 상대 주사위 선택';
  return <span className="text-indigo-600 dark:text-indigo-400">{msg}</span>;
}

function GameBtn({
  onClick,
  disabled,
  icon,
  label,
  tip,
  accent,
}: {
  onClick: () => void;
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
  tip: string;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={tip}
      className={`inline-flex touch-manipulation select-none items-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        accent
          ? 'bg-fuchsia-600 text-white hover:bg-fuchsia-500'
          : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700'
      }`}
    >
      {icon} {label}
    </button>
  );
}

function ResultPanel({
  result,
  onReplay,
  onSetup,
}: {
  result: NonNullable<ReturnType<typeof useTikatuka>['state']['result']>;
  onReplay: () => void;
  onSetup: () => void;
}) {
  const headline =
    result.winner === 'me' ? '승리!' : result.winner === 'ai' ? '패배' : '무승부';
  const color =
    result.winner === 'me'
      ? 'text-indigo-600 dark:text-indigo-300'
      : result.winner === 'ai'
        ? 'text-rose-600 dark:text-rose-300'
        : 'text-zinc-500';
  const tiebreak = result.meLineWins < 2 && result.aiLineWins < 2;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="flex items-center justify-center gap-2">
        <Trophy size={22} className={color} />
        <span className={`text-2xl font-black ${color}`}>{headline}</span>
        {result.tikatukaBonus && (
          <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-100 px-2 py-0.5 text-xs font-bold text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300">
            <Sparkles size={12} /> 티카투카 보너스
          </span>
        )}
      </div>
      <div className="text-center text-sm font-bold">
        <span className="text-rose-500">컴퓨터 {result.aiLineWins}라인</span>
        <span className="mx-2 text-zinc-300">vs</span>
        <span className="text-indigo-500">나 {result.meLineWins}라인</span>
      </div>
      <div className="text-center text-xs text-zinc-500 dark:text-zinc-400">
        전체 총합 — 컴퓨터 {result.aiTotal} : 나 {result.meTotal}
        {tiebreak && <span className="ml-1 text-amber-500">(총합 타이브레이커 적용)</span>}
      </div>
      <div className="flex gap-2">
        <button
          onClick={onReplay}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-white hover:bg-indigo-500"
        >
          <RotateCcw size={15} /> 다시하기
        </button>
        <button
          onClick={onSetup}
          className="rounded-xl bg-zinc-100 px-4 py-2.5 text-sm font-bold text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          난이도 변경
        </button>
      </div>
    </div>
  );
}

function Log({ lines }: { lines: string[] }) {
  const [open, setOpen] = useState(false);
  if (lines.length === 0) return null;
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-bold text-zinc-500"
      >
        진행 기록 ({lines.length})
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="max-h-40 overflow-y-auto border-t border-zinc-100 px-3 py-2 text-[11px] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          {lines.map((l, i) => (
            <div key={i} className="py-0.5">
              {l}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Intro() {
  return (
    <div className="flex gap-2 rounded-xl bg-indigo-50 p-3 text-[11px] leading-relaxed text-indigo-900/80 dark:bg-indigo-950/30 dark:text-indigo-200/80">
      <Info size={16} className="mt-0.5 shrink-0 text-indigo-500" />
      <div>
        3개 라인 중 <b>2개 이상</b>에서 주사위 합으로 이기면 승리(1승1패1무는 전체 총합으로 결정).
        턴마다 주사위가 자동으로 굴려집니다. 내 필드에 배치하거나, 같은 라인 상대 주사위와 숫자가 같으면
        밀어낼 수 있어요(밀면 <b>쉴드</b> 1개 획득). <b>선공의 첫 주사위는 쉴드</b>로 시작해요(밀어낼 수 없는 보호 주사위).
        타짜(1회)·홀드·티카투카를 활용하세요.
      </div>
    </div>
  );
}
