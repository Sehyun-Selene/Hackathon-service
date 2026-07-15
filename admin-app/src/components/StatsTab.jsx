import { useMemo } from 'react'
import { MEALS, MENU_BY_ID, CALL_LIMIT_PER_TEAM, CALL_REASONS } from '../config.js'
import { fmtCountdown } from '../lib/time.js'

// 주문/호출 이력 통계 대시보드 (PRD 5.5)
export default function StatsTab({ scan }) {
  const stats = useMemo(() => {
    // --- 주문 통계 ---
    const byMenu = {} // menuId → 누적 수량 (케이터링 발주 기준 수치)
    Object.entries(scan.orders).forEach(([, order]) => {
      MEALS.forEach((meal) => {
        const items = order.meals?.[meal.id]?.items || []
        items.forEach(({ menuId, qty }) => {
          byMenu[menuId] = (byMenu[menuId] || 0) + qty
        })
      })
    })

    // --- 호출 통계 ---
    const allCalls = Object.entries(scan.calls).flatMap(([table, data]) =>
      (data.calls || []).map((c) => ({ ...c, table })),
    )
    const byReason = {}
    CALL_REASONS.forEach((r) => (byReason[r] = 0))
    allCalls.forEach((c) => (byReason[c.reason] = (byReason[c.reason] || 0) + 1))

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

    return { byMenu, allCalls, byReason, avgHandleMs, byCoach, nearLimitTeams }
  }, [scan])

  return (
    <div>
      <section className="panel">
        <h3>📦 주문 통계</h3>
        <h4 className="stat-h4">메뉴별 누적 주문량</h4>
        {Object.keys(stats.byMenu).length === 0 ? (
          <p className="empty-text">데이터 없음</p>
        ) : (
          <div className="bar-list">
            {Object.entries(stats.byMenu)
              .sort(([, a], [, b]) => b - a)
              .map(([menuId, qty]) => {
                const max = Math.max(...Object.values(stats.byMenu))
                return (
                  <div key={menuId} className="bar-row">
                    <span className="bar-name">{MENU_BY_ID[menuId]?.name || menuId}</span>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${(qty / max) * 100}%` }} />
                    </div>
                    <b>{qty}</b>
                  </div>
                )
              })}
          </div>
        )}
      </section>

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

        <h4 className="stat-h4">사유별 분포</h4>
        <div className="totals-grid">
          {Object.entries(stats.byReason).map(([reason, n]) => (
            <div key={reason} className="total-item">
              <span>{reason}</span>
              <b>{n}건</b>
            </div>
          ))}
        </div>

        <h4 className="stat-h4">코치별 처리 건수</h4>
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
