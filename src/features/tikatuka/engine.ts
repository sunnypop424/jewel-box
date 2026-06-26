// 티카투카 규칙 엔진 — 순수 함수 모듈(부작용 없음, immutable).
// UI·AI·자동홀드 판정이 전부 legalMoves/legalShieldPlacements를 공유 → 규칙 누락 구조적 차단.
// 난수는 항상 인자(rng: () => number)로 주입해 테스트 결정론 확보.

import type {
  Board,
  Die,
  DieValue,
  Field,
  LineIndex,
  LineResult,
  Move,
  Owner,
  ResultDetail,
  ShieldPlacement,
} from './types';

export const MAX_PER_FIELD = 3;
const LINES: LineIndex[] = [0, 1, 2];

export function opponentOf(owner: Owner): Owner {
  return owner === 'me' ? 'ai' : 'me';
}

export function createEmptyBoard(): Board {
  return {
    lines: [
      { me: [], ai: [] },
      { me: [], ai: [] },
      { me: [], ai: [] },
    ],
  };
}

export function fieldOf(board: Board, line: LineIndex, owner: Owner): Field {
  return board.lines[line][owner];
}

export function isFieldFull(board: Board, line: LineIndex, owner: Owner): boolean {
  return fieldOf(board, line, owner).length >= MAX_PER_FIELD;
}

// 한 진영(me 또는 ai)의 3개 필드가 모두 가득 찼는가 (플레이어 홀드 시 종료 판정용).
export function isOwnerFull(board: Board, owner: Owner): boolean {
  return LINES.every((l) => isFieldFull(board, l, owner));
}

// 6개 필드가 모두 가득 찼는가.
export function isBoardFull(board: Board): boolean {
  return isOwnerFull(board, 'me') && isOwnerFull(board, 'ai');
}

// 필드 합 — 쉴드 포함, 그리고 더블/트리플 보너스 적용.
// 같은 눈 n개 = 값 × (2n−1)  (2개=1개분 추가 → ×3, 3개=2개분 추가 → ×5).
// 예: [5,5]=15, [5,5,5]=25.
export function lineSum(field: Field): number {
  const counts = new Map<number, number>();
  for (const d of field) counts.set(d.value, (counts.get(d.value) ?? 0) + 1);
  let sum = 0;
  for (const [value, n] of counts) sum += value * (2 * n - 1);
  return sum;
}

export function lineResult(board: Board, line: LineIndex): LineResult {
  const meSum = lineSum(board.lines[line].me);
  const aiSum = lineSum(board.lines[line].ai);
  const winner: Owner | 'tie' = meSum > aiSum ? 'me' : aiSum > meSum ? 'ai' : 'tie';
  return { meSum, aiSum, winner };
}

// 보드 위 전체 주사위 개수(양 진영·쉴드 포함) — 티카투카 베팅 선언 조건(10개+) 판정용.
export function totalDice(board: Board): number {
  let n = 0;
  for (const line of board.lines) n += line.me.length + line.ai.length;
  return n;
}

// 승패·타이브레이커 일괄 계산(쉴드 포함). 티카투카 보너스는 reducer가 주입.
// tikatukaUsed: 하위호환으로 boolean(=me 선언)도 허용, 신규는 {me,ai} 맵.
export function evaluate(
  board: Board,
  tikatukaUsed: boolean | { me: boolean; ai: boolean } = false
): ResultDetail {
  const declared =
    typeof tikatukaUsed === 'boolean' ? { me: tikatukaUsed, ai: false } : tikatukaUsed;
  const lines = LINES.map((l) => lineResult(board, l)) as [
    LineResult,
    LineResult,
    LineResult,
  ];
  const meLineWins = lines.filter((r) => r.winner === 'me').length;
  const aiLineWins = lines.filter((r) => r.winner === 'ai').length;
  const meTotal = lines.reduce((s, r) => s + r.meSum, 0);
  const aiTotal = lines.reduce((s, r) => s + r.aiSum, 0);

  let winner: Owner | 'draw';
  if (meLineWins >= 2) winner = 'me';
  else if (aiLineWins >= 2) winner = 'ai';
  else {
    // 1승1패1무(또는 그 외 2라인 미달) → 전체 총합 타이브레이커
    if (meTotal > aiTotal) winner = 'me';
    else if (aiTotal > meTotal) winner = 'ai';
    else winner = 'draw';
  }

  return {
    lines,
    meLineWins,
    aiLineWins,
    meTotal,
    aiTotal,
    tikatukaBonus: (winner === 'me' || winner === 'ai') && declared[winner],
    winner,
  };
}

// ── 굴림 ──────────────────────────────────────────────
export function rollValue(rng: () => number): DieValue {
  return (Math.floor(rng() * 6) + 1) as DieValue;
}

