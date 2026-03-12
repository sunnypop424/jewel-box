import React, { useEffect, useState } from 'react';
import type { Character, Role, GoldOption, RaidId } from '../types';
import { JOB_OPTIONS, ROLE_OPTIONS } from '../constants';
import { Trash2, Plus, Save, User, Shield, Swords, Loader2, Download, ChevronDown, GripVertical, Search, Users, Info } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { fetchSiblings, fetchProfile, getRoleFromClass } from '../api/lostArkApi';

interface CharacterFormRow {
    uid: string;
    id?: string;
    discordName: string;
    jobCode: string;
    role: Role;
    itemLevel: number | '';
    combatPower: number | '';
    serkaNightmare: boolean;
    valkyCanSupport: boolean;
    lostArkName?: string;
    singleRaids: RaidId[]; 
}

interface Props {
    discordName: string;
    characters: Character[];
    isLoading?: boolean;
    onSubmit: (discordName: string, characters: Character[]) => void;
    onCancel?: () => void;
    onLoadByDiscordName: (targetName: string) => Character[];
}

function SortableCharacterRow({
    row,
    index,
    handleChangeRow,
    handleRemoveRow,
    isSaving,
}: {
    row: CharacterFormRow;
    index: number;
    handleChangeRow: (index: number, field: keyof CharacterFormRow, value: any) => void;
    handleRemoveRow: (index: number) => void;
    isSaving: boolean;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.uid });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 50 : 1,
    };

    // 싱글 토글 함수
    const toggleSingle = (raidId: RaidId) => {
        const next = row.singleRaids.includes(raidId)
            ? row.singleRaids.filter(id => id !== raidId)
            : [...row.singleRaids, raidId];
        handleChangeRow(index, 'singleRaids', next);
    };

    // 🌟 레벨 조건별 싱글 노출 여부 (하한선 및 상한선 정확히 적용)
    // 2막 노말: 1680 ~ 1689 (1690부터는 2막 하드)
    const canDoAct2Normal = typeof row.itemLevel === 'number' && row.itemLevel >= 1680 && row.itemLevel < 1690;
    // 3막 노말: 1680 ~ 1699 (1700부터는 3막 하드)
    const canDoAct3Normal = typeof row.itemLevel === 'number' && row.itemLevel >= 1680 && row.itemLevel < 1700;

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`group relative flex flex-col gap-3 p-4 pt-10 sm:grid sm:grid-cols-12 sm:items-center sm:gap-4 sm:py-3 sm:pr-3 sm:pl-6 bg-white dark:bg-transparent ${
                isDragging ? 'shadow-xl ring-2 ring-indigo-500 rounded-xl' : ''
            }`}
        >
            <div {...attributes} {...listeners} className="absolute left-1 top-1/2 -translate-y-1/2 cursor-grab text-zinc-300 hover:text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity touch-none hidden sm:flex items-center justify-center">
                <GripVertical size={18} />
            </div>

            <div {...attributes} {...listeners} className="absolute right-3 top-3 cursor-grab text-zinc-300 hover:text-zinc-500 sm:hidden touch-none">
                <GripVertical size={18} />
            </div>

            <div className="sm:col-span-3 relative">
                {row.lostArkName && (
                    <div className="absolute right-0.5 top-0.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                        연동: {row.lostArkName}
                    </div>
                )}
                <select
                    className="w-full appearance-none rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium dark:border-zinc-700 dark:bg-zinc-800"
                    value={row.jobCode}
                    onChange={(e) => handleChangeRow(index, 'jobCode', e.target.value)}
                    disabled={isSaving}
                >
                    <option value="">직업 선택</option>
                    {JOB_OPTIONS.map(job => <option key={job} value={job}>{job}</option>)}
                </select>
            </div>

            <div className="sm:col-span-3">
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
                            {row.role === 'SUPPORT' ? <Shield size={14} /> : <Swords size={14} />}
                        </div>
                        <select
                            className={`w-full appearance-none rounded-lg border px-3 py-2 pl-9 text-sm font-medium ${row.role === 'SUPPORT' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30' : 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800'}`}
                            value={row.role}
                            onChange={(e) => handleChangeRow(index, 'role', e.target.value as Role)}
                            disabled={isSaving}
                        >
                            {ROLE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                    </div>
                    {row.jobCode === '발키리' && (
                        <label className="inline-flex select-none items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 py-2 text-xs font-semibold text-zinc-600 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                            <input type="checkbox" checked={row.valkyCanSupport} onChange={(e) => handleChangeRow(index, 'valkyCanSupport', e.target.checked)} disabled={isSaving} className="h-3 w-3 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500" />
                            <span className="whitespace-nowrap">서폿</span>
                        </label>
                    )}
                </div>
            </div>

            <div className="flex gap-3 sm:contents">
                <div className="flex-1 sm:col-span-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                        <input type="number" className="w-full flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium dark:border-zinc-700 dark:bg-zinc-900" value={row.itemLevel} onChange={(e) => handleChangeRow(index, 'itemLevel', e.target.value)} placeholder="Lv" disabled={isSaving} />
                        {typeof row.itemLevel === 'number' && row.itemLevel >= 1740 && (
                            <label className="inline-flex select-none items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 py-2 text-xs font-semibold text-zinc-600 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                                <input type="checkbox" checked={row.serkaNightmare} onChange={(e) => handleChangeRow(index, 'serkaNightmare', e.target.checked)} disabled={isSaving} className="h-3 w-3 shrink-0 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500" />
                                <span className="whitespace-nowrap">나메</span>
                            </label>
                        )}
                    </div>
                </div>
                <div className="flex-1 sm:col-span-2">
                    <input type="number" className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium dark:border-zinc-700 dark:bg-zinc-900" value={row.combatPower} onChange={(e) => handleChangeRow(index, 'combatPower', e.target.value)} placeholder="CP" disabled={isSaving} />
                </div>
            </div>

            <div className="flex justify-end sm:col-span-1 sm:justify-center">
                <button type="button" className="group rounded-lg p-2 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-500 disabled:opacity-30 dark:hover:bg-rose-900/30" onClick={() => handleRemoveRow(index)} disabled={isSaving}>
                    <Trash2 size={16} />
                </button>
            </div>

            {/* 🌟 싱글 모드 설정 (레벨 구간에 맞게 정확히 노출) */}
            {(canDoAct2Normal || canDoAct3Normal) && (
                <div className="sm:col-start-7 sm:col-span-5 flex flex-wrap items-center gap-2 mt-[-4px] pb-1 sm:mt-0 sm:pb-0 px-1 sm:px-0">
                    <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500">싱글 모드</span>
                    
                    {canDoAct2Normal && (
                        <label className="inline-flex cursor-pointer select-none items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-bold text-zinc-600 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800">
                            <input 
                                type="checkbox" 
                                checked={row.singleRaids.includes('ACT2_NORMAL')} 
                                onChange={() => toggleSingle('ACT2_NORMAL')} 
                                disabled={isSaving} 
                                className="h-3.5 w-3.5 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-800" 
                            />
                            <span className="whitespace-nowrap">2막</span>
                        </label>
                    )}
                    
                    {canDoAct3Normal && (
                        <label className="inline-flex cursor-pointer select-none items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-bold text-zinc-600 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800">
                            <input 
                                type="checkbox" 
                                checked={row.singleRaids.includes('ACT3_NORMAL')} 
                                onChange={() => toggleSingle('ACT3_NORMAL')} 
                                disabled={isSaving} 
                                className="h-3.5 w-3.5 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 dark:border-zinc-600 dark:bg-zinc-800" 
                            />
                            <span className="whitespace-nowrap">3막</span>
                        </label>
                    )}
                </div>
            )}
        </div>
    );
}

