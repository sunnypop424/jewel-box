// 티카투카 엔진/AI 순수함수 자가테스트. 러너가 없어 esbuild 번들 → node 실행.
//   npx esbuild src/features/tikatuka/engine.selftest.ts --bundle --platform=node --format=esm --outfile=<tmp> && node <tmp>
// 난수는 시드 PRNG로 주입해 결정론 확보.

import {
  applyPush,
  canPlace,
  canPush,
  createEmptyBoard,
  evaluate,
  isBoardFull,
  isFieldFull,
  isOwnerFull,
  isTerminal,
  legalMoves,
  lineSum,
  makeDie,
  opponentOf,
  placeDie,
  pushTargets,
} from './engine';
import { decideAi } from './ai';
import type { AiLevel, Board, DieValue, LineIndex, Owner } from './types';

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) pass++;
  else {
    fail++;
    console.log('  ✗ FAIL:', msg);
  }
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function put(board: Board, line: LineIndex, owner: Owner, value: DieValue, shield = false): Board {
  return placeDie(board, line, owner, makeDie(value, owner, shield));
}

// ── A. evaluate ───────────────────────────────────────
console.log('[A] evaluate / 승리판정 / 타이브레이커 / 쉴드 합산');
{
  // me가 라인 0,1 승 → 2라인 승
  let b = createEmptyBoard();
  b = put(b, 0, 'me', 6);
  b = put(b, 0, 'ai', 1);
  b = put(b, 1, 'me', 6);
  b = put(b, 1, 'ai', 1);
  b = put(b, 2, 'me', 1);
  b = put(b, 2, 'ai', 6);
  assert(evaluate(b, false).winner === 'me', '2라인 승 → me');

  // 1승1패1무, 총합 me 우위 → me
  let c = createEmptyBoard();
  c = put(c, 0, 'me', 6); c = put(c, 0, 'ai', 1); // me 승
  c = put(c, 1, 'me', 1); c = put(c, 1, 'ai', 6); // ai 승
  c = put(c, 2, 'me', 4); c = put(c, 2, 'ai', 4); // 무
  const rc = evaluate(c, false);
  assert(rc.meLineWins === 1 && rc.aiLineWins === 1, '1승1패1무 카운트');
  // me총합 6+1+4=11, ai총합 1+6+4=11 → 총합 동점이므로 draw
  assert(rc.winner === 'draw', '총합도 동점이면 draw');

  // 1승1패1무 + me 총합 우위(13 vs 9) → me 타이브레이커 승
  let d = createEmptyBoard();
  d = put(d, 0, 'me', 6); d = put(d, 0, 'ai', 1); // me 승(+5)
  d = put(d, 1, 'me', 5); d = put(d, 1, 'ai', 6); // ai 승(-1)
  d = put(d, 2, 'me', 2); d = put(d, 2, 'ai', 2); // 무
  const rd = evaluate(d, false);
  assert(rd.meLineWins === 1 && rd.aiLineWins === 1, 'd: 1승1패1무');
  assert(rd.meTotal === 13 && rd.aiTotal === 9, 'd: 총합 13 vs 9');
  assert(rd.winner === 'me', '총합 me 우위 → me 타이브레이커 승');

  // 쉴드도 합에 포함 (상대 필드 쉴드는 상대 합 가산)
  let e = createEmptyBoard();
  e = put(e, 0, 'me', 3);
  e = put(e, 0, 'ai', 2, true); // ai 필드 쉴드 2 → ai 합 2
  assert(evaluate(e, false).lines[0].aiSum === 2, '쉴드 값도 합에 포함');
}

