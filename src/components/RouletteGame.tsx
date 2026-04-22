import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Trophy, Users, UserCircle, Search } from 'lucide-react';
import { sendDiscordNotification } from '../utils/discord';

interface Props {
  allUserNames?: string[];
}

const COLORS = [
  '#ef4444',
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#f97316',
];

const TAU = Math.PI * 2;
const POINTER_ANGLE = -Math.PI / 2; // 12시 방향

export const RouletteGame: React.FC<Props> = ({ allUserNames = [] }) => {
  const [names, setNames] = useState<string[]>(['', '']);
  const [playerCount, setPlayerCount] = useState(2);
  const [isSpinning, setIsSpinning] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const discordSentRef = useRef(false);

  useEffect(() => {
    setNames((prev) => {
      const next = [...prev];

      if (playerCount > next.length) {
        while (next.length < playerCount) next.push('');
      } else if (playerCount < next.length) {
        next.length = playerCount;
      }

      return next;
    });
  }, [playerCount]);

  const activeNames = useMemo(
    () => names.slice(0, playerCount).filter((n) => n.trim() !== ''),
    [names, playerCount],
  );

  useEffect(() => {
    if (winner && !discordSentRef.current) {
      discordSentRef.current = true;
      const participants = activeNames.join(', ');
      sendDiscordNotification(
        `**룰렛 게임 결과**\n참여자: ${participants}\n🎉 **${winner}** 님이 당첨되셨습니다! 축하드립니다!`
      );
    }
  }, [winner]);

  useEffect(() => {
    drawRoulette();
  }, [activeNames, rotation]);

  const handleNameChange = (index: number, value: string) => {
    setNames((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const getFilteredNames = (query: string) => {
    const keyword = query.trim().toLowerCase();

    return allUserNames.filter((u) => {
      if (names.includes(u) && u !== query) return false;
      return keyword ? u.toLowerCase().includes(keyword) : true;
    });
  };

  const selectSuggestion = (index: number, value: string) => {
    setNames((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
    setFocusedIndex(null);
  };

  const drawRoulette = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    const center = size / 2;
    const outerRadius = 170;
    const innerRadius = 30;
    const labelRadius = 118;
    const segmentCount = Math.max(activeNames.length, 1);
    const angleStep = TAU / segmentCount;

    ctx.clearRect(0, 0, size, size);

    // 바깥 그림자
    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, outerRadius + 8, 0, TAU);
    ctx.shadowColor = 'rgba(15, 23, 42, 0.18)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 12;
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();

    // 배경 링
    ctx.beginPath();
    ctx.arc(center, center, outerRadius + 6, 0, TAU);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // 세그먼트 시작 위치를 12시 기준으로 맞춤
    const baseOffset = POINTER_ANGLE - Math.PI / 2;

    activeNames.forEach((name, i) => {
      const startAngle = baseOffset + rotation + i * angleStep;
      const endAngle = startAngle + angleStep;

      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, outerRadius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 3;
      ctx.stroke();

      const midAngle = startAngle + angleStep / 2;
      const x = center + Math.cos(midAngle) * labelRadius;
      const y = center + Math.sin(midAngle) * labelRadius;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(midAngle + Math.PI / 2);

      if (midAngle > Math.PI / 2 && midAngle < (Math.PI * 3) / 2) {
        ctx.rotate(Math.PI);
      }

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 16px Pretendard, sans-serif';

      const safeName = name.length > 10 ? `${name.slice(0, 10)}…` : name;
      ctx.fillText(safeName, 0, 0);
      ctx.restore();
    });

    // 바깥 테두리
    ctx.beginPath();
    ctx.arc(center, center, outerRadius, 0, TAU);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.stroke();

    // 중앙 원
    ctx.beginPath();
    ctx.arc(center, center, innerRadius, 0, TAU);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#d4d4d8';
    ctx.lineWidth = 4;
    ctx.stroke();

    // 중앙 점
    ctx.beginPath();
    ctx.arc(center, center, 10, 0, TAU);
    ctx.fillStyle = '#4f46e5';
    ctx.fill();

    // 화살표(상단 고정)
    const pointerY = center - outerRadius - 2;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(center, pointerY);
    ctx.lineTo(center - 18, pointerY - 28);
    ctx.lineTo(center + 18, pointerY - 28);
    ctx.closePath();
    ctx.fillStyle = '#4f46e5';
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  };

  const getWinnerIndex = (finalRotation: number, count: number) => {
    const angleStep = TAU / count;
    const normalized = ((POINTER_ANGLE - (finalRotation + (POINTER_ANGLE - Math.PI / 2))) % TAU) + TAU;
    return Math.floor(normalized / angleStep) % count;
  };

  const spin = () => {
    if (isSpinning || activeNames.length < 2) return;

    setIsSpinning(true);
    setWinner(null);

    const startRotation = rotation;
    const extraSpins = 6 + Math.random() * 3;
    const randomOffset = Math.random() * TAU;
    const targetRotation = startRotation + extraSpins * TAU + randomOffset;
    const duration = 4200;
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      const nextRotation = startRotation + (targetRotation - startRotation) * eased;

      setRotation(nextRotation);

      if (progress < 1) {
        requestAnimationFrame(animate);
        return;
      }

      const winnerIndex = getWinnerIndex(nextRotation, activeNames.length);
      setWinner(activeNames[winnerIndex]);
      setIsSpinning(false);
    };

    requestAnimationFrame(animate);
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-900 dark:text-zinc-100">
            <Users size={18} className="text-indigo-500" />
            참여 인원 설정
          </h3>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPlayerCount(Math.max(2, playerCount - 1))}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 font-bold text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
            >
              -
            </button>
            <span className="w-6 text-center text-lg font-extrabold text-indigo-600 dark:text-indigo-400">
              {playerCount}
            </span>
            <button
              onClick={() => setPlayerCount(Math.min(8, playerCount + 1))}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 font-bold text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
            >
              +
            </button>
          </div>
        </div>

        <div
          className="grid w-full gap-2"
          style={{ gridTemplateColumns: `repeat(${playerCount}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: playerCount }).map((_, i) => {
            const filteredList = getFilteredNames(names[i] || '');

            return (
              <div key={i} className="relative flex flex-col gap-1">
                <input
                type="text"
                value={names[i] || ''}
                onFocus={() => setFocusedIndex(i)}
                onChange={(e) => handleNameChange(i, e.target.value)}
                placeholder={`참여자 ${i + 1}`}
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-1 py-2 text-center text-[11px] font-bold text-zinc-800 placeholder:font-medium placeholder:text-zinc-400 transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 sm:px-3 sm:text-sm"
                />

                {focusedIndex === i && filteredList.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto overflow-x-hidden rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-800 animate-in fade-in zoom-in-95 duration-100">
                    <div className="flex items-center gap-1.5 border-b border-zinc-100 bg-zinc-50/50 p-1.5 text-[10px] font-bold text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900/50">
                      <UserCircle size={12} />
                      {names[i] ? '검색 결과' : '공대원 목록'}
                    </div>

                    {filteredList.map((sName) => (
                      <button
                        key={sName}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectSuggestion(i, sName)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold text-zinc-600 hover:bg-indigo-50 hover:text-indigo-600 dark:text-zinc-300 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-400"
                      >
                        <Search size={12} className="shrink-0 text-zinc-300" />
                        <span className="truncate">{sName}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col items-center gap-5 rounded-3xl border border-zinc-200 bg-gradient-to-b from-white to-zinc-50 p-6 shadow-sm dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-950">
        <div className="relative">
          <canvas
            ref={canvasRef}
            width={420}
            height={420}
            className="max-w-full rounded-full"
          />
        </div>

        {winner && (
          <div className="rounded-2xl bg-indigo-50 px-5 py-3 text-center dark:bg-indigo-950/40">
            <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.24em] text-zinc-500">
              Winner
            </div>
            <div className="flex items-center justify-center gap-2 text-2xl font-black text-indigo-600 dark:text-indigo-300">
              <Trophy size={24} />
              {winner}
            </div>
          </div>
        )}

        <button
          onClick={spin}
          disabled={isSpinning || activeNames.length < 2}
          className="flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-3.5 text-base font-bold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Play size={18} fill="currentColor" />
          {isSpinning ? '추첨하고 있습니다.' : '룰렛 추첨하기'}
        </button>
      </div>
    </div>
  );
};