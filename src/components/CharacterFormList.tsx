import React, { useEffect, useState } from 'react';
import type { Character, Role, GoldOption } from '../types';
import { JOB_OPTIONS, ROLE_OPTIONS } from '../constants';
import { Trash2, Plus, Save, User, Shield, Swords, Loader2, Download, ChevronDown, GripVertical } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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

  return (
    <div
      ref={setNodeRef}
      style={style}
      // 🌟 relative 추가 및 sm:pl-10 (데스크탑 좌측 여백), pt-10 (모바일 상단 여백) 추가하여 겹침 방지
      className={`group relative flex flex-col gap-3 p-4 pt-10 sm:grid sm:grid-cols-12 sm:items-center sm:gap-4 sm:py-3 sm:pr-3 sm:pl-6 bg-white dark:bg-transparent ${
        isDragging ? 'shadow-xl ring-2 ring-indigo-500 rounded-xl' : ''
      }`}
    >
      {/* 데스크탑용 드래그 핸들 (좌측 고정) */}
      <div
        {...attributes}
        {...listeners}
        className="absolute left-1 top-1/2 -translate-y-1/2 cursor-grab text-zinc-300 hover:text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity touch-none hidden sm:flex items-center justify-center"
        title="드래그하여 순서 변경"
      >
        <GripVertical size={18} />
      </div>

      {/* 모바일용 드래그 핸들 (우측 상단 고정) */}
      <div
        {...attributes}
        {...listeners}
        className="absolute right-3 top-3 cursor-grab text-zinc-300 hover:text-zinc-500 sm:hidden touch-none"
      >
        <GripVertical size={18} />
      </div>

      <div className="sm:col-span-3">
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
              className={`w-full appearance-none rounded-lg border px-3 py-2 pl-9 text-sm font-medium ${row.role === 'SUPPORT'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30'
                : 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800'
                }`}
              value={row.role}
              onChange={(e) => handleChangeRow(index, 'role', e.target.value as Role)}
              disabled={isSaving}
            >
              {ROLE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>

          {row.jobCode === '발키리' && (
            <label className="inline-flex select-none items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 py-2 text-xs font-semibold text-zinc-600 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={row.valkyCanSupport}
                onChange={(e) => handleChangeRow(index, 'valkyCanSupport', e.target.checked)}
                disabled={isSaving}
                className="h-3 w-3 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="whitespace-nowrap">서폿</span>
            </label>
          )}
        </div>
      </div>

      <div className="flex gap-3 sm:contents">
        <div className="flex-1 sm:col-span-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
            <input
              type="number"
              className="w-full flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium dark:border-zinc-700 dark:bg-zinc-900"
              value={row.itemLevel}
              onChange={(e) => handleChangeRow(index, 'itemLevel', e.target.value)}
              placeholder="Lv"
              disabled={isSaving}
            />

            {typeof row.itemLevel === 'number' && row.itemLevel >= 1740 && (
              <label className="inline-flex select-none items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 py-2 text-xs font-semibold text-zinc-600 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={row.serkaNightmare}
                  onChange={(e) => handleChangeRow(index, 'serkaNightmare', e.target.checked)}
                  disabled={isSaving}
                  className="h-3 w-3 shrink-0 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="whitespace-nowrap">나메</span>
              </label>
            )}
          </div>
        </div>
        <div className="flex-1 sm:col-span-2">
          <input
            type="number"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium dark:border-zinc-700 dark:bg-zinc-900"
            value={row.combatPower}
            onChange={(e) => handleChangeRow(index, 'combatPower', e.target.value)}
            placeholder="CP"
            disabled={isSaving}
          />
        </div>
      </div>

      <div className="flex justify-end sm:col-span-1 sm:justify-center">
        <button
          type="button"
          className="group rounded-lg p-2 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-500 disabled:opacity-30 dark:hover:bg-rose-900/30"
          onClick={() => handleRemoveRow(index)}
          disabled={isSaving}
        >
          <Trash2 size={16} />
        </button>
      </div>
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
      })));
    } else {
      setGoldOption('ALL_MAX'); 
      setRows([{ uid: `new-0-${Date.now()}`, discordName, jobCode: '', role: 'DPS', itemLevel: 1700, combatPower: '', serkaNightmare: false, valkyCanSupport: false }]);
    }
  }, [discordName, characters]);

  const handleFetchFromCloud = async () => {
    const trimmedName = localDiscord.trim();
    if (!trimmedName) {
      alert('데이터를 불러올 디스코드 닉네임을 먼저 입력해주세요.');
      return;
    }

    try {
      setIsFetching(true);
      const myCharacters = onLoadByDiscordName(trimmedName);

      if (myCharacters.length > 0) {
        setGoldOption(myCharacters[0].goldOption ?? 'ALL_MAX');
        setRows(myCharacters.map((c, i) => ({
          id: c.id,
          uid: c.id || `char-${i}-${Date.now()}`,
          discordName: c.discordName,
          jobCode: c.jobCode,
          role: c.role,
          itemLevel: c.itemLevel,
          combatPower: c.combatPower,
          serkaNightmare: c.serkaNightmare ?? (c.itemLevel >= 1740),
          valkyCanSupport: c.valkyCanSupport ?? false,
        })));
        alert(`${trimmedName}님의 캐릭터 ${myCharacters.length}개를 불러왔습니다.`);
      } else {
        alert('해당 닉네임으로 저장된 데이터가 없습니다.');
      }
    } catch (e) {
      console.error(e);
      alert('데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsFetching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleFetchFromCloud();
    }
  };

  const handleChangeRow = (index: number, field: keyof CharacterFormRow, value: any) => {
    setRows(prev => prev.map((row, i) => {
      if (i !== index) return row;

      if (field === 'jobCode') {
        const nextJob = String(value);
        return {
          ...row,
          jobCode: nextJob,
          valkyCanSupport: nextJob === '발키리' ? (row.valkyCanSupport ?? false) : false,
        } as CharacterFormRow;
      }

      if (field === 'itemLevel' || field === 'combatPower') {
        const numValue = value === '' ? '' : Number(value);

        if (field === 'itemLevel') {
          const prevIl = typeof row.itemLevel === 'number' ? row.itemLevel : 0;
          const nextIl = typeof numValue === 'number' ? numValue : 0;

          if (prevIl < 1740 && nextIl >= 1740) {
            return { ...row, itemLevel: numValue, serkaNightmare: true };
          }
          if (prevIl >= 1740 && nextIl < 1740) {
            return { ...row, itemLevel: numValue, serkaNightmare: false };
          }
        }
        return { ...row, [field]: numValue } as CharacterFormRow;
      }
      return { ...row, [field]: value } as CharacterFormRow;
    }));
  };

  const handleAddRow = () => {
    setRows(prev => [...prev, { uid: `new-${prev.length}-${Date.now()}`, discordName: localDiscord, jobCode: '', role: 'DPS', itemLevel: 1700, combatPower: '', serkaNightmare: false, valkyCanSupport: false }]);
  };

  const handleRemoveRow = (index: number) => {
    setRows(prev => prev.filter((_, i) => i !== index));
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
      .map((r, idx) => ({
        id: r.id ?? `${trimmedName}-${idx}-${Date.now()}`,
        discordName: trimmedName, jobCode: r.jobCode, role: r.role,
        itemLevel: Number(r.itemLevel),
        combatPower: Number(r.combatPower),
        serkaNightmare: Boolean(r.serkaNightmare),
        valkyCanSupport: r.jobCode === '발키리' ? Boolean(r.valkyCanSupport) : false,
        goldOption,
      }));

    if (cleaned.length === 0) {
      alert('최소 1개 이상의 캐릭터 정보를 입력해주세요.');
      return;
    }
    onSubmit(trimmedName, cleaned);
  };

  const isSaving = isLoading || isFetching;
  const characterCount = rows.filter(r => r.jobCode).length;

  return (
    <div className="space-y-8">
      <div>
        <label className="mb-2 block text-sm font-bold text-zinc-900 dark:text-zinc-100">
          디스코드 닉네임
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <User size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-3 pl-10 pr-4 text-zinc-900 shadow-sm transition-all placeholder:text-zinc-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-indigo-400"
              value={localDiscord}
              onChange={(e) => {
                const v = e.target.value;
                setLocalDiscord(v);
                setRows(prev => prev.map(r => ({ ...r, discordName: v })));
              }}
              onKeyDown={handleKeyDown}
              placeholder="Nickname#1234"
              disabled={isSaving}
            />
          </div>
          <button
            type="button"
            onClick={handleFetchFromCloud}
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-bold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            title="내 캐릭터 불러오기"
          >
            {isFetching ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
            <span className="hidden sm:inline">불러오기</span>
          </button>
        </div>
        <p className="mt-2 text-[11px] text-zinc-500">
          다른 기기에서 접속했다면 닉네임을 입력하고 <b>불러오기</b>(엔터)를 눌러주세요.
        </p>
        <div className="mt-5 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <label className="mb-2 block text-sm font-bold text-zinc-900 dark:text-zinc-100">
            원정대 골드 수급 옵션
          </label>
          <div className="relative">
            <select
              className="w-full appearance-none rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 pr-10 text-sm font-medium text-zinc-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
              value={goldOption}
              onChange={(e) => setGoldOption(e.target.value as GoldOption)}
              disabled={isSaving}
            >
              <option value="ALL_MAX">귀속 골드 포함 최대 골드로 받기</option>
              <option value="GENERAL_MAX">귀속 골드 제외 최대 골드로 받기</option>
              <option value="MAIN_ALL_ALT_GENERAL">본캐만 귀속 골드 포함하고 부캐는 귀속 골드 제외하기</option>
            </select>
            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400">
              <ChevronDown size={16} />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">
            * <b>본캐</b>는 등록된 캐릭터 중 <b>아이템 레벨이 가장 높은 캐릭터</b>로 자동 판별됩니다.
          </p>
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between px-1">
          <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-900 dark:text-zinc-100">
            보유 캐릭터
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-extrabold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {characterCount}
            </span>
          </h3>
        </div>

        <p className="px-1 mb-2 text-[11px] text-zinc-500">
          왼쪽 빈 공간을 드래그하여 순서를 변경할 수 있습니다.
        </p>

        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50">
          {/* 🌟 헤더도 동일하게 sm:pl-10을 주어 세로 정렬이 맞게 함 */}
          <div className="hidden grid-cols-12 gap-4 border-b border-zinc-100 bg-zinc-50/50 px-3 py-2 sm:pl-10 text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 sm:grid">
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
                  <SortableCharacterRow
                    key={row.uid}
                    row={row}
                    index={index}
                    handleChangeRow={handleChangeRow}
                    handleRemoveRow={handleRemoveRow}
                    isSaving={isSaving}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <button
            type="button"
            onClick={handleAddRow}
            disabled={isSaving}
            className="flex w-full items-center justify-center gap-2 border-t border-zinc-100 bg-zinc-50/50 py-3 text-sm font-bold text-zinc-500 transition-all hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <Plus size={16} />
            캐릭터 추가하기
          </button>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-zinc-100 pt-6 dark:border-zinc-800">
        {onCancel && (
          <button
            type="button"
            className="rounded-xl px-5 py-2.5 text-sm font-medium text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800"
            onClick={onCancel}
            disabled={isSaving}
          >
            취소
          </button>
        )}
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-8 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition-all hover:bg-indigo-500 disabled:opacity-70 dark:shadow-indigo-900/30"
          onClick={handleSubmit}
          disabled={isSaving}
        >
          {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          {isLoading ? '저장 중...' : '저장하기'}
        </button>
      </div>
    </div>
  );
};