// 차원술사 111 운용 가이드 — 개인별 현황의 차원술사 카드에서 열어 게임 위에 PiP로 띄운다.
// 내용 출처: 차원술사_운용법.md (스킬키를 색상 칩으로 표기해 사이클을 한눈에 볼 수 있게 정리).
import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, PictureInPicture2 } from 'lucide-react';
import { Modal } from './Modal';
import { PIP_SUPPORTED, usePipWindow } from '../hooks/usePipWindow';

// 스킬키 색상 — 파랑: 주력 딜 / 노랑: 시너지·짤 / 보라: 유틸 / T: 초각성 / Z: 아덴 진입·탈출
// 키캡 느낌: 연한 배경 + 같은 계열의 진한 보더·글자.
const BLUE = 'border-blue-400 bg-blue-50 text-blue-600 dark:border-blue-500/70 dark:bg-blue-500/10 dark:text-blue-300';
const AMBER = 'border-amber-400 bg-amber-50 text-amber-600 dark:border-amber-500/70 dark:bg-amber-500/10 dark:text-amber-300';
const VIOLET = 'border-violet-400 bg-violet-50 text-violet-600 dark:border-violet-500/70 dark:bg-violet-500/10 dark:text-violet-300';
const ROSE = 'border-rose-400 bg-rose-50 text-rose-600 dark:border-rose-500/70 dark:bg-rose-500/10 dark:text-rose-300';
const ZINC = 'border-zinc-400 bg-zinc-50 text-zinc-600 dark:border-zinc-500/70 dark:bg-zinc-500/10 dark:text-zinc-300';
const KEY_STYLE: Record<string, string> = {
    F: BLUE, R: BLUE, D: BLUE, E: BLUE,
    Q: AMBER, W: AMBER,
    A: VIOLET, S: VIOLET,
    T: ROSE,
    Z: ZINC,
};

// 스킬키 칩 — 문장 속에 인라인으로 끼워 넣는 정사각형 키캡.
function K({ k }: { k: keyof typeof KEY_STYLE }) {
    return (
        <span className={`mx-px inline-flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border align-[1px] text-[10px] font-black leading-none ${KEY_STYLE[k]}`}>
            {k}
        </span>
    );
}

