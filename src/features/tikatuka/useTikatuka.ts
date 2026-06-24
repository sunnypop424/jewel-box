// 티카투카 게임 훅 — useReducer(순수) + 연출 레이어(굴림/배치/밀어내기 애니메이션).
// 엔진/리듀서는 순수, 난수·타이머·애니메이션 상태는 여기서만 다룬다.
// 플레이어 트레이 표시는 게임 상태에서 곧바로 파생(파생 가능 → effect 불필요),
// AI 턴만 '굴림 → 행동' 과정을 타이머로 쪼개 눈에 보이게 재생한다.

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { isFieldFull, legalMoves, pushTargets, rollValue } from './engine';
import { decideAi } from './ai';
import { initialState, reducer } from './reducer';
import type { AiLevel, DieValue, LineIndex } from './types';

const ROLL_TUMBLE = 480; // 굴림(면 교체) 지속
const SETTLE_BEAT = 620; // 정착(tk-settle 520ms) 재생 + 잠깐 멈춤 뒤 행동
const FLING_MS = 480; // 밀어내기(날아가기) — tikatuka.css의 tk-fling과 일치
const PASS_DELAY = 520; // 둘 곳 없음 자동 패스 연출

// AI 굴림의 '정착' 시점(타이머로 비동기 공개). null이면 아직 굴리는 중(tumbling).
export interface AiReveal {
  values: DieValue[];
  chosen: number | null;
}

export function useTikatuka() {
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState(2));
  const [aiReveal, setAiReveal] = useState<AiReveal | null>(null);
  const [flingIds, setFlingIds] = useState<string[]>([]);
  const lockRef = useRef(false); // 밀어내기 연출 중 중복 입력 차단

  // 1) 플레이어 턴 시작 → 굴림 연출 시간 뒤 자동 굴림 확정
  useEffect(() => {
    if (state.phase === 'rolling' && state.turn === 'me') {
      const id = setTimeout(
        () => dispatch({ type: 'ROLL', die: { value: rollValue(Math.random) } }),
        ROLL_TUMBLE
      );
      return () => clearTimeout(id);
    }
  }, [state.phase, state.turn]);

  // 2) 플레이어 합법수 없음(내 필드 전부 풀) → 자동 패스(일시적)
  useEffect(() => {
    if (state.phase === 'acting' && state.turn === 'me' && state.rolledDie) {
      const moves = legalMoves(state.board, 'me', state.rolledDie.value);
      const allFull = ([0, 1, 2] as LineIndex[]).every((l) => isFieldFull(state.board, l, 'me'));
      if (moves.length === 0 && allFull) {
        const id = setTimeout(() => dispatch({ type: 'AUTO_HOLD' }), PASS_DELAY);
        return () => clearTimeout(id);
      }
    }
  }, [state.phase, state.turn, state.rolledDie, state.board]);

  // 3) AI 턴 → decideAi 후 '굴림 → (택1 강조) → 행동'을 단계별 연출하고 마지막에 커밋.
  //    모든 setState는 타이머 콜백 안에서만(효과 본문 동기 호출 금지).
  useEffect(() => {
    if (state.phase !== 'aiThinking' || state.turn !== 'ai') return;
    const t = decideAi(state.board, state.aiLevel, state.tazzaUsed.ai, Math.random, 'ai');
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));

    if (!t) {
      at(PASS_DELAY, () => dispatch({ type: 'AUTO_HOLD' }));
      return () => timers.forEach(clearTimeout);
    }

    // 굴림 연출(tumbling)은 aiReveal === null 파생으로 표시됨. 정착은 타이머로 공개.
    const chosenIdx = t.usedTazza ? Math.max(0, t.rolls.indexOf(t.chosenValue)) : null;
    at(ROLL_TUMBLE, () => setAiReveal({ values: t.rolls, chosen: chosenIdx }));

    // 행동 연출 후 커밋
    at(ROLL_TUMBLE + SETTLE_BEAT, () => {
      if (t.move.kind === 'push') {
        const victims = pushTargets(state.board, t.move.line, 'ai', t.chosenValue).map((d) => d.id);
        setFlingIds(victims);
        at(FLING_MS, () => {
          dispatch({ type: 'AI_TURN', turn: t });
          setFlingIds([]);
          setAiReveal(null);
        });
      } else {
        dispatch({ type: 'AI_TURN', turn: t });
        setAiReveal(null);
      }
    });

    return () => timers.forEach(clearTimeout);
  }, [state.phase, state.turn, state.board, state.aiLevel, state.tazzaUsed.ai]);

  // ── 액션 헬퍼(난수·연출 주입) ──
  const start = useCallback((aiLevel: AiLevel) => {
    setAiReveal(null);
    setFlingIds([]);
    lockRef.current = false;
    const firstTurn = Math.random() < 0.5 ? 'me' : 'ai';
    dispatch({ type: 'START', aiLevel, firstTurn });
  }, []);

  const useTazza = useCallback(
    () => dispatch({ type: 'USE_TAZZA', die: { value: rollValue(Math.random) } }),
    []
  );
  const chooseDie = useCallback((index: 0 | 1) => dispatch({ type: 'CHOOSE_DIE', index }), []);
  const place = useCallback((line: LineIndex) => {
    if (lockRef.current) return;
    dispatch({ type: 'PLACE', line });
  }, []);

  // 플레이어 밀어내기 — 대상 주사위를 날린 뒤 커밋(연출 → 상태 변경 순서).
  const push = useCallback(
    (line: LineIndex) => {
      if (lockRef.current) return;
      const rolled = state.rolledDie?.value;
      if (rolled == null) return;
      const victims = pushTargets(state.board, line, 'me', rolled).map((d) => d.id);
      const shieldValue = rollValue(Math.random);
      lockRef.current = true;
      setFlingIds(victims);
      setTimeout(() => {
        dispatch({ type: 'PUSH', line, shieldValue });
        setFlingIds([]);
        lockRef.current = false;
      }, FLING_MS);
    },
    [state.board, state.rolledDie]
  );

  const placeShield = useCallback(
    (line: LineIndex, owner: 'me' | 'ai') => dispatch({ type: 'PLACE_SHIELD', line, owner }),
    []
  );
  const hold = useCallback(() => dispatch({ type: 'HOLD' }), []);
  const tikatuka = useCallback(() => dispatch({ type: 'TIKATUKA' }), []);
  const reset = useCallback(() => {
    setAiReveal(null);
    setFlingIds([]);
    lockRef.current = false;
    dispatch({ type: 'RESET' });
  }, []);

  return {
    state,
    aiReveal,
    flingIds,
    start,
    useTazza,
    chooseDie,
    place,
    push,
    placeShield,
    hold,
    tikatuka,
    reset,
  };
}
