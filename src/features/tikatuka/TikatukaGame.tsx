// 티카투카 게임 루트 — 난이도 선택 / 플레이(보드+컨트롤) / 결과.
// mode='free': 기존 AI 자유전(TP 무관). mode='ranked': TP 레벨로 ★ 자동 매칭, 종료 시 TP 반영(콜백).
import { useState, useEffect, useRef } from 'react';
import { Dices, Hand, Megaphone, Sparkles, Trophy, RotateCcw, Info, Lightbulb, Check } from 'lucide-react';
import { useTikatuka } from './useTikatuka';
import { isFieldFull } from './engine';
import { canDeclareTikatuka } from './reducer';
import { recommendMove, recommendChoose, recommendShield, recommendHold, recommendFirstShield, estimateWinRate } from './ai';
import type { Factor } from './ai';
import { AdvicePanel } from './components/AdvicePanel';
import { Board } from './components/Board';
import { DiceTray } from './components/DiceTray';
import type { RollAnim } from './components/DiceTray';
import type { AiLevel, GameState, LineIndex, Owner, ResultDetail } from './types';
import { cardClass, subtitleClass, btnPrimary, CHROME, GAME } from './ui';
import './tikatuka.css';

export type TikatukaMode = 'free' | 'ranked';

const LEVELS: { lv: AiLevel; name: string; desc: string }[] = [
  { lv: 0, name: '★☆☆☆☆ 랜덤', desc: '완전 무작위' },
  { lv: 1, name: '★★☆☆☆ 하수', desc: '탐욕적 자기합' },
  { lv: 2, name: '★★★☆☆ 중수', desc: '2라인 승리 전략' },
  { lv: 3, name: '★★★★☆ 상수', desc: '타짜·캡·필드잠금' },
  { lv: 4, name: '★★★★★ 고수', desc: '기대값 기반' },
  { lv: 5, name: '★★★★★ 마스터', desc: '몬테카를로 탐색' },
];

