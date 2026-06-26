// 티카투카 랭킹보드 — AI 랭크전 / 1:1 대전 각각 별도 TP 순위.
import { useEffect, useMemo, useState } from 'react';
import { Trophy, RefreshCw, Bot, Swords } from 'lucide-react';
import { fetchLeaderboard, type TikatukaPlayer, type RankPool } from './playerStore';
import { levelForTp } from './tp';

const POOL_TABS: { key: RankPool; label: string; Icon: typeof Bot }[] = [
  { key: 'ai', label: 'AI 랭크전', Icon: Bot },
  { key: 'pvp', label: '1:1 대전', Icon: Swords },
];

export function TikatukaLeaderboard({ myName }: { myName?: string }) {
  const [players, setPlayers] = useState<TikatukaPlayer[] | null>(null);
  const [pool, setPool] = useState<RankPool>('ai');
  const [loading, setLoading] = useState(false);

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
    return players
      .map((p) => ({
        name: p.name,
        tp: p[tpKey],
        wins: p[winKey],
        losses: p[lossKey],
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
        <div className="grid grid-cols-[44px_1fr_auto_auto] items-center gap-2 bg-zinc-50 px-3 py-2 text-[11px] font-bold text-zinc-400 dark:bg-zinc-900/50">
          <span>순위</span>
          <span>이름</span>
          <span className="text-right">전적</span>
          <span className="text-right">TP</span>
        </div>
        {rows.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-zinc-400">
            {loading ? '불러오는 중…' : '아직 기록이 없어요.'}
          </div>
        ) : (
          rows.map((r, i) => (
            <div
              key={r.name}
              className={`grid grid-cols-[44px_1fr_auto_auto] items-center gap-2 border-t border-zinc-100 px-3 py-2.5 text-sm dark:border-zinc-800 ${
                r.name === myName ? 'bg-indigo-50/60 dark:bg-indigo-950/30' : ''
              }`}
            >
              <span className="flex items-center gap-1 font-bold text-zinc-500">
                {i < 3 ? <Trophy size={14} className={['text-amber-400', 'text-zinc-400', 'text-amber-700'][i]} /> : null}
                {i + 1}
              </span>
              <span className="flex items-center gap-2 truncate font-bold text-zinc-800 dark:text-zinc-100">
                <span className="truncate">{r.name}</span>
                <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                  Lv.{r.level}
                </span>
              </span>
              <span className="text-right text-xs text-zinc-400">
                {r.wins}승 {r.losses}패
              </span>
              <span className="text-right font-bold text-indigo-600 dark:text-indigo-300">{r.tp.toLocaleString()} TP</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
