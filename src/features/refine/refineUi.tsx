// 재련/상급 재련 페이지 공용 프리미티브 (jewel-box 인라인 Tailwind 패턴)
import { useEffect, useState } from 'react';
import { ChevronDown, RefreshCw, Coins } from 'lucide-react';
import { MATERIAL_META, GRADE_RING } from './materialMeta';

// number input 스피너 제거용
const noSpin =
  '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

export const cardClass =
  'rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50';
export const subtitleClass =
  'mb-3 text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500';
export const inputClass =
  `h-9 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 shadow-sm outline-none transition-colors focus:border-indigo-500 focus:bg-white dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 ${noSpin}`;

// 세그먼티드(pill) 토글 — 재련 허브 탭 / 견적 모드 토글 공용.
// size='md'는 허브 상단 탭, 'sm'은 카드 내부 모드 토글에 사용.
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'sm',
  badges,
}: {
  options: readonly (readonly [T, string])[];
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  // 옵션별 카운트 뱃지 (없으면 미표시)
  badges?: Partial<Record<T, number>>;
}) {
  const pad = size === 'md' ? 'px-4 py-1.5 text-sm' : 'px-3 py-1 text-xs';
  return (
    <div className="inline-flex flex-wrap rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800">
      {options.map(([v, label]) => {
        const active = value === v;
        const badge = badges?.[v];
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`flex items-center gap-1.5 rounded-md font-bold transition-colors ${pad} ${
              active
                ? 'bg-white text-indigo-600 shadow-sm dark:bg-zinc-900 dark:text-indigo-400'
                : 'text-zinc-500 dark:text-zinc-400'
            }`}
          >
            {label}
            {badge !== undefined && (
              <span
                className={`rounded-full px-1.5 text-[10px] ${
                  active
                    ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300'
                    : 'bg-zinc-200 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-300'
                }`}
              >
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const numFmt = (n: number) =>
  n ? n.toLocaleString('ko-KR', { maximumFractionDigits: 4 }) : '0';

// 천 단위 콤마 표시 + 스피너 없는 숫자 입력. 포커스 중엔 원본 텍스트를 편집,
// 블러 시 콤마 포맷으로 표시. 외부 value 변경(시세 새로고침)은 비포커스일 때 반영.
export function NumInput({
  value,
  onChange,
  disabled,
  readOnly,
  placeholder,
  className = '',
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState('');
  useEffect(() => {
    if (!focused) setText('');
  }, [value, focused]);

  // 값이 0이고 placeholder가 있으면 빈칸으로 두어 placeholder(필요 수량)를 노출
  // 단, readonly(보유 전체)일 땐 값을 그대로 보여준다.
  const display =
    focused && !readOnly
      ? text
      : value
        ? numFmt(value)
        : placeholder != null
          ? ''
          : '0';

  return (
    <input
      type="text"
      inputMode="decimal"
      disabled={disabled}
      readOnly={readOnly}
      placeholder={placeholder}
      value={display}
      onFocus={() => {
        if (readOnly) return;
        setFocused(true);
        setText(value ? String(value) : '');
      }}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        if (readOnly) return;
        const t = e.target.value;
        setText(t);
        const n = parseFloat(t.replace(/,/g, ''));
        onChange(isNaN(n) ? 0 : n);
      }}
      className={`h-9 rounded-lg border border-zinc-200 bg-zinc-50 px-2 text-right text-sm text-zinc-900 outline-none focus:border-indigo-500 read-only:cursor-default read-only:bg-zinc-100 read-only:text-zinc-400 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:read-only:bg-zinc-800 dark:read-only:text-zinc-500 dark:disabled:bg-zinc-800 ${className}`}
    />
  );
}

// 재료 아이콘 (등급별 테두리 색). 매핑 없는 재료(골드 등)는 코인 폴백.
export function MaterialIcon({
  name,
  size = 22,
}: {
  name: string;
  size?: number;
}) {
  const label = materialLabel(name);
  const meta = MATERIAL_META[name];
  if (!meta) {
    return (
      <span
        title={label}
        className="flex shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-600 ring-1 ring-amber-300 dark:bg-amber-500/15"
        style={{ width: size, height: size }}
      >
        <Coins size={size * 0.62} />
      </span>
    );
  }
  return (
    <img
      src={meta.icon}
      alt={label}
      title={label}
      loading="lazy"
      width={size}
      height={size}
      className={`shrink-0 rounded-md bg-zinc-800/90 object-cover ring-1 ${GRADE_RING[meta.grade]}`}
      style={{ width: size, height: size }}
    />
  );
}

export const gold = (n: number) => `${Math.round(n).toLocaleString('ko-KR')} G`;
export const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

// 데이터 키(짧은 식별자)를 화면 표기용 명칭으로 변환. 키 자체는 시세/계산에
// 그대로 쓰이므로 절대 바꾸지 않고, 표시할 때만 매핑한다.
const MATERIAL_LABELS: Record<string, string> = {
  운명의수호석: '운명의 수호석',
  운명의파괴석: '운명의 파괴석',
  운명의수호석결정: '운명의 수호석 결정',
  운명의파괴석결정: '운명의 파괴석 결정',
  운돌: '운명의 돌파석',
  위운돌: '위대한 운명의 돌파석',
  아비도스: '아비도스 융화 재료',
  상급아비도스: '상급 아비도스 융화 재료',
  운명파편: '운명의 파편',
  빙하: '빙하의 숨결',
  용암: '용암의 숨결',
  명돌: '명예의 돌파석',
  위명돌: '위대한 명예의 돌파석',
  경명돌: '경이로운 명예의 돌파석',
  찬명돌: '찬란한 명예의 돌파석',
  중급오레하: '오레하 융화 재료',
  상급오레하: '상급 오레하 융화 재료',
  최상급오레하: '최상급 오레하 융화 재료',
  파편: '명예의 파편',
  수결: '수호석 결정',
  파결: '파괴석 결정',
  정제된수호강석: '정제된 수호강석',
  정제된파괴강석: '정제된 파괴강석',
  은총: '태양의 은총',
  축복: '태양의 축복',
  가호: '태양의 가호',
  장인의재봉술1단계: '장인의 재봉술 1단계',
  장인의재봉술2단계: '장인의 재봉술 2단계',
  장인의재봉술3단계: '장인의 재봉술 3단계',
  장인의재봉술4단계: '장인의 재봉술 4단계',
  장인의야금술1단계: '장인의 야금술 1단계',
  장인의야금술2단계: '장인의 야금술 2단계',
  장인의야금술3단계: '장인의 야금술 3단계',
  장인의야금술4단계: '장인의 야금술 4단계',
};

export const materialLabel = (name: string) => MATERIAL_LABELS[name] ?? name;

// 모바일 해상도용 줄임말. 없으면 전체 라벨로 폴백.
const SHORT_LABELS: Record<string, string> = {
  파괴강석: '파강석',
  수호강석: '수강석',
  정제된파괴강석: '정제파강',
  정제된수호강석: '정제수강',
  운명의파괴석: '운파석',
  운명의수호석: '운수석',
  운명의파괴석결정: '운파결',
  운명의수호석결정: '운수결',
  파결: '파결',
  수결: '수결',
  명돌: '명돌',
  위명돌: '위명돌',
  경명돌: '경명돌',
  찬명돌: '찬명돌',
  운돌: '운돌',
  위운돌: '위운돌',
  중급오레하: '중오레하',
  상급오레하: '상오레하',
  최상급오레하: '최상오레하',
  아비도스: '아비도스',
  상급아비도스: '상아비도스',
  파편: '명파편',
  운명파편: '운파편',
  은총: '은총',
  축복: '축복',
  가호: '가호',
  빙하: '빙하',
  용암: '용암',
  장인의재봉술1단계: '재봉1',
  장인의재봉술2단계: '재봉2',
  장인의재봉술3단계: '재봉3',
  장인의재봉술4단계: '재봉4',
  장인의야금술1단계: '야금1',
  장인의야금술2단계: '야금2',
  장인의야금술3단계: '야금3',
  장인의야금술4단계: '야금4',
};
export const materialShortLabel = (name: string) => SHORT_LABELS[name] ?? materialLabel(name);

// 모바일: 줄임말, sm 이상: 전체 라벨
function MaterialName({ name }: { name: string }) {
  return (
    <>
      <span className="sm:hidden">{materialShortLabel(name)}</span>
      <span className="hidden sm:inline">{materialLabel(name)}</span>
    </>
  );
}

// 재료 분류(필수/추가) + 고정 정렬 순서 — 세 페이지 공통.
// 추가 재료 = 숨결 + 책, 그 외는 필수 재료.
const BREATH_NAMES = ['은총', '축복', '가호', '빙하', '용암'];
const isBook = (n: string) =>
  n.startsWith('장인의') || n.startsWith('재봉술') || n.startsWith('야금술');
export const isExtraMaterial = (n: string) =>
  BREATH_NAMES.includes(n) || isBook(n);

const MATERIAL_ORDER: string[] = [
  // 필수 — 강석 / 석 / 결정
  '파괴강석', '수호강석', '정제된파괴강석', '정제된수호강석',
  '운명의파괴석', '운명의수호석', '운명의파괴석결정', '운명의수호석결정',
  '파결', '수결',
  // 필수 — 돌파석
  '명돌', '위명돌', '경명돌', '찬명돌', '운돌', '위운돌',
  // 필수 — 융화 재료
  '중급오레하', '상급오레하', '최상급오레하', '아비도스', '상급아비도스',
  // 필수 — 파편 / 골드
  '파편', '운명파편', '골드',
  // 추가 — 숨결
  '은총', '축복', '가호', '빙하', '용암',
  // 추가 — 책
  '재봉술기본', '재봉술응용', '재봉술심화', '재봉술숙련', '재봉술특화',
  '재봉술전문', '재봉술복합', '재봉술업화A', '재봉술업화B', '재봉술업화C',
  '야금술기본', '야금술응용', '야금술심화', '야금술숙련', '야금술특화',
  '야금술전문', '야금술복합', '야금술업화A', '야금술업화B', '야금술업화C',
  '장인의재봉술1단계', '장인의재봉술2단계', '장인의재봉술3단계', '장인의재봉술4단계',
  '장인의야금술1단계', '장인의야금술2단계', '장인의야금술3단계', '장인의야금술4단계',
];
export const materialSortIndex = (n: string) => {
  const i = MATERIAL_ORDER.indexOf(n);
  return i === -1 ? 999 : i;
};

// 재련/상급 재련/견적 페이지 공용 장비 등급 옵션 (동일 라벨 사용)
export const GRADE_OPTIONS: { value: string; label: string }[] = [
  { value: 't3_1250', label: 'T3 1250 (희귀 ~ 유물)' },
  { value: 't3_1390', label: 'T3 1390 (상위 유물 ~ 고대)' },
  { value: 't3_1525', label: 'T3 1525 (상위 고대)' },
  { value: 't4_1590', label: 'T4 1590 (4티어)' },
  { value: 't4_1730', label: 'T4 1730 (상위 고대)' },
];

export function RefreshButton({
  onClick,
  loading,
}: {
  onClick: () => void;
  loading: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-bold text-zinc-600 transition-colors hover:bg-zinc-200 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
    >
      <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
      시세 새로고침
    </button>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
        {label}
      </span>
      {children}
    </label>
  );
}

export function Stat({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-zinc-400">{label}</span>
      <span
        className={
          strong
            ? 'font-bold text-indigo-600 dark:text-indigo-400'
            : 'font-bold text-zinc-700 dark:text-zinc-200'
        }
      >
        {value}
      </span>
    </span>
  );
}

export function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full cursor-pointer appearance-none rounded-lg border border-zinc-200 bg-zinc-50 pl-3 pr-9 text-sm font-bold text-zinc-700 shadow-sm outline-none transition-colors hover:border-indigo-300 focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400">
        <ChevronDown size={14} strokeWidth={3} />
      </div>
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-800"
      />
      {label}
    </label>
  );
}

// ===== 재료 가격·보유 / 재료별 집계 — 세 페이지 공통 =====

export interface MatNeed {
  name: string;
  required: number; // 필요 수량 (placeholder용)
}

export interface MatBillRow {
  name: string;
  required: number;
  owned: number;
  remaining: number;
  gold: number;
  included: boolean;
}

// 체크 해제(보유) → 0골드. 골드는 항상 포함. 잔여 = 필요 - 보유.
export function computeMaterialBill(
  required: Record<string, number>,
  priceMap: Record<string, number>,
  owned: Record<string, number>,
  includeMap: Record<string, boolean>
): { rows: MatBillRow[]; total: number } {
  let total = 0;
  const rows = Object.entries(required)
    .filter(([, n]) => n > 0)
    .map(([name, req]) => {
      const isGold = name === '골드';
      const included = isGold || includeMap[name] !== false;
      const have = isGold ? 0 : owned[name] ?? 0;
      const remaining = included ? Math.max(0, req - have) : 0;
      const g = remaining * (priceMap[name] ?? 0);
      total += g;
      return { name, required: req, owned: have, remaining, gold: g, included };
    })
    .sort((a, b) => materialSortIndex(a.name) - materialSortIndex(b.name));
  return { rows, total };
}

function MaterialPriceGroup({
  title,
  items,
  priceMap,
  owned,
  includeMap,
  onPrice,
  onOwned,
  onInclude,
}: {
  title: string;
  items: MatNeed[];
  priceMap: Record<string, number>;
  owned: Record<string, number>;
  includeMap: Record<string, boolean>;
  onPrice: (name: string, v: number) => void;
  onOwned: (name: string, v: number) => void;
  onInclude: (name: string, v: boolean) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] font-bold text-zinc-400">
        <span className="uppercase tracking-wider">{title}</span>
        <span className="flex gap-2">
          <span className="w-[5.5rem] text-right">개당 가격</span>
          <span className="w-[5.5rem] text-right">보유</span>
        </span>
      </div>
      <div className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800/70">
        {items.map(({ name, required }) => {
          const inc = includeMap[name] !== false;
          return (
            <div
              key={name}
              className="grid grid-cols-[auto_auto_1fr_5.5rem_5.5rem] items-center gap-2 py-1.5"
            >
              <input
                type="checkbox"
                checked={inc}
                onChange={(e) => onInclude(name, e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-800"
              />
              <MaterialIcon name={name} size={20} />
              <span
                className={`truncate text-sm ${
                  inc
                    ? 'text-zinc-700 dark:text-zinc-300'
                    : 'text-zinc-400 line-through dark:text-zinc-600'
                }`}
              >
                <MaterialName name={name} />
              </span>
              <NumInput
                value={priceMap[name] ?? 0}
                onChange={(v) => onPrice(name, v)}
                className="w-full"
              />
              <NumInput
                // 체크 해제 = 전부 보유 → 필요 수량(placeholder)을 값으로 보여주고 readonly
                value={inc ? owned[name] ?? 0 : Math.round(required)}
                onChange={(v) => onOwned(name, v)}
                readOnly={!inc}
                placeholder={required > 0 ? Math.round(required).toLocaleString('ko-KR') : '0'}
                className="w-full"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 재료 가격·보유 입력 섹션 (필수/추가 분리 + 안내 문구)
export function MaterialPriceSection(props: {
  needs: MatNeed[];
  priceMap: Record<string, number>;
  owned: Record<string, number>;
  includeMap: Record<string, boolean>;
  onPrice: (name: string, v: number) => void;
  onOwned: (name: string, v: number) => void;
  onInclude: (name: string, v: boolean) => void;
}) {
  const { needs, ...rest } = props;
  const essential = needs.filter((n) => !isExtraMaterial(n.name));
  const extra = needs.filter((n) => isExtraMaterial(n.name));
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[11px] text-zinc-400">
        보유한 재료는 체크를 해제하면 0골드로 계산됩니다.
      </p>
      <MaterialPriceGroup title="필수 재료" items={essential} {...rest} />
      <MaterialPriceGroup title="추가 재료 (숨결 · 책)" items={extra} {...rest} />
    </div>
  );
}

function MaterialAggGroup({ title, rows }: { title: string; rows: MatBillRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] font-bold text-zinc-400">
        <span className="uppercase tracking-wider">{title} (필요 → 잔여)</span>
        <span className="w-[5rem] text-right">비용</span>
      </div>
      <div className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800/70">
        {rows.map((m) => (
          <div
            key={m.name}
            className="grid grid-cols-[1fr_5rem] items-center gap-2 py-1.5"
          >
            <span className="flex min-w-0 items-center gap-2">
              <MaterialIcon name={m.name} size={20} />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-sm font-medium text-zinc-700 dark:text-zinc-200">
                  <MaterialName name={m.name} />
                </span>
                <span className="text-[10px] tabular-nums text-zinc-400">
                  {Math.round(m.required).toLocaleString('ko-KR')} →{' '}
                  {Math.round(m.remaining).toLocaleString('ko-KR')}
                </span>
              </span>
            </span>
            <span className="text-right text-sm font-semibold tabular-nums text-zinc-800 dark:text-zinc-100">
              {gold(m.gold)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// 재료별 집계 결과 섹션 (필수/추가 분리, 읽기 전용)
export function MaterialAggSection({ rows }: { rows: MatBillRow[] }) {
  const essential = rows.filter((r) => !isExtraMaterial(r.name));
  const extra = rows.filter((r) => isExtraMaterial(r.name));
  return (
    <div className="flex flex-col gap-4">
      <MaterialAggGroup title="필수 재료" rows={essential} />
      <MaterialAggGroup title="추가 재료 (숨결 · 책)" rows={extra} />
    </div>
  );
}
