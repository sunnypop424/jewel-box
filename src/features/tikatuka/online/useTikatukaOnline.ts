// 온라인 1:1 게임 훅 — 각 클라는 자기를 'me'로 로컬 플레이(엔진/리듀서 재사용),
// 턴이 상대에게 넘어가는 순간(또는 종료)에만 canonical 상태를 Firestore에 기록한다.
// 상대 수는 onSnapshot으로 받아 관점 변환 후 그대로 반영(AI 자동턴 로직 없음).
import { useCallback, useEffect, useRef, useState } from 'react';
import { isFieldFull, legalMoves, pushTargets, rollValue, rollValueExcluding } from '../engine';
import { initialState, reducer, type Action } from '../reducer';
import { fromCanonical, toCanonical } from './perspective';
import {
  finalizeForfeit,
  heartbeat,
  sendEmote,
  STALE_MS,
  subscribeRoom,
  writeMove,
  type Seat,
  type TikatukaRoom,
} from './room';
import type { EmoteKind, EmoteState } from '../components/Emote';
import type { PushFx } from '../useTikatuka';
import type { Board, DieValue, GameState, LineIndex, Owner } from '../types';

const EMOTE_TTL = 4500; // 말풍선 표시 시간(ms) — tikatuka.css의 tk-emote 애니메이션(4400ms)보다 살짝 길게
const EMOTE_COOLDOWN = 1200; // 연속 전송 쿨다운(ms)

const ROLL_TUMBLE = 520;
const PASS_DELAY = 480;
const FLING_MS = 560; // 밀어내기 충돌 연출(tikatuka.css와 일치)

// 두 보드를 비교해 사라진(밀려난) 주사위를 찾음 — 상대 수신 시 밀어내기 연출 복원용.
function findRemoved(oldB: Board, newB: Board): { ids: string[]; line: LineIndex; victim: Owner; value: DieValue } | null {
  for (let line = 0 as LineIndex; line < 3; line = (line + 1) as LineIndex) {
    for (const owner of ['me', 'ai'] as Owner[]) {
      const newIds = new Set(newB.lines[line][owner].map((d) => d.id));
      const removed = oldB.lines[line][owner].filter((d) => !newIds.has(d.id));
      if (removed.length > 0) {
        return { ids: removed.map((d) => d.id), line, victim: owner, value: removed[0].value };
      }
    }
  }
  return null;
}

export interface OnlineGame {
  state: GameState; // 로컬 관점(me = 내 좌석)
  room: TikatukaRoom | null;
  myTurn: boolean;
  opponentName: string;
  opponentStale: boolean;
  flingIds: string[];
  pushFx: PushFx | null;
  // 감정표현
  myEmote: EmoteState | null;
  oppEmote: EmoteState | null;
  sendEmote: (kind: EmoteKind) => void;
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
  // 밀어내기 연출(공용 Board에 전달).
  const [flingIds, setFlingIds] = useState<string[]>([]);
  const [pushFx, setPushFx] = useState<PushFx | null>(null);
  // 연출 지연 중 다음 상태가 오면 먼저 비우기 위한 보류 핸들.
  const pendingRef = useRef<{ timer: ReturnType<typeof setTimeout>; next: GameState } | null>(null);

  // 감정표현 — 게임 상태와 분리된 채널(턴 무관). 내 것/상대 것 각각 잠깐 표시.
  const [myEmote, setMyEmote] = useState<EmoteState | null>(null);
  const [oppEmote, setOppEmote] = useState<EmoteState | null>(null);
  const oppEmoteSeen = useRef<number | null>(null); // 마지막으로 반영한 상대 emote nonce
  const emoteInit = useRef(false); // 첫 스냅샷의 묵은 emote 재생 방지
  const emoteCooldown = useRef(0);

  const commit = useCallback(
    (next: GameState, fromRemote: boolean) => {
      localRef.current = next;
      setLocal(next);
      if (fromRemote) return;
      // 내 턴의 모든 중간 변화(굴림·타짜·선택·배치)를 매번 기록 → 상대가 내 주사위 상태를
      // 실시간으로 본다. 티카투카 선언도 즉시 전달되어 '둘 중 한 명만' 규칙이 강제된다.
      const expected = seqRef.current;
      seqRef.current = expected + 1; // 낙관적
      writeMove(codeRef.current, expected, toCanonical(next, seat)).catch((e) => console.error(e));
    },
    [seat]
  );

