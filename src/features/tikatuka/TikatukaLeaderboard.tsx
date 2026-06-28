// 티카투카 랭킹보드 — AI 랭크전 / 1:1 대전 각각 별도 TP 순위.
import { useEffect, useMemo, useState } from 'react';
import { Trophy, RefreshCw, Bot, Swords, X, Flame } from 'lucide-react';
import { fetchLeaderboard, type TikatukaPlayer, type RankPool } from './playerStore';
import { levelForTp } from './tp';

const POOL_TABS: { key: RankPool; label: string; Icon: typeof Bot }[] = [
  { key: 'ai', label: 'AI 랭크전', Icon: Bot },
  { key: 'pvp', label: '1:1 대전', Icon: Swords },
];

// 승률 — 소수 1자리(버림). 무기록은 '-'.
function fmtRate(w: number, l: number): string {
  const t = w + l;
  if (t === 0) return '-';
  const pct = Math.floor((w / t) * 1000) / 10;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`;
}
// 승이 많으면 파랑, 패가 많으면 빨강, 같으면 중립.
function recordColor(w: number, l: number): string {
  return w > l
    ? 'text-indigo-600 dark:text-indigo-300'
    : l > w
      ? 'text-rose-600 dark:text-rose-300'
      : 'text-zinc-500 dark:text-zinc-400';
}

export function TikatukaLeaderboard({ myName }: { myName?: string }) {
  const [players, setPlayers] = useState<TikatukaPlayer[] | null>(null);
  const [pool, setPool] = useState<RankPool>('ai');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<TikatukaPlayer | null>(null); // 1:1 상대별 전적 모달

  // 선택된 플레이어의 상대별 전적 — 판수 많은 순, 동률이면 승수 순.
  const h2hList = useMemo(() => {
    const h = selected?.h2h ?? {};
    return Object.entries(h)
      .filter(([, r]) => r.wins + r.losses > 0)
      .sort((a, b) => b[1].wins + b[1].losses - (a[1].wins + a[1].losses) || b[1].wins - a[1].wins);
  }, [selected]);

  const load = () => {
    setLoading(true);
    fetchLeaderboard()
      .then(setPlayers)
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const rows = useMemo(() => {
    if (!players) return [];
    const tpKey = pool === 'ai' ? 'tpAi' : 'tpPvp';
    const winKey = pool === 'ai' ? 'winsAi' : 'winsPvp';
    const lossKey = pool === 'ai' ? 'lossesAi' : 'lossesPvp';
    const streakKey = pool === 'ai' ? 'streakAi' : 'streakPvp';
    return players
      .map((p) => ({
        name: p.name,
        tp: p[tpKey],
        wins: p[winKey],
        losses: p[lossKey],
        streak: p[streakKey],
        level: levelForTp(p[tpKey]),
      }))
      .filter((r) => r.wins + r.losses > 0 || r.tp > 0)
      .sort((a, b) => b.tp - a.tp);
  }, [players, pool]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-2 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex gap-1">
          {POOL_TABS.map(({ key, label, Icon }) => {
            const active = pool === key;
            return (
              <button
                key={key}
                onClick={() => setPool(key)}
                className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-bold transition-colors ${
                  active
                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-300'
                    : 'border-transparent text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
                }`}
              >
                <Icon size={15} /> {label}
              </button>
            );
          })}
        </div>
        <button
          onClick={load}
          className="mb-1.5 inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-bold text-zinc-600 transition-colors hover:bg-zinc-200 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          title="새로고침"
          disabled={loading}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> 새로고침
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="grid grid-cols-[32px_1fr_5rem_5.5rem] items-center gap-1.5 bg-zinc-50 px-3 py-2 text-[11px] font-bold text-zinc-400 sm:grid-cols-[40px_1fr_6rem_6.5rem] sm:gap-2 dark:bg-zinc-900/50">
          <span>순위</span>
          <span>이름</span>
          <span className="text-center">전적</span>
          <span className="text-center">TP</span>
        </div>
        {rows.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-zinc-400">
            {loading ? '불러오는 중…' : '아직 기록이 없어요.'}
          </div>
        ) : (
          rows.map((r, i) => (
            <div
              key={r.name}
              className={`grid grid-cols-[32px_1fr_5rem_5.5rem] items-center gap-1.5 border-t border-zinc-100 px-3 py-2.5 text-sm sm:grid-cols-[40px_1fr_6rem_6.5rem] sm:gap-2 dark:border-zinc-800 ${
                r.name === myName ? 'bg-indigo-50/60 dark:bg-indigo-950/30' : ''
              }`}
            >
              <span className="flex items-center gap-1 font-bold text-zinc-500">
                {i < 3 ? <Trophy size={14} className={['text-amber-400', 'text-zinc-400', 'text-amber-700'][i]} /> : null}
                {i + 1}
              </span>
              <span className="flex items-center gap-2 truncate font-bold text-zinc-800 dark:text-zinc-100">
                {pool === 'pvp' ? (
                  <button
                    onClick={() => {
                      const p = players?.find((x) => x.name === r.name);
                      if (p) setSelected(p);
                    }}
                    className="min-w-[4em] truncate text-left underline-offset-2 hover:text-indigo-600 hover:underline dark:hover:text-indigo-300"
                    title="상대별 전적 보기"
                  >
                    {r.name}
                  </button>
                ) : (
                  <span className="min-w-[4em] truncate">{r.name}</span>
                )}
                <span
                  className={`hidden shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold sm:inline-block ${
                    pool === 'ai'
                      ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                  }`}
                >
                  Lv.{r.level}
                </span>
              </span>
              <span className="flex flex-col items-center gap-0.5 text-center text-xs tabular-nums text-zinc-400">
                <span>
                  {r.wins}승 {r.losses}패
                </span>
                {r.streak >= 2 && (
                  <span
                    className="inline-flex items-center gap-0.5 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-600 dark:bg-orange-900/40 dark:text-orange-300"
                    title={`${r.streak}연승 중`}
                  >
                    <Flame size={10} /> {r.streak}연승
                  </span>
                )}
              </span>
              <span className="text-center text-sm font-bold tabular-nums text-indigo-600 dark:text-indigo-300">
                {r.tp.toLocaleString()} TP
              </span>
            </div>
          ))
        )}
      </div>

      {/* 상대별 전적 모달 — 1:1 탭에서 이름 클릭 시 */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5 truncate text-base font-bold text-zinc-800 dark:text-zinc-100">
                <Swords size={16} className="shrink-0 text-indigo-500" /> <span className="truncate">{selected.name}</span> · 1:1 전적
              </span>
              <button
                onClick={() => setSelected(null)}
                className="shrink-0 rounded-lg p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
              >
                <X size={18} />
              </button>
            </div>

            {/* 전체 전적 — 상대별 표와 분리해 위에 별도 표기 */}
            <div className="mb-3 flex items-center justify-between rounded-xl bg-zinc-50 px-3 py-2.5 dark:bg-zinc-800/50">
              <span className="text-xs font-bold text-zinc-400">전체</span>
              <span className="flex items-center gap-2 text-sm">
                <span className={`font-bold tabular-nums ${recordColor(selected.winsPvp, selected.lossesPvp)}`}>
                  {selected.winsPvp}승 {selected.lossesPvp}패
                </span>
                <span className="text-zinc-300 dark:text-zinc-600">·</span>
                <span className={`font-bold tabular-nums ${recordColor(selected.winsPvp, selected.lossesPvp)}`}>
                  승률 {fmtRate(selected.winsPvp, selected.lossesPvp)}
                </span>
              </span>
            </div>

            {/* 상대별 전적 — 랭킹보드와 동일한 테이블 스타일 */}
            <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
              <div className="grid grid-cols-[1fr_6rem_5rem] items-center gap-2 bg-zinc-50 px-3 py-2 text-[11px] font-bold text-zinc-400 dark:bg-zinc-900/50">
                <span>상대</span>
                <span className="text-center">전적</span>
                <span className="text-center">승률</span>
              </div>

              {h2hList.length === 0 ? (
                <div className="border-t border-zinc-100 px-3 py-5 text-center text-xs text-zinc-400 dark:border-zinc-800">
                  상대별 기록이 아직 없어요.
                </div>
              ) : (
                h2hList.map(([opp, r]) => (
                  <div key={opp} className="grid grid-cols-[1fr_6rem_5rem] items-center gap-2 border-t border-zinc-100 px-3 py-2.5 text-sm dark:border-zinc-800">
                    <span className="truncate font-bold text-zinc-700 dark:text-zinc-200" title={opp}>
                      {opp}
                    </span>
                    <span className={`text-center font-bold tabular-nums ${recordColor(r.wins, r.losses)}`}>
                      {r.wins}승 {r.losses}패
                    </span>
                    <span className={`text-center text-xs font-bold tabular-nums ${recordColor(r.wins, r.losses)}`}>
                      {fmtRate(r.wins, r.losses)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
