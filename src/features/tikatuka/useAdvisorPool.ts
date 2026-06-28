// 어드바이저 워커 풀 훅 — 시뮬(TikatukaSim)·게임 자유모드 '지원 모드'(TikatukaGame)가 함께 쓰는 단일 진리원.
// MC 추천/승률을 워커에서 돌려(메인스레드 비차단) 계산 → 두 화면이 '완전히 동일한 조언'을 낸다.
//   · move  : 후보별 rate를 워커 N개가 N등분 계산 → 평균·집계 후 finishMoveAdvice.
//   · wr    : 관찰 승률(승률만).
//   · whole : choose/shield 전용(단일 워커) — advice + winRate 통째.
import { useEffect, useRef, useState } from 'react';
import { finishMoveAdvice, gradedHold } from './ai';
import type { Factor, HoldAdvice, ScoredMove } from './ai';
import type { Board, DieValue, LineIndex, Move, Owner } from './types';

export const TOTAL_PLAYOUTS = 1500; // 추천 후보 rate 총 표본
export const WR_TOTAL = 2500; // 관찰 승률 총 표본
export const WHOLE_PLAYOUTS = 700; // choose/shield 단일 워커 표본
const POOL_TIMEOUT_MS = 8000; // 워커 응답 누락 시 도착분으로 마감(멈춤 방지)

// 추천 요청 종류. null이면 승률만(wr).
export type AdvReq =
  | { kind: 'move'; value: DieValue }
  | { kind: 'choose'; value: DieValue; value2: DieValue }
  | { kind: 'shield'; value: DieValue }
  | null;

// 화면용 추천(시뮬/게임 공용 — 둘 다 owner='me' 관점).
export interface AdvisorAdvice {
  kind: string; // 'place' | 'push' | 'tazza' | 'choose' | 'shield'
  headline: string;
  factors: Factor[];
  line?: LineIndex;
  side?: Owner;
  chooseIndex?: 0 | 1;
}

type ChunkRes =
  | { id: number; t: 'move'; rates: { kind: 'place' | 'push'; line: LineIndex; rate: number; strat: number }[] }
  | { id: number; t: 'wr'; winRate: number; playouts: number }
  | { id: number; t: 'whole'; advice: AdvisorAdvice | null; winRate: number };

type PoolReq = {
  id: number;
  kind: 'move' | 'wr' | 'whole';
  need: number;
  got: ChunkRes[];
  board: Board;
  turn: Owner;
  value?: DieValue;
  ctx: { iAmFirst: boolean; isFirstShield: boolean };
  tazza: boolean;
};

export interface AdvisorPool {
  advice: AdvisorAdvice | null;
  winRate: number | null;
  hold: HoldAdvice | null;
  computing: boolean;
  request: (
    board: Board,
    turn: Owner,
    advReq: AdvReq,
    ctx: { iAmFirst: boolean; isFirstShield: boolean },
    tazzaAvail: boolean
  ) => void;
  reset: () => void;
}

