import { useEffect, useMemo, useState } from 'react'
import {
  MEALS,
  MENUS,
  MENU_BY_ID,
  MEAL_BY_ID,
  ALL_MENUS,
  TOTAL_TEAMS,
  DELIVERY_TEAM_RANGE_SIZE,
  getAssignedCoachForTeam,
} from '../config.js'
import { getNextMeal, getOpenMeals, getVisibleMeals, now } from '../lib/time.js'
import { useSheetDrag } from '../lib/useSheetDrag.js'

function getDefaultMealId() {
  const currentTime = now().getTime()
  const openMeals = getOpenMeals(currentTime)
  if (openMeals.length) return openMeals[0].id

  const visibleMeals = getVisibleMeals(currentTime)
  if (visibleMeals.length) return visibleMeals[visibleMeals.length - 1].id

  return getNextMeal(currentTime)?.id || MEALS[MEALS.length - 1].id
}

function TeamRowList({ rows, mealFilter, singleMeal, isDelivered, onToggleDelivered }) {
  return (
    <div className="team-rows">
      {rows.map((row) => {
        const done = isDelivered(row.teamId)
        return (
          <div key={row.teamId} className={`team-row${done ? ' delivered' : ''}`}>
            <div className="team-row-body">
              <div className="team-row-head">
                <b>팀 {row.teamId}</b>
                {row.assignedName && <span className="count-company">{row.assignedName}</span>}
                {row.memberCount && <span className="member-count">{row.memberCount}명</span>}
              </div>
              <div className="team-row-items">
                {row.items.map((item, index) => (
                  <span key={index} className="ti">
                    {mealFilter === 'all' && (
                      <span className="meal-tag">{MEAL_BY_ID[item.mealId]?.label}</span>
                    )}
                    {MENU_BY_ID[item.menuId]?.name || item.menuId} <b>{item.qty}</b>
                  </span>
                ))}
              </div>
            </div>
            {singleMeal && (
              <label className="deliver-check">
                <input
                  type="checkbox"
                  checked={done}
                  onChange={(event) =>
                    onToggleDelivered(row.teamId, mealFilter, event.target.checked)
                  }
                />
                완료
              </label>
            )}
          </div>
        )
      })}
    </div>
  )
}

