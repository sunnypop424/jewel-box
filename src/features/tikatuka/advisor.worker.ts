// 시뮬 추천 워커(풀의 1개) — MC '청크'만 계산하고, 최선 수 선택·홀드·근거 조립은 메인이 한다(#3 병렬화).
//  · move: 후보별 승률(rate)만 (playouts 분할분) → 메인이 N개 워커 결과를 평균·집계.
//  · wr  : 승률 MC 부분합 (관찰 턴).
//  · whole: choose/shield 전용(단일 워커) — advice + winRate를 통째로(드물어서 분할 안 함).
import { advScoreMoves, recommendChoose, recommendShield, mcWinRate } from './ai';
import type { AdvCfg, Factor } from './ai';
import { legalMoves } from './engine';
import type { Board, DieValue, LineIndex, Owner } from './types';

const ctx = self as unknown as Worker;

// 롤아웃 정책(경량) — playouts는 메인이 분할해 주입한다. respLevel/rolloutLevel는 경량 설정.
// expandShield:true — 푸시로 얻는 쉴드를 1~6 전수(각 최적 배치) 평균으로 평가. false(고정4 1표본)는
// 푸시 승률을 ~10%p 과소평가해 '라인을 뒤집는 좋은 알까기'마저 추천에서 탈락시켰음(과소평가 버그 수정).
const CFG: Omit<AdvCfg, 'playouts'> = { respLevel: 2, rolloutLevel: 2, expandShield: true, oppPushFirst: true };

type WholeReq = { kind: 'choose'; value: DieValue; value2: DieValue } | { kind: 'shield'; value: DieValue };
type Task =
  | { id: number; t: 'move'; board: Board; value: DieValue; shield: boolean; playouts: number }
  | { id: number; t: 'wr'; board: Board; startTurn: Owner; playouts: number }
  | { id: number; t: 'whole'; board: Board; startTurn: Owner; req: WholeReq; iAmFirst: boolean; isFirstShield: boolean; playouts: number };

interface Advice {
  kind: string;
  headline: string;
  factors: Factor[];
  line?: LineIndex;
  side?: Owner;
  chooseIndex?: 0 | 1;
}

ctx.onmessage = (e: MessageEvent<Task>) => {
  const m = e.data;
  if (m.t === 'move') {
    const moves = legalMoves(m.board, 'me', m.value);
    const scored = advScoreMoves(m.board, 'me', m.value, moves, Math.random, m.shield, { ...CFG, playouts: m.playouts });
    ctx.postMessage({
      id: m.id,
      t: 'move',
      rates: scored.map((s) => ({ kind: s.m.kind, line: s.m.line, rate: s.rate, strat: s.strat })),
    });
  } else if (m.t === 'wr') {
    const winRate = mcWinRate(m.board, 'me', m.startTurn, m.playouts, 2, Math.random, 'ai');
    ctx.postMessage({ id: m.id, t: 'wr', winRate, playouts: m.playouts });
  } else {
    // whole — choose/shield (단일 워커)
    let advice: Advice | null = null;
    if (m.req.kind === 'choose') {
      const a = recommendChoose(m.board, 'me', [m.req.value, m.req.value2], { ...CFG, playouts: m.playouts }, {
        iAmFirst: m.iAmFirst,
        isFirstShield: m.isFirstShield,
      });
      advice = { kind: 'choose', headline: a.headline, factors: a.factors, chooseIndex: a.index };
    } else {
      const a = recommendShield(m.board, 'me', m.req.value);
      if (a) advice = { kind: 'shield', headline: a.headline, factors: a.factors, line: a.line, side: a.owner };
    }
    const winRate = mcWinRate(m.board, 'me', m.startTurn, m.playouts, 2, Math.random, 'ai');
    ctx.postMessage({ id: m.id, t: 'whole', advice, winRate });
  }
};
