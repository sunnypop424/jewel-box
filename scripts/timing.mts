// 추천 1회 비용 측정 — 시뮬 설정(경량 롤아웃) 기준. 단일 스레드 vs 워커 1개분(병렬 벽시계 근사).
import os from 'node:os';
import { createEmptyBoard, makeDie, placeDie } from '../src/features/tikatuka/engine';
import { recommendMove, mcWinRate } from '../src/features/tikatuka/ai';
import type { AdvCfg } from '../src/features/tikatuka/ai';
import type { Board, DieValue, LineIndex, Owner } from '../src/features/tikatuka/types';

const N = Math.max(1, Math.min(6, (os.cpus()?.length ?? 4) - 1));
const cfg = (playouts: number): AdvCfg => ({ playouts, respLevel: 2, rolloutLevel: 2, expandShield: false, oppPushFirst: true });

function midBoard(): Board {
  let b = createEmptyBoard();
  const put = (l: LineIndex, o: Owner, v: DieValue, s = false) => (b = placeDie(b, l, o, makeDie(v, o, s)));
  put(0, 'me', 5); put(0, 'me', 5); put(0, 'ai', 3);
  put(1, 'me', 2); put(1, 'ai', 6); put(1, 'ai', 6);
  put(2, 'me', 4); put(2, 'ai', 2); put(2, 'ai', 2);
  return b;
}
const board = midBoard();
const ctx = { iAmFirst: true, isFirstShield: false };

function timeIt(label: string, fn: () => unknown, reps = 8) {
  fn(); // 워밍업
  const t = Date.now();
  for (let i = 0; i < reps; i++) fn();
  console.log(`  ${label}: ${((Date.now() - t) / reps).toFixed(0)} ms/회`);
}

console.log(`코어 기반 워커 수 N=${N} (hardwareConcurrency=${os.cpus()?.length ?? '?'})\n`);
console.log('[추천 — value=2 (L2에 알까기 후보 포함, 가장 무거움)]');
timeIt(`단일 스레드 1500표본`, () => recommendMove(board, 'me', 2, false, cfg(1500), ctx));
timeIt(`워커 1개분 ${Math.ceil(1500 / N)}표본 (≈ 병렬 벽시계)`, () => recommendMove(board, 'me', 2, false, cfg(Math.ceil(1500 / N)), ctx));
console.log('\n[추천 — value=5 (놓기만)]');
timeIt(`단일 스레드 1500표본`, () => recommendMove(board, 'me', 5, false, cfg(1500), ctx));
console.log('\n[승률(관찰) MC]');
timeIt(`단일 스레드 2500표본`, () => mcWinRate(board, 'me', 'me', 2500, 2, Math.random, 'ai'));
timeIt(`워커 1개분 ${Math.ceil(2500 / N)}표본 (≈ 병렬 벽시계)`, () => mcWinRate(board, 'me', 'me', Math.ceil(2500 / N), 2, Math.random, 'ai'));
