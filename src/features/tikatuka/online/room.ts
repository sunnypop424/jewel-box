// 온라인 1:1 방 — Realtime Database `tikatukaRooms/{code}`. 정식 상태는 host 관점.
// 진행은 '턴 좌석'만 write(트랜잭션 seq 가드). 종료 시 방을 finished+tpApplied로 'claim'(정확히 1회)한 뒤
// 양쪽 플레이어 TP를 개별 트랜잭션으로 반영(playerStore.applyPvpResult).
// state(GameState)는 RTDB가 빈 배열/undefined를 소실시키므로 JSON 문자열(stateJson)로 보관.
import {
  ref,
  get,
  set,
  update,
  remove,
  onValue,
  runTransaction,
  query,
  orderByChild,
  equalTo,
} from 'firebase/database';
import { rtdb } from '../../../firebase';
import { initialState, reducer } from '../reducer';
import { applyPvpResult } from '../playerStore';
import type { EmoteKind } from '../components/Emote';
import type { GameState, Owner } from '../types';

export type Seat = 'host' | 'guest';

// 감정표현 신호 — 게임 상태(state/seq)와 분리된 채널. n은 변화 감지용 nonce.
export interface EmoteSignal {
  kind: EmoteKind;
  n: number;
}

export interface TikatukaRoom {
  code: string;
  host: { name: string };
  guest: { name: string } | null;
  status: 'waiting' | 'playing' | 'finished' | 'abandoned';
  state: GameState | null; // host 관점 canonical
  seq: number;
  turnSeat: Seat;
  heartbeat: { host: number; guest: number }; // epoch ms
  createdAt: string;
  updatedAt: string;
  result?: { winnerSeat: Seat | 'draw'; reason: 'normal' | 'forfeit' };
  tpApplied?: boolean;
  emote?: { host?: EmoteSignal | null; guest?: EmoteSignal | null }; // 좌석별 마지막 감정표현
}

export const STALE_MS = 40_000; // 하트비트 이 시간 초과 시 이탈로 간주

const ROOMS_PATH = 'tikatukaRooms';
const roomRef = (code: string) => ref(rtdb, ROOMS_PATH + '/' + code.toUpperCase());