export const CharacterFormList: React.FC<Props> = ({
    discordName,
    characters,
    isLoading = false,
    onSubmit,
    onCancel,
    onLoadByDiscordName
}) => {
    const [localDiscord, setLocalDiscord] = useState(discordName);
    const [rows, setRows] = useState<CharacterFormRow[]>([]);
    const [isFetching, setIsFetching] = useState(false);
    const [goldOption, setGoldOption] = useState<GoldOption>('ALL_MAX');

    const [searchRosterName, setSearchRosterName] = useState('');
    const [isSearchingRoster, setIsSearchingRoster] = useState(false);
    const [rosterList, setRosterList] = useState<any[]>([]);
    const [checkedRosterNames, setCheckedRosterNames] = useState<Set<string>>(new Set());
    const [searchSingleName, setSearchSingleName] = useState('');
    const [isSearchingSingle, setIsSearchingSingle] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    useEffect(() => {
        setLocalDiscord(discordName);
        if (characters.length > 0) {
            setGoldOption(characters[0].goldOption ?? 'ALL_MAX');
            setRows(characters.map((c, i) => ({
                ...c,
                uid: c.id || `char-${i}-${Date.now()}`,
                serkaNightmare: c.serkaNightmare ?? (c.itemLevel >= 1740),
                valkyCanSupport: c.valkyCanSupport ?? false,
                singleRaids: c.singleRaids || [],
            })));
        } else {
            setGoldOption('ALL_MAX'); 
            setRows([{ uid: `new-0-${Date.now()}`, discordName, jobCode: '', role: 'DPS', itemLevel: 1700, combatPower: '', serkaNightmare: false, valkyCanSupport: false, singleRaids: [] }]);
        }
    }, [discordName, characters]);

    const handlePressEnter = (e: React.KeyboardEvent, callback: () => void) => {
        if (e.key === 'Enter') { e.preventDefault(); callback(); }
    };

    const handleSearchRoster = async () => {
        if (!searchRosterName.trim()) return;
        try {
            setIsSearchingRoster(true);
            const siblings = await fetchSiblings(searchRosterName);
            if (!siblings || siblings.length === 0) throw new Error('캐릭터가 없습니다.');

            const over1680 = siblings
                .filter((s: any) => parseFloat(s.ItemAvgLevel.replace(/,/g, '')) >= 1680)
                .sort((a: any, b: any) => parseFloat(b.ItemAvgLevel.replace(/,/g, '')) - parseFloat(a.ItemAvgLevel.replace(/,/g, '')));

            setRosterList(over1680);
            setCheckedRosterNames(new Set<string>(over1680.slice(0, 6).map((s: any) => s.CharacterName)));
        } catch (e: any) { alert(`원정대 검색 실패: ${e.message}`); }
        finally { setIsSearchingRoster(false); }
    };

    const handleAddSelectedRoster = async () => {
        if (checkedRosterNames.size === 0) return;
        setIsSearchingRoster(true);
        const newRows: CharacterFormRow[] = [];
        for (const charName of Array.from(checkedRosterNames)) {
            if (rows.some(r => r.lostArkName === charName)) continue;
            try {
                const profile = await fetchProfile(charName);
                if (profile) {
                    const lv = parseFloat(profile.ItemAvgLevel.replace(/,/g, ''));
                    const cp = parseFloat(profile.CombatPower.replace(/,/g, ''));
                    newRows.push({
                        uid: `api-${charName}-${Date.now()}`,
                        discordName: localDiscord,
                        lostArkName: profile.CharacterName,
                        jobCode: profile.CharacterClassName,
                        role: getRoleFromClass(profile.CharacterClassName),
                        itemLevel: Math.floor(lv),
                        combatPower: Math.floor(cp),
                        serkaNightmare: lv >= 1740,
                        valkyCanSupport: false,
                        singleRaids: []
                    } as any);
                }
            } catch (e) { console.error(`${charName} 조회 실패`); }
        }
        setRows(prev => [...prev, ...newRows]);
        setRosterList([]); 
        setIsSearchingRoster(false);
    };

    const handleAddSingle = async () => {
        if (!searchSingleName.trim()) return;
        if (rows.some(r => r.lostArkName === searchSingleName)) { alert('이미 추가된 캐릭터입니다.'); return; }
        try {
            setIsSearchingSingle(true);
            const profile = await fetchProfile(searchSingleName);
            if (profile && profile.CharacterName) {
                const lv = parseFloat(profile.ItemAvgLevel.replace(/,/g, ''));
                const cp = parseFloat(profile.CombatPower.replace(/,/g, ''));
                setRows(prev => [...prev, {
                    uid: `api-${profile.CharacterName}-${Date.now()}`,
                    discordName: localDiscord,
                    lostArkName: profile.CharacterName,
                    jobCode: profile.CharacterClassName,
                    role: getRoleFromClass(profile.CharacterClassName),
                    itemLevel: Math.floor(lv),
                    combatPower: Math.floor(cp),
                    serkaNightmare: lv >= 1740,
                    valkyCanSupport: false,
                    singleRaids: []
                }]);
                setSearchSingleName('');
            }
        } catch (e: any) { alert(`캐릭터 검색 실패: ${e.message}`); }
        finally { setIsSearchingSingle(false); }
    };

    const handleFetchFromCloud = async () => {
        const trimmedName = localDiscord.trim();
        if (!trimmedName) { alert('디스코드 닉네임을 먼저 입력해주세요.'); return; }
        try {
            setIsFetching(true);
            const myCharacters = onLoadByDiscordName(trimmedName);
            if (myCharacters.length > 0) {
                setGoldOption(myCharacters[0].goldOption ?? 'ALL_MAX');
                setRows(myCharacters.map((c, i) => ({
                    ...c,
                    uid: c.id || `char-${i}-${Date.now()}`,
                    serkaNightmare: c.serkaNightmare ?? (c.itemLevel >= 1740),
                    valkyCanSupport: c.valkyCanSupport ?? false,
                    singleRaids: c.singleRaids || []
                })));
                alert(`${trimmedName}님의 캐릭터 데이터를 불러왔습니다.`);
            } else { alert('저장된 데이터가 없습니다.'); }
        } catch (e) { alert('데이터 불러오기 중 오류가 발생했습니다.'); }
        finally { setIsFetching(false); }
    };

    const handleChangeRow = (index: number, field: keyof CharacterFormRow, value: any) => {
        setRows(prev => prev.map((row, i) => {
            if (i !== index) return row;
            if (field === 'jobCode') {
                const nextJob = String(value);
                return { ...row, jobCode: nextJob, valkyCanSupport: nextJob === '발키리' ? (row.valkyCanSupport ?? false) : false } as CharacterFormRow;
            }
            if (field === 'itemLevel' || field === 'combatPower') {
                const numValue = value === '' ? '' : Number(value);
                if (field === 'itemLevel') {
                    const prevIl = typeof row.itemLevel === 'number' ? row.itemLevel : 0;
                    const nextIl = typeof numValue === 'number' ? numValue : 0;
                    
                    let nextSerkaNightmare = row.serkaNightmare;
                    if (prevIl < 1740 && nextIl >= 1740) nextSerkaNightmare = true;
                    if (prevIl >= 1740 && nextIl < 1740) nextSerkaNightmare = false;

                    // 🌟 레벨 변경 시 조건을 벗어나면 싱글 모드 자동 해제
                    let nextSingleRaids = [...row.singleRaids];
                    if ((nextIl < 1680 || nextIl >= 1690) && nextSingleRaids.includes('ACT2_NORMAL')) {
                        nextSingleRaids = nextSingleRaids.filter(id => id !== 'ACT2_NORMAL');
                    }
                    if ((nextIl < 1680 || nextIl >= 1700) && nextSingleRaids.includes('ACT3_NORMAL')) {
                        nextSingleRaids = nextSingleRaids.filter(id => id !== 'ACT3_NORMAL');
                    }

                    return { ...row, [field]: numValue, serkaNightmare: nextSerkaNightmare, singleRaids: nextSingleRaids } as CharacterFormRow;
                }
                return { ...row, [field]: numValue } as CharacterFormRow;
            }
            return { ...row, [field]: value } as CharacterFormRow;
        }));
    };

    const handleAddRow = () => {
        setRows(prev => [...prev, { uid: `new-${Date.now()}`, discordName: localDiscord, jobCode: '', role: 'DPS', itemLevel: 1700, combatPower: '', serkaNightmare: false, valkyCanSupport: false, singleRaids: [] }]);
    };

    const handleRemoveRow = (index: number) => {
        if (window.confirm('이 캐릭터를 삭제하시겠습니까?')) {
            setRows(prev => prev.filter((_, i) => i !== index));
        }
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            setRows((items) => {
                const oldIndex = items.findIndex((item) => item.uid === active.id);
                const newIndex = items.findIndex((item) => item.uid === over.id);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
    };

    const handleSubmit = () => {
        const trimmedName = localDiscord.trim();
        const cleaned: Character[] = rows
            .filter(r => r.jobCode && r.itemLevel && r.combatPower !== '')
            .map((r, idx) => {
                // 1. 기본 데이터 구성 (undefined가 들어갈 수 없는 명확한 값들)
                const charData: Character = {
                    id: r.id ?? `${trimmedName}-${idx}-${Date.now()}`,
                    discordName: trimmedName, 
                    jobCode: r.jobCode, 
                    role: r.role,
                    itemLevel: Number(r.itemLevel), 
                    combatPower: Number(r.combatPower),
                    serkaNightmare: Boolean(r.serkaNightmare),
                    valkyCanSupport: r.jobCode === '발키리' ? Boolean(r.valkyCanSupport) : false,
                    goldOption,
                    singleRaids: r.singleRaids || [], // 🌟 데이터 취합
                };

                // 2. 파이어베이스 에러 방지: lostArkName이 실제로 존재할 때만 객체에 추가
                if (r.lostArkName) {
                    charData.lostArkName = r.lostArkName;
                }

                return charData;
            });

        if (cleaned.length === 0) { 
            alert('최소 1개 이상의 캐릭터 정보를 입력해주세요.'); 
            return; 
        }
        onSubmit(trimmedName, cleaned);
    };

    const isSaving = isLoading || isFetching || isSearchingRoster || isSearchingSingle;
    const characterCount = rows.filter(r => r.jobCode).length;

    return (
        <div className="flex flex-col gap-8 pb-4">
            <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                    <label className="text-sm font-bold text-zinc-900 dark:text-zinc-100">디스코드 닉네임</label>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <User size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                            <input className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-3 pl-10 pr-4 text-zinc-900 shadow-sm transition-all focus:border-indigo-500 focus:bg-white dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" value={localDiscord} onChange={(e) => setLocalDiscord(e.target.value)} onKeyDown={(e) => handlePressEnter(e, handleFetchFromCloud)} placeholder="Nickname" disabled={isSaving} />
                        </div>
                        <button type="button" onClick={handleFetchFromCloud} disabled={isSaving} className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-bold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                            {isFetching ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />} <span className="hidden sm:inline">불러오기</span>
                        </button>
                    </div>
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-bold text-zinc-900 dark:text-zinc-100">원정대 골드 수급 옵션</label>
                    <div className="relative">
                        <select className="w-full appearance-none rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 pr-10 text-sm font-medium text-zinc-700 focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200" value={goldOption} onChange={(e) => setGoldOption(e.target.value as GoldOption)} disabled={isSaving}>
                            <option value="ALL_MAX">귀속 골드 포함 최대 골드</option>
                            <option value="GENERAL_MAX">귀속 골드 제외 최대 골드</option>
                            <option value="MAIN_ALL_ALT_GENERAL">본캐만 귀속 포함 (부캐 제외)</option>
                        </select>
                        <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-4 rounded-2xl border border-indigo-100 bg-indigo-50/30 p-5 dark:border-indigo-900/30 dark:bg-indigo-900/10">
                <h4 className="flex items-center gap-2 text-sm font-bold text-indigo-700 dark:text-indigo-400">
                    <Users size={18} /> 로스트아크 연동
                </h4>
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:bg-zinc-900 dark:border-zinc-700 shadow-sm">
                        <label className="text-xs font-bold text-zinc-500 flex items-center gap-1.5"><Info size={14}/> 1680+ 원정대 가져오기</label>
                        <div className="flex gap-2">
                            <input value={searchRosterName} onChange={(e) => setSearchRosterName(e.target.value)} onKeyDown={(e) => handlePressEnter(e, handleSearchRoster)} placeholder="대표 캐릭터명" className="flex-1 rounded-lg border px-3 py-2 text-sm dark:bg-zinc-800 dark:border-zinc-600 dark:text-white" />
                            <button onClick={handleSearchRoster} disabled={isSearchingRoster} className="flex items-center gap-1 rounded-lg bg-indigo-100 px-3 py-2 text-sm font-bold text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-900/50 dark:text-indigo-300 disabled:opacity-50">
                                {isSearchingRoster ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} 검색
                            </button>
                        </div>
                        {rosterList.length > 0 && (
                            <div className="mt-2 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pr-1 scrollbar-thin">
                                    {rosterList.map((char) => (
                                        <label key={char.CharacterName} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 text-xs transition ${checkedRosterNames.has(char.CharacterName) ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30' : 'bg-zinc-50 dark:bg-zinc-800/50 border-transparent hover:border-zinc-300'}`}>
                                            <input type="checkbox" checked={checkedRosterNames.has(char.CharacterName)} onChange={() => {
                                                const next = new Set<string>(checkedRosterNames);
                                                if(next.has(char.CharacterName)) next.delete(char.CharacterName);
                                                else { if(next.size >= 6) { alert('최대 6개까지 선택 가능합니다.'); return; } next.add(char.CharacterName); }
                                                setCheckedRosterNames(next);
                                            }} className="h-3 w-3 rounded text-indigo-600 focus:ring-indigo-500" />
                                            <div className="flex flex-col truncate">
                                                <span className="truncate font-bold dark:text-zinc-200">{char.CharacterName}</span>
                                                <span className="text-[10px] text-zinc-500">Lv.{char.ItemAvgLevel}</span>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                                <button onClick={handleAddSelectedRoster} disabled={isSearchingRoster} className="w-full rounded-lg bg-indigo-600 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-500">선택한 {checkedRosterNames.size}개 캐릭터 추가</button>
                            </div>
                        )}
                    </div>
                    <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:bg-zinc-900 dark:border-zinc-700 shadow-sm">
                        <label className="text-xs font-bold text-zinc-500 flex items-center gap-1.5"><Plus size={14}/> 개별 캐릭터 추가</label>
                        <div className="flex gap-2">
                            <input value={searchSingleName} onChange={(e) => setSearchSingleName(e.target.value)} onKeyDown={(e) => handlePressEnter(e, handleAddSingle)} placeholder="캐릭터 닉네임" className="flex-1 rounded-lg border px-3 py-2 text-sm dark:bg-zinc-800 dark:border-zinc-600 dark:text-white" />
                            <button onClick={handleAddSingle} disabled={isSearchingSingle} className="flex items-center gap-1 rounded-lg bg-indigo-100 px-3 py-2 text-sm font-bold text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-900/50 dark:text-indigo-300 disabled:opacity-50">
                                {isSearchingSingle ? <Loader2 size={16} className="animate-spin" /> : <Plus size={18} />} 추가
                            </button>
                        </div>
                        <p className="text-[10px] text-zinc-400 mt-1">* 검색 시 레벨과 전투력이 자동으로 입력됩니다.</p>
                    </div>
                </div>
            </div>

            <div>
                <div className="mb-3 flex items-center justify-between px-1">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-900 dark:text-zinc-100">
                        내 캐릭터 목록 <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-extrabold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{characterCount}</span>
                    </h3>
                    <span className="text-[10px] text-zinc-400 font-medium flex items-center gap-1"><GripVertical size={12}/> 드래그하여 순서 변경</span>
                </div>

                <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50">
                    <div className="hidden grid-cols-12 gap-4 border-b border-zinc-100 bg-zinc-50/50 px-3 py-2 sm:pl-10 text-xs font-bold text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 sm:grid">
                        <div className="col-span-3">직업</div>
                        <div className="col-span-3">역할</div>
                        <div className="col-span-3">아이템 레벨</div>
                        <div className="col-span-2">전투력</div>
                        <div className="col-span-1 text-center">삭제</div>
                    </div>

                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={rows.map(r => r.uid)} strategy={verticalListSortingStrategy}>
                            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                {rows.map((row, index) => (
                                    <SortableCharacterRow key={row.uid} row={row} index={index} handleChangeRow={handleChangeRow} handleRemoveRow={handleRemoveRow} isSaving={isSaving} />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>

                    <button type="button" onClick={handleAddRow} disabled={isSaving} className="flex w-full items-center justify-center gap-2 border-t border-zinc-100 bg-zinc-50/50 py-4 text-sm font-bold text-zinc-500 transition-all hover:bg-zinc-100 hover:text-indigo-600 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900/30">
                        <Plus size={16} /> 빈 캐릭터 직접 추가하기
                    </button>
                </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-zinc-100 pt-6 dark:border-zinc-800">
                {onCancel && (
                    <button type="button" className="rounded-xl px-6 py-3 text-sm font-bold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={onCancel} disabled={isSaving}>취소</button>
                )}
                <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-10 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 disabled:opacity-70" onClick={handleSubmit} disabled={isSaving}>
                    {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} {isLoading ? '저장 중...' : '설정 저장하기'}
                </button>
            </div>
        </div>
    );
};