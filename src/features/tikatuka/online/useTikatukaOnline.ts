// 온라인 1:1 게임 훅 — 각 클라는 자기를 'me'로 로컬 플레이(엔진/리듀서 재사용),
// 턴이 상대에게 넘어가는 순간(또는 종료)에만 canonical 상태를 Firestore에 기록한다.
// 상대 수는 onSnapshot으로 받아 관점 변환 후 그대로 반영(AI 자동턴 로직 없음).
import { useCallback, useEffect, useRef, useState } from 'react';
import { isFieldFull, legalMoves, rollValue, rollValueExcluding } from '../engine';
import { initialState, reducer, type Action } from '../reducer';
import { fromCanonical, toCanonical } from './perspective';
import {
  finalizeForfeit,
  heartbeat,
  STALE_MS,
  subscribeRoom,
  writeMove,
  type Seat,
  type TikatukaRoom,
} from './room';
import type { GameState, LineIndex } from '../types';

const ROLL_TUMBLE = 520;
const PASS_DELAY = 480;

export interface OnlineGame {
  state: GameState; // 로컬 관점(me = 내 좌석)
  room: TikatukaRoom | null;
  myTurn: boolean;
  opponentName: string;
  opponentStale: boolean;
  // 액션
  place: (line: LineIndex) => void;
  push: (line: LineIndex) => void;
  useTazza: () => void;
  chooseDie: (index: 0 | 1) => void;
  placeShield: (line: LineIndex, owner: 'me' | 'ai') => void;
  tikatuka: () => void;
  forfeit: () => void; // 나가기/기권(상대 승리)
  claimWin: () => void; // 상대 이탈 → 내 승리 처리
}

export function useTikatukaOnline(code: string, seat: Seat): OnlineGame {
  const oppSeat: Seat = seat === 'host' ? 'guest' : 'host';
  const [room, setRoom] = useState<TikatukaRoom | null>(null);
  const [nowTs, setNowTs] = useState(0); // 하트비트 stale 판정용 시계(렌더 중 Date.now 호출 회피)

  // 로컬 상태(useState로 동기 접근 — 핸드오프 시점 즉시 판단/기록).
  const [local, setLocal] = useState<GameState>(() => initialState(0));
  const localRef = useRef(local);
  const seqRef = useRef(0); // 마지막으로 반영한 room.seq
  const codeRef = useRef(code);
  codeRef.current = code;

  const commit = useCallback(
    (next: GameState, fromRemote: boolean) => {
      localRef.current = next;
      setLocal(next);
      if (fromRemote) return;
      // 핸드오프(상대 턴) 또는 종료 → canonical 기록.
      if (next.turn === 'ai' || next.winner !== null) {
        const expected = seqRef.current;
        seqRef.current = expected + 1; // 낙관적
        writeMove(codeRef.current, expected, toCanonical(next, seat)).catch((e) => console.error(e));
      }
    },
    [seat]
  );

  const run = useCallback(
    (action: Action) => {
      commit(reducer(localRef.current, action), false);
    },
    [commit]
  );

  // 방 구독 — 상대 수/초기 상태 수신 시 관점 변환해 로컬 반영.
  useEffect(() => {
    const unsub = subscribeRoom(code, (r) => {
      setRoom(r);
      if (r?.state && r.seq !== seqRef.current) {
        seqRef.current = r.seq;
        const next = fromCanonical(r.state, seat);
        localRef.current = next;
        setLocal(next);
      }
    });
    return unsub;
  }, [code, seat]);

  // 하트비트 — 5s 주기 + 마운트/가시성 변화 시.
  useEffect(() => {
    const beat = () => heartbeat(code, seat).catch(() => {});
    beat();
    setNowTs(Date.now());
    const id = setInterval(() => {
      beat();
      setNowTs(Date.now());
    }, 5000);
    const onVis = () => beat();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [code, seat]);

  // 내 턴 자동 굴림(연출 없이 짧게) — useTikatuka effect1과 동일 취지.
  useEffect(() => {
    if (local.turn !== 'me' || local.phase !== 'rolling') return;
    const allFull = ([0, 1, 2] as LineIndex[]).every((l) => isFieldFull(local.board, l, 'me'));
    if (allFull) {
      const id = setTimeout(() => run({ type: 'AUTO_HOLD' }), PASS_DELAY);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => run({ type: 'ROLL', die: { value: rollValue(Math.random) } }), ROLL_TUMBLE);
    return () => clearTimeout(id);
  }, [local.turn, local.phase, local.board, run]);

  // 합법수 없음 → 자동 패스.
  useEffect(() => {
    if (local.phase !== 'acting' || local.turn !== 'me' || !local.rolledDie) return;
    const moves = legalMoves(local.board, 'me', local.rolledDie.value);
    const allFull = ([0, 1, 2] as LineIndex[]).every((l) => isFieldFull(local.board, l, 'me'));
    if (moves.length === 0 && allFull) {
      const id = setTimeout(() => run({ type: 'AUTO_HOLD' }), PASS_DELAY);
      return () => clearTimeout(id);
    }
  }, [local.phase, local.turn, local.rolledDie, local.board, run]);

  // ── 액션 헬퍼 ──
  const place = useCallback((line: LineIndex) => run({ type: 'PLACE', line }), [run]);
  const push = useCallback(
    (line: LineIndex) => {
      const rolled = localRef.current.rolledDie?.value;
      if (rolled == null) return;
      run({ type: 'PUSH', line, shieldValue: rollValue(Math.random) });
    },
    [run]
  );
  const useTazza = useCallback(() => {
    const cur = localRef.current.rolledDie?.value;
    const value = cur != null ? rollValueExcluding(Math.random, cur) : rollValue(Math.random);
    run({ type: 'USE_TAZZA', die: { value } });
  }, [run]);
  const chooseDie = useCallback((index: 0 | 1) => run({ type: 'CHOOSE_DIE', index }), [run]);
  const placeShield = useCallback(
    (line: LineIndex, owner: 'me' | 'ai') => run({ type: 'PLACE_SHIELD', line, owner }),
    [run]
  );
  const tikatuka = useCallback(() => run({ type: 'TIKATUKA' }), [run]);

  const forfeit = useCallback(() => {
    finalizeForfeit(code, oppSeat).catch((e) => console.error(e));
  }, [code, oppSeat]);
  const claimWin = useCallback(() => {
    finalizeForfeit(code, seat).catch((e) => console.error(e));
  }, [code, seat]);

  const oppHb = room?.heartbeat?.[oppSeat] ?? 0;
  const opponentStale = room?.status === 'playing' && oppHb > 0 && nowTs > 0 && nowTs - oppHb > STALE_MS;
  const opponentName = (seat === 'host' ? room?.guest?.name : room?.host?.name) ?? '상대';

  return {
    state: local,
    room,
    myTurn: local.turn === 'me' && local.winner === null && room?.status === 'playing',
    opponentName,
    opponentStale: !!opponentStale,
    place,
    push,
    useTazza,
    chooseDie,
    placeShield,
    tikatuka,
    forfeit,
    claimWin,
  };
}
