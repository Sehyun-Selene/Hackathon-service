import { useMemo, useState } from 'react'
import { MEALS, MENUS, MENU_BY_ID, MEAL_BY_ID, getCoachGroupForTeam } from '../config.js'

// 주문 현황 (PRD 5.2): 팀별 내역, 시간대 필터, 메뉴별 합산, 품절 처리,
// CSV 내보내기, 팀 번호 검색, 인원수 대비 과다 주문 표시, 알러지 현황.
export default function OrdersTab({ scan, onToggleSoldout }) {
  const [mealFilter, setMealFilter] = useState('all')
  const [showSoldoutPanel, setShowSoldoutPanel] = useState(false)
  const [showAllergyPanel, setShowAllergyPanel] = useState(false)
  const [teamQuery, setTeamQuery] = useState('')

  const filteredMealIds = mealFilter === 'all' ? MEALS.map((m) => m.id) : [mealFilter]

  const totals = useMemo(() => {
    const acc = {}
    Object.values(scan.orders).forEach((order) => {
      filteredMealIds.forEach((mealId) => {
        ;(order.meals?.[mealId]?.items || []).forEach(({ menuId, qty }) => {
          acc[menuId] = (acc[menuId] || 0) + qty
        })
      })
    })
    return acc
  }, [scan.orders, mealFilter])

  const teamRows = useMemo(() => {
    return Object.entries(scan.orders)
      .map(([teamId, order]) => {
        const rows = []
        const memberCount = scan.teams[teamId]?.memberCount
        let over = false
        filteredMealIds.forEach((mealId) => {
          let foodQty = 0
          ;(order.meals?.[mealId]?.items || []).forEach(({ menuId, qty }) => {
            const menu = MENU_BY_ID[menuId]
            rows.push({ mealId, menuId, qty })
            if (menu?.category === 'food') foodQty += qty
          })
          if (memberCount && foodQty > memberCount) over = true
        })
        return rows.length
          ? { teamId, rows, over, groupLabel: getCoachGroupForTeam(teamId)?.label, memberCount }
          : null
      })
      .filter(Boolean)
      .sort((a, b) => a.teamId.localeCompare(b.teamId, undefined, { numeric: true }))
  }, [scan.orders, scan.teams, mealFilter])

  const queryNum = parseInt(teamQuery, 10)
  const hasQuery = teamQuery.trim() !== '' && Number.isFinite(queryNum)
  const visibleRows = hasQuery
    ? teamRows.filter((r) => parseInt(r.teamId, 10) === queryNum)
    : teamRows

  // 알러지 현황: 항목별 "명" 수 집계 + 팀별 인원 단위 목록
  // team.allergies = [[사람1의 알러지...], [사람2의 알러지...]] — 사람 단위로 구분되어 있어
  // "몇 명이 어떤 조합으로 겹치는지"를 그대로 보여줄 수 있음 (대체 메뉴 준비 개수 판단용)
  const allergyInfo = useMemo(() => {
    const byAllergy = {} // 항목 → 해당 항목을 가진 "인원 수" (팀 수 아님)
    const teamsWith = []
    Object.entries(scan.teams).forEach(([teamId, team]) => {
      // 사람 단위 배열([[...],[...]])이 정상 형태 — 예전 형식(문자열 배열)이 섞여 있어도
      // 화면 전체가 죽지 않도록 방어적으로 감쌈
      const people = (team.allergies || []).map((p) => (Array.isArray(p) ? p : [p]))
      if (people.length) teamsWith.push({ teamId, groupLabel: getCoachGroupForTeam(teamId)?.label, people })
      people.forEach((personList) => {
        personList.forEach((a) => (byAllergy[a] = (byAllergy[a] || 0) + 1))
      })
    })
    teamsWith.sort((a, b) => a.teamId.localeCompare(b.teamId, undefined, { numeric: true }))
    return { byAllergy, teamsWith }
  }, [scan.teams])

  const exportCsv = () => {
    const rows = [['팀', '담당 조', '인원수', '식사', '카테고리', '메뉴', '수량']]
    Object.entries(scan.orders)
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .forEach(([teamId, order]) => {
        const team = scan.teams[teamId] || {}
        MEALS.forEach((meal) => {
          ;(order.meals?.[meal.id]?.items || []).forEach(({ menuId, qty }) => {
            const menu = MENU_BY_ID[menuId]
            rows.push([
              teamId,
              getCoachGroupForTeam(teamId)?.label || '',
              team.memberCount || '',
              meal.label,
              menu?.category === 'food' ? '음식' : '음료',
              menu?.name || menuId,
              qty,
            ])
          })
        })
      })
    const csv =
      '﻿' +
      rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `해커톤_주문내역_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div>
      <div className="toolbar">
        <div className="filter-group">
          <button
            className={`chip${mealFilter === 'all' ? ' on' : ''}`}
            onClick={() => setMealFilter('all')}
          >
            전체
          </button>
          {MEALS.map((m) => (
            <button
              key={m.id}
              className={`chip${mealFilter === m.id ? ' on' : ''}`}
              onClick={() => setMealFilter(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="toolbar-actions">
          <input
            className="table-search"
            type="search"
            inputMode="numeric"
            placeholder="🔍 팀 번호"
            value={teamQuery}
            onChange={(e) => setTeamQuery(e.target.value)}
            aria-label="팀 번호 검색"
          />
          <button className="btn-ghost" onClick={() => setShowAllergyPanel((v) => !v)}>
            🥗 알러지 {showAllergyPanel ? '닫기' : `(${allergyInfo.teamsWith.length}팀)`}
          </button>
          <button className="btn-ghost" onClick={() => setShowSoldoutPanel((v) => !v)}>
            🚫 품절 {showSoldoutPanel ? '닫기' : '관리'}
          </button>
          <button className="btn-secondary" onClick={exportCsv}>
            ⬇️ CSV
          </button>
        </div>
      </div>

      {showAllergyPanel && (
        <section className="panel allergy-panel">
          <h3>🥗 알러지 현황 (대체 메뉴 준비 참고)</h3>
          {allergyInfo.teamsWith.length === 0 ? (
            <p className="empty-text">알러지를 등록한 인원이 없습니다.</p>
          ) : (
            <>
              <p className="allergy-summary-hint">
                항목별 숫자는 <b>인원 수</b> 기준입니다 (한 사람이 여러 개 가진 경우 아래 팀별 목록에서
                묶여서 표시됩니다).
              </p>
              <div className="totals-grid">
                {Object.entries(allergyInfo.byAllergy)
                  .sort(([, a], [, b]) => b - a)
                  .map(([a, n]) => (
                    <div key={a} className="total-item allergy-tag">
                      <span>{a}</span>
                      <b>{n}명</b>
                    </div>
                  ))}
              </div>
              <div className="allergy-teams">
                {allergyInfo.teamsWith.map((t) => (
                  <div key={t.teamId} className="allergy-team-row">
                    <b>
                      팀 {t.teamId}
                      {t.groupLabel && <span className="count-company"> {t.groupLabel}</span>}
                    </b>
                    <span>
                      {t.people.map((personList, i) => `${i + 1}인(${personList.join('·')})`).join(', ')}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {showSoldoutPanel && (
        <section className="panel">
          <h3>품절 처리 (누르면 토글 — 참가자 화면에서 즉시 주문 불가)</h3>
          {MEALS.map((meal) => (
            <div key={meal.id} className="soldout-row">
              <b>{meal.label}</b>
              <div className="soldout-chips">
                {MENUS[meal.id].map((m) => (
                  <button
                    key={m.id}
                    className={`chip${scan.soldout[m.id] ? ' soldout-on' : ''}`}
                    onClick={() => onToggleSoldout(m.id)}
                  >
                    {scan.soldout[m.id] ? '🚫 ' : ''}
                    {m.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="panel">
        <h3>메뉴별 합산 수량 {mealFilter !== 'all' && `— ${MEAL_BY_ID[mealFilter].label}`}</h3>
        {Object.keys(totals).length === 0 ? (
          <p className="empty-text">아직 주문이 없습니다.</p>
        ) : (
          <div className="totals-grid">
            {Object.entries(totals)
              .sort(([, a], [, b]) => b - a)
              .map(([menuId, qty]) => (
                <div key={menuId} className="total-item">
                  <span>{MENU_BY_ID[menuId]?.name || menuId}</span>
                  <b>{qty}개</b>
                </div>
              ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h3>
          팀별 주문 ({visibleRows.length}팀{hasQuery && ` — "${queryNum}번" 검색 중`})
        </h3>
        {visibleRows.length === 0 ? (
          <p className="empty-text">
            {hasQuery
              ? `팀 ${String(queryNum).padStart(2, '0')}의 주문 내역이 없습니다.`
              : '아직 주문이 없습니다.'}
          </p>
        ) : (
          <div className="table-grid">
            {visibleRows.map(({ teamId, rows, over, groupLabel, memberCount }) => (
              <div key={teamId} className={`table-card${over ? ' over' : ''}`}>
                <div className="table-card-head">
                  <b>
                    팀 {teamId}
                    {groupLabel && <span className="count-company"> {groupLabel}</span>}
                    {memberCount && <span className="member-count"> · {memberCount}명</span>}
                  </b>
                  {over && <span className="over-badge">⚠️ 인원 대비 과다</span>}
                </div>
                <ul>
                  {rows.map((r, i) => (
                    <li key={i}>
                      <span className="meal-tag">{MEAL_BY_ID[r.mealId]?.label}</span>
                      {MENU_BY_ID[r.menuId]?.name || r.menuId}
                      <b>{r.qty}</b>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
