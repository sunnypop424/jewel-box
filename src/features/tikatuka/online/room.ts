// 온라인 1:1 방 — Firestore `tikatukaRooms/{code}`. 정식 상태는 host 관점.
// 진행은 '턴 좌석'만 write(트랜잭션 seq 가드). 종료 시 한 클라가 양쪽 TP를 동시 반영(tpApplied 가드).
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../../../firebase';
import { initialState, reducer } from '../reducer';
import { computeApply, emptyPlayer, recordH2H, type TikatukaPlayer } from '../playerStore';
import type { GameState, Owner } from '../types';

export type Seat = 'host' | 'guest';

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
}

const COL = collection(db, 'tikatukaRooms');
export const STALE_MS = 40_000; // 하트비트 이 시간 초과 시 이탈로 간주

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
    const ref = doc(COL, code);
    const exists = (await getDoc(ref)).exists();
    if (exists) continue;
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
    await setDoc(ref, room);
    return code;
  }
  throw new Error('방 코드를 만들지 못했습니다. 다시 시도해 주세요.');
}

// 참여 — 코드 검증 후 guest 등록 + 선공 코인토스 + 초기 상태 작성.
export async function joinRoom(code: string, guestName: string): Promise<void> {
  const ref = doc(COL, code.toUpperCase());
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('존재하지 않는 방 코드예요.');
    const room = snap.data() as TikatukaRoom;
    if (room.status !== 'waiting' || room.guest) throw new Error('이미 시작했거나 정원이 찬 방이에요.');

    const firstSeat: Seat = Math.random() < 0.5 ? 'host' : 'guest';
    const firstTurn: Owner = seatOwner(firstSeat);
    const st = reducer(initialState(0), { type: 'START', aiLevel: 0, firstTurn });
    const now = Date.now();
    tx.update(ref, {
      guest: { name: guestName },
      status: 'playing',
      state: st,
      seq: 1,
      turnSeat: firstSeat,
      heartbeat: { ...room.heartbeat, guest: now },
      updatedAt: new Date().toISOString(),
    });
  });
}

// 참여 대기 중인 방 목록(실시간) — 로비에서 '참여하기'로 바로 입장.
export function subscribeOpenRooms(cb: (rooms: TikatukaRoom[]) => void): () => void {
  const q = query(COL, where('status', '==', 'waiting'));
  return onSnapshot(q, (snap) => {
    const now = Date.now();
    const rooms = snap.docs
      .map((d) => d.data() as TikatukaRoom)
      // 호스트가 오래 자리비움(하트비트 stale)인 방은 숨김 — 죽은 방 노출 방지.
      .filter((r) => r.heartbeat?.host && now - r.heartbeat.host < STALE_MS * 2)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    cb(rooms);
  });
}

export function subscribeRoom(code: string, cb: (room: TikatukaRoom | null) => void): () => void {
  return onSnapshot(doc(COL, code.toUpperCase()), (snap) => {
    cb(snap.exists() ? (snap.data() as TikatukaRoom) : null);
  });
}

export async function heartbeat(code: string, seat: Seat): Promise<void> {
  await updateDoc(doc(COL, code.toUpperCase()), { [`heartbeat.${seat}`]: Date.now() });
}

// 턴 좌석이 자기 행동 결과(canonical, host 관점)를 기록. seq 가드로 더블쓰기 방지.
// 게임 종료 상태면 양쪽 TP까지 한 트랜잭션에서 반영.
export async function writeMove(code: string, expectedSeq: number, canonical: GameState): Promise<void> {
  const ref = doc(COL, code.toUpperCase());
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('방이 사라졌어요.');
    const room = snap.data() as TikatukaRoom;
    if (room.status !== 'playing') return; // 이미 종료/이탈 처리됨
    if (room.seq !== expectedSeq) return; // 더 최신 상태가 있음 — 무시(경합 방지)

    const turnSeat: Seat = canonical.turn === 'me' ? 'host' : 'guest';
    const terminal = canonical.winner !== null;

    if (terminal && !room.tpApplied) {
      const winnerSeat: Seat | 'draw' =
        canonical.winner === 'draw' ? 'draw' : canonical.winner === 'me' ? 'host' : 'guest';
      await finalizeInTx(tx, ref, room, canonical, winnerSeat, 'normal');
    } else {
      tx.update(ref, {
        state: canonical,
        seq: expectedSeq + 1,
        turnSeat,
        updatedAt: new Date().toISOString(),
      });
    }
  });
}