  const run = useCallback(
    (action: Action) => {
      commit(reducer(localRef.current, action), false);
    },
    [commit]
  );

  // 방 구독 — 더 새로운 상태(seq 증가)만 반영. 상대가 밀어냈으면 연출 후 적용.
  useEffect(() => {
    const unsub = subscribeRoom(code, (r) => {
      setRoom(r);
      // 감정표현 감지 — seq를 올리지 않으므로 아래 seq early-return보다 먼저 처리.
      const sig = r?.emote?.[oppSeat] ?? null;
      if (!emoteInit.current) {
        emoteInit.current = true;
        oppEmoteSeen.current = sig?.n ?? null; // 입장 시점의 묵은 emote는 발화하지 않음
      } else if (sig && sig.n !== oppEmoteSeen.current) {
        oppEmoteSeen.current = sig.n;
        setOppEmote({ kind: sig.kind, n: sig.n });
      }
      if (!r?.state || r.seq <= seqRef.current) return;
      seqRef.current = r.seq;
      // 연출 대기 중이던 이전 상태가 있으면 먼저 즉시 반영(되감김 방지).
      if (pendingRef.current) {
        clearTimeout(pendingRef.current.timer);
        localRef.current = pendingRef.current.next;
        setLocal(pendingRef.current.next);
        pendingRef.current = null;
        setFlingIds([]);
        setPushFx(null);
      }
      const next = fromCanonical(r.state, seat);
      const removed = findRemoved(localRef.current.board, next.board);
      if (removed) {
        // 사라진 주사위를 잠깐 더 보여주며 충돌 연출 → FLING_MS 후 새 상태 적용.
        setFlingIds(removed.ids);
        setPushFx({ line: removed.line, victim: removed.victim, value: removed.value });
        const timer = setTimeout(() => {
          setFlingIds([]);
          setPushFx(null);
          localRef.current = next;
          setLocal(next);
          pendingRef.current = null;
        }, FLING_MS);
        pendingRef.current = { timer, next };
      } else {
        localRef.current = next;
        setLocal(next);
      }
    });
    return unsub;
  }, [code, seat, oppSeat]);

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

  // 감정표현 말풍선 자동 소멸(내 것/상대 것 각각). nonce가 바뀌면 타이머 재시작.
  useEffect(() => {
    if (!myEmote) return;
    const id = setTimeout(() => setMyEmote(null), EMOTE_TTL);
    return () => clearTimeout(id);
  }, [myEmote]);
  useEffect(() => {
    if (!oppEmote) return;
    const id = setTimeout(() => setOppEmote(null), EMOTE_TTL);
    return () => clearTimeout(id);
  }, [oppEmote]);

  // 감정표현 전송 — 쿨다운 + 내 말풍선 즉시 로컬 표시(서버 왕복 없이).
  const sendEmoteFn = useCallback(
    (kind: EmoteKind) => {
      const t = Date.now();
      if (t < emoteCooldown.current) return;
      emoteCooldown.current = t + EMOTE_COOLDOWN;
      setMyEmote({ kind, n: t });
      sendEmote(codeRef.current, seat, kind).catch(() => {});
    },
    [seat]
  );

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
      // 내가 미는 연출도 먼저 보여주고(상대도 수신 시 동일 연출) 커밋.
      const victims = pushTargets(localRef.current.board, line, 'me', rolled).map((d) => d.id);
      setFlingIds(victims);
      setPushFx({ line, victim: 'ai', value: rolled });
      setTimeout(() => {
        setFlingIds([]);
        setPushFx(null);
        run({ type: 'PUSH', line, shieldValue: rollValue(Math.random) });
      }, FLING_MS);
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
    flingIds,
    pushFx,
    myEmote,
    oppEmote,
    sendEmote: sendEmoteFn,
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
