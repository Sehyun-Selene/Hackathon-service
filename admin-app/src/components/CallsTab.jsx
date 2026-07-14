import { useEffect, useState } from 'react'
import { CALL_LIMIT_PER_TEAM, getCoachGroupForTeam } from '../config.js'
import { now, fmtCountdown, fmtClock } from '../lib/time.js'

// 코치 호출 알림 (PRD 5.3 + 요청 #5): 팀 번호 기준 코치 조 배정.
// 우리 조가 담당하는 팀의 호출을 우선 대응하되, 다른 조도 지원 가능.
// "우리 조만" 필터로 담당 호출을 빠르게 걸러 처리.
export default function CallsTab({ scan, coach, onUpdateStatus, onToggleCounts }) {
  const [, setTick] = useState(0)
  const [onlyMyGroup, setOnlyMyGroup] = useState(false)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const t = now().getTime()
  const groupLabelOf = (teamId) => getCoachGroupForTeam(teamId)?.label || '미배정'

  const all = Object.entries(scan.calls).flatMap(([teamId, data]) =>
    (data.calls || []).map((c) => ({ ...c, team: teamId, groupLabel: groupLabelOf(teamId) })),
  )
  let active = all.filter((c) => c.status !== 'done')
  // 우리 조 담당 호출을 먼저 정렬 → 그다음 오래된 순
  active.sort((a, b) => {
    const am = a.groupLabel === coach.group ? 0 : 1
    const bm = b.groupLabel === coach.group ? 0 : 1
    if (am !== bm) return am - bm
    return a.createdAt - b.createdAt
  })
  const done = all.filter((c) => c.status === 'done').sort((a, b) => b.doneAt - a.doneAt)

  // 완료 이력 기반 평균 처리 시간 (대기 팀 예상 시간 안내용)
  const handled = done.filter((c) => c.doneAt)
  const avgHandleMs = handled.length
    ? handled.reduce((s, c) => s + (c.doneAt - c.createdAt), 0) / handled.length
    : null
  const avgHandleMin = avgHandleMs != null ? Math.max(1, Math.round(avgHandleMs / 60000)) : null

  const shown = onlyMyGroup ? active.filter((c) => c.groupLabel === coach.group) : active

  return (
    <div>
      <section className="panel">
        <div className="panel-head-row">
          <h3>
            진행 중인 호출 ({shown.length}건)
            {avgHandleMin != null && (
              <span className="avg-handle-hint"> · 평균 처리 약 {avgHandleMin}분</span>
            )}
          </h3>
          <label className="mine-toggle">
            <input
              type="checkbox"
              checked={onlyMyGroup}
              onChange={(e) => setOnlyMyGroup(e.target.checked)}
            />
            우리 조({coach.group})만
          </label>
        </div>
        {shown.length === 0 ? (
          <p className="empty-text">
            {onlyMyGroup ? '우리 조 담당 진행 중 호출이 없습니다.' : '진행 중인 호출이 없습니다. 🎉'}
          </p>
        ) : (
          <div className="call-list">
            {shown.map((c) => {
              const used = scan.counts[c.team] || 0
              const mine = c.groupLabel === coach.group
              return (
                <div key={c.id} className={`call-card ${c.status}${mine ? ' mine-company' : ''}`}>
                  <div className="call-card-main">
                    <span className="call-table">팀 {c.team}</span>
                    <span className={`call-company${mine ? ' mine' : ''}`}>{c.groupLabel}</span>
                    <span className="call-reason">{c.reason}</span>
                    <span className="call-elapsed">⏱ {fmtCountdown(t - c.createdAt)} 경과</span>
                    {c.status === 'waiting' && avgHandleMin != null && (
                      <span className="avg-wait">예상 처리 ~{avgHandleMin}분</span>
                    )}
                    <span className="call-used">
                      호출 {used}/{CALL_LIMIT_PER_TEAM}회
                    </span>
                    <label className="counts-toggle" title="이 호출을 팀 호출 횟수 제한에 포함할지 직접 정하세요">
                      <input
                        type="checkbox"
                        checked={c.countsTowardLimit !== false}
                        onChange={(e) => onToggleCounts(c.team, c.id, e.target.checked)}
                      />
                      횟수 포함
                    </label>
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
                          처리중 · {c.handledBy}
                          {c.handledById === coach.id ? ' (나)' : ''}
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
                </div>
              )
            })}
          </div>
        )}
      </section>

      <details className="panel done-panel">
        <summary>완료된 호출 이력 ({done.length}건)</summary>
        <div className="call-list">
          {done.map((c) => (
            <div key={c.id} className="call-card done">
              <div className="call-card-main">
                <span className="call-table">팀 {c.team}</span>
                <span className="call-company">{c.groupLabel}</span>
                <span className="call-reason">{c.reason}</span>
                <span className="call-elapsed">
                  {fmtClock(new Date(c.createdAt))} 호출 → {c.doneAt ? fmtClock(new Date(c.doneAt)) : '-'} 완료
                </span>
                <span className="call-used">담당 {c.handledBy || '-'}</span>
                <label className="counts-toggle" title="이 호출을 팀 호출 횟수 제한에 포함할지 직접 정하세요">
                  <input
                    type="checkbox"
                    checked={c.countsTowardLimit !== false}
                    onChange={(e) => onToggleCounts(c.team, c.id, e.target.checked)}
                  />
                  횟수 포함
                </label>
              </div>
            </div>
          ))}
        </div>
      </details>

      <section className="panel">
        <h3>팀별 호출 횟수 (제한 {CALL_LIMIT_PER_TEAM}회)</h3>
        {Object.entries(scan.counts).filter(([, n]) => n > 0).length === 0 ? (
          <p className="empty-text">아직 호출한 팀이 없습니다.</p>
        ) : (
          <div className="count-grid">
            {Object.entries(scan.counts)
              .filter(([, n]) => n > 0)
              .sort(([, a], [, b]) => b - a)
              .map(([teamId, n]) => {
                const nearLimit = n >= CALL_LIMIT_PER_TEAM - 1
                return (
                  <div key={teamId} className={`count-item${nearLimit ? ' near-limit' : ''}`}>
                    <span>
                      팀 {teamId} <span className="count-company">{groupLabelOf(teamId)}</span>
                    </span>
                    <b>
                      {n}회 · 잔여 {Math.max(0, CALL_LIMIT_PER_TEAM - n)}회
                    </b>
                  </div>
                )
              })}
          </div>
        )}
      </section>
    </div>
  )
}
