import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  fetchMarketPrices,
  getPriceObj,
  emptyPriceMap,
  PRICE_TYPE_LABEL,
} from './marketPrice';
import type { MarketData, PriceType } from './marketPrice';

// 재련/상급/견적 페이지가 공유하는 재료 시세·보유·체크 상태.
// RefineHub에서 한 번 생성해 세 탭에 내려주면 탭 전환 시 재로딩/입력 초기화가 없다.
// 시세 자체는 매번 바뀌므로 localStorage에 저장하지 않는다(항상 최신 조회).
export interface MaterialPrices {
  priceMap: Record<string, number>;
  owned: Record<string, number>;
  includeMap: Record<string, boolean>;
  priceLoading: boolean;
  priceType: PriceType;
  updateTime: string; // 시세 기준 시각 (마켓 응답 updateTime)
  loadPrices: (manual?: boolean) => Promise<void>;
  setPriceType: (t: PriceType) => void;
  onPrice: (name: string, v: number) => void;
  onOwned: (name: string, v: number) => void;
  onInclude: (name: string, v: boolean) => void;
  clearOwned: () => void;
}

export function useMaterialPrices(): MaterialPrices {
  const [priceMap, setPriceMap] = useState<Record<string, number>>(emptyPriceMap);
  const [owned, setOwned] = useState<Record<string, number>>({});
  const [includeMap, setIncludeMap] = useState<Record<string, boolean>>({});
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceType, setPriceTypeState] = useState<PriceType>('RecentPrice');
  const [updateTime, setUpdateTime] = useState('');
  // 마지막으로 받은 마켓 원본 — 가격 기준 토글 시 재요청 없이 재계산
  const dataRef = useRef<MarketData | null>(null);

  const applyData = (data: MarketData, type: PriceType) => {
    const obj = getPriceObj(data, type);
    setPriceMap((prev) => ({ ...prev, ...obj, 골드: 1 }));
    setUpdateTime(data.updateTime ?? '');
  };

  const loadPrices = async (manual = false) => {
    setPriceLoading(true);
    try {
      const data = await fetchMarketPrices();
      dataRef.current = data;
      applyData(data, priceType);
      if (manual)
        toast.success(`재료 시세를 불러왔습니다. (${PRICE_TYPE_LABEL[priceType]})`);
    } catch (e) {
      console.error('[시세 로드 실패]', e);
      toast.error('시세를 불러오지 못했습니다. 가격을 직접 입력해 주세요.');
    } finally {
      setPriceLoading(false);
    }
  };

  // 가격 기준 변경 — 캐시된 원본이 있으면 즉시 재계산, 없으면 다음 로드 때 반영
  const setPriceType = (t: PriceType) => {
    setPriceTypeState(t);
    if (dataRef.current) applyData(dataRef.current, t);
  };

  useEffect(() => {
    loadPrices();
  }, []);

  const onPrice = (name: string, v: number) =>
    setPriceMap((p) => ({ ...p, [name]: v }));
  const onOwned = (name: string, v: number) =>
    setOwned((o) => ({ ...o, [name]: v }));
  const onInclude = (name: string, v: boolean) =>
    setIncludeMap((m) => ({ ...m, [name]: v }));
  // 보유 초기화: 보유 수량 + '전부 보유'(체크 해제) 상태 모두 리셋
  const clearOwned = () => {
    setOwned({});
    setIncludeMap({});
  };

  return {
    priceMap,
    owned,
    includeMap,
    priceLoading,
    priceType,
    updateTime,
    loadPrices,
    setPriceType,
    onPrice,
    onOwned,
    onInclude,
    clearOwned,
  };
}
