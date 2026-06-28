// 티카투카 시뮬 실전 로그 — 시뮬에서 내가 입력한 실제 경기(양측 수 전부 + 보드 스냅샷)를 RTDB에 적재한다.
// 목적: 쌓인 로그로 '실제 인게임 AI 성향'을 분석해 나중에 추천 엔진(어드바이저)을 실전에 맞게 보정.
// 저장 위치: tikatukaSimLogs/{encodeURIComponent(player)}/{gameId} = 게임 1건을 통째 JSON 문자열로 저장.
//   (RTDB는 빈 배열/undefined를 소실시키므로 문자열로 보존 — playerStore.activeRankedJson과 동일 전략)

import { ref, get, update, remove } from 'firebase/database';
import { rtdb } from '../../firebase';
import type { AiLevel, DieValue, LineIndex, Owner } from './types';

// 보드 스냅샷 — 시뮬 Grid와 구조 동일(순수 데이터).
export type LogPiece = { value: DieValue; shield: boolean; owner: Owner };
export type LogField = LogPiece[];
export type LogGrid = { me: LogField; ai: LogField }[]; // 3 라인

// 한 수(결정) 기록. actor='ai'면 실제 상대 AI가 둔 수 → 학습용 핵심 샘플.
export interface SimMoveEvent {
  seq: number; // 경기 내 순번(0부터)
  actor: Owner; // 누가 둔 수인가
  boardBefore: LogGrid; // 이 수 직전 보드
  roll: DieValue; // 실제 사용한 굴림 값
  tazza?: { rolled: [DieValue, DieValue]; chosen: DieValue }; // 타짜를 썼다면 두 눈 + 택1
  action: 'place' | 'push';
  line: LineIndex;
  shield?: { value: DieValue; line: LineIndex; owner: Owner }; // push로 받은 쉴드 배치(값·위치)
  // 내 수일 때의 어드바이저 맥락(상대 수면 생략) — 추천을 얼마나 따랐는지 분석용.
  advice?: { kind: string; line?: LineIndex; side?: Owner } | null;
  followedAdvice?: boolean;
  winRateBefore?: number | null; // 그 시점 MC 예상 승률(내 관점)
}

export interface SimOutcome {
  winner: Owner | 'draw';
  meLineWins: number;
  aiLineWins: number;
  meTotal: number;
  aiTotal: number;
}

export interface SimGameLog {
  v: 1; // 스키마 버전
  id: string;
  player: string; // 플레이어 이름(빈 값이면 'guest')
  star: AiLevel | null; // 상대 난이도(★) — 선택 안 하면 null. 난이도별 AI 성향 분석에 사용.
  firstTurn: Owner; // 선공
  startedAt: string; // ISO
  endedAt: string; // ISO
  events: SimMoveEvent[];
  outcome: SimOutcome | null; // 종료 시점 판세로 계산(보드 미완성/홀드 종료도 현재 판세 기준)
}

const ROOT = 'tikatukaSimLogs';
const pkey = (name: string) => encodeURIComponent(name || 'guest');

// 게임 1건 저장(update로 해당 키만 set — 다른 게임·플레이어 미터치).
export async function saveSimGame(game: SimGameLog): Promise<void> {
  await update(ref(rtdb, `${ROOT}/${pkey(game.player)}`), { [game.id]: JSON.stringify(game) });
}

export async function deleteSimGame(player: string, id: string): Promise<void> {
  await remove(ref(rtdb, `${ROOT}/${pkey(player)}/${id}`));
}

// 한 플레이어의 모든 로그(최근 순).
export async function fetchSimGames(name: string): Promise<SimGameLog[]> {
  const snap = await get(ref(rtdb, `${ROOT}/${pkey(name)}`));
  return parseGames(snap.val()).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}

// 전체(모든 플레이어) 로그 — AI 성향 집계용(Phase 2).
export async function fetchAllSimGames(): Promise<SimGameLog[]> {
  const snap = await get(ref(rtdb, ROOT));
  const all = (snap.val() ?? {}) as Record<string, unknown>;
  return Object.values(all).flatMap((perPlayer) => parseGames(perPlayer));
}

function parseGames(raw: unknown): SimGameLog[] {
  if (!raw || typeof raw !== 'object') return [];
  return Object.values(raw as Record<string, unknown>)
    .map((s) => {
      try {
        return typeof s === 'string' ? (JSON.parse(s) as SimGameLog) : null;
      } catch {
        return null;
      }
    })
    .filter((g): g is SimGameLog => !!g && g.v === 1 && Array.isArray(g.events));
}