// ── A2. 더블/트리플 보너스 ────────────────────────────
console.log('[A2] 더블/트리플 (같은 눈 보너스)');
{
  const mk = (vals: DieValue[]) => vals.map((v) => makeDie(v, 'me', false));
  assert(lineSum(mk([2, 3, 4])) === 9, '서로 다른 눈: 단순 합 9');
  assert(lineSum(mk([5, 5])) === 15, '더블 5+5 = 15 (1개분 추가)');
  assert(lineSum(mk([5, 5, 5])) === 25, '트리플 5+5+5 = 25 (2개분 추가)');
  assert(lineSum(mk([5, 5, 3])) === 18, '더블5(15) + 3 = 18');
  assert(lineSum(mk([1, 1, 1])) === 5, '트리플 1 = 5');
  // 더블/트리플이 evaluate 승패에 반영
  let b = createEmptyBoard();
  b = put(b, 0, 'me', 4); b = put(b, 0, 'me', 4); // 더블 4 = 12
  b = put(b, 0, 'ai', 6); b = put(b, 0, 'ai', 5); // 11
  assert(lineSum(b.lines[0].me) === 12 && lineSum(b.lines[0].ai) === 11, '더블이 단순합 우위를 뒤집음');
  assert(evaluate(b, false).lines[0].winner === 'me', '더블 보너스로 라인 승');
}

// ── B. 밀어내기 ───────────────────────────────────────
console.log('[B] canPush / pushTargets / applyPush / 필드잠금');
{
  let b = createEmptyBoard();
  b = put(b, 0, 'ai', 3);
  b = put(b, 0, 'ai', 3);
  b = put(b, 0, 'ai', 5);
  // me가 라인0에서 3 굴림 → 두 3 매칭
  assert(canPush(b, 0, 'me', 3), '매칭 시 canPush true');
  assert(pushTargets(b, 0, 'me', 3).length === 2, '같은 숫자 전부 대상(2개)');
  const { board: pushed, removedCount } = applyPush(b, 0, 'me', 3);
  assert(removedCount === 2, '밀어낸 개수 2');
  assert(pushed.lines[0].ai.length === 1 && pushed.lines[0].ai[0].value === 5, '5만 남음');
  assert(pushed.lines[0].me.length === 0, '굴린 주사위는 보드에 안 남음(소멸)');

  // 다른 라인 같은 숫자는 못 민다
  let c = createEmptyBoard();
  c = put(c, 1, 'ai', 4);
  assert(!canPush(c, 0, 'me', 4), '다른 라인 매칭은 push 불가');

  // 쉴드는 안 밀림
  let d = createEmptyBoard();
  d = put(d, 0, 'ai', 3, true); // 쉴드 3
  d = put(d, 0, 'ai', 3, false); // 일반 3
  assert(pushTargets(d, 0, 'me', 3).length === 1, '쉴드 제외, 일반만 대상');
  const dr = applyPush(d, 0, 'me', 3);
  assert(dr.board.lines[0].ai.length === 1 && dr.board.lines[0].ai[0].shield, '쉴드는 영구 잔존');

  // 필드잠금: 내(공격자) 필드가 그 라인에서 풀이면 push 불가(주인만)
  let e = createEmptyBoard();
  e = put(e, 0, 'ai', 2); // 상대 매칭 대상
  e = put(e, 0, 'me', 2); e = put(e, 0, 'me', 5); e = put(e, 0, 'me', 6); // 내 필드 풀
  assert(!canPush(e, 0, 'me', 2), '내 필드 풀 → 나는 그 라인 push 불가(필드잠금)');
  // 대칭: 같은 상황에서 ai 필드가 풀이면 ai만 막힘
  let f = createEmptyBoard();
  f = put(f, 0, 'me', 2);
  f = put(f, 0, 'ai', 2); f = put(f, 0, 'ai', 5); f = put(f, 0, 'ai', 6);
  assert(!canPush(f, 0, 'ai', 2), 'ai 필드 풀 → ai push 불가');
  assert(canPush(f, 0, 'me', 2), '나는 여전히 ai 비쉴드 밀 수 있음(대칭)');
}

// ── C. canPlace ───────────────────────────────────────
console.log('[C] canPlace (비쉴드 자기필드만 / 쉴드 어디든 / 풀 불가)');
{
  let b = createEmptyBoard();
  assert(canPlace(b, 0, 'me', 'me', false), '비쉴드 내 필드 OK');
  assert(!canPlace(b, 0, 'ai', 'me', false), '비쉴드 상대 필드 불가');
  assert(canPlace(b, 0, 'ai', 'me', true), '쉴드는 상대 필드 OK');
  b = put(b, 0, 'me', 1); b = put(b, 0, 'me', 1); b = put(b, 0, 'me', 1);
  assert(!canPlace(b, 0, 'me', 'me', false), '풀 필드 배치 불가');
  assert(!canPlace(b, 0, 'me', 'me', true), '풀 필드는 쉴드도 불가');
}

