import React, { useState, useEffect, useRef, useMemo } from 'react';
import Matter from 'matter-js';
import {
  Users,
  Play,
  RefreshCw,
  Trophy,
  Search,
  UserCircle,
  Flag,
  Settings2,
  CheckCircle2,
  Medal,
  ChevronDown,
} from 'lucide-react';

interface Props {
  onClose?: () => void;
  allUserNames?: string[];
}

export const PinballGame: React.FC<Props> = ({ allUserNames = [] }) => {
  const [step, setStep] = useState<'setup' | 'game'>('setup');
  const [playerCount, setPlayerCount] = useState<number>(4);
  const [names, setNames] = useState<string[]>(Array(8).fill(''));
  const [winningRank, setWinningRank] = useState<number>(0);

  const [winner, setWinner] = useState<string | null>(null);
  const [finishOrder, setFinishOrder] = useState<string[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const engineRef = useRef<Matter.Engine | null>(null);
  const renderRef = useRef<Matter.Render | null>(null);
  const runnerRef = useRef<Matter.Runner | null>(null);
  const rafRef = useRef<number | null>(null);

  const MARBLE_RADIUS = 11;
  const COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

  const setupNames = useMemo(
    () => names.slice(0, playerCount).map((name, i) => name.trim() || `참여자 ${i + 1}`),
    [names, playerCount],
  );

  useEffect(() => {
    setWinningRank((prev) => Math.min(prev, playerCount - 1));
  }, [playerCount]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocusedIndex(null);
      }
    };

    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const handleNameChange = (idx: number, val: string) => {
    const next = [...names];
    next[idx] = val;
    setNames(next);
    setFocusedIndex(idx);
  };

  const selectSuggestion = (idx: number, name: string) => {
    const next = [...names];
    next[idx] = name;
    setNames(next);
    setFocusedIndex(null);
  };

  const getFilteredNames = (val: string) => {
    const trimmed = val.trim().toLowerCase();

    return allUserNames.filter((u) => {
      const isDuplicate = names.some((n, i) => i !== focusedIndex && n === u);
      if (isDuplicate) return false;
      return !trimmed || u.toLowerCase().includes(trimmed);
    });
  };

  const cleanupEngine = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (renderRef.current) {
      Matter.Render.stop(renderRef.current);
      renderRef.current.canvas.width = 0;
      renderRef.current.canvas.height = 0;
      renderRef.current.textures = {};
      renderRef.current = null;
    }

    if (runnerRef.current) {
      Matter.Runner.stop(runnerRef.current);
      runnerRef.current = null;
    }

    if (engineRef.current) {
      Matter.World.clear(engineRef.current.world, false);
      Matter.Engine.clear(engineRef.current);
      engineRef.current = null;
    }
  };

  const startGame = () => {
    setWinner(null);
    setFinishOrder([]);
    setFocusedIndex(null);
    setStep('game');
  };

  const resetSetup = () => {
    cleanupEngine();
    setStep('setup');
    setWinner(null);
    setFinishOrder([]);
  };

  useEffect(() => {
    if (step !== 'game' || !canvasRef.current) return;

    // 실제 맵 크기 (600x1500) 및 카메라 화각 크기 (450x450, 정사각형) 설정
    const worldWidth = 600;
    const worldHeight = 1500;
    const cameraViewSize = 600; 
    
    // 캔버스 디스플레이 크기는 600x600 고정
    const canvasDisplaySize = 600;

    const exitLeft = 240;
    const exitRight = 360;
    const finishZoneTop = 1445; 

    const engine = Matter.Engine.create({
      gravity: { x: 0, y: 0.85 },
    });
    engineRef.current = engine;

    const render = Matter.Render.create({
      canvas: canvasRef.current,
      engine,
      options: {
        width: canvasDisplaySize,
        height: canvasDisplaySize,
        background: 'transparent',
        wireframes: false,
        pixelRatio: window.devicePixelRatio || 1,
        hasBounds: true, // 카메라 시점 이동 및 줌을 위한 필수 옵션
      },
    });
    renderRef.current = render;

    const world = engine.world;
    const activeNames = setupNames;

    const createWallFromPath = (points: { x: number; y: number }[], thickness: number, color: string) => {
      const bodies = [];
      for (let i = 0; i < points.length; i++) {
        bodies.push(
          Matter.Bodies.circle(points[i].x, points[i].y, thickness / 2, {
            isStatic: true,
            render: { fillStyle: color },
          })
        );
        if (i < points.length - 1) {
          const p1 = points[i];
          const p2 = points[i + 1];
          const cx = (p1.x + p2.x) / 2;
          const cy = (p1.y + p2.y) / 2;
          const length = Math.hypot(p2.x - p1.x, p2.y - p1.y);
          const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

          bodies.push(
            Matter.Bodies.rectangle(cx, cy, length, thickness, {
              isStatic: true,
              angle: angle,
              render: { fillStyle: color },
            })
          );
        }
      }
      return bodies;
    };

    const WALL_THICKNESS = 24;
    const WALL_COLOR = '#27272a';

    const leftPathPoints = [
      { x: 12, y: -100 }, { x: 12, y: 1350 }, { x: 240, y: 1450 }, { x: 240, y: 1600 }
    ];
    const rightPathPoints = [
      { x: 588, y: -100 }, { x: 588, y: 1350 }, { x: 360, y: 1450 }, { x: 360, y: 1600 }
    ];
    const leftContinuousWall = createWallFromPath(leftPathPoints, WALL_THICKNESS, WALL_COLOR);
    const rightContinuousWall = createWallFromPath(rightPathPoints, WALL_THICKNESS, WALL_COLOR);

    // 입구 깔때기 (벽에 완전 밀착)
    const entranceWalls = [
      Matter.Bodies.rectangle(115, 90, 240, 14, { isStatic: true, angle: Math.PI / 6, render: { fillStyle: WALL_COLOR } }),
      Matter.Bodies.rectangle(485, 90, 240, 14, { isStatic: true, angle: -Math.PI / 6, render: { fillStyle: WALL_COLOR } }),
    ];

    const fixedWalls = [
      Matter.Bodies.rectangle(100, 360, 300, 14, { isStatic: true, angle: 0.2, render: { fillStyle: WALL_COLOR } }),
      Matter.Bodies.rectangle(420, 460, 200, 14, { isStatic: true, angle: -0.15, render: { fillStyle: WALL_COLOR } }),
      Matter.Bodies.rectangle(500, 560, 300, 14, { isStatic: true, angle: -0.25, render: { fillStyle: WALL_COLOR } }),
      Matter.Bodies.rectangle(200, 840, 220, 14, { isStatic: true, angle: 0.15, render: { fillStyle: WALL_COLOR } }),
      Matter.Bodies.rectangle(80, 960, 260, 14, { isStatic: true, angle: 0.3, render: { fillStyle: WALL_COLOR } }),
      Matter.Bodies.rectangle(400, 1060, 160, 14, { isStatic: true, angle: 0, render: { fillStyle: WALL_COLOR } }),
      Matter.Bodies.rectangle(520, 1160, 260, 14, { isStatic: true, angle: -0.2, render: { fillStyle: WALL_COLOR } }),
      Matter.Bodies.rectangle(150, 1260, 180, 14, { isStatic: true, angle: 0.2, render: { fillStyle: WALL_COLOR } }),
    ];

    const pegPositions: {x: number, y: number}[] = [];
    const PEG_RADIUS = 5; 
    
    const addPlinko = (startY: number, rows: number, cols1: number, cols2: number, startX1: number, startX2: number) => {
      const gapX = 48;
      const gapY = 42;
      for (let row = 0; row < rows; row++) {
        const y = startY + row * gapY;
        const isEven = row % 2 === 0;
        const cols = isEven ? cols1 : cols2;
        const startX = isEven ? startX1 : startX2;
        for (let col = 0; col < cols; col++) {
          pegPositions.push({ x: startX + col * gapX, y });
        }
      }
    };

    addPlinko(180, 4, 7, 6, 156, 180); 
    addPlinko(650, 4, 8, 7, 132, 156);
    addPlinko(1340, 2, 7, 6, 156, 180);

    const pegs = pegPositions.map(p => 
      Matter.Bodies.circle(p.x, p.y, PEG_RADIUS, { isStatic: true, render: { fillStyle: WALL_COLOR } })
    );

    const spinnerConfigs = [
      { x: 300, y: 310, width: 120, speed: 0.05 },
      { x: 180, y: 510, width: 100, speed: -0.06 },
      { x: 260, y: 610, width: 140, speed: 0.04 },
      { x: 300, y: 810, width: 160, speed: -0.05 },
      { x: 420, y: 920, width: 100, speed: 0.06 },
      { x: 260, y: 1100, width: 120, speed: -0.05 },
      { x: 300, y: 1420, width: 120, speed: 0.05 },
    ];

    const spinners = spinnerConfigs.map((cfg, i) =>
      Matter.Bodies.rectangle(cfg.x, cfg.y, cfg.width, 14, {
        isStatic: true,
        chamfer: { radius: 7 },
        render: { fillStyle: i === spinnerConfigs.length - 1 ? '#ef4444' : '#4f46e5' }, 
      }),
    );

    const marbles = activeNames.map((name, i) =>
      Matter.Bodies.circle(worldWidth / 2 + (Math.random() * 30 - 15), 30 - i * 28, MARBLE_RADIUS, {
        restitution: 0.95,
        friction: 0.001,
        frictionAir: 0.001,
        density: 0.0012,
        label: name,
        render: { fillStyle: COLORS[i % COLORS.length] },
      }),
    );

    Matter.World.add(world, [
      ...leftContinuousWall, 
      ...rightContinuousWall,
      ...entranceWalls,
      ...fixedWalls,
      ...pegs,
      ...spinners,
      ...marbles,
    ]);

    // 라벨 렌더링 (카메라 줌/이동 시 좌표 매핑)
    const renderLabels = () => {
      const ctx = render.context;
      ctx.save();

      if (render.bounds) {
        const scaleX = render.options.width! / (render.bounds.max.x - render.bounds.min.x);
        const scaleY = render.options.height! / (render.bounds.max.y - render.bounds.min.y);
        ctx.scale(scaleX, scaleY);
        ctx.translate(-render.bounds.min.x, -render.bounds.min.y);
      }

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '700 12px Pretendard, sans-serif';

      marbles.forEach((m) => {
        const { x, y } = m.position;
        const name = m.label.length > 8 ? `${m.label.slice(0, 8)}…` : m.label;

        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.fillStyle = '#111827';
        ctx.strokeText(name, x, y - 18);
        ctx.fillText(name, x, y - 18);
      });

      ctx.restore();
    };

    Matter.Events.on(render, 'afterRender', renderLabels);

    const runner = Matter.Runner.create();
    runnerRef.current = runner;

    Matter.Runner.run(runner, engine);
    Matter.Render.run(render);

    let localFinishOrder: string[] = [];
    let isGameFinished = false; // 당첨자가 정해졌는지 여부
    let cameraX = (worldWidth - cameraViewSize) / 2;
    let cameraY = 0;

    const checkWinner = () => {
      // 1. 구슬 도착 및 승리 조건 판정
      marbles.forEach((m) => {
        const isInsideExit =
          m.position.y > finishZoneTop &&
          m.position.x > exitLeft &&
          m.position.x < exitRight;

        if (!localFinishOrder.includes(m.label) && isInsideExit) {
          localFinishOrder.push(m.label);
          setFinishOrder([...localFinishOrder]);

          if (localFinishOrder.length === winningRank + 1) {
            setWinner(m.label);
            isGameFinished = true; // 결과 확정 시 플래그 켜기
            if (engineRef.current) {
              engineRef.current.timing.timeScale = 0.55; // 슬로우 모션 연출
            }
          }
        }
      });

      // 2. 스피너 회전 연산
      spinners.forEach((s, i) => {
        Matter.Body.setAngle(s, s.angle + spinnerConfigs[i].speed);
      });

      // 3. 다이나믹 카메라 추적 로직 (X축, Y축 모두)
      if (!isGameFinished) {
        // 아직 도착하지 않은 구슬들 중 가장 아래(Y값이 큰)에 있는 구슬을 1등으로 선정
        const activeMarbles = marbles.filter(m => !localFinishOrder.includes(m.label));
        
        if (activeMarbles.length > 0) {
          const leader = activeMarbles.reduce((prev, current) =>
            prev.position.y > current.position.y ? prev : current
          );

          // X축 타겟 계산 (리더를 카메라 중앙에)
          let targetX = leader.position.x - (cameraViewSize / 2);
          targetX = Math.max(0, Math.min(targetX, worldWidth - cameraViewSize));

          // Y축 타겟 계산 (진행 방향인 아래쪽이 더 많이 보이게 리더를 살짝 위쪽에 배치)
          let targetY = leader.position.y - (cameraViewSize * 0.4);
          targetY = Math.max(0, Math.min(targetY, worldHeight - cameraViewSize));

          // 부드러운 카메라 이동 (Lerp 스무딩)
          cameraX += (targetX - cameraX) * 0.08;
          cameraY += (targetY - cameraY) * 0.08;
        }
      }

      // 카메라 화면 Bounds 업데이트
      if (render.bounds) {
        render.bounds.min.x = cameraX;
        render.bounds.max.x = cameraX + cameraViewSize;
        render.bounds.min.y = cameraY;
        render.bounds.max.y = cameraY + cameraViewSize;
      }

      // 모든 구슬이 도착할 때까지 반복
      if (localFinishOrder.length < activeNames.length) {
        rafRef.current = requestAnimationFrame(checkWinner);
      }
    };

    rafRef.current = requestAnimationFrame(checkWinner);

    return () => {
      Matter.Events.off(render, 'afterRender', renderLabels);
      cleanupEngine();
    };
  }, [step, setupNames, winningRank, playerCount]);

  return (
    <div ref={containerRef} className="flex flex-col gap-6 animate-in fade-in duration-300">
      {step === 'setup' ? (
        <div className="space-y-6">
          {/* ----- 인원 설정 UI ----- */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-900 dark:text-zinc-100">
                <Users size={18} className="text-indigo-500" />
                참여 인원 설정
              </h3>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setPlayerCount(Math.max(2, playerCount - 1))}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 font-bold text-zinc-600 transition hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  -
                </button>
                <span className="w-6 text-center text-lg font-extrabold text-indigo-600 dark:text-indigo-400">
                  {playerCount}
                </span>
                <button
                  onClick={() => setPlayerCount(Math.min(8, playerCount + 1))}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 font-bold text-zinc-600 transition hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
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
                      value={names[i]}
                      onFocus={() => setFocusedIndex(i)}
                      onChange={(e) => handleNameChange(i, e.target.value)}
                      placeholder={`참여자 ${i + 1}`}
                      className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-1 py-2 text-center text-[11px] font-bold text-zinc-800 placeholder:font-medium placeholder:text-zinc-400 transition-colors focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 sm:px-3 sm:text-sm"
                    />

                    {focusedIndex === i && filteredList.length > 0 && (
                      <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-x-hidden overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-800 animate-in fade-in zoom-in-95 duration-100">
                        <div className="flex items-center gap-1.5 border-b border-zinc-100 bg-zinc-50/50 p-1.5 text-[10px] font-bold text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900/50">
                          <UserCircle size={12} />
                          {names[i]?.trim() ? '검색 결과' : '공대원 목록'}
                        </div>

                        {filteredList.map((sName) => (
                          <button
                            key={sName}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => selectSuggestion(i, sName)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold text-zinc-600 transition hover:bg-indigo-50 hover:text-indigo-600 dark:text-zinc-300 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-400"
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

          {/* ----- 당첨 조건 설정 UI ----- */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-zinc-900 dark:text-zinc-100">
              <Settings2 size={18} className="text-amber-500" />
              당첨 조건 설정
            </h3>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setWinningRank(0)}
                className={`min-w-[100px] flex-1 rounded-xl border-2 py-2.5 text-sm font-bold transition-all ${
                  winningRank === 0
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300'
                    : 'border-zinc-100 text-zinc-500 hover:border-zinc-200 dark:border-zinc-800 dark:text-zinc-400'
                }`}
              >
                1등 (가장 먼저)
              </button>

              <button
                onClick={() => setWinningRank(playerCount - 1)}
                className={`min-w-[100px] flex-1 rounded-xl border-2 py-2.5 text-sm font-bold transition-all ${
                  winningRank === playerCount - 1
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300'
                    : 'border-zinc-100 text-zinc-500 hover:border-zinc-200 dark:border-zinc-800 dark:text-zinc-400'
                }`}
              >
                꼴찌 (가장 늦게)
              </button>

              {/* 변경하신 디자인이 적용된 Select 박스 */}
              <div className="relative flex-1 min-w-[130px]">
                <select
                  value={winningRank}
                  onChange={(e) => setWinningRank(Number(e.target.value))}
                  className="w-full appearance-none rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 pr-10 text-sm font-medium text-zinc-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                >
                  {Array.from({ length: playerCount }).map((_, i) => (
                    <option key={i} value={i}>
                      {i + 1}번째 도착
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400">
                  <ChevronDown size={16} />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/60 px-4 py-3 text-xs font-bold text-indigo-700 dark:border-indigo-900/50 dark:bg-indigo-950/20 dark:text-indigo-300">
            카메라가 결과 확정 전까지 "남은 구슬 중 1등"을 X축, Y축 모두 추적하도록 변경되었습니다.
          </div>

          <button
            onClick={startGame}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-4 text-lg font-black text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-500"
          >
            <Play size={22} fill="currentColor" />
            마블 레이스 시작!
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <div className="flex w-full items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2 text-sm font-bold text-zinc-900 dark:text-white">
                <Flag size={16} className="text-indigo-500" />
                {winningRank === 0
                  ? '가장 먼저'
                  : winningRank === playerCount - 1
                  ? '가장 늦게'
                  : `${winningRank + 1}번째로`}{' '}
                도착한 구슬이 승리!
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                현재 {finishOrder.length} / {playerCount} 명 도착 완료
              </div>
            </div>

            <button
              onClick={resetSetup}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            >
              <RefreshCw size={14} />
              다시 설정
            </button>
          </div>

          <div className="relative flex w-full justify-center overflow-hidden rounded-3xl border-4 border-zinc-200 bg-gradient-to-b from-zinc-100 to-zinc-50 shadow-inner dark:border-zinc-800 dark:from-zinc-950 dark:to-zinc-900">
            {/* 정사각형 비율 유지용 캔버스 (크기는 600x600으로 화면에 맞게 출력) */}
            <canvas
              ref={canvasRef}
              width={600}
              height={600}
              className="h-auto w-full max-w-[560px] aspect-square bg-[#18181b]/5"
            />

            {winner && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm animate-in fade-in duration-300">
                <div className="w-full max-w-sm rounded-3xl border-2 border-indigo-500 bg-white p-8 text-center shadow-2xl dark:bg-zinc-900">
                  <Trophy size={48} className="mx-auto mb-3 text-amber-500" />
                  <div className="mb-1 text-sm font-bold uppercase tracking-[0.24em] text-zinc-500">
                    Congratulations
                  </div>
                  <div className="mb-1 text-3xl font-black text-zinc-900 dark:text-white">{winner}</div>
                  <div className="mb-6 text-sm font-bold text-indigo-600 dark:text-indigo-400">
                    {winningRank + 1}번째 도착 당첨!
                  </div>

                  <button
                    onClick={resetSetup}
                    className="w-full rounded-2xl bg-indigo-600 py-3 text-sm font-bold text-white transition hover:bg-indigo-500"
                  >
                    결과 닫기
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
            {finishOrder.map((name, i) => {
              const isWinningRank = i === winningRank;
              const medalColor =
                i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-orange-400' : 'text-zinc-300';

              return (
                <div
                  key={`${name}-${i}`}
                  className={`flex items-center gap-2 rounded-xl border p-2.5 text-xs font-bold transition ${
                    isWinningRank
                      ? 'border-amber-200 bg-amber-50 text-amber-700 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300'
                      : 'border-zinc-200 bg-white text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400'
                  }`}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[10px] dark:bg-zinc-800">
                    {i + 1}
                  </span>
                  <span className="truncate">{name}</span>
                  {isWinningRank ? (
                    <CheckCircle2 size={14} className="ml-auto shrink-0" />
                  ) : (
                    <Medal size={13} className={`ml-auto shrink-0 ${medalColor}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};