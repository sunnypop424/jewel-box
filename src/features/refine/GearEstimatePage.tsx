import { useEffect, useMemo, useState } from 'react';
import { Wrench, Search, Loader2, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { fetchMarketPrices, getPriceObj, emptyPriceMap } from './marketPrice';
import { getRefineTable, getTargetList } from './refineData';
import { getAdvancedRefineTable } from './advancedData';
import type { AdvancedRefineTarget } from './advancedData';
import { fetchEquipment } from './gearApi';
import type { GearPiece, SlotKey } from './gearApi';
import { estimateGear } from './gearEstimate';
import type { EstimateResult } from './gearEstimate';
import { estimateByItemLevel, ARMOR_PRIORITY } from './gearRoute';
import type { ItemLevelEstimateResult, PieceRoute } from './gearRoute';
import { GRADE_SPEC, SUCCESSIONS, itemLevelOf, isRouteGrade } from './gearRouteData';
import type { RouteGrade } from './gearRouteData';
import {
  cardClass,
  subtitleClass,
  inputClass,
  gold,
  Select,
  Checkbox,
  NumInput,
  RefreshButton,
  GRADE_OPTIONS,
  materialSortIndex,
  MaterialPriceSection,
  MaterialAggSection,
  computeMaterialBill,
} from './refineUi';

type Row = GearPiece & { targetNormal: number; targetAdv: number; jangin: number };

const SLOTS: { slot: SlotKey; label: string; type: 'weapon' | 'armor' }[] = [
  { slot: 'weapon', label: '무기', type: 'weapon' },
  { slot: 'head', label: '투구', type: 'armor' },
  { slot: 'shoulder', label: '어깨', type: 'armor' },
  { slot: 'chest', label: '상의', type: 'armor' },
  { slot: 'pants', label: '하의', type: 'armor' },
  { slot: 'gloves', label: '장갑', type: 'armor' },
];

const ADV_BUCKETS = new Set(['t3_0', 't3_1', 't4_0', 't4_1', 't4_2', 't4_3']);

const advTierOf = (grade: string): 't3' | 't4' =>
  grade.startsWith('t4') ? 't4' : 't3';

// 상급 재련은 t4_1590(결단/업화)에만 존재
const hasAdvanced = (grade: string) => grade === 't4_1590';

const pieceToRow = (p: GearPiece): Row => ({
  ...p,
  targetNormal: p.currentNormal,
  targetAdv: p.currentAdv,
  jangin: 0,
});

const manualRows = (): Row[] =>
  SLOTS.map((s) => ({
    slot: s.slot,
    slotLabel: s.label,
    type: s.type,
    grade: 't4_1590',
    advTier: 't4',
    currentNormal: 0,
    currentAdv: 0,
    targetNormal: 0,
    targetAdv: 0,
    jangin: 0,
  }));

// 직접 입력 프리셋: 전 부위를 동일 등급·현재·목표로 채운다
const presetRows = (
  grade: string,
  cn: number,
  ca: number,
  tn: number,
  ta: number
): Row[] =>
  SLOTS.map((s) => ({
    slot: s.slot,
    slotLabel: s.label,
    type: s.type,
    grade,
    advTier: advTierOf(grade),
    currentNormal: cn,
    currentAdv: ca,
    targetNormal: tn,
    targetAdv: ta,
    jangin: 0,
  }));

const PRESETS: { label: string; grade: string; cn: number; ca: number; tn: number; ta: number }[] = [
  { label: 'T4 1590 (18·상20 → 20·상40)', grade: 't4_1590', cn: 18, ca: 20, tn: 20, ta: 40 },
  { label: 'T4 1730 (11 → 15)', grade: 't4_1730', cn: 11, ca: 0, tn: 15, ta: 0 },
];

// 현재 부위/목표 범위에서 실제로 쓰이는 재료 키 목록 (시세 수정용)
function relevantMaterials(
  rows: Row[],
  applyResearch: boolean,
  applyMochalik: boolean
): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    const valid = new Set(getTargetList(r.type, r.grade));
    for (let lvl = r.currentNormal + 1; lvl <= r.targetNormal; lvl++) {
      if (!valid.has(lvl)) continue;
      const t = getRefineTable(r.type, r.grade, lvl, applyResearch, applyMochalik);
      if (t) {
        Object.keys(t.amount).forEach((k) => set.add(k));
        Object.keys(t.breath).forEach((k) => set.add(k));
      }
    }
    if (hasAdvanced(r.grade) && r.targetAdv > r.currentAdv) {
      for (let b = Math.floor(r.currentAdv / 10); b <= Math.floor((r.targetAdv - 1) / 10); b++) {
        const bucket = `${r.advTier}_${b}`;
        if (!ADV_BUCKETS.has(bucket)) continue;
        try {
          const t = getAdvancedRefineTable(r.type, bucket as AdvancedRefineTarget, applyMochalik);
          Object.keys(t.amount).forEach((k) => set.add(k));
          Object.keys(t.breath).forEach((k) => set.add(k));
          if (t.book) set.add(t.book);
        } catch {
          /* 버킷 없음 */
        }
      }
    }
  }
  set.delete('골드');
  return [...set].sort((a, b) => materialSortIndex(a) - materialSortIndex(b));
}