// RTDB 저장형 — state만 JSON 문자열로. 나머지(emote/heartbeat/result 등)는 빈 배열이 없어 그대로 저장.
type RoomRecord = Omit<TikatukaRoom, 'state'> & { stateJson?: string | null };
function toRecord(room: TikatukaRoom): RoomRecord {
  const { state, ...rest } = room;
  return { ...rest, stateJson: state ? JSON.stringify(state) : null };
}
function hydrate(raw: unknown): TikatukaRoom | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  const stateJson = obj.stateJson;
  delete obj.stateJson;
  return {
    ...(obj as unknown as Omit<TikatukaRoom, 'state'>),
    state: typeof stateJson === 'string' ? (JSON.parse(stateJson) as GameState) : null,
  };
}

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 헷갈리는 글자(0/O,1/I/L) 제외
function genCode(len = 4): string {
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

function seatOwner(seat: Seat): Owner {
  return seat === 'host' ? 'me' : 'ai'; // canonical은 host 관점
}

export async function createRoom(hostName: string): Promise<string> {
  // 코드 충돌 회피(몇 번 재시도).
  for (let i = 0; i < 6; i++) {
    const code = genCode();
    const r = roomRef(code);
    if ((await get(r)).exists()) continue;
    const now = Date.now();
    const room: TikatukaRoom = {
      code,
      host: { name: hostName },
      guest: null,
      status: 'waiting',
      state: null,
      seq: 0,
      turnSeat: 'host',
      heartbeat: { host: now, guest: 0 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await set(r, toRecord(room));
    return code;
  }
  throw new Error('방 코드를 만들지 못했습니다. 다시 시도해 주세요.');
}

// 참여 — 코드 검증 후 guest 등록 + 선공 코인토스 + 초기 상태 작성.
// 트랜잭션 첫 호출이 null(미캐시)일 때의 조기 abort를 피하려 get()으로 프라임 + 존재 확인.
export async function joinRoom(code: string, guestName: string): Promise<void> {
  const r = roomRef(code);
  if (!(await get(r)).exists()) throw new Error('존재하지 않는 방 코드예요.');
  const res = await runTransaction(r, (cur: RoomRecord | null) => {
    if (!cur) return; // abort
    if (cur.status !== 'waiting' || cur.guest) return; // abort(이미 시작/정원)
    const firstSeat: Seat = Math.random() < 0.5 ? 'host' : 'guest';
    const firstTurn: Owner = seatOwner(firstSeat);
    const st = reducer(initialState(0), { type: 'START', aiLevel: 0, firstTurn });
    const now = Date.now();
    return {
      ...cur,
      guest: { name: guestName },
      status: 'playing',
      stateJson: JSON.stringify(st),
      seq: 1,
      turnSeat: firstSeat,
      heartbeat: { host: cur.heartbeat?.host ?? now, guest: now },
      updatedAt: new Date().toISOString(),
    } as RoomRecord;
  });
  if (!res.committed) throw new Error('이미 시작했거나 정원이 찬 방이에요.');
}

// 참여 대기 중인 방 목록(실시간) — 로비에서 '참여하기'로 바로 입장.
export function subscribeOpenRooms(cb: (rooms: TikatukaRoom[]) => void): () => void {
  const q = query(ref(rtdb, ROOMS_PATH), orderByChild('status'), equalTo('waiting'));
  return onValue(q, (snap) => {
    const now = Date.now();
    const all = (snap.val() ?? {}) as Record<string, unknown>;
    const rooms = Object.values(all)
      .map((raw) => hydrate(raw))
      // 호스트가 오래 자리비움(하트비트 stale)인 방은 숨김 — 죽은 방 노출 방지.
      .filter((r): r is TikatukaRoom => !!r && !!r.heartbeat?.host && now - r.heartbeat.host < STALE_MS * 2)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    cb(rooms);
  });
}

export function subscribeRoom(code: string, cb: (room: TikatukaRoom | null) => void): () => void {
  return onValue(roomRef(code), (snap) => {
    cb(snap.exists() ? hydrate(snap.val()) : null);
  });
}

// 단발 조회 — 새로고침 복귀 시 방 존재·상태·내 좌석 확인용.
export async function getRoom(code: string): Promise<TikatukaRoom | null> {
  return hydrate((await get(roomRef(code))).val());
}

export async function heartbeat(code: string, seat: Seat): Promise<void> {
  await update(roomRef(code), { [`heartbeat/${seat}`]: Date.now() });
}

// 감정표현 전송 — 전용 경로만 갱신(트랜잭션·seq 미터치). 턴과 무관하게 아무 때나 보낼 수 있다.
export async function sendEmote(code: string, seat: Seat, kind: EmoteKind): Promise<void> {
  await update(roomRef(code), { [`emote/${seat}`]: { kind, n: Date.now() } }).catch(() => {});
}

// 턴 좌석이 자기 행동 결과(canonical, host 관점)를 기록. seq 가드로 더블쓰기 방지.
// 종료 상태면 방을 finished+tpApplied로 claim하고, 그 트랜잭션을 '내가' 성공시킨 경우에만 TP 정산.
export async function writeMove(code: string, expectedSeq: number, canonical: GameState): Promise<void> {
  const r = roomRef(code);
  const terminal = canonical.winner !== null;
  const turnSeat: Seat = canonical.turn === 'me' ? 'host' : 'guest';
  let claimed = false;
  const res = await runTransaction(r, (cur: RoomRecord | null) => {
    claimed = false; // 매 실행마다 초기화(마지막=커밋된 실행값만 유효)
    if (!cur) return; // 방 사라짐
    if (cur.status !== 'playing') return; // 이미 종료/이탈 처리됨
    if (cur.seq !== expectedSeq) return; // 더 최신 상태가 있음 — 무시(경합 방지)
    if (terminal) {
      if (cur.tpApplied) return; // 이미 정산됨
      claimed = true;
      const winnerSeat: Seat | 'draw' =
        canonical.winner === 'draw' ? 'draw' : canonical.winner === 'me' ? 'host' : 'guest';
      return {
        ...cur,
        stateJson: JSON.stringify(canonical),
        seq: expectedSeq + 1,
        turnSeat,
        status: 'finished',
        result: { winnerSeat, reason: 'normal' },
        tpApplied: true,
        updatedAt: new Date().toISOString(),
      } as RoomRecord;
    }
    return {
      ...cur,
      stateJson: JSON.stringify(canonical),
      seq: expectedSeq + 1,
      turnSeat,
      updatedAt: new Date().toISOString(),
    } as RoomRecord;
  });
  if (res.committed && claimed) {
    const room = hydrate((await get(r)).val());
    if (room?.result) await applyPlayerResults(room, canonical, room.result.winnerSeat);
  }
}

// 이탈/기권: winnerSeat 승리 처리(+양쪽 TP). reason='forfeit'. claim 패턴으로 1회 보장.
export async function finalizeForfeit(code: string, winnerSeat: Seat): Promise<void> {
  const r = roomRef(code);
  let claimed = false;
  const res = await runTransaction(r, (cur: RoomRecord | null) => {
    claimed = false;
    if (!cur) return;
    if (cur.status === 'finished' || cur.tpApplied) return;
    claimed = true;
    return {
      ...cur,
      status: 'finished',
      result: { winnerSeat, reason: 'forfeit' },
      tpApplied: true,
      updatedAt: new Date().toISOString(),
    } as RoomRecord;
  });
  if (res.committed && claimed) {
    const room = hydrate((await get(r)).val());
    if (room) await applyPlayerResults(room, room.state, winnerSeat);
  }
}

// 방 문서 즉시 삭제(멱등 — 이미 없어도 무방).
export async function deleteRoom(code: string): Promise<void> {
  await remove(roomRef(code)).catch(() => {});
}

// 내가 만든(대기 중) 방 코드 — 새로고침/이탈 후 복귀 시 즉시 삭제하려고 보관.
export const MY_ROOM_KEY = 'tikatuka_my_room';

// 보관된 내 대기방이 있으면 즉시 삭제(티카투카 페이지 진입마다 호출).
export async function deleteMyLeftoverRoom(): Promise<void> {
  const code = typeof localStorage !== 'undefined' ? localStorage.getItem(MY_ROOM_KEY) : null;
  if (!code) return;
  localStorage.removeItem(MY_ROOM_KEY);
  await deleteRoom(code);
}

// 대기 중 방 취소 = 즉시 삭제(아직 게임 시작 전).
export async function cancelRoom(code: string): Promise<void> {
  await deleteRoom(code);
}

// 죽은 방 정리(로비 진입 시 호출):
//  · finished — 양쪽이 결과를 본 뒤 남은 방
//  · waiting 인데 호스트 하트비트가 끊긴 방(생성만 하고 떠남/혼자 오래 방치)
//  · abandoned
export async function cleanupStaleRooms(): Promise<void> {
  const snap = await get(ref(rtdb, ROOMS_PATH));
  const all = (snap.val() ?? {}) as Record<string, RoomRecord>;
  const now = Date.now();
  const ts = (s?: string) => (s ? new Date(s).getTime() : 0);
  const jobs: Promise<void>[] = [];
  for (const [key, r] of Object.entries(all)) {
    const dead =
      r.status === 'abandoned' ||
      (r.status === 'finished' && now - ts(r.updatedAt) > 20_000) ||
      (r.status === 'waiting' && (!r.heartbeat?.host || now - r.heartbeat.host > STALE_MS));
    if (dead) jobs.push(remove(ref(rtdb, ROOMS_PATH + '/' + key)).then(() => {}).catch(() => {}));
  }
  await Promise.all(jobs);
}

// 종료 정산 — 방 claim 성공 후, 양쪽 player 문서에 개별 트랜잭션으로 TP/연승/h2h 반영.
async function applyPlayerResults(
  room: TikatukaRoom,
  canonical: GameState | null,
  winnerSeat: Seat | 'draw'
): Promise<void> {
  const hostName = room.host.name;
  const guestName = room.guest?.name;
  const isDraw = winnerSeat === 'draw';
  const hostDeclared = canonical?.tikatukaUsed?.me ?? false;
  const guestDeclared = canonical?.tikatukaUsed?.ai ?? false;

  await applyPvpResult(
    hostName,
    { won: winnerSeat === 'host', isDraw, declared: hostDeclared, rankedStar: null },
    guestName,
    winnerSeat === 'host'
  );
  if (guestName) {
    await applyPvpResult(
      guestName,
      { won: winnerSeat === 'guest', isDraw, declared: guestDeclared, rankedStar: null },
      hostName,
      winnerSeat === 'guest'
    );
  }
}