export function useAdvisorPool(): AdvisorPool {
  const [advice, setAdvice] = useState<AdvisorAdvice | null>(null);
  const [winRate, setWinRate] = useState<number | null>(null);
  const [hold, setHold] = useState<HoldAdvice | null>(null);
  const [computing, setComputing] = useState(false);
  const poolRef = useRef<Worker[]>([]);
  const reqIdRef = useRef(0);
  const pendingRef = useRef<PoolReq | null>(null);
  const poolTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // 도착한 청크(p.got)로 추천/승률/홀드를 조립해 상태에 반영(응답 일부만 와도 동작 — 타임아웃 폴백 공용).
  const finalize = (p: PoolReq) => {
    if (p.kind === 'move') {
      const agg = new Map<string, { kind: 'place' | 'push'; line: LineIndex; sum: number; strat: number }>();
      for (const r of p.got)
        if (r.t === 'move')
          for (const x of r.rates) {
            const k = `${x.kind}:${x.line}`;
            const cur = agg.get(k);
            if (cur) cur.sum += x.rate;
            else agg.set(k, { kind: x.kind, line: x.line, sum: x.rate, strat: x.strat });
          }
      const scored: ScoredMove[] = [...agg.values()].map((e) => ({
        m: { kind: e.kind, line: e.line } as Move,
        rate: e.sum / p.got.length,
        strat: e.strat,
      }));
      const a = scored.length ? finishMoveAdvice(p.board, 'me', p.value!, scored, p.tazza, p.ctx) : null;
      const wr = a?.winRate ?? (scored.length ? Math.max(...scored.map((s) => s.rate)) : null);
      setWinRate(wr);
      setAdvice(
        a
          ? { kind: a.action, headline: a.headline, factors: a.factors, line: a.line, side: a.action === 'push' ? 'ai' : a.action === 'place' ? 'me' : undefined }
          : null
      );
      setHold(p.turn === 'me' && wr != null ? gradedHold(p.board, 'me', wr) : null);
    } else if (p.kind === 'wr') {
      let wsum = 0;
      let psum = 0;
      for (const r of p.got) if (r.t === 'wr') { wsum += r.winRate * r.playouts; psum += r.playouts; }
      const wr = psum ? wsum / psum : null;
      setWinRate(wr);
      setAdvice(null);
      setHold(p.turn === 'me' && wr != null ? gradedHold(p.board, 'me', wr) : null);
    } else {
      const r = p.got[0];
      if (r.t === 'whole') {
        setWinRate(r.winRate);
        setAdvice(r.advice);
        setHold(null);
      }
    }
    setComputing(false);
  };

  const handleChunk = (data: ChunkRes) => {
    const p = pendingRef.current;
    if (!p || data.id !== p.id) return; // 스테일 무시
    p.got.push(data);
    if (p.got.length < p.need) return;
    pendingRef.current = null;
    if (poolTimeoutRef.current) clearTimeout(poolTimeoutRef.current);
    finalize(p);
  };

  // 워커 풀 — 코어 수만큼(−1, 최대 6) 생성. 1회 생성으로 충분(안정 ref/세터/순수함수만 사용).
  useEffect(() => {
    const n = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
    const ws = Array.from(
      { length: n },
      () => new Worker(new URL('./advisor.worker.ts', import.meta.url), { type: 'module' })
    );
    ws.forEach((w) => {
      w.onmessage = (e: MessageEvent<ChunkRes>) => handleChunk(e.data);
    });
    poolRef.current = ws;
    return () => {
      ws.forEach((w) => w.terminate());
      poolRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reset = () => {
    if (poolTimeoutRef.current) clearTimeout(poolTimeoutRef.current);
    pendingRef.current = null;
    setAdvice(null);
    setWinRate(null);
    setHold(null);
    setComputing(false);
  };

  // 추천 요청을 워커 풀에 분배. move/wr는 N등분, choose/shield는 단일 워커(whole).
  const request = (
    board: Board,
    turn: Owner,
    advReq: AdvReq,
    ctxObj: { iAmFirst: boolean; isFirstShield: boolean },
    tazzaAvail: boolean
  ) => {
    const ws = poolRef.current;
    const N = ws.length;
    if (!N) return;
    const id = ++reqIdRef.current;
    if (poolTimeoutRef.current) clearTimeout(poolTimeoutRef.current);
    setComputing(true);
    // 타임아웃 폴백 — 일부 워커가 응답 안 해도 도착분으로 마감(멈춤 방지). 응답 0이면 빈 상태로 정리.
    poolTimeoutRef.current = setTimeout(() => {
      const p = pendingRef.current;
      if (!p || p.id !== id) return;
      pendingRef.current = null;
      if (p.got.length > 0) finalize(p);
      else {
        setWinRate(null);
        setAdvice(null);
        setHold(null);
        setComputing(false);
      }
    }, POOL_TIMEOUT_MS);
    if (advReq?.kind === 'move') {
      pendingRef.current = { id, kind: 'move', need: N, got: [], board, turn, value: advReq.value, ctx: ctxObj, tazza: tazzaAvail };
      const per = Math.max(1, Math.ceil(TOTAL_PLAYOUTS / N));
      ws.forEach((w) => w.postMessage({ id, t: 'move', board, value: advReq.value, shield: ctxObj.isFirstShield, playouts: per }));
    } else if (advReq && (advReq.kind === 'choose' || advReq.kind === 'shield')) {
      pendingRef.current = { id, kind: 'whole', need: 1, got: [], board, turn, ctx: ctxObj, tazza: tazzaAvail };
      ws[0].postMessage({ id, t: 'whole', board, startTurn: turn, req: advReq, iAmFirst: ctxObj.iAmFirst, isFirstShield: ctxObj.isFirstShield, playouts: WHOLE_PLAYOUTS });
    } else {
      pendingRef.current = { id, kind: 'wr', need: N, got: [], board, turn, ctx: ctxObj, tazza: tazzaAvail };
      const per = Math.max(1, Math.ceil(WR_TOTAL / N));
      ws.forEach((w) => w.postMessage({ id, t: 'wr', board, startTurn: turn, playouts: per }));
    }
  };

  return { advice, winRate, hold, computing, request, reset };
}