// 현재 등급에서 계승으로 도달 가능한 등급들 (목표 IL 모드 시세 입력용)
function reachableGrades(start: string): RouteGrade[] {
  if (!isRouteGrade(start)) return [];
  const seen = new Set<RouteGrade>([start]);
  let added = true;
  while (added) {
    added = false;
    for (const e of SUCCESSIONS)
      if (seen.has(e.from) && !seen.has(e.to)) {
        seen.add(e.to);
        added = true;
      }
  }
  return [...seen];
}

// 목표 IL 모드: 도달 가능한 등급 전체 트랙에서 쓰일 수 있는 재료 키 (시세 수정용)
function relevantMaterialsForIlvl(
  rows: Row[],
  applyResearch: boolean,
  applyMochalik: boolean
): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    for (const g of reachableGrades(r.grade)) {
      const spec = GRADE_SPEC[g];
      const valid = new Set(getTargetList(r.type, g));
      for (let lvl = 1; lvl <= spec.normalMax; lvl++) {
        if (!valid.has(lvl)) continue;
        const t = getRefineTable(r.type, g, lvl, applyResearch, applyMochalik);
        if (t) {
          Object.keys(t.amount).forEach((k) => set.add(k));
          Object.keys(t.breath).forEach((k) => set.add(k));
        }
      }
      if (spec.hasAdvanced) {
        for (let b = 0; b <= 3; b++) {
          try {
            const t = getAdvancedRefineTable(r.type, `t4_${b}` as AdvancedRefineTarget, applyMochalik);
            Object.keys(t.amount).forEach((k) => set.add(k));
            Object.keys(t.breath).forEach((k) => set.add(k));
            if (t.book) set.add(t.book);
          } catch {
            /* 버킷 없음 */
          }
        }
      }
    }
  }
  set.delete('골드');
  return [...set].sort((a, b) => materialSortIndex(a) - materialSortIndex(b));
}

// 루트를 등급 구간별로 묶어 표시 (Dijkstra가 만든 번갈아 순서 → 등급별 일반/상급 묶음).
// 각 등급 구간 안에서 일반(전체 범위)·상급(전체 범위)을 한 줄씩, 비용·결과 IL과 함께.
interface RouteSeg {
  label: string;
  gold: number;
  il: number;
}
function routeSegments(route: PieceRoute): RouteSeg[] {
  const segs: RouteSeg[] = [];
  let phase: PieceRoute['steps'] = [];
  const flush = () => {
    if (phase.length === 0) return;
    const grade = phase[0].grade;
    const label = GRADE_SPEC[grade].label;
    const normals = phase.filter((s) => s.kind === 'normal');
    const advs = phase.filter((s) => s.kind === 'advanced');
    const finalNormal = Math.max(...phase.map((s) => s.toNormal));
    const startAdv = Math.min(...phase.map((s) => s.fromAdv));
    const finalAdv = Math.max(...phase.map((s) => s.toAdv));
    if (normals.length) {
      const startNormal = Math.min(...normals.map((s) => s.fromNormal));
      segs.push({
        label: `${label} 일반 재련 ${startNormal}→${finalNormal}강`,
        gold: normals.reduce((g, s) => g + s.gold, 0),
        il: itemLevelOf(grade, finalNormal, startAdv),
      });
    }
    if (advs.length) {
      segs.push({
        label: `${label} 상급 재련 ${startAdv}→${finalAdv}단계`,
        gold: advs.reduce((g, s) => g + s.gold, 0),
        il: itemLevelOf(grade, finalNormal, finalAdv),
      });
    }
    phase = [];
  };
  for (const s of route.steps) {
    if (s.kind === 'succession') {
      flush();
      segs.push({ label: s.label, gold: 0, il: itemLevelOf(s.grade, s.toNormal, s.toAdv) });
    } else {
      phase = [...phase, s];
    }
  }
  flush();
  return segs;
}