// ── D. legalMoves ─────────────────────────────────────
console.log('[D] legalMoves (빈/풀/혼합)');
{
  const empty = createEmptyBoard();
  assert(legalMoves(empty, 'me', 4).length === 3, '빈 보드: 3라인 place만');

  // 내 모든 필드 풀 + 상대 매칭 존재 → 필드잠금으로 push도 불가 → 0수(자동홀드)
  let b = createEmptyBoard();
  for (const l of [0, 1, 2] as LineIndex[]) {
    b = put(b, l, 'me', 1); b = put(b, l, 'me', 1); b = put(b, l, 'me', 1);
    b = put(b, l, 'ai', 4);
  }
  assert(legalMoves(b, 'me', 4).length === 0, '내 필드 전부 풀 → 합법수 0(자동홀드)');

  // 혼합: 라인0 내필드 풀+상대4 있음(잠금), 라인1 여유+상대4 있음(place+push)
  let c = createEmptyBoard();
  c = put(c, 0, 'me', 1); c = put(c, 0, 'me', 1); c = put(c, 0, 'me', 1); c = put(c, 0, 'ai', 4);
  c = put(c, 1, 'ai', 4);
  const m = legalMoves(c, 'me', 4);
  // 라인0: place 불가(풀), push 불가(잠금) → 수 없음. 라인1: 매칭 → push 강제(배치 불가). 라인2: place.
  assert(m.some((x) => x.kind === 'push' && x.line === 1), '라인1 push 가능');
  assert(!m.some((x) => x.line === 0), '라인0 잠금 → 수 없음');

  // 밀어내기 강제: 매칭 라인은 push만(배치 불가)
  let d = createEmptyBoard();
  d = put(d, 0, 'ai', 4); // 라인0 상대 4 → 내가 4 굴리면 매칭
  const md = legalMoves(d, 'me', 4);
  assert(md.some((x) => x.kind === 'push' && x.line === 0), '매칭 라인0: push 제공');
  assert(!md.some((x) => x.kind === 'place' && x.line === 0), '매칭 라인0: 배치는 금지(강제 밀어내기)');
  assert(md.some((x) => x.kind === 'place' && x.line === 1), '비매칭 라인1: 배치 가능');
}

// ── E. isTerminal ─────────────────────────────────────
console.log('[E] isTerminal (홀드 vs 6필드)');
{
  let b = createEmptyBoard();
  for (const l of [0, 1, 2] as LineIndex[]) {
    b = put(b, l, 'ai', 2); b = put(b, l, 'ai', 2); b = put(b, l, 'ai', 2);
  }
  assert(isOwnerFull(b, 'ai') && !isOwnerFull(b, 'me'), 'ai만 풀');
  assert(isTerminal(b, true), '홀드 시 ai필드 충원 → 종료');
  assert(!isTerminal(b, false), '비홀드 시 ai만 풀로는 미종료');
  let full = b;
  for (const l of [0, 1, 2] as LineIndex[]) {
    full = put(full, l, 'me', 2); full = put(full, l, 'me', 2); full = put(full, l, 'me', 2);
  }
  assert(isBoardFull(full) && isTerminal(full, false), '6필드 충원 → 종료');
}

// ── F. AI 불변식 ──────────────────────────────────────
console.log('[F] AI 불변식 (출력 ∈ legalMoves, 타짜 ★3+만)');
{
  const rng = mulberry32(12345);
  let tazzaSeenBelow3 = false;
  for (let lvl = 1 as AiLevel; lvl <= 5; lvl = (lvl + 1) as AiLevel) {
    for (let i = 0; i < 60; i++) {
      // 랜덤 부분 보드 생성
      let b = createEmptyBoard();
      const fills = Math.floor(rng() * 10);
      for (let k = 0; k < fills; k++) {
        const l = Math.floor(rng() * 3) as LineIndex;
        const o: Owner = rng() < 0.5 ? 'me' : 'ai';
        const v = (Math.floor(rng() * 6) + 1) as DieValue;
        if (!isFieldFull(b, l, o)) b = put(b, l, o, v, rng() < 0.15);
      }
      const t = decideAi(b, lvl, false, rng, 'ai');
      if (t) {
        const legal = legalMoves(b, 'ai', t.chosenValue);
        const ok = legal.some((m) => m.kind === t.move.kind && m.line === t.move.line);
        assert(ok, `★${lvl}: 출력 move가 legalMoves에 포함`);
        if (t.usedTazza && lvl < 3) tazzaSeenBelow3 = true;
        if (t.move.kind === 'push') {
          assert(t.shieldValue != null, `★${lvl}: push면 쉴드 값 존재`);
        }
      }
    }
  }
  assert(!tazzaSeenBelow3, '★3 미만은 타짜 미사용');
}

