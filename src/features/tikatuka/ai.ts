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
  rollValueExcluding,
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

const FILL = 3.5; // 빈 슬롯 기대 충원값(주사위 평균 1~6)
const VAR_PER_SLOT = 2.9; // 주사위 분산 근사(남은 슬롯이 만드는 불확실성)
const PUSH_BONUS = 10; // 밀어내기로 얻는 쉴드의 기대 가치(근사)
const TAZZA_GATE = 30; // ★3+: v1의 위치 개선 이득이 이 값 미만이면 타짜로 다시 굴림
const VULN_W = 1.6; // 같은 값 스택이 한 번의 밀어내기에 통째로 날아갈 위험 가중

function sumv(field: { value: number }[]): number {
  let s = 0;
  for (const d of field) s += d.value;
  return s;
}

// 한 번의 밀어내기로 사라질 수 있는 '최대 동일값 묶음'(쉴드 제외) — 같은 눈을 쌓을수록 위험.
function maxPushableStack(field: { value: number; shield: boolean }[]): number {
  const byVal = new Map<number, number>();
  for (const d of field) {
    if (d.shield) continue;
    byVal.set(d.value, (byVal.get(d.value) ?? 0) + d.value);
  }
  let max = 0;
  for (const s of byVal.values()) if (s > max) max = s;
  return max;
}

