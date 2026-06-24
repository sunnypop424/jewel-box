// 티카투카 AI — ★0~★5. engine의 legalMoves/legalShieldPlacements를 공유하고
// 레벨별 스코어 함수만 차등화한다. AI 턴은 자기완결적으로 resolve(주사위 포함)하여
// reducer가 그대로 적용한다(불법수 0 보장). 난수는 rng 주입.

import {
  applyPush,
  canPush,
  evaluate,
  isBoardFull,
  isFieldFull,
  legalMoves,
  legalShieldPlacements,
  opponentOf,
  placeDie,
  makeDie,
  rollValue,
} from './engine';
import type {
  AiLevel,
  Board,
  DieValue,
  LineIndex,
  Move,
  Owner,
  ShieldPlacement,
} from './types';

// AI 1턴의 완전 resolve 결과(reducer가 결정론적으로 적용).
export interface AiTurn {
  usedTazza: boolean;
  rolls: DieValue[]; // [v1] 또는 타짜 시 [v1, v2]
  chosenValue: DieValue;
  move: Move;
  shieldValue: DieValue | null; // push면 굴린 쉴드 값
  shieldPlacement: ShieldPlacement | null;
}

const LINES: LineIndex[] = [0, 1, 2];

// 보드를 owner 관점에서 평가: 라인 승수 차이(가중 100) + 총합 차이.
function boardScore(board: Board, owner: Owner): number {
  const r = evaluate(board, false);
  const oppo = opponentOf(owner);
  const myWins = owner === 'me' ? r.meLineWins : r.aiLineWins;
  const oppWins = oppo === 'me' ? r.meLineWins : r.aiLineWins;
  const myTotal = owner === 'me' ? r.meTotal : r.aiTotal;
  const oppTotal = owner === 'me' ? r.aiTotal : r.meTotal;
  return (myWins - oppWins) * 100 + (myTotal - oppTotal);
}

// 굴린 값의 한 move를 보드에 적용(쉴드 배치 제외 — 별도 처리).
function applyMove(board: Board, owner: Owner, move: Move, value: DieValue): Board {
  if (move.kind === 'place') {
    return placeDie(board, move.line, owner, makeDie(value, owner, false));
  }
  return applyPush(board, move.line, owner, value).board;
}

// ── 쉴드 배치 정책 ────────────────────────────────────
// 가이드: 값 1~3은 상대 필드(슬롯 캡), 4~6은 내 필드(내 합↑).
function pickShield(
  board: Board,
  owner: Owner,
  value: DieValue,
  level: AiLevel,
  rng: () => number
): ShieldPlacement | null {
  const spots = legalShieldPlacements(board, owner);
  if (spots.length === 0) return null;
  const oppo = opponentOf(owner);

  if (level === 0) {
    return spots[Math.floor(rng() * spots.length)];
  }
  if (level === 1) {
    // 하수: 항상 내 필드, 안 찬 라인 중 첫째
    const mine = spots.filter((s) => s.owner === owner);
    return (mine[0] ?? spots[0]);
  }

  // ★2+: 가이드 적용. 낮은 값은 상대 필드(캡), 높은 값은 내 필드.
  const preferOwner: Owner = value <= 3 ? oppo : owner;
  const candidates = spots.filter((s) => s.owner === preferOwner);
  const pool = candidates.length > 0 ? candidates : spots;

  // 라인 선택: 접전(내 합과 상대 합 차이가 작은) 라인을 우선해 캡/보강.
  let best = pool[0];
  let bestScore = -Infinity;
  for (const s of pool) {
    const after = placeDie(board, s.line, s.owner, makeDie(value, owner, true));
    let sc = boardScore(after, owner);
    // 상대 필드 캡: 상대가 그 라인에서 아직 슬롯이 남아 큰 수를 넣을 여지가 클수록 가치↑
    if (s.owner === oppo) {
      const oppRemaining = 3 - board.lines[s.line][oppo].length - 1;
      sc += oppRemaining * 6; // 막은 슬롯에 들어왔을 기대 고수치(~6)만큼 캡 가치
    }
    if (sc > bestScore) {
      bestScore = sc;
      best = s;
    }
  }
  return best;
}

