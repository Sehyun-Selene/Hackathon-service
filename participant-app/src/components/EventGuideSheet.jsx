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
// ── '처음으로' ─────────────────────────────────────────────────────
// 안내 안의 링크를 누르면 이 틀 안에서 안쪽 페이지로 들어갑니다. 폰에는
// 브라우저 뒤로가기가 없고(앱처럼 띄운 화면이라), 시트를 닫았다 다시 열어도
// 들어갔던 자리가 그대로라 첫 화면으로 돌아올 길이 없었습니다.
//
// 한 칸 뒤로(back)가 아니라 맨 처음으로 보냅니다. 노션 페이지는 남의
// 출처(origin)라 브라우저가 안쪽 기록을 못 만지게 막습니다 — iframe 의
// history 를 건드리면 SecurityError 가 납니다. 그래서 틀 자체를 새로
// 만들어(key 를 올려) 첫 주소를 다시 엽니다. 몇 단계를 들어갔든 한 번에
// 처음으로 옵니다.
//
// 항상 보이게 둡니다. 안쪽으로 들어갔는지 알아낼 방법이 없어서(같은 이유로
// 주소를 읽을 수 없습니다), 있을 때만 띄우려다 정작 필요할 때 없는 쪽보다
// 늘 있는 편이 낫습니다. 첫 화면에서 눌러도 그 화면을 다시 불러올 뿐입니다.
//
// '새 창' 은 그대로 둡니다 — 안내를 오래 읽거나 링크를 여러 개 열어볼 때는
// 브라우저로 꺼내 가는 편이 편합니다.
export default function EventGuideSheet({ onClose }) {
  const [loaded, setLoaded] = useState(false)
  // 값이 바뀌면 React 가 iframe 을 버리고 새로 만듭니다. 같은 주소를 src 에
  // 다시 넣는 것만으로는 다시 불러오지 않습니다.
  const [frameKey, setFrameKey] = useState(0)
  const dialogRef = useDialogFocus(true, onClose)

  const goHome = () => {
    setLoaded(false)
    setFrameKey((n) => n + 1)
  }

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
            <button
              type="button"
              className="event-sheet-home"
              onClick={goHome}
              aria-label="이벤트 안내 첫 화면으로"
            >
              <span aria-hidden="true">↺</span> 처음으로
            </button>
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
            key={frameKey}
            title="이벤트 안내"
            src={EVENT_GUIDE_URL}
            onLoad={() => setLoaded(true)}
          />
        </div>
      </section>
    </div>
  )
}
