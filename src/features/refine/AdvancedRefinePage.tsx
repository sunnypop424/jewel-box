import { useMemo, useState } from 'react';
import { Sparkles, Calculator, ChevronDown } from 'lucide-react';
import { getAdvancedRefineTable } from './advancedData';
import type { AdvancedRefineTarget } from './advancedData';
import { getReport } from './advancedLogic';
import type { AdvancedRefineReport } from './advancedLogic';
import type { MaterialPrices } from './useMaterialPrices';
import {
  cardClass,
  subtitleClass,
  gold,
  goldShort,
  InfoTip,
  Field,
  Select,
  Checkbox,
  PriceSourceBar,
  MaterialIcon,
  materialSortIndex,
  MaterialPriceSection,
  MaterialAggSection,
  computeMaterialBill,
} from './refineUi';

// 최적 조합(reports[0])의 기대 재료량 — 골드 합이 expectedPrice와 일치하도록 책 보정.
function advancedRequired(
  best: AdvancedRefineReport,
  book: string | undefined,
  priceMap: Record<string, number>
): Record<string, number> {
  const out: Record<string, number> = {};
  let matsGold = 0;
  for (const { name, amount } of best.expectedMaterials) {
    out[name] = (out[name] ?? 0) + amount;
    matsGold += amount * (priceMap[name] ?? 0);
  }
  const bookGold = best.expectedPrice - matsGold;
  if (book && bookGold > 0.5 && (priceMap[book] ?? 0) > 0) {
    out[book] = (out[book] ?? 0) + bookGold / priceMap[book];
  } else if (matsGold > 0) {
    const scale = best.expectedPrice / matsGold;
    for (const k of Object.keys(out)) out[k] *= scale;
  }
  return out;
}

type ItemType = 'weapon' | 'armor';

const TARGETS: { value: AdvancedRefineTarget; label: string }[] = [
  { value: 't3_0', label: 'T3 1~10단계' },
  { value: 't3_1', label: 'T3 11~20단계' },
  { value: 't4_0', label: 'T4 1~10단계' },
  { value: 't4_1', label: 'T4 11~20단계' },
  { value: 't4_2', label: 'T4 21~30단계' },
  { value: 't4_3', label: 'T4 31~40단계' },
];

type Column = {
  key: keyof AdvancedRefineReport;
  label: string;
  kind: 'names' | 'gold' | 'count';
};

function BreathIconList({ names }: { names: string[] }) {
  if (names.length === 0)
    return <span className="text-zinc-300 dark:text-zinc-600">-</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1 align-middle">
      {names.map((n, i) => (
        <MaterialIcon key={i} name={n} size={22} />
      ))}
    </span>
  );
}

