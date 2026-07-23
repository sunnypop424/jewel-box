import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Trophy, Users, UserCircle, Search, History } from 'lucide-react';
import { sendDiscordNotification } from '../utils/discord';
import type { RouletteHistory } from '../types';
import { computeRouletteWeights } from '../utils/rouletteWeight';

interface Props {
  allUserNames?: string[];
  // 미션 보드에서 후보를 사전 주입하기 위한 옵션. 제공 시 인원 수/이름이 자동 채워짐.
  initialNames?: string[];
  // winner 결정 시 호출. 제공된 경우 자체 디스코드 알림은 생략(미션 보드의 워커 알림과 중복 방지).
  onWinnerDetermined?: (winner: string) => void;
  // 제공 시: 참여대비 당첨률 기반 가중 추첨 + 이력/확률 UI 활성화(경매 룰렛 전용). 미제공 시 균등 추첨.
  history?: RouletteHistory;
  // 한 판 결과를 이력에 기록. history 와 함께 제공.
  onRoundRecord?: (participants: string[], winner: string) => void;
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

export const RouletteGame: React.FC<Props> = ({ allUserNames = [], initialNames, onWinnerDetermined, history, onRoundRecord }) => {
  const seededInitial = initialNames && initialNames.length >= 2 ? initialNames.slice(0, 8) : null;
  const [names, setNames] = useState<string[]>(seededInitial ?? ['', '']);
  const [playerCount, setPlayerCount] = useState(seededInitial ? seededInitial.length : 2);
  const [isSpinning, setIsSpinning] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const discordSentRef = useRef(false);
  const recordedRef = useRef(false);

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
    if (!winner) return;

    // 이력 기록: 매 판 1회. (discord 알림과 독립 — 재추첨해도 판마다 누적)
    if (onRoundRecord && !recordedRef.current) {
      recordedRef.current = true;
      onRoundRecord(activeNames, winner);
    }

    if (!discordSentRef.current) {
      discordSentRef.current = true;
      if (onWinnerDetermined) {
        // 미션 보드 모드: 자체 디스코드 알림 대신 콜백으로 위임 (워커가 미션 정산 알림을 보냄).
        onWinnerDetermined(winner);
      } else {
        const participants = activeNames.join(', ');
        sendDiscordNotification(
          `**룰렛 게임 결과**\n참여자: ${participants}\n🎉 **${winner}** 님이 당첨되셨습니다! 축하드립니다!`
        );
      }
    }
  }, [winner]);

  // 이번 판 참여자별 세그먼트. 칸 너비(angle) = 당첨 확률. 경매(history)면 가중, 아니면 균등.
  const segments = useMemo(() => {
    const n = activeNames.length;
    if (n === 0) return [] as { name: string; chance: number; debt: number; angle: number }[];
    const infos = history
      ? computeRouletteWeights(activeNames, history)
      : activeNames.map((name) => ({ name, chance: 1 / n, debt: 0, weight: 1 }));
    return infos.map((info) => ({ name: info.name, chance: info.chance, debt: info.debt, angle: TAU * info.chance }));
  }, [history, activeNames]);

  // 이력에 저장된 사람(등록 안 된 게스트 포함)도 자동완성 후보에 노출.
  const suggestionNames = useMemo(
    () => Array.from(new Set([...allUserNames, ...(history ? Object.keys(history) : [])])),
    [allUserNames, history],
  );

  // 전체 당첨 이력(참여 많은 순).
  const historyRows = useMemo(() => {
    if (!history) return [];
    return Object.entries(history)
      .map(([name, s]) => ({ name, wins: s.wins, plays: s.plays }))
      .sort((a, b) => b.plays - a.plays || b.wins - a.wins);
  }, [history]);

  useEffect(() => {
    drawRoulette();
  }, [segments, rotation]);

  const handleNameChange = (index: number, value: string) => {
    setNames((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const getFilteredNames = (query: string) => {
    const keyword = query.trim().toLowerCase();

    return suggestionNames.filter((u) => {
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

    // 칸 너비(angle) = 당첨 확률. 누적각으로 그린다.
    let cum = 0;
    segments.forEach((seg, i) => {
      const startAngle = baseOffset + rotation + cum;
      const endAngle = startAngle + seg.angle;
      cum += seg.angle;

      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, outerRadius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 3;
      ctx.stroke();

      // 너무 얇은 칸은 라벨 생략(겹침 방지).
      if (seg.angle < 0.28) return;

      const midAngle = startAngle + seg.angle / 2;
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

      if (history) {
        // 경매 모드: 이름 + 확률(%)을 칸 안에 함께 표기.
        const pct = Math.round(seg.chance * 1000) / 10;
        const safeName = seg.name.length > 8 ? `${seg.name.slice(0, 8)}…` : seg.name;
        ctx.font = '700 15px Pretendard, sans-serif';
        ctx.fillText(safeName, 0, -8);
        ctx.font = '800 13px Pretendard, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillText(`${pct}%`, 0, 10);
      } else {
        ctx.font = '700 16px Pretendard, sans-serif';
        const safeName = seg.name.length > 10 ? `${seg.name.slice(0, 10)}…` : seg.name;
        ctx.fillText(safeName, 0, 0);
      }
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

  // 포인터가 가리키는 세그먼트를 누적각으로 찾는다(가변 너비 대응).
  const getWinnerIndex = (finalRotation: number) => {
    const baseOffset = POINTER_ANGLE - Math.PI / 2;
    const pointerRel = (((POINTER_ANGLE - baseOffset - finalRotation) % TAU) + TAU) % TAU;
    let cum = 0;
    for (let i = 0; i < segments.length; i++) {
      if (pointerRel >= cum && pointerRel < cum + segments[i].angle) return i;
      cum += segments[i].angle;
    }
    return segments.length - 1;
  };

  const spin = () => {
    if (isSpinning || activeNames.length < 2) return;

    setIsSpinning(true);
    setWinner(null);
    recordedRef.current = false;

    // 칸 너비가 곧 확률이므로 균등 랜덤으로 돌려도 넓은 칸이 더 자주 걸린다.
    const startRotation = rotation;
    const extraSpins = 6 + Math.random() * 3;
    const targetRotation = startRotation + extraSpins * TAU + Math.random() * TAU;

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

      const winnerIndex = getWinnerIndex(nextRotation);
      setWinner(segments[winnerIndex].name);
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

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="flex flex-1 flex-col items-center gap-5 rounded-3xl border border-zinc-200 bg-gradient-to-b from-white to-zinc-50 p-6 shadow-sm dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-950">
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

        {history && historyRows.length > 0 && (
          <div className="w-full shrink-0 lg:w-44">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-zinc-500 dark:text-zinc-400">
              <History size={14} />
              당첨 이력
            </div>
            <div className="max-h-[420px] overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <div className="grid grid-cols-[1fr_auto_auto] text-xs">
                <span className="sticky top-0 bg-zinc-50 px-2 py-1.5 font-bold text-zinc-400 dark:bg-zinc-900">이름</span>
                <span className="sticky top-0 bg-zinc-50 px-2 py-1.5 text-right font-bold text-zinc-400 dark:bg-zinc-900">당첨</span>
                <span className="sticky top-0 bg-zinc-50 px-2 py-1.5 text-right font-bold text-zinc-400 dark:bg-zinc-900">참여</span>
                {historyRows.map((row) => (
                  <React.Fragment key={row.name}>
                    <span className="truncate border-t border-zinc-100 px-2 py-1.5 font-bold text-zinc-700 dark:border-zinc-800 dark:text-zinc-200">{row.name}</span>
                    <span className="border-t border-zinc-100 px-2 py-1.5 text-right tabular-nums text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">{row.wins}</span>
                    <span className="border-t border-zinc-100 px-2 py-1.5 text-right tabular-nums text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">{row.plays}</span>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};