import React, { useMemo, useState } from 'react';
import type { Character, RaidSchedule, RaidRun, RaidId, RaidExclusionMap, RaidSettingsMap } from '../types';
import { RAID_META } from '../constants';
import {
  Shield, Swords, Users, User, ChevronDown, CircleDashed, CheckCircle2,
  ArrowLeftRight, Check
} from 'lucide-react';

type BalanceMode = 'overall' | 'role' | 'speed';

interface Props {
  schedule: RaidSchedule | null;
  isLoading?: boolean;
  exclusions?: RaidExclusionMap;
  onExcludeCharacter?: (raidId: RaidId, characterId: string) => void;
  balanceMode?: BalanceMode;
  raidSettings?: RaidSettingsMap;
  isRaidSettingsLoading?: boolean;
  onToggleSupportShortage?: (raidId: RaidId, next: boolean) => void;
  raidCandidates?: Partial<Record<RaidId, Character[]>>;

  onSwapCharacter?: (raidId: RaidId, charId1: string, charId2: string) => void;
  allCharacters?: Character[];
  onExcludeRun?: (raidId: RaidId, charIds: string[]) => void;
}

export const RaidScheduleView: React.FC<Props> = ({
  schedule,
  isLoading = false,
  exclusions,
  onExcludeCharacter,
  balanceMode = 'overall',
  raidSettings,
  isRaidSettingsLoading = false,
  onToggleSupportShortage,
  raidCandidates,
  onSwapCharacter,
  allCharacters = [],
  onExcludeRun
}) => {
  const [raidOpenState, setRaidOpenState] = useState<Record<string, boolean>>({});
  const [runOpenState, setRunOpenState] = useState<Record<string, boolean>>({});
  
  const [swapTarget, setSwapTarget] = useState<{ raidId: RaidId, char: Character } | null>(null);

  const candidatesFallback = useMemo(() => {
    const map: Partial<Record<RaidId, Character[]>> = {};
    const safeSchedule = schedule ?? ({} as RaidSchedule);
    (Object.keys(safeSchedule) as RaidId[]).forEach((raidId) => {
      const runs = safeSchedule[raidId] ?? [];
      const members = runs.flatMap((r) => r.parties.flatMap((p) => p.members));
      map[raidId] = members;
    });
    return map;
  }, [schedule]);

  const toggleRaid = (raidId: string) => {
    setRaidOpenState((prev) => ({ ...prev, [raidId]: !(prev[raidId] ?? true) }));
  };

  const toggleRun = (raidId: string, runIndex: number) => {
    const key = `${raidId}-${runIndex}`;
    setRunOpenState((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
  };

  const handleExcludeClick = (raidId: RaidId, characterId: string, characterName: string, raidLabel: string) => {
    if (!onExcludeCharacter) return;
    
    const ok = window.confirm(
      `${characterName} 캐릭터를 "${raidLabel}" 레이드에서 완료(제외) 처리하시겠습니까?`
    );
    
    if (ok) {
      onExcludeCharacter(raidId, characterId);
    }
  };

  if (isLoading) {
    return (
      <div className="grid gap-6">
        {[1, 2, 3].map(i => <div key={i} className="h-40 animate-pulse rounded-3xl bg-zinc-200 dark:bg-zinc-800" />)}
      </div>
    );
  }

  if (!schedule) return null;

  const RAID_ORDER: (keyof RaidSchedule)[] = [
    'ACT4_NORMAL', 'ACT4_HARD', 
    'FINAL_NORMAL', 'FINAL_HARD', 
    'SERKA_NORMAL', 'SERKA_HARD', 'SERKA_NIGHTMARE'
  ];

  const raidIds = RAID_ORDER.filter((raidId) => (schedule[raidId]?.length ?? 0) > 0);

  return (
    <div className="grid gap-6">
      {raidIds.map((raidId) => {
        const runs = schedule[raidId];
        if (!runs || runs.length === 0) return null;

        const meta = RAID_META[raidId];
        const isRaidOpen = raidOpenState[raidId] ?? true;
        const excludedIdsForRaid = exclusions?.[raidId] ?? [];
        
        const diff = meta.difficulty;

        // ✅ [Fix] 다크모드 대응 스타일 정의
        let containerBorder = '';
        let headerClass = '';
        let titleColor = '';
        let dotColor = '';

        if (diff === 'NORMAL') {
          containerBorder = 'border-sky-200 dark:border-sky-800';
          headerClass = 'text-sky-900 border-sky-200 bg-sky-50/50 hover:bg-sky-100 dark:text-sky-100 dark:border-sky-800 dark:bg-sky-900/20 dark:hover:bg-sky-900/40';
          titleColor = 'text-sky-900 dark:text-sky-100';
          dotColor = 'text-sky-500';
        } else if (diff === 'HARD') {
          containerBorder = 'border-rose-200 dark:border-rose-800';
          headerClass = 'text-rose-900 border-rose-200 bg-rose-50/50 hover:bg-rose-100 dark:text-rose-100 dark:border-rose-800 dark:bg-rose-900/20 dark:hover:bg-rose-900/40';
          titleColor = 'text-rose-900 dark:text-rose-100';
          dotColor = 'text-rose-500';
        } else { // NIGHTMARE
          containerBorder = 'border-violet-200 dark:border-violet-800';
          headerClass = 'text-violet-900 border-violet-200 bg-violet-50/50 hover:bg-violet-100 dark:text-violet-100 dark:border-violet-800 dark:bg-violet-900/20 dark:hover:bg-violet-900/40';
          titleColor = 'text-violet-900 dark:text-violet-100';
          dotColor = 'text-violet-500';
        }

        return (
          <div key={raidId} className={`overflow-hidden rounded-3xl border shadow-sm dark:bg-zinc-900 ${containerBorder}`}>
            {/* 레이드 헤더 */}
            <button
              type="button"
              onClick={() => toggleRaid(raidId as string)}
              className={`flex w-full items-center justify-between border-b px-5 py-4 text-left transition-colors ${headerClass} ${isRaidOpen ? 'border-b-zinc-100 dark:border-b-zinc-800' : 'border-transparent'}`}
            >
               <div className="flex items-center gap-3">
                 <div className={`h-3 w-3 rounded-full shadow-sm ring-2 ring-white/50 bg-current ${dotColor}`} />
                 <h4 className={`text-base font-bold ${titleColor}`}>{meta.label}</h4>
               </div>
               
               <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  {onToggleSupportShortage && (
                     <div onClick={e => e.stopPropagation()} className="mr-2 flex items-center">
                        <label className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold ${(raidSettings?.[raidId]) ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-zinc-200 bg-white dark:bg-zinc-900 dark:border-zinc-700'}`}>
                           <input 
                             type="checkbox" 
                             checked={!!raidSettings?.[raidId]} 
                             onChange={e => onToggleSupportShortage(raidId as RaidId, e.target.checked)} 
                             disabled={isRaidSettingsLoading}
                             className="h-3 w-3 text-indigo-600 rounded border-zinc-300"
                           />
                           <span className="dark:text-zinc-300">랏폿</span>
                        </label>
                     </div>
                  )}
                  <ChevronDown size={16} className={`transition-transform ${isRaidOpen ? '' : '-rotate-90'}`} />
               </div>
            </button>

            {isRaidOpen && (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
                <RaidStatusBoard
                  raidId={raidId as RaidId}
                  raidLabel={meta.label}
                  candidates={raidCandidates?.[raidId] ?? candidatesFallback[raidId] ?? []}
                  runs={runs}
                  excludedIds={excludedIdsForRaid}
                  onExclude={(m) => handleExcludeClick(raidId as RaidId, m.id, m.discordName, meta.label)}
                  canExclude={Boolean(onExcludeCharacter)}
                />

                {runs.map((run: RaidRun) => {
                  const runKey = `${raidId}-${run.runIndex}`;
                  const isRunOpen = runOpenState[runKey] ?? true;
                  const visibleMembers = run.parties.flatMap((p) => p.members.filter((m) => !excludedIdsForRaid.includes(m.id)));
                  const dpsMembers = visibleMembers.filter(m => m.role === 'DPS');
                  const supMembers = visibleMembers.filter(m => m.role === 'SUPPORT');
                  
                  const overallAvg = visibleMembers.length > 0 ? Math.round(visibleMembers.reduce((sum, m) => sum + m.combatPower, 0) / visibleMembers.length) : 0;
                  const dpsAvg = dpsMembers.length > 0 ? Math.round(dpsMembers.reduce((sum, m) => sum + m.combatPower, 0) / dpsMembers.length) : 0;
                  const supAvg = supMembers.length > 0 ? Math.round(supMembers.reduce((sum, m) => sum + m.combatPower, 0) / supMembers.length) : 0;

                  return (
                    <div key={run.runIndex} className="p-5">
                      <div className="flex items-center justify-between rounded-xl bg-zinc-50 px-3 py-2 dark:bg-zinc-900/60">
                        <button onClick={() => toggleRun(raidId as string, run.runIndex)} className="flex flex-1 items-center gap-2 text-left">
                           <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{run.runIndex}</span>
                           <span className="text-sm font-semibold dark:text-zinc-200">공격대</span>
                        </button>

                        <div className="flex items-center gap-3">
                           {balanceMode === 'role' ? (
                             <div className="flex gap-2 text-[10px] font-medium text-zinc-500">
                               <span className="flex items-center gap-1"><Swords size={10}/> {dpsAvg.toLocaleString()}</span>
                               <span className="flex items-center gap-1"><Shield size={10}/> {supAvg.toLocaleString()}</span>
                             </div>
                           ) : (
                             <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">CP {overallAvg.toLocaleString()}</span>
                           )}
                           
                           {/* ✅ [공격대 일괄 완료] 버튼 - 에메랄드 */}
                           {onExcludeRun && visibleMembers.length > 0 && (
                             <button
                               onClick={(e) => {
                                 e.stopPropagation();
                                 if(window.confirm(`${meta.label} ${run.runIndex}공격대를 완료 처리하시겠습니까?`)) {
                                   onExcludeRun(raidId as RaidId, visibleMembers.map(m => m.id));
                                 }
                               }}
                               className="inline-flex items-center gap-1 rounded bg-white px-2 py-1 text-xs font-bold text-zinc-600 shadow-sm ring-1 ring-zinc-200 hover:bg-emerald-50 hover:text-emerald-700 hover:ring-emerald-200 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-700 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-300 dark:hover:ring-emerald-800"
                             >
                               <Check size={12} />
                               공격대 완료
                             </button>
                           )}

                           <ChevronDown size={14} onClick={() => toggleRun(raidId as string, run.runIndex)} className={`cursor-pointer text-zinc-400 transition-transform ${isRunOpen ? '' : '-rotate-90'}`} />
                        </div>
                      </div>

                      {isRunOpen && (
                        <div className="mt-4 grid gap-4 lg:grid-cols-2">
                          {run.parties.map((party) => {
                            const pMembers = party.members.filter(m => !excludedIdsForRaid.includes(m.id));
                            const emptySlots = Math.max(0, 4 - pMembers.length);

                            return (
                              <div key={party.partyIndex} className="flex flex-col rounded-2xl border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-950/20">
                                <div className="mb-3 flex items-center justify-between px-1 text-xs font-bold text-zinc-500 dark:text-zinc-400">
                                   <div className="flex items-center gap-1.5"><Users size={14}/><span>PARTY {party.partyIndex}</span></div>
                                   <span className="text-[10px] text-zinc-400">{pMembers.length}/4</span>
                                </div>
                                <div className="flex flex-col gap-2">
                                  {pMembers.map((m) => (
                                    <div key={m.id} className="flex items-center justify-between rounded-xl bg-white p-2.5 shadow-sm ring-1 ring-zinc-900/5 dark:bg-zinc-900 dark:ring-zinc-800">
                                      <div className="flex items-center gap-3">
                                         <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${m.role === 'SUPPORT' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                                            {m.role === 'SUPPORT' ? <Shield size={16}/> : <Swords size={16}/>}
                                         </div>
                                         <div>
                                            <div className="text-sm font-bold dark:text-zinc-100">{m.jobCode}</div>
                                            <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{m.discordName}</div>
                                         </div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                         <div className="text-right">
                                            <div className="text-xs font-bold dark:text-zinc-300">Lv.{m.itemLevel}</div>
                                            <div className="text-[10px] text-zinc-400">{m.combatPower.toLocaleString()}</div>
                                         </div>
                                         
                                         {/* ✅ [변경] 버튼 - 호박색 */}
                                         {onSwapCharacter && (
                                            <button
                                              onClick={() => setSwapTarget({ raidId: raidId as RaidId, char: m })}
                                              className="inline-flex items-center gap-1 rounded bg-white px-2 py-1 text-xs font-bold text-zinc-600 shadow-sm ring-1 ring-zinc-200 hover:bg-amber-50 hover:text-amber-700 hover:ring-amber-200 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-700 dark:hover:bg-amber-900/30 dark:hover:text-amber-300 dark:hover:ring-amber-800"
                                              title="다른 캐릭터로 변경"
                                            >
                                              <ArrowLeftRight size={12} />
                                              변경
                                            </button>
                                         )}

                                         {/* ✅ [완료] 버튼 - 에메랄드 */}
                                         {onExcludeCharacter && (
                                            <button 
                                              onClick={() => handleExcludeClick(raidId as RaidId, m.id, m.discordName, meta.label)} 
                                              className="inline-flex items-center gap-1 rounded bg-white px-2 py-1 text-xs font-bold text-zinc-600 shadow-sm ring-1 ring-zinc-200 hover:bg-emerald-50 hover:text-emerald-700 hover:ring-emerald-200 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-700 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-300 dark:hover:ring-emerald-800"
                                              title="완료(제외) 처리"
                                            >
                                               <Check size={12}/>
                                               완료
                                            </button>
                                         )}
                                      </div>
                                    </div>
                                  ))}
                                  {Array.from({ length: emptySlots }).map((_, i) => (
                                    <div key={i} className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-200 py-3 text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-600">
                                       <User size={14} className="opacity-50"/> 빈 자리
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {swapTarget && (
         <SwapModal
            isOpen={!!swapTarget}
            onClose={() => setSwapTarget(null)}
            target={swapTarget}
            candidates={allCharacters.filter(c => c.discordName === swapTarget.char.discordName)}
            onConfirm={(targetCharId: string) => {
               onSwapCharacter?.(swapTarget.raidId, swapTarget.char.id, targetCharId);
               setSwapTarget(null);
            }}
         />
      )}
    </div>
  );
};

function RaidStatusBoard(props: {
  raidId: RaidId;
  raidLabel: string;
  candidates: Character[];
  runs: RaidRun[];
  excludedIds: string[];
  canExclude: boolean;
  onExclude: (m: Character) => void;
}) {
  const { candidates, runs, excludedIds } = props;
  const uniqueCandidates = Array.from(new Map(candidates.map(c => [c.id, c])).values());
  const excludedSet = new Set(excludedIds);
  const placedIds = new Set(runs.flatMap(r => r.parties.flatMap(p => p.members.map(m => m.id))));

  const sortKey = (a: Character, b: Character) => b.combatPower - a.combatPower;
  const completed = uniqueCandidates.filter(c => excludedSet.has(c.id)).sort(sortKey);
  const assigned = uniqueCandidates.filter(c => !excludedSet.has(c.id) && placedIds.has(c.id)).sort(sortKey);
  const unassigned = uniqueCandidates.filter(c => !excludedSet.has(c.id) && !placedIds.has(c.id)).sort(sortKey);

  return (
    <div className="flex flex-col gap-5 p-6">
      <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
        <StatusColumn title="미배치 / 대기" count={unassigned.length} icon={<CircleDashed size={16}/>} color="amber">
           {unassigned.map(m => <RaidMemberCard key={m.id} member={m} {...props}/>)}
        </StatusColumn>
        <StatusColumn title="배치됨" count={assigned.length} icon={<Users size={16}/>} color="blue">
           {assigned.map(m => <RaidMemberCard key={m.id} member={m} {...props}/>)}
        </StatusColumn>
        <StatusColumn title="완료" count={completed.length} icon={<CheckCircle2 size={16}/>} color="zinc">
           {completed.map(m => <div key={m.id} className="opacity-50 grayscale"><RaidMemberCard member={m} {...props} isReadOnly/></div>)}
        </StatusColumn>
      </div>
    </div>
  );
}

function StatusColumn({ title, count, icon, color, children }: any) {
   const colors: any = {
      amber: 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-900/20 dark:border-amber-900/30',
      blue: 'text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-900/20 dark:border-blue-900/30',
      zinc: 'text-zinc-700 bg-zinc-100 border-zinc-200 dark:text-zinc-400 dark:bg-zinc-800 dark:border-zinc-700'
   };
   return (
      <div className="flex flex-col rounded-2xl border border-zinc-200 bg-zinc-50/50 h-full dark:border-zinc-800 dark:bg-zinc-950/20">
         <div className={`flex items-center justify-between border-b px-4 py-3 rounded-t-2xl ${colors[color]} border-inherit`}>
            <div className="flex items-center gap-2 text-sm font-bold">{icon}<span>{title}</span></div>
            <span className="rounded-full bg-white/60 px-2 py-0.5 text-xs font-extrabold dark:bg-black/20">{count}</span>
         </div>
         <div className="flex-1 overflow-y-auto p-3 max-h-[274px] flex flex-col gap-2">
            {React.Children.count(children) === 0 ? <div className="py-8 text-center text-xs text-zinc-400">없음</div> : children}
         </div>
      </div>
   );
}

function RaidMemberCard({ member, canExclude, onExclude, isReadOnly }: any) {
   return (
      <div className="group flex items-center justify-between rounded-xl bg-white p-2.5 shadow-sm ring-1 ring-zinc-900/5 hover:shadow-md dark:bg-zinc-900 dark:ring-zinc-800">
         <div className="flex items-center gap-3">
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${member.role==='SUPPORT'?'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400':'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'}`}>
               {member.role==='SUPPORT'?<Shield size={16}/>:<Swords size={16}/>}
            </div>
            <div>
               <div className="text-sm font-bold dark:text-zinc-100">{member.jobCode}</div>
               <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{member.discordName}</div>
            </div>
         </div>
         <div className="flex items-center gap-3">
            <div className="text-right">
               <div className="text-xs font-bold dark:text-zinc-300">Lv.{member.itemLevel}</div>
               <div className="text-[10px] text-zinc-400">{member.combatPower.toLocaleString()}</div>
            </div>
            {!isReadOnly && canExclude && (
               <button onClick={() => onExclude(member)} className="inline-flex items-center gap-1 rounded bg-white px-2 py-1 text-xs font-bold text-zinc-600 shadow-sm ring-1 ring-zinc-200 hover:bg-emerald-50 hover:text-emerald-700 hover:ring-emerald-200 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-700 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-300 dark:hover:ring-emerald-800">
                  <Check size={12} />
                  완료
               </button>
            )}
         </div>
      </div>
   );
}

function SwapModal({ isOpen, onClose, target, candidates, onConfirm }: any) {
    if (!isOpen) return null;
    
    // 교체 후보 필터링: "같은 유저" & "자기 자신 제외" (candidates에 이미 같은 유저 필터링된 리스트가 들어옴)
    const myCandidates = candidates.filter((c: Character) => 
        c.id !== target.char.id
    );

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-zinc-900">
                <div className="border-b bg-zinc-50 px-4 py-3 font-bold dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">
                    캐릭터 변경
                </div>
                <div className="p-4">
                    <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
                        <span className="font-bold text-zinc-900 dark:text-zinc-100">{target.char.jobCode}</span>
                        ({target.char.discordName}) 캐릭터를 아래 캐릭터와 교체합니다.
                    </p>
                    
                    <div className="flex max-h-[300px] flex-col gap-2 overflow-y-auto">
                        {myCandidates.length === 0 ? (
                            <div className="py-4 text-center text-xs text-zinc-400">교체 가능한 캐릭터가 없습니다.</div>
                        ) : (
                            myCandidates.map((c: Character) => (
                                <button
                                    key={c.id}
                                    onClick={() => onConfirm(c.id)}
                                    className="flex items-center justify-between rounded-xl border border-zinc-200 p-3 text-left hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                                >
                                    <div className="flex items-center gap-2">
                                        <span className={`flex h-6 w-6 items-center justify-center rounded text-[10px] ${c.role === 'SUPPORT' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                                            {c.role === 'SUPPORT' ? <Shield size={12}/> : <Swords size={12}/>}
                                        </span>
                                        <span className="text-sm font-bold dark:text-zinc-200">{c.jobCode}</span>
                                    </div>
                                    <div className="text-xs text-zinc-400">Lv.{c.itemLevel}</div>
                                </button>
                            ))
                        )}
                    </div>
                </div>
                <div className="flex items-center justify-end gap-2 border-t bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
                    <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-500 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800">취소</button>
                </div>
            </div>
        </div>
    );
}