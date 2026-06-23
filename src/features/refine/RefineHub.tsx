import { Hammer } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { RefinePage } from './RefinePage';
import { AdvancedRefinePage } from './AdvancedRefinePage';
import { GearEstimatePage } from './GearEstimatePage';
import { Segmented } from './refineUi';
import { useMaterialPrices } from './useMaterialPrices';

// 재련 / 상급 재련 / 장비 견적을 한 라우트(/refine)에서 탭으로 전환하는 셸.
type Tab = 'normal' | 'advanced' | 'gear';

const TABS: readonly (readonly [Tab, string])[] = [
  ['normal', '재련'],
  ['advanced', '상급 재련'],
  ['gear', '장비 견적'],
];

const isTab = (v: string | null): v is Tab =>
  v === 'normal' || v === 'advanced' || v === 'gear';

export function RefineHub() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: Tab = isTab(raw) ? raw : 'normal';

  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    setParams(next, { replace: true });
  };

  // 재료 시세·보유·체크는 세 탭이 공유 — 탭 전환 시 재로딩/입력 초기화 방지
  const prices = useMaterialPrices();

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4 md:h-[38px]">
        <h2 className="hidden items-center gap-2 text-xl font-bold text-zinc-900 dark:text-zinc-100 md:flex">
          <Hammer className="text-indigo-500" /> 장비 재련 최적화
        </h2>
        <Segmented size="md" options={TABS} value={tab} onChange={setTab} />
      </div>

      {tab === 'normal' && <RefinePage prices={prices} />}
      {tab === 'advanced' && <AdvancedRefinePage prices={prices} />}
      {tab === 'gear' && <GearEstimatePage prices={prices} />}
    </section>
  );
}
