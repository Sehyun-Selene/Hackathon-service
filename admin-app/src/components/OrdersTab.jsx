import { useMemo, useState } from 'react'
import { MEALS, MENUS, MENU_BY_ID, MEAL_BY_ID, getAssignedCoachForTeam } from '../config.js'

// 주문 현황 (PRD 5.2): 팀별 내역, 시간대 필터, 메뉴별 합산, 품절 처리,
// CSV 내보내기, 팀 번호 검색, 알러지 현황, 배달 체크(끼니별), 인쇄용 체크리스트.
export default function OrdersTab({ scan, onToggleSoldout, onToggleDelivered }) {
  const [mealFilter, setMealFilter] = useState('all')
  const [showSoldoutPanel, setShowSoldoutPanel] = useState(false)
  const [showAllergyPanel, setShowAllergyPanel] = useState(false)
  const [teamQuery, setTeamQuery] = useState('')

  const filteredMealIds = mealFilter === 'all' ? MEALS.map((m) => m.id) : [mealFilter]
  const singleMeal = mealFilter !== 'all' // 배달 체크는 끼니 단위로만 의미 있음

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

  // 팀별 주문 행 (선택 끼니 기준). items: [{mealId, menuId, qty}]
  const teamRows = useMemo(() => {
    return Object.entries(scan.orders)
      .map(([teamId, order]) => {
        const items = []
        filteredMealIds.forEach((mealId) => {
          ;(order.meals?.[mealId]?.items || []).forEach(({ menuId, qty }) => {
            items.push({ mealId, menuId, qty })
          })
        })
        return items.length
          ? {
              teamId,
              items,
              assignedName: getAssignedCoachForTeam(teamId)?.name,
              memberCount: scan.teams[teamId]?.memberCount,
            }
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

  const isDelivered = (teamId) => singleMeal && !!scan.delivered?.[teamId]?.[mealFilter]
  const deliveredCount = singleMeal ? teamRows.filter((r) => isDelivered(r.teamId)).length : 0

  // 알러지 현황 (사람 단위)
  const allergyInfo = useMemo(() => {
    const byAllergy = {}
    const teamsWith = []
    Object.entries(scan.teams).forEach(([teamId, team]) => {
      const people = (team.allergies || []).map((p) => (Array.isArray(p) ? p : [p]))
      if (people.length)
        teamsWith.push({ teamId, assignedName: getAssignedCoachForTeam(teamId)?.name, people })
      people.forEach((personList) => {
        personList.forEach((a) => (byAllergy[a] = (byAllergy[a] || 0) + 1))
      })
    })
    teamsWith.sort((a, b) => a.teamId.localeCompare(b.teamId, undefined, { numeric: true }))
    return { byAllergy, teamsWith }
  }, [scan.teams])

  const exportCsv = () => {
    const rows = [['팀', '담당 코치', '인원수', '식사', '카테고리', '메뉴', '수량']]
    Object.entries(scan.orders)
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .forEach(([teamId, order]) => {
        const team = scan.teams[teamId] || {}
        MEALS.forEach((meal) => {
          ;(order.meals?.[meal.id]?.items || []).forEach(({ menuId, qty }) => {
            const menu = MENU_BY_ID[menuId]
            rows.push([
              teamId,
              getAssignedCoachForTeam(teamId)?.name || '',
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

  // (C) 인쇄용 배달 체크리스트 — 현재 끼니 필터 기준, 팀번호순, 종이 체크칸 포함
  const printChecklist = () => {
    const label = mealFilter === 'all' ? '전체' : MEAL_BY_ID[mealFilter].label
    const rowsHtml = teamRows
      .map((r) => {
        const items = r.items
          .map((it) => {
            const name = MENU_BY_ID[it.menuId]?.name || it.menuId
            const tag = mealFilter === 'all' ? `[${MEAL_BY_ID[it.mealId]?.label}] ` : ''
            return `${tag}${name} ${it.qty}`
          })
          .join(', ')
        const coach = r.assignedName ? ` (${r.assignedName})` : ''
        return `<tr><td class="c">☐</td><td class="t">팀 ${r.teamId}${coach}</td><td>${items}</td></tr>`
      })
      .join('')
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>배달 체크리스트 — ${label}</title>
<style>
  body { font-family: 'Malgun Gothic', system-ui, sans-serif; padding: 16px; color:#111; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .sub { color:#666; font-size:12px; margin-bottom:12px; }
  table { width:100%; border-collapse: collapse; font-size: 13px; }
  th, td { border:1px solid #999; padding:6px 8px; text-align:left; vertical-align:top; }
  th { background:#eee; }
  td.c { width:28px; text-align:center; font-size:16px; }
  td.t { white-space:nowrap; font-weight:700; }
  @media print { .noprint { display:none; } }
</style></head><body>
<h1>배달 체크리스트 — ${label}</h1>
<div class="sub">총 ${teamRows.length}팀 · 배달 시 왼쪽 칸에 체크</div>
<button class="noprint" onclick="window.print()" style="margin-bottom:12px;padding:8px 14px;">🖨 인쇄</button>
<table><thead><tr><th>완료</th><th>팀</th><th>주문 내역</th></tr></thead><tbody>${rowsHtml}</tbody></table>
</body></html>`
    const w = window.open('', '_blank')
    if (!w) {
      alert('팝업이 차단되어 인쇄 창을 열 수 없습니다. 브라우저에서 팝업을 허용해 주세요.')
      return
    }
    w.document.write(html)
    w.document.close()
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
          <button className="btn-ghost" onClick={printChecklist}>
            🖨 체크리스트
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
                      {t.assignedName && <span className="count-company"> {t.assignedName}</span>}
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
        <div className="panel-head-row">
          <h3>
            팀별 주문 ({visibleRows.length}팀{hasQuery && ` — "${queryNum}번" 검색 중`})
          </h3>
          {singleMeal && teamRows.length > 0 && (
            <span className="deliver-progress">
              배달 {deliveredCount}/{teamRows.length}팀 완료
            </span>
          )}
        </div>

        {!singleMeal && teamRows.length > 0 && (
          <p className="deliver-hint">
            끼니(저녁/야식/아침/점심)를 선택하면 팀별 <b>배달 완료 체크</b>를 쓸 수 있어요.
          </p>
        )}

        {visibleRows.length === 0 ? (
          <p className="empty-text">
            {hasQuery
              ? `팀 ${String(queryNum).padStart(2, '0')}의 주문 내역이 없습니다.`
              : '아직 주문이 없습니다.'}
          </p>
        ) : (
          <div className="team-rows">
            {visibleRows.map((r) => {
              const done = isDelivered(r.teamId)
              return (
                <div key={r.teamId} className={`team-row${done ? ' delivered' : ''}`}>
                  <div className="team-row-body">
                    <div className="team-row-head">
                      <b>팀 {r.teamId}</b>
                      {r.assignedName && <span className="count-company">{r.assignedName}</span>}
                      {r.memberCount && <span className="member-count">{r.memberCount}명</span>}
                    </div>
                    <div className="team-row-items">
                      {r.items.map((it, i) => (
                        <span key={i} className="ti">
                          {mealFilter === 'all' && (
                            <span className="meal-tag">{MEAL_BY_ID[it.mealId]?.label}</span>
                          )}
                          {MENU_BY_ID[it.menuId]?.name || it.menuId} <b>{it.qty}</b>
                        </span>
                      ))}
                    </div>
                  </div>
                  {singleMeal && (
                    <label className="deliver-check">
                      <input
                        type="checkbox"
                        checked={done}
                        onChange={(e) => onToggleDelivered(r.teamId, mealFilter, e.target.checked)}
                      />
                      배달완료
                    </label>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