export function AdvancedRefinePage({ prices }: { prices: MaterialPrices }) {
  const {
    priceMap, owned, includeMap, priceLoading, priceType, updateTime,
    loadPrices, setPriceType, onPrice, onOwned, onInclude, clearOwned,
  } = prices;
  const [type, setType] = useState<ItemType>('weapon');
  const [target, setTarget] = useState<AdvancedRefineTarget | ''>('');
  const [mochalik, setMochalik] = useState(false);

  const [reports, setReports] = useState<AdvancedRefineReport[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [aggOpen, setAggOpen] = useState(false);

  const table = useMemo(
    () => (target ? getAdvancedRefineTable(type, target, mochalik) : undefined),
    [type, target, mochalik]
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
  const extras = useMemo(() => {
    if (!table) return [];
    const breaths = Object.entries(table.breath).map(([name, amount]) => ({
      name,
      amount,
    }));
    const list = table.book ? [...breaths, { name: table.book, amount: 1 }] : breaths;
    return list.sort((a, b) => materialSortIndex(a.name) - materialSortIndex(b.name));
  }, [table]);

  const calculate = () => {
    if (!table) return;
    setReports(getReport(table, priceMap));
    setShowAll(false);
  };

  const ROW_LIMIT = 8;

  const best = reports?.[0];
  const columns: Column[] = useMemo(() => {
    const enhanced = best?.hasEnhancedBonus;
    return [
      { key: 'normalBreathNames', label: '일반턴 숨결', kind: 'names' },
      { key: 'bonusBreathNames', label: '선조턴 숨결', kind: 'names' },
      ...(enhanced
        ? [
            {
              key: 'enhancedBonusBreathNames',
              label: '강화선조턴 숨결',
              kind: 'names',
            } as Column,
          ]
        : []),
      { key: 'paidNormalPrice', label: '일반턴 비용', kind: 'gold' },
      { key: 'freeNormalPrice', label: '무료일반턴 비용', kind: 'gold' },
      { key: 'bonusPrice', label: '선조턴 비용', kind: 'gold' },
      ...(enhanced
        ? [
            {
              key: 'enhancedBonusPrice',
              label: '강화선조턴 비용',
              kind: 'gold',
            } as Column,
          ]
        : []),
      { key: 'expectedTryCount', label: '평균 트라이', kind: 'count' },
      { key: 'expectedPrice', label: '평균 비용', kind: 'gold' },
    ];
  }, [best?.hasEnhancedBonus]);

  const renderCell = (report: AdvancedRefineReport, col: Column) => {
    const value = report[col.key];
    if (col.kind === 'names') return <BreathIconList names={value as string[]} />;
    if (col.kind === 'gold') return gold(value as number);
    return `${(value as number).toFixed(1)}회`;
  };

  // 최적 조합 기준 필요 재료 · 보유 차감 집계
  const required = useMemo(
    () => (best && table ? advancedRequired(best, table.book, priceMap) : {}),
    [best, table, priceMap]
  );
  const needs = useMemo(
    () =>
      [...materials, ...extras]
        .filter((m) => m.name !== '골드')
        .map((m) => ({ name: m.name, required: required[m.name] ?? 0 })),
    [materials, extras, required]
  );
  const bill = useMemo(
    () => (best ? computeMaterialBill(required, priceMap, owned, includeMap) : null),
    [best, required, priceMap, owned, includeMap]
  );
  // 누르는 골드 = 재련 시 직접 소모되는 골드(골드 재료)
  const pressGold = useMemo(
    () => bill?.rows.find((r) => r.name === '골드')?.gold ?? 0,
    [bill]
  );

  return (
    <section className="flex flex-col gap-6">
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
              <Field label="목표 단계">
                <Select
                  value={target}
                  onChange={(v) => setTarget(v as AdvancedRefineTarget | '')}
                  options={[{ value: '', label: '선택' }, ...TARGETS]}
                />
              </Field>
            </div>
            <div className="mt-4">
              <Checkbox
                checked={mochalik}
                onChange={setMochalik}
                label="모챌익 성장지원 적용"
              />
            </div>
          </div>

          <div className={cardClass}>
            <PriceSourceBar
              priceType={priceType}
              onPriceType={setPriceType}
              updateTime={updateTime}
              onRefresh={() => loadPrices(true)}
              loading={priceLoading}
              onClearOwned={clearOwned}
            />
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
            <Calculator size={16} /> 계산하기
          </button>
        </div>

        {/* 우측: 결과 */}
        <div className={`${cardClass} lg:sticky lg:top-6`}>
          {!reports || !best ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-center">
              <div className="rounded-full bg-zinc-100 p-4 dark:bg-zinc-800">
                <Sparkles size={28} className="text-zinc-400" />
              </div>
              <p className="text-sm text-zinc-400">
                장비와 재료를 입력한 뒤
                <br />
                계산하기를 눌러 결과를 확인하세요.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl bg-gradient-to-br from-indigo-50 to-indigo-100/40 p-4 dark:from-indigo-950/30 dark:to-indigo-900/10">
                <div>
                  <div className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-indigo-500/80">
                    최적 숨결 · 평균 기대 비용
                    <InfoTip text="여러 번 시도했을 때의 평균값입니다. 무료 일반턴(테메르의 정)을 반영해 계산하므로 다른 사이트와 값이 다를 수 있습니다." />
                  </div>
                  <div
                    className="text-2xl font-bold text-indigo-700 dark:text-indigo-300"
                    title={gold(best.expectedPrice)}
                  >
                    {goldShort(best.expectedPrice)}
                  </div>
                  <div className="mt-1 text-[11px] font-medium text-indigo-600/70 dark:text-indigo-300/70">
                    그중 누르는 골드 {gold(pressGold)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                    평균 트라이
                  </div>
                  <div className="text-sm font-bold text-zinc-700 dark:text-zinc-200">
                    {best.expectedTryCount.toFixed(1)}회
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-left text-xs font-bold text-zinc-400 dark:border-zinc-700">
                      {columns.map((c) => (
                        <th
                          key={String(c.key)}
                          className={`px-3 py-2 ${c.kind === 'gold' ? 'text-right' : ''}`}
                        >
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(showAll ? reports : reports.slice(0, ROW_LIMIT)).map(
                      (report, i) => (
                        <tr
                          key={i}
                          className={`border-b border-zinc-100 dark:border-zinc-800 ${
                            i === 0
                              ? 'bg-indigo-50/60 font-semibold text-zinc-900 dark:bg-indigo-950/20 dark:text-zinc-100'
                              : 'text-zinc-700 odd:bg-zinc-50/50 dark:text-zinc-300 dark:odd:bg-zinc-800/20'
                          }`}
                        >
                          {columns.map((c, ci) => (
                            <td
                              key={String(c.key)}
                              className={`px-3 py-2 ${c.kind === 'gold' ? 'text-right' : ''} ${
                                c.key === 'expectedPrice'
                                  ? 'font-bold text-indigo-600 dark:text-indigo-400'
                                  : ''
                              }`}
                            >
                              {ci === 0 && i === 0 && (
                                <span className="mr-1.5 inline-block rounded bg-indigo-600 px-1.5 py-0.5 align-middle text-[10px] font-bold text-white">
                                  최적
                                </span>
                              )}
                              {renderCell(report, c)}
                            </td>
                          ))}
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
              {reports.length > ROW_LIMIT && (
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="w-full rounded-xl bg-zinc-50 py-2 text-xs font-bold text-zinc-500 transition-colors hover:bg-zinc-100 dark:bg-zinc-800/50 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  {showAll ? '접기' : `전체 ${reports.length}개 조합 보기`}
                </button>
              )}
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
