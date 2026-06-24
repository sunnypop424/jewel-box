export interface RefineTableData {
  baseProb: number;
  amount: Record<string, number>;
  breath: Record<string, [number, number]>;
}

export interface RefineTable {
  baseProb: number;
  additionalProb: number;
  janginMultiplier: number;
  amount: Record<string, number>;
  breath: Record<string, [number, number]>;
}

const t4ArmorBreathTable: Record<number, Record<string, [number, number]>> = {
  0.1: {
    빙하: [20, 0.005],
  },
  0.05: {
    빙하: [20, 0.0025],
  },
  0.04: {
    빙하: [20, 0.002],
  },
  0.03: {
    빙하: [20, 0.0015],
  },
  0.0225: {
    빙하: [25, 0.0012],
  },
  0.015: {
    빙하: [25, 0.0006],
  },
  0.01: {
    빙하: [25, 0.0004],
  },
  0.005: {
    빙하: [50, 0.0002],
  },
};

const t4WeaponBreathTable: Record<number, Record<string, [number, number]>> = {
  0.1: {
    용암: [20, 0.005],
  },
  0.05: {
    용암: [20, 0.0025],
  },
  0.04: {
    용암: [20, 0.002],
  },
  0.03: {
    용암: [20, 0.0015],
  },
  0.0225: {
    용암: [25, 0.0012],
  },
  0.015: {
    용암: [25, 0.0006],
  },
  0.01: {
    용암: [25, 0.0004],
  },
  0.005: {
    용암: [50, 0.0002],
  },
};

export const refineData: Record<
  string,
  Record<string, Record<number, RefineTableData>>
