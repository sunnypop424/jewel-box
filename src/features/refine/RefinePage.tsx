import { useEffect, useMemo, useState } from 'react';
import { Hammer, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { getRefineTable, getTargetList } from './refineData';
import { optimize, fixed, expectedMaterials } from './refine';
import type { Path } from './refine';
import { fetchMarketPrices, getPriceObj, emptyPriceMap } from './marketPrice';
import {
  cardClass,
  subtitleClass,
  inputClass,
  gold,
  pct,
  Field,
  Select,
  Checkbox,
  RefreshButton,
  MaterialIcon,
  GRADE_OPTIONS,
  materialSortIndex,
  MaterialPriceSection,
  MaterialAggSection,
  computeMaterialBill,
} from './refineUi';

function BreathIcons({ breathes }: { breathes: Record<string, number> }) {
  const entries = Object.entries(breathes).filter(([, v]) => v > 0);
  if (entries.length === 0)
    return <span className="text-zinc-300 dark:text-zinc-600">-</span>;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {entries.map(([name, count]) => (
        <span key={name} className="inline-flex items-center gap-0.5">
          <MaterialIcon name={name} size={22} />
          <span className="text-xs text-zinc-400">×{count}</span>
        </span>
      ))}
    </span>
  );
}

type ItemType = 'weapon' | 'armor';

const GRADES = GRADE_OPTIONS;

type ResultMode = 'optimal' | 'noBreath' | 'fullBreath';