// ── G. 풀게임 시뮬 + 레벨 강도 ────────────────────────
console.log('[G] 풀게임 시뮬 + 레벨 강도(승률)');

function playGame(lvMe: AiLevel, lvAi: AiLevel, rng: () => number): Owner | 'draw' {
  let board = createEmptyBoard();
  let turn: Owner = rng() < 0.5 ? 'me' : 'ai';
  const tazza: Record<Owner, boolean> = { me: false, ai: false };
  let turns = 0;
  while (!isBoardFull(board) && turns < 200) {
    const lvl = turn === 'me' ? lvMe : lvAi;
    const t = decideAi(board, lvl, tazza[turn], rng, turn);
    if (t) {
      if (t.usedTazza) tazza[turn] = true;
      if (t.move.kind === 'place') {
        board = placeDie(board, t.move.line, turn, makeDie(t.chosenValue, turn, false));
      } else {
        board = applyPush(board, t.move.line, turn, t.chosenValue).board;
        if (t.shieldPlacement && t.shieldValue != null) {
          board = placeDie(board, t.shieldPlacement.line, t.shieldPlacement.owner, makeDie(t.shieldValue, turn, true));
        }
      }
    }
    turn = opponentOf(turn);
    turns += 1;
  }
  return evaluate(board, false).winner;
}

function winRate(lvStrong: AiLevel, lvWeak: AiLevel, games: number, seed: number): number {
  const rng = mulberry32(seed);
  let strongWins = 0;
  let decided = 0;
  for (let i = 0; i < games; i++) {
    // 강자를 절반은 me, 절반은 ai로 (선공·진영 편향 제거)
    const strongIsMe = i % 2 === 0;
    const w = strongIsMe ? playGame(lvStrong, lvWeak, rng) : playGame(lvWeak, lvStrong, rng);
    if (w === 'draw') continue;
    decided += 1;
    const strongOwner: Owner = strongIsMe ? 'me' : 'ai';
    if (w === strongOwner) strongWins += 1;
  }
  return decided === 0 ? 0.5 : strongWins / decided;
}

{
  // 같은 MC 엔진(★3·4·5) + 주사위 분산 때문에 '인접' 레벨 머리싸움은 ~50%(노이즈)라 단언하지 않는다.
  // 의미 있는 격차(약체 ★1 상대 / 2단계 차이)만 검증 — 난이도는 ε(실수 빈도)로 단조 증가.
  const pairs: [AiLevel, AiLevel, number][] = [
    [2, 1, 120],
    [3, 1, 120],
    [4, 1, 120],
    [5, 1, 120],
    [5, 3, 100],
  ];
  for (const [s, w, g] of pairs) {
    const r = winRate(s, w, g, 999 + s * 7 + w);
    const tag = `★${s} vs ★${w}`;
    console.log(`     ${tag}: 강자 승률 ${(r * 100).toFixed(1)}% (${g}판)`);
    if (w <= 1 && s >= 2) {
      assert(r >= 0.6, `${tag}: 상위 레벨이 명확히 우세(>=60%)`);
    } else {
      assert(r >= 0.5, `${tag}: 상위 레벨이 비우세 아님(>=50%)`);
    }
  }
}

console.log(`\n=== ${fail === 0 ? '전체 통과' : fail + '건 실패'} (assert ${pass}/${pass + fail}) ===`);
// node 실행 전용(브라우저 앱 tsconfig엔 @types/node 없음) — 최소 선언으로 타입만 충족.
declare const process: { exit(code: number): never } | undefined;
if (typeof process !== 'undefined') process.exit(fail === 0 ? 0 : 1);
