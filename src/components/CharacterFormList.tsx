import React, { useEffect, useState, useMemo } from 'react';
import type { Character, Role } from '../types';
import { JOB_OPTIONS, ROLE_OPTIONS } from '../constants';
import { fetchCharacters } from '../api/sheetApi';
import { Trash2, Plus, Save, User, Shield, Swords, Loader2, Info, Download } from 'lucide-react';

interface CharacterFormRow {
  id?: string;
  discordName: string;
  jobCode: string;
  role: Role;
  itemLevel: number | '';
  combatPower: number | '';
}

interface Props {
  discordName: string;
  characters: Character[];
  isLoading?: boolean;
  onSubmit: (discordName: string, characters: Character[]) => void;
  onCancel?: () => void;
}

export const CharacterFormList: React.FC<Props> = ({
  discordName,
  characters,
  isLoading = false,
  onSubmit,
  onCancel
}) => {
  const [localDiscord, setLocalDiscord] = useState(discordName);
  const [rows, setRows] = useState<CharacterFormRow[]>([]);
  const [isFetching, setIsFetching] = useState(false);

  useEffect(() => {
    setLocalDiscord(discordName);
    if (characters.length > 0) {
      setRows(characters.map(c => ({ ...c })));
    } else {
      setRows([{ discordName, jobCode: '', role: 'DPS', itemLevel: 1700, combatPower: '' }]);
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
      const allData = await fetchCharacters();
      const myCharacters = allData.filter(c => c.discordName === trimmedName);

      if (myCharacters.length > 0) {
        setRows(myCharacters.map(c => ({
          id: c.id,
          discordName: c.discordName,
          jobCode: c.jobCode,
          role: c.role,
          itemLevel: c.itemLevel,
          combatPower: c.combatPower
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

  const isModified = useMemo(() => {
    if (localDiscord !== discordName) return true;
    const originalRows = characters.map(c => ({
      id: c.id, discordName: c.discordName, jobCode: c.jobCode, 
      role: c.role, itemLevel: c.itemLevel, combatPower: c.combatPower
    }));
    if (originalRows.length !== rows.length) return true;
    return JSON.stringify(originalRows) !== JSON.stringify(rows);
  }, [localDiscord, rows, discordName, characters]);

  const handleChangeRow = (index: number, field: keyof CharacterFormRow, value: any) => {
    setRows(prev => prev.map((row, i) => i === index ? {
      ...row, [field]: (field === 'itemLevel' || field === 'combatPower') 
      ? (value === '' ? '' : Number(value)) : value
    } : row));
  };

  const handleAddRow = () => {
    setRows(prev => [...prev, { discordName: localDiscord, jobCode: '', role: 'DPS', itemLevel: 1700, combatPower: '' }]);
  };

  const handleRemoveRow = (index: number) => {
    setRows(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    const trimmedName = localDiscord.trim();
    const cleaned: Character[] = rows
      .filter(r => r.jobCode && r.itemLevel && r.combatPower !== '')
      .map((r, idx) => ({
        id: r.id ?? `${trimmedName}-${idx}-${Date.now()}`,
        discordName: trimmedName, jobCode: r.jobCode, role: r.role,
        itemLevel: Number(r.itemLevel), combatPower: Number(r.combatPower)
      }));

    if (cleaned.length === 0) {
      alert('최소 1개 이상의 캐릭터 정보를 입력해주세요.');
      return;
    }
    onSubmit(trimmedName, cleaned);
  };

  return (
    <div className="space-y-8">
      {/* 1. 디스코드 닉네임 입력 & 불러오기 섹션 */}
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
              placeholder="Nickname#1234"
              disabled={isLoading || isFetching}
            />
          </div>
          <button
            type="button"
            onClick={handleFetchFromCloud}
            disabled={isLoading || isFetching}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-bold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            title="내 캐릭터 불러오기"
          >
            {isFetching ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
            <span className="hidden sm:inline">불러오기</span>
          </button>
        </div>
        <p className="mt-2 text-[11px] text-zinc-500">
          다른 기기에서 접속했다면 닉네임을 입력하고 <b>불러오기</b>를 눌러주세요.
        </p>
      </div>

      {/* 2. 캐릭터 리스트 섹션 */}
      <div className="space-y-3">
        {/* 헤더에서 버튼 제거 */}
        <div className="flex items-center justify-between px-1">
          <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-900 dark:text-zinc-100">
            보유 캐릭터
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-extrabold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {rows.filter(r => r.jobCode).length}
            </span>
          </h3>
          {/* 상단 버튼 제거됨 */}
        </div>

        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50">
          {/* 테이블 헤더 */}
          <div className="hidden grid-cols-12 gap-4 border-b border-zinc-100 bg-zinc-50/50 px-4 py-2 text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 sm:grid">
            <div className="col-span-3">직업</div>
            <div className="col-span-3">역할</div>
            <div className="col-span-2">아이템 레벨</div>
            <div className="col-span-3">전투력</div>
            <div className="col-span-1 text-center">삭제</div>
          </div>

          {/* 리스트 본문 */}
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((row, index) => (
              <div key={index} className="flex flex-col gap-3 p-4 sm:grid sm:grid-cols-12 sm:items-center sm:gap-4 sm:p-3">
                <div className="sm:col-span-3">
                  <select
                    className="w-full appearance-none rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium dark:border-zinc-700 dark:bg-zinc-800"
                    value={row.jobCode}
                    onChange={(e) => handleChangeRow(index, 'jobCode', e.target.value)}
                    disabled={isLoading || isFetching}
                  >
                    <option value="">직업 선택</option>
                    {JOB_OPTIONS.map(job => <option key={job} value={job}>{job}</option>)}
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <div className="relative">
                    <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
                      {row.role === 'SUPPORT' ? <Shield size={14} /> : <Swords size={14} />}
                    </div>
                    <select
                      className={`w-full appearance-none rounded-lg border px-3 py-2 pl-9 text-sm font-medium ${
                        row.role === 'SUPPORT'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30'
                          : 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800'
                      }`}
                      value={row.role}
                      onChange={(e) => handleChangeRow(index, 'role', e.target.value as Role)}
                      disabled={isLoading || isFetching}
                    >
                      {ROLE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>
                </div>

                <div className="flex gap-3 sm:contents">
                  <div className="flex-1 sm:col-span-2">
                    <input
                      type="number"
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium dark:border-zinc-700 dark:bg-zinc-900"
                      value={row.itemLevel}
                      onChange={(e) => handleChangeRow(index, 'itemLevel', e.target.value)}
                      placeholder="Lv"
                      disabled={isLoading || isFetching}
                    />
                  </div>
                  <div className="flex-1 sm:col-span-3">
                    <input
                      type="number"
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium dark:border-zinc-700 dark:bg-zinc-900"
                      value={row.combatPower}
                      onChange={(e) => handleChangeRow(index, 'combatPower', e.target.value)}
                      placeholder="CP"
                      disabled={isLoading || isFetching}
                    />
                  </div>
                </div>

                <div className="flex justify-end sm:col-span-1 sm:justify-center">
                  <button
                    type="button"
                    className="group rounded-lg p-2 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-500 disabled:opacity-30 dark:hover:bg-rose-900/30"
                    onClick={() => handleRemoveRow(index)}
                    disabled={rows.length <= 1 || isLoading || isFetching}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* [변경됨] 하단 전체 너비 추가 버튼 (테이블의 마지막 행처럼 동작) */}
          <button
            type="button"
            onClick={handleAddRow}
            disabled={isLoading || isFetching}
            className="flex w-full items-center justify-center gap-2 border-t border-zinc-100 bg-zinc-50/50 py-3 text-sm font-bold text-zinc-500 transition-all hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <Plus size={16} />
            캐릭터 추가하기
          </button>
        </div>
      </div>

      {/* 3. 하단 액션 버튼 */}
      <div className="flex items-center justify-between pt-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          {isModified ? (
            <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 animate-pulse">
              <Info size={16} />
              <span>수정된 내용이 있습니다.</span>
            </div>
          ) : (
            <div className="text-zinc-400 text-xs">최신 상태입니다.</div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {onCancel && (
            <button
              type="button"
              className="rounded-xl px-5 py-2.5 text-sm font-medium text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800"
              onClick={onCancel}
              disabled={isLoading || isFetching}
            >
              취소
            </button>
          )}
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-8 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition-all hover:bg-indigo-500 disabled:opacity-70 dark:shadow-indigo-900/30"
            onClick={handleSubmit}
            disabled={isLoading || isFetching}
          >
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            {isLoading ? '저장 중...' : '저장하기'}
          </button>
        </div>
      </div>
    </div>
  );
};