export function RefinePage() {
  const [type, setType] = useState<ItemType>('weapon');
  const [grade, setGrade] = useState<string>('t4_1590');
  const [target, setTarget] = useState<number | undefined>(undefined);
  const [probFromFailure, setProbFromFailure] = useState(0);
  const [jangin, setJangin] = useState(0);
  const [applyResearch, setApplyResearch] = useState(false);
  const [applyHyperExpress, setApplyHyperExpress] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [aggOpen, setAggOpen] = useState(false);

  const [priceMap, setPriceMap] = useState<Record<string, number>>(emptyPriceMap);
  const [owned, setOwned] = useState<Record<string, number>>({});
  const [includeMap, setIncludeMap] = useState<Record<string, boolean>>({});

  const [priceLoading, setPriceLoading] = useState(false);
  const [mode, setMode] = useState<ResultMode>('optimal');
  const [result, setResult] = useState<{
    optimal: { price: number; path: Path };
    noBreath: { price: number; path: Path };
    fullBreath: { price: number; path: Path };
  } | null>(null);

  const loadPrices = async (manual = false) => {
    setPriceLoading(true);
    try {
      const data = await fetchMarketPrices();
      const obj = getPriceObj(data, 'RecentPrice');
      setPriceMap((prev) => ({ ...prev, ...obj, 골드: 1 }));
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

  const targetList = useMemo(() => getTargetList(type, grade), [type, grade]);

  // 등급/종류가 바뀌어 목표 단계가 목록에 없으면 초기화
  useEffect(() => {
    if (target !== undefined && !targetList.includes(target)) {
      setTarget(undefined);
      setResult(null);
    }
  }, [targetList, target]);

  const table = useMemo(
    () => getRefineTable(type, grade, target, applyResearch, applyHyperExpress),
    [type, grade, target, applyResearch, applyHyperExpress]
  );

  const materials = useMemo(
    () =>
      table
        ? Object.entries(table.amount)
            .map(([name, amount]) => ({ name, amount }))
            .sort((a, b) => materialSortIndex(a.name) - materialSortIndex(b.name))
        : [],
    [table]
  );
  const breaths = useMemo(
    () =>
      table
        ? Object.entries(table.breath)
            .map(([name, [amount]]) => ({ name, amount }))
            .sort((a, b) => materialSortIndex(a.name) - materialSortIndex(b.name))
        : [],
    [table]
  );

  const totalProb = table
    ? table.baseProb * 100 + table.additionalProb * 100 + probFromFailure
    : 0;

  const onPrice = (name: string, v: number) =>
    setPriceMap((p) => ({ ...p, [name]: v }));
  const onOwned = (name: string, v: number) =>
    setOwned((o) => ({ ...o, [name]: v }));
  const onInclude = (name: string, v: boolean) =>
    setIncludeMap((m) => ({ ...m, [name]: v }));

  const calculate = () => {
    if (!table) return;
    const pf = probFromFailure / 100;
    const jg = jangin / 100;
    setResult({
      optimal: optimize(table, priceMap, {}, pf, jg),
      noBreath: fixed(table, priceMap, {}, pf, jg, 0),
      fullBreath: fixed(
        table,
        priceMap,
        {},
        pf,
        jg,
        Object.keys(table.breath).length
      ),
    });
    setMode('optimal');
  };

  const active = result?.[mode];
  // 장기백(천장) 비용 = 각 단계 비용의 단순 합
  const fullJanginPrice = active
    ? active.path.reduce((sum, step) => sum + step.price, 0)
    : 0;

  // 선택 모드의 필요 재료 · 보유 차감 집계
  const required = useMemo(
    () => (active && table ? expectedMaterials(active.path, table.amount) : {}),
    [active, table]
  );
  const needs = useMemo(
    () =>
      [...materials, ...breaths]
        .filter((m) => m.name !== '골드')
        .map((m) => ({ name: m.name, required: required[m.name] ?? 0 })),
    [materials, breaths, required]
  );
  const bill = useMemo(
    () => (active ? computeMaterialBill(required, priceMap, owned, includeMap) : null),
    [active, required, priceMap, owned, includeMap]
  );
  // 누르는 골드 = 재련 시 직접 소모되는 골드(골드 재료)
  const pressGold = useMemo(
    () => bill?.rows.find((r) => r.name === '골드')?.gold ?? 0,
    [bill]
  );

  return (
    <section className="flex flex-col gap-6">
      <div className="hidden flex-col gap-3 sm:flex-row sm:items-center sm:justify-between md:flex md:h-[38px]">
        <h2 className="flex items-center gap-2 text-xl font-bold text-zinc-900 dark:text-zinc-100">
          <Hammer className="text-indigo-500" /> 재련 최적화
        </h2>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:items-start">
        {/* 좌측: 입력 */}
        <div className="flex flex-col gap-6">
          <div className={cardClass}>
            <div className={subtitleClass}>장비 정보</div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="장비 종류">
                <Select
                  value={type}
                  onChange={(v) => setType(v as ItemType)}
                  options={[
                    { value: 'weapon', label: '무기' },
                    { value: 'armor', label: '방어구' },
                  ]}
                />
              </Field>
              <Field label="장비 등급">
                <Select value={grade} onChange={setGrade} options={GRADES} />
              </Field>
              <div className="col-span-2">
                <Field label="목표 단계">
                  <Select
                    value={target !== undefined ? String(target) : ''}
                    onChange={(v) => setTarget(v ? Number(v) : undefined)}
                    options={[
                      { value: '', label: '선택' },
                      ...targetList.map((t) => ({
                        value: String(t),
                        label: `${t}단계`,
                      })),
                    ]}
                  />
                </Field>
              </div>
            </div>

            {table && (
              <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-zinc-50 p-3 text-center dark:bg-zinc-800/50">
                <ProbStat label="기본 확률" value={pct(table.baseProb)} />
                <ProbStat
                  label="추가 확률"
                  value={`${(table.additionalProb * 100 + probFromFailure).toFixed(2)}%`}
                />
                <ProbStat
                  label="합계 확률"
                  value={`${totalProb.toFixed(2)}%`}
                  accent
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="mt-4 flex w-full items-center justify-between rounded-xl bg-zinc-50 px-3 py-2.5 text-xs font-bold text-zinc-500 transition-colors hover:bg-zinc-100 dark:bg-zinc-800/50 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              <span className="uppercase tracking-wider">고급 설정</span>
              <ChevronDown
                size={15}
                className={showAdvanced ? 'rotate-180 transition-transform' : 'transition-transform'}
              />
            </button>
            {showAdvanced && (
              <div className="mt-3 flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="실패로 추가된 확률 (%)">
                    <input
                      type="number"
                      className={inputClass}
                      value={probFromFailure}
                      onChange={(e) => setProbFromFailure(Number(e.target.value))}
                    />
                  </Field>
                  <Field label="장인의 기운 (%)">
                    <input
                      type="number"
                      className={inputClass}
                      value={jangin}
                      onChange={(e) => setJangin(Number(e.target.value))}
                    />
                  </Field>
                </div>
                <div className="flex flex-col gap-2">
                  <Checkbox
                    checked={applyResearch}
                    onChange={setApplyResearch}
                    label="영지 연구 적용"
                  />
                  <Checkbox
                    checked={applyHyperExpress}
                    onChange={setApplyHyperExpress}
                    label="모챌익 성장지원 적용"
                  />
                </div>
              </div>
            )}
          </div>

          <div className={cardClass}>
            <div className="relative mb-3">
              <span className={`${subtitleClass} mb-0`}>재료 가격 · 보유</span>
              <div className="absolute right-0 top-1/2 -translate-y-1/2">
                <RefreshButton
                  onClick={() => loadPrices(true)}
                  loading={priceLoading}
                />
              </div>
            </div>
            {!table ? (
              <p className="py-6 text-center text-sm text-zinc-400">
                장비 정보를 선택하면 필요한 재료가 표시됩니다.
              </p>
            ) : (
              <MaterialPriceSection
                needs={needs}
                priceMap={priceMap}
                owned={owned}
                includeMap={includeMap}
                onPrice={onPrice}
                onOwned={onOwned}
                onInclude={onInclude}
              />
            )}
          </div>

          <button
            onClick={calculate}
            disabled={!table}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3.5 text-sm font-bold text-white shadow-sm shadow-indigo-500/30 transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            <Hammer size={16} /> 계산하기
          </button>
        </div>

        {/* 우측: 결과 */}
        <div className={`${cardClass} lg:sticky lg:top-6`}>
          {!result || !active ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-center">
              <div className="rounded-full bg-zinc-100 p-4 dark:bg-zinc-800">
                <Hammer size={28} className="text-zinc-400" />
              </div>
              <p className="text-sm text-zinc-400">
                장비와 재료를 입력한 뒤
                <br />
                계산하기를 눌러 결과를 확인하세요.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="inline-flex w-full rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800">
                {(
                  [
                    ['optimal', '최적 재련'],
                    ['noBreath', '노숨 재련'],
                    ['fullBreath', '풀숨 재련'],
                  ] as [ResultMode, string][]
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setMode(key)}
                    className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                      mode === key
                        ? 'bg-white text-indigo-600 shadow-sm dark:bg-zinc-900 dark:text-indigo-400'
                        : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl bg-gradient-to-br from-indigo-50 to-indigo-100/40 p-4 dark:from-indigo-950/30 dark:to-indigo-900/10">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-500/80">
                    평균 기대 비용
                  </div>
                  <div className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">
                    {gold(active.price)}
                  </div>
                  <div className="mt-1 text-[11px] font-medium text-indigo-600/70 dark:text-indigo-300/70">
                    그중 누르는 골드 {gold(pressGold)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                    장기백(천장)
                  </div>
                  <div className="text-sm font-bold text-zinc-700 dark:text-zinc-200">
                    {gold(fullJanginPrice)}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-left text-xs font-bold text-zinc-400 dark:border-zinc-700">
                      <th className="px-3 py-2">트라이</th>
                      <th className="px-3 py-2">노숨 확률</th>
                      <th className="px-3 py-2">장인의 기운</th>
                      <th className="px-3 py-2">추가재료</th>
                      <th className="px-3 py-2">트라이 확률</th>
                      <th className="px-3 py-2 text-right">트라이 비용</th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.path.map((step, i) => (
                      <tr
                        key={i}
                        className="border-b border-zinc-100 text-zinc-700 odd:bg-zinc-50/50 dark:border-zinc-800 dark:text-zinc-300 dark:odd:bg-zinc-800/20"
                      >
                        <td className="px-3 py-2 font-bold">{i + 1}트</td>
                        <td className="px-3 py-2">{pct(step.baseProb)}</td>
                        <td className="px-3 py-2">{pct(step.jangin)}</td>
                        <td className="px-3 py-2">
                          <BreathIcons breathes={step.breathes} />
                        </td>
                        <td className="px-3 py-2 font-semibold text-emerald-600 dark:text-emerald-400">
                          {pct(step.totalProb)}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-zinc-800 dark:text-zinc-100">
                          {gold(step.price)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 재료별 집계 (보유 차감) — 접힘/펼침, 기본 접힘 */}
      {bill && bill.rows.length > 0 && (
        <div className={cardClass}>
          <button
            onClick={() => setAggOpen((v) => !v)}
            className="relative flex w-full flex-wrap items-center justify-between gap-3 pr-6"
          >
            <span className={`${subtitleClass} mb-0`}>재료별 집계</span>
            <span className="flex items-center gap-1.5 text-sm">
              <span className="text-zinc-400">총 비용 (보유 차감)</span>
              <span className="font-bold text-indigo-600 dark:text-indigo-400">
                {gold(bill.total)}
              </span>
            </span>
            <ChevronDown
              size={16}
              className={`absolute right-0 top-1/2 -translate-y-1/2 text-zinc-400 transition-transform ${aggOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {aggOpen && (
            <div className="mt-3">
              <MaterialAggSection rows={bill.rows} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ProbStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-bold text-zinc-400">{label}</span>
      <span
        className={
          accent
            ? 'text-sm font-bold text-indigo-600 dark:text-indigo-400'
            : 'text-sm font-bold text-zinc-700 dark:text-zinc-200'
        }
      >
        {value}
      </span>
    </div>
  );
}
