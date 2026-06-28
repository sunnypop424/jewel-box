// 티카투카 비-게임 화면(허브/메뉴/로비/랭킹/난이도) 공통 디자인 토큰.
// 카드·입력은 앱 공용(refineUi) 재사용, 버튼은 모드 간 크기·모양 통일을 위해 한 곳에서 정의.
export { cardClass, inputClass, subtitleClass } from '../refine/refineUi';

// 기본 버튼 골격(크기 통일: px-5 py-2.5 / text-sm / rounded-lg).
const btnBase =
  'inline-flex items-center justify-center gap-1.5 rounded-lg px-5 py-2.5 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50';

export const btnPrimary = `${btnBase} bg-indigo-600 text-white shadow-sm hover:bg-indigo-500`;
export const btnNeutral = `${btnBase} bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700`;
export const btnDark = `${btnBase} bg-zinc-800 text-white hover:bg-zinc-700 dark:bg-zinc-200 dark:text-zinc-900`;

// 너비 통일 — 메뉴/설정 화면(이름·인트로·난이도선택·로비·랭킹)은 모두 CHROME, 게임 보드만 GAME.
export const CHROME = 'mx-auto w-full max-w-2xl';
export const GAME = 'mx-auto w-full max-w-5xl';
