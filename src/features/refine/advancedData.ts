import { t4_01, t4_23 } from './simulated';
import { t4_01_mochalik, t4_23_mochalik } from './mochalikData';

export interface AdvancedRefineSimData {
  parameters: {
    normalK: number;
    bonusK: number;
    enhancedBonusK: number;
  };
  result: {
    freeNormalTry: number;
    paidNormalTry: number;
    bonusTry: number;
    enhancedBonusTry: number;
  };
}

export interface AdvancedRefineTable {
  data: AdvancedRefineSimData[];
  // 가호 게이지 2배 충전 시뮬레이션 (6/24 패치로 상시 기본이 됨)
  dataMochalik: AdvancedRefineSimData[];
  hasEnhancedBonus: boolean;
  amount: Record<string, number>;
  breath: Record<string, number>;
  book?:
    | '장인의야금술1단계'
    | '장인의야금술2단계'
    | '장인의야금술3단계'
    | '장인의야금술4단계'
    | '장인의재봉술1단계'
    | '장인의재봉술2단계'
    | '장인의재봉술3단계'
    | '장인의재봉술4단계'
    | undefined;
}

export type AdvancedRefineTarget =
  | 't4_0'
  | 't4_1'
  | 't4_2'
  | 't4_3';

export const advancedRefineTable: Record<
  'armor' | 'weapon',
  Record<AdvancedRefineTarget, AdvancedRefineTable>
> = {
  armor: {
    t4_0: {
      data: t4_01,
      dataMochalik: t4_01_mochalik,
      hasEnhancedBonus: false,
      amount: {
        운명의수호석: 500,
        운돌: 12,
        아비도스: 15,
        운명파편: 3000,
        골드: 950,
      },
      breath: {
        빙하: 12,
      },
      book: '장인의재봉술1단계',
    },
    t4_1: {
      data: t4_01,
      dataMochalik: t4_01_mochalik,
      hasEnhancedBonus: false,
      amount: {
        운명의수호석: 900,
        운돌: 16,
        아비도스: 16,
        운명파편: 6000,
        골드: 1800,
      },
      breath: {
        빙하: 18,
      },
      book: '장인의재봉술2단계',
    },
    t4_2: {
      data: t4_23,
      dataMochalik: t4_23_mochalik,
      hasEnhancedBonus: true,
      amount: {
        운명의수호석: 1000,
        운돌: 18,
        아비도스: 17,
        운명파편: 7000,
        골드: 2000,
      },
      breath: {
        빙하: 20,
      },
      book: '장인의재봉술3단계',
    },
    t4_3: {
      data: t4_23,
      dataMochalik: t4_23_mochalik,
      hasEnhancedBonus: true,
      amount: {
        운명의수호석: 1200,
        운돌: 23,
        아비도스: 19,
        운명파편: 8000,
        골드: 2400,
      },
      breath: {
        빙하: 24,
      },
      book: '장인의재봉술4단계',
    },
  },
  weapon: {
    t4_0: {
      data: t4_01,
      dataMochalik: t4_01_mochalik,
      hasEnhancedBonus: false,
      amount: {
        운명의파괴석: 600,
        운돌: 16,
        아비도스: 25,
        운명파편: 5000,
        골드: 1125,
      },
      breath: {
        용암: 12,
      },
      book: '장인의야금술1단계',
    },
    t4_1: {
      data: t4_01,
      dataMochalik: t4_01_mochalik,
      hasEnhancedBonus: false,
      amount: {
        운명의파괴석: 1100,
        운돌: 22,
        아비도스: 27,
        운명파편: 10000,
        골드: 2500,
      },
      breath: {
        용암: 18,
      },
      book: '장인의야금술2단계',
    },
    t4_2: {
      data: t4_23,
      dataMochalik: t4_23_mochalik,
      hasEnhancedBonus: true,
      amount: {
        운명의파괴석: 1200,
        운돌: 25,
        아비도스: 28,
        운명파편: 11500,
        골드: 3000,
      },
      breath: {
        용암: 20,
      },
      book: '장인의야금술3단계',
    },
    t4_3: {
      data: t4_23,
      dataMochalik: t4_23_mochalik,
      hasEnhancedBonus: true,
      amount: {
        운명의파괴석: 1400,
        운돌: 32,
        아비도스: 30,
        운명파편: 13000,
        골드: 4000,
      },
      breath: {
        용암: 24,
      },
      book: '장인의야금술4단계',
    },
  },
};

export function getAdvancedRefineTable(
  type: 'armor' | 'weapon',
  target: AdvancedRefineTarget
): AdvancedRefineTable {
  let costReduction = 0;
  let fragmentReduction = 0;
  let goldReduction = 0;

  if (target === 't4_0' || target === 't4_1') {
    costReduction = 0.7;
    fragmentReduction = 0.9;
    goldReduction = 0.5;
  }

  const data = advancedRefineTable[type]?.[target];

  return {
    ...data,
    // 6/24 패치: 선조의 가호 구슬 2배 획득(가호 게이지 2배 충전)이 상시 기본 → 항상 2배 시뮬레이션 사용
    data: data.dataMochalik,
    amount: Object.fromEntries(
      Object.entries(data.amount).map(([name, value]) => [
        name,
        name === '골드'
          ? Math.ceil(value * (1 - goldReduction))
          : name.endsWith('파편')
          ? Math.ceil(value * (1 - fragmentReduction))
          : Math.ceil(value * (1 - costReduction)),
      ])
    ),
    breath: Object.fromEntries(
      Object.entries(data.breath).map(([name, value]) => [
        name,
        Math.ceil(value * (1 - costReduction)),
      ])
    ),
  };
}
