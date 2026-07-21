import { useMemo } from 'react'
import { CALL_LIMIT_PER_TEAM } from '../config.js'
import { fmtCountdown } from '../lib/time.js'

// 호출 이력 통계 대시보드 (PRD 5.5)
// 주문 쪽 통계는 "주문 현황" 탭(끼니 필터 + 메뉴별 합산 + 팀별 주문)이 그대로
// 커버하므로 여기서는 다루지 않고, 주문현황엔 없는 호출 통계만 제공.
export default function StatsTab({ scan }) {
  const stats = useMemo(() => {
    const allCalls = Object.entries(scan.calls).flatMap(([table, data]) =>
      (data.calls || []).map((c) => ({ ...c, table })),
    )
    const doneCalls = allCalls.filter((c) => c.status === 'done' && c.doneAt)
    const avgHandleMs = doneCalls.length
      ? doneCalls.reduce((s, c) => s + (c.doneAt - c.createdAt), 0) / doneCalls.length
      : null

    const byCoach = {}
    doneCalls.forEach((c) => {
      if (c.handledBy) byCoach[c.handledBy] = (byCoach[c.handledBy] || 0) + 1
    })

    const nearLimitTeams = Object.entries(scan.counts)
      .filter(([, n]) => n >= CALL_LIMIT_PER_TEAM - 1)
      .sort(([, a], [, b]) => b - a)

    return { allCalls, avgHandleMs, byCoach, nearLimitTeams }
  }, [scan])

  return (
    <div>
      <section className="panel">
        <h3>🙋 호출 통계</h3>
        <div className="stat-cards">
          <div className="stat-card">
            <div className="stat-label">총 호출</div>
            <div className="stat-value">{stats.allCalls.length}건</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">평균 처리 시간</div>
            <div className="stat-value">
              {stats.avgHandleMs != null ? fmtCountdown(stats.avgHandleMs) : '-'}
            </div>
            <div className="stat-sub">호출 → 완료</div>
          </div>
        </div>

        <h4 className="stat-h4">캠프지기별 처리 건수</h4>
        {Object.keys(stats.byCoach).length === 0 ? (
          <p className="empty-text">완료된 호출 없음</p>
        ) : (
          <div className="totals-grid">
            {Object.entries(stats.byCoach)
              .sort(([, a], [, b]) => b - a)
              .map(([coach, n]) => (
                <div key={coach} className="total-item">
                  <span>🧑‍🏫 {coach}</span>
                  <b>{n}건</b>
                </div>
              ))}
          </div>
        )}

        <h4 className="stat-h4">호출 제한 근접/도달 팀 (제한 {CALL_LIMIT_PER_TEAM}회)</h4>
        {stats.nearLimitTeams.length === 0 ? (
          <p className="empty-text">해당 팀 없음</p>
        ) : (
          <div className="totals-grid">
            {stats.nearLimitTeams.map(([teamId, n]) => (
              <div key={teamId} className={`total-item${n >= CALL_LIMIT_PER_TEAM ? ' limit-hit' : ' limit-near'}`}>
                <span>팀 {teamId}</span>
                <b>
                  {n}회 {n >= CALL_LIMIT_PER_TEAM ? '(도달 🔴)' : '(근접 🟡)'}
                </b>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
