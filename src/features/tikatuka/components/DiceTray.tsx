// 주사위 트레이 — 한 진영(me/ai)의 굴림 연출 영역. 굴리는 중엔 면이 빠르게 바뀌고(tumble),
// 멈추면 결과로 정착(settle)한다. 타짜 택1은 내 트레이에서 클릭으로 선택.
import { useEffect, useState } from 'react';
import { DiePip } from './DiePip';
import type { Die, DieValue, Owner } from '../types';

// 트레이에 표시할 굴림 상태(프레젠테이션 전용). null이면 빈 트레이.
export interface RollAnim {
  owner: Owner;
  values: DieValue[]; // 굴린 결과(타짜면 2개)
  tumbling: boolean; // 굴리는 중
  chosen: number | null; // 선택/사용 확정된 인덱스 강조
}

const LABEL: Record<Owner, string> = { me: '내 주사위', ai: '상대 주사위' };
// 트레이 주사위 크기 — 화면 폭에 맞춰 스케일.
const TRAY_DIE = 'w-[clamp(34px,11vw,46px)] h-[clamp(34px,11vw,46px)]';

function synthDie(owner: Owner, value: DieValue, shield = false): Die {
  return { id: `tray-${owner}-${value}`, value, shield, owner };
}

export function DiceTray({
  owner,
  active,
  anim,
  shield,
  pickable,
  onPick,
  hint,
}: {
  owner: Owner;
  active: boolean; // 이 진영 차례
  anim: RollAnim | null; // 이 트레이에 표시할 굴림(owner 일치 시에만 전달)
  shield?: Die | null; // 배치 대기 중인 쉴드(내 트레이)
  pickable?: boolean; // 타짜 택1 단계
  onPick?: (index: 0 | 1) => void;
  hint?: string; // 보조 안내문
}) {
  const [face, setFace] = useState<DieValue>(1);

  // 굴리는 중이면 면을 빠르게 교체.
  useEffect(() => {
    if (!anim?.tumbling) return;
    const id = setInterval(() => {
      setFace(((Math.floor(Math.random() * 6) + 1) as DieValue));
    }, 90);
    return () => clearInterval(id);
  }, [anim?.tumbling]);

  const tone =
    owner === 'me'
      ? 'text-indigo-600 dark:text-indigo-400'
      : 'text-rose-600 dark:text-rose-400';
  const ring = active
    ? owner === 'me'
      ? 'border-indigo-400 dark:border-indigo-600 ring-1 ring-indigo-300/60'
      : 'border-rose-400 dark:border-rose-600 ring-1 ring-rose-300/60'
    : 'border-zinc-200 dark:border-zinc-800';

  return (
    <div
      className={`flex min-h-[92px] flex-col items-center gap-1.5 rounded-2xl border bg-white p-2.5 transition-colors dark:bg-zinc-900/50 ${ring}`}
    >
      <span className={`text-[11px] font-bold ${tone}`}>{LABEL[owner]}</span>

      <div className="flex flex-1 items-center justify-center gap-2">
        {shield ? (
          <DiePip die={shield} className={`${TRAY_DIE} tk-shield-in`} />
        ) : anim && anim.tumbling ? (
          <DiePip die={synthDie(owner, face)} className={`${TRAY_DIE} tk-tumble`} />
        ) : anim && anim.values.length > 0 ? (
          anim.values.map((v, i) =>
            pickable && onPick ? (
              <button
                key={i}
                type="button"
                onClick={() => onPick(i as 0 | 1)}
                className="touch-manipulation select-none rounded-xl p-0.5 ring-2 ring-transparent transition hover:ring-indigo-400 active:ring-indigo-400"
              >
                <DiePip die={synthDie(owner, v)} className={`${TRAY_DIE} tk-settle`} />
              </button>
            ) : (
              <DiePip
                key={i}
                die={synthDie(owner, v)}
                className={`${TRAY_DIE} tk-settle ${anim.chosen != null && anim.chosen !== i ? 'opacity-40' : ''}`}
              />
            )
          )
        ) : (
          <span className="text-[11px] text-zinc-400">{active ? '…' : '대기'}</span>
        )}
      </div>

      {hint && <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">{hint}</span>}
    </div>
  );
}
