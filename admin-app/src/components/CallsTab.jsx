import { useEffect, useState } from 'react'
import { CALL_LIMIT_PER_TEAM, TOTAL_TEAMS, getAssignedCoachForTeam } from '../config.js'
import { now, fmtCountdown, fmtClock } from '../lib/time.js'

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
    .filter((c) => c.status === 'done' && c.handledById === coach.id)
    .sort((a, b) => b.doneAt - a.doneAt)

  const shown = onlyMine ? active.filter((c) => c.assignedName === coach.name) : active

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
            {onlyMine ? '내가 담당하는 진행 중 호출이 없습니다.' : '진행 중인 호출이 없습니다. 🎉'}
          </p>
        ) : (
          <div className="call-list">
            {shown.map((c) => {
              const mine = c.assignedName === coach.name
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
                          처리중{c.handledById === coach.id ? ' (나)' : ''}
                        </span>
                        <button
                          className="btn-secondary sm"
                          onClick={() => onUpdateStatus(c.team, c.id, 'done')}
                        >
                          완료 처리
                        </button>
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

      {/* 팀별 호출 횟수 — 등록·주문 현황과 같은 격자 형태.
          전체 팀을 깔아두고 호출한 횟수만 적어, 한도에 가까운 팀이 눈에 띄게 함 */}
      <details className="panel done-panel">
        <summary>팀별 호출 횟수 (제한 {CALL_LIMIT_PER_TEAM}회)</summary>
        <div className="check-grid">
          {Array.from({ length: TOTAL_TEAMS }, (_, i) => {
            const teamId = String(i + 1).padStart(2, '0')
            const n = scan.counts[teamId] || 0
            const full = n >= CALL_LIMIT_PER_TEAM
            return (
              <span
                key={teamId}
                className={`call-count-cell${n ? ' used' : ''}${full ? ' full' : ''}`}
              >
                {i + 1}
                <b>{n}</b>
              </span>
            )
          })}
        </div>
      </details>
    </div>
  )
}
