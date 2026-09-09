import { fmtClock, fmtTimeOnly } from '../lib/time.js'
import { useSheetDrag } from '../lib/useSheetDrag.js'
import { useDialogFocus } from '../lib/useDialogFocus.js'

const STATUS_LABEL = { waiting: '대기중', in_progress: '처리중', done: '완료' }

// 우리 팀 지난 호출 내역 — '남은 호출 N / 5' 를 누르면 열립니다.
//
// 예전에는 호출 화면 맨 아래에 접힌 상자로 있어서, 호출 전 안내를 다 지나
// 스크롤해야 보였습니다. 남은 횟수를 보려고 눈이 이미 그 알약에 가 있으니,
// 그 자리에서 "무엇에 썼는지"까지 이어 보게 합니다.
//
// 진행 중인 호출은 목록에 넣지 않습니다 — 위 상태 상자에 이미 자세히
// 나와 있어서요(CallSection의 past).
export default function CallLogSheet({ calls = [], onClose }) {
  const drag = useSheetDrag(onClose)
  const dialogRef = useDialogFocus(true, onClose)

  return (
    <div className="team-sheet-backdrop" onClick={onClose}>
      <section
        ref={dialogRef}
        className="team-sheet call-log-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="call-log-sheet-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        style={drag.sheetStyle}
      >
        <div className="team-sheet-handle" aria-hidden="true" {...drag.handleHandlers} />
        <div className="team-sheet-head">
          <h2 id="call-log-sheet-title">우리 팀 지난 호출 내역</h2>
          <button className="team-sheet-close" onClick={onClose}>
            닫기
          </button>
        </div>
        <p className="call-log-sheet-sub">{calls.length}건</p>

        <ul className="call-log-list">
          {calls.map((c, i) => (
            <li className="call-log-item" key={c.id || i}>
              <div className="call-log-head">
                <span className="call-log-time">{fmtClock(c.createdAt)} 호출</span>
                <span className={`call-log-status st-${c.status}`}>
                  {STATUS_LABEL[c.status] || c.status}
                </span>
                {c.handledBy && <span className="call-log-who">{c.handledBy}</span>}
                {c.doneAt && <span className="call-log-done">{fmtTimeOnly(c.doneAt)} 완료</span>}
              </div>
              {c.reason && <p className="call-log-reason">“{c.reason}”</p>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