function Section({ no, title, warn, children }: { no: string; title: ReactNode; warn?: boolean; children: ReactNode }) {
    return (
        <section className={`rounded-xl border p-2.5 ${warn ? 'border-rose-200 bg-rose-50/60 dark:border-rose-900/50 dark:bg-rose-950/20' : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'}`}>
            <h3 className={`mb-1 flex items-center gap-1.5 text-[13px] font-bold ${warn ? 'text-rose-700 dark:text-rose-300' : 'text-zinc-900 dark:text-zinc-100'}`}>
                {warn
                    ? <AlertTriangle size={14} className="shrink-0" />
                    : <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-black text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-300">{no}</span>}
                {title}
            </h3>
            <div className="flex flex-col gap-1 text-xs leading-[1.7] text-zinc-700 dark:text-zinc-300">
                {children}
            </div>
        </section>
    );
}

export function DimensionalistGuideContent() {
    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">차원술사 111 가이드</h2>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">
                    <span className="flex items-center gap-1"><span className={`h-2.5 w-2.5 rounded-[3px] border ${BLUE}`} />주력 딜</span>
                    <span className="flex items-center gap-1"><span className={`h-2.5 w-2.5 rounded-[3px] border ${AMBER}`} />시너지·짤</span>
                    <span className="flex items-center gap-1"><span className={`h-2.5 w-2.5 rounded-[3px] border ${VIOLET}`} />유틸</span>
                    <span className="flex items-center gap-1"><span className={`h-2.5 w-2.5 rounded-[3px] border ${ROSE}`} />초각성</span>
                </div>
            </div>

            <Section no="1" title="조우 시작 — W부터 묻히기">
                <p>전투 시작하면 <K k="W" />(시너지) 먼저 깔고 시작. 그다음부터 2번 규칙대로.</p>
            </Section>

            <Section no="2" title={<>평소 — 파란색 우선, 없으면 <K k="W" /></>}>
                <p>파란색 <K k="F" /><K k="R" /><K k="D" /><K k="E" /> 쿨 도는 대로 계속 때리고, 쓸 파란색 없을 때만 <K k="W" />.</p>
                <p><K k="T" />(초각스)는 쿨 뜨면 아무 때나 반사적으로.</p>
                <p>파란색이 전부 쿨이라 손 빌 때 → <K k="A" />·<K k="Q" /> 던져서 파란색 쿨 당겨오기.</p>
                <p><K k="S" />(피면기)는 사이클에 섞지 말고 무조건 피면용으로 아껴 쓰기.</p>
            </Section>

            <Section no="3" title="아덴 진입 전 — 시계 6~9시, F 털고 진입">
                <p>시계바늘 <b>6~9시</b> 사이 진입이 베스트 (<K k="W" /> 두 번째로 돌아올 때쯤). 진입 직전 F 상태 보고:</p>
                <p>① <K k="F" /> 쓸 수 있으면 → 한 방 털고 <K k="Z" /></p>
                <p>② <K k="F" /> 5초 이내면 → <K k="Q" />/<K k="W" />/<K k="A" />/<K k="S" /> 하나 껴서 쿨 당긴 뒤 털고 <K k="Z" /></p>
                <p>③ <K k="F" /> 한참 쿨이면 → 그냥 <K k="Z" /></p>
                <p className="font-semibold text-rose-600 dark:text-rose-400">12시 넘기면 손해 — 넘길 것 같으면 억지로 안 털고 앞당겨 진입. 6시 못 넘겼으면 <K k="E" />·<K k="R" />로 넘기고 진입.</p>
            </Section>

            <Section no="4" title="아덴 진입 후 — 우겨넣고 E·R 깔고 탈출">
                <p>고배율 <K k="T" /><K k="D" /><K k="F" /> 먼저 털기 → 손 비면 <K k="Q" /><K k="W" />·<K k="A" />로 잠깐 메꾸기(필수 아님).</p>
                <p>마지막에 <K k="E" /><K k="R" /> 깔고 <K k="Z" /> 탈출. <K k="S" />는 패턴 피할 때.</p>
            </Section>

            <Section no="5" warn title="실수 대처 — 12시를 넘겨버렸다면">
                <p>파란색이 전부 쿨이면 미련 없이 그냥 <K k="Z" /> 진입. 탈출 후 스킬이 꼬여도 망한 것 아님.</p>
                <p>노란색 <K k="Q" /><K k="W" />·보라색 <K k="A" /> 짤을 물불 안 가리고 묶어 던지며 쿨 당기기.</p>
                <p>평소 사이클 두 바퀴(<K k="W" /> 총 4번)면 원래 궤도로 복구됨.</p>
            </Section>
        </div>
    );
}

// 차원술사 카드에 붙는 칩 버튼 — 클릭하면 가이드를 PiP(항상-위 창)로 띄운다. 미지원 브라우저는 모달 폴백.
export function DimensionalistGuideButton() {
    // 480px 폭 기준 콘텐츠가 약 740px — 기본 크기에서 스크롤이 생기지 않게 여유를 둔다.
    const { pipWindow, openPip } = usePipWindow(480, 760);
    const [isModalOpen, setIsModalOpen] = useState(false);

    return (
        <>
            <button
                onClick={() => {
                    if (!PIP_SUPPORTED) { setIsModalOpen(true); return; }
                    if (pipWindow) pipWindow.close(); else void openPip();
                }}
                className="inline-flex items-center gap-1 rounded bg-indigo-100 px-1.5 py-0.5 text-[9px] font-bold text-indigo-600 transition-colors hover:bg-indigo-200 dark:bg-indigo-900/50 dark:text-indigo-400 dark:hover:bg-indigo-900"
                title={PIP_SUPPORTED ? '111 가이드를 게임 위에 항상 띄우기 (PiP)' : '111 가이드 보기'}
            >
                <PictureInPicture2 size={10} />
                {pipWindow ? '가이드 닫기' : '가이드'}
            </button>

            {pipWindow && createPortal(<DimensionalistGuideContent />, pipWindow.document.body)}

            <Modal open={isModalOpen} title="차원술사 111 가이드" onClose={() => setIsModalOpen(false)} maxWidth="max-w-md">
                <DimensionalistGuideContent />
            </Modal>
        </>
    );
}