// 한 라인의 '기대 승리확률'(owner 관점). 남은 슬롯이 평균값으로 채워진다고 보고 margin을 로지스틱으로.
function lineWinProb(board: Board, owner: Owner, line: LineIndex): number {
  const oppo = opponentOf(owner);
  const mine = board.lines[line][owner];
  const opp = board.lines[line][oppo];
  const mySlots = 3 - mine.length;
  const oppSlots = 3 - opp.length;
  const margin = sumv(mine) + mySlots * FILL - (sumv(opp) + oppSlots * FILL);
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
  let tiebreak = 0; // 실현 총합 우세(타이브레이커용)
  let myVuln = 0; // 내 약점: 상대가 밀어낼 수 있는 동일값 스택
  let oppVuln = 0; // 상대 약점: 내가 밀어낼 수 있는 동일값 스택

  for (const line of LINES) {
    const mine = board.lines[line][owner];
    const opp = board.lines[line][oppo];
    const p = lineWinProb(board, owner, line);
    lineEV += p;
    if (p > 0.9) secured++;
    if (p < 0.1) lost++;
    tiebreak += sumv(mine) - sumv(opp);
    // 밀어내기는 공격자 필드에 빈칸이 있어야 가능(필드락). 같은 눈을 쌓을수록 한 방에 날아갈 위험.
    if (opp.length < 3) myVuln += maxPushableStack(mine); // 상대가 이 라인을 밀 수 있음
    if (mine.length < 3) oppVuln += maxPushableStack(opp); // 내가 이 라인을 밀 수 있음
  }

  // 2라인 확보가 목표. 확정 2라인이면 큰 보너스, 2라인 패배면 큰 감점.
  let score = lineEV * 100;
  if (secured >= 2) score += 350;
  if (lost >= 2) score -= 350;
  if (lineEV >= 1.6) score += 50; // 2라인 기대 근접 가산
  score += tiebreak * 1.2; // 타이브레이커는 약하게
  score -= myVuln * VULN_W; // 내 스택이 밀릴 위험은 감점(분산·쉴드 유도)
  score += oppVuln * VULN_W; // 상대 스택을 밀 기회는 가점
  return score;
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
const MC_PLAYOUTS = 120;
const MC_MAX_SIM = 480;
const MC_MARGIN = 0.04; // ★5: 롤아웃 승률이 ★4 최상위를 이 정도 넘어야 선택을 뒤집음
const ROLLOUT_MAX_TURNS = 80;

// 난이도 보정(★3+) — 밀어내기 로직은 건드리지 않고, '높은 눈이 나올 확률'만 레벨에 따라 살짝 가중.
// AI 굴림에만 적용(플레이어는 공정). weight(v) = 1 + k*(v-3.5). ★0~2는 공정(k=0).
// P(5 또는 6): 공정 33% → ★3 ~36% → ★4 ~39% → ★5 ~42%.
const BIAS_K: Record<AiLevel, number> = { 0: 0, 1: 0, 2: 0, 3: 0.04, 4: 0.08, 5: 0.13 };

// AI의 모든 굴림에 적용. exclude 지정 시 그 눈은 제외(타짜 재굴림 — 같은 눈 방지).
function biasedRoll(level: AiLevel, rng: () => number, exclude?: DieValue): DieValue {
  const k = BIAS_K[level];
  if (k === 0) return exclude == null ? rollValue(rng) : rollValueExcluding(rng, exclude);
  const w = [0, 0, 0, 0, 0, 0];
  let total = 0;
  for (let v = 1; v <= 6; v++) {
    const wv = v === exclude ? 0 : 1 + k * (v - 3.5); // k<0.4면 항상 양수
    w[v - 1] = wv;
    total += wv;
  }
  let r = rng() * total;
  for (let v = 1 as DieValue; v <= 6; v = (v + 1) as DieValue) {
    r -= w[v - 1];
    if (r < 0) return v;
  }
  return (exclude === 6 ? 5 : 6) as DieValue;
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
  owner: Owner = 'ai'
): AiTurn | null {
  // 1) 첫 굴림 — ★3+는 높은 눈 확률을 살짝 가중(밀어내기 로직은 그대로).
  const v1 = biasedRoll(level, rng);

  // 2) 타짜 사용 판단(★3+, 미사용, 이미 2라인 승 아님)
  const ev = evaluate(board, false);
  const winsNow = owner === 'me' ? ev.meLineWins : ev.aiLineWins;
  const canTazza = level >= 3 && !tazzaUsed && winsNow < 2;
  let rolls: DieValue[] = [v1];
  let usedTazza = false;
  let chosen = v1;

  if (canTazza) {
    // 일관 평가(boardScore 기반, gate=min(level,3))로 v1의 '이득'을 측정.
    const gate = Math.min(level, 3) as AiLevel;
    const base = boardScore(board, owner);
    const s1 = bestMoveScore(board, owner, v1, gate);
    // v1을 둬도 위치가 별로 나아지지 않으면(이득<문턱) 한 번 더 굴려 더 나은 값을 채택.
    if (s1 - base < TAZZA_GATE) {
      const v2 = biasedRoll(level, rng, v1); // 타짜 재굴림 — 같은 눈 제외 + 높은 눈 가중
      const s2 = bestMoveScore(board, owner, v2, gate);
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
  const rates = top.map(({ m }) => {
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
    return win / perMove;
  });

  // ★4 최상위(top[0])를 기본으로 두고, 롤아웃 승률이 '확실히'(MC_MARGIN) 더 높은 후보만 채택.
  // → MC 노이즈로 ★4보다 약해지는 일을 방지(★5 ≥ ★4 보장).
  let bestIdx = 0;
  for (let i = 1; i < rates.length; i++) if (rates[i] > rates[bestIdx]) bestIdx = i;
  if (bestIdx !== 0 && rates[bestIdx] - rates[0] < MC_MARGIN) bestIdx = 0;
  return top[bestIdx].m;
}

// ── 지원 모드(수 추천) ─────────────────────────────────
// 플레이어 관점으로 같은 평가 엔진을 돌려 '최선 수 + 여러 근거'를 만든다(난이도와 무관하게 항상 강한 조언).
// 한 줄 결론(headline) + AI가 실제로 따지는 요소들(factors: 라인별 승률·2라인 목표·취약점·타이브레이커·쉴드·상대 위협)을 분해해 보여준다.
const ADV_LINE = ['1번', '2번', '3번'];
const pct = (p: number) => `${Math.round(p * 100)}%`;

export interface MoveAdvice {
  action: 'place' | 'push' | 'tazza';
  line?: LineIndex; // place/push일 때 대상 라인
  headline: string;
  factors: string[];
}
export interface ChooseAdvice {
  index: 0 | 1;
  headline: string;
  factors: string[];
}
export interface ShieldAdvice {
  line: LineIndex;
  owner: Owner;
  headline: string;
  factors: string[];
}

function lineEVof(board: Board, owner: Owner): number {
  return LINES.reduce((s, l) => s + lineWinProb(board, owner, l), 0);
}
function totalDiff(board: Board, owner: Owner): number {
  const oppo = opponentOf(owner);
  return LINES.reduce((s, l) => s + sumv(board.lines[l][owner]) - sumv(board.lines[l][oppo]), 0);
}

// 한 수가 평가의 여러 축을 어떻게 바꾸는지 분해 → 근거 문장들.
function analyzeMove(board: Board, owner: Owner, move: Move, value: DieValue): string[] {
  const oppo = opponentOf(owner);
  const after = applyMove(board, owner, move, value);
  const facts: string[] = [];

  if (move.kind === 'push') {
    const targets = board.lines[move.line][oppo].filter((d) => !d.shield && d.value === value);
    const sum = targets.reduce((a, d) => a + d.value, 0);
    facts.push(`${ADV_LINE[move.line]} 라인에서 상대 ${value} ${targets.length}개(합 ${sum})를 제거해 상대 점수를 직접 깎아요.`);
    // 상대가 앞서던 라인을 무너뜨리는가?
    const oppLeadBefore = 1 - lineWinProb(board, owner, move.line);
    const oppLeadAfter = 1 - lineWinProb(after, owner, move.line);
    if (oppLeadBefore > 0.55)
      facts.push(`그 라인은 상대 우세(${pct(oppLeadBefore)})였는데 ${pct(oppLeadAfter)}로 떨어져, 뺏기던 라인을 되찾을 수 있어요.`);
    facts.push('밀어내면 쉴드 1개를 얻어요 — 상대 라인을 캡하거나 내 주사위를 보호할 자원이 생겨요.');
  } else {
    // 배치: 어느 라인 승률이 어떻게 변하나
    const b = lineWinProb(board, owner, move.line);
    const a = lineWinProb(after, owner, move.line);
    if (b < 0.5 && a >= 0.5)
      facts.push(`${ADV_LINE[move.line]} 라인을 열세(${pct(b)})에서 우세(${pct(a)})로 뒤집어요.`);
    else if (a - b >= 0.05) facts.push(`${ADV_LINE[move.line]} 라인 우세를 ${pct(b)}→${pct(a)}로 키워요.`);
    else facts.push(`${ADV_LINE[move.line]} 라인 합을 높여 우세를 노려요(${pct(a)}).`);

    // 같은 값 스택 취약점 경고
    const sameVal = board.lines[move.line][owner].filter((d) => !d.shield && d.value === value).length;
    if (sameVal >= 1 && board.lines[move.line][oppo].length < 3)
      facts.push(`참고: 이 라인엔 이미 ${value}가 있어, 더 쌓으면 상대가 ${value} 한 번에 둘 다 밀어낼 위험이 있어요(그래도 지금은 이 배치 이득이 더 큼).`);
  }

  // 2라인 목표 근접도(기대 승리 라인 수)
  const evB = lineEVof(board, owner);
  const evA = lineEVof(after, owner);
  if (evA - evB >= 0.12)
    facts.push(`기대 승리 라인이 ${evB.toFixed(1)} → ${evA.toFixed(1)}로 늘어, 핵심 목표인 '2라인 확보'에 가까워져요.`);

  // 타이브레이커(전체 총합)
  const tD = totalDiff(after, owner) - totalDiff(board, owner);
  if (tD >= 3)
    facts.push(`전체 총합 우세가 +${tD.toFixed(0)} 벌어져, 1승1무1패 같은 접전에선 타이브레이커가 유리해져요.`);

  return facts;
}

function moveHeadline(move: Move): string {
  return move.kind === 'push' ? `${ADV_LINE[move.line]} 라인 밀어내기` : `${ADV_LINE[move.line]} 라인에 배치`;
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
  const best = argmaxMove(moves, (m) => scoreMove(board, owner, m, rolledValue, 5));

  if (tazzaAvailable && best.kind !== 'push') {
    const base = boardScore(board, owner);
    const gain = bestMoveScore(board, owner, rolledValue, 3) - base;
    if (gain < TAZZA_GATE) {
      const factors = [
        `지금 ${rolledValue} 눈으로 둘 수 있는 최선 수의 위치 개선 이득이 작아요(약 ${Math.max(0, gain).toFixed(0)}점).`,
        '밀어낼 상대 주사위도 없어, 이 눈은 그냥 흘려보내기 아까운 턴이에요.',
        '타짜로 다시 굴리면 평균적으로 더 높은/유용한 눈을 얻을 기대값이 커요(게임당 1회뿐이니 지금처럼 애매할 때가 적기).',
      ];
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
  const s0 = bestMoveScore(board, owner, choices[0], 5);
  const s1 = bestMoveScore(board, owner, choices[1], 5);
  const index: 0 | 1 = s1 > s0 ? 1 : 0;
  const chosen = choices[index];
  const other = choices[index === 0 ? 1 : 0];
  const moves = legalMoves(board, owner, chosen);
  const factors: string[] = [`${chosen} 쪽이 ${other}보다 평가 점수가 높아요(약 ${Math.abs(s1 - s0).toFixed(0)}점 차).`];
  if (moves.length > 0)
    factors.push(...analyzeMove(board, owner, argmaxMove(moves, (m) => scoreMove(board, owner, m, chosen, 5)), chosen));
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
  const factors: string[] = [];
  if (place.owner === oppo) {
    const oppLen = board.lines[place.line][oppo].length;
    factors.push(`상대 ${label} 라인에 쉴드(${shieldValue})를 둬서 슬롯을 한 칸 막아요(캡).`);
    factors.push(`낮은 값일수록 캡이 강해요 — 상대가 그 칸에 큰 수를 넣을 기회를 빼앗아 그 라인 상한을 눌러요.`);
    if (oppLen >= 2) factors.push(`그 라인은 상대가 거의 다 채운 상태라, 막으면 추가 득점을 효과적으로 차단해요.`);
  } else {
    factors.push(`내 ${label} 라인에 쉴드(${shieldValue})를 둬서 합을 ${shieldValue}만큼 올려요.`);
    factors.push(`쉴드는 상대가 밀어낼 수 없어요 — 우세 라인을 '확정'으로 굳히는 안전한 배치예요.`);
  }
  return { line: place.line, owner: place.owner, headline: place.owner === oppo ? `상대 ${label} 라인에 쉴드(캡)` : `내 ${label} 라인에 쉴드`, factors };
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
