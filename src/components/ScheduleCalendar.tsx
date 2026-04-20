import React, { useEffect, useMemo, useState } from 'react';
// 월간 달력 UI는 react-calendar 라이브러리를 사용합니다.
// 문서: https://github.com/wojtekmaj/react-calendar
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';

type CalendarValue = Date | null | [Date | null, Date | null];
import '../styles/scheduleCalendar.css';

import { CalendarDays, ChevronDown, Loader2, Plus, Trash2, UserRoundMinus } from 'lucide-react';
import { toast } from 'sonner';

import {
  addPersonalSchedule,
  deletePersonalSchedule,
  fetchPersonalSchedules,
  type PersonalSchedule,
} from '../api/firebaseApi';
import { postScheduleCreateMessage, deleteScheduleMessage } from '../api/scheduleNotifier';
import { useConfirm } from '../hooks/useConfirm';

interface ScheduleCalendarProps {
  currentUser: string;         // "내 원정대 관리"에서 저장해둔 본인 닉네임(있을 수도, 없을 수도)
  allUserNames: string[];      // 드롭다운 옵션 원본
}

// YYYY-MM-DD 포맷팅 (KST 로컬 기준)
function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 시작~종료 사이의 모든 날짜를 YYYY-MM-DD 배열로 반환 (시작 <= 종료 가정)
function enumerateDates(start: Date, end: Date): string[] {
  const result: string[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cur <= last) {
    result.push(formatDateKey(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}

// "YYYY-MM-DD" → "YYYY-MM-DD (요일)" (디스코드 알림 메시지용)
function formatDateWithDow(dateKey: string): string {
  const parts = dateKey.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return dateKey;
  const [y, m, d] = parts;
  const dt = new Date(y, m - 1, d);
  const dow = ['일', '월', '화', '수', '목', '금', '토'][dt.getDay()];
  return `${dateKey} (${dow})`;
}

// 본인 식별값 로컬 저장 키 (같은 브라우저에서는 다시 선택할 필요 없음)
const IDENTITY_KEY = 'schedule_identity_v1';

export const ScheduleCalendar: React.FC<ScheduleCalendarProps> = ({ currentUser, allUserNames }) => {
  const { confirm, ConfirmModal } = useConfirm();

  // 달력에서 선택된 기간 [시작일, 종료일]. 시작=종료 이면 단일 날짜 선택과 동일하게 동작.
  const [dateRange, setDateRange] = useState<[Date, Date]>(() => {
    const d = new Date();
    return [d, d];
  });

  // 본인(나) 식별값: 우선순위 = localStorage > currentUser > 빈 값
  const [identity, setIdentity] = useState<string>(() => {
    if (typeof window === 'undefined') return currentUser || '';
    return window.localStorage.getItem(IDENTITY_KEY) || currentUser || '';
  });

  // identity 변경 시 localStorage 에 저장
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (identity) window.localStorage.setItem(IDENTITY_KEY, identity);
  }, [identity]);

  // currentUser가 나중에 도착하고 identity가 비어있으면 자동 채움
  useEffect(() => {
    if (!identity && currentUser) setIdentity(currentUser);
  }, [currentUser, identity]);

  // 폼 상태
  const [reason, setReason] = useState('');

  // 데이터
  const [schedules, setSchedules] = useState<PersonalSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 초기 로드
  const refresh = async () => {
    try {
      setLoading(true);
      const list = await fetchPersonalSchedules();
      setSchedules(list);
    } catch (e) {
      toast.error('일정 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh().catch(console.error);
  }, []);

  // 날짜별 일정 맵 (O(1) 조회)
  const schedulesByDate = useMemo(() => {
    const map = new Map<string, PersonalSchedule[]>();
    schedules.forEach((s) => {
      if (!map.has(s.date)) map.set(s.date, []);
      map.get(s.date)!.push(s);
    });
    return map;
  }, [schedules]);

  // 파생값: 선택 기간 관련
  const startKey = formatDateKey(dateRange[0]);
  const endKey = formatDateKey(dateRange[1]);
  const isSingleDay = startKey === endKey;
  const selectedKeys = useMemo(() => enumerateDates(dateRange[0], dateRange[1]), [dateRange]);

  // 화면 표시용: 단일일 땐 flat 리스트, 기간일 땐 날짜별 그룹
  const selectedList = useMemo(() => {
    return selectedKeys.flatMap((key) =>
      (schedulesByDate.get(key) ?? []).map((s) => ({ ...s, _date: key }))
    );
  }, [selectedKeys, schedulesByDate]);

  // 달력 셀 내부 컨텐츠: 등록된 공대원 이름을 작은 칩으로 렌더링
  const renderTileContent = ({ date, view }: { date: Date; view: string }) => {
    if (view !== 'month') return null;
    const list = schedulesByDate.get(formatDateKey(date));
    if (!list || list.length === 0) return null;

    const visible = list.slice(0, 2);
    const remain = list.length - visible.length;

    return (
      <div className="sc-chips">
        {visible.map((s) => (
          <span key={s.id} className="sc-chip" title={`${s.discordName} — ${s.reason || ''}`}>
            {s.discordName}
          </span>
        ))}
        {remain > 0 && <span className="sc-chip-more">+{remain}</span>}
      </div>
    );
  };

  // 일요일/토요일 구분용 타일 클래스
  const renderTileClassName = ({ date, view }: { date: Date; view: string }) => {
    if (view !== 'month') return null;
    const list = schedulesByDate.get(formatDateKey(date));
    return list && list.length > 0 ? 'sc-has-event' : null;
  };

  // 등록 / 수정 제출
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identity) {
      toast.error('유저명을 먼저 선택해 주세요.');
      return;
    }
    if (!reason.trim()) {
      toast.error('사유를 입력해 주세요.');
      return;
    }

    try {
      setSubmitting(true);

      // 신규 등록만 지원. 같은 유저가 기간 내 하루라도 이미 등록되어 있으면 에러 안내.
      const datesToProcess = selectedKeys;
      const alreadyRegistered = datesToProcess
        .map((key) => (schedulesByDate.get(key) ?? []).find((s) => s.discordName === identity))
        .filter(Boolean) as PersonalSchedule[];

      if (alreadyRegistered.length > 0) {
        const dupDateList = alreadyRegistered.map((s) => s.date).join(', ');
        toast.error(
          `${identity}님은 다음 날짜에 이미 등록되어 있습니다: ${dupDateList}\n먼저 삭제 후 다시 등록해 주세요.`
        );
        setSubmitting(false);
        return;
      }

      // 1) Discord 채널에 등록 메시지 1건 게시 → messageId 확보
      //    날짜엔 한글 요일을 함께 노출 (예: "2026-04-20 (월)")
      const dateLabel = datesToProcess.length === 1
        ? formatDateWithDow(datesToProcess[0])
        : `${formatDateWithDow(datesToProcess[0])} ~ ${formatDateWithDow(datesToProcess[datesToProcess.length - 1])} (${datesToProcess.length}일)`;
      const messageId = await postScheduleCreateMessage({
        discordName: identity,
        date: dateLabel,
        reason: reason.trim(),
      });

      // 2) Firestore 에 날짜별 문서 생성 (모두 같은 messageId 공유)
      for (const key of datesToProcess) {
        await addPersonalSchedule({
          discordName: identity,
          date: key,
          reason: reason.trim(),
          source: 'web',
          discordMessageId: messageId || undefined,
        });
      }

      toast.success(
        isSingleDay
          ? '일정이 등록되었습니다.'
          : `${datesToProcess.length}일간의 일정이 등록되었습니다.`
      );

      setReason('');
      await refresh();
    } catch (err) {
      console.error(err);
      toast.error('저장에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (s: PersonalSchedule) => {
    const ok = await confirm(
      `${s.discordName}님의 ${s.date} 일정을 삭제할까요?`,
      '일정 삭제'
    );
    if (!ok) return;

    try {
      setSubmitting(true);
      // 1) Firestore 문서 삭제
      await deletePersonalSchedule(s.id);
      // 2) 등록 시 기록해 둔 Discord 메시지가 있으면 함께 삭제
      //    (기간 등록으로 여러 doc 이 같은 messageId 를 공유할 수 있으며,
      //     첫 삭제 후 이어지는 삭제 요청은 404 로 조용히 무시됨)
      await deleteScheduleMessage(s.discordMessageId);
      toast.success('일정이 삭제되었습니다.');
      await refresh();
    } catch (err) {
      toast.error('삭제에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  // 본인으로 선택된 계정의 일정만 삭제 가능
  const canDelete = (s: PersonalSchedule) =>
    !!identity && s.discordName === identity;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-6">
      {/* 좌측: 월간 달력 */}
      <section className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:gap-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300 sm:h-10 sm:w-10">
            <CalendarDays size={18} className="sm:hidden" />
            <CalendarDays size={20} className="hidden sm:block" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 sm:text-base">
                참여 불가 일정 캘린더
              </h3>
              {loading && <Loader2 size={14} className="animate-spin text-zinc-400" />}
            </div>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 sm:text-sm">
              레이드에 <span className="font-bold text-rose-600 dark:text-rose-400">참여할 수 없는 날짜</span>를 미리 공유하는 캘린더입니다. 날짜를 눌러 공대원을 확인하세요.
            </p>
          </div>
        </div>

        <Calendar
          locale="ko-KR"
          calendarType="gregory"
          // 단일 클릭으로 해당 날짜만 선택 → 상단 목록이 바로 갱신됨.
          // 기간 등록이 필요하면 아래 폼의 시작/종료 input 으로 직접 지정할 수 있음.
          value={dateRange[0]}
          onChange={(v: CalendarValue) => {
            if (v instanceof Date) setDateRange([v, v]);
          }}
          tileContent={renderTileContent}
          tileClassName={renderTileClassName}
          formatDay={(_locale, date) => String(date.getDate())}
          formatShortWeekday={(_locale, date) => ['일', '월', '화', '수', '목', '금', '토'][date.getDay()]}
          formatMonthYear={(_locale, date) => `${date.getFullYear()}년 ${date.getMonth() + 1}월`}
          next2Label={null}
          prev2Label={null}
          className="sc-calendar"
        />
      </section>

      {/* 우측: 선택 날짜 상세 + 등록/수정 폼 */}
      <div className="flex flex-col gap-4 sm:gap-6">
        {/* 선택된 날짜의 일정 목록 */}
        <section className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:gap-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300 sm:h-10 sm:w-10">
              <UserRoundMinus size={18} className="sm:hidden" />
              <UserRoundMinus size={20} className="hidden sm:block" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 sm:text-base">
                  {isSingleDay ? startKey : `${startKey} ~ ${endKey}`}
                </h4>
                {!isSingleDay && (
                  <span className="rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-bold text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-200">
                    {selectedKeys.length}일
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 sm:text-sm">
                {isSingleDay
                  ? '이 날짜에 참여할 수 없다고 등록한 공대원 목록입니다.'
                  : '선택한 기간에 참여할 수 없다고 등록한 공대원 목록입니다.'}
              </p>
            </div>
          </div>

          {selectedList.length === 0 ? (
            <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-white/70 px-4 text-center text-sm font-medium text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-500">
              참여 불가 공대원이 없습니다.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {selectedList.map((s) => (
                <li
                  key={s.id}
                  className="flex items-start justify-between gap-2 rounded-xl bg-zinc-50/80 p-3 shadow-sm ring-1 ring-zinc-900/5 dark:bg-zinc-950/70 dark:ring-zinc-800 sm:gap-3 sm:p-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">
                        {s.discordName}
                      </span>
                      {!isSingleDay && (
                        <span className="rounded-lg border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-bold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                          {s.date}
                        </span>
                      )}
                      {s.source === 'discord' && (
                        <span className="rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-200">
                          Discord
                        </span>
                      )}
                    </div>
                    <p className="mt-1 break-words text-xs text-zinc-600 dark:text-zinc-300">
                      {s.reason}
                    </p>
                  </div>

                  {canDelete(s) && (
                    <button
                      type="button"
                      onClick={() => handleDelete(s)}
                      className="shrink-0 rounded-xl p-2 text-zinc-500 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:text-zinc-400 dark:hover:bg-rose-900/30 dark:hover:text-rose-300"
                      title="삭제"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 등록 폼 */}
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:gap-4 sm:p-5"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300 sm:h-10 sm:w-10">
              <Plus size={18} className="sm:hidden" />
              <Plus size={20} className="hidden sm:block" />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 sm:text-base">
                참여 불가일 등록
              </h4>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 sm:text-sm">
                레이드에 참여할 수 없는 날짜를 선택하고 사유를 입력해 주세요.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-bold text-zinc-500">
                유저명
              </label>
              <div className="relative">
                <select
                  value={identity}
                  onChange={(e) => setIdentity(e.target.value)}
                  disabled={submitting}
                  className="w-full appearance-none cursor-pointer rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 pr-10 text-sm font-medium text-zinc-700 transition-all focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-70 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                >
                  <option value="">— 본인 선택 —</option>
                  {allUserNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              </div>
              <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                선택한 유저명의 일정만 본인으로 간주되어 삭제할 수 있습니다. (자동 기억)
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold text-zinc-500">
                날짜
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={startKey}
                  onChange={(e) => {
                    const d = new Date(`${e.target.value}T00:00:00`);
                    setDateRange(([_, end]) => (d > end ? [d, d] : [d, end]));
                  }}
                  onClick={(e) => e.currentTarget.showPicker?.()}
                  disabled={submitting}
                  className="w-full cursor-pointer rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-700 transition-all focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                />
                <span className="shrink-0 text-xs font-bold text-zinc-400">~</span>
                <input
                  type="date"
                  value={endKey}
                  onChange={(e) => {
                    const d = new Date(`${e.target.value}T00:00:00`);
                    setDateRange(([start, _]) => (d < start ? [d, d] : [start, d]));
                  }}
                  onClick={(e) => e.currentTarget.showPicker?.()}
                  disabled={submitting}
                  className="w-full cursor-pointer rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-700 transition-all focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                />
              </div>
              <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                기간 등록은 시작일과 종료일을 다르게 지정해 주세요. 같으면 단일 날짜로 등록됩니다.
              </p>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-zinc-500">
              사유
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={submitting}
              rows={3}
              placeholder="예) 개인 일정, 출장, 컨디션 난조 등"
              className="w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-700 transition-all focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
            />
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800 sm:flex-row sm:justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition-colors hover:bg-indigo-500 disabled:opacity-70"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              등록하기
            </button>
          </div>
        </form>
      </div>

      <ConfirmModal />
    </div>
  );
};