// exclude를 제외한 나머지 5개 눈에서 균등 굴림(타짜 재굴림 — 같은 눈 방지용).
export function rollValueExcluding(rng: () => number, exclude: DieValue): DieValue {
  return (((exclude + Math.floor(rng() * 5)) % 6) + 1) as DieValue;
}

let _idSeq = 0;
export function makeDie(value: DieValue, owner: Owner, shield: boolean): Die {
  _idSeq += 1;
  return { id: `d${_idSeq}`, value, shield, owner };
}

// ── 배치 ──────────────────────────────────────────────
// 비쉴드 주사위는 자기 필드에만, 쉴드는 어느 필드든. 둘 다 빈 슬롯 필요.
export function canPlace(
  board: Board,
  line: LineIndex,
  targetOwner: Owner,
  actor: Owner,
  isShield: boolean
): boolean {
  if (isFieldFull(board, line, targetOwner)) return false;
  if (isShield) return true; // 쉴드는 내/상대 필드 모두 가능
  return targetOwner === actor; // 비쉴드는 자기 필드에만
}

export function placeDie(
  board: Board,
  line: LineIndex,
  targetOwner: Owner,
  die: Die
): Board {
  const next = cloneBoard(board);
  next.lines[line][targetOwner] = [...next.lines[line][targetOwner], die];
  return next;
}

// ── 밀어내기(공격) ────────────────────────────────────
// 같은 라인 상대 필드에서 굴린 값과 매칭되는 비쉴드 주사위를 밀어낼 수 있는가.
// 필드잠금: 공격자 자기 필드가 그 라인에서 가득 차면 불가(주인만 막힘 — 대칭 적용).
export function canPush(
  board: Board,
  line: LineIndex,
  attacker: Owner,
  rolledValue: DieValue
): boolean {
  if (isFieldFull(board, line, attacker)) return false; // 필드잠금(주인만)
  return pushTargets(board, line, attacker, rolledValue).length > 0;
}

// 밀어낼 대상들: 같은 라인 상대 필드의 동일 값 주사위 전부(쉴드 제외).
export function pushTargets(
  board: Board,
  line: LineIndex,
  attacker: Owner,
  rolledValue: DieValue
): Die[] {
  const defender = opponentOf(attacker);
  return fieldOf(board, line, defender).filter(
    (d) => !d.shield && d.value === rolledValue
  );
}

// 밀어내기 적용: 매칭 주사위 전부 영구 제거. 굴린 주사위는 보드에 넣지 않음(소멸).
// 쉴드 1개 획득은 reducer가 별도 처리(placingShield 서브스텝).
export function applyPush(
  board: Board,
  line: LineIndex,
  attacker: Owner,
  rolledValue: DieValue
): { board: Board; removedCount: number } {
  const defender = opponentOf(attacker);
  const before = fieldOf(board, line, defender);
  const after = before.filter((d) => d.shield || d.value !== rolledValue);
  const next = cloneBoard(board);
  next.lines[line][defender] = after;
  return { board: next, removedCount: before.length - after.length };
}

// ── 합법수 생성기(단일 진리원) ────────────────────────
// 굴린 값이 같은 라인 상대 필드와 매칭되면 밀어내기가 '강제 발동'된다(그 라인엔 배치 불가).
// 매칭이 없을 때만 내 필드에 배치. (내 필드가 그 라인에서 가득 차면 밀어내기 불가 = 필드잠금)
export function legalMoves(board: Board, owner: Owner, rolledValue: DieValue): Move[] {
  const moves: Move[] = [];
  for (const line of LINES) {
    if (canPush(board, line, owner, rolledValue)) {
      moves.push({ kind: 'push', line }); // 매칭 → 밀어내기 강제
    } else if (canPlace(board, line, owner, owner, false)) {
      moves.push({ kind: 'place', line });
    }
  }
  return moves;
}

// 쉴드 배치 가능 위치: 빈 슬롯이 있는 모든 (line, owner).
export function legalShieldPlacements(board: Board, _owner: Owner): ShieldPlacement[] {
  void _owner; // 쉴드는 양 진영 모두 배치 가능
  const out: ShieldPlacement[] = [];
  for (const line of LINES) {
    for (const o of ['me', 'ai'] as Owner[]) {
      if (!isFieldFull(board, line, o)) out.push({ line, owner: o });
    }
  }
  return out;
}

// ── 종료 판정 ─────────────────────────────────────────
// 플레이어 홀드 시 AI 필드 충원 순간, 아니면 6필드 모두 충원 시 종료.
export function isTerminal(board: Board, held: boolean): boolean {
  return held ? isOwnerFull(board, 'ai') : isBoardFull(board);
}

// ── 내부 유틸 ─────────────────────────────────────────
export function cloneBoard(board: Board): Board {
  return {
    lines: board.lines.map((l) => ({ me: [...l.me], ai: [...l.ai] })) as Board['lines'],
  };
}
