// 티카투카 게임 훅 — useReducer(순수) + 연출 레이어(굴림/배치/밀어내기 애니메이션).
// 엔진/리듀서는 순수, 난수·타이머·애니메이션 상태는 여기서만 다룬다.
// 플레이어 트레이 표시는 게임 상태에서 곧바로 파생(파생 가능 → effect 불필요),
// AI 턴만 '굴림 → 행동' 과정을 타이머로 쪼개 눈에 보이게 재생한다.

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { isFieldFull, legalMoves, pushTargets, rollValue, rollValueExcluding } from './engine';
import { decideAi } from './ai';
import { initialState, reducer } from './reducer';
import type { AiLevel, DieValue, GameState, LineIndex, Owner, ShieldPlacement } from './types';

// 굴림 자체엔 고민이 없다(걍 굴림). 고민은 '눈이 나온 뒤' — 타짜 쓸지·어디 놓을지·밀어낼지.
const ROLL_TUMBLE = 560; // 굴림(면 교체) 지속 — 결과가 보일 만큼만 짧게
const TAZZA_PICK = 560; // 타짜: 두 눈을 살펴본 뒤 하나 택1하는 텀
const PONDER = 850; // 눈이 나온 뒤 '어디 놓지/밀까/타짜 쓸까' 고민하는 시간
const FLING_MS = 560; // 밀어내기 충돌(공격 주사위 ram + 피해 주사위 shatter) — tikatuka.css와 일치
const PASS_DELAY = 520; // 둘 곳 없음 자동 패스 연출
const SHIELD_SHOW = 620; // 밀어내고 얻은 쉴드를 트레이에 잠깐 보여주는 시간
const SHIELD_PONDER = 720; // 쉴드를 어디 둘지 고민하는 시간(+지터)

// AI 굴림의 '정착' 시점(타이머로 비동기 공개). null이면 아직 굴리는 중(tumbling).
export interface AiReveal {
  values: DieValue[];
  chosen: number | null;
}

// 밀어내기 충돌 연출 정보 — 들이받는 공격 주사위(value)가 victim(피해자) 칸으로 파고든다.
export interface PushFx {
  line: LineIndex;
  victim: Owner; // 밀려나는 쪽(피해 주사위 소유자)
  value: DieValue; // 공격 주사위 눈 = 피해 주사위 눈(같은 값끼리 충돌)
}

