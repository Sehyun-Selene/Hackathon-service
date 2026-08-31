import { useMemo } from 'react'
import {
  COACH_ASSIGNMENTS,
  formatTeamRange,
  crewFor,
  crewLabel,
  crewRoleLabel,
} from '../config.js'
import { useSheetDrag } from '../lib/useSheetDrag.js'
import { useDialogFocus } from '../lib/useDialogFocus.js'
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
export default function CoachProfileSheet({ scan, coach, onOpenDetail, onClose, onChangeName }) {
  const drag = useSheetDrag(onClose)
  const dialogRef = useDialogFocus(true, onClose)

  // 명단에서 내 항목 찾기 — 이름이 정확히 같아야 연결됩니다
  const assignment = useMemo(
    () => crewFor(coach),
    [coach.name],
  )
  const myTeams = assignment?.teamNumbers || []
  // 담당 구간이 없는 역할(총관리자·식음 운영)에게는 담당 팀·슬랙 알림 대신
  // "다들 등록했나 · 주문했나 · 들어왔나"를 확인하는 자리로 씁니다.
  const isManager = !!assignment?.callManager
  // 식음 운영은 주문만 봅니다 — 등록·입장은 그분이 손댈 일이 아닙니다
  const isOrderManager = !!assignment?.orderManager
  const roleLabel = crewRoleLabel(assignment)
  const overviewAll = [
    { kind: 'teams', label: '등록한 팀', value: Object.keys(scan.teams || {}).length },
    { kind: 'orders', label: '주문한 팀', value: Object.keys(scan.orders || {}).length },
    {
      kind: 'coaches',
      label: '입장한 메이트',
      // 기기 단위로 기록되므로 한 사람이 폰·노트북에서 열면 두 개가 됩니다.
      // 세는 단위는 사람이라 이름으로 묶습니다.
      value: new Set((scan.coaches || []).map((c) => c.name)).size,
    },
  ]
  const overview = isManager ? overviewAll : overviewAll.filter((o) => o.kind === 'orders')

  const stats = useMemo(() => {
    let waitingMine = 0 // 내 담당 팀의 대기 호출
    let inProgressByMe = 0 // 내가 지금 처리 중
    let doneByMe = 0 // 내가 완료 처리한 누적

    Object.entries(scan.calls || {}).forEach(([teamId, data]) => {
      const mine = myTeams.includes(teamId)
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
        ref={dialogRef}
        className="bottom-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-sheet-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        style={drag.sheetStyle}
      >
        <div className="sheet-handle" aria-hidden="true" {...drag.handleHandlers} />
        <div className="sheet-head">
          <h3 id="profile-sheet-title">
            🧑‍🏫 {crewLabel(assignment) || coach.name}
            {roleLabel && <span className="profile-role">{roleLabel}</span>}
          </h3>
          <button className="sheet-close" onClick={onClose}>
            닫기
          </button>
        </div>
        <div className="sheet-body">
          {isManager || isOrderManager ? (
            /* 담당 구간이 없는 역할 — 눌러서 "누가 아직 안 했나" 목록을 엽니다 */
            <div className="profile-block">
              <div className="profile-label">행사 진행 현황</div>
              <div className="profile-stats">
                {overview.map((o) => (
                  <button
                    key={o.kind}
                    className="profile-stat profile-stat-btn"
                    onClick={() => onOpenDetail?.(o.kind)}
                    aria-haspopup="dialog"
                  >
                    <b>{o.value}</b>
                    <span>{o.label}</span>
                  </button>
                ))}
              </div>
              <div className="profile-sub">눌러서 아직 안 한 팀·인원을 확인할 수 있습니다.</div>
            </div>
          ) : (
          <>
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
                <b>담당 팀이 아직 배정되지 않았습니다.</b>
                {/* 명단에서 골라 들어오므로 이름이 틀릴 일은 없습니다.
                    남은 경우는 담당 구간이 아직 안 정해진 것뿐입니다. */}
                <p>
                  {assignment
                    ? '담당 구간이 정해지면 여기에 표시됩니다. 그때까지도 다른 팀 호출은 대응할 수 있습니다.'
                    : '운영 명단에서 찾을 수 없는 계정입니다. 아래에서 다시 입장해 주세요.'}
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

          </>
          )}

          <button className="btn-secondary profile-change" onClick={onChangeName}>
            다른 이름으로 입장하기
          </button>
        </div>
      </section>
    </div>
  )
}
