import { useMemo } from 'react'
import { COACH_ASSIGNMENTS, formatTeamRange } from '../config.js'
import { useSheetDrag } from '../lib/useSheetDrag.js'
import { isHandledByMe } from '../lib/storage.js'

// 내 프로필 — 사이드바(좁은 화면은 상단바)의 이름을 누르면 열립니다.
// 마스터 메이트는 호출 대응만 담당하므로 주문 관련 정보는 넣지 않습니다.
//
// 담당 팀 범위를 확인하는 것이 주 목적이고, 함께 "지금 내 상태가 정상인지"를
// 스스로 점검할 수 있게 두 가지 경고를 같이 보여줍니다.
//   ① 입장 이름이 config.COACH_ASSIGNMENTS 명단과 다르면 담당 팀이 배정되지
//      않아 호출이 나에게 연결되지 않습니다 (오타로 조용히 누락되기 쉬움).
//   ② slackUserId가 비어 있으면 호출 시 슬랙 개인 알림이 오지 않습니다.
//      관리자 페이지를 계속 보고 있지 않으면 놓치게 되므로 미리 알려줍니다.
export default function CoachProfileSheet({ scan, coach, onClose, onChangeName }) {
  const drag = useSheetDrag(onClose)

  // 명단에서 내 항목 찾기 — 이름이 정확히 같아야 연결됩니다
  const assignment = useMemo(
    () => COACH_ASSIGNMENTS.find((c) => c.name && c.name === coach.name) || null,
    [coach.name],
  )
  const myTeams = assignment?.teamNumbers || []

  const stats = useMemo(() => {
    let waitingMine = 0 // 내 담당 팀의 대기 호출
    let inProgressByMe = 0 // 내가 지금 처리 중
    let doneByMe = 0 // 내가 완료 처리한 누적

    Object.entries(scan.calls || {}).forEach(([teamId, data]) => {
      const mine = myTeams.includes(parseInt(teamId, 10))
      ;(data.calls || []).forEach((c) => {
        if (c.status === 'waiting' && mine) waitingMine += 1
        if (c.status === 'in_progress' && isHandledByMe(c, coach)) inProgressByMe += 1
        if (c.status === 'done' && isHandledByMe(c, coach)) doneByMe += 1
      })
    })

    return { waitingMine, inProgressByMe, doneByMe }
  }, [scan.calls, myTeams, coach])

  return (
    <div className="bottom-sheet-backdrop" onClick={onClose}>
      <section
        className="bottom-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-sheet-title"
        onClick={(event) => event.stopPropagation()}
        style={drag.sheetStyle}
      >
        <div className="sheet-handle" aria-hidden="true" {...drag.handleHandlers} />
        <div className="sheet-head">
          <h3 id="profile-sheet-title">🧑‍🏫 {coach.name}</h3>
          <button className="sheet-close" onClick={onClose}>
            닫기
          </button>
        </div>
        <div className="sheet-body">
          {/* 담당 팀 — 이 시트의 핵심 정보 */}
          <div className="profile-block">
            <div className="profile-label">담당 팀</div>
            {myTeams.length ? (
              <>
                <div className="profile-teams">{formatTeamRange(myTeams)}</div>
                <div className="profile-sub">총 {myTeams.length}팀</div>
              </>
            ) : (
              <div className="profile-warn">
                <b>담당 팀이 배정되지 않았습니다.</b>
                <p>
                  입장할 때 입력한 이름이 운영 명단과 다르면 담당 팀이 연결되지 않습니다. 이름을
                  다시 확인해 주세요. (담당 팀이 없어도 다른 팀 호출은 대응할 수 있습니다)
                </p>
              </div>
            )}
          </div>

          {/* 슬랙 개인 알림 연결 상태 — 안 되어 있으면 호출을 놓칠 수 있음 */}
          <div className="profile-block">
            <div className="profile-label">슬랙 개인 알림</div>
            {assignment?.slackUserId ? (
              <div className="profile-ok">연결됨 — 내 담당 팀 호출 시 슬랙으로 알림이 옵니다</div>
            ) : (
              <div className="profile-warn">
                <b>연결되지 않았습니다.</b>
                <p>
                  호출이 와도 슬랙 개인 알림이 오지 않습니다. 이 페이지를 보고 있지 않으면 놓칠 수
                  있으니 운영 담당자에게 슬랙 멤버 ID 등록을 요청해 주세요.
                </p>
              </div>
            )}
          </div>

          {/* 내 호출 현황 */}
          <div className="profile-block">
            <div className="profile-label">내 호출 현황</div>
            <div className="profile-stats">
              <div className={`profile-stat${stats.waitingMine ? ' alert' : ''}`}>
                <b>{stats.waitingMine}</b>
                <span>담당 팀 대기</span>
              </div>
              <div className="profile-stat">
                <b>{stats.inProgressByMe}</b>
                <span>대응 중</span>
              </div>
              <div className="profile-stat">
                <b>{stats.doneByMe}</b>
                <span>완료</span>
              </div>
            </div>
          </div>

          <button className="btn-secondary profile-change" onClick={onChangeName}>
            다른 이름으로 입장하기
          </button>
        </div>
      </section>
    </div>
  )
}