// 견적 계산 시점의 입력 스냅샷 (결과·집계는 이 스냅샷 기준으로 고정)
type CalcSnap = {
  priceMap: Record<string, number>;
  owned: Record<string, number>;
  includeMap: Record<string, boolean>;
  rows: Row[];
  targetIlvl: number;
  applyResearch: boolean;
  applyMochalik: boolean;
  balanced: boolean;
};

const btnBase =
  'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-bold transition-colors disabled:opacity-50';

export function GearEstimatePage() {
  const [charName, setCharName] = useState('');
  const [searching, setSearching] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [source, setSource] = useState<'api' | 'manual' | null>(null);

  const [priceMap, setPriceMap] = useState<Record<string, number>>(emptyPriceMap);
  const [priceLoading, setPriceLoading] = useState(false);
  const [owned, setOwned] = useState<Record<string, number>>({});
  const [includeMap, setIncludeMap] = useState<Record<string, boolean>>({});

  const [bulkNormal, setBulkNormal] = useState(0);
  const [bulkAdv, setBulkAdv] = useState(0);
  const [applyResearch, setApplyResearch] = useState(false);
  const [applyMochalik, setApplyMochalik] = useState(false);

  const [mode, setMode] = useState<'per-part' | 'target-ilvl'>('per-part');
  const [targetIlvl, setTargetIlvl] = useState(1700);
  const [balanced, setBalanced] = useState(false);
  const [role, setRole] = useState<'dealer' | 'support'>('dealer');
  const [aggOpen, setAggOpen] = useState(false);

  const [result, setResult] = useState<EstimateResult | ItemLevelEstimateResult | null>(null);
  const [calcSnap, setCalcSnap] = useState<CalcSnap | null>(null);

  const loadPrices = async (manual = false) => {
    setPriceLoading(true);
    try {
      const data = await fetchMarketPrices();
      setPriceMap((prev) => ({ ...prev, ...getPriceObj(data, 'RecentPrice'), 골드: 1 }));
      if (manual) toast.success('재료 시세를 불러왔습니다. (최근 거래가)');
    } catch (e) {
      console.error('[시세 로드 실패]', e);
      toast.error('시세를 불러오지 못했습니다. 가격을 직접 입력해 주세요.');
    } finally {
      setPriceLoading(false);
    }
  };

  useEffect(() => {
    loadPrices();
  }, []);

  const search = async () => {
    const name = charName.trim();
    if (!name) return;
    setSearching(true);
    try {
      const pieces = await fetchEquipment(name);
      setRows(pieces.map(pieceToRow));
      setSource('api');
      setResult(null);
      toast.success(`${name} 장비 정보를 불러왔습니다.`);
    } catch (e) {
      console.error('[장비 조회 실패]', e);
      toast.error(e instanceof Error ? e.message : '장비 정보를 불러오지 못했습니다.');
    } finally {
      setSearching(false);
    }
  };

  const setRow = (slot: SlotKey, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.slot === slot ? { ...r, ...patch } : r)));

  // 일괄 목표 입력 → 즉시 전 부위 목표 갱신 (현재 미만으로는 안 내려감)
  const onBulkNormal = (v: number) => {
    setBulkNormal(v);
    setRows((prev) =>
      prev.map((r) => ({ ...r, targetNormal: Math.max(v, r.currentNormal) }))
    );
  };
  const onBulkAdv = (v: number) => {
    setBulkAdv(v);
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        targetAdv: hasAdvanced(r.grade) ? Math.max(v, r.currentAdv) : r.currentAdv,
      }))
    );
  };

  // 보유 재료를 반영한 "실제로 내가 내는 골드" 최소 루트 (스냅샷 입력 기준).
  //  - 체크 해제(완전 보유) 재료 → 0원
  //  - 보유량이 충분한 재료 → 0원으로 봐도 그 루트의 소모량이 보유량을 안 넘으면(과사용 X) 0원 확정
  //    (소모량이 보유량을 넘으면 초과분은 시세로 사야 하므로 한계비용=시세로 유지)
  const computeIlvlRoute = (s: CalcSnap, r: 'dealer' | 'support') => {
    const run = (p: Record<string, number>) =>
      estimateByItemLevel(s.rows, s.targetIlvl, p, s.applyResearch, s.applyMochalik, s.balanced, r);
    const eff: Record<string, number> = { ...s.priceMap };
    for (const [k, v] of Object.entries(s.includeMap)) if (v === false) eff[k] = 0;
    let res = run(eff);
    const locked = new Set<string>();
    for (let iter = 0; iter < 40; iter++) {
      let cand: string | null = null;
      for (const [m, agg] of Object.entries(res.materials)) {
        if (m === '골드' || eff[m] === 0 || locked.has(m)) continue;
        if ((s.owned[m] ?? 0) >= agg.count) {
          cand = m;
          break;
        }
      }
      if (!cand) break;
      const testRes = run({ ...eff, [cand]: 0 });
      if ((s.owned[cand] ?? 0) >= (testRes.materials[cand]?.count ?? 0)) {
        eff[cand] = 0; // 공짜로 봐도 보유량 내 → 0원 확정
        res = testRes;
      } else {
        locked.add(cand); // 과사용 발생 → 시세 유지
      }
    }
    return res;
  };

  // 견적 계산: 현재 입력을 스냅샷으로 고정하고 결과 산출 (이후 입력 변경은 결과에 반영 안 됨)
  const calculate = () => {
    const snap: CalcSnap = {
      priceMap,
      owned,
      includeMap,
      rows,
      targetIlvl,
      applyResearch,
      applyMochalik,
      balanced,
    };
    setCalcSnap(snap);
    if (mode === 'target-ilvl') {
      setResult(computeIlvlRoute(snap, role));
      return;
    }
    const targets: Record<string, { targetNormal: number; targetAdv: number; jangin: number }> = {};
    snap.rows.forEach((r) => {
      targets[r.slot] = { targetNormal: r.targetNormal, targetAdv: r.targetAdv, jangin: r.jangin };
    });
    setResult(estimateGear(snap.rows, targets, snap.priceMap, snap.applyResearch, snap.applyMochalik));
  };

  const onModeChange = (m: 'per-part' | 'target-ilvl') => {
    setMode(m);
    setResult(null);
  };

  const currentLocked = source === 'api';
  const priceMats = useMemo(
    () =>
      mode === 'target-ilvl'
        ? relevantMaterialsForIlvl(rows, applyResearch, applyMochalik)
        : relevantMaterials(rows, applyResearch, applyMochalik),
    [mode, rows, applyResearch, applyMochalik]
  );

  // 목표 IL 모드 결과 (루트 표시용)
  const ilvlResult = result && 'routes' in result ? (result as ItemLevelEstimateResult) : null;

  // 루트 카드 표시 순서: 무기 → 역할 우선순위 방어구
  const displayRoutes = useMemo(() => {
    if (!ilvlResult) return [];
    const order = ['weapon', ...ARMOR_PRIORITY[role]];
    return [...ilvlResult.routes].sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot));
  }, [ilvlResult, role]);

  // 부위별 소계 (보유 차감 후) — 보유 풀을 루트 순서로 차감해 합이 헤드라인과 정확히 일치
  const pieceBills = useMemo(() => {
    if (!ilvlResult || !calcSnap) return null;
    const pool: Record<string, number> = { ...calcSnap.owned };
    return displayRoutes.map((rt) => {
      let normalGold = 0;
      let advGold = 0;
      for (const st of rt.steps) {
        let g = 0;
        for (const [m, c] of Object.entries(st.materials)) {
          if (m !== '골드' && calcSnap.includeMap[m] === false) continue; // 보유(체크 해제) → 0
          let cnt = c;
          if (m !== '골드') {
            const have = Math.min(pool[m] ?? 0, c);
            pool[m] = (pool[m] ?? 0) - have;
            cnt = c - have;
          }
          g += cnt * (calcSnap.priceMap[m] ?? 0);
        }
        if (st.kind === 'advanced') advGold += g;
        else normalGold += g;
      }
      return {
        slot: rt.slot,
        slotLabel: rt.slotLabel,
        normalGold,
        advGold,
        subtotal: normalGold + advGold,
        skippedNormal: [] as number[],
      };
    });
  }, [ilvlResult, displayRoutes, calcSnap]);

  // 역할 변경: 스냅샷 입력 기준으로 재배정 (라이브 입력은 안 읽음)
  const onRoleChange = (r: 'dealer' | 'support') => {
    setRole(r);
    if (calcSnap && result && 'routes' in result) setResult(computeIlvlRoute(calcSnap, r));
  };

  // 결과의 재료별 필요 수량 (placeholder · 집계용)
  const requiredMap = useMemo(() => {
    const out: Record<string, number> = {};
    if (result) for (const [k, v] of Object.entries(result.materials)) out[k] = v.count;
    return out;
  }, [result]);

  // 가격·보유 입력 섹션에 줄 재료 목록 (필요 수량 포함)
  const priceNeeds = useMemo(
    () => priceMats.map((name) => ({ name, required: requiredMap[name] ?? 0 })),
    [priceMats, requiredMap]
  );

  // 보유·체크 반영한 최종 집계 (스냅샷 기준 — 견적 계산 시점 고정)
  const bill = useMemo(
    () =>
      result && calcSnap
        ? computeMaterialBill(requiredMap, calcSnap.priceMap, calcSnap.owned, calcSnap.includeMap)
        : null,
    [result, calcSnap, requiredMap]
  );
  // 누르는 골드 = 재련 시 직접 소모되는 골드(골드 재료)
  const pressGold = useMemo(
    () => bill?.rows.find((r) => r.name === '골드')?.gold ?? 0,
    [bill]
  );

  const onPrice = (name: string, v: number) =>
    setPriceMap((p) => ({ ...p, [name]: v }));
  const onOwned = (name: string, v: number) =>
    setOwned((o) => ({ ...o, [name]: v }));
  const onInclude = (name: string, v: boolean) =>
    setIncludeMap((m) => ({ ...m, [name]: v }));

  const skippedNote = useMemo(
    () => result?.pieces.some((p) => p.skippedNormal.length > 0) ?? false,
    [result]
  );

  return (
    <section className="flex flex-col gap-6">
      <div className="hidden flex-col gap-3 sm:flex-row sm:items-center sm:justify-between md:flex md:h-[38px]">
        <h2 className="flex items-center gap-2 text-xl font-bold text-zinc-900 dark:text-zinc-100">
          <Wrench className="text-indigo-500" /> 장비 강화 견적
        </h2>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:items-start">
        {/* 좌측 (440px): 검색 · 재료별 집계 · 재료 시세 */}
        <div className="flex flex-col gap-6">
          {/* 캐릭터 조회 */}
          <div className={cardClass}>
            <div className={subtitleClass}>캐릭터 조회</div>
            <div className="flex flex-col gap-2">
              <input
                type="text"
                value={charName}
                onChange={(e) => setCharName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && search()}
                placeholder="캐릭터명을 입력하세요"
                className={inputClass}
              />
              <div className="flex gap-2">
                <button
                  onClick={search}
                  disabled={searching || !charName.trim()}
                  className={`${btnBase} flex-1 bg-indigo-600 text-white hover:bg-indigo-500`}
                >
                  {searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                  불러오기
                </button>
                <button
                  onClick={() => {
                    setRows(manualRows());
                    setSource('manual');
                    setResult(null);
                  }}
                  className={`${btnBase} flex-1 bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700`}
                >
                  직접 입력
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-medium text-zinc-400">프리셋</span>
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => {
                      setRows(presetRows(p.grade, p.cn, p.ca, p.tn, p.ta));
                      setSource('manual');
                      setResult(null);
                    }}
                    className="rounded-lg bg-zinc-100 px-2.5 py-1 text-xs font-bold text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 재료 가격 · 보유 (입력) */}
          {rows.length > 0 && (
            <div className={cardClass}>
              <div className="relative mb-3">
                <span className={`${subtitleClass} mb-0`}>재료 가격 · 보유</span>
                <div className="absolute right-0 top-1/2 -translate-y-1/2">
                  <RefreshButton onClick={() => loadPrices(true)} loading={priceLoading} />
                </div>
              </div>
              {priceNeeds.length === 0 ? (
                <p className="py-2 text-xs text-zinc-400">
                  목표 단계를 설정하면 재료의 가격·보유를 입력할 수 있습니다.
                </p>
              ) : (
                <MaterialPriceSection
                  needs={priceNeeds}
                  priceMap={priceMap}
                  owned={owned}
                  includeMap={includeMap}
                  onPrice={onPrice}
                  onOwned={onOwned}
                  onInclude={onInclude}
                />
              )}
            </div>
          )}

          {/* 재료별 집계 (결과) — 접힘/펼침, 기본 접힘 */}
          {result && bill && (
            <div className={cardClass}>
              <button
                onClick={() => setAggOpen((v) => !v)}
                className="relative block w-full text-left"
              >
                <span className={`${subtitleClass} mb-0`}>재료별 집계</span>
                <ChevronDown
                  size={16}
                  className={`absolute right-0 top-1/2 -translate-y-1/2 text-zinc-400 transition-transform ${aggOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {aggOpen &&
                (bill.rows.length === 0 ? (
                  <p className="mt-3 py-6 text-center text-sm text-zinc-400">
                    목표가 현재와 같습니다. 목표 단계를 올려 주세요.
                  </p>
                ) : (
                  <div className="mt-3">
                    <MaterialAggSection rows={bill.rows} />
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* 우측 (1fr): 부위별 강화 단계 · 골드 관련 테이블 */}
        <div className="flex flex-col gap-6">
          {rows.length === 0 ? (
            <div className={`${cardClass} flex min-h-[260px] flex-col items-center justify-center gap-3 text-center`}>
              <div className="rounded-full bg-zinc-100 p-4 dark:bg-zinc-800">
                <Wrench size={28} className="text-zinc-400" />
              </div>
              <p className="text-sm text-zinc-400">
                왼쪽에서 캐릭터를 조회하거나
                <br />
                "직접 입력"으로 시작하세요.
              </p>
            </div>
          ) : (
            <>
              {/* 부위별 강화 단계 */}
              <div className={cardClass}>
                <div className="mb-3 flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={`${subtitleClass} mb-0`}>부위별 강화 단계</span>
                    <div className="inline-flex rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800">
                      {(
                        [
                          ['per-part', '부위별 목표'],
                          ['target-ilvl', '목표 아이템 레벨'],
                        ] as const
                      ).map(([m, label]) => (
                        <button
                          key={m}
                          onClick={() => onModeChange(m)}
                          className={`rounded-md px-3 py-1 text-xs font-bold transition-colors ${
                            mode === m
                              ? 'bg-white text-indigo-600 shadow-sm dark:bg-zinc-900 dark:text-indigo-400'
                              : 'text-zinc-500 dark:text-zinc-400'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {mode === 'per-part' ? (
                    <div className="flex items-center justify-end gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      <span>일괄 목표</span>
                      <NumInput value={bulkNormal} onChange={onBulkNormal} className="w-12" />
                      <span>일반</span>
                      <NumInput value={bulkAdv} onChange={onBulkAdv} className="w-12" />
                      <span>상급</span>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      <span>목표 캐릭터 평균 아이템 레벨</span>
                      <NumInput value={targetIlvl} onChange={setTargetIlvl} className="w-20" />
                      <Checkbox
                        checked={balanced}
                        onChange={(v) => {
                          setBalanced(v);
                          setResult(null);
                        }}
                        label="균등 강화"
                      />
                    </div>
                  )}
                </div>
                {currentLocked && (
                  <p className="mb-2 text-[11px] font-medium text-zinc-400">
                    현재 수치는 조회값(수정 불가) · 목표만 입력
                  </p>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
                    {mode === 'target-ilvl' ? (
                      <thead>
                        <tr className="text-[11px] font-bold text-zinc-400">
                          <th className="px-2 py-1 text-left">부위</th>
                          <th className="px-2 py-1 text-left">등급</th>
                          <th className="px-1 py-1">현재 일반</th>
                          <th className="px-1 py-1">현재 상급</th>
                          <th className="px-1 py-1">현재 아이템 레벨</th>
                        </tr>
                      </thead>
                    ) : (
                      <thead>
                        <tr className="text-[11px] font-bold text-zinc-400">
                          <th className="px-2 py-1 text-left align-bottom" rowSpan={2}>부위</th>
                          <th className="px-2 py-1 text-left align-bottom" rowSpan={2}>등급</th>
                          <th className="border-b border-zinc-100 px-2 py-1 dark:border-zinc-800" colSpan={3}>
                            일반 재련
                          </th>
                          <th className="border-b border-zinc-100 px-2 py-1 dark:border-zinc-800" colSpan={2}>
                            상급 재련 <span className="font-medium text-zinc-300 dark:text-zinc-600">(업화 전용)</span>
                          </th>
                        </tr>
                        <tr className="text-[11px] font-bold text-zinc-400">
                          <th className="px-1 py-1">현재</th>
                          <th className="px-1 py-1">목표</th>
                          <th className="px-1 py-1">기운(%)</th>
                          <th className="px-1 py-1">현재</th>
                          <th className="px-1 py-1">목표</th>
                        </tr>
                      </thead>
                    )}
                    <tbody>
                      {rows.map((r) => {
                        const adv = hasAdvanced(r.grade);
                        const il = isRouteGrade(r.grade)
                          ? itemLevelOf(r.grade, r.currentNormal, r.currentAdv)
                          : r.itemLevel;
                        return (
                          <tr key={r.slot} className="border-t border-zinc-100 dark:border-zinc-800">
                            <td className="px-2 py-1.5 font-bold text-zinc-700 dark:text-zinc-200">
                              {r.slotLabel}
                            </td>
                            <td className="px-2 py-1.5">
                              <div className="w-32">
                                <Select
                                  value={r.grade}
                                  onChange={(v) => setRow(r.slot, { grade: v, advTier: advTierOf(v) })}
                                  options={GRADE_OPTIONS}
                                />
                              </div>
                            </td>
                            <td className="px-1 py-1.5">
                              <NumInput
                                value={r.currentNormal}
                                onChange={(v) => setRow(r.slot, { currentNormal: v })}
                                disabled={currentLocked}
                                className="mx-auto w-14"
                              />
                            </td>
                            {mode === 'per-part' && (
                              <>
                                <td className="px-1 py-1.5">
                                  <NumInput
                                    value={r.targetNormal}
                                    onChange={(v) => setRow(r.slot, { targetNormal: v })}
                                    className="mx-auto w-14"
                                  />
                                </td>
                                <td className="px-1 py-1.5">
                                  <NumInput
                                    value={r.jangin}
                                    onChange={(v) => setRow(r.slot, { jangin: v })}
                                    className="mx-auto w-14"
                                  />
                                </td>
                              </>
                            )}
                            <td className="px-1 py-1.5">
                              {adv ? (
                                <NumInput
                                  value={r.currentAdv}
                                  onChange={(v) => setRow(r.slot, { currentAdv: v })}
                                  disabled={currentLocked}
                                  className="mx-auto w-14"
                                />
                              ) : (
                                <span className="block text-center text-zinc-300 dark:text-zinc-600">—</span>
                              )}
                            </td>
                            {mode === 'per-part' && (
                              <td className="px-1 py-1.5">
                                {adv ? (
                                  <NumInput
                                    value={r.targetAdv}
                                    onChange={(v) => setRow(r.slot, { targetAdv: v })}
                                    className="mx-auto w-14"
                                  />
                                ) : (
                                  <span className="block text-center text-zinc-300 dark:text-zinc-600">—</span>
                                )}
                              </td>
                            )}
                            {mode === 'target-ilvl' && (
                              <td className="px-1 py-1.5 text-center font-semibold text-zinc-600 dark:text-zinc-300">
                                {il ?? '—'}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                  <Checkbox
                    checked={applyResearch}
                    onChange={setApplyResearch}
                    label="영지 연구 적용"
                  />
                  <Checkbox
                    checked={applyMochalik}
                    onChange={setApplyMochalik}
                    label="모챌익 적용 (일반·상급)"
                  />
                </div>

                <button
                  onClick={calculate}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-sm shadow-indigo-500/30 transition-colors hover:bg-indigo-500"
                >
                  <Wrench size={16} /> 견적 계산
                </button>
                <p className="mt-2 text-xs text-zinc-400">
                  {mode === 'target-ilvl'
                    ? '평균 기대비용 기준입니다. 낮은 등급 장비를 올린 뒤 상위 장비로 계승(전환)하는 편이 더 쌀 수 있어, 계승까지 따져 가장 저렴한 강화 경로를 찾아줍니다. 반영되는 계승: 낙인→결단/업화, 업화 25강+상급 40강→전율. (결단 장비는 20강이 최대라 그 이상은 업화로 계승하는 비용이 포함됩니다.)'
                    : '평균 기대비용 기준. 장인의 기운은 부위별 현재 진행 단계에 적용됩니다.'}
                </p>
              </div>

              {/* 골드 관련 테이블 (결과) */}
              {result && bill ? (
                <>
                  {/* 요약: 총 비용 + 평균 */}
                  <div className={cardClass}>
                    <div className="rounded-xl bg-gradient-to-br from-indigo-50 to-indigo-100/40 p-4 dark:from-indigo-950/30 dark:to-indigo-900/10">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-500/80">
                        누르는 골드 포함 총 예상 비용 (보유 차감)
                      </div>
                      <div className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">
                        {gold(bill.total)}
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5 border-t border-indigo-200/50 pt-1.5 text-xs font-medium text-indigo-600/80 dark:border-indigo-400/20 dark:text-indigo-300/80">
                        <span>그중 누르는 골드</span>
                        <span className="font-bold">{gold(pressGold)}</span>
                      </div>
                    </div>
                    {ilvlResult && (
                      <>
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/40">
                            <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                              목표 평균
                            </div>
                            <div className="mt-0.5 text-xl font-bold text-zinc-800 dark:text-zinc-100">
                              {ilvlResult.targetAvgIL}
                            </div>
                          </div>
                          <div className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/40">
                            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                              달성 평균
                              {!ilvlResult.feasible && (
                                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                                  미달
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 text-xl font-bold text-zinc-800 dark:text-zinc-100">
                              {ilvlResult.achievedAvgIL.toFixed(1)}
                            </div>
                          </div>
                        </div>
                        {!ilvlResult.feasible && (
                          <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
                            현재 등급·상급 한계로 목표 평균에 도달할 수 없습니다. 목표를 낮추거나 등급을 상향해 주세요.
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  {/* 강화 루트 (목표 IL 모드) */}
                  {ilvlResult && (
                    <div className={cardClass}>
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <span className={`${subtitleClass} mb-0`}>강화 루트</span>
                        <div className="inline-flex rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800">
                          {(
                            [
                              ['dealer', '딜러'],
                              ['support', '서폿'],
                            ] as const
                          ).map(([r, label]) => (
                            <button
                              key={r}
                              onClick={() => onRoleChange(r)}
                              className={`rounded-md px-3 py-1 text-xs font-bold transition-colors ${
                                role === r
                                  ? 'bg-white text-indigo-600 shadow-sm dark:bg-zinc-900 dark:text-indigo-400'
                                  : 'text-zinc-500 dark:text-zinc-400'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        {displayRoutes.map((rt) => {
                          const segs = routeSegments(rt);
                          return (
                            <div key={rt.slot} className="rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-800/40">
                              <div className="flex items-center justify-between gap-2">
                                <span className="flex items-baseline gap-2 text-sm font-bold text-zinc-800 dark:text-zinc-100">
                                  {rt.slotLabel}
                                  <span className="text-xs font-medium text-zinc-400">
                                    최종 달성 아이템 레벨 {rt.itemLevel}
                                  </span>
                                </span>
                                <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                                  {gold(rt.gold)}
                                </span>
                              </div>
                              {segs.length === 0 ? (
                                <div className="mt-2 text-xs text-zinc-400">현재 유지 (강화 불필요)</div>
                              ) : (
                                <ol className="mt-2.5 flex flex-col gap-2">
                                  {segs.map((s, idx) => (
                                    <li
                                      key={idx}
                                      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-zinc-100 pt-2 text-xs first:border-0 first:pt-0 dark:border-zinc-800"
                                    >
                                      <span className="flex min-w-0 items-center gap-2 font-medium text-zinc-700 dark:text-zinc-200">
                                        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
                                          {idx + 1}
                                        </span>
                                        {s.label}
                                      </span>
                                      <span className="flex shrink-0 items-center gap-3">
                                        <span className="text-zinc-400">달성 아이템 레벨 {s.il}</span>
                                        <span className="w-24 text-right font-semibold tabular-nums text-zinc-600 dark:text-zinc-300">
                                          {gold(s.gold)}
                                        </span>
                                      </span>
                                    </li>
                                  ))}
                                </ol>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 부위별 소계 */}
                  <div className={cardClass}>
                    <div className={subtitleClass}>부위별 소계</div>
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 text-left text-xs font-bold text-zinc-400 dark:border-zinc-700">
                        <th className="px-2 py-2">부위</th>
                        <th className="px-2 py-2 text-right">일반</th>
                        <th className="px-2 py-2 text-right">상급</th>
                        <th className="px-2 py-2 text-right">소계</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(pieceBills ?? result.pieces).map((p) => (
                        <tr
                          key={p.slot}
                          className="border-b border-zinc-100 text-zinc-700 dark:border-zinc-800 dark:text-zinc-300"
                        >
                          <td className="px-2 py-2 font-medium">{p.slotLabel}</td>
                          <td className="px-2 py-2 text-right">{gold(p.normalGold)}</td>
                          <td className="px-2 py-2 text-right">{gold(p.advGold)}</td>
                          <td className="px-2 py-2 text-right font-bold text-zinc-800 dark:text-zinc-100">
                            {gold(p.subtotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-[11px] text-zinc-400">
                    {ilvlResult
                      ? '부위별 소계 합 = 총 예상 비용 (보유·체크 차감 반영).'
                      : '부위별 소계는 보유 차감 전 기준입니다.'}
                  </p>
                  {skippedNote && (
                    <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                      일부 단계는 데이터가 없어 제외되었습니다(예: T4 1~10단계).
                    </p>
                  )}
                  </div>
                </>
              ) : (
                <div className={`${cardClass} flex min-h-[120px] items-center justify-center text-center`}>
                  <p className="text-sm text-zinc-400">
                    견적 계산을 누르면 비용이 표시됩니다.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
