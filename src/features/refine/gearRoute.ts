// 목표 캐릭터 평균 아이템 레벨 → 부위별 최저가 강화 루트(계승 포함) + 6부위 배분.
// 부위별: (등급, 일반단계, 상급단계) 그래프에 재련·계승 엣지를 깔고 Dijkstra로
// IL별 최저비용 곡선을 만든 뒤, 6부위 배분 DP로 평균 목표를 최소비용으로 달성한다.
import { optimize, expectedMaterials } from './refine';
import { getRefineTable, getTargetList } from './refineData';
import { getAdvancedRefineTable } from './advancedData';
import type { AdvancedRefineTarget } from './advancedData';
import { getReport } from './advancedLogic';
import type { EstimateResult, MaterialAgg, PieceResult } from './gearEstimate';
import type { GearPiece } from './gearApi';
import {
  GRADE_SPEC,
  SUCCESSIONS,
  itemLevelOf,
  advGateIL,
  isRouteGrade,
} from './gearRouteData';
import type { RouteGrade } from './gearRouteData';

export interface RouteStep {
  kind: 'normal' | 'advanced' | 'succession';
  grade: RouteGrade;
  fromNormal: number;
  toNormal: number;
  fromAdv: number;
  toAdv: number;
  gold: number;
  materials: Record<string, number>;
  label: string;
}

export interface PieceRoute {
  slot: GearPiece['slot'];
  slotLabel: string;
  itemLevel: number;
  endGrade: RouteGrade;
  endNormal: number;
  endAdv: number;
  gold: number;
  steps: RouteStep[];
  materials: Record<string, number>;
}

export interface PieceCostCurve {
  slot: GearPiece['slot'];
  currentIL: number;
  points: PieceRoute[]; // IL 오름차순, Pareto 프론티어 (낮은 IL일수록 저렴)
}

export interface ItemLevelEstimateResult extends EstimateResult {
  targetAvgIL: number;
  achievedAvgIL: number;
  feasible: boolean;
  routes: PieceRoute[];
}

// 간단 이진 최소 힙 (key=gold)
class MinHeap<T> {
  private a: { k: number; v: T }[] = [];
  get size() {
    return this.a.length;
  }
  push(k: number, v: T) {
    const a = this.a;
    a.push({ k, v });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].k <= a[i].k) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): T {
    const a = this.a;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let m = i;
        if (l < a.length && a[l].k < a[m].k) m = l;
        if (r < a.length && a[r].k < a[m].k) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top.v;
  }
}

// 상급 1단계 비용·재료 (버킷 기대비용/10). estimateAdvanced(gearEstimate.ts)의
// 책 잔차 보정 패턴을 단일 단계용으로 미러 — 재료 골드합이 단계 비용과 일치.
function advStageCost(
  type: 'weapon' | 'armor',
  bucketIndex: number,
  priceMap: Record<string, number>,
  mochalik: boolean
): { gold: number; materials: Record<string, number> } | null {
  let table;
  try {
    table = getAdvancedRefineTable(type, `t4_${bucketIndex}` as AdvancedRefineTarget, mochalik);
  } catch {
    return null;
  }
  const best = getReport(table, priceMap)[0];
  if (!best) return null;
  const book = table.book;
  const advPrice = best.expectedPrice / 10;
  const entries = best.expectedMaterials.map((m) => ({ name: m.name, count: m.amount / 10 }));
  const matsGold = entries.reduce((s, e) => s + e.count * (priceMap[e.name] ?? 0), 0);
  const bookGold = advPrice - matsGold;
  if (book && bookGold > 0.5 && (priceMap[book] ?? 0) > 0) {
    entries.push({ name: book, count: bookGold / priceMap[book] });
  } else if (matsGold > 0) {
    const scale = advPrice / matsGold;
    for (const e of entries) e.count *= scale;
  }
  const materials: Record<string, number> = {};
  for (const e of entries) materials[e.name] = (materials[e.name] ?? 0) + e.count;
  return { gold: advPrice, materials };
}

const keyOf = (g: RouteGrade, n: number, a: number) => `${g}|${n}|${a}`;

interface Settled {
  grade: RouteGrade;
  normal: number;
  adv: number;
  il: number;
  gold: number;
}

