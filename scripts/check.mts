// 시뮬 추천 로직 결정론 점검 — 구성한 보드로 홀드 6단계·추천 null·쉴드 배치를 검증(PASS/FAIL).
import { createEmptyBoard, makeDie, placeDie, legalMoves } from '../src/features/tikatuka/engine';
import { recommendMove, recommendShield, gradedHold } from '../src/features/tikatuka/ai';
import type { AdvCfg } from '../src/features/tikatuka/ai';
import type { Board, DieValue, LineIndex, Owner } from '../src/features/tikatuka/types';

const cfg: AdvCfg = { playouts: 40, respLevel: 2, rolloutLevel: 2, expandShield: false, oppPushFirst: true };
const ctx = { iAmFirst: false, isFirstShield: false };
const put = (b: Board, l: LineIndex, o: Owner, v: DieValue, s = false) => placeDie(b, l, o, makeDie(v, o, s));

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = '') {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (cond) pass++; else fail++;
}

console.log('[홀드 6단계]');
// 확정 승리 락: 내가 2라인을 쉴드 고점으로 잠금(밀 수 없음), 상대 저점.
{
  let bd = createEmptyBoard();
  bd = put(bd, 0, 'me', 6, true); bd = put(bd, 0, 'me', 6, true); bd = put(bd, 0, 'me', 6, true);
  bd = put(bd, 0, 'ai', 1);
  bd = put(bd, 1, 'me', 5, true); bd = put(bd, 1, 'me', 5, true); bd = put(bd, 1, 'me', 5, true);
  bd = put(bd, 1, 'ai', 2);
  bd = put(bd, 2, 'ai', 4);
  const h = gradedHold(bd, 'me', 0.97);
  check('확정 승리 락 → 홀드(확정) 굳히기', !!h && h.headline.includes('확정') && h.headline.includes('굳히기'), h?.headline ?? 'null');
}
// 확정 패배 락: 상대가 2라인 잠금, 나 저점.
{
  let bd = createEmptyBoard();
  bd = put(bd, 0, 'ai', 6, true); bd = put(bd, 0, 'ai', 6, true); bd = put(bd, 0, 'ai', 6, true);
  bd = put(bd, 0, 'me', 1);
  bd = put(bd, 1, 'ai', 5, true); bd = put(bd, 1, 'ai', 5, true); bd = put(bd, 1, 'ai', 5, true);
  bd = put(bd, 1, 'me', 2);
  bd = put(bd, 2, 'me', 4);
  const h = gradedHold(bd, 'me', 0.03);
  check('확정 패배 락 → 홀드(확정) 졌어요', !!h && h.headline.includes('확정') && h.headline.includes('졌'), h?.headline ?? 'null');
}
// 소프트 승리(2라인 우세, 비쉴드라 미확정) + 승률 0.95 → 권장.
{
  let bd = createEmptyBoard();
  bd = put(bd, 0, 'me', 6); bd = put(bd, 0, 'me', 6); bd = put(bd, 0, 'ai', 1);
  bd = put(bd, 1, 'me', 6); bd = put(bd, 1, 'me', 6); bd = put(bd, 1, 'ai', 1);
  bd = put(bd, 2, 'ai', 3);
  const h = gradedHold(bd, 'me', 0.95);
  check('2라인 우세 + 승률95% → 홀드 권장', !!h && h.headline.includes('권장'), h?.headline ?? 'null');
}
// 균형 보드 + 승률 0.5 → 홀드 없음(null).
{
  let bd = createEmptyBoard();
  bd = put(bd, 0, 'me', 3); bd = put(bd, 0, 'ai', 3);
  bd = put(bd, 1, 'me', 4); bd = put(bd, 1, 'ai', 4);
  const h = gradedHold(bd, 'me', 0.5);
  check('균형 + 승률50% → 홀드 없음(null)', h === null, h?.headline ?? 'null');
}

console.log('\n[추천 null/비-null]');
// 일반 보드: 추천이 비-null + 합법 action.
{
  let bd = createEmptyBoard();
  bd = put(bd, 0, 'me', 5); bd = put(bd, 1, 'ai', 2); bd = put(bd, 1, 'ai', 2); bd = put(bd, 2, 'me', 3);
  const a = recommendMove(bd, 'me', 2, true, cfg, ctx); // L1에 2 알까기 가능
  check('일반 보드 추천 비-null + 합법 action', !!a && ['place', 'push', 'tazza'].includes(a.action), a?.action ?? 'null');
}
// 합법수 없음(내 3필드 가득) → null, 크래시 없음.
{
  let bd = createEmptyBoard();
  ([0, 1, 2] as LineIndex[]).forEach((l) => { bd = put(bd, l, 'me', 4); bd = put(bd, l, 'me', 4); bd = put(bd, l, 'me', 4); });
  const ml = legalMoves(bd, 'me', 5).length;
  const a = recommendMove(bd, 'me', 5, false, cfg, ctx);
  check('내 필드 가득 → 합법수 0 & 추천 null', ml === 0 && a === null, `moves=${ml}`);
}

console.log('\n[쉴드 배치]');
// 값3 + 자기 라인에 3 → 자기 페어.
{
  let bd = createEmptyBoard();
  bd = put(bd, 0, 'me', 3); // 내 L0에 3
  bd = put(bd, 1, 'ai', 2);
  const s = recommendShield(bd, 'me', 3);
  check('쉴드3 + 자기3 있음 → 자기 필드 페어', !!s && s.owner === 'me' && s.line === 0, s ? `${s.owner} L${s.line + 1}` : 'null');
}
// 값1(저눈) → 상대 캡.
{
  let bd = createEmptyBoard();
  bd = put(bd, 0, 'me', 6); bd = put(bd, 1, 'ai', 4);
  const s = recommendShield(bd, 'me', 1);
  check('쉴드1(저눈) → 상대 필드 캡', !!s && s.owner === 'ai', s ? `${s.owner} L${s.line + 1}` : 'null');
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