// ── move 선택(레벨별 스코어) ──────────────────────────
function scoreMove(
  board: Board,
  owner: Owner,
  move: Move,
  value: DieValue,
  level: AiLevel
): number {
  const after = applyMove(board, owner, move, value);
  if (level <= 1) {
    // 하수: 자기합 - 상대합 (2라인 개념 약함). push는 상대 제거로 자연히 선호됨.
    const r = evaluate(after, false);
    const myTotal = owner === 'me' ? r.meTotal : r.aiTotal;
    const oppTotal = owner === 'me' ? r.aiTotal : r.meTotal;
    let sc = myTotal - oppTotal;
    if (move.kind === 'push') sc += 4; // 쉴드 1개 획득 보너스(근사)
    return sc;
  }
  if (level <= 3) {
    // 중수·상수: 2라인 승리 인지(boardScore) + push 쉴드 보너스
    let sc = boardScore(after, owner);
    if (move.kind === 'push') sc += 6;
    return sc;
  }
  // ★4+: 1-스텝 EV — 내 move 후 상대의 다음 굴림(1~6 균등) 최선 응수 기대.
  return ev1Step(after, owner);
}

// 내 move 후 상대 턴: 상대가 1~6 균등 굴림 → ★2 그리디 응수 → 내 관점 boardScore 평균.
function ev1Step(board: Board, owner: Owner): number {
  const oppo = opponentOf(owner);
  let sum = 0;
  for (let v = 1 as DieValue; v <= 6; v = (v + 1) as DieValue) {
    const moves = legalMoves(board, oppo, v);
    if (moves.length === 0) {
      sum += boardScore(board, owner);
      continue;
    }
    // 상대는 자기 관점 boardScore 최대화(★2 정책)
    let bestOppScore = -Infinity;
    let bestBoard = board;
    for (const m of moves) {
      const after = applyMove(board, oppo, m, v);
      const sc = boardScore(after, oppo) + (m.kind === 'push' ? 6 : 0);
      if (sc > bestOppScore) {
        bestOppScore = sc;
        bestBoard = after;
      }
    }
    sum += boardScore(bestBoard, owner);
  }
  return sum / 6;
}

// ── ★5 몬테카를로 ─────────────────────────────────────
const MC_TOPK = 4;
const MC_PLAYOUTS = 80;
const MC_MAX_SIM = 300;
const ROLLOUT_MAX_TURNS = 80;

// 한 턴 그리디 진행(★2 정책): 굴림→최선 move→push면 쉴드 굴려 배치. 보드 반환.
function greedyTurn(board: Board, owner: Owner, rng: () => number): Board {
  const value = rollValue(rng);
  const moves = legalMoves(board, owner, value);
  if (moves.length === 0) return board; // 합법수 없음 → 패스
  let best = moves[0];
  let bestScore = -Infinity;
  for (const m of moves) {
    const after = applyMove(board, owner, m, value);
    const sc = boardScore(after, owner) + (m.kind === 'push' ? 6 : 0);
    if (sc > bestScore) {
      bestScore = sc;
      best = m;
    }
  }
  let next = applyMove(board, owner, best, value);
  if (best.kind === 'push') {
    const sv = rollValue(rng);
    const place = pickShield(next, owner, sv, 2, rng);
    if (place) next = placeDie(next, place.line, place.owner, makeDie(sv, owner, true));
  }
  return next;
}

// 보드 끝까지 양측 ★2 그리디로 시뮬 → 승자.
function simulateToEnd(
  board: Board,
  startTurn: Owner,
  rng: () => number
): Owner | 'draw' {
  let b = board;
  let turn = startTurn;
  let turns = 0;
  let idle = 0;
  while (!isBoardFull(b) && turns < ROLLOUT_MAX_TURNS && idle < 2) {
    const before = b;
    b = greedyTurn(b, turn, rng);
    idle = b === before ? idle + 1 : 0;
    turn = opponentOf(turn);
    turns += 1;
  }
  return evaluate(b, false).winner;
}

