import { useState } from 'react'

// 접었다 펴는 안내 묶음 — 호출 화면의 '꼭 읽어보세요', 주문 화면의 '공지사항'.
//
// 전에는 둘 다 화면 맨 아래에 있었습니다. 읽어야 할 내용인데 스크롤을 끝까지
// 내려야 나와서, 사실상 못 본 채로 호출하고 주문했습니다. 그렇다고 위에 펼친
// 채로 두면 정작 하러 온 일(호출 버튼·메뉴 목록)이 한 화면 아래로 밀립니다.
//
// 그래서 위로 올리되 접어 둡니다.
//   기본      → 접힘. 제목 한 줄만 자리를 차지하고, 하러 온 일이 바로 보입니다.
//   펴면      → 그 상태를 기억합니다. 다시 접을 때까지 펴진 채로 뜹니다.
//
// 기억은 기기 안(localStorage)에만 둡니다. 서버에 둘 값이 아니고, 폰마다
// 보는 사람이 다르기 때문입니다. 저장이 막힌 브라우저(시크릿 모드 등)에서는
// 늘 접힌 채로 뜹니다 — 화면이 밀리지 않는 쪽이 기본값과 같습니다.
export default function NoticeToggle({ storageKey, title, className = '', children }) {
  const [open, setOpen] = useState(() => {
    try {
      return window.localStorage.getItem(storageKey) === 'open'
    } catch {
      return false
    }
  })

  const onToggle = (event) => {
    const next = event.currentTarget.open
    setOpen(next)
    try {
      window.localStorage.setItem(storageKey, next ? 'open' : 'closed')
    } catch {
      /* 저장 공간 거부 — 이번 세션에서만 펴진 채로 둡니다 */
    }
  }

  return (
    <details
      className={`notice-toggle${className ? ` ${className}` : ''}`}
      open={open}
      onToggle={onToggle}
    >
      <summary className="notice-toggle-head">
        <b className="notice-panel-title">{title}</b>
        {/* 글자(⌄)로 두면 글꼴마다 글자 안에서의 위아래 위치가 달라 원 안
            한가운데에 오지 않습니다. 선으로 직접 그려 가운데를 맞춥니다 —
            12×12 상자 안에서 가로·세로 모두 6이 중심입니다. */}
        <span className="notice-toggle-mark" aria-hidden="true">
          <svg viewBox="0 0 12 12" width="11" height="11" focusable="false">
            <path
              d="M2.5 4.5 L6 7.5 L9.5 4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </summary>
      {children}
    </details>
  )
}