// 주문 현황 (PRD 5.2): 팀별 내역, 시간대 필터, 메뉴별 합산, 품절 처리,
// CSV 내보내기, 팀 번호 검색, 알러지 현황, 배부 체크(끼니별), 인쇄용 체크리스트.
export default function OrdersTab({ scan, onToggleSoldout, onToggleDelivered }) {
  const [mealFilter, setMealFilter] = useState(getDefaultMealId)
  const [showSoldoutPanel, setShowSoldoutPanel] = useState(false)
  const [showAllergyPanel, setShowAllergyPanel] = useState(false)
  const [teamQuery, setTeamQuery] = useState('')
  const [teamRange, setTeamRange] = useState('all')
  const [showDelivered, setShowDelivered] = useState(false)

  const closeUtilityPanels = () => {
    setShowAllergyPanel(false)
    setShowSoldoutPanel(false)
  }

  const allergyDrag = useSheetDrag(closeUtilityPanels)
  const soldoutDrag = useSheetDrag(closeUtilityPanels)

  useEffect(() => {
    if (!showAllergyPanel && !showSoldoutPanel) return undefined
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') closeUtilityPanels()
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [showAllergyPanel, showSoldoutPanel])

  const filteredMealIds = mealFilter === 'all' ? MEALS.map((m) => m.id) : [mealFilter]
  const singleMeal = mealFilter !== 'all' // 배부 체크는 끼니 단위로만 의미 있음
  // 지금 주문받는 중인 식사들 (저녁·야식·아침은 같은 구간을 공유해 동시에 열림)
  const soldoutMeals = getOpenMeals(now().getTime())

  // total = 총 주문 수량, remaining = 아직 배부 안 된 수량 (배부 완료 팀은 차감)
  // 배부 진행에 따라 remaining이 실시간으로 줄어듦 → 개수 검증용
  const totals = useMemo(() => {
    const total = {}
    const remaining = {}
    Object.entries(scan.orders).forEach(([teamId, order]) => {
      filteredMealIds.forEach((mealId) => {
        const deliveredThis = !!scan.delivered?.[teamId]?.[mealId]
        ;(order.meals?.[mealId]?.items || []).forEach(({ menuId, qty }) => {
          total[menuId] = (total[menuId] || 0) + qty
          if (!deliveredThis) remaining[menuId] = (remaining[menuId] || 0) + qty
        })
      })
    })
    Object.keys(total).forEach((k) => {
      if (!(k in remaining)) remaining[k] = 0
    })
    return { total, remaining }
  }, [scan.orders, scan.delivered, mealFilter])
  const anyDelivered = Object.keys(totals.total).some((k) => totals.remaining[k] !== totals.total[k])

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
  const isDelivered = (teamId) => singleMeal && !!scan.delivered?.[teamId]?.[mealFilter]
  const deliveredCount = singleMeal ? teamRows.filter((r) => isDelivered(r.teamId)).length : 0

  const rangeOptions = Array.from(
    { length: Math.ceil(TOTAL_TEAMS / DELIVERY_TEAM_RANGE_SIZE) },
    (_, index) => {
      const start = index * DELIVERY_TEAM_RANGE_SIZE + 1
      const end = Math.min(start + DELIVERY_TEAM_RANGE_SIZE - 1, TOTAL_TEAMS)
      return { id: `${start}-${end}`, start, end, label: `${start}~${end}` }
    },
  )
  const selectedRange = rangeOptions.find((range) => range.id === teamRange)
  const rangedRows = selectedRange
    ? teamRows.filter((row) => {
        const teamNumber = parseInt(row.teamId, 10)
        return teamNumber >= selectedRange.start && teamNumber <= selectedRange.end
      })
    : teamRows
  const pendingRows = singleMeal ? rangedRows.filter((row) => !isDelivered(row.teamId)) : rangedRows
  const completedRows = singleMeal ? rangedRows.filter((row) => isDelivered(row.teamId)) : []
  const visibleRows = hasQuery
    ? teamRows.filter((row) => parseInt(row.teamId, 10) === queryNum)
    : pendingRows

  // 알러지 현황: 같은 알러지 조합을 가진 사람끼리 팀 안에서 묶어 표시
  const allergyInfo = useMemo(() => {
    const teamsWith = []
    Object.entries(scan.teams).forEach(([teamId, team]) => {
      const people = (team.allergies || []).map((p) => (Array.isArray(p) ? p : [p]))
      if (!people.length) return
      const groupCounts = {}
      people.forEach((personList) => {
        const allergies = [...personList].filter(Boolean).sort().join('·')
        if (allergies) groupCounts[allergies] = (groupCounts[allergies] || 0) + 1
      })
      teamsWith.push({
        teamId,
        assignedName: getAssignedCoachForTeam(teamId)?.name,
        groups: Object.entries(groupCounts).map(([allergies, count]) => ({ allergies, count })),
      })
    })
    teamsWith.sort((a, b) => a.teamId.localeCompare(b.teamId, undefined, { numeric: true }))
    return { teamsWith }
  }, [scan.teams])

  // 메뉴 알러지 성분(config.MENUS[].allergens)과 팀 등록 알러지가 겹치는 인원 집계
  // — 겹치는 인원은 대체 메뉴 준비 대상이므로 별도 인원 수로 관리
  const menuAllergenInfo = useMemo(() => {
    const menusWithAllergens = ALL_MENUS.filter((m) => (m.allergens || []).length > 0)
    const perMenu = menusWithAllergens.map((menu) => ({ menu, count: 0 }))
    let totalAffected = 0
    Object.values(scan.teams).forEach((team) => {
      ;(team.allergies || [])
        .map((p) => (Array.isArray(p) ? p : [p]))
        .forEach((personList) => {
          const hits = menusWithAllergens.filter((menu) =>
            menu.allergens.some((a) => personList.includes(a)),
          )
          if (hits.length) totalAffected += 1
          hits.forEach((menu) => {
            const entry = perMenu.find((x) => x.menu.id === menu.id)
            if (entry) entry.count += 1
          })
        })
    })
    return { perMenu, totalAffected, configured: menusWithAllergens.length > 0 }
  }, [scan.teams])

  const exportCsv = () => {
    const rows = [['팀', '담당 캠프지기', '인원수', '식사', '메뉴', '수량']]
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

  // (C) 인쇄용 배부 체크리스트 — 현재 끼니 필터 기준, 팀번호순, 종이 체크칸 포함
  const printChecklist = () => {
    const label = mealFilter === 'all' ? '전체' : MEAL_BY_ID[mealFilter].label
    const rangeLabel = selectedRange ? `${selectedRange.label}번` : '전체 팀'
    const rowsHtml = rangedRows
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
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>배부 체크리스트 — ${label}</title>
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
<h1>배부 체크리스트 — ${label} · ${rangeLabel}</h1>
<div class="sub">총 ${rangedRows.length}팀 · 배부 시 왼쪽 칸에 체크</div>
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
        <section className="workflow-step workflow-meal-step">
          <div className="workflow-step-head">
            <span className="step-number">1</span>
            <b>식사 선택</b>
          </div>
          <div className="filter-group">
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
        </section>
        <div className="toolbar-actions">
          <label className="table-search-wrap">
            <svg
              className="table-search-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-4-4" />
            </svg>
            <input
              className="table-search"
              type="search"
              inputMode="numeric"
              placeholder="팀번호"
              value={teamQuery}
              onChange={(e) => setTeamQuery(e.target.value)}
              aria-label="팀 번호 검색"
            />
          </label>
          <button
            className={`btn-ghost toolbar-tool${showAllergyPanel ? ' active' : ''}`}
            onClick={() => {
              setShowAllergyPanel((current) => !current)
              setShowSoldoutPanel(false)
            }}
          >
            알러지 {allergyInfo.teamsWith.length}
          </button>
          <button
            className={`btn-ghost toolbar-tool${showSoldoutPanel ? ' active' : ''}`}
            onClick={() => {
              setShowSoldoutPanel((current) => !current)
              setShowAllergyPanel(false)
            }}
          >
            품절 관리
          </button>
          <button className="btn-ghost toolbar-tool" onClick={printChecklist}>
            체크리스트
          </button>
          <button className="btn-secondary toolbar-tool" onClick={exportCsv}>
            CSV
          </button>
        </div>
      </div>

      {singleMeal && (
        <section className="delivery-range-bar" aria-label="배부할 팀 번호 구간">
          <div className="delivery-range-head">
            <div className="workflow-step-head">
              <span className="step-number">2</span>
              <b>배부 구간</b>
            </div>
            <span className="pending-count">미배부 {pendingRows.length}팀</span>
          </div>
          <div className="filter-group delivery-ranges">
            <button
              className={`chip${teamRange === 'all' ? ' on' : ''}`}
              onClick={() => setTeamRange('all')}
            >
              전체
            </button>
            {rangeOptions.map((range) => (
              <button
                key={range.id}
                className={`chip${teamRange === range.id ? ' on' : ''}`}
                onClick={() => setTeamRange(range.id)}
              >
                {range.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {showAllergyPanel && (
        <div className="bottom-sheet-backdrop" onClick={closeUtilityPanels}>
          <section
            className="bottom-sheet allergy-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="allergy-sheet-title"
            onClick={(event) => event.stopPropagation()}
            style={allergyDrag.sheetStyle}
          >
            <div className="sheet-handle" aria-hidden="true" {...allergyDrag.handleHandlers} />
            <div className="sheet-head">
              <h3 id="allergy-sheet-title">알러지 현황</h3>
              <button className="sheet-close" onClick={closeUtilityPanels}>닫기</button>
            </div>
            <p className="sheet-description">팀별 대체 메뉴 준비에 참고하세요.</p>
            <div className="sheet-body">
              {/* 메뉴 성분과 겹치는 알러지 인원 — 대체 메뉴 준비 수량의 기준 */}
              {menuAllergenInfo.configured ? (
                <div className="allergy-menu-summary">
                  <div className="allergy-menu-total">
                    ⚠️ 메뉴 알러지 해당 인원 <b>{menuAllergenInfo.totalAffected}명</b>
                  </div>
                  <div className="allergy-menu-rows">
                    {menuAllergenInfo.perMenu.map(({ menu, count }) => (
                      <span key={menu.id} className="allergy-person-chip">
                        {menu.name} ({menu.allergens.join('·')}) <b>{count}명</b>
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="allergy-menu-note">
                  💡 config.js의 메뉴별 <b>allergens</b>를 채우면, 메뉴 성분과 겹치는
                  알러지 인원이 여기 자동 집계됩니다.
                </p>
              )}
              {allergyInfo.teamsWith.length === 0 ? (
                <p className="empty-text">알러지를 등록한 인원이 없습니다.</p>
              ) : (
                <div className="allergy-teams">
                {allergyInfo.teamsWith.map((t) => (
                  <div key={t.teamId} className="allergy-team-row">
                    <b>
                      팀 {t.teamId}
                      {t.assignedName && <span className="count-company"> {t.assignedName}</span>}
                    </b>
                    <div className="allergy-person-groups">
                      {t.groups.map((group) => (
                        <span key={group.allergies} className="allergy-person-chip">
                          {group.allergies} <b>{group.count}인</b>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {showSoldoutPanel && (
        <div className="bottom-sheet-backdrop" onClick={closeUtilityPanels}>
          <section
            className="bottom-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="soldout-sheet-title"
            onClick={(event) => event.stopPropagation()}
            style={soldoutDrag.sheetStyle}
          >
            <div className="sheet-handle" aria-hidden="true" {...soldoutDrag.handleHandlers} />
            <div className="sheet-head">
              <h3 id="soldout-sheet-title">
                품절 관리
                {soldoutMeals.length > 0 && ` · ${soldoutMeals.map((m) => m.label).join('·')}`}
              </h3>
              <button className="sheet-close" onClick={closeUtilityPanels}>닫기</button>
            </div>
            <p className="sheet-description">
              {soldoutMeals.length
                ? '메뉴를 누르면 참가자 화면에서 즉시 주문할 수 없게 됩니다.'
                : '현재 주문 가능한 식사가 없습니다.'}
            </p>
            <div className="sheet-body">
              {soldoutMeals.length ? (
                soldoutMeals.map((meal) => (
                  <div key={meal.id} className="soldout-row soldout-row-current">
                    <b>{meal.label}</b>
                    <div className="soldout-chips">
                      {(MENUS[meal.id] || []).map((m) => (
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
                ))
              ) : (
                <p className="empty-text">주문 가능 시간이 되면 해당 식사의 메뉴가 표시됩니다.</p>
              )}
            </div>
          </section>
        </div>
      )}

      <section className="panel">
        <h3>메뉴별 합산 수량 {mealFilter !== 'all' && `— ${MEAL_BY_ID[mealFilter].label}`}</h3>
        {Object.keys(totals.total).length === 0 ? (
          <p className="empty-text">아직 주문이 없습니다.</p>
        ) : (
          <div className="totals-grid">
            {Object.entries(totals.total)
              .sort(([, a], [, b]) => b - a)
              .map(([menuId, total]) => {
                const remain = totals.remaining[menuId]
                const allDone = anyDelivered && remain === 0
                return (
                  <div key={menuId} className={`total-item${allDone ? ' done' : ''}`}>
                    <span>{MENU_BY_ID[menuId]?.name || menuId}</span>
                    <b>
                      {remain}개
                      {anyDelivered && remain !== total && (
                        <span className="total-of"> / 총 {total}</span>
                      )}
                    </b>
                  </div>
                )
              })}
          </div>
        )}
      </section>

      <section className="panel delivery-team-panel">
        <div className="panel-head-row">
          <h3 className="workflow-heading">
            {singleMeal && !hasQuery && <span className="step-number">3</span>}
            {singleMeal && !hasQuery ? '미배부 팀' : '팀별 주문'} ({visibleRows.length}팀
            {hasQuery && ` — "${queryNum}번" 검색 중`})
          </h3>
          {singleMeal && teamRows.length > 0 && (
            <span className="deliver-progress">
              배부 {deliveredCount}/{teamRows.length}팀 완료
            </span>
          )}
        </div>

        {!singleMeal && teamRows.length > 0 && (
          <p className="deliver-hint">
            끼니({MEALS.map((m) => m.label).join('/')})를 선택하면 팀별 <b>완료 체크</b>를 쓸 수 있어요.
          </p>
        )}

        {visibleRows.length === 0 ? (
          <p className="empty-text">
            {hasQuery
              ? `팀 ${String(queryNum).padStart(2, '0')}의 주문 내역이 없습니다.`
              : singleMeal
                ? '선택한 구간의 배부가 모두 완료됐습니다.'
                : '아직 주문이 없습니다.'}
          </p>
        ) : (
          <TeamRowList
            rows={visibleRows}
            mealFilter={mealFilter}
            singleMeal={singleMeal}
            isDelivered={isDelivered}
            onToggleDelivered={onToggleDelivered}
          />
        )}

        {singleMeal && !hasQuery && completedRows.length > 0 && (
          <div className="completed-deliveries">
            <button
              className="completed-toggle"
              onClick={() => setShowDelivered((current) => !current)}
              aria-expanded={showDelivered}
            >
              배부 완료 팀 {completedRows.length}팀 {showDelivered ? '접기' : '보기'}
            </button>
            {showDelivered && (
              <TeamRowList
                rows={completedRows}
                mealFilter={mealFilter}
                singleMeal={singleMeal}
                isDelivered={isDelivered}
                onToggleDelivered={onToggleDelivered}
              />
            )}
          </div>
        )}
      </section>
    </div>
  )
}
