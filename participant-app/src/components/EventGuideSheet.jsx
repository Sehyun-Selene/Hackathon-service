import { useState } from 'react'
import { EVENT_GUIDE_URL } from '../config.js'
import { useDialogFocus } from '../lib/useDialogFocus.js'

// 이벤트 안내 전체 — 노션 페이지를 앱 안에서 그대로 띄웁니다.
//
// 왜 시트인가: 바로가기 탭 본문에 그대로 박으면 상자 안 스크롤과 화면
// 스크롤이 손가락 아래에서 부딪히고, 안내가 길어서 아래 링크 두 개가
// 한참 밀립니다. 화면을 꽉 채우면 둘 다 없습니다.
//
// 다른 시트(팀 정보·이용 안내)와 달리 손잡이를 끌어 내리는 동작을 넣지
// 않았습니다 — 안쪽이 스크롤되는 웹 페이지라 끌어내리기와 스크롤이 서로를
// 잡아먹습니다. 닫는 길은 닫기 버튼 · 바깥 누르기 · ESC 셋입니다.
//
// '새 창' 을 함께 둔 이유: 안내 안의 링크를 누르면 이 틀 안에서 이동해
// 돌아올 길이 애매해질 수 있습니다. 그때 브라우저로 꺼내 갈 문을 둡니다.
export default function EventGuideSheet({ onClose }) {
  const [loaded, setLoaded] = useState(false)
  const dialogRef = useDialogFocus(true, onClose)

  return (
    <div className="team-sheet-backdrop" onClick={onClose}>
      <section
        ref={dialogRef}
        className="team-sheet event-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-sheet-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="team-sheet-head">
          <h2 id="event-sheet-title">이벤트 안내</h2>
          <div className="event-sheet-actions">
            <a
              className="event-sheet-out"
              href={EVENT_GUIDE_URL}
              target="_blank"
              rel="noreferrer"
            >
              새 창 ↗
            </a>
            <button className="team-sheet-close" onClick={onClose}>
              닫기
            </button>
          </div>
        </div>
        <div className="event-sheet-frame">
          {/* 현장 와이파이에서는 몇 초 걸립니다. 빈 흰 칸만 두면 고장으로
              보이므로 불러오는 중이라고 말해 둡니다. */}
          {!loaded && (
            <p className="event-sheet-loading" role="status">
              이벤트 안내를 불러오는 중…
            </p>
          )}
          <iframe
            title="이벤트 안내"
            src={EVENT_GUIDE_URL}
            onLoad={() => setLoaded(true)}
          />
        </div>
      </section>
    </div>
  )
}
