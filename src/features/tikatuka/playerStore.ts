// 티카투카 플레이어 TP 영속 — Realtime Database `tikatukaPlayers/{encodeURIComponent(name)}`.
// 랭크전(ai)·1:1(pvp) 각각 별도 TP 풀 + 연승, 그리고 랭크전 진행 게임 복원용 activeRanked.
import { ref, get, runTransaction, update } from 'firebase/database';
import { rtdb } from '../../firebase';
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

// RTDB 키는 . # $ [ ] / 금지 → 이름을 인코딩해 키로 사용(표시용 name은 값 안에 보존).
const pkey = (name: string) => encodeURIComponent(name);
const playerRef = (name: string) => ref(rtdb, 'tikatukaPlayers/' + pkey(name));

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

export function normalize(name: string, data: Partial<TikatukaPlayer> | undefined): TikatukaPlayer {
  return { ...emptyPlayer(name), ...(data ?? {}), name };
}

// RTDB 저장형 ↔ 메모리형 변환.
// activeRanked는 GameState(빈 배열 다수)를 품고 있어, RTDB가 빈 배열/undefined를 소실시키는 문제를
// 피하려 통째로 JSON 문자열(activeRankedJson)로 저장한다. 영구 전적 필드는 그대로 저장.
function serialize(p: TikatukaPlayer): Record<string, unknown> {
  const { activeRanked, ...rest } = p;
  return { ...rest, activeRankedJson: activeRanked ? JSON.stringify(activeRanked) : null };
}
function deserialize(name: string, raw: unknown): TikatukaPlayer {
  if (!raw || typeof raw !== 'object') return emptyPlayer(name);
  const obj: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  const activeRanked =
    typeof obj.activeRankedJson === 'string' ? (JSON.parse(obj.activeRankedJson) as ActiveRanked) : null;
  delete obj.activeRankedJson;
  delete obj.activeRanked; // 옛 Firestore 데이터가 섞여도 무시
  return normalize(name, { ...(obj as Partial<TikatukaPlayer>), activeRanked });
}

export async function fetchPlayer(name: string): Promise<TikatukaPlayer> {
  const snap = await get(playerRef(name));
  return deserialize(name, snap.val());
}

// 전체 랭킹 — 클라에서 풀별 정렬해 두 보드로 사용.
export async function fetchLeaderboard(): Promise<TikatukaPlayer[]> {
  const snap = await get(ref(rtdb, 'tikatukaPlayers'));
  const all = (snap.val() ?? {}) as Record<string, Record<string, unknown>>;
  return Object.entries(all).map(([key, raw]) =>
    deserialize(typeof raw?.name === 'string' ? (raw.name as string) : decodeURIComponent(key), raw)
  );
}

// 랭크전 진행 게임 저장/삭제(진행 중 매 상태마다 호출 → 도망 방지·정확한 복원).
// 이 필드만 update — TP/전적은 미터치, 단일 클라 쓰기 순서 보장으로 최신 상태가 항상 마지막에 반영.
export async function saveActiveRanked(name: string, active: ActiveRanked): Promise<void> {
  await update(playerRef(name), { name, activeRankedJson: JSON.stringify(active) });
}

export async function clearActiveRanked(name: string): Promise<void> {
  // null = 해당 키 삭제(문서 없어도 무해).
  await update(playerRef(name), { activeRankedJson: null });
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
  let outcome: ApplyResultOutcome | null = null;
  await runTransaction(playerRef(name), (cur) => {
    const p = deserialize(name, cur);
    const out = computeApply(p, pool, input);
    outcome = out.outcome; // 마지막(커밋된) 실행값이 유효
    return serialize({ ...out.player, updatedAt: new Date().toISOString() });
  });
  if (!outcome) throw new Error('applyResult: 트랜잭션이 커밋되지 않았습니다.');
  return outcome;
}

// PvP 종료 시 한 플레이어의 결과 반영(h2h 포함). room.ts가 양쪽 각각 개별 트랜잭션으로 호출.
export async function applyPvpResult(
  name: string,
  input: ApplyResultInput,
  opponent: string | undefined,
  won: boolean
): Promise<void> {
  await runTransaction(playerRef(name), (cur) => {
    const p = deserialize(name, cur);
    const out = computeApply(p, 'pvp', input);
    const player: TikatukaPlayer = {
      ...out.player,
      h2h: opponent ? recordH2H(out.player.h2h, opponent, won, input.isDraw) : out.player.h2h,
      updatedAt: new Date().toISOString(),
    };
    return serialize(player);
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
