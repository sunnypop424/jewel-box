import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { fetchMarketPrices, getPriceObj, emptyPriceMap } from './marketPrice';

// 재련/상급/견적 페이지가 공유하는 재료 시세·보유·체크 상태.
// RefineHub에서 한 번 생성해 세 탭에 내려주면 탭 전환 시 재로딩/입력 초기화가 없다.
export interface MaterialPrices {
  priceMap: Record<string, number>;
  owned: Record<string, number>;
  includeMap: Record<string, boolean>;
  priceLoading: boolean;
  loadPrices: (manual?: boolean) => Promise<void>;
  onPrice: (name: string, v: number) => void;
  onOwned: (name: string, v: number) => void;
  onInclude: (name: string, v: boolean) => void;
}

export function useMaterialPrices(): MaterialPrices {
  const [priceMap, setPriceMap] = useState<Record<string, number>>(emptyPriceMap);
  const [owned, setOwned] = useState<Record<string, number>>({});
  const [includeMap, setIncludeMap] = useState<Record<string, boolean>>({});
  const [priceLoading, setPriceLoading] = useState(false);

  const loadPrices = async (manual = false) => {
    setPriceLoading(true);
    try {
      const data = await fetchMarketPrices();
      const obj = getPriceObj(data, 'RecentPrice');
      setPriceMap((prev) => ({ ...prev, ...obj, 골드: 1 }));
      if (manual) toast.success('재료 시세를 불러왔습니다. (최근 거래가)');
    } catch (e) {
      console.error('[시세 로드 실패]', e);
      toast.error('시세를 불러오지 못했습니다. 가격을 직접 입력해 주세요.');
    } finally {
      setPriceLoading(false);
    }
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

  return {
    priceMap,
    owned,
    includeMap,
    priceLoading,
    loadPrices,
    onPrice,
    onOwned,
    onInclude,
  };
}
