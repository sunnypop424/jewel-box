// 주사위 한 개 렌더 — pip(점) 레이아웃 + 쉴드 변형. lucide엔 Dice5만 있어 직접 그린다.
import { ShieldCheck } from 'lucide-react';
import type { Die, DieValue } from '../types';

// 1~6 pip 위치(3x3 그리드 셀 인덱스 0..8).
const PIPS: Record<DieValue, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

export function DiePip({
  die,
  size = 40,
  className = '',
  style,
}: {
  die: Die | null;
  size?: number;
  className?: string; // 애니메이션 클래스(tk-pop / tk-fling / tk-settle / tk-tumble) 주입용
  style?: React.CSSProperties;
}) {
  if (!die) {
    return (
      <div
        className={`rounded-lg border-2 border-dashed border-zinc-200 dark:border-zinc-700 ${className}`}
        style={{ width: size, height: size, ...style }}
      />
    );
  }

  const mine = die.owner === 'me';
  const pipColor = mine ? 'bg-indigo-500' : 'bg-rose-500';
  const base = mine
    ? 'bg-indigo-50 border-indigo-300 dark:bg-indigo-950/40 dark:border-indigo-700'
    : 'bg-rose-50 border-rose-300 dark:bg-rose-950/40 dark:border-rose-700';
  const shieldRing = die.shield
    ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-white dark:ring-offset-zinc-900'
    : '';

  const pipSize = Math.max(4, Math.round(size * 0.16));

  return (
    <div
      className={`relative grid grid-cols-3 grid-rows-3 place-items-center rounded-lg border ${base} ${shieldRing} ${className}`}
      style={{ width: size, height: size, padding: size * 0.12, ...style }}
      title={`${mine ? '내' : '상대'} 주사위 ${die.value}${die.shield ? ' (쉴드)' : ''}`}
    >
      {Array.from({ length: 9 }).map((_, i) => (
        <span
          key={i}
          className={`rounded-full ${PIPS[die.value].includes(i) ? pipColor : 'bg-transparent'}`}
          style={{ width: pipSize, height: pipSize }}
        />
      ))}
      {die.shield && (
        <ShieldCheck
          size={Math.round(size * 0.34)}
          className="absolute -right-1.5 -top-1.5 rounded-full bg-amber-400 p-0.5 text-white"
        />
      )}
    </div>
  );
}
