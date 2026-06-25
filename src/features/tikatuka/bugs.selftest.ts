// 티카투카 버그 재현 + 회귀 테스트. engine.selftest.ts와 동일 러너로 실행:
//   npx esbuild src/features/tikatuka/bugs.selftest.ts --bundle --platform=node --format=esm --outfile=<tmp> && node <tmp>
// 결정론: 난수 미사용(보드 상태를 직접 세팅 + reducer 액션 직접 주입).

import {
  createEmptyBoard,
  isFieldFull,
  legalMoves,
  makeDie,
  placeDie,
} from './engine';
import { reducer, initialState } from './reducer';
import type { AiTurn } from './ai';
import type { Board, DieValue, GameState, LineIndex, Owner } from './types';

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) pass++;
  else {
    fail++;
    console.log('  ✗ FAIL:', msg);
  }
}

function put(board: Board, line: LineIndex, owner: Owner, value: DieValue, shield = false): Board {
  return placeDie(board, line, owner, makeDie(value, owner, shield));
}

// Board.tsx의 라인별 배치/밀어내기 활성 판정을 그대로 복제(UI 회귀 검증용).
function uiCanPlace(board: Board, line: LineIndex, rolled: DieValue): boolean {
  const canPush = !isFieldFull(board, line, 'me') &&
    board.lines[line].ai.some((d) => !d.shield && d.value === rolled);
  return !canPush && !isFieldFull(board, line, 'me');
}

// ── 버그 1: 다른 라인인데 내 필드 배치가 막힌다 ──────────────
// 굴린 눈이 2번 라인(index 1) 상대 필드와만 매칭. 1·3번 라인 내 필드는 빈칸.
// 기대: 매칭된 라인1만 밀어내기 강제, 라인0·라인2 배치는 정상 합법.
console.log('[버그1] 라인별 매칭 분리 — 매칭 라인만 배치 불가');
{
  let b = createEmptyBoard();
  b = put(b, 1, 'ai', 4); // 라인1(2번) 상대 필드에 4 → 내가 4 굴리면 라인1만 매칭
  // 라인0·라인2 내 필드는 비어 있음(배치 가능해야 함)
  const moves = legalMoves(b, 'me', 4);

  assert(moves.some((m) => m.kind === 'place' && m.line === 0), '라인0(1번) 배치 합법');
  assert(moves.some((m) => m.kind === 'place' && m.line === 2), '라인2(3번) 배치 합법');
  assert(moves.some((m) => m.kind === 'push' && m.line === 1), '라인1(2번) 밀어내기 강제');
  assert(!moves.some((m) => m.kind === 'place' && m.line === 1), '라인1(2번) 배치는 금지');

  // UI 판정도 동일해야 함
  assert(uiCanPlace(b, 0, 4) && uiCanPlace(b, 2, 4), 'UI: 라인0·2 배치 활성');
  assert(!uiCanPlace(b, 1, 4), 'UI: 라인1 배치 비활성(밀어내기 강제)');
}

// ── 버그 2: 필드가 꽉 차 멈춘 뒤, 빈칸이 생겨도 복귀가 안 된다 ──
// 합법수 없음(내 필드 전부 풀) → AUTO_HOLD는 "이번 턴 패스"여야 하고,
// 영구 홀드(held=true)가 되면 안 된다.
console.log('[버그2] 자동 패스는 일시적 — 영구 홀드가 아니어야 함');

function fullMyBoard(): Board {
  let b = createEmptyBoard();
  // 내 필드 3라인 전부 풀(배치 불가), ai 라인0에 매칭 대상 1개(필드잠금으로 push도 불가)
  b = put(b, 0, 'me', 2); b = put(b, 0, 'me', 3); b = put(b, 0, 'me', 4);
  b = put(b, 1, 'me', 5); b = put(b, 1, 'me', 6); b = put(b, 1, 'me', 1);
  b = put(b, 2, 'me', 2); b = put(b, 2, 'me', 3); b = put(b, 2, 'me', 4);
  b = put(b, 0, 'ai', 2); // ai 한 개만(ai 필드는 여유)
  return b;
}