> = {
  armor: {
    t4_1590: {
      11: {
        baseProb: 0.1,
        amount: {
          운명의수호석: 750,
          운돌: 11,
          아비도스: 7,
          운명파편: 3000,
          골드: 970,
        },
        breath: {
          ...t4ArmorBreathTable[0.1],
          재봉술업화A: [1, 0.1],
        },
      },
      12: {
        baseProb: 0.1,
        amount: {
          운명의수호석: 780,
          운돌: 13,
          아비도스: 7,
          운명파편: 3180,
          골드: 1070,
        },
        breath: {
          ...t4ArmorBreathTable[0.1],
          재봉술업화A: [1, 0.1],
        },
      },
      13: {
        baseProb: 0.05,
        amount: {
          운명의수호석: 840,
          운돌: 14,
          아비도스: 9,
          운명파편: 4560,
          골드: 1190,
        },
        breath: {
          ...t4ArmorBreathTable[0.05],
          재봉술업화A: [1, 0.05],
        },
      },
      14: {
        baseProb: 0.05,
        amount: {
          운명의수호석: 930,
          운돌: 16,
          아비도스: 9,
          운명파편: 4920,
          골드: 1320,
        },
        breath: {
          ...t4ArmorBreathTable[0.05],
          재봉술업화A: [1, 0.05],
        },
      },
      15: {
        baseProb: 0.04,
        amount: {
          운명의수호석: 1020,
          운돌: 18,
          아비도스: 11,
          운명파편: 5280,
          골드: 1460,
        },
        breath: {
          ...t4ArmorBreathTable[0.04],
          재봉술업화B: [1, 0.04],
        },
      },
      16: {
        baseProb: 0.04,
        amount: {
          운명의수호석: 1170,
          운돌: 20,
          아비도스: 11,
          운명파편: 5640,
          골드: 1600,
        },
        breath: {
          ...t4ArmorBreathTable[0.04],
          재봉술업화B: [1, 0.04],
        },
      },
      17: {
        baseProb: 0.03,
        amount: {
          운명의수호석: 1320,
          운돌: 22,
          아비도스: 15,
          운명파편: 7200,
          골드: 1760,
        },
        breath: {
          ...t4ArmorBreathTable[0.03],
          재봉술업화B: [1, 0.03],
        },
      },
      18: {
        baseProb: 0.03,
        amount: {
          운명의수호석: 1470,
          운돌: 23,
          아비도스: 15,
          운명파편: 7740,
          골드: 1930,
        },
        breath: {
          ...t4ArmorBreathTable[0.03],
          재봉술업화B: [1, 0.03],
        },
      },
      19: {
        baseProb: 0.03,
        amount: {
          운명의수호석: 1620,
          운돌: 25,
          아비도스: 15,
          운명파편: 8220,
          골드: 2110,
        },
        breath: {
          ...t4ArmorBreathTable[0.03],
          재봉술업화C: [1, 0.03],
        },
      },
      20: {
        baseProb: 0.015,
        amount: {
          운명의수호석: 1770,
          운돌: 27,
          아비도스: 21,
          운명파편: 9600,
          골드: 2300,
        },
        breath: {
          ...t4ArmorBreathTable[0.015],
          재봉술업화C: [1, 0.015],
        },
      },
      21: {
        baseProb: 0.015,
        amount: {
          운명의수호석: 1920,
          운돌: 29,
          아비도스: 21,
          운명파편: 10260,
          골드: 2500,
        },
        breath: {
          ...t4ArmorBreathTable[0.015],
        },
      },
      22: {
        baseProb: 0.01,
        amount: {
          운명의수호석: 2220,
          운돌: 31,
          아비도스: 21,
          운명파편: 10920,
          골드: 2710,
        },
        breath: {
          ...t4ArmorBreathTable[0.01],
        },
      },
      23: {
        baseProb: 0.01,
        amount: {
          운명의수호석: 2400,
          운돌: 34,
          아비도스: 21,
          운명파편: 11520,
          골드: 2920,
        },
        breath: {
          ...t4ArmorBreathTable[0.01],
        },
      },
      24: {
        baseProb: 0.005,
        amount: {
          운명의수호석: 2520,
          운돌: 36,
          아비도스: 30,
          운명파편: 12240,
          골드: 3150,
        },
        breath: {
          ...t4ArmorBreathTable[0.005],
        },
      },
      25: {
        baseProb: 0.005,
        amount: {
          운명의수호석: 2700,
          운돌: 40,
          아비도스: 30,
          운명파편: 12900,
          골드: 3390,
        },
        breath: {
          ...t4ArmorBreathTable[0.005],
        },
      },
    },
    t4_1730: {
      11: {
        baseProb: 0.1,
        amount: {
          운명의수호석결정: 890,
          위운돌: 9,
          상급아비도스: 11,
          운명파편: 9020,
          골드: 2200,
        },
        breath: {
          ...t4ArmorBreathTable[0.1],
        },
      },
      12: {
        baseProb: 0.05,
        amount: {
          운명의수호석결정: 930,
          위운돌: 11,
          상급아비도스: 11,
          운명파편: 9570,
          골드: 2450,
        },
        breath: {
          ...t4ArmorBreathTable[0.05],
        },
      },
      13: {
        baseProb: 0.05,
        amount: {
          운명의수호석결정: 1030,
          위운돌: 12,
          상급아비도스: 12,
          운명파편: 10540,
          골드: 2700,
        },
        breath: {
          ...t4ArmorBreathTable[0.05],
        },
      },
      14: {
        baseProb: 0.04,
        amount: {
          운명의수호석결정: 1120,
          위운돌: 13,
          상급아비도스: 13,
          운명파편: 11520,
          골드: 2950,
        },
        breath: {
          ...t4ArmorBreathTable[0.04],
        },
      },
      15: {
        baseProb: 0.04,
        amount: {
          운명의수호석결정: 1240,
          위운돌: 14,
          상급아비도스: 15,
          운명파편: 12690,
          골드: 3250,
        },
        breath: {
          ...t4ArmorBreathTable[0.04],
        },
      },
      16: {
        baseProb: 0.04,
        amount: {
          운명의수호석결정: 1330,
          위운돌: 15,
          상급아비도스: 16,
          운명파편: 13670,
          골드: 3500,
        },
        breath: {
          ...t4ArmorBreathTable[0.04],
        },
      },
      17: {
        baseProb: 0.03,
        amount: {
          운명의수호석결정: 1450,
          위운돌: 17,
          상급아비도스: 17,
          운명파편: 14840,
          골드: 3800,
        },
        breath: {
          ...t4ArmorBreathTable[0.0225],
        },
      },
      18: {
        baseProb: 0.03,
        amount: {
          운명의수호석결정: 1560,
          위운돌: 18,
          상급아비도스: 19,
          운명파편: 16010,
          골드: 4100,
        },
        breath: {
          ...t4ArmorBreathTable[0.0225],
        },
      },
      19: {
        baseProb: 0.03,
        amount: {
          운명의수호석결정: 1700,
          위운돌: 20,
          상급아비도스: 20,
          운명파편: 17380,
          골드: 4450,
        },
        breath: {
          ...t4ArmorBreathTable[0.0225],
        },
      },
      20: {
        baseProb: 0.015,
        amount: {
          운명의수호석결정: 1810,
          위운돌: 21,
          상급아비도스: 22,
          운명파편: 18550,
          골드: 4750,
        },
        breath: {
          ...t4ArmorBreathTable[0.015],
        },
      },
      21: {
        baseProb: 0.015,
        amount: {
          운명의수호석결정: 1950,
          위운돌: 23,
          상급아비도스: 23,
          운명파편: 19920,
          골드: 5100,
        },
        breath: {
          ...t4ArmorBreathTable[0.015],
        },
      },
      22: {
        baseProb: 0.01,
        amount: {
          운명의수호석결정: 2080,
          위운돌: 24,
          상급아비도스: 25,
          운명파편: 21280,
          골드: 5450,
        },
        breath: {
          ...t4ArmorBreathTable[0.01],
        },
      },
      23: {
        baseProb: 0.01,
        amount: {
          운명의수호석결정: 2200,
          위운돌: 26,
          상급아비도스: 26,
          운명파편: 22460,
          골드: 5750,
        },
        breath: {
          ...t4ArmorBreathTable[0.01],
        },
      },
      24: {
        baseProb: 0.005,
        amount: {
          운명의수호석결정: 2330,
          위운돌: 27,
          상급아비도스: 28,
          운명파편: 23820,
          골드: 6100,
        },
        breath: {
          ...t4ArmorBreathTable[0.005],
        },
      },
      25: {
        baseProb: 0.005,
        amount: {
          운명의수호석결정: 2450,
          위운돌: 29,
          상급아비도스: 30,
          운명파편: 25000,
          골드: 6400,
        },
        breath: {
          ...t4ArmorBreathTable[0.005],
        },
      },
    },
  },
  weapon: {
    t4_1590: {
      11: {
        baseProb: 0.1,
        amount: {
          운명의파괴석: 1250,
          운돌: 18,
          아비도스: 12,
          운명파편: 5000,
          골드: 1620,
        },
        breath: {
          ...t4WeaponBreathTable[0.1],
          야금술업화A: [1, 0.1],
        },
      },
      12: {
        baseProb: 0.1,
        amount: {
          운명의파괴석: 1300,
          운돌: 21,
          아비도스: 12,
          운명파편: 5300,
          골드: 1790,
        },
        breath: {
          ...t4WeaponBreathTable[0.1],
          야금술업화A: [1, 0.1],
        },
      },
      13: {
        baseProb: 0.05,
        amount: {
          운명의파괴석: 1400,
          운돌: 24,
          아비도스: 15,
          운명파편: 7600,
          골드: 1990,
        },
        breath: {
          ...t4WeaponBreathTable[0.05],
          야금술업화A: [1, 0.05],
        },
      },
      14: {
        baseProb: 0.05,
        amount: {
          운명의파괴석: 1550,
          운돌: 27,
          아비도스: 15,
          운명파편: 8200,
          골드: 2200,
        },
        breath: {
          ...t4WeaponBreathTable[0.05],
          야금술업화A: [1, 0.05],
        },
      },
      15: {
        baseProb: 0.04,
        amount: {
          운명의파괴석: 1700,
          운돌: 30,
          아비도스: 18,
          운명파편: 8800,
          골드: 2430,
        },
        breath: {
          ...t4WeaponBreathTable[0.04],
          야금술업화B: [1, 0.04],
        },
      },
      16: {
        baseProb: 0.04,
        amount: {
          운명의파괴석: 1950,
          운돌: 33,
          아비도스: 18,
          운명파편: 9400,
          골드: 2670,
        },
        breath: {
          ...t4WeaponBreathTable[0.04],
          야금술업화B: [1, 0.04],
        },
      },
      17: {
        baseProb: 0.03,
        amount: {
          운명의파괴석: 2200,
          운돌: 36,
          아비도스: 25,
          운명파편: 12000,
          골드: 2940,
        },
        breath: {
          ...t4WeaponBreathTable[0.03],
          야금술업화B: [1, 0.03],
        },
      },
      18: {
        baseProb: 0.03,
        amount: {
          운명의파괴석: 2450,
          운돌: 39,
          아비도스: 25,
          운명파편: 12900,
          골드: 3220,
        },
        breath: {
          ...t4WeaponBreathTable[0.03],
          야금술업화B: [1, 0.03],
        },
      },
      19: {
        baseProb: 0.03,
        amount: {
          운명의파괴석: 2700,
          운돌: 42,
          아비도스: 25,
          운명파편: 13700,
          골드: 3510,
        },
        breath: {
          ...t4WeaponBreathTable[0.03],
          야금술업화C: [1, 0.03],
        },
      },
      20: {
        baseProb: 0.015,
        amount: {
          운명의파괴석: 2950,
          운돌: 45,
          아비도스: 35,
          운명파편: 16000,
          골드: 3830,
        },
        breath: {
          ...t4WeaponBreathTable[0.015],
          야금술업화C: [1, 0.015],
        },
      },
      21: {
        baseProb: 0.015,
        amount: {
          운명의파괴석: 3200,
          운돌: 48,
          아비도스: 35,
          운명파편: 17100,
          골드: 4160,
        },
        breath: {
          ...t4WeaponBreathTable[0.015],
        },
      },
      22: {
        baseProb: 0.01,
        amount: {
          운명의파괴석: 3700,
          운돌: 52,
          아비도스: 35,
          운명파편: 18200,
          골드: 4510,
        },
        breath: {
          ...t4WeaponBreathTable[0.01],
        },
      },
      23: {
        baseProb: 0.01,
        amount: {
          운명의파괴석: 4000,
          운돌: 56,
          아비도스: 35,
          운명파편: 19200,
          골드: 4870,
        },
        breath: {
          ...t4WeaponBreathTable[0.01],
        },
      },
      24: {
        baseProb: 0.005,
        amount: {
          운명의파괴석: 4200,
          운돌: 60,
          아비도스: 50,
          운명파편: 20400,
          골드: 5250,
        },
        breath: {
          ...t4WeaponBreathTable[0.005],
        },
      },
      25: {
        baseProb: 0.005,
        amount: {
          운명의파괴석: 4500,
          운돌: 65,
          아비도스: 50,
          운명파편: 21500,
          골드: 5650,
        },
        breath: {
          ...t4WeaponBreathTable[0.005],
        },
      },
    },
    t4_1730: {
      11: {
        baseProb: 0.1,
        amount: {
          운명의파괴석결정: 1630,
          위운돌: 14,
          상급아비도스: 18,
          운명파편: 14990,
          골드: 3650,
        },
        breath: {
          ...t4WeaponBreathTable[0.1],
        },
      },
      12: {
        baseProb: 0.05,
        amount: {
          운명의파괴석결정: 1700,
          위운돌: 17,
          상급아비도스: 18,
          운명파편: 15890,
          골드: 4050,
        },
        breath: {
          ...t4WeaponBreathTable[0.05],
        },
      },
      13: {
        baseProb: 0.05,
        amount: {
          운명의파괴석결정: 1890,
          위운돌: 19,
          상급아비도스: 21,
          운명파편: 17660,
          골드: 4500,
        },
        breath: {
          ...t4WeaponBreathTable[0.05],
        },
      },
      14: {
        baseProb: 0.04,
        amount: {
          운명의파괴석결정: 2080,
          위운돌: 21,
          상급아비도스: 23,
          운명파편: 19420,
          골드: 4950,
        },
        breath: {
          ...t4WeaponBreathTable[0.04],
        },
      },
      15: {
        baseProb: 0.04,
        amount: {
          운명의파괴석결정: 2270,
          위운돌: 23,
          상급아비도스: 25,
          운명파편: 21190,
          골드: 5400,
        },
        breath: {
          ...t4WeaponBreathTable[0.04],
        },
      },
      16: {
        baseProb: 0.04,
        amount: {
          운명의파괴석결정: 2460,
          위운돌: 25,
          상급아비도스: 27,
          운명파편: 22960,
          골드: 5850,
        },
        breath: {
          ...t4WeaponBreathTable[0.04],
        },
      },
      17: {
        baseProb: 0.03,
        amount: {
          운명의파괴석결정: 2690,
          위운돌: 28,
          상급아비도스: 29,
          운명파편: 25120,
          골드: 6400,
        },
        breath: {
          ...t4WeaponBreathTable[0.0225],
        },
      },
      18: {
        baseProb: 0.03,
        amount: {
          운명의파괴석결정: 2900,
          위운돌: 30,
          상급아비도스: 32,
          운명파편: 27080,
          골드: 6900,
        },
        breath: {
          ...t4WeaponBreathTable[0.0225],
        },
      },
      19: {
        baseProb: 0.03,
        amount: {
          운명의파괴석결정: 3110,
          위운돌: 32,
          상급아비도스: 34,
          운명파편: 29040,
          골드: 7400,
        },
        breath: {
          ...t4WeaponBreathTable[0.0225],
        },
      },
      20: {
        baseProb: 0.015,
        amount: {
          운명의파괴석결정: 3340,
          위운돌: 34,
          상급아비도스: 37,
          운명파편: 31200,
          골드: 7950,
        },
        breath: {
          ...t4WeaponBreathTable[0.015],
        },
      },
      21: {
        baseProb: 0.015,
        amount: {
          운명의파괴석결정: 3570,
          위운돌: 37,
          상급아비도스: 39,
          운명파편: 33360,
          골드: 8500,
        },
        breath: {
          ...t4WeaponBreathTable[0.015],
        },
      },
      22: {
        baseProb: 0.01,
        amount: {
          운명의파괴석결정: 3800,
          위운돌: 39,
          상급아비도스: 42,
          운명파편: 35520,
          골드: 9050,
        },
        breath: {
          ...t4WeaponBreathTable[0.01],
        },
      },
      23: {
        baseProb: 0.01,
        amount: {
          운명의파괴석결정: 4030,
          위운돌: 42,
          상급아비도스: 44,
          운명파편: 37680,
          골드: 9600,
        },
        breath: {
          ...t4WeaponBreathTable[0.01],
        },
      },
      24: {
        baseProb: 0.005,
        amount: {
          운명의파괴석결정: 4260,
          위운돌: 44,
          상급아비도스: 47,
          운명파편: 39840,
          골드: 10150,
        },
        breath: {
          ...t4WeaponBreathTable[0.005],
        },
      },
      25: {
        baseProb: 0.005,
        amount: {
          운명의파괴석결정: 4500,
          위운돌: 47,
          상급아비도스: 50,
          운명파편: 42000,
          골드: 10700,
        },
        breath: {
          ...t4WeaponBreathTable[0.005],
        },
      },
    },
  },
};

