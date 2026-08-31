import { useEffect, useState } from 'react'
import {
  CALL_LIMIT_PER_TEAM,
  COACH_ASSIGNMENTS,
  ALL_TEAM_IDS,
  groupByLeague,
  getAssignedCoachForTeam,
} from '../config.js'
import { now, fmtCountdown, fmtClock } from '../lib/time.js'
import { isHandledByMe } from '../lib/storage.js'

// 마스터 메이트 호출 알림 (PRD 5.3 + 요청 #5): 팀 번호 기준 마스터 메이트 개인별 배정.
// 내가 담당하는 팀의 호출을 우선 대응하되, 다른 마스터 메이트도 지원 가능.
// "내 담당 팀만" 필터로 담당 호출을 빠르게 걸러 처리.
export default function CallsTab({ scan, coach, onUpdateStatus }) {
  const [, setTick] = useState(0)
  const [onlyMine, setOnlyMine] = useState(false)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const t = now().getTime()
  const assignedNameOf = (teamId) => getAssignedCoachForTeam(teamId)?.name || '미배정'

  const all = Object.entries(scan.calls).flatMap(([teamId, data]) =>
    (data.calls || []).map((c) => ({ ...c, team: teamId, assignedName: assignedNameOf(teamId) })),
  )
  let active = all.filter((c) => c.status !== 'done')
  // 내 담당 호출을 먼저 정렬 → 그다음 오래된 순
  active.sort((a, b) => {
    const am = a.assignedName === coach.name ? 0 : 1
    const bm = b.assignedName === coach.name ? 0 : 1
    if (am !== bm) return am - bm
    return a.createdAt - b.createdAt
  })
  // 완료 이력은 내가 처리한 것만. 전원 이력이 섞이면 40명 규모에서 목록이
  // 길어지고, 정작 "내가 뭘 처리했는지" 확인이 어려워짐.
  const done = all
    .filter((c) => c.status === 'done' && isHandledByMe(c, coach))
    .sort((a, b) => b.doneAt - a.doneAt)

  const shown = onlyMine ? active.filter((c) => c.assignedName === coach.name) : active

  // 호출 횟수는 기본적으로 내 담당 팀만.
  //   - config의 callManager: true (호출 총관리자) → 전체 팀
  //   - 담당 팀이 배정되지 않은 경우 → 전체 팀 (배정 전이거나 지원 인력이라
  //     남의 담당 팀도 봐야 하므로)
  const myAssignment = COACH_ASSIGNMENTS.find((a) => a.name === coach.name)
  const myTeams = myAssignment?.teamNumbers || []
  const showAllTeams = !!myAssignment?.callManager || myTeams.length === 0
  // 팀 번호는 'E-45' 같은 문자열입니다. 리그가 다르면 같은 숫자라도 다른 팀이라
  // 격자도 리그별로 나눠 그립니다.
  const countGroups = groupByLeague(showAllTeams ? ALL_TEAM_IDS : myTeams)

  return (
    <div>
      <section className="panel">
        <div className="panel-head-row">
          <h3>진행 중인 호출 ({shown.length}건)</h3>
          <label className="mine-toggle">
            <input
              type="checkbox"
              checked={onlyMine}
              onChange={(e) => setOnlyMine(e.target.checked)}
            />
            내 담당 팀만
          </label>
        </div>
        {shown.length === 0 ? (
          <p className="empty-text">
            {onlyMine ? '내가 담당하는 진행 중 호출이 없습니다.' : '진행 중인 호출이 없습니다.'}
          </p>
        ) : (
          <div className="call-list">
            {shown.map((c) => {
              const mine = c.assignedName === coach.name
              const canControl = isHandledByMe(c, coach) || !!myAssignment?.callManager
              return (
                <div key={c.id} className={`call-card ${c.status}${mine ? ' mine-company' : ''}`}>
                  <div className="call-card-main">
                    <span className="call-table">팀 {c.team}</span>
                    <span className={`call-company${mine ? ' mine' : ''}`}>담당 {c.assignedName}</span>
                    <span className="call-elapsed">⏱ {fmtCountdown(t - c.createdAt)} 경과</span>
                  </div>
                  <div className="call-card-actions">
                    {c.status === 'waiting' ? (
                      <>
                        <span className="status-pill waiting">대기중</span>
                        <button
                          className="btn-primary sm"
                          onClick={() => onUpdateStatus(c.team, c.id, 'in_progress')}
                        >
                          처리 시작
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="status-pill in-progress">
                          처리중{isHandledByMe(c, coach) ? ' (나)' : c.handledBy ? ` · ${c.handledBy}` : ''}
                        </span>
                        {/* 잘못 누른 '처리 시작'을 되돌립니다. 되돌리지 못하면 그
                            호출이 대기 목록에서 사라지고, 슬랙 미처리 알림도
                            대기 상태만 보므로 아무 알림 없이 묻힙니다. */}
                        {canControl && (
                          <>
                            <button
                              className="btn-ghost sm call-revert"
                              onClick={() => onUpdateStatus(c.team, c.id, 'waiting', c)}
                              title="대기 상태로 되돌립니다"
                            >
                              대기로
                            </button>
                            <button
                              className="btn-secondary sm"
                              onClick={() => onUpdateStatus(c.team, c.id, 'done')}
                            >
                              완료 처리
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                  {/* 참가자가 작성한 호출 사유 — 이동 전에 상황을 파악하도록 카드 전체 폭으로 표시 */}
                  <p className={`call-reason${c.reason ? '' : ' empty'}`}>
                    {c.reason ? `“${c.reason}”` : '사유 미작성'}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <details className="panel done-panel">
        <summary>내가 완료한 호출 ({done.length}건)</summary>
        <div className="call-list">
          {done.map((c) => (
            <div key={c.id} className="call-card done">
              <div className="call-card-main">
                <span className="call-table">팀 {c.team}</span>
                <span className="call-company">담당 {c.assignedName}</span>
                <span className="call-elapsed">
                  {fmtClock(new Date(c.createdAt))} 호출 → {c.doneAt ? fmtClock(new Date(c.doneAt)) : '-'} 완료
                </span>
              </div>
              {c.reason && <p className="call-reason">“{c.reason}”</p>}
            </div>
          ))}
        </div>
      </details>

      {/* 팀별 호출 횟수 — 내가 담당하는 팀만. 남의 담당 팀 잔여 횟수는
          내가 판단할 일이 아니고, 125칸을 훑으면 내 팀을 못 찾음.
          담당이 배정되지 않았으면 전체를 보여줍니다(지원용). */}
      <details className="panel done-panel">
        <summary>
          {showAllTeams ? '전체 팀 호출 횟수' : '내 담당 팀 호출 횟수'} (제한{' '}
          {CALL_LIMIT_PER_TEAM}회)
        </summary>
        {countGroups.map(({ league, ids }) => (
          <div key={league.id} className="league-block">
            {countGroups.length > 1 && (
              <div className="league-block-head">
                {league.label} <span>{league.prefix}-</span>
              </div>
            )}
            <div className="check-grid">
              {ids.map((teamId) => {
                const used = scan.counts[teamId] || 0
                const full = used >= CALL_LIMIT_PER_TEAM
                return (
                  <span
                    key={teamId}
                    className={`call-count-cell${used ? ' used' : ''}${full ? ' full' : ''}`}
                  >
                    {teamId.slice(2)}
                    <b>{used}</b>
                  </span>
                )
              })}
            </div>
          </div>
        ))}
      </details>
    </div>
  )
}
