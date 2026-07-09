// Document Picture-in-Picture 공용 훅 — 컴포넌트 일부를 항상-위 창으로 띄운다(게임 위 오버레이).
// 같은 컴포넌트 인스턴스를 PiP 창으로 '포털'만 옮겨 워커·상태·localStorage를 그대로 유지한다.
import { useCallback, useState } from 'react';

export const PIP_SUPPORTED = typeof window !== 'undefined' && 'documentPictureInPicture' in window;

export function usePipWindow(width: number, height: number) {
  const [pipWindow, setPipWindow] = useState<Window | null>(null);

  const openPip = useCallback(async () => {
    if (!PIP_SUPPORTED) return;
    // @ts-expect-error documentPictureInPicture는 아직 표준 타입에 없음(Chrome 116+).
    const pip: Window = await window.documentPictureInPicture.requestWindow({ width, height });

    // 스타일 이식 — Tailwind/토큰 CSS는 <link>(빌드)·<style>(dev) 양쪽으로 들어오므로 둘 다 복사.
    document.querySelectorAll('link[rel="stylesheet"]').forEach((l) => {
      const link = pip.document.createElement('link');
      link.rel = 'stylesheet';
      link.href = (l as HTMLLinkElement).href; // 절대경로
      pip.document.head.appendChild(link);
    });
    document.querySelectorAll('style').forEach((s) => pip.document.head.appendChild(s.cloneNode(true)));

    // 테마/배경 — html 속성·클래스를 복사하고, 배경색도 테마를 따라간다.
    const syncTheme = () => {
      const t = document.documentElement.getAttribute('data-theme');
      if (t) pip.document.documentElement.setAttribute('data-theme', t);
      pip.document.documentElement.className = document.documentElement.className;
      // 다크 판정은 data-theme(레거시)과 .dark 클래스(현재 방식) 둘 다 지원.
      const dark = t === 'dark' || document.documentElement.classList.contains('dark');
      pip.document.body.style.background = dark ? '#18181b' : '#ffffff'; // 다크: zinc-900 / 라이트: 흰색
    };
    syncTheme();
    pip.document.body.className = document.body.className;
    Object.assign(pip.document.body.style, { margin: '0', padding: '12px', overflowY: 'auto' });

    // 메인에서 테마를 바꾸면 PiP에도 반영.
    const obs = new MutationObserver(syncTheme);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    pip.addEventListener('pagehide', () => {
      obs.disconnect();
      setPipWindow(null);
    });
    setPipWindow(pip);
  }, [width, height]);

  return { pipWindow, openPip };
}