// PC(≥1024px) 여부 — PC면 가로 큰 레이아웃, 아니면 모바일 레이아웃을 그대로 렌더(둘 중 하나만 마운트).
function useIsPc(): boolean {
  const query = '(min-width: 1024px)';
  const [isPc, setIsPc] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setIsPc(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return isPc;
}

export interface TikatukaGameProps {
  onClose?: () => void;
  mode?: TikatukaMode; // 기본 'free'
  fixedStar?: AiLevel; // ranked: 매칭된 ★ (난이도 선택 숨김, 자동 시작)
  resumeState?: GameState; // ranked: 저장된 진행 게임 복원
  tpBanner?: React.ReactNode; // ranked: 결과 위에 표시할 TP 변동 배너
  onFinish?: (result: ResultDetail, declaredByMe: boolean) => void; // 종료 시 1회
  onStateChange?: (state: GameState) => void; // 매 상태 변경(랭크 영속용)
  onReplay?: () => void; // ranked 다시하기(부모가 재매칭/영속 처리)
  onExit?: () => void; // 허브로 나가기
  onForfeit?: () => void; // ranked 기권(진행 중)
}

export function TikatukaGame({
  onClose,
  mode = 'free',
  fixedStar,
  resumeState,
  tpBanner,
  onFinish,
  onStateChange,
  onReplay,
  onExit,
  onForfeit,
}: TikatukaGameProps) {
  const g = useTikatuka(resumeState);
  const { state } = g;
  const ranked = mode === 'ranked';
  const [level, setLevel] = useState<AiLevel>(fixedStar ?? 3);
  const [assist, setAssist] = useState(false); // 지원 모드: 수 추천 + 이유 (랭크전 비활성)

  // 랭크전: 난이도 선택 화면을 건너뛰고 매칭 ★로 자동 시작(복원 게임이 없을 때만).
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (ranked && !resumeState && state.phase === 'coinToss' && fixedStar != null && !autoStartedRef.current) {
      autoStartedRef.current = true;
      g.start(fixedStar);
    }
  }, [ranked, resumeState, state.phase, fixedStar, g]);

  // 상태 변경 통지(랭크 영속).
  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);

  // 종료 시 결과 콜백 1회.
  const finishedRef = useRef(false);
  useEffect(() => {
    if (state.phase === 'gameOver' && state.result && !finishedRef.current) {
      finishedRef.current = true;
      onFinish?.(state.result, state.tikatukaUsed.me);
    }
    if (state.phase !== 'gameOver') finishedRef.current = false;
  }, [state.phase, state.result, state.tikatukaUsed.me, onFinish]);
  const [adviceOpen, setAdviceOpen] = useState(false); // 추천 근거 펼침(기본 접힘 — 모바일 한 화면 유지)
  const isPc = useIsPc(); // PC(≥1024px)면 가로 큰 레이아웃, 아니면 모바일 레이아웃 그대로
  // 지원 모드 추천 — 깊은 몬테카를로라 무거움. 페인트를 막지 않도록 렌더가 아니라 페인트 후(effect)에 계산.
  // 보드/주사위는 즉시 보이고, 추천은 곧이어 표시됨. 상태가 바뀔 때만 재계산.
  const [advice, setAdvice] = useState<AdviceView | null>(null);
  useEffect(() => {
    if (!assist) {
      setAdvice(null);
      return;
    }
    let alive = true;
    const id = setTimeout(() => {
      if (alive) setAdvice(computeAdvice(state, assist));
    }, 0);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [state, assist]);

  // ── 랭크전: 난이도 선택 없이 매칭 ★로 자동 시작(coinToss 잠깐 표시) ──
  if (ranked && state.phase === 'coinToss') {
    return (
      <div className={`${CHROME} flex flex-col items-center gap-4 py-10 text-center`}>
        <Dices size={36} className="animate-spin text-indigo-500" />
        <div className="text-lg font-bold text-zinc-700 dark:text-zinc-200">
          상대 매칭 중… {fixedStar != null && <span className="text-amber-500">★{fixedStar}</span>}
        </div>
        {onExit && (
          <button onClick={onExit} className="text-xs font-bold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
            나가기
          </button>
        )}
      </div>
    );
  }

  // ── 난이도 선택 화면(자유전) ──
  if (state.phase === 'coinToss') {
    return (
      <div className={`${CHROME} flex flex-col gap-4`}>
        <Intro />
        <div className={cardClass}>
          <div className={subtitleClass}>컴퓨터 난이도</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {LEVELS.map((l) => (
              <button
                key={l.lv}
                onClick={() => setLevel(l.lv)}
                className={`flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-colors ${
                  level === l.lv
                    ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-500 dark:bg-indigo-950/40'
                    : 'border-zinc-200 bg-white hover:border-indigo-300 dark:border-zinc-700 dark:bg-zinc-900/50'
                }`}
              >
                <span className="text-xs font-bold text-amber-500">{l.name}</span>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{l.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 지원 모드 토글 */}
        <button
          type="button"
          onClick={() => setAssist((v) => !v)}
          className={`${cardClass} flex items-center justify-between gap-3 text-left transition-colors ${
            assist ? 'border-emerald-400 dark:border-emerald-700' : ''
          }`}
        >
          <span className="flex items-start gap-2">
            <Lightbulb size={16} className={`mt-0.5 shrink-0 ${assist ? 'text-emerald-500' : 'text-zinc-400'}`} />
            <span className="flex flex-col">
              <span className="text-sm font-bold text-zinc-700 dark:text-zinc-200">지원 모드</span>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">어디에 두고/밀고, 타짜 쓸지 추천 + 이유를 알려줘요</span>
            </span>
          </span>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
              assist ? 'bg-emerald-500 text-white' : 'bg-zinc-200 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-300'
            }`}
          >
            {assist ? 'ON' : 'OFF'}
          </span>
        </button>

        <button onClick={() => g.start(level)} className={`${btnPrimary} w-full`}>
          <Dices size={18} /> 게임 시작 (선공 무작위)
        </button>
      </div>
    );
  }

  // 내 필드가 전부 풀이면 어떤 눈이 나와도 둘 곳/밀 곳이 없음 → 굴리지 않고 패스(굴림 연출도 생략).
  const myAllFull =
    state.turn === 'me' &&
    ([0, 1, 2] as LineIndex[]).every((l) => isFieldFull(state.board, l, 'me'));

  // 트레이 굴림 연출 — 내 쪽은 상태에서 파생, 상대 쪽은 타이머 공개값(aiReveal)에서.
  const meAnim: RollAnim | null =
    state.turn === 'me' && state.phase === 'rolling'
      ? myAllFull
        ? null // 둘 곳 없음 — 굴리는 연출 없이 패스 대기
        : { owner: 'me', values: [], tumbling: true, chosen: null }
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
  // 상대 필드가 전부 풀이면 AI도 어떤 눈이든 둘 곳/밀 곳이 없음 → 굴리지 않고 패스(연출 생략).
  const aiAllFull =
    state.turn === 'ai' &&
    ([0, 1, 2] as LineIndex[]).every((l) => isFieldFull(state.board, l, 'ai'));

  // 상대 트레이: 굴리는 중엔 tumbling, 눈이 나오면 정착 표시. 못 굴리면(필드 풀) 연출 없이 패스.
  const aiAnim: RollAnim | null =
    state.turn === 'ai' && state.phase === 'aiThinking'
      ? g.aiReveal
        ? { owner: 'ai', values: g.aiReveal.values, tumbling: false, chosen: g.aiReveal.chosen }
        : aiAllFull
          ? null
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
  const tikatukaEnabled = canDeclareTikatuka(state, 'me');
  const tikatukaTip = state.tikatukaUsed.me
    ? '이미 선언함'
    : `주사위 10개+부터 3턴간 가능 · 선언 시 -200 TP, 승리 시 +400 TP${state.tikatukaWindow ? ` (남은 ${state.tikatukaWindow}턴)` : ''}`;

  // 추천 패널(헤드라인 + 접기) — PC/모바일 공용 컴포넌트.
  const advicePanel = advice && (
    <AdvicePanel
      headline={advice.headline}
      factors={advice.factors}
      isHold={advice.isHold}
      winRate={advice.winRate}
      open={adviceOpen}
      onToggle={() => setAdviceOpen((v) => !v)}
    />
  );

  // ── PC(데스크톱) 레이아웃 — 트레이를 보드 양옆, 큼직하게. 모바일은 아래 기본 return 그대로(미변경). ──
  if (isPc) {
    const boardEl = (
      <Board
        state={state}
        flingIds={g.flingIds}
        pushFx={g.pushFx}
        aiShieldTarget={g.aiShieldTarget}
        adviceTarget={advice && advice.line != null && advice.side ? { line: advice.line, side: advice.side } : null}
        size="lg"
        onPlace={g.place}
        onPush={g.push}
        onPlaceShield={g.placeShield}
      />
    );
    const trayMe = (
      <DiceTray
        owner="me"
        active={state.turn === 'me'}
        anim={meAnim}
        shield={
          state.phase === 'placingShield' && state.turn === 'me'
            ? state.pendingShield
            : state.turn === 'me' && state.phase === 'acting' && state.rolledDie?.shield
              ? state.rolledDie
              : null
        }
        pickable={state.phase === 'choosingDie' && state.turn === 'me'}
        onPick={g.chooseDie}
        hint={
          state.phase === 'rolling' && myAllFull
            ? '둘 곳 없음 — 패스'
            : state.phase === 'placingShield' && state.turn === 'me'
              ? '쉴드 놓을 칸 선택'
              : state.phase === 'choosingDie' && state.turn === 'me'
                ? '하나 선택'
                : undefined
        }
        size="lg"
      />
    );
    const trayAi = (
      <DiceTray
        owner="ai"
        active={state.turn === 'ai'}
        anim={aiAnim}
        shield={aiPlacingShield ? state.pendingShield : null}
        hint={
          aiAllFull && !g.aiReveal
            ? '둘 곳 없음 — 패스'
            : aiPlacingShield
              ? '쉴드 둘 곳 고민…'
              : aiPondering
                ? '고민 중…'
                : undefined
        }
        size="lg"
      />
    );
    return (
      <div className={`${GAME} flex flex-col gap-5`}>
        {/* 간단 상단바 — 나 / 컴퓨터 + 현재 턴. 게임 종료 시엔 결과 패널이 점수를 표시하므로 숨김(중복 방지). */}
        {state.winner === null && (
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <div className="justify-self-start">
              <PcPlayerTag owner="me" label="나" active={myTurn} note={state.held ? '홀드 중' : undefined} />
            </div>
            <div className="flex items-center justify-self-center gap-3">
              {state.tikatukaUsed.me && <span className="text-sm font-bold text-fuchsia-500">티카투카!</span>}
              {ranked ? (
                onForfeit && (
                  <button
                    type="button"
                    onClick={onForfeit}
                    title="기권하면 패배로 기록됩니다"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-rose-100 px-4 py-2 text-sm font-bold text-rose-600 hover:bg-rose-200 dark:bg-rose-950/40 dark:text-rose-300"
                  >
                    기권
                  </button>
                )
              ) : (
                <button
                  type="button"
                  onClick={() => setAssist((v) => !v)}
                  title="수 추천 + 이유 보기"
                  className={`inline-flex shrink-0 touch-manipulation select-none items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                    assist ? 'bg-emerald-500 text-white' : 'bg-zinc-200 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  <Lightbulb size={16} /> 지원 {assist ? 'ON' : 'OFF'}
                </button>
              )}
            </div>
            <div className="justify-self-end">
              <PcPlayerTag owner="ai" label={`컴퓨터 ★${state.aiLevel}`} active={state.turn === 'ai'} />
            </div>
          </div>
        )}

        {/* 본문 가로: 내 트레이 | 보드 | 상대 트레이 */}
        {state.winner === null ? (
          <div className="flex items-stretch justify-center gap-5">
            {trayMe}
            <div className="min-w-0 flex-1">{boardEl}</div>
            {trayAi}
          </div>
        ) : (
          boardEl
        )}

        {advicePanel}

        {/* 버튼 — 큼직 */}
        {state.winner === null && (
          <div className="flex flex-wrap items-center justify-center gap-3">
            <GameBtn
              onClick={g.useTazza}
              disabled={!tazzaEnabled}
              icon={<Dices size={18} />}
              label="타짜의 손놀림"
              tip={state.tazzaUsed.me ? '이미 사용함 (게임당 1회)' : '주사위를 하나 더 굴려 둘 중 선택'}
              size="lg"
            />
            <GameBtn
              onClick={g.hold}
              disabled={!holdEnabled}
              icon={<Hand size={18} />}
              label="홀드"
              tip="나는 더 던지지 않음. 컴퓨터 필드가 다 차면 종료"
              size="lg"
            />
            <GameBtn
              onClick={g.tikatuka}
              disabled={!tikatukaEnabled}
              icon={<Megaphone size={18} />}
              label="티카투카!"
              tip={tikatukaTip}
              accent
              size="lg"
            />
          </div>
        )}

        {state.phase === 'gameOver' && state.result && (
          <ResultPanel
            result={state.result}
            ranked={ranked}
            tpBanner={tpBanner}
            onReplay={ranked ? (onReplay ?? (() => g.start(fixedStar ?? state.aiLevel))) : () => g.start(state.aiLevel)}
            onSetup={ranked ? onExit : g.reset}
          />
        )}

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

  return (
    <div className={`${GAME} flex flex-col gap-4`}>
      {/* 상태 바 */}
      <div className="flex items-center justify-between gap-2 rounded-xl bg-zinc-50 py-2 text-xs font-bold dark:bg-zinc-900/50">
        <span className="text-zinc-500">
          난이도 <span className="text-amber-500">★{state.aiLevel}</span>
          {state.held && <span className="ml-2 text-indigo-500">홀드 중</span>}
          {state.tikatukaUsed.me && <span className="ml-2 text-fuchsia-500">티카투카!</span>}
        </span>
        <div className="flex items-center gap-2">
          {ranked ? (
            onForfeit && (
              <button
                type="button"
                onClick={onForfeit}
                title="기권하면 패배로 기록됩니다"
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-100 px-2 py-1 text-[11px] font-bold text-rose-600 dark:bg-rose-950/40 dark:text-rose-300"
              >
                기권
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={() => setAssist((v) => !v)}
              title="수 추천 + 이유 보기"
              className={`inline-flex shrink-0 touch-manipulation select-none items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold transition-colors ${
                assist
                  ? 'bg-emerald-500 text-white'
                  : 'bg-zinc-200 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-300'
              }`}
            >
              <Lightbulb size={12} /> 지원 {assist ? 'ON' : 'OFF'}
            </button>
          )}
        </div>
      </div>

      <Board
        state={state}
        flingIds={g.flingIds}
        pushFx={g.pushFx}
        aiShieldTarget={g.aiShieldTarget}
        adviceTarget={advice && advice.line != null && advice.side ? { line: advice.line, side: advice.side } : null}
        onPlace={g.place}
        onPush={g.push}
        onPlaceShield={g.placeShield}
      />

      {advicePanel}

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
                state.phase === 'rolling' && myAllFull
                  ? '둘 곳 없음 — 패스'
                  : state.phase === 'placingShield' && state.turn === 'me'
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
                aiAllFull && !g.aiReveal
                  ? '둘 곳 없음 — 패스'
                  : aiPlacingShield
                    ? '쉴드 둘 곳 고민…'
                    : aiPondering
                      ? '고민 중…'
                      : undefined
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
              tip={tikatukaTip}
              accent
            />
          </div>
        </div>
      )}

      {/* 결과 */}
      {state.phase === 'gameOver' && state.result && (
        <ResultPanel
          result={state.result}
          ranked={ranked}
          tpBanner={tpBanner}
          onReplay={ranked ? (onReplay ?? (() => g.start(fixedStar ?? state.aiLevel))) : () => g.start(state.aiLevel)}
          onSetup={ranked ? onExit : g.reset}
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

// PC 상단바 진영 태그 — 이름 + 현재 턴(TURN) 표시. 아바타 이미지·TP는 제외(간단 상단바).
function PcPlayerTag({ owner, label, active, note }: { owner: Owner; label: string; active?: boolean; note?: string }) {
  const tone = owner === 'me' ? 'text-indigo-600 dark:text-indigo-300' : 'text-rose-600 dark:text-rose-300';
  const ring = active
    ? owner === 'me'
      ? 'border-indigo-400 bg-indigo-50 dark:border-indigo-600 dark:bg-indigo-950/40'
      : 'border-rose-400 bg-rose-50 dark:border-rose-600 dark:bg-rose-950/40'
    : 'border-zinc-200 dark:border-zinc-800';
  return (
    <div className={`flex items-center gap-2 rounded-2xl border px-4 py-2.5 ${ring}`}>
      <span className={`text-base font-bold ${tone}`}>{label}</span>
      {active && (
        <span
          className={`inline-flex shrink-0 items-center justify-center rounded-full p-0.5 text-white ${owner === 'me' ? 'bg-indigo-500' : 'bg-rose-500'}`}
          title={owner === 'me' ? '내 차례' : '상대 차례'}
        >
          <Check size={14} strokeWidth={3} />
        </span>
      )}
      {note && <span className="text-xs font-bold text-indigo-500">{note}</span>}
    </div>
  );
}

function GameBtn({
  onClick,
  disabled,
  icon,
  label,
  tip,
  accent,
  size,
}: {
  onClick: () => void;
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
  tip: string;
  accent?: boolean;
  size?: 'lg';
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={tip}
      className={`inline-flex touch-manipulation select-none items-center gap-1.5 font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        size === 'lg' ? 'rounded-xl px-6 py-4 text-base' : 'rounded-lg px-3 py-2.5 text-xs'
      } ${
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
  ranked,
  tpBanner,
}: {
  result: NonNullable<ReturnType<typeof useTikatuka>['state']['result']>;
  onReplay: () => void;
  onSetup?: () => void;
  ranked?: boolean;
  tpBanner?: React.ReactNode;
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
      {tpBanner}
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
        {onSetup && (
          <button
            onClick={onSetup}
            className="rounded-xl bg-zinc-100 px-4 py-2.5 text-sm font-bold text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            {ranked ? '나가기' : '난이도 변경'}
          </button>
        )}
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

// 지원 모드 추천 — 현재 단계에 맞는 추천(+근거)과 강조 대상. 내 차례·행동 단계에서만.
interface AdviceView {
  headline: string;
  factors: Factor[];
  line?: LineIndex; // 강조할 라인
  side?: Owner; // 강조할 필드(내/상대)
  chooseIndex?: 0 | 1; // 타짜 택1 추천
  isTazza?: boolean;
  isHold?: boolean; // 홀드 추천(보드 강조 없음, 홀드 버튼 권장)
  winRate?: number; // 예상 승률(0~1)
}

function computeAdvice(s: GameState, assist: boolean): AdviceView | null {
  if (!assist) return null;
  if (s.turn !== 'me' || s.winner !== null) return null;
  const base = computeAdviceBase(s);
  return base ? { ...base, winRate: estimateWinRate(s.board, 'me') } : null;
}

function computeAdviceBase(s: GameState): AdviceView | null {
  // 2라인 리드가 고정돼 역전 불가면 홀드를 최우선 추천(더 던지지 말 것).
  if ((s.phase === 'acting' || s.phase === 'rolling') && !s.held) {
    const h = recommendHold(s.board, 'me');
    if (h) return { headline: h.headline, factors: h.factors, isHold: true };
  }

  // 선공 첫 주사위는 쉴드 — 어느 라인 내 필드에 둘지 추천.
  if (s.phase === 'acting' && s.rolledDie && s.rolledDie.shield) {
    const a = recommendFirstShield(s.board, 'me', s.rolledDie.value, !s.tazzaUsed.me);
    if (!a) return null;
    return { headline: a.headline, factors: a.factors, line: a.line, side: a.owner };
  }
  if (s.phase === 'acting' && s.rolledDie && !s.rolledDie.shield) {
    const a = recommendMove(s.board, 'me', s.rolledDie.value, !s.tazzaUsed.me);
    if (!a) return null;
    return {
      headline: a.headline,
      factors: a.factors,
      line: a.line,
      side: a.action === 'push' ? 'ai' : a.action === 'place' ? 'me' : undefined,
      isTazza: a.action === 'tazza',
    };
  }
  if (s.phase === 'choosingDie' && s.rolledChoices) {
    const [d0, d1] = s.rolledChoices;
    // 선공 첫 턴 타짜 → 둘 다 쉴드. 더 높은 값을 골라 밀리지 않는 앵커로.
    if (d0.shield) {
      const index: 0 | 1 = d1.value > d0.value ? 1 : 0;
      const chosen = s.rolledChoices[index].value;
      return {
        headline: `${chosen}를 선택`,
        factors: [
          { tag: '자원', text: `둘 다 쉴드예요(선공 첫 턴). 더 높은 ${chosen}을(를) 골라 밀리지 않는 고점 앵커로 쓰세요.` },
        ],
        chooseIndex: index,
      };
    }
    const a = recommendChoose(s.board, 'me', [d0.value, d1.value]);
    return { headline: a.headline, factors: a.factors, chooseIndex: a.index };
  }
  if (s.phase === 'placingShield' && s.pendingShield) {
    const a = recommendShield(s.board, 'me', s.pendingShield.value);
    if (!a) return null;
    return { headline: a.headline, factors: a.factors, line: a.line, side: a.owner };
  }
  return null;
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