// initial: 저장된 게임 복원(랭크전 새로고침 재개)용. 없으면 난이도 선택 화면에서 시작.
export function useTikatuka(initial?: GameState) {
  const [state, dispatch] = useReducer(reducer, undefined, () => initial ?? initialState(2));
  const [aiReveal, setAiReveal] = useState<AiReveal | null>(null);
  const [flingIds, setFlingIds] = useState<string[]>([]);
  const [pushFx, setPushFx] = useState<PushFx | null>(null);
  const [aiShieldTarget, setAiShieldTarget] = useState<ShieldPlacement | null>(null); // AI가 쉴드 둘 칸(고민 강조)
  const lockRef = useRef(false); // 밀어내기 연출 중 중복 입력 차단
  const aiShieldRef = useRef<ShieldPlacement | null>(null); // AI 밀어내기 후 배치 예정 위치(원래 결정 보존)

  // 1) 플레이어 턴 시작 → 굴림 연출 시간 뒤 자동 굴림 확정.
  //    단, 내 필드가 전부 풀이면 어떤 눈이 나와도 둘 곳/밀 곳이 없으므로(필드락) 굴리지 않고 바로 패스.
  //    (상대가 내 주사위를 밀어내 빈칸이 생기면 다음 내 턴에 다시 굴림)
  useEffect(() => {
    if (state.phase === 'rolling' && state.turn === 'me') {
      const allFull = ([0, 1, 2] as LineIndex[]).every((l) => isFieldFull(state.board, l, 'me'));
      if (allFull) {
        const id = setTimeout(() => dispatch({ type: 'AUTO_HOLD' }), PASS_DELAY);
        return () => clearTimeout(id);
      }
      const id = setTimeout(
        () => dispatch({ type: 'ROLL', die: { value: rollValue(Math.random) } }),
        ROLL_TUMBLE
      );
      return () => clearTimeout(id);
    }
  }, [state.phase, state.turn, state.board]);

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
    const t = decideAi(state.board, state.aiLevel, state.tazzaUsed.ai, Math.random, 'ai', state.pendingFirstShield === 'ai');
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));

    // 진짜 친구처럼 — 굴림은 바로 하지만, '눈을 본 뒤' 고민하는 시간은 매번 다르게(가끔 빨리, 가끔 길게).
    const tumbleMs = ROLL_TUMBLE + Math.floor(Math.random() * 200); // 560~760
    const ponderMs = PONDER + Math.floor(Math.random() * 750); // 850~1600

    // 둘 곳/밀 곳이 없으면(AI 필드 전부 풀) 굴리지 않고 바로 패스 — 굴림 연출도 생략(트레이는 '패스' 표시).
    if (!t) {
      at(PASS_DELAY, () => dispatch({ type: 'AUTO_HOLD' }));
      return () => timers.forEach(clearTimeout);
    }

    // 1) 굴림은 고민 없이 바로(진입 즉시 tumbling 파생) → tumbleMs 뒤 결과 공개.
    //    타짜면 일단 두 눈을 다 보여주고(chosen=null) '고민' 시작.
    const chosenIdx = t.usedTazza ? Math.max(0, t.rolls.indexOf(t.chosenValue)) : null;
    at(tumbleMs, () => setAiReveal({ values: t.rolls, chosen: t.usedTazza ? null : chosenIdx }));

    // 2) 타짜: 두 눈을 살펴본 뒤 하나 택1(강조).
    if (t.usedTazza) {
      at(tumbleMs + TAZZA_PICK, () => setAiReveal({ values: t.rolls, chosen: chosenIdx }));
    }

    // 3) 눈이 나온 뒤 '어디 놓지/밀까'를 고민(ponderMs)하고 행동을 커밋.
    const actAt = tumbleMs + (t.usedTazza ? TAZZA_PICK : 0) + ponderMs;
    at(actAt, () => {
      if (t.move.kind === 'push') {
        const victims = pushTargets(state.board, t.move.line, 'ai', t.chosenValue).map((d) => d.id);
        setFlingIds(victims);
        setPushFx({ line: t.move.line, victim: 'me', value: t.chosenValue });
        at(FLING_MS, () => {
          setFlingIds([]);
          setPushFx(null);
          setAiReveal(null);
          // 둘 곳이 있으면 쉴드를 트레이에 대기시키고(고민 → 배치) 단계적으로, 없으면 원자적 처리.
          if (t.shieldPlacement) {
            aiShieldRef.current = t.shieldPlacement;
            dispatch({ type: 'AI_PUSH', turn: t });
          } else {
            dispatch({ type: 'AI_TURN', turn: t });
          }
        });
      } else {
        dispatch({ type: 'AI_TURN', turn: t });
        setAiReveal(null);
      }
    });

    return () => timers.forEach(clearTimeout);
  }, [state.phase, state.turn, state.board, state.aiLevel, state.tazzaUsed.ai]);

  // 4) AI 쉴드 배치 → 트레이에 잠깐 보여주고(SHIELD_SHOW) → 둘 칸을 고민(강조)한 뒤 배치.
  useEffect(() => {
    if (state.phase !== 'placingShield' || state.turn !== 'ai' || !state.pendingShield) return;
    const plan = aiShieldRef.current;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));

    // 쉴드를 트레이에 한 박자 보여준 뒤, 둘 칸을 강조하며 '어디 두지' 고민.
    at(SHIELD_SHOW, () => setAiShieldTarget(plan));
    const placeAt = SHIELD_SHOW + SHIELD_PONDER + Math.floor(Math.random() * 520);
    at(placeAt, () => {
      if (plan) dispatch({ type: 'PLACE_SHIELD', line: plan.line, owner: plan.owner });
      setAiShieldTarget(null);
    });

    return () => timers.forEach(clearTimeout);
  }, [state.phase, state.turn, state.pendingShield]);

  // ── 액션 헬퍼(난수·연출 주입) ──
  const start = useCallback((aiLevel: AiLevel) => {
    setAiReveal(null);
    setFlingIds([]);
    setPushFx(null);
    setAiShieldTarget(null);
    aiShieldRef.current = null;
    lockRef.current = false;
    const firstTurn = Math.random() < 0.5 ? 'me' : 'ai';
    dispatch({ type: 'START', aiLevel, firstTurn });
  }, []);

  const useTazza = useCallback(() => {
    // 타짜 재굴림은 현재 눈과 다른 값으로(같은 눈 방지).
    const cur = state.rolledDie?.value;
    const value = cur != null ? rollValueExcluding(Math.random, cur) : rollValue(Math.random);
    dispatch({ type: 'USE_TAZZA', die: { value } });
  }, [state.rolledDie]);
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
      setPushFx({ line, victim: 'ai', value: rolled });
      setTimeout(() => {
        dispatch({ type: 'PUSH', line, shieldValue });
        setFlingIds([]);
        setPushFx(null);
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
    setPushFx(null);
    setAiShieldTarget(null);
    aiShieldRef.current = null;
    lockRef.current = false;
    dispatch({ type: 'RESET' });
  }, []);

  return {
    state,
    aiReveal,
    flingIds,
    pushFx,
    aiShieldTarget,
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
