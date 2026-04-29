import React, { useEffect, useState } from 'react';
import { Search, UserCircle, Users } from 'lucide-react';

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  allUserNames?: string[];
  min?: number;
  max?: number;
  label?: string;
}

// 룰렛/사다리/핀볼과 동일한 UX의 후보군 입력기.
// - 인원 수 ± 버튼
// - 그리드 input + 자동완성 드롭다운(allUserNames 기반)
// - 자유 입력 가능
export const PoolMemberInput: React.FC<Props> = ({
  value,
  onChange,
  allUserNames = [],
  min = 2,
  max = 8,
  label = '후보 인원',
}) => {
  const initialCount = Math.min(Math.max(value.length || min, min), max);
  const [count, setCount] = useState<number>(initialCount);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  // 외부 value 길이가 count 와 어긋나면 동기화 (마운트/리셋 대응).
  useEffect(() => {
    if (value.length !== count) {
      const next = [...value];
      if (count > next.length) {
        while (next.length < count) next.push('');
      } else {
        next.length = count;
      }
      onChange(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  const updateName = (index: number, val: string) => {
    const next = [...value];
    while (next.length < count) next.push('');
    next[index] = val;
    onChange(next);
  };

  const getFilteredNames = (currentValue: string) => {
    const keyword = currentValue.trim().toLowerCase();
    return allUserNames.filter((u) => {
      if (value.includes(u) && u !== currentValue) return false;
      return keyword ? u.toLowerCase().includes(keyword) : true;
    });
  };

  const selectSuggestion = (index: number, name: string) => {
    updateName(index, name);
    setFocusedIndex(null);
  };

  // 모바일은 2열 고정, 데스크톱은 인원 수에 따라 분기 (Tailwind JIT 호환을 위해 정적 클래스 사용).
  const colsClass =
    count <= 2
      ? 'grid-cols-2'
      : count === 3
        ? 'grid-cols-2 sm:grid-cols-3'
        : 'grid-cols-2 sm:grid-cols-4';

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-sm font-bold text-zinc-900 dark:text-zinc-100">
          <Users size={16} className="text-indigo-500" />
          {label}
        </h4>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setCount(Math.max(min, count - 1))}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 font-bold text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            −
          </button>
          <span className="w-6 text-center text-base font-extrabold text-indigo-600 dark:text-indigo-400">
            {count}
          </span>
          <button
            type="button"
            onClick={() => setCount(Math.min(max, count + 1))}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 font-bold text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            +
          </button>
        </div>
      </div>

      <div className={`grid w-full gap-2 ${colsClass}`}>
        {Array.from({ length: count }).map((_, i) => {
          const current = value[i] || '';
          const filtered = getFilteredNames(current);
          return (
            <div key={i} className="relative flex flex-col gap-1">
              <input
                type="text"
                value={current}
                onFocus={() => setFocusedIndex(i)}
                onBlur={() => setTimeout(() => setFocusedIndex((p) => (p === i ? null : p)), 150)}
                onChange={(e) => updateName(i, e.target.value)}
                placeholder={`후보 ${i + 1}`}
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-center text-xs font-bold text-zinc-800 transition-colors placeholder:font-medium placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 sm:text-sm"
              />
              {focusedIndex === i && filtered.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto overflow-x-hidden rounded-lg border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-800 animate-in fade-in zoom-in-95 duration-100">
                  <div className="flex items-center gap-1.5 border-b border-zinc-100 bg-zinc-50/50 p-1.5 text-[10px] font-bold text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900/50">
                    <UserCircle size={12} />
                    {current ? '검색 결과' : '공대원 목록'}
                  </div>
                  {filtered.map((sName) => (
                    <button
                      key={sName}
                      type="button"
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
  );
};
