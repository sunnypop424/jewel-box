// 티카투카 게임 훅 — useReducer + 자동 진행 effect(플레이어 자동 굴림, AI 턴, 자동 패스).
// 난수는 런타임 Math.random 사용(엔진/리듀서는 순수, 여기서만 부작용).

import { useCallback, useEffect, useReducer } from 'react';
import { isFieldFull, legalMoves, rollValue } from './engine';
import { decideAi } from './ai';
import { initialState, reducer } from './reducer';
import type { AiLevel, LineIndex } from './types';

const ROLL_DELAY = 450; // 굴림 연출
const AI_DELAY = 650; // AI 생각 연출

export function useTikatuka() {
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState(2));

  // 1) 플레이어 턴 시작 → 자동 굴림
  useEffect(() => {
    if (state.phase === 'rolling' && state.turn === 'me') {
      const id = setTimeout(
        () => dispatch({ type: 'ROLL', die: { value: rollValue(Math.random) } }),
        ROLL_DELAY
      );
      return () => clearTimeout(id);
    }
  }, [state.phase, state.turn]);

  // 2) 플레이어 합법수 없음(내 필드 전부 풀) → 자동 패스
  useEffect(() => {
    if (state.phase === 'acting' && state.turn === 'me' && state.rolledDie) {
      const moves = legalMoves(state.board, 'me', state.rolledDie.value);
      const allFull = ([0, 1, 2] as LineIndex[]).every((l) => isFieldFull(state.board, l, 'me'));
      if (moves.length === 0 && allFull) {
        const id = setTimeout(() => dispatch({ type: 'AUTO_HOLD' }), ROLL_DELAY);
        return () => clearTimeout(id);
      }
    }
  }, [state.phase, state.turn, state.rolledDie, state.board]);

  // 3) AI 턴 → decideAi 후 적용
  useEffect(() => {
    if (state.phase === 'aiThinking' && state.turn === 'ai') {
      const id = setTimeout(() => {
        const t = decideAi(state.board, state.aiLevel, state.tazzaUsed.ai, Math.random, 'ai');
        if (t) dispatch({ type: 'AI_TURN', turn: t });
        else dispatch({ type: 'AUTO_HOLD' });
      }, AI_DELAY);
      return () => clearTimeout(id);
    }
  }, [state.phase, state.turn, state.board, state.aiLevel, state.tazzaUsed.ai]);

  // ── 액션 헬퍼(난수 주입) ──
  const start = useCallback((aiLevel: AiLevel) => {
    const firstTurn = Math.random() < 0.5 ? 'me' : 'ai';
    dispatch({ type: 'START', aiLevel, firstTurn });
  }, []);

  const useTazza = useCallback(
    () => dispatch({ type: 'USE_TAZZA', die: { value: rollValue(Math.random) } }),
    []
  );
  const chooseDie = useCallback((index: 0 | 1) => dispatch({ type: 'CHOOSE_DIE', index }), []);
  const place = useCallback((line: LineIndex) => dispatch({ type: 'PLACE', line }), []);
  const push = useCallback(
    (line: LineIndex) => dispatch({ type: 'PUSH', line, shieldValue: rollValue(Math.random) }),
    []
  );
  const placeShield = useCallback(
    (line: LineIndex, owner: 'me' | 'ai') => dispatch({ type: 'PLACE_SHIELD', line, owner }),
    []
  );
  const hold = useCallback(() => dispatch({ type: 'HOLD' }), []);
  const tikatuka = useCallback(() => dispatch({ type: 'TIKATUKA' }), []);
  const reset = useCallback(() => dispatch({ type: 'RESET' }), []);

  return { state, start, useTazza, chooseDie, place, push, placeShield, hold, tikatuka, reset };
}