export function getTargetList(
  itemType: string | undefined,
  itemGrade: string | undefined
) {
  if (!itemType || !itemGrade) {
    return [];
  }
  const gradeTable = refineData[itemType]?.[itemGrade];
  if (!gradeTable) {
    return [];
  }
  return Object.keys(gradeTable).map((x) => +x);
}

export function getRefineTable(
  itemType: string | undefined,
  itemGrade: string | undefined,
  refineTarget: number | undefined,
  applyResearch: boolean,
  applyHyperExpress: boolean
): RefineTable | undefined {
  if (!itemType || !itemGrade || !refineTarget) {
    return undefined;
  }
  // 미지원 등급(제거된 T3 등)·단계는 undefined 반환 (호출부가 처리)
  const data = refineData[itemType]?.[itemGrade]?.[refineTarget];
  if (!data) {
    return undefined;
  }

  let additionalProb = 0;
  let costReduction = 0;
  let fragmentReduction: number | undefined = undefined; // if undefined, use costReduction
  let goldReduction = 0;
  let goldCeilUnit = 1;
  let janginMultiplier = 1;
  if (itemGrade === 't4_1590' && refineTarget >= 1 && refineTarget <= 18) {
    goldReduction = 0.2;
  }

  if (applyResearch) {
    // 영지 연구: t4_1590 11~14강 재련 필요 경험치 20% 감소 (장인의 기운 1.25배 충전 = 1/0.8)
    if (itemGrade === 't4_1590' && refineTarget >= 11 && refineTarget <= 14) {
      janginMultiplier = 1.25;
    }
  }

  if (applyHyperExpress) {
    // 2025 Winter, Mokoko Challange Express
    if (itemGrade === 't4_1590' && refineTarget >= 11 && refineTarget <= 14) {
      additionalProb = data.baseProb;
      goldReduction = 0.6;
      fragmentReduction = 0.4;
      costReduction = 0.2;
      goldCeilUnit = 1;
    }
    if (itemGrade === 't4_1590' && refineTarget >= 15 && refineTarget <= 18) {
      additionalProb = data.baseProb;
      goldReduction = 0.4;
      fragmentReduction = 0.4;
      costReduction = 0.2;
      goldCeilUnit = 1;
    }
  }

  additionalProb = Math.round(additionalProb * 1000) / 1000;

  return {
    additionalProb,
    janginMultiplier,
    amount: Object.fromEntries(
      Object.entries(data.amount).map(([name, value]) => [
        name,
        name === '골드'
          ? Math.ceil((value * (1 - goldReduction)) / goldCeilUnit) *
            goldCeilUnit
          : name.endsWith('파편')
          ? Math.ceil(value * (1 - (fragmentReduction ?? costReduction)))
          : Math.ceil(value * (1 - costReduction)),
      ])
    ),
    baseProb: data.baseProb,
    breath: data.breath,
  };
}
