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
  size,
  className = '',
  style,
}: {
  die: Die | null;
  // 고정 px 크기. 생략하면 부모가 width/height 유틸 클래스로 크기를 지정(반응형). pip·여백은 비율 기반이라 어느 쪽이든 스케일된다.
  size?: number;
  className?: string; // 애니메이션 클래스(tk-pop / tk-fling / tk-settle / tk-tumble) 주입용
  style?: React.CSSProperties;
}) {
  const sized: React.CSSProperties | undefined =
    size != null ? { width: size, height: size } : undefined;

  if (!die) {
    return (
      <div
        className={`shrink-0 rounded-lg border-2 border-dashed border-zinc-200 dark:border-zinc-700 ${className}`}
        style={{ ...sized, ...style }}
      />
    );
  }

  const mine = die.owner === 'me';
  // pip은 SVG 원으로 그린다 — 어떤 크기(고정 px / clamp 클래스)에서도 viewBox로 정확히 스케일.
  // (%·aspect-ratio 기반 pip은 그리드 셀 안에서 높이가 0으로 무너지는 환경이 있어 폐기)
  const pipColor = mine ? '#6366f1' : '#f43f5e'; // indigo-500 / rose-500
  const base = mine
    ? 'bg-indigo-50 border-indigo-300 dark:bg-indigo-950/40 dark:border-indigo-700'
    : 'bg-rose-50 border-rose-300 dark:bg-rose-950/40 dark:border-rose-700';
  const shieldRing = die.shield
    ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-white dark:ring-offset-zinc-900'
    : '';

  const shieldIconSize = size != null ? Math.round(size * 0.34) : 13;

  return (
    <div
      className={`relative shrink-0 rounded-lg border ${base} ${shieldRing} ${className}`}
      style={{ ...sized, ...style }}
      title={`${mine ? '내' : '상대'} 주사위 ${die.value}${die.shield ? ' (쉴드)' : ''}`}
    >
      <svg viewBox="0 0 100 100" className="block h-full w-full" aria-hidden="true">
        {PIPS[die.value].map((idx) => (
          <circle
            key={idx}
            cx={25 + (idx % 3) * 25}
            cy={25 + Math.floor(idx / 3) * 25}
            r={9.5}
            fill={pipColor}
          />
        ))}
      </svg>
      {die.shield && (
        <ShieldCheck
          size={shieldIconSize}
          className="absolute -right-1.5 -top-1.5 rounded-full bg-amber-400 p-0.5 text-white"
        />
      )}
    </div>
  );
}
