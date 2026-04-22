export interface DifficultyStyle {
  containerBorder: string;
  headerClass: string;
  headerHoverClass: string;
  titleColor: string;
  dotColor: string;
  dotTextColor: string;
  btn: string;
  badge: string;
  borderActive: string;
  stepTitleClass: string;
  stepLabelClass: string;
}

export function getDifficultyStyle(diff: string): DifficultyStyle {
  if (diff === 'NORMAL') {
    return {
      containerBorder: 'border-sky-200 dark:border-sky-800',
      headerClass:
        'text-sky-900 border-sky-200 bg-sky-50/50 dark:text-sky-100 dark:border-sky-800 dark:bg-sky-900/20',
      headerHoverClass: 'hover:bg-sky-100 dark:hover:bg-sky-900/40',
      titleColor: 'text-sky-900 dark:text-sky-100',
      dotColor: 'bg-sky-500',
      dotTextColor: 'text-sky-500',
      btn: 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200 dark:hover:bg-sky-950/50 shadow-sm',
      badge: 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300',
      borderActive: 'border-sky-500',
      stepTitleClass: 'text-sky-600 dark:text-sky-400',
      stepLabelClass: 'text-sky-800/60 dark:text-sky-300/60',
    };
  }
  if (diff === 'HARD') {
    return {
      containerBorder: 'border-rose-200 dark:border-rose-800',
      headerClass:
        'text-rose-900 border-rose-200 bg-rose-50/50 dark:text-rose-100 dark:border-rose-800 dark:bg-rose-900/20',
      headerHoverClass: 'hover:bg-rose-100 dark:hover:bg-rose-900/40',
      titleColor: 'text-rose-900 dark:text-rose-100',
      dotColor: 'bg-rose-500',
      dotTextColor: 'text-rose-500',
      btn: 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200 dark:hover:bg-rose-950/50 shadow-sm',
      badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300',
      borderActive: 'border-rose-500',
      stepTitleClass: 'text-rose-600 dark:text-rose-400',
      stepLabelClass: 'text-rose-800/60 dark:text-rose-300/60',
    };
  }
  if (diff === 'STEP1' || diff === 'STEP2' || diff === 'STEP3') {
    return {
      containerBorder: 'border-orange-200 dark:border-orange-800',
      headerClass:
        'text-orange-900 border-orange-200 bg-orange-50/50 dark:text-orange-100 dark:border-orange-800 dark:bg-orange-900/20',
      headerHoverClass: 'hover:bg-orange-100 dark:hover:bg-orange-900/40',
      titleColor: 'text-orange-900 dark:text-orange-100',
      dotColor: 'bg-orange-500',
      dotTextColor: 'text-orange-500',
      btn: 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-200 dark:hover:bg-orange-950/50 shadow-sm',
      badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
      borderActive: 'border-orange-500',
      stepTitleClass: 'text-orange-600 dark:text-orange-400',
      stepLabelClass: 'text-orange-800/60 dark:text-orange-300/60',
    };
  }
  return {
    containerBorder: 'border-violet-200 dark:border-violet-800',
    headerClass:
      'text-violet-900 border-violet-200 bg-violet-50/50 dark:text-violet-100 dark:border-violet-800 dark:bg-violet-900/20',
    headerHoverClass: 'hover:bg-violet-100 dark:hover:bg-violet-900/40',
    titleColor: 'text-violet-900 dark:text-violet-100',
    dotColor: 'bg-violet-500',
    dotTextColor: 'text-violet-500',
    btn: 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-200 dark:hover:bg-violet-950/50 shadow-sm',
    badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300',
    borderActive: 'border-violet-500',
    stepTitleClass: 'text-violet-600 dark:text-violet-400',
    stepLabelClass: 'text-violet-800/60 dark:text-violet-300/60',
  };
}