function dijkstra(
  piece: GearPiece,
  priceMap: Record<string, number>,
  applyResearch: boolean,
  applyMochalik: boolean
) {
  const type = piece.type;
  const startGrade = piece.grade as RouteGrade; // 호출부가 isRouteGrade 보장
  const startKey = keyOf(startGrade, piece.currentNormal, piece.currentAdv);

  const dist = new Map<string, number>([[startKey, 0]]);
  const prev = new Map<string, { from: string; step: RouteStep }>();
  const settled = new Map<string, Settled>();

  // 캐시: 등급별 유효 일반단계, 일반 1단계 비용, 상급 버킷 1단계 비용
  const validCache = new Map<RouteGrade, Set<number>>();
  const validOf = (g: RouteGrade) => {
    let s = validCache.get(g);
    if (!s) {
      s = new Set(getTargetList(type, g));
      validCache.set(g, s);
    }
    return s;
  };
  const normalCache = new Map<string, { gold: number; materials: Record<string, number> } | null>();
  const normalEdge = (g: RouteGrade, stage: number) => {
    const ck = `${g}|${stage}`;
    let v = normalCache.get(ck);
    if (v === undefined) {
      const table = getRefineTable(type, g, stage, applyResearch, applyMochalik);
      if (!table) {
        v = null;
      } else {
        const res = optimize(table, priceMap, {}, 0, 0);
        v = { gold: res.price, materials: expectedMaterials(res.path, table.amount) };
      }
      normalCache.set(ck, v);
    }
    return v;
  };
  const advCache = new Map<number, { gold: number; materials: Record<string, number> } | null>();
  const advEdge = (advStage: number) => {
    const b = Math.floor((advStage - 1) / 10);
    let v = advCache.get(b);
    if (v === undefined) {
      v = advStageCost(type, b, priceMap, applyMochalik);
      advCache.set(b, v);
    }
    return v;
  };

  const heap = new MinHeap<string>();
  heap.push(0, startKey);

  while (heap.size) {
    const key = heap.pop();
    if (settled.has(key)) continue;
    const d = dist.get(key)!;
    const [g, ns, as] = key.split('|');
    const grade = g as RouteGrade;
    const normal = +ns;
    const adv = +as;
    const il = itemLevelOf(grade, normal, adv);
    settled.set(key, { grade, normal, adv, il, gold: d });
    const spec = GRADE_SPEC[grade];

    const relax = (nk: string, cost: number, step: RouteStep) => {
      const nd = d + cost;
      if (nd < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, nd);
        prev.set(nk, { from: key, step });
        heap.push(nd, nk);
      }
    };

    // 1) 일반 +1
    if (normal < spec.normalMax && validOf(grade).has(normal + 1)) {
      const e = normalEdge(grade, normal + 1);
      if (e) {
        relax(keyOf(grade, normal + 1, adv), e.gold, {
          kind: 'normal', grade, fromNormal: normal, toNormal: normal + 1,
          fromAdv: adv, toAdv: adv, gold: e.gold, materials: e.materials,
          label: `${spec.label} ${normal}→${normal + 1}강`,
        });
      }
    }
    // 2) 상급 +1 (t4_1590, IL 게이트 통과 시)
    if (spec.hasAdvanced && adv < spec.advMax && il >= advGateIL(adv + 1)) {
      const e = advEdge(adv + 1);
      if (e) {
        relax(keyOf(grade, normal, adv + 1), e.gold, {
          kind: 'advanced', grade, fromNormal: normal, toNormal: normal,
          fromAdv: adv, toAdv: adv + 1, gold: e.gold, materials: e.materials,
          label: `상급 ${adv}→${adv + 1}`,
        });
      }
    }
    // 3) 계승
    for (const edge of SUCCESSIONS) {
      if (edge.from !== grade) continue;
      if (edge.requireAdv !== undefined && adv !== edge.requireAdv) continue;
      const destNormal = edge.table[normal];
      if (destNormal === undefined) continue;
      relax(keyOf(edge.to, destNormal, 0), 0, {
        kind: 'succession', grade: edge.to, fromNormal: normal, toNormal: destNormal,
        fromAdv: adv, toAdv: 0, gold: 0, materials: {},
        label: `${edge.label}(${destNormal}강)`,
      });
    }
  }

  return { settled, prev, startKey };
}

