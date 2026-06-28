// 시뮬 로그 분석 — 저장된 경기에서 '실제 인게임 AI 성향'을 ★별로 집계한다(순수 함수, 읽기 전용).
// 어드바이저는 건드리지 않는다. Phase 2에서 이 수치를 shrinkage로 상대 모델에 반영할 예정(검증 먼저).
// 모든 지표는 actor='ai' 이벤트의 boardBefore+roll로 엔진 함수를 다시 돌려 계산한다(저장 데이터만으로 재현).

import { canPush, createEmptyBoard, makeDie } from './engine';
import type { LogGrid, SimGameLog } from './simLog';
import type { AiLevel, Board, LineIndex, Owner } from './types';

const LINES: LineIndex[] = [0, 1, 2];

export type StarBucket = AiLevel | 'unknown';

export interface AiTendency {
  bucket: StarBucket | 'all';
  games: number;
  aiMoves: number;
  pushAvailable: number; // 알까기가 가능했던 AI 수(분모)
  pushTaken: number; // 그중 실제로 민 수
  shieldPlacements: number; // AI가 쉴드를 배치한 수(분모)
  shieldGuideFollowed: number; // 1~3→상대 / 4~6→자기 가이드를 따른 수
  aiWins: number;
  meWins: number;
  draws: number;
}

function boardFromLog(grid: LogGrid): Board {
  const b = createEmptyBoard();
  grid.forEach((ln, line) => {
    (['me', 'ai'] as Owner[]).forEach((o) =>
      ln[o].forEach((p) => b.lines[line as LineIndex][o].push(makeDie(p.value, o, p.shield)))
    );
  });
  return b;
}

function emptyTendency(bucket: AiTendency['bucket']): AiTendency {
  return {
    bucket,
    games: 0,
    aiMoves: 0,
    pushAvailable: 0,
    pushTaken: 0,
    shieldPlacements: 0,
    shieldGuideFollowed: 0,
    aiWins: 0,
    meWins: 0,
    draws: 0,
  };
}

// 한 경기를 누적기에 반영.
function accGame(acc: AiTendency, g: SimGameLog): void {
  acc.games += 1;
  const w = g.outcome?.winner;
  if (w === 'ai') acc.aiWins += 1;
  else if (w === 'me') acc.meWins += 1;
  else if (w === 'draw') acc.draws += 1;

  for (const ev of g.events) {
    if (ev.actor !== 'ai') continue;
    acc.aiMoves += 1;
    // 타짜는 인게임에서 AI의 두 눈을 볼 수 없어 기록 불가 → 집계하지 않는다.

    // 알까기 성향 — 그 수에서 알까기가 가능했는지(엔진으로 재계산) + 실제로 밀었는지.
    const board = boardFromLog(ev.boardBefore);
    if (LINES.some((l) => canPush(board, l, 'ai', ev.roll))) {
      acc.pushAvailable += 1;
      if (ev.action === 'push') acc.pushTaken += 1;
    }

    // 쉴드 가이드 준수 — 1~3은 상대(me) 필드 캡, 4~6은 자기(ai) 필드.
    if (ev.shield) {
      acc.shieldPlacements += 1;
      const expected: Owner = ev.shield.value <= 3 ? 'me' : 'ai';
      if (ev.shield.owner === expected) acc.shieldGuideFollowed += 1;
    }
  }
}

function bucketOrder(b: AiTendency['bucket']): number {
  if (b === 'all') return 99;
  if (b === 'unknown') return 98;
  return b;
}

// ★별 성향 + 전체('all'). 데이터 있는 버킷만(+맨 끝 전체).
export function tendenciesByStar(games: SimGameLog[]): AiTendency[] {
  const byBucket = new Map<StarBucket, AiTendency>();
  const all = emptyTendency('all');
  for (const g of games) {
    const bucket: StarBucket = g.star == null ? 'unknown' : g.star;
    let t = byBucket.get(bucket);
    if (!t) {
      t = emptyTendency(bucket);
      byBucket.set(bucket, t);
    }
    accGame(t, g);
    accGame(all, g);
  }
  const ordered = [...byBucket.values()].sort((a, b) => bucketOrder(a.bucket) - bucketOrder(b.bucket));
  return all.games > 0 ? [...ordered, all] : [];
}

// 비율(분모 0이면 null = 표본 없음).
export const rate = (num: number, den: number): number | null => (den > 0 ? num / den : null);
