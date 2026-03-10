import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Users, Shuffle, Play, RefreshCw, Trophy, Frown, ArrowDown, ListChecks, Search, UserCircle } from 'lucide-react';

interface Props {
  onClose?: () => void;
  allUserNames?: string[];
}

const COLORS = [
  '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
];

const SVG_W = 1000;
const SVG_H = 600;
const TOP_PAD = 20;
const BOT_PAD = 20;
const ROW_CNT = 12;
const ROW_H = (SVG_H - TOP_PAD - BOT_PAD) / ROW_CNT;

export const LadderGame: React.FC<Props> = ({ allUserNames = [] }) => {
  const [step, setStep] = useState<'setup' | 'game'>('setup');

  // --- Setup State ---
  const [playerCount, setPlayerCount] = useState<number>(4);
  const [names, setNames] = useState<string[]>(Array(8).fill('')); 
  const [results, setResults] = useState<boolean[]>([]); 
  
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const suggestionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    shuffleResults(playerCount);
  }, [playerCount]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionRef.current && !suggestionRef.current.contains(e.target as Node)) {
        setFocusedIndex(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const shuffleResults = (count: number) => {
    const arr = Array(count).fill(false);
    const winIndex = Math.floor(Math.random() * count);
    arr[winIndex] = true;
    setResults(arr);
  };

  const handleNameChange = (index: number, val: string) => {
    const newNames = [...names];
    newNames[index] = val;
    setNames(newNames);
    setFocusedIndex(index);
  };

  const selectSuggestion = (index: number, name: string) => {
    const newNames = [...names];
    newNames[index] = name;
    setNames(newNames);
    setFocusedIndex(null);
  };

  // 🌟 [수정] 필터 로직: 비어있을 때는 전체 목록, 입력 시에는 필터링 (이미 선택된 이름 제외)
  const getFilteredNames = (currentValue: string) => {
    const trimmed = currentValue.trim().toLowerCase();
    
    return allUserNames.filter(name => {
      const isAlreadySelected = names.includes(name);
      if (isAlreadySelected) return false; // 이미 다른 칸에 들어간 이름은 제외
      
      if (!trimmed) return true; // 아무것도 안 쳤을 때는 전체 반환
      return name.toLowerCase().includes(trimmed); // 쳤을 때는 검색
    });
  };

  const startGame = () => {
    const newLines = Array.from({ length: ROW_CNT }, () => Array(playerCount - 1).fill(false));
    for (let c = 0; c < playerCount - 1; c++) {
      let placedCount = 0;
      const rows = Array.from({ length: ROW_CNT }, (_, i) => i);
      for (let i = rows.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rows[i], rows[j]] = [rows[j], rows[i]];
      }
      for (const r of rows) {
        if (placedCount >= 4) { if (Math.random() > 0.3) continue; }
        if (c > 0 && newLines[r][c - 1]) continue;
        newLines[r][c] = true;
        placedCount++;
      }
    }
    setLines(newLines);
    setRevealed(Array(playerCount).fill(false));
    setFinishedPaths(Array(playerCount).fill(false));
    setShowAll(false);
    setStep('game');
  };

  const resetGame = () => {
    setStep('setup');
    shuffleResults(playerCount);
  };

  const [lines, setLines] = useState<boolean[][]>([]); 
  const [revealed, setRevealed] = useState<boolean[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [finishedPaths, setFinishedPaths] = useState<boolean[]>([]);

  const revealPath = (index: number) => {
    if (revealed[index] || showAll) return;
    const newRevealed = [...revealed];
    newRevealed[index] = true;
    setRevealed(newRevealed);
    setTimeout(() => {
      setFinishedPaths((prev) => {
        const next = [...prev];
        next[index] = true;
        return next;
      });
    }, 2000);
  };

  const revealAll = () => {
    setShowAll(true);
    setRevealed(Array(playerCount).fill(true));
    setFinishedPaths(Array(playerCount).fill(true));
  };

  const pathsData = useMemo(() => {
    if (step !== 'game' || lines.length === 0) return [];
    const colW = SVG_W / playerCount;
    const getX = (c: number) => (colW / 2) + c * colW;
    const getY = (r: number) => TOP_PAD + r * ROW_H;
    return Array.from({ length: playerCount }).map((_, startCol) => {
      const path: { x: number; y: number }[] = [];
      let currCol = startCol;
      let len = 0;
      path.push({ x: getX(currCol), y: TOP_PAD });
      for (let r = 0; r < ROW_CNT; r++) {
        path.push({ x: getX(currCol), y: getY(r + 0.5) });
        len += ROW_H * 0.5;
        if (currCol < playerCount - 1 && lines[r][currCol]) {
          currCol++; path.push({ x: getX(currCol), y: getY(r + 0.5) }); len += colW;
        } else if (currCol > 0 && lines[r][currCol - 1]) {
          currCol--; path.push({ x: getX(currCol), y: getY(r + 0.5) }); len += colW;
        }
        path.push({ x: getX(currCol), y: getY(r + 1) }); len += ROW_H * 0.5;
      }
      path.push({ x: getX(currCol), y: SVG_H - BOT_PAD });
      const pathString = path.map((p) => `${p.x},${p.y}`).join(' ');
      return { pathString, length: len, endCol: currCol };
    });
  }, [playerCount, lines, step]);

  if (step === 'setup') {
    return (
      <div className="flex flex-col gap-6 animate-fade-in" ref={suggestionRef}>
        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-900 dark:text-zinc-100">
              <Users size={18} className="text-indigo-500" />
              참여 인원 설정
            </h3>
            <div className="flex items-center gap-3">
              <button onClick={() => setPlayerCount(Math.max(2, playerCount - 1))} className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 font-bold">-</button>
              <span className="text-lg font-extrabold w-6 text-center text-indigo-600 dark:text-indigo-400">{playerCount}</span>
              <button onClick={() => setPlayerCount(Math.min(8, playerCount + 1))} className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 font-bold">+</button>
            </div>
          </div>

          <div className="grid w-full gap-2" style={{ gridTemplateColumns: `repeat(${playerCount}, minmax(0, 1fr))` }}>
            {Array.from({ length: playerCount }).map((_, i) => {
              const filteredList = getFilteredNames(names[i]);
              return (
                <div key={i} className="relative flex flex-col gap-1">
                  <input
                    type="text"
                    value={names[i]}
                    onFocus={() => setFocusedIndex(i)}
                    onChange={(e) => handleNameChange(i, e.target.value)}
                    placeholder={`참여자 ${i + 1}`}
                    className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-1 py-2 sm:px-3 text-[11px] sm:text-sm font-bold text-zinc-800 placeholder:font-medium placeholder:text-zinc-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 text-center transition-colors"
                  />
                  
                  {/* 🌟 자동완성 드롭다운: 클릭 시 전체, 입력 시 필터링 */}
                  {focusedIndex === i && filteredList.length > 0 && (
                    <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto overflow-x-hidden rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-800 animate-in fade-in zoom-in-95 duration-100 scrollbar-thin scrollbar-thumb-zinc-200">
                      <div className="p-1.5 border-b border-zinc-100 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/50 flex items-center gap-1.5 text-[10px] font-bold text-zinc-400">
                         <UserCircle size={12} /> {names[i] ? '검색 결과' : '공대원 목록'}
                      </div>
                      {filteredList.map((sName) => (
                        <button
                          key={sName}
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

        <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-900 dark:text-zinc-100">
              <Trophy size={18} className="text-amber-500" />
              당첨 위치
            </h3>
            <button onClick={() => shuffleResults(playerCount)} className="flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400"><Shuffle size={14} />랜덤 섞기</button>
          </div>
          <div className="grid w-full gap-2" style={{ gridTemplateColumns: `repeat(${playerCount}, minmax(0, 1fr))` }}>
            {results.slice(0, playerCount).map((isWin, i) => (
              <div key={i} className={`flex flex-col items-center justify-center rounded-xl border py-3 ${isWin ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-400 shadow-sm' : 'border-zinc-200 bg-zinc-50 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800/50'}`}><span className="text-xs font-extrabold">{isWin ? '당첨' : '꽝'}</span></div>
            ))}
          </div>
        </div>

        <button onClick={startGame} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3.5 text-base font-bold text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 transition-all"><Play size={18} fill="currentColor" />결과보기 (사다리 타기)</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">결과를 확인할 참여자를 클릭하세요!</h3>
        <div className="flex gap-2">
          <button onClick={revealAll} disabled={showAll} className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-900/50 dark:bg-indigo-900/30 dark:text-indigo-300"><ArrowDown size={14} />전체 결과 보기</button>
          <button onClick={resetGame} className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"><RefreshCw size={14} />다시 설정</button>
        </div>
      </div>

      <div className="w-full rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 overflow-x-auto overflow-y-hidden">
        <div className="min-w-[800px] pb-4 relative mx-auto">
          <div className="relative w-full h-12 mb-2">
            {names.slice(0, playerCount).map((name, i) => (
              <div key={i} className="absolute top-0 bottom-0 px-1.5 flex items-end justify-center" style={{ left: `${(i / playerCount) * 100}%`, width: `${100 / playerCount}%` }}>
                <button onClick={() => revealPath(i)} className={`w-full truncate rounded-lg border px-1 py-2 text-[13px] font-bold shadow-sm transition-all ${revealed[i] || showAll ? 'scale-95 border-transparent text-white opacity-90' : 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-indigo-300 hover:bg-indigo-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'}`} style={{ backgroundColor: revealed[i] || showAll ? COLORS[i % COLORS.length] : undefined }}>
                  {name || `참여자 ${i + 1}`}
                </button>
              </div>
            ))}
          </div>
          <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full h-auto drop-shadow-sm min-h-[400px]">
            {Array.from({ length: playerCount }).map((_, c) => ( <line key={`v-${c}`} x1={(SVG_W/playerCount/2) + c*(SVG_W/playerCount)} y1={TOP_PAD} x2={(SVG_W/playerCount/2) + c*(SVG_W/playerCount)} y2={SVG_H - BOT_PAD} stroke="currentColor" className="text-zinc-200 dark:text-zinc-800" strokeWidth="4" strokeLinecap="round" /> ))}
            {lines.map((rowArr, r) => rowArr.map((hasLine, c) => hasLine ? ( <line key={`h-${r}-${c}`} x1={(SVG_W/playerCount/2) + c*(SVG_W/playerCount)} y1={TOP_PAD + (r + 0.5) * ROW_H} x2={(SVG_W/playerCount/2) + (c + 1)*(SVG_W/playerCount)} y2={TOP_PAD + (r + 0.5) * ROW_H} stroke="currentColor" className="text-zinc-200 dark:text-zinc-800" strokeWidth="4" strokeLinecap="round" /> ) : null))}
            {pathsData.map((data, i) => ( <polyline key={`path-${i}`} points={data.pathString} fill="none" stroke={COLORS[i % COLORS.length]} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={data.length} strokeDashoffset={revealed[i] || showAll ? 0 : data.length} className="transition-all" style={{ transitionDuration: showAll ? '0s' : '2s', transitionTimingFunction: 'linear', opacity: revealed[i] || showAll ? 1 : 0 }} /> ))}
          </svg>
          <div className="relative w-full h-12 mt-2 z-10">
            {results.slice(0, playerCount).map((isWin, targetIndex) => {
              const winnerStartIdx = pathsData.findIndex(d => d.endCol === targetIndex);
              const isFinished = winnerStartIdx >= 0 ? finishedPaths[winnerStartIdx] || showAll : false;
              return (
                <div key={targetIndex} className="absolute top-0 bottom-0 px-1.5 flex items-start justify-center transition-all duration-300" style={{ left: `${(targetIndex / playerCount) * 100}%`, width: `${100 / playerCount}%` }}>
                  <div className={`flex w-full flex-col items-center justify-center rounded-lg border py-2.5 transition-all duration-500 ${isWin ? 'border-amber-400 bg-amber-50 text-amber-600 shadow-sm dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-400' : 'border-zinc-300 bg-zinc-100 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800/50'} ${isFinished ? 'scale-110 shadow-md ring-2 ring-indigo-500/20 z-20' : 'opacity-80'}`}>
                    <span className="text-sm font-extrabold flex items-center gap-1">{isWin && <Trophy size={14} />}{!isWin && <Frown size={14} />}{isWin ? '당첨' : '꽝'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {showAll && (
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80 animate-fade-in">
          <h4 className="mb-4 flex items-center gap-2 text-sm font-bold text-zinc-900 dark:text-zinc-100 border-b border-zinc-100 pb-3 dark:border-zinc-800"><ListChecks size={18} className="text-indigo-500" />최종 결과</h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {names.slice(0, playerCount).map((name, i) => {
              const endCol = pathsData[i]?.endCol;
              const isWin = results[endCol];
              return (
                <div key={i} className={`flex items-center justify-between rounded-xl px-4 py-3 border transition-colors ${isWin ? 'bg-amber-50/50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800 ring-1 ring-amber-400/50 shadow-sm scale-[1.02]' : 'bg-zinc-50 border-zinc-100 dark:bg-zinc-950/50 dark:border-zinc-800/50'}`}>
                  <span className={`font-bold text-sm truncate pr-2 ${isWin ? 'text-amber-700 dark:text-amber-300' : 'text-zinc-700 dark:text-zinc-300'}`}>{name || `참여자 ${i + 1}`}</span>
                  <div className="flex items-center gap-2 shrink-0"><span className="text-zinc-300 dark:text-zinc-600 text-[10px]">▶</span><span className={`text-sm font-extrabold ${isWin ? 'text-amber-500 dark:text-amber-400' : 'text-zinc-400 dark:text-zinc-500'}`}>{isWin ? '당첨 🎉' : '꽝'}</span></div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};