function reconstruct(
  key: string,
  settled: Map<string, Settled>,
  prev: Map<string, { from: string; step: RouteStep }>,
  startKey: string,
  slot: GearPiece['slot'],
  slotLabel: string
): PieceRoute {
  const steps: RouteStep[] = [];
  let cur = key;
  while (cur !== startKey) {
    const p = prev.get(cur);
    if (!p) break;
    steps.push(p.step);
    cur = p.from;
  }
  steps.reverse();
  const materials: Record<string, number> = {};
  for (const s of steps)
    for (const [m, c] of Object.entries(s.materials)) materials[m] = (materials[m] ?? 0) + c;
  const info = settled.get(key)!;
  return {
    slot, slotLabel, itemLevel: info.il, endGrade: info.grade,
    endNormal: info.normal, endAdv: info.adv, gold: info.gold, steps, materials,
  };
}

export function buildPieceCurve(
  piece: GearPiece,
  priceMap: Record<string, number>,
  applyResearch: boolean,
  applyMochalik: boolean
): PieceCostCurve {
  // 라우트 미지원 등급(하위 t3 등): 현재 상태 고정, 개선 불가
  if (!isRouteGrade(piece.grade)) {
    const il = piece.itemLevel ?? 0;
    return {
      slot: piece.slot,
      currentIL: il,
      points: [{
        slot: piece.slot, slotLabel: piece.slotLabel, itemLevel: il,
        endGrade: 't4_1590', endNormal: piece.currentNormal, endAdv: piece.currentAdv,
        gold: 0, steps: [], materials: {},
      }],
    };
  }

  const { settled, prev, startKey } = dijkstra(piece, priceMap, applyResearch, applyMochalik);
  const currentIL = itemLevelOf(piece.grade, piece.currentNormal, piece.currentAdv);

  // IL별 최저 gold 라우트
  const bestByIL = new Map<number, PieceRoute>();
  for (const key of settled.keys()) {
    const r = reconstruct(key, settled, prev, startKey, piece.slot, piece.slotLabel);
    const e = bestByIL.get(r.itemLevel);
    if (!e || r.gold < e.gold) bestByIL.set(r.itemLevel, r);
  }
  // Pareto 프론티어: IL 내림차순으로 보며 더 싼 것만 유지
  const ils = [...bestByIL.keys()].sort((a, b) => b - a);
  let bestGold = Infinity;
  const frontier: PieceRoute[] = [];
  for (const il of ils) {
    const r = bestByIL.get(il)!;
    if (r.gold < bestGold) {
      frontier.push(r);
      bestGold = r.gold;
    }
  }
  frontier.reverse(); // IL 오름차순
  return { slot: piece.slot, currentIL, points: frontier };
}

// 역할별 방어구 강화 우선순위 (높은 우선순위가 더 높은 IL을 받음)
export const ARMOR_PRIORITY: Record<'dealer' | 'support', GearPiece['slot'][]> = {
  dealer: ['gloves', 'shoulder', 'head', 'pants', 'chest'], // 장갑>어깨>투구>하의>상의
  support: ['chest', 'pants', 'head', 'shoulder', 'gloves'], // 상의>하의>투구>어깨>장갑
};

