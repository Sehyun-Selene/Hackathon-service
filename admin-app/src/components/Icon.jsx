// 선 아이콘 모음.
//
// 이모지를 걷어내고 여기로 모았습니다. 이모지는 기기마다 다른 그림이
// 나오고(안드로이드·아이폰·윈도우가 전부 다릅니다), 크기와 굵기를 맞출 수
// 없어 줄마다 높이가 흔들렸습니다. 밤 화면에서는 원색 이모지만 혼자 튀기도
// 했습니다.
//
// 굵기는 1.9px로 통일합니다. 색은 currentColor라, 쓰는 자리의 글자색을
// 그대로 따라갑니다 — 낮/밤 전환에 따로 손댈 것이 없습니다.
const BASE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

const PATHS = {
  // 새로고침 — 한 바퀴 돌아 제자리
  refresh: <><path d="M11 5a7 7 0 1 1-6.7 9" /><path d="M4 5v5h5" /></>,
  // 목록 항목이 눌린다는 표시
  chevron: <path d="M9 6l6 6-6 6" />,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  // 메뉴 열기 / 닫기 — 같은 자리에서 토글됩니다
  menu: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>,
  close: <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>,
  // 완료
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  // 대기로 되돌리기
  undo: <><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></>,
  // 화면 이름표
  bell: <><path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" /><path d="M13.7 20a2 2 0 0 1-3.4 0" /></>,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M16 5.3a3.2 3.2 0 0 1 0 5.4" /><path d="M17.5 14.2a5.5 5.5 0 0 1 3 5.8" /></>,
  clipboard: <><rect x="5" y="4.5" width="14" height="16" rx="2.5" /><path d="M9 4.5h6v3H9z" /><path d="M9 12h6" /><path d="M9 16h4" /></>,
  clock: <><circle cx="12" cy="12" r="8.2" /><path d="M12 7.5V12l3 2" /></>,
  // 대응 중인 메이트가 가 있는 자리
  pin: <><path d="M12 21s6-5.3 6-10a6 6 0 1 0-12 0c0 4.7 6 10 6 10z" /><circle cx="12" cy="11" r="2.2" /></>,
}

export default function Icon({ name, size = 20, className, ...rest }) {
  const path = PATHS[name]
  if (!path) return null
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      {...BASE}
      {...rest}
    >
      {path}
    </svg>
  )
}
