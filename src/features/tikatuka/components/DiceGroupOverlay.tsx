// 묶음(같은 눈) 주사위 강조 오버레이 — 실제 주사위 행 위에 absolute로 겹쳐 그린다.
// 레이아웃에 전혀 영향을 주지 않으므로(주사위 크기·칸 간격·필드 폭 불변), 묶음/쉴드 여부와 무관하게 폭이 고정된다.
//  · 묶인 주사위 인접 경계마다 `][` 브라켓.
//  · 그룹 가로 중앙 하단에 묶음 값(1~6) 원.
// 슬롯 배열은 게임 toSlots / 시뮬 displaySlots가 같은 값을 인접 정렬해두므로 '인접 같은-값 런'이 곧 묶음이다.
import type { Owner } from '../types';

type Slot = { value: number } | null;

// 슬롯을 단일/묶음 세그먼트로 분할. 같은 값 인접 런 길이≥2면 묶음.
function toSegments(slots: Slot[]): ({ kind: 'single' } | { kind: 'group'; value: number; len: number })[] {
  const segs: ({ kind: 'single' } | { kind: 'group'; value: number; len: number })[] = [];
  let i = 0;
  while (i < slots.length) {
    const cur = slots[i];
    if (cur == null) {
      segs.push({ kind: 'single' });
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < slots.length && slots[j] != null && slots[j]!.value === cur.value) j += 1;
    const len = j - i;
    if (len >= 2) {
      segs.push({ kind: 'group', value: cur.value, len });
      i = j;
    } else {
      segs.push({ kind: 'single' });
      i += 1;
    }
  }
  return segs;
}

export function DiceGroupOverlay({
  slots,
  owner,
  justify,
  dieSize,
}: {
  slots: Slot[];
  owner: Owner;
  justify: 'start' | 'end';
  dieSize: string; // 실제 주사위와 동일한 width/height 유틸 클래스
}) {
  const segments = toSegments(slots);
  if (!segments.some((s) => s.kind === 'group')) return null;

  const mine = owner === 'me';
  const bracketBorder = mine ? 'border-indigo-400 dark:border-indigo-300' : 'border-rose-400 dark:border-rose-300';
  const circleColor = mine ? 'bg-indigo-500' : 'bg-rose-500';

  return (
    // 실제 주사위 행과 동일한 flex(gap·padding·justify)를 미러링 → 박스 위치가 정확히 일치.
    <span
      className={`pointer-events-none absolute inset-0 z-10 flex items-center gap-1 p-1 sm:gap-1.5 sm:p-1.5 ${
        justify === 'end' ? 'justify-end' : 'justify-start'
      }`}
    >
      {segments.map((seg, si) =>
        seg.kind === 'single' ? (
          <span key={si} className={`block shrink-0 ${dieSize}`} />
        ) : (
          // 묶음 span — 박스 사이에 실제 gap(=w-1 / sm:w-1.5)과 같은 폭의 '경계 칸'을 끼워 박스 위치를 정확히 일치시킨다.
          // 경계 칸(= 주사위 사이 빈틈) 안에서: `]`는 왼쪽 끝(왼쪽 주사위 바깥)에, `[`는 오른쪽 끝(오른쪽 주사위 바깥)에 붙고,
          // 값 원은 그 사이 중앙에 absolute로 띄운다(브라켓은 주사위 바깥으로 나옴). 트리플이면 경계가 2개 → 값도 2번.
          <span key={si} className="relative flex shrink-0 items-stretch">
            {Array.from({ length: seg.len }).flatMap((_, p) => {
              const box = <span key={`b${p}`} className={`block shrink-0 ${dieSize}`} />;
              if (p === seg.len - 1) return [box];
              const junction = (
                <span key={`j${p}`} className="relative w-1 shrink-0 self-stretch sm:w-1.5">
                  {/* `][` — gap 안에서만(주사위 안으로 안 들어옴). 두 스파인이 가운데서 맞붙고 팔은 바깥(각 주사위)쪽으로. */}
                  <span className={`absolute left-0 right-1/2 top-1/2 z-20 h-[56%] -translate-y-1/2 rounded-[3px] border-y-2 border-r sm:border-r-2 ${bracketBorder}`} />
                  <span className={`absolute left-1/2 right-0 top-1/2 z-20 h-[56%] -translate-y-1/2 rounded-[3px] border-y-2 border-l sm:border-l-2 ${bracketBorder}`} />
                  {/* 값 원 — `][` 사이 중앙에 띄움. 모바일은 공간이 좁아 숨김(sm부터 표시). */}
                  <span
                    className={`absolute left-1/2 top-1/2 z-30 hidden h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[10px] font-bold text-white ring-1 ring-white dark:ring-zinc-900 sm:flex ${circleColor}`}
                  >
                    {seg.value}
                  </span>
                </span>
              );
              return [box, junction];
            })}
          </span>
        ),
      )}
    </span>
  );
}
