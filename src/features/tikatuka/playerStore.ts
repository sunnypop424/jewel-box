// 티카투카 플레이어 TP 영속 — Firestore `tikatukaPlayers/{name}`.
// 랭크전(ai)·1:1(pvp) 각각 별도 TP 풀 + 연승, 그리고 랭크전 진행 게임 복원용 activeRanked.
import { collection, doc, getDoc, getDocs, runTransaction, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../../firebase';
import { tpDelta, nextStreak, clampTp, levelForTp } from './tp';
import type { AiLevel, GameState } from './types';

export type RankPool = 'ai' | 'pvp';

// 랭크전 진행 게임 스냅샷(새로고침/끊김 복원·도망 방지).
export interface ActiveRanked {
  state: GameState;
  star: AiLevel;
  startedAt: string;
}

// 상대별 1:1 전적(head-to-head). 무승부는 미집계(전체 winsPvp/lossesPvp와 동일 규칙).
export interface H2HRecord {
  wins: number;
  losses: number;
}

export interface TikatukaPlayer {
  name: string;
  tpAi: number;
  streakAi: number;
  tpPvp: number;
  streakPvp: number;
  winsAi: number;
  lossesAi: number;
  winsPvp: number;
  lossesPvp: number;
  h2h?: { [opponent: string]: H2HRecord }; // 1:1 상대별 전적
  activeRanked?: ActiveRanked | null;
  updatedAt: string;
}

const COL = collection(db, 'tikatukaPlayers');

export function emptyPlayer(name: string): TikatukaPlayer {
  return {
    name,
    tpAi: 0,
    streakAi: 0,
    tpPvp: 0,
    streakPvp: 0,
    winsAi: 0,
    lossesAi: 0,
    winsPvp: 0,
    lossesPvp: 0,
    h2h: {},
    activeRanked: null,
    updatedAt: new Date().toISOString(),
  };
}

// 상대별 전적 1건 반영(순수). 무승부는 미반영. PvP 종료 처리(room.ts)에서 사용.
export function recordH2H(
  h2h: TikatukaPlayer['h2h'],
  opponent: string,
  won: boolean,
  isDraw?: boolean
): { [opponent: string]: H2HRecord } {
  const next: { [k: string]: H2HRecord } = { ...(h2h ?? {}) };
  if (isDraw) return next;
  const r = next[opponent] ?? { wins: 0, losses: 0 };
  next[opponent] = { wins: r.wins + (won ? 1 : 0), losses: r.losses + (won ? 0 : 1) };
  return next;
}

function normalize(name: string, data: Partial<TikatukaPlayer> | undefined): TikatukaPlayer {
  return { ...emptyPlayer(name), ...(data ?? {}), name };
}

export async function fetchPlayer(name: string): Promise<TikatukaPlayer> {
  const snap = await getDoc(doc(COL, name));
  return normalize(name, snap.exists() ? (snap.data() as Partial<TikatukaPlayer>) : undefined);
}

// 전체 랭킹 — 클라에서 풀별 정렬해 두 보드로 사용.
export async function fetchLeaderboard(): Promise<TikatukaPlayer[]> {
  const snap = await getDocs(COL);
  return snap.docs.map((d) => normalize(d.id, d.data() as Partial<TikatukaPlayer>));
}

// 랭크전 진행 게임 저장/삭제(매 수마다 호출 → 도망 방지·복원).
export async function saveActiveRanked(name: string, active: ActiveRanked): Promise<void> {
  await runTransaction(db, async (tx) => {
    const ref = doc(COL, name);
    const snap = await tx.get(ref);
    const base = normalize(name, snap.exists() ? (snap.data() as Partial<TikatukaPlayer>) : undefined);
    tx.set(ref, { ...base, activeRanked: active, updatedAt: new Date().toISOString() });
  });
}

export async function clearActiveRanked(name: string): Promise<void> {
  const ref = doc(COL, name);
  const snap = await getDoc(ref);
  if (snap.exists()) await updateDoc(ref, { activeRanked: deleteField() });
}

export interface ApplyResultInput {
  won: boolean;
  isDraw?: boolean;
  declared?: boolean; // 이 플레이어가 티카투카 선언했는지
  rankedStar?: AiLevel | null; // 랭크전(ai)이면 매칭 ★, 그 외 null
}

export interface ApplyResultOutcome {
  before: number;
  after: number;
  delta: number;
  streak: number;
  level: number;
}

// 결과 1건 반영(트랜잭션). pool='ai' 랭크전 / 'pvp' 1:1. 반환값으로 결과 배너 표시.
export async function applyResult(
  name: string,
  pool: RankPool,
  input: ApplyResultInput
): Promise<ApplyResultOutcome> {
  return runTransaction(db, async (tx) => {
    const ref = doc(COL, name);
    const snap = await tx.get(ref);
    const p = normalize(name, snap.exists() ? (snap.data() as Partial<TikatukaPlayer>) : undefined);
    const out = computeApply(p, pool, input);
    tx.set(ref, { ...out.player, updatedAt: new Date().toISOString() });
    return out.outcome;
  });
}

// 순수 계산(플레이어 + 결과 → 갱신된 플레이어 + 결과 요약). PvP 동시반영에서 재사용.
export function computeApply(
  p: TikatukaPlayer,
  pool: RankPool,
  input: ApplyResultInput
): { player: TikatukaPlayer; outcome: ApplyResultOutcome } {
  const tpKey = pool === 'ai' ? 'tpAi' : 'tpPvp';
  const streakKey = pool === 'ai' ? 'streakAi' : 'streakPvp';
  const winKey = pool === 'ai' ? 'winsAi' : 'winsPvp';
  const lossKey = pool === 'ai' ? 'lossesAi' : 'lossesPvp';

  const before = p[tpKey];
  const newStreak = nextStreak(p[streakKey], input.won, input.isDraw);
  const delta = tpDelta({
    won: input.won,
    isDraw: input.isDraw,
    streakAfterWin: newStreak,
    rankedStar: input.rankedStar ?? null,
    declared: input.declared,
  });
  const after = clampTp(before + delta);

  const player: TikatukaPlayer = {
    ...p,
    [tpKey]: after,
    [streakKey]: newStreak,
    [winKey]: p[winKey] + (input.won && !input.isDraw ? 1 : 0),
    [lossKey]: p[lossKey] + (!input.won && !input.isDraw ? 1 : 0),
  } as TikatukaPlayer;

  return {
    player,
    outcome: { before, after, delta: after - before, streak: newStreak, level: levelForTp(after) },
  };
}