// ── 메인: AI 1턴 의사결정 ─────────────────────────────
export function decideAi(
  board: Board,
  level: AiLevel,
  tazzaUsed: boolean,
  rng: () => number,
  owner: Owner = 'ai'
): AiTurn | null {
  // 1) 첫 굴림
  const v1 = rollValue(rng);

  // 2) 타짜 사용 판단(★3+, 미사용, 이미 2라인 승 아님)
  const ev = evaluate(board, false);
  const winsNow = owner === 'me' ? ev.meLineWins : ev.aiLineWins;
  const canTazza = level >= 3 && !tazzaUsed && winsNow < 2;
  let rolls: DieValue[] = [v1];
  let usedTazza = false;
  let chosen = v1;

  if (canTazza) {
    const s1 = bestMoveScore(board, owner, v1, level);
    // 현재 굴림이 '뒤지는' 상황이면 타짜로 한 번 더 굴려 더 나은 값 채택.
    if (s1 < 0) {
      const v2 = rollValue(rng);
      rolls = [v1, v2];
      usedTazza = true;
      const s2 = bestMoveScore(board, owner, v2, level);
      chosen = s2 >= s1 ? v2 : v1;
    }
  }

  // 3) chosen 값으로 move 선택
  const moves = legalMoves(board, owner, chosen);
  if (moves.length === 0) {
    // 자기 필드 다 차고 밀어내기 불가 → 이 턴 자동 패스
    return null;
  }

  let move: Move;
  if (level === 0) {
    move = moves[Math.floor(rng() * moves.length)];
  } else if (level === 5) {
    move = pickByMonteCarlo(board, owner, chosen, moves, rng);
  } else {
    move = argmaxMove(moves, (m) => scoreMove(board, owner, m, chosen, level));
  }

  // 4) push면 쉴드 굴려 배치
  let shieldValue: DieValue | null = null;
  let shieldPlacement: ShieldPlacement | null = null;
  if (move.kind === 'push') {
    const afterPush = applyPush(board, move.line, owner, chosen).board;
    shieldValue = rollValue(rng);
    shieldPlacement = pickShield(afterPush, owner, shieldValue, level, rng);
  }

  return { usedTazza, rolls, chosenValue: chosen, move, shieldValue, shieldPlacement };
}

function bestMoveScore(
  board: Board,
  owner: Owner,
  value: DieValue,
  level: AiLevel
): number {
  const moves = legalMoves(board, owner, value);
  if (moves.length === 0) return -Infinity;
  let best = -Infinity;
  for (const m of moves) best = Math.max(best, scoreMove(board, owner, m, value, level));
  return best;
}

function argmaxMove(moves: Move[], score: (m: Move) => number): Move {
  let best = moves[0];
  let bestScore = -Infinity;
  for (const m of moves) {
    const sc = score(m);
    if (sc > bestScore) {
      bestScore = sc;
      best = m;
    }
  }
  return best;
}

// ★5: ★4 EV로 상위 K 후보만 추린 뒤 얕은 몬테카를로 승률로 선택.
function pickByMonteCarlo(
  board: Board,
  owner: Owner,
  value: DieValue,
  moves: Move[],
  rng: () => number
): Move {
  // ★4 prior로 정렬
  const scored = moves
    .map((m) => ({ m, s: scoreMove(board, owner, m, value, 4) }))
    .sort((a, b) => b.s - a.s);
  const top = scored.slice(0, Math.min(MC_TOPK, scored.length));

  // 시뮬 예산 분배(전역 상한 가드). 초과 위험이면 ★4 폴백.
  const perMove = Math.min(MC_PLAYOUTS, Math.floor(MC_MAX_SIM / top.length));
  if (perMove < 8) return top[0].m; // 예산 부족 → ★4 최상위로 폴백

  const oppo = opponentOf(owner);
  let best = top[0].m;
  let bestRate = -Infinity;
  for (const { m } of top) {
    const afterMove = applyMove(board, owner, m, value);
    // push면 평균 기대 쉴드(value 4)로 한 칸 채워 근사 후 롤아웃
    let start = afterMove;
    if (m.kind === 'push') {
      const place = pickShield(afterMove, owner, 4, 2, rng);
      if (place) start = placeDie(afterMove, place.line, place.owner, makeDie(4, owner, true));
    }
    let win = 0;
    for (let i = 0; i < perMove; i++) {
      const w = simulateToEnd(start, oppo, rng);
      if (w === owner) win += 1;
      else if (w === 'draw') win += 0.5;
    }
    const rate = win / perMove;
    if (rate > bestRate) {
      bestRate = rate;
      best = m;
    }
  }
  return best;
}

// 디버그/검증용: 합법수 없음 판정(자동홀드와 동일 기준).
export function aiHasNoMove(board: Board): boolean {
  // ai의 어떤 값으로도 둘 곳/밀 곳 없음 = 자기 3필드 모두 풀(배치 불가) && 모든 라인 push 불가
  const allFull = LINES.every((l) => isFieldFull(board, l, 'ai'));
  if (!allFull) return false;
  // 필드 풀이면 canPush도 전부 false(필드잠금) → push 불가
  for (const l of LINES) for (let v = 1 as DieValue; v <= 6; v = (v + 1) as DieValue) {
    if (canPush(board, l, 'ai', v)) return false;
  }
  return true;
}
