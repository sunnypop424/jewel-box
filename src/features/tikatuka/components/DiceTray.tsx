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
// PC(큰) 크기 — 보드 양옆 트레이용.
const TRAY_DIE_LG = 'w-[clamp(56px,5vw,72px)] h-[clamp(56px,5vw,72px)]';

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
  size,
}: {
  owner: Owner;
  active: boolean; // 이 진영 차례
  anim: RollAnim | null; // 이 트레이에 표시할 굴림(owner 일치 시에만 전달)
  shield?: Die | null; // 배치 대기 중인 쉴드(내 트레이)
  pickable?: boolean; // 타짜 택1 단계
  onPick?: (index: 0 | 1) => void;
  hint?: string; // 보조 안내문
  size?: 'lg'; // 'lg'면 PC용 큰 트레이(보드 양옆)
}) {
  const [face, setFace] = useState<DieValue>(1);
  const lg = size === 'lg';
  const trayDie = lg ? TRAY_DIE_LG : TRAY_DIE;

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
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-rose-600 dark:text-rose-400';
  const ring = active
    ? owner === 'me'
      ? 'border-emerald-400 dark:border-emerald-600 ring-1 ring-emerald-300/60'
      : 'border-rose-400 dark:border-rose-600 ring-1 ring-rose-300/60'
    : 'border-zinc-200 dark:border-zinc-800';

  return (
    <div
      className={`flex flex-col items-center rounded-2xl border bg-white transition-colors dark:bg-zinc-900/50 ${ring} ${lg ? 'min-h-[160px] w-[150px] shrink-0 gap-2.5 self-stretch justify-center p-4' : 'min-h-[92px] gap-1.5 p-2.5'}`}
    >
      <span className={`font-bold ${tone} ${lg ? 'text-sm' : 'text-[11px]'}`}>{LABEL[owner]}</span>

      <div className={`flex items-center justify-center ${lg ? 'flex-1 gap-3' : 'flex-1 gap-2'}`}>
        {shield ? (
          <DiePip die={shield} className={`${trayDie} tk-shield-in`} />
        ) : anim && anim.tumbling ? (
          <DiePip die={synthDie(owner, face)} className={`${trayDie} tk-tumble`} />
        ) : anim && anim.values.length > 0 ? (
          anim.values.map((v, i) =>
            pickable && onPick ? (
              <button
                key={i}
                type="button"
                onClick={() => onPick(i as 0 | 1)}
                className="touch-manipulation select-none rounded-xl p-0.5 ring-2 ring-transparent transition hover:ring-emerald-400 active:ring-emerald-400"
              >
                <DiePip die={synthDie(owner, v)} className={`${trayDie} tk-settle`} />
              </button>
            ) : (
              <DiePip
                key={i}
                die={synthDie(owner, v)}
                className={`${trayDie} tk-settle ${anim.chosen != null && anim.chosen !== i ? 'opacity-40' : ''}`}
              />
            )
          )
        ) : (
          <span className={`text-zinc-400 ${lg ? 'text-sm' : 'text-[11px]'}`}>{active ? '…' : '대기'}</span>
        )}
      </div>

      {hint && <span className={`font-bold text-amber-600 dark:text-amber-400 ${lg ? 'text-xs' : 'text-[10px]'}`}>{hint}</span>}
    </div>
  );
}
