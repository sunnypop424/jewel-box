// 부위별 현재→목표 재련 비용 합산 (일반 + 상급). 평균 기대비용 기준.
import { getRefineTable, getTargetList } from './refineData';
import { optimize, expectedMaterials } from './refine';
import { getAdvancedRefineTable } from './advancedData';
import type { AdvancedRefineTarget } from './advancedData';
import { getReport } from './advancedLogic';
import type { GearPiece } from './gearApi';

export interface GearTargets {
  targetNormal: number;
  targetAdv: number;
  jangin: number; // 장인의 기운 (%) — 부위별, 일반 재련 현재 진행 단계에 적용
}

export interface MaterialAgg {
  count: number;
  gold: number;
}

export interface PieceResult {
  slot: GearPiece['slot'];
  slotLabel: string;
  normalGold: number;
  advGold: number;
  subtotal: number;
  skippedNormal: number[]; // 데이터 없어 제외된 일반 단계
}

export interface EstimateResult {
  totalGold: number;
  pieces: PieceResult[];
  materials: Record<string, MaterialAgg>; // 재료별 집계
}

const ADV_BUCKETS = new Set<AdvancedRefineTarget>([
  't4_0',
  't4_1',
  't4_2',
  't4_3',
]);

function addMat(
  agg: Record<string, MaterialAgg>,
  name: string,
  count: number,
  priceMap: Record<string, number>
) {
  const a = agg[name] ?? { count: 0, gold: 0 };
  a.count += count;
  a.gold += count * (priceMap[name] ?? 0);
  agg[name] = a;
}

function estimateNormal(
  piece: GearPiece,
  target: number,
  priceMap: Record<string, number>,
  jangin: number,
  applyResearch: boolean,
  applyMochalik: boolean,
  agg: Record<string, MaterialAgg>
): { gold: number; skipped: number[] } {
  const valid = new Set(getTargetList(piece.type, piece.grade));
  let gold = 0;
  const skipped: number[] = [];
  for (let lvl = piece.currentNormal + 1; lvl <= target; lvl++) {
    const table = valid.has(lvl)
      ? getRefineTable(piece.type, piece.grade, lvl, applyResearch, applyMochalik)
      : undefined;
    if (!table) {
      skipped.push(lvl);
      continue;
    }
    const startJangin = lvl === piece.currentNormal + 1 ? jangin / 100 : 0;
    const res = optimize(table, priceMap, {}, 0, startJangin);
    gold += res.price;
    const mats = expectedMaterials(res.path, table.amount);
    for (const [m, c] of Object.entries(mats)) addMat(agg, m, c, priceMap);
  }
  return { gold, skipped };
}

function estimateAdvanced(
  piece: GearPiece,
  target: number,
  priceMap: Record<string, number>,
  agg: Record<string, MaterialAgg>
): number {
  // 상급 재련은 t4_1590(결단/업화)에만 존재. 전율(세르카)·T3은 없음.
  if (piece.grade !== 't4_1590') return 0;
  if (target <= piece.currentAdv) return 0;
  let gold = 0;
  const from = piece.currentAdv;
  for (let b = Math.floor(from / 10); b <= Math.floor((target - 1) / 10); b++) {
    const bucket = `${piece.advTier}_${b}` as AdvancedRefineTarget;
    if (!ADV_BUCKETS.has(bucket)) continue;
    let best;
    let book: string | undefined;
    try {
      const table = getAdvancedRefineTable(piece.type, bucket);
      book = table.book;
      best = getReport(table, priceMap)[0];
    } catch {
      continue;
    }
    if (!best) continue;
    // 이 버킷(10단계) 중 [from+1 .. target] 범위에 포함된 단계 비율
    const lo = Math.max(from + 1, b * 10 + 1);
    const hi = Math.min(target, b * 10 + 10);
    const frac = (hi - lo + 1) / 10;
    const advPrice = best.expectedPrice * frac;
    gold += advPrice;
    // 재료 집계의 골드 합이 advPrice(=expectedPrice)와 일치하도록 보정.
    // getReport의 expectedMaterials는 책(book)을 빼고 무료턴 기본재료를 더 세는
    // 불일치가 있어, 책 잔차를 더하거나(주 원인) 스케일로 맞춘다.
    const entries = best.expectedMaterials.map((m) => ({
      name: m.name,
      count: m.amount * frac,
    }));
    const matsGold = entries.reduce(
      (s, e) => s + e.count * (priceMap[e.name] ?? 0),
      0
    );
    const bookGold = advPrice - matsGold;
    if (book && bookGold > 0.5 && (priceMap[book] ?? 0) > 0) {
      entries.push({ name: book, count: bookGold / priceMap[book] });
    } else if (matsGold > 0) {
      const scale = advPrice / matsGold;
      for (const e of entries) e.count *= scale;
    }
    for (const e of entries) addMat(agg, e.name, e.count, priceMap);
  }
  return gold;
}

export function estimateGear(
  pieces: GearPiece[],
  targets: Record<string, GearTargets>,
  priceMap: Record<string, number>,
  applyResearch: boolean,
  applyMochalik: boolean
): EstimateResult {
  const materials: Record<string, MaterialAgg> = {};
  const results: PieceResult[] = [];
  for (const piece of pieces) {
    const tgt = targets[piece.slot];
    if (!tgt) continue;
    const { gold: normalGold, skipped } = estimateNormal(
      piece,
      tgt.targetNormal,
      priceMap,
      tgt.jangin,
      applyResearch,
      applyMochalik,
      materials
    );
    const advGold = estimateAdvanced(
      piece,
      tgt.targetAdv,
      priceMap,
      materials
    );
    results.push({
      slot: piece.slot,
      slotLabel: piece.slotLabel,
      normalGold,
      advGold,
      subtotal: normalGold + advGold,
      skippedNormal: skipped,
    });
  }
  const totalGold = results.reduce((s, r) => s + r.subtotal, 0);
  return { totalGold, pieces: results, materials };
}
