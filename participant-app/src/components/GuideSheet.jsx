import GuideSection from './GuideSection.jsx'
import { useSheetDrag } from '../lib/useSheetDrag.js'
import { useDialogFocus } from '../lib/useDialogFocus.js'

// 이용 안내 다시 보기 — 첫 화면(OnboardingGuide)에서 읽고 지나간 안내를
// 행사 중에 다시 꺼내 보는 자리입니다. 팀 등록이 끝나면 첫 화면으로는
// 돌아갈 수 없어서, 호출 횟수·인원수 규칙을 확인할 길이 없었습니다.
//
// 내용은 첫 화면과 같은 GuideSection을 그대로 씁니다 — 두 곳에 따로
// 적으면 한쪽만 고쳐져 서로 다른 말을 하게 됩니다.
// showCall: 리그를 이미 알고 있으므로, 호출을 쓰지 않는 리그에는
// 호출 항목을 빼고 보여줍니다.
export default function GuideSheet({ showCall = true, onClose }) {
  const drag = useSheetDrag(onClose)
  const dialogRef = useDialogFocus(true, onClose)

  return (
    <div className="team-sheet-backdrop" onClick={onClose}>
      <section
        ref={dialogRef}
        className="team-sheet guide-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-sheet-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        style={drag.sheetStyle}
      >
        <div className="team-sheet-handle" aria-hidden="true" {...drag.handleHandlers} />
        <div className="team-sheet-head">
          <h2 id="guide-sheet-title">이용 안내</h2>
          <button className="team-sheet-close" onClick={onClose}>
            닫기
          </button>
        </div>
        <p className="guide-sheet-sub">꼭 읽어주세요</p>
        <GuideSection showCall={showCall} />
      </section>
    </div>
  )
}
