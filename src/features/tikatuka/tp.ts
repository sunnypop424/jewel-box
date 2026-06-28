// 티카투카 TP(승점) / 레벨 / 매칭 도메인 로직 — 순수 함수(Firestore·React 무관).
// 규칙 출처: 룰.PNG(경제) + 로아 인게임 스크린샷(레벨 구간). 수치는 이 파일 한 곳에서만 관리.

import type { AiLevel } from './types';

// ── 레벨 구간표 ───────────────────────────────────────
// 각 레벨이 시작되는 누적 TP(이상). 굵은 값은 인게임 스크린샷에서 역산한 확정값,
// 일부 하위/상위 구간(Lv.2·3·8·9)은 추정. star = 랭크전에서 매칭되는 AI 난이도(★).
export interface LevelBand {
  level: number; // 1~10
  minTp: number; // 이 레벨이 시작되는 누적 TP(이상)
  star: AiLevel; // 랭크전 매칭 ★
}

export const LEVEL_TABLE: LevelBand[] = [
  { level: 1, minTp: 0, star: 1 },
  { level: 2, minTp: 1000, star: 1 },
  { level: 3, minTp: 2500, star: 2 },
  { level: 4, minTp: 5000, star: 3 },
  { level: 5, minTp: 10000, star: 3 },
  { level: 6, minTp: 15000, star: 3 },
  { level: 7, minTp: 25000, star: 4 },
  { level: 8, minTp: 40000, star: 4 },
  { level: 9, minTp: 55000, star: 5 },
  { level: 10, minTp: 70000, star: 5 },
];

export const MAX_LEVEL = 10;

// 현재 TP → 레벨(1~10).
export function levelForTp(tp: number): number {
  let lv = 1;
  for (const b of LEVEL_TABLE) if (tp >= b.minTp) lv = b.level;
  return lv;
}

// 레벨 → 랭크전 매칭 ★.
export function starForLevel(level: number): AiLevel {
  const b = LEVEL_TABLE.find((x) => x.level === level) ?? LEVEL_TABLE[0];
  return b.star;
}

// 현재 TP → 랭크전 매칭 ★(편의 함수).
export function starForTp(tp: number): AiLevel {
  return starForLevel(levelForTp(tp));
}

// ── 랭크전 매칭 변동 ──────────────────────────────────
// 레벨마다 ★1~5에 가중치를 둔 분포에서 무작위 추첨 → 같은 레벨이라도 매번 난이도가 달라짐.
// 낮은 레벨은 낮은 ★ 위주(가끔 높은 ★), 높은 레벨은 높은 ★ 위주.
// 행 = 레벨(1~10), 열 = [★1, ★2, ★3, ★4, ★5] 가중치(합은 임의 — 내부에서 정규화).
const MATCH_WEIGHTS: Record<number, [number, number, number, number, number]> = {
  1: [60, 25, 10, 4, 1],
  2: [40, 35, 18, 5, 2],
  3: [20, 35, 30, 12, 3],
  4: [10, 25, 35, 22, 8],
  5: [5, 18, 37, 28, 12],
  6: [3, 12, 33, 35, 17],
  7: [2, 7, 26, 38, 27],
  8: [1, 4, 18, 39, 38],
  9: [1, 2, 12, 33, 52],
  10: [0, 1, 7, 27, 65],
};

// TP에 맞춘 실제 매칭 ★(레벨별 가중 무작위, ★1~5). 매칭 시점에 1회만 호출(intro·다시하기).
export function matchStar(tp: number, rng: () => number = Math.random): AiLevel {
  const w = MATCH_WEIGHTS[levelForTp(tp)] ?? MATCH_WEIGHTS[1];
  const total = w.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let i = 0; i < w.length; i++) {
    roll -= w[i];
    if (roll < 0) return (i + 1) as AiLevel; // i=0 → ★1 … i=4 → ★5
  }
  return 5;
}

// 레벨에서 가장 흔한 매칭 ★(분포 최빈값) — '도전 매칭'(평소보다 강한 상대) 판정 기준.
export function typicalStarForTp(tp: number): AiLevel {
  const w = MATCH_WEIGHTS[levelForTp(tp)] ?? MATCH_WEIGHTS[1];
  let best = 0;
  for (let i = 1; i < w.length; i++) if (w[i] > w[best]) best = i;
  return (best + 1) as AiLevel;
}

// 다음 레벨까지 남은 TP(최고 레벨이면 null).
export function tpToNextLevel(tp: number): number | null {
  const lv = levelForTp(tp);
  if (lv >= MAX_LEVEL) return null;
  const next = LEVEL_TABLE.find((x) => x.level === lv + 1);
  return next ? Math.max(0, next.minTp - tp) : null;
}

// ── TP 경제(룰.PNG) ───────────────────────────────────
export const TP = {
  WIN: 200, // 승리 기본
  LOSS: -100, // 패배 기본
  STREAK_BONUS: 100, // 2연승 이상 추가
  STREAK_THRESHOLD: 2, // 이 연승수 '이상'일 때 보너스
  // 랭크전 강적(★3~★5) 승리 보너스
  STAR_BONUS: { 3: 100, 4: 200, 5: 300 } as Record<number, number>,
  // 티카투카(베팅)
  BET_COST: 200, // 선언 시 즉시 차감
  BET_WIN: 400, // 선언 후 승리 시 획득
  // 베팅 선언 조건
  BET_MIN_DICE: 10, // 양 필드 합산 주사위 이 개수 이상부터
  BET_WINDOW_TURNS: 3, // 조건 충족 후 가능한 턴 수
} as const;

export interface TpDeltaInput {
  won: boolean; // 무승부는 false 처리(별도 인자 isDraw로 구분)
  isDraw?: boolean; // 무승부면 변동 없음(연승 유지)
  streakAfterWin: number; // 이번 판 반영 후의 연승수(승리 시), 보너스 판정용
  rankedStar?: AiLevel | null; // 랭크전이면 상대 ★(자유전/PvP면 null → 강적 보너스 없음)
  declared?: boolean; // 이 플레이어가 티카투카(베팅) 선언했는지
}

// 이번 판으로 인한 TP 변동량.
export function tpDelta(input: TpDeltaInput): number {
  if (input.isDraw) return 0; // 무승부 — 변동 없음
  let d = 0;
  if (input.won) {
    d += TP.WIN;
    if (input.streakAfterWin >= TP.STREAK_THRESHOLD) d += TP.STREAK_BONUS;
    if (input.rankedStar != null && TP.STAR_BONUS[input.rankedStar]) d += TP.STAR_BONUS[input.rankedStar];
    if (input.declared) d += TP.BET_WIN;
  } else {
    d += TP.LOSS;
  }
  if (input.declared) d -= TP.BET_COST; // 선언은 승패와 무관하게 즉시 차감
  return d;
}

// TP는 0 미만으로 내려가지 않음.
export function clampTp(tp: number): number {
  return Math.max(0, tp);
}

// 무승부가 아닐 때 다음 연승수.
export function nextStreak(prevStreak: number, won: boolean, isDraw = false): number {
  if (isDraw) return prevStreak; // 무승부 — 연승 유지
  return won ? prevStreak + 1 : 0;
}