// 이탈/기권: winnerSeat 승리 처리(+양쪽 TP). reason='forfeit'.
export async function finalizeForfeit(code: string, winnerSeat: Seat): Promise<void> {
  const ref = doc(COL, code.toUpperCase());
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const room = snap.data() as TikatukaRoom;
    if (room.status === 'finished' || room.tpApplied) return;
    await finalizeInTx(tx, ref, room, room.state, winnerSeat, 'forfeit');
  });
}

// 방 문서 즉시 삭제(멱등 — 이미 없어도 무방).
export async function deleteRoom(code: string): Promise<void> {
  await deleteDoc(doc(COL, code.toUpperCase())).catch(() => {});
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
  const snap = await getDocs(COL);
  const now = Date.now();
  const ts = (s?: string) => (s ? new Date(s).getTime() : 0);
  const jobs: Promise<void>[] = [];
  snap.forEach((d) => {
    const r = d.data() as TikatukaRoom;
    const dead =
      r.status === 'abandoned' ||
      (r.status === 'finished' && now - ts(r.updatedAt) > 20_000) ||
      (r.status === 'waiting' && (!r.heartbeat?.host || now - r.heartbeat.host > STALE_MS));
    if (dead) jobs.push(deleteDoc(d.ref).then(() => {}).catch(() => {}));
  });
  await Promise.all(jobs);
}

// 트랜잭션 내부 종료 처리 — 양쪽 player 문서 읽고 TP 반영 후 방 마감.
async function finalizeInTx(
  tx: Parameters<Parameters<typeof runTransaction>[1]>[0],
  ref: ReturnType<typeof doc>,
  room: TikatukaRoom,
  canonical: GameState | null,
  winnerSeat: Seat | 'draw',
  reason: 'normal' | 'forfeit'
): Promise<void> {
  const hostName = room.host.name;
  const guestName = room.guest?.name;

  // 모든 read 먼저(트랜잭션 규칙).
  const playerCol = collection(db, 'tikatukaPlayers');
  const hostRef = doc(playerCol, hostName);
  const hostSnap = await tx.get(hostRef);
  let guestRef: ReturnType<typeof doc> | null = null;
  let guestSnap: Awaited<ReturnType<typeof tx.get>> | null = null;
  if (guestName) {
    guestRef = doc(playerCol, guestName);
    guestSnap = await tx.get(guestRef);
  }

  const isDraw = winnerSeat === 'draw';
  const hostDeclared = canonical?.tikatukaUsed?.me ?? false;
  const guestDeclared = canonical?.tikatukaUsed?.ai ?? false;

  const hostPlayer: TikatukaPlayer = { ...emptyPlayer(hostName), ...(hostSnap.exists() ? (hostSnap.data() as Partial<TikatukaPlayer>) : {}), name: hostName };
  const hostOut = computeApply(hostPlayer, 'pvp', {
    won: winnerSeat === 'host',
    isDraw,
    declared: hostDeclared,
    rankedStar: null,
  });
  tx.set(hostRef, {
    ...hostOut.player,
    h2h: guestName ? recordH2H(hostOut.player.h2h, guestName, winnerSeat === 'host', isDraw) : hostOut.player.h2h,
    updatedAt: new Date().toISOString(),
  });

  if (guestRef && guestName) {
    const gp: TikatukaPlayer = { ...emptyPlayer(guestName), ...(guestSnap && guestSnap.exists() ? (guestSnap.data() as Partial<TikatukaPlayer>) : {}), name: guestName };
    const gOut = computeApply(gp, 'pvp', {
      won: winnerSeat === 'guest',
      isDraw,
      declared: guestDeclared,
      rankedStar: null,
    });
    tx.set(guestRef, {
      ...gOut.player,
      h2h: recordH2H(gOut.player.h2h, hostName, winnerSeat === 'guest', isDraw),
      updatedAt: new Date().toISOString(),
    });
  }

  tx.update(ref, {
    status: 'finished',
    result: { winnerSeat, reason },
    tpApplied: true,
    state: canonical ?? room.state,
    updatedAt: new Date().toISOString(),
  });
}
