import type { RouletteHistory } from '../types';

// 참여 대비 당첨률 기반 가중치.
// 각 판마다 '공정지분(1/N)'을 누적한 expected(기대 당첨) 대비 실제 wins 의 차이를 debt(빚)로 본다.
//   debt > 0 : 기대보다 덜 당첨됨 → 우대(가중치↑)  = 소프트 천장
//   debt < 0 : 기대보다 더 당첨됨 → 감소(가중치↓)
// 판마다 참여 인원 수가 달라도 공정지분으로 정규화되므로 4명판/8명판이 섞여도 공정하다.

// 중간 강도: 빚 ±1 기준 e^0.55 ≈ 1.73배 / e^-0.55 ≈ 0.58배. 초과·부족이 커져도 아래 범위로 클램프.
const STRENGTH = 0.55;
const MIN_MULT = 0.35; // 당첨 초과자 최저 (기본의 35%)
const MAX_MULT = 2.5;  // 당첨 부족자 최고 (기본의 2.5배)

export interface RouletteWeightInfo {
  name: string;
  weight: number; // 정규화 전 가중치(배수)
  chance: number; // 0~1 당첨 확률
  debt: number;   // 기대 대비 부족(+)/초과(-)
}

export function computeRouletteWeights(names: string[], history: RouletteHistory): RouletteWeightInfo[] {
  const raw = names.map((name) => {
    const s = history[name];
    const debt = s ? s.expected - s.wins : 0; // 이력 없는 신규 참여자는 중립(0)
    const weight = Math.min(MAX_MULT, Math.max(MIN_MULT, Math.exp(STRENGTH * debt)));
    return { name, debt, weight };
  });
  const total = raw.reduce((sum, r) => sum + r.weight, 0) || 1;
  return raw.map((r) => ({ ...r, chance: r.weight / total }));
}

// 가중치 배열에서 확률적으로 인덱스 하나를 뽑는다.
export function pickWeightedIndex(weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}
