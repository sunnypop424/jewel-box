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
  lineSum,
  opponentOf,
  placeDie,
  makeDie,
  rollValue,
  rollValueExcluding,
} from './engine';
import type {
  AiLevel,
  Board,
  DieValue,
  Field,
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

const FILL = 3.5; // 빈 슬롯 기대 충원값(주사위 평균 1~6)
const VAR_PER_SLOT = 2.9; // 주사위 분산 근사(남은 슬롯이 만드는 불확실성)
const PUSH_BONUS = 10; // 밀어내기로 얻는 쉴드의 기대 가치(근사)
const TAZZA_EV_MARGIN = 15; // 타짜: 다시 굴렸을 때 기대 최선 점수가 현재보다 이만큼 높아야 굴림(높은 눈 낭비 방지)
const VULN_W = 0.9; // 같은 값 스택이 한 번에 통째로 날아갈 위험 가중(보너스 인식 손실 점수에 곱)
const LOCK_PENALTY = 4; // 내 필드를 다 채워 그 라인 밀어내기(쉴드 수급) 권리를 잃은 비용
const PAIR_W = 0.2; // 빈 슬롯이 기존 고눈을 페어/트리플로 키울 잠재 가치 가중(보수적)

// 라인 한쪽의 '다 채웠을 때' 기대 점수 — 빈 슬롯은 평균(FILL)으로 채우되,
// 기존 최고눈을 페어로 키우는 같은 눈 보너스 잠재력까지 더한다(매칭 시 한 칸당 +2v, 일반 FILL 대비 초과분).
function projectedSum(field: Field, slots: number): number {
  let s = lineSum(field) + slots * FILL;
  if (slots > 0 && field.length > 0) {
    const topVal = field.reduce((m, d) => Math.max(m, d.value), 0);
    const marginal = Math.max(0, 2 * topVal - FILL); // 최고눈 한 칸 페어화의 초과 가치
    s += marginal * PAIR_W * Math.min(slots, 2);
  }
  return s;
}

// 한 번의 밀어내기로 사라질 수 있는 '최대 점수'(쉴드 제외) — 같은 눈 보너스(값×(2n−1)) 기준.
// 예: [6,6]은 18점이 통째로 날아갈 수 있으므로 위험도 18(단순합 12가 아님).
function maxPushLoss(field: { value: number; shield: boolean }[]): number {
  const byVal = new Map<number, number>();
  for (const d of field) {
    if (d.shield) continue;
    byVal.set(d.value, (byVal.get(d.value) ?? 0) + 1);
  }
  let max = 0;
  for (const [value, n] of byVal) {
    const loss = value * (2 * n - 1); // 그 값 전부가 밀릴 때 사라지는 lineSum 기여분
    if (loss > max) max = loss;
  }
  return max;
}

// 한 라인의 '기대 승리확률'(owner 관점). 남은 슬롯이 평균값으로 채워진다고 보고 margin을 로지스틱으로.
function lineWinProb(board: Board, owner: Owner, line: LineIndex): number {
  const oppo = opponentOf(owner);
  const mine = board.lines[line][owner];
  const opp = board.lines[line][oppo];
  const mySlots = 3 - mine.length;
  const oppSlots = 3 - opp.length;
  // 이미 놓인 점수(lineSum) + 빈 슬롯 기대(FILL) + 같은 눈 보너스 잠재력(projectedSum).
  const margin = projectedSum(mine, mySlots) - projectedSum(opp, oppSlots);
  const remain = mySlots + oppSlots;
  if (remain === 0) return margin > 0 ? 1 : margin < 0 ? 0 : 0.5;
  const std = Math.sqrt(remain * VAR_PER_SLOT) || 1e-4;
  return 1 / (1 + Math.exp(-margin / (0.7 * std)));
}

// 보드 평가(owner 관점) — 핵심: '지금 합'이 아니라 '남은 슬롯까지 채워졌을 때'의 기대 우열로
// 각 라인 승리확률을 추정하고, 2라인 확보를 목표로 점수화한다. 이미 이긴/진 라인 낭비를 억제.
function boardScore(board: Board, owner: Owner): number {
  const oppo = opponentOf(owner);
  let lineEV = 0; // 기대 승리 라인 수(확률 합 0~3)
  let secured = 0; // 사실상 확정 승 라인
  let lost = 0; // 사실상 패배 라인
  let tiebreak = 0; // 실현 총합 우세(타이브레이커용, 보너스 인식)
  let myVuln = 0; // 내 약점: 상대가 밀어낼 수 있는 내 페어/스택의 점수
  let oppVuln = 0; // 상대 약점: 내가 밀어낼 수 있는 상대 페어/스택의 점수
  let lockCost = 0; // 내 필드를 다 채워 밀어내기 권리를 잃은 라인의 비용

  for (const line of LINES) {
    const mine = board.lines[line][owner];
    const opp = board.lines[line][oppo];
    const p = lineWinProb(board, owner, line);
    lineEV += p;
    if (p > 0.9) secured++;
    if (p < 0.1) lost++;
    tiebreak += lineSum(mine) - lineSum(opp); // 실제 타이브레이커와 동일(보너스 포함)
    // 밀어내기는 공격자 필드에 빈칸이 있어야 가능(필드락). 같은 눈을 쌓을수록 한 방에 통째로 날아갈 위험.
    if (opp.length < 3) myVuln += maxPushLoss(mine); // 상대가 이 라인에서 내 스택을 밀 수 있음
    if (mine.length < 3) oppVuln += maxPushLoss(opp); // 내가 이 라인에서 상대 스택을 밀 수 있음
    // 공격 슬롯 보존: 내 필드가 다 찼는데 그 라인에 아직 밀 만한 상대 비쉴드가 남으면 권리 상실 비용.
    if (mine.length === 3 && opp.some((d) => !d.shield)) lockCost += LOCK_PENALTY;
  }

  // 2라인 확보가 목표. 확정 2라인이면 큰 보너스, 2라인 패배면 큰 감점.
  let score = lineEV * 100;
  if (secured >= 2) score += 350;
  if (lost >= 2) score -= 350;
  if (lineEV >= 1.6) score += 50; // 2라인 기대 근접 가산
  score += tiebreak * 1.2; // 타이브레이커는 약하게
  score -= myVuln * VULN_W; // 내 페어가 밀릴 위험은 감점(노출 페어 응징·쉴드 유도)
  score += oppVuln * VULN_W; // 상대 페어를 청소할 기회는 가점
  score -= lockCost; // 공격 슬롯 보존
  return score;
}

// 굴린 값의 한 move를 보드에 적용(쉴드 배치 제외 — 별도 처리).
// shield=true는 선공 첫 주사위(쉴드)처럼 '놓는 주사위가 쉴드'인 경우 — 밀리지 않으므로 평가가 달라진다.
function applyMove(board: Board, owner: Owner, move: Move, value: DieValue, shield = false): Board {
  if (move.kind === 'place') {
    return placeDie(board, move.line, owner, makeDie(value, owner, shield));
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
    // 상대 필드 캡: 슬롯 1칸을 영구히 막아 상대 고점·페어/트리플 잠재력을 봉쇄.
    if (s.owner === oppo) {
      const oppLine = board.lines[s.line][oppo];
      const oppRemaining = 3 - oppLine.length - 1; // 캡 이후 상대에게 남는 빈칸
      let cap = oppRemaining * 6; // 막은 슬롯에 들어왔을 기대 고수치(~6)
      cap += maxPushLoss(oppLine) * 0.5; // 상대가 이미 같은 눈을 쌓는 라인이면 봉쇄 우선
      const p = lineWinProb(board, owner, s.line);
      cap += (1 - Math.abs(p - 0.5) * 2) * 6; // 접전(p≈0.5) 라인일수록 캡 가치↑
      sc += cap;
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
  level: AiLevel,
  shield = false
): number {
  const after = applyMove(board, owner, move, value, shield);
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
    if (move.kind === 'push') sc += PUSH_BONUS;
    return sc;
  }
  // ★4+: 1-스텝 EV — 내 move 후 상대의 다음 굴림(1~6 균등) 최선 응수 기대.
  const ev = ev1Step(after, owner);
  return move.kind === 'push' ? ev + PUSH_BONUS : ev;
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
      const sc = boardScore(after, oppo) + (m.kind === 'push' ? PUSH_BONUS : 0);
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
const MC_PLAYOUTS = 400;
const MC_MAX_SIM = 1600;
const MC_MARGIN = 0.08; // ★5: 롤아웃 승률이 ★4 최상위를 이 정도 넘어야 선택을 뒤집음(노이즈 오버라이드 억제 → ★5 ≥ ★4 보장)
const ROLLOUT_MAX_TURNS = 80;

// 지원모드 전용 — 페인트 후 비동기로 1회만 돈다(속도 제약 약함).
// 루트 얕은 expectimax(상대 6눈 전수 전개) + 가지당 끝까지 MC 롤아웃. 한 후보당 6×이 표본을 읽는다.
const ADV_PLAYOUTS_PER_BRANCH = 150;

interface McConfig {
  topK: number;
  playouts: number;
  maxSim: number;
}

// 한 턴 그리디 진행(★2 정책): 굴림→최선 move→push면 쉴드 굴려 배치. 보드 반환.
function greedyTurn(board: Board, owner: Owner, rng: () => number): Board {
  const value = rollValue(rng);
  const moves = legalMoves(board, owner, value);
  if (moves.length === 0) return board; // 합법수 없음 → 패스
  let best = moves[0];
  let bestScore = -Infinity;
  for (const m of moves) {
    const after = applyMove(board, owner, m, value);
    const sc = boardScore(after, owner) + (m.kind === 'push' ? PUSH_BONUS : 0);
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
  owner: Owner = 'ai',
  isFirstShield = false // 선공 첫 턴이면 놓는 주사위(타짜 재굴림 포함)가 쉴드 — 평가에 반영
): AiTurn | null {
  // 1) 첫 굴림 — 공정(각 눈 기대 확률 동일). 난이도 차이는 의사결정으로만.
  const v1 = rollValue(rng);

  // 2) 타짜 사용 판단(★3+, 미사용, 이미 2라인 승 아님)
  const ev = evaluate(board, false);
  const winsNow = owner === 'me' ? ev.meLineWins : ev.aiLineWins;
  const canTazza = level >= 3 && !tazzaUsed && winsNow < 2;
  let rolls: DieValue[] = [v1];
  let usedTazza = false;
  let chosen = v1;

  if (canTazza) {
    // 다시 굴렸을 때 기대 최선 점수가 현재 눈보다 충분히 높을 때만 타짜(높은 눈 낭비 방지).
    const gate = Math.min(level, 3) as AiLevel;
    const s1 = bestMoveScore(board, owner, v1, gate, isFirstShield);
    if (rerollEV(board, owner, v1, gate, isFirstShield) - s1 > TAZZA_EV_MARGIN) {
      const v2 = rollValueExcluding(rng, v1); // 타짜 재굴림 — 같은 눈만 제외(공정)
      const s2 = bestMoveScore(board, owner, v2, gate, isFirstShield);
      rolls = [v1, v2];
      usedTazza = true;
      chosen = s2 > s1 ? v2 : v1;
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
    move = pickByMonteCarlo(board, owner, chosen, moves, rng, isFirstShield);
  } else {
    move = argmaxMove(moves, (m) => scoreMove(board, owner, m, chosen, level, isFirstShield));
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
  level: AiLevel,
  shield = false
): number {
  const moves = legalMoves(board, owner, value);
  if (moves.length === 0) return -Infinity;
  let best = -Infinity;
  for (const m of moves) best = Math.max(best, scoreMove(board, owner, m, value, level, shield));
  return best;
}

// 타짜로 다시 굴렸을 때의 기대 최선 점수(현재 눈 제외 5개 균등). 높은 눈일수록 이 값이 현재보다 낮아 굴릴 이유 없음.
// shield=true면 재굴림도 쉴드(선공 첫 턴) — 그 가정으로 평가.
function rerollEV(board: Board, owner: Owner, exclude: DieValue, level: AiLevel, shield = false): number {
  let sum = 0;
  let n = 0;
  for (let v = 1 as DieValue; v <= 6; v = (v + 1) as DieValue) {
    if (v === exclude) continue;
    const s = bestMoveScore(board, owner, v, level, shield);
    if (s > -Infinity) {
      sum += s;
      n++;
    }
  }
  return n > 0 ? sum / n : -Infinity;
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

// ★5 몬테카를로: ★4 EV로 상위 K 후보만 추린 뒤, 각 후보를 게임 끝까지 얕게 롤아웃해
// 승률을 추정한다. 최선 수 + 그 승률을 함께 반환(지원모드 재사용).
function mcEvaluate(
  board: Board,
  owner: Owner,
  value: DieValue,
  moves: Move[],
  rng: () => number,
  cfg: McConfig = { topK: MC_TOPK, playouts: MC_PLAYOUTS, maxSim: MC_MAX_SIM },
  shield = false
): { move: Move; winRate: number } {
  // ★4 prior로 정렬
  const scored = moves
    .map((m) => ({ m, s: scoreMove(board, owner, m, value, 4, shield) }))
    .sort((a, b) => b.s - a.s);
  const top = scored.slice(0, Math.min(cfg.topK, scored.length));

  // 시뮬 예산 분배(전역 상한 가드). 초과 위험이면 ★4 폴백.
  const perMove = Math.min(cfg.playouts, Math.floor(cfg.maxSim / top.length));
  if (perMove < 8) return { move: top[0].m, winRate: 0.5 }; // 예산 부족 → ★4 최상위로 폴백

  const oppo = opponentOf(owner);
  const rates = top.map(({ m }) => {
    const afterMove = applyMove(board, owner, m, value, shield);
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
    return win / perMove;
  });

  // ★4 최상위(top[0])를 기본으로 두고, 롤아웃 승률이 '확실히'(MC_MARGIN) 더 높은 후보만 채택.
  // → MC 노이즈로 ★4보다 약해지는 일을 방지(★5 ≥ ★4 보장).
  let bestIdx = 0;
  for (let i = 1; i < rates.length; i++) if (rates[i] > rates[bestIdx]) bestIdx = i;
  if (bestIdx !== 0 && rates[bestIdx] - rates[0] < MC_MARGIN) bestIdx = 0;
  return { move: top[bestIdx].m, winRate: rates[bestIdx] };
}

function pickByMonteCarlo(
  board: Board,
  owner: Owner,
  value: DieValue,
  moves: Move[],
  rng: () => number,
  shield = false
): Move {
  return mcEvaluate(board, owner, value, moves, rng, undefined, shield).move;
}

// 한 진영의 '주어진 눈 1수'를 ★2 그리디로 적용(push면 기대 쉴드 4 근사 배치). 루트 expectimax의 상대 응수용.
function greedyResponse(board: Board, owner: Owner, value: DieValue, rng: () => number): Board {
  const moves = legalMoves(board, owner, value);
  if (moves.length === 0) return board; // 합법수 없음 → 패스
  let best = moves[0];
  let bestScore = -Infinity;
  for (const m of moves) {
    const after = applyMove(board, owner, m, value);
    const sc = boardScore(after, owner) + (m.kind === 'push' ? PUSH_BONUS : 0);
    if (sc > bestScore) {
      bestScore = sc;
      best = m;
    }
  }
  let next = applyMove(board, owner, best, value);
  if (best.kind === 'push') {
    const place = pickShield(next, owner, 4, 2, rng);
    if (place) next = placeDie(next, place.line, place.owner, makeDie(4, owner, true));
  }
  return next;
}

// 지원모드 전용 루트 얕은 expectimax: 후보 수마다 상대의 다음 6눈을 '정확히 전개'(샘플링 X)하고,
// 각 가지 뒤만 MC로 끝까지 롤아웃해 평균 승률을 낸다. 근거리(상대 응수)의 분산을 없애 추천이 더 안정·정확.
function advBestMove(
  board: Board,
  owner: Owner,
  value: DieValue,
  moves: Move[],
  rng: () => number,
  shield = false
): { move: Move; winRate: number } {
  const oppo = opponentOf(owner);
  let best = moves[0];
  let bestRate = -1;
  for (const m of moves) {
    // 1) 내 수 적용(push면 기대 쉴드 4 근사 배치)
    let b1 = applyMove(board, owner, m, value, shield);
    if (m.kind === 'push') {
      const pl = pickShield(b1, owner, 4, 2, rng);
      if (pl) b1 = placeDie(b1, pl.line, pl.owner, makeDie(4, owner, true));
    }
    // 2) 상대의 다음 6눈을 정확히 전개 → 각 응수 뒤(내 턴)부터 MC 롤아웃
    let acc = 0;
    for (let w = 1 as DieValue; w <= 6; w = (w + 1) as DieValue) {
      const b2 = greedyResponse(b1, oppo, w, rng);
      let win = 0;
      for (let i = 0; i < ADV_PLAYOUTS_PER_BRANCH; i++) {
        const res = simulateToEnd(b2, owner, rng);
        if (res === owner) win += 1;
        else if (res === 'draw') win += 0.5;
      }
      acc += win / ADV_PLAYOUTS_PER_BRANCH;
    }
    const rate = acc / 6; // 6눈 균등 평균(상대 굴림은 공정)
    if (rate > bestRate) {
      bestRate = rate;
      best = m;
    }
  }
  return { move: best, winRate: bestRate };
}

// ── 지원 모드(수 추천) ─────────────────────────────────
// 플레이어 관점으로 같은 평가 엔진을 돌려 '최선 수 + 여러 근거'를 만든다(난이도와 무관하게 항상 강한 조언).
// 한 줄 결론(headline) + AI가 실제로 따지는 요소들(factors: 라인별 승률·2라인 목표·취약점·타이브레이커·쉴드·상대 위협)을 분해해 보여준다.
const ADV_LINE = ['1번', '2번', '3번'];
const pct = (p: number) => `${Math.round(p * 100)}%`;

// 근거 한 줄을 카테고리로 세분화(UI에서 라벨 칩으로 그룹 표시).
// 목표=2라인 확보/우세, 위험=노출 페어 등 리스크, 자원=쉴드·캡·보호, 총합=타이브레이커, 타짜/홀드=특수기.
export type FactorTag = '목표' | '위험' | '자원' | '총합' | '타짜' | '홀드';
export interface Factor {
  tag: FactorTag;
  text: string;
}
const F = (tag: FactorTag, text: string): Factor => ({ tag, text });

export interface MoveAdvice {
  action: 'place' | 'push' | 'tazza';
  line?: LineIndex; // place/push일 때 대상 라인
  headline: string;
  factors: Factor[];
}
export interface ChooseAdvice {
  index: 0 | 1;
  headline: string;
  factors: Factor[];
}
export interface ShieldAdvice {
  line: LineIndex;
  owner: Owner;
  headline: string;
  factors: Factor[];
}
export interface HoldAdvice {
  headline: string;
  factors: Factor[];
}

function lineEVof(board: Board, owner: Owner): number {
  return LINES.reduce<number>((s, l) => s + lineWinProb(board, owner, l), 0);
}
function totalDiff(board: Board, owner: Owner): number {
  const oppo = opponentOf(owner);
  return LINES.reduce<number>((s, l) => s + lineSum(board.lines[l][owner]) - lineSum(board.lines[l][oppo]), 0);
}

// 한 수가 평가의 여러 축을 어떻게 바꾸는지 분해 → 카테고리별 근거(Factor[]).
function analyzeMove(board: Board, owner: Owner, move: Move, value: DieValue): Factor[] {
  const oppo = opponentOf(owner);
  const after = applyMove(board, owner, move, value);
  const facts: Factor[] = [];

  if (move.kind === 'push') {
    const targets = board.lines[move.line][oppo].filter((d) => !d.shield && d.value === value);
    const removed = value * (2 * targets.length - 1); // 보너스 인식 제거 점수
    const word = targets.length >= 3 ? '트리플' : targets.length === 2 ? '페어' : '단일';
    if (targets.length >= 2)
      facts.push(F('목표', `${ADV_LINE[move.line]} 라인에서 상대 ${value} ${word}(${removed}점)을 한 번에 청소해요 — 주사위 1개로 ${removed}점을 날리는 최고 템포예요. 같은 눈 스택은 한 방에 통째로 사라져요.`));
    else
      facts.push(F('목표', `${ADV_LINE[move.line]} 라인에서 상대 ${value}(${removed}점)를 제거해 상대 점수를 직접 깎아요.`));
    // 상대가 앞서던 라인을 무너뜨리는가?
    const oppLeadBefore = 1 - lineWinProb(board, owner, move.line);
    const oppLeadAfter = 1 - lineWinProb(after, owner, move.line);
    if (oppLeadBefore > 0.55)
      facts.push(F('목표', `그 라인은 상대 우세(${pct(oppLeadBefore)})였는데 ${pct(oppLeadAfter)}로 떨어져, 뺏기던 라인을 되찾을 수 있어요.`));
    facts.push(F('자원', '밀어내면 쉴드 1개를 수급해요 — 4~6은 내 주력 라인 고정에, 1~3은 상대 필드 캡에 써요. (밀어내기 1회당 쉴드 1개)'));
    // 손익 안내: 내 주사위는 소멸. 단일 저눈만 제거면 가치가 작지만, 같은 라인 매칭이라 배치는 불가(밀어내기 강제).
    if (targets.length === 1 && value <= 2)
      facts.push(F('위험', `단, 내가 굴린 ${value}는 배치되지 않고 사라져요. 단일 ${value} 제거라 이득은 작지만 — 이 라인엔 매칭값이 있어 배치가 막혀(밀어내기 강제) 다른 라인 배치와 비교한 결과예요.`));
    else
      facts.push(F('위험', `내가 굴린 ${value}는 보드에 남지 않고 사라져요(점수 배치 대신 제거+쉴드로 교환).`));
    // 제물 라인이라도 상대 고점을 줄이면 타이브레이커 손실이 준다.
    if (oppLeadBefore > 0.6 && removed >= 10)
      facts.push(F('총합', `이 라인은 내주기 쉬워도 상대 고점 ${removed}점을 깎아, 1승1무1패 시 전체 총합 타이브레이커 손실을 줄여요.`));
  } else {
    // 배치: 어느 라인 승률이 어떻게 변하나
    const b = lineWinProb(board, owner, move.line);
    const a = lineWinProb(after, owner, move.line);
    const label = ADV_LINE[move.line];
    if (b < 0.5 && a >= 0.5) facts.push(F('목표', `${label} 라인을 열세(${pct(b)})에서 우세(${pct(a)})로 뒤집어요.`));
    else if (b >= 0.8) facts.push(F('목표', `이미 우세한 ${label} 라인(${pct(b)})을 가득 채워 굳히고, 총합도 벌려두는 안전한 수예요.`));
    else if (a - b >= 0.05) facts.push(F('목표', `${label} 라인 우세를 ${pct(b)}→${pct(a)}로 키워요.`));
    else facts.push(F('목표', `${label} 라인에 보태 우세를 노려요(현재 ${pct(a)}).`));

    // 같은 눈 보너스 완성 + 노출 위험(보너스 인식)
    const sameVal = board.lines[move.line][owner].filter((d) => !d.shield && d.value === value).length;
    if (sameVal >= 1) {
      const n = sameVal + 1; // 배치 후 그 값 개수(비쉴드)
      const beforePts = value * (2 * sameVal - 1);
      const nowPts = value * (2 * n - 1);
      const pairWord = n >= 3 ? '트리플' : '페어';
      facts.push(F('목표', `이 라인 ${value}에 더해 ${pairWord} 완성(${value}×${2 * n - 1} = ${nowPts}점, +${nowPts - beforePts}) — 같은 눈 보너스로 점수가 크게 올라요.`));
      if (board.lines[move.line][oppo].length < 3)
        facts.push(F('위험', `비쉴드 ${pairWord}라 상대가 ${value} 하나만 굴리면 ${nowPts}점이 통째로 밀려요. 상대 필드를 캡으로 채우거나 쉴드로 덮으면 안전해져요.`));
      else
        facts.push(F('자원', `상대 필드가 이미 꽉 차 이 라인에선 상대가 밀 수 없어요 — 안전지대의 ${pairWord}예요.`));
    } else if (value <= 2 && a < 0.4) {
      facts.push(F('목표', `낮은 눈은 이 제물 라인에 버리고, 주력 2라인 슬롯은 고눈/쉴드용으로 아껴요.`));
      facts.push(F('자원', `팁: AI는 알까기가 가능하면 거의 항상 청소해요 — 낮은 수(1·2·3)를 이 라인에 모아두면 AI가 그 값을 굴렸을 때 청소에 턴을 낭비하도록 유도할 수 있어요.`));
    }

    // 왜 알까기 대신 배치인가 — 같은 값으로 알까기가 가능했는데도 배치가 더 나은 이유(저점 청소·변수 회피).
    const pushLine = LINES.find((l) => canPush(board, l, owner, value));
    if (pushLine !== undefined) {
      const stk = board.lines[pushLine][oppo].filter((d) => !d.shield && d.value === value);
      const stkPts = value * (2 * stk.length - 1);
      const pword = stk.length >= 3 ? '트리플' : stk.length === 2 ? '페어' : '단일';
      if (stkPts <= 9)
        facts.push(F('위험', `${ADV_LINE[pushLine]} 라인 상대 ${value} ${pword}(${stkPts}점) 알까기도 가능하지만 — 낮은 청소에 ${value}를 소모하기보단 이 배치가 승률이 높아요(높은 눈 낭비·불필요한 변수 회피).`));
      else
        facts.push(F('위험', `${ADV_LINE[pushLine]} 라인 알까기도 가능하지만, 끝까지 계산하면 이 배치가 승률이 더 높아요(자원 보존·2라인 집중).`));
    }

    // 필드잠금 안내: 이 배치로 내 필드가 꽉 차면 그 라인 밀어내기·쉴드 수급 권리를 잃는다.
    const myLenAfter = board.lines[move.line][owner].length + 1;
    const oppPushable = board.lines[move.line][oppo].some((d) => !d.shield);
    if (myLenAfter === 3 && oppPushable && board.lines[move.line][oppo].length < 3)
      facts.push(F('자원', `참고: 이 배치로 내 ${label} 필드가 꽉 차 이 라인에선 더 못 밀어요(쉴드 수급도 끊김). 밀 거리가 더 남았다면 한 칸 비워두는 편이 나을 수 있어요.`));
  }

  // 2라인 목표 근접도(기대 승리 라인 수)
  const evB = lineEVof(board, owner);
  const evA = lineEVof(after, owner);
  if (evA - evB >= 0.12)
    facts.push(F('목표', `기대 승리 라인이 ${evB.toFixed(1)} → ${evA.toFixed(1)}로 늘어, 핵심 목표인 '2라인 확보'에 가까워져요.`));

  // 타이브레이커(전체 총합)
  const tD = totalDiff(after, owner) - totalDiff(board, owner);
  if (tD >= 3)
    facts.push(F('총합', `전체 총합 우세가 +${tD.toFixed(0)} 벌어져, 1승1무1패 같은 접전에선 타이브레이커가 유리해져요.`));

  // 근거가 너무 빈약하면 현재 판세를 한 줄 덧붙임.
  if (facts.length < 2)
    facts.push(F('목표', `지금 기대 승리 라인은 ${evA.toFixed(1)}개 — 다른 라인은 더 둘 자리가 없거나 이득이 적어 이 수가 최선이에요.`));

  return facts;
}

function moveHeadline(move: Move): string {
  return move.kind === 'push' ? `${ADV_LINE[move.line]} 라인 밀어내기` : `${ADV_LINE[move.line]} 라인에 배치`;
}

// 상대 페어/트리플 중, 굴려서 매칭하면(밀어내기 가능) 가장 점수가 큰 청소 대상. (타짜로 노릴 값 제안용)
function bestCleanTarget(
  board: Board,
  owner: Owner
): { line: LineIndex; value: DieValue; count: number; points: number } | null {
  const oppo = opponentOf(owner);
  let best: { line: LineIndex; value: DieValue; count: number; points: number } | null = null;
  for (const line of LINES) {
    const counts = new Map<DieValue, number>();
    for (const d of board.lines[line][oppo]) {
      if (d.shield) continue;
      counts.set(d.value, (counts.get(d.value) ?? 0) + 1);
    }
    for (const [value, count] of counts) {
      if (count < 2) continue; // 페어 이상만
      if (!canPush(board, line, owner, value)) continue; // 내 필드 잠금이면 제외
      const points = value * (2 * count - 1);
      if (!best || points > best.points) best = { line, value, count, points };
    }
  }
  return best;
}

// 굴린 값에 대한 추천 수(+근거들). 타짜 사용 가능하고 지금 수가 시원찮으면 타짜를 권한다.
export function recommendMove(
  board: Board,
  owner: Owner,
  rolledValue: DieValue,
  tazzaAvailable: boolean
): MoveAdvice | null {
  const moves = legalMoves(board, owner, rolledValue);
  if (moves.length === 0) return null;
  // 실제 최선 수: 루트 얕은 expectimax(상대 6눈 전수) + 끝까지 MC. 근거리 분산을 없애 가장 안정적.
  const best = advBestMove(board, owner, rolledValue, moves, Math.random).move;

  // 타짜: 다시 굴렸을 때 기대 이득이 충분할 때만 권한다(6 같은 높은 눈은 권하지 않음).
  if (tazzaAvailable) {
    const s1 = bestMoveScore(board, owner, rolledValue, 3);
    const ev = rerollEV(board, owner, rolledValue, 3);
    if (ev - s1 > TAZZA_EV_MARGIN) {
      const factors: Factor[] = [
        F('타짜', `지금 ${rolledValue} 눈으로 둘 수 있는 최선 수가 시원찮아요.`),
        F('타짜', `다시 굴리면 기대 이득이 약 +${(ev - s1).toFixed(0)}점 더 높아요 — ${rolledValue}은(는) 흘려보내기 아까운 눈이에요.`),
        F('타짜', '타짜는 게임당 1번뿐 — 지금처럼 더 나은 눈을 노릴 만할 때 쓰는 게 좋아요.'),
      ];
      // 노릴 값: 다시 굴려 나오면 상대 페어/트리플을 청소할 수 있는 가장 가치 큰 매칭값.
      const fish = bestCleanTarget(board, owner);
      if (fish)
        factors.push(F('타짜', `특히 ${fish.value}이 나오면 ${ADV_LINE[fish.line]} 라인 상대 ${fish.value} ${fish.count >= 3 ? '트리플' : '페어'}(${fish.points}점)을 청소할 수 있어요.`));
      return { action: 'tazza', headline: '타짜로 다시 굴리기', factors };
    }
  }
  return { action: best.kind, line: best.line, headline: moveHeadline(best), factors: analyzeMove(board, owner, best, rolledValue) };
}

// 타짜로 둘을 굴렸을 때 어느 쪽을 고를지(+근거들).
export function recommendChoose(
  board: Board,
  owner: Owner,
  choices: [DieValue, DieValue]
): ChooseAdvice {
  // 각 후보 눈을 깊은 몬테카를로로 끝까지 시뮬해 승률로 비교(실제 최선).
  const evalOf = (v: DieValue): { move: Move | null; winRate: number } => {
    const ms = legalMoves(board, owner, v);
    if (ms.length === 0) return { move: null, winRate: -1 };
    return advBestMove(board, owner, v, ms, Math.random);
  };
  const e0 = evalOf(choices[0]);
  const e1 = evalOf(choices[1]);
  const index: 0 | 1 = e1.winRate > e0.winRate ? 1 : 0;
  const chosen = choices[index];
  const other = choices[index === 0 ? 1 : 0];
  const chosenEval = index === 0 ? e0 : e1;
  const factors: Factor[] = [
    F('목표', `${chosen} 쪽 승률이 ${other}보다 약 ${pct(Math.abs(e1.winRate - e0.winRate))} 높아요(끝까지 시뮬 비교).`),
  ];
  if (chosenEval.move) factors.push(...analyzeMove(board, owner, chosenEval.move, chosen));
  return { index, headline: `${chosen}를 선택`, factors };
}

// 밀어내고 얻은 쉴드를 어디 둘지(+근거들).
export function recommendShield(
  board: Board,
  owner: Owner,
  shieldValue: DieValue
): ShieldAdvice | null {
  const place = pickShield(board, owner, shieldValue, 5, () => 0);
  if (!place) return null;
  const oppo = opponentOf(owner);
  const label = ADV_LINE[place.line];
  const factors: Factor[] = [];
  if (place.owner === oppo) {
    const oppLen = board.lines[place.line][oppo].length;
    factors.push(F('자원', `상대 ${label} 라인 슬롯을 한 칸 영구 봉쇄(캡)해요 — 쉴드라 상대가 도로 밀어낼 수도 없어요.`));
    factors.push(F('위험', `상대 슬롯 3→2칸으로 줄어 트리플(최대 30점) 가능성을 차단하고 페어(18점) 이하로 묶어요. 낮은 값(${shieldValue})이라 상대 점수도 거의 안 줘요.`));
    if (oppLen >= 2) factors.push(F('자원', `그 라인은 상대가 거의 다 채운 상태라, 막으면 추가 고점을 효과적으로 봉쇄해요.`));
  } else {
    factors.push(F('자원', `내 ${label} 라인에 쉴드(${shieldValue})를 둬서 합을 ${shieldValue}만큼 올려요.`));
    factors.push(F('자원', `쉴드는 상대가 밀어낼 수 없어요 — 우세 라인을 밀리지 않는 '확정' 리드로 굳히는 안전한 배치예요.`));
    // 라인 역할: 주력(우세) 라인이면 고정 가치가 크고, 노출 페어가 있으면 그걸 보호한다.
    const p = lineWinProb(board, owner, place.line);
    const exposedPair = maxPushLoss(board.lines[place.line][owner]) >= 10 && board.lines[place.line][oppo].length < 3;
    if (exposedPair)
      factors.push(F('자원', `이 라인엔 밀릴 수 있는 비쉴드 고점이 있어, 쉴드를 더해 두면 상대 청소에 덜 휘둘려요.`));
    else if (p >= 0.55)
      factors.push(F('목표', `이 ${label} 라인은 내가 노리는 주력 라인이라, 밀리지 않는 ${shieldValue}로 리드를 굳히기 좋아요.`));
    // 낮은 쉴드를 내 필드에 두는 건 차선(원래 1~3은 상대 캡이 정석) — 둘 자리가 여기뿐이라 안내.
    if (shieldValue <= 3)
      factors.push(F('위험', `참고: 낮은 쉴드(${shieldValue})는 원래 상대 필드 캡이 정석이에요. 지금은 캡 자리가 마땅찮아 내 필드에 두는 거예요.`));
  }
  return { line: place.line, owner: place.owner, headline: place.owner === oppo ? `상대 ${label} 라인에 쉴드(캡)` : `내 ${label} 라인에 쉴드`, factors };
}

// 선공 첫 쉴드 추천 — 첫 턴은 보드가 비어 밀어내기 불가라 '내 필드'에만 둔다(쉴드는 밀리지 않음).
// 값에 따라: 고점(4~6)이면 그 라인을 주력으로 선언, 저점(1~3)이면 제물 라인 방향에 두고 주력은 이후 고눈 라인으로.
export function recommendFirstShield(
  board: Board,
  owner: Owner,
  value: DieValue,
  tazzaAvailable: boolean
): ShieldAdvice | null {
  const line = LINES.find((l) => board.lines[l][owner].length < 3);
  if (line === undefined) return null;
  const high = value >= 4;
  const factors: Factor[] = [
    F('자원', `선공 첫 주사위는 쉴드라 밀리지 않아요. 첫 턴은 보드가 비어 밀어내기가 없으니 내 필드에 둬요.`),
    high
      ? F('목표', `${value}는 고점이라 이 라인을 주력 라인으로 잡고 시작하기 좋아요 — 밀리지 않는 ${value}로 리드를 미리 고정해요.`)
      : F('위험', `${value}는 낮아 주력 슬롯에 쓰기 아까워요. 제물 라인 방향에 두고, 주력은 이후 5·6이 들어오는 라인으로 잡으세요.`),
  ];
  // 첫 쉴드가 많이 낮으면 타짜가 꽤 좋다 — 선공 첫 턴이라 재굴림도 쉴드로 나오므로 더 높은 앵커를 노릴 수 있다.
  if (value <= 2 && tazzaAvailable)
    factors.push(
      F('타짜', `${value}처럼 낮으면 타짜로 다시 굴리는 게 좋아요 — 선공 첫 턴이라 재굴림도 쉴드로 나와서, 더 높은 '밀리지 않는' 앵커를 노릴 수 있어요. 단 타짜는 게임당 1번뿐이라 이 이득이 클 때만 쓰세요.`)
    );
  return { line, owner, headline: `내 ${ADV_LINE[line]} 라인에 쉴드(${value})`, factors };
}

// 한 라인의 한 진영이 빈 슬롯을 '최선으로' 채웠을 때의 최대 점수(같은 눈 보너스 인식).
// 한 값에 몰아 쌓는 것이 보너스 배수를 극대화하므로 1~6 각 값으로 스택해 본 최댓값.
function maxFillSum(field: Field, emptySlots: number): number {
  if (emptySlots <= 0) return lineSum(field);
  let best = 0;
  for (let v = 1 as DieValue; v <= 6; v = (v + 1) as DieValue) {
    const filled = [...field, ...Array.from({ length: emptySlots }, () => makeDie(v, 'ai', false))];
    const s = lineSum(filled);
    if (s > best) best = s;
  }
  return best;
}

// 홀드 추천(지원 모드 전용). 거짓 양성(지는 홀드)이 최악이라 '확실히 고정'됐을 때만 발동.
// 2개 이상 라인이, 상대가 내 비쉴드 스택을 밀어내고(동시에) 남은 칸을 최대로 채워도 못 뒤집을 때만.
export function recommendHold(board: Board, owner: Owner): HoldAdvice | null {
  const oppo = opponentOf(owner);
  const r = evaluate(board, false);
  const myWins = owner === 'me' ? r.meLineWins : r.aiLineWins;
  if (myWins < 2) return null;

  const locked: LineIndex[] = [];
  for (const line of LINES) {
    const mine = board.lines[line][owner];
    const opp = board.lines[line][oppo];
    if (lineSum(mine) <= lineSum(opp)) continue; // 지금 이기는 라인만
    const myFloor = lineSum(mine) - maxPushLoss(mine); // 상대가 내 최대 비쉴드 스택을 밀어내도
    const aiCeil = maxFillSum(opp, 3 - opp.length); // 상대가 남은 칸을 최대로 채워도
    if (myFloor > aiCeil) locked.push(line); // 두 최악을 동시에 가정 → 보수적
  }
  if (locked.length < 2) return null;

  const labels = locked.slice(0, 2).map((l) => ADV_LINE[l]).join(', ');
  return {
    headline: '지금 홀드하세요',
    factors: [
      F('홀드', `${labels} 라인을 이미 이기고 있고, 그 리드가 쉴드/필드잠금으로 고정돼 있어요.`),
      F('홀드', `상대가 남은 슬롯을 최선으로 채우거나 내 비쉴드 주사위를 밀어내도 이 2라인은 뒤집히지 않아요.`),
      F('위험', `더 던질수록 내 비쉴드 주사위가 밀릴 위험만 커져요. 강제 알까기로 괜한 변수를 만들 바엔 홀드로 판을 닫는 게 안전해요.`),
      F('홀드', `홀드는 AI가 못 쓰는 비대칭 카드예요(AI는 계속 던집니다).`),
    ],
  };
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