export function estimateByItemLevel(
  pieces: GearPiece[],
  targetAvgIL: number,
  priceMap: Record<string, number>,
  applyResearch: boolean,
  applyMochalik: boolean,
  balanced = false,
  role: 'dealer' | 'support' = 'dealer'
): ItemLevelEstimateResult {
  const curves = pieces.map((p) => buildPieceCurve(p, priceMap, applyResearch, applyMochalik));
  const base = curves.reduce((s, c) => s + c.currentIL, 0);
  const S = 6 * targetAvgIL;
  const need = Math.max(0, S - base);

  let chosen: PieceRoute[];
  let feasible = true;

  if (balanced) {
    // 균등 강화: 각 부위를 목표 IL 이상에 최대한 근접·최저가로 (points는 IL·gold 오름차순)
    chosen = curves.map((c) => {
      const p = c.points.find((pt) => pt.itemLevel >= targetAvgIL);
      if (!p) {
        feasible = false;
        return c.points[c.points.length - 1];
      }
      return p;
    });
  } else if (need === 0) {
    chosen = curves.map((c) => c.points[0]); // 현재 유지 (최저 IL·gold0)
  } else {
    let dp = new Array<number>(need + 1).fill(Infinity);
    dp[0] = 0;
    const choiceLayers: Int32Array[] = [];
    const prevLayers: Int32Array[] = [];
    for (let i = 0; i < curves.length; i++) {
      const pts = curves[i].points;
      const cur = curves[i].currentIL;
      const ndp = new Array<number>(need + 1).fill(Infinity);
      const choice = new Int32Array(need + 1).fill(-1);
      const pre = new Int32Array(need + 1).fill(-1);
      for (let s = 0; s <= need; s++) {
        if (dp[s] === Infinity) continue;
        for (let pi = 0; pi < pts.length; pi++) {
          const gain = pts[pi].itemLevel - cur;
          const nsum = Math.min(need, s + gain);
          const nc = dp[s] + pts[pi].gold;
          if (nc < ndp[nsum]) {
            ndp[nsum] = nc;
            choice[nsum] = pi;
            pre[nsum] = s;
          }
        }
      }
      dp = ndp;
      choiceLayers.push(choice);
      prevLayers.push(pre);
    }
    if (dp[need] === Infinity) {
      // 도달 불가 → 각 부위 최대 IL로 best-effort
      feasible = false;
      chosen = curves.map((c) => c.points[c.points.length - 1]);
    } else {
      chosen = new Array<PieceRoute>(curves.length);
      let s = need;
      for (let i = curves.length - 1; i >= 0; i--) {
        chosen[i] = curves[i].points[choiceLayers[i][s]];
        s = prevLayers[i][s];
      }
    }
  }

  // 역할 우선순위: 같은 현재 상태의 방어구끼리, 높은 IL을 우선순위 높은 부위에 배정.
  // (모든 방어구 부위는 동일 재련 테이블이라 같은 현재상태면 루트가 호환되어 재배치 가능)
  const prio = ARMOR_PRIORITY[role];
  const groups = new Map<string, number[]>();
  pieces.forEach((p, i) => {
    if (p.type !== 'armor') return;
    const k = `${p.grade}|${p.currentNormal}|${p.currentAdv}`;
    const g = groups.get(k) ?? [];
    g.push(i);
    groups.set(k, g);
  });
  for (const idxs of groups.values()) {
    const slotsByPrio = [...idxs].sort(
      (a, b) => prio.indexOf(pieces[a].slot) - prio.indexOf(pieces[b].slot)
    );
    const routesByIL = idxs
      .map((i) => chosen[i])
      .sort((a, b) => b.itemLevel - a.itemLevel || b.gold - a.gold);
    slotsByPrio.forEach((slotIdx, k) => {
      const p = pieces[slotIdx];
      chosen[slotIdx] = { ...routesByIL[k], slot: p.slot, slotLabel: p.slotLabel };
    });
  }

  const achievedSum = chosen.reduce((s, r) => s + r.itemLevel, 0);
  const totalGold = chosen.reduce((s, r) => s + r.gold, 0);

  const counts: Record<string, number> = {};
  for (const r of chosen)
    for (const [m, c] of Object.entries(r.materials)) counts[m] = (counts[m] ?? 0) + c;
  const materials: Record<string, MaterialAgg> = {};
  for (const [m, c] of Object.entries(counts)) materials[m] = { count: c, gold: c * (priceMap[m] ?? 0) };

  const pieceResults: PieceResult[] = chosen.map((r) => {
    let normalGold = 0;
    let advGold = 0;
    for (const st of r.steps) {
      if (st.kind === 'advanced') advGold += st.gold;
      else normalGold += st.gold;
    }
    return { slot: r.slot, slotLabel: r.slotLabel, normalGold, advGold, subtotal: r.gold, skippedNormal: [] };
  });

  return {
    totalGold,
    pieces: pieceResults,
    materials,
    targetAvgIL,
    achievedAvgIL: achievedSum / 6,
    feasible,
    routes: chosen,
  };
}
