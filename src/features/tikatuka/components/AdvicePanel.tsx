// 추천 패널(헤드라인 + 접이식 근거) — 게임/시뮬 공용.
import { Lightbulb, Hand } from 'lucide-react';
import type { Factor, FactorTag } from '../ai';

// 근거 카테고리 — 표시 순서 + 라벨 칩 색상.
const TAG_ORDER: FactorTag[] = ['목표', '위험', '자원', '총합', '타짜', '홀드'];
const TAG_STYLE: Record<FactorTag, string> = {
  목표: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  위험: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  자원: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  총합: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  타짜: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  홀드: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
};

export function FactorTagChip({ tag }: { tag: FactorTag }) {
  return (
    <span className={`mt-px shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${TAG_STYLE[tag]}`}>
      {tag}
    </span>
  );
}

export function AdvicePanel({
  headline,
  factors,
  isHold,
  winRate,
  open,
  onToggle,
}: {
  headline: string;
  factors: Factor[];
  isHold?: boolean;
  winRate?: number; // 0~1, 있으면 예상 승률 칩 표시
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`rounded-2xl border p-3 ${
        isHold
          ? 'border-amber-300 bg-amber-50 dark:border-amber-800/60 dark:bg-amber-950/30'
          : 'border-emerald-300 bg-emerald-50 dark:border-emerald-800/60 dark:bg-emerald-950/30'
      }`}
    >
      {winRate != null && (
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400">예상 승률</span>
          <WinRateBar winRate={winRate} />
        </div>
      )}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span
          className={`flex items-center gap-1.5 text-sm font-bold ${
            isHold ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'
          }`}
        >
          {isHold ? <Hand size={16} /> : <Lightbulb size={16} />} 추천 — {headline}
        </span>
        <span className="shrink-0 text-[11px] font-bold text-zinc-400">근거 {open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <ul className="mt-2 flex flex-col gap-1.5 text-[12px] leading-relaxed text-zinc-700 dark:text-zinc-300">
          {[...factors]
            .sort((a, b) => TAG_ORDER.indexOf(a.tag) - TAG_ORDER.indexOf(b.tag))
            .map((f, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <FactorTagChip tag={f.tag} />
                <span>{f.text}</span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

// 예상 승률 막대 + 퍼센트. 60%+ 초록 / 40~60 호박 / 40%- 장미.
export function WinRateBar({ winRate }: { winRate: number }) {
  const pct = Math.round(winRate * 100);
  const color = pct >= 60 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-rose-500';
  return (
    <span className="flex flex-1 items-center gap-2">
      <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
        <span className={`absolute inset-y-0 left-0 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="w-9 shrink-0 text-right text-sm font-black tabular-nums text-zinc-700 dark:text-zinc-200">
        {pct}%
      </span>
    </span>
  );
}