function stateWithRolled(board: Board, value: DieValue): GameState {
  return {
    ...initialState(2),
    board,
    turn: 'me',
    phase: 'acting',
    rolledDie: makeDie(value, 'me', false),
    held: false,
  };
}

{
  const board = fullMyBoard();
  const s0 = stateWithRolled(board, 2);
  assert(legalMoves(board, 'me', 2).length === 0, '전제: 합법수 0(둘 곳 없음)');

  const afterPass = reducer(s0, { type: 'AUTO_HOLD' });
  assert(afterPass.held === false, '자동 패스 후 held=false (영구 홀드 아님)');
  assert(afterPass.turn === 'ai', '자동 패스 후 턴은 ai로 넘어감');
  assert(afterPass.phase !== 'gameOver', '자동 패스는 게임 종료가 아님');

  // ai가 내 라인0의 2를 밀어내 빈칸 발생 → 내 차례가 다시 돌아와야 함
  const aiPush: AiTurn = {
    usedTazza: false,
    rolls: [2],
    chosenValue: 2,
    move: { kind: 'push', line: 0 },
    shieldValue: 1,
    shieldPlacement: { line: 0, owner: 'ai' },
  };
  const afterAi = reducer(afterPass, { type: 'AI_TURN', turn: aiPush });
  assert(!isFieldFull(afterAi.board, 0, 'me'), 'ai 밀어내기로 내 라인0 빈칸 발생');
  assert(afterAi.turn === 'me', '빈칸 생긴 뒤 내 차례로 복귀');
  assert(afterAi.held === false, '복귀 시 held 여전히 false');
  assert(afterAi.phase === 'rolling', '복귀 시 다시 굴림 단계');
  // 복귀 후 합법수가 실제로 다시 생기는지(라인0 배치 가능)
  assert(legalMoves(afterAi.board, 'me', 3).some((m) => m.kind === 'place' && m.line === 0),
    '복귀 후 라인0 배치 합법수 재생성');
}

// ── 회귀: 수동 홀드는 영구적이어야 한다 ───────────────────────
console.log('[회귀] 수동 홀드 영구성 + 종료 판정');
{
  // ai 필드는 거의 다 참(라인0만 빈칸 1). 내가 수동 홀드 → ai 마지막 칸 채우면 종료.
  let b = createEmptyBoard();
  b = put(b, 0, 'ai', 2); b = put(b, 0, 'ai', 2); // 라인0 ai 2칸(1칸 여유)
  b = put(b, 1, 'ai', 3); b = put(b, 1, 'ai', 3); b = put(b, 1, 'ai', 3);
  b = put(b, 2, 'ai', 4); b = put(b, 2, 'ai', 4); b = put(b, 2, 'ai', 4);

  const s: GameState = {
    ...initialState(2),
    board: b,
    turn: 'me',
    phase: 'acting',
    rolledDie: makeDie(5, 'me', false),
    held: false,
  };
  const held = reducer(s, { type: 'HOLD' });
  assert(held.held === true, '수동 홀드 → held=true');
  assert(held.turn === 'ai', '홀드 후 턴은 ai');

  // ai가 라인0 마지막 칸을 채움 → ai 필드 풀 → 홀드 종료
  const aiFill: AiTurn = {
    usedTazza: false,
    rolls: [6],
    chosenValue: 6,
    move: { kind: 'place', line: 0 },
    shieldValue: null,
    shieldPlacement: null,
  };
  const ended = reducer(held, { type: 'AI_TURN', turn: aiFill });
  assert(ended.phase === 'gameOver', '수동 홀드 + ai 필드 충원 → 게임 종료');
  assert(ended.winner !== null, '종료 시 승자 확정');
}

console.log(`\n=== ${fail === 0 ? '전체 통과' : fail + '건 실패'} (assert ${pass}/${pass + fail}) ===`);
// node 실행 전용(브라우저 앱 tsconfig엔 @types/node 없음) — 최소 선언으로 타입만 충족.
declare const process: { exit(code: number): never } | undefined;
if (typeof process !== 'undefined') process.exit(fail === 0 ? 0 : 1);
