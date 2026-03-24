import { useState, useMemo } from 'react';
import { Modal } from './Modal';
import { Calculator, Coins, Check, Tag } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function AuctionCalculatorModal({ isOpen, onClose }: Props) {
  const [priceStr, setPriceStr] = useState<string>('');
  const [partySize, setPartySize] = useState<number>(4);

  const results = useMemo(() => {
    const price = Number(priceStr);
    if (!price || price <= 0) {
      return {
        sellBreakeven: 0,
        sellPreemptive: 0,
        useBreakeven: 0,
        usePreemptive: 0,
      };
    }

    // 1. 판매 목적 (수수료 5% 차감 후 계산)
    const afterFee = price * 0.95;
    const sellBreakeven = Math.floor((afterFee * (partySize - 1)) / partySize);
    // ✅ 커뮤니티 표준 공식 적용 (손익분기점의 91%)
    const sellPreemptive = Math.floor(sellBreakeven * 0.91);

    // 2. 직접 사용 (수수료 차감 없이 계산)
    const useBreakeven = Math.floor((price * (partySize - 1)) / partySize);
    // ✅ 커뮤니티 표준 공식 적용 (손익분기점의 91%)
    const usePreemptive = Math.floor(useBreakeven * 0.91);

    return { sellBreakeven, sellPreemptive, useBreakeven, usePreemptive };
  }, [priceStr, partySize]);

  if (!isOpen) return null;

  return (
    <Modal open={isOpen} onClose={onClose} title='경매 입찰 계산기'>
      <div className="flex flex-col gap-6 p-2">
        {/* 헤더 영역 */}
        <div className="flex items-center gap-3 border-b border-zinc-100 pb-4 dark:border-zinc-800">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
            <Calculator size={20} />
          </div>
          <div className="flex flex-col gap-0.5">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">경매 입찰 계산기</h2>
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">전리품 입찰 최적가(선점가)를 계산합니다.</p>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          {/* 거래소 최저가 입력 */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              거래소 최저가 (골드)
            </label>
            <div className="relative">
              <input
                type="number"
                value={priceStr}
                onChange={(e) => setPriceStr(e.target.value)}
                placeholder="가격을 입력해 주세요 (예: 300000)"
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-3 pl-4 pr-10 text-zinc-900 shadow-sm transition-all focus:border-indigo-500 focus:bg-white dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 outline-none"
              />
              <Coins size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400" />
            </div>
          </div>

          {/* 파티 인원 선택 (세그먼트 컨트롤 스타일) */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              파티 인원
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[4, 8, 16].map((size) => (
                <label key={size} className="cursor-pointer">
                  <input
                    type="radio"
                    name="partySize"
                    value={size}
                    checked={partySize === size}
                    onChange={() => setPartySize(size)}
                    className="peer hidden"
                  />
                  <div className="flex justify-center items-center rounded-xl border border-zinc-200 bg-zinc-50 py-2.5 text-sm font-bold text-zinc-500 transition-all peer-checked:border-indigo-500 peer-checked:bg-indigo-50 peer-checked:text-indigo-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-400 dark:peer-checked:border-indigo-500 dark:peer-checked:bg-indigo-900/30 dark:peer-checked:text-indigo-300 dark:hover:bg-zinc-800 shadow-sm">
                    {size}인
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* 결과 영역 */}
        <div className="flex flex-col gap-4">
          {/* 판매 목적 (수수료 차감) */}
          <div className="flex flex-col rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50 overflow-hidden">
            <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50/50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center gap-2 text-sm font-bold text-zinc-800 dark:text-zinc-200">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                  <Coins size={14} />
                </div>
                판매 목적
              </div>
              <span className="rounded bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                수수료(5%) 차감
              </span>
            </div>
            <div className="flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">손익분기점 (N빵)</span>
                <span className="text-sm font-mono font-medium text-zinc-700 dark:text-zinc-300">
                  {results.sellBreakeven.toLocaleString()} G
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 dark:bg-emerald-900/10">
                <span className="flex items-center gap-1 text-sm font-bold text-emerald-700 dark:text-emerald-400">
                  <Check size={16} /> 선점 입찰가
                </span>
                <span className="text-base font-mono font-bold text-emerald-700 dark:text-emerald-400">
                  {results.sellPreemptive.toLocaleString()} G
                </span>
              </div>
            </div>
          </div>

          {/* 직접 사용 (수수료 미차감) */}
          <div className="flex flex-col rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50 overflow-hidden">
            <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50/50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center gap-2 text-sm font-bold text-zinc-800 dark:text-zinc-200">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                  <Tag size={14} />
                </div>
                직접 사용
              </div>
              <span className="rounded bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                수수료 미차감
              </span>
            </div>
            <div className="flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">손익분기점 (N빵)</span>
                <span className="text-sm font-mono font-medium text-zinc-700 dark:text-zinc-300">
                  {results.useBreakeven.toLocaleString()} G
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2 dark:bg-blue-900/10">
                <span className="flex items-center gap-1 text-sm font-bold text-blue-700 dark:text-blue-400">
                  <Check size={16} /> 선점 입찰가
                </span>
                <span className="text-base font-mono font-bold text-blue-700 dark:text-blue-400">
                  {results.usePreemptive.toLocaleString()} G
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-zinc-50 p-3 text-[11px] leading-relaxed text-zinc-500 dark:bg-zinc-800/50 dark:text-zinc-400 mt-2">
          <strong className="text-indigo-600 dark:text-indigo-400 font-bold">💡 선점 입찰가란?</strong><br/>
          해당 금액으로 입찰 시 다음 입찰자는 무조건 손익분기점 이상의 금액을 적어야 하므로 경쟁을 차단할 수 있는 최적의 가격입니다.
        </div>

        <div className="flex justify-end pt-2 border-t border-zinc-100 dark:border-zinc-800">
          <button
            onClick={onClose}
            className="rounded-xl bg-zinc-100 px-6 py-2.5 text-sm font-bold text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            닫기
          </button>
        </div>
      </div>
    </Modal>
  );
}