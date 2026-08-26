import { useCallback, useMemo, useState } from 'react'
import {
  MEALS,
  MENUS,
  MENU_BY_ID,
  MEAL_BY_ID,
  TOTAL_TEAMS,
  DELIVERY_TEAM_RANGE_SIZE,
  getAssignedCoachForTeam,
  personDiet,
} from '../config.js'
import { getOpenMeals, now } from '../lib/time.js'
import { useSheetDrag } from '../lib/useSheetDrag.js'
import { useDialogFocus } from '../lib/useDialogFocus.js'

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

// 배부 목록의 한 줄.
//
// 배부하는 사람이 읽는 것은 "팀 번호 → 메뉴별 개수"뿐이라, 수량을 가장 크게
// 두고 한 줄에 담습니다. 메뉴 칸은 그 끼니의 메뉴 수만큼 **고정**해서, 한 메뉴만
// 주문한 팀이 섞여 있어도 숫자가 항상 같은 열에 옵니다(주문 없는 칸은 비움).
// 인원수는 배부에 쓰이지 않아 표시하지 않습니다.
function TeamRowList({ rows, mealFilter, singleMeal, isDelivered, onToggleDelivered }) {
  const slots = singleMeal ? MENUS[mealFilter] || [] : []
  return (
    // --rows: 넓은 화면에서 두 칼럼으로 나눌 때 왼쪽 칼럼에 넣을 행 수.
    // 홀수면 왼쪽을 하나 더 채웁니다(위에서 아래로 읽는 순서와 맞음).
    <div className="team-rows" style={{ '--rows': Math.ceil(rows.length / 2) }}>
      {rows.map((row) => {
        const done = isDelivered(row.teamId)
        const qtyOf = (menuId) =>
          row.items.filter((it) => it.menuId === menuId).reduce((sum, it) => sum + it.qty, 0)
        return (
          <div key={row.teamId} className={`team-row${done ? ' delivered' : ''}`}>
            <b className="team-row-no">팀 {row.teamId}</b>
            {slots.length ? (
              <div className="team-row-slots" style={{ '--slots': slots.length }}>
                {slots.map((menu) => {
                  const qty = qtyOf(menu.id)
                  return (
                    <span key={menu.id} className={`slot${qty ? '' : ' empty'}`}>
                      {qty > 0 && (
                        <>
                          <span className="slot-name">{menu.shortLabel || menu.name}</span>
                          <b className="slot-qty">{qty}</b>
                        </>
                      )}
                    </span>
                  )
                })}
              </div>
            ) : (
              /* 끼니 '전체' 보기 — 고정 칸이 성립하지 않아 나열합니다 */
              <div className="team-row-slots wrap">
                {row.items.map((item, index) => (
                  <span key={index} className="slot">
                    <span className="meal-tag">{MEAL_BY_ID[item.mealId]?.label}</span>
                    <span className="slot-name">
                      {MENU_BY_ID[item.menuId]?.shortLabel || MENU_BY_ID[item.menuId]?.name}
                    </span>
                    <b className="slot-qty">{item.qty}</b>
                  </span>
                ))}
              </div>
            )}
            {singleMeal && (
              <label className="deliver-check">
                <input
                  type="checkbox"
                  checked={done}
                  onChange={(event) =>
                    onToggleDelivered(row.teamId, mealFilter, event.target.checked)
                  }
                />
                {/* 아주 좁은 폰에서는 메뉴명이 잘리지 않게 이 글자를 접습니다
                    (체크박스만으로도 뜻이 통함) */}
                <span className="tiny-hide">완료</span>
              </label>
            )}
          </div>
        )
      })}
    </div>
  )
}

// 주문 현황 (PRD 5.2): 팀별 내역, 시간대 필터, 메뉴별 합산, 품절 처리,
// 팀 번호 검색, 알레르기 현황, 배부 체크(끼니별), 인쇄용 체크리스트.
// 식사 선택(DAY 1 야식 / DAY 2 아침)은 좌측 메뉴의 하위 항목으로 옮겨졌으므로
// mealFilter는 App에서 관리하고 prop으로 받습니다.
export default function OrdersTab({ scan, mealFilter, onToggleSoldout, onToggleDelivered }) {
  const [showSoldoutPanel, setShowSoldoutPanel] = useState(false)
  const [showAllergyPanel, setShowAllergyPanel] = useState(false)
  const [teamQuery, setTeamQuery] = useState('')
  const [teamRange, setTeamRange] = useState('all')
  // 배부 목록 탭 — 'pending'(미배부) 기본, 'done'(배부 완료)
  const [deliveryTab, setDeliveryTab] = useState('pending')
  // 폰에서는 도구가 두 개뿐이라 버튼 줄을 따로 두지 않고, 검색칸 오른쪽의
  // 더보기(⋯)로 묶습니다
  const [moreOpen, setMoreOpen] = useState(false)

  const closeUtilityPanels = useCallback(() => {
    setShowAllergyPanel(false)
    setShowSoldoutPanel(false)
  }, [])

  const allergyDrag = useSheetDrag(closeUtilityPanels)
  const soldoutDrag = useSheetDrag(closeUtilityPanels)
  const allergyDialogRef = useDialogFocus(showAllergyPanel, closeUtilityPanels)
  const soldoutDialogRef = useDialogFocus(showSoldoutPanel, closeUtilityPanels)

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
  // 검색 중에는 검색 결과를, 아니면 선택한 배부 탭의 목록을 보여줍니다
  const shownRows = hasQuery
    ? visibleRows
    : !singleMeal
      ? rangedRows
      : deliveryTab === 'done'
        ? completedRows
        : pendingRows

  // 알레르기 현황: 같은 알레르기 조합을 가진 사람끼리 팀 안에서 묶어 표시
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

  // 대체식 필요 인원 — 케이터링에 넘길 실제 숫자.
  // 메뉴 성분이 겹치는 것만으로는 대체식 대상이 아닙니다. 같은 끼니의 다른
  // 메뉴를 먹을 수 있으면 대체식이 필요 없기 때문입니다.
  // (예: 쇠고기만 있으면 야식은 페퍼로니로 해결 → 대체식 불필요)
  const altMealInfo = useMemo(() => {
    const byMeal = {}
    MEALS.forEach((meal) => {
      byMeal[meal.id] = { meal, count: 0, combos: {} }
    })
    // 대체식이 한 끼도 필요하지 않은 인원(다른 메뉴로 해결되는 사람)
    let coveredByOtherMenu = 0
    Object.values(scan.teams).forEach((team) => {
      const people = (team.allergies || []).map((x) => (Array.isArray(x) ? x : [x]))
      people.forEach((personList) => {
        const { needsAlt } = personDiet(personList)
        if (needsAlt.length === 0) {
          if (personList.length) coveredByOtherMenu += 1
          return
        }
        // 세부 내역은 "한 사람이 가진 알레르기 조합" 단위로 셉니다.
        // 성분별로 쪼개면 우유+토마토 1명이 "우유 1 · 토마토 1"이 되어 합이
        // 총 개수와 어긋나고, 대체식은 그 사람의 성분을 모두 피해야 하므로
        // 조합 하나가 그대로 대체식 하나입니다.
        const combo = [...personList].filter(Boolean).sort().join('·')
        needsAlt.forEach((mealId) => {
          const row = byMeal[mealId]
          if (!row) return
          row.count += 1
          if (combo) row.combos[combo] = (row.combos[combo] || 0) + 1
        })
      })
    })
    return { rows: MEALS.map((m) => byMeal[m.id]), coveredByOtherMenu }
  }, [scan.teams])

  // (C) 인쇄용 배부 체크리스트 — 현재 끼니 필터 기준, 팀번호순, 종이 체크칸 포함
  const printChecklist = () => {
    const label = mealFilter === 'all' ? '전체' : MEAL_BY_ID[mealFilter].label
    const rangeLabel = selectedRange ? `${selectedRange.label}번` : '전체 팀'
    // 배부 현장에서 대체식이 필요한 팀을 종이만 보고 알 수 있어야 합니다.
    // 화면의 알레르기 시트를 따로 열어봐야 하면 놓치게 됩니다.
    const altInfoOf = (teamId) => {
      const people = (scan.teams[teamId]?.allergies || []).map((x) => (Array.isArray(x) ? x : [x]))
      let need = 0
      const combos = []
      people.forEach((personList) => {
        const { needsAlt } = personDiet(personList)
        const hit = mealFilter === 'all' ? needsAlt.length > 0 : needsAlt.includes(mealFilter)
        if (hit) {
          need += 1
          const combo = [...personList].filter(Boolean).sort().join('·')
          if (combo) combos.push(combo)
        }
      })
      return { need, combos }
    }
    let altTotal = 0
    const rowsHtml = rangedRows
      .map((r) => {
        const items = r.items
          .map((it) => {
            const name = MENU_BY_ID[it.menuId]?.baseName || it.menuId
            const tag = mealFilter === 'all' ? `[${MEAL_BY_ID[it.mealId]?.label}] ` : ''
            return `${escapeHtml(tag)}${escapeHtml(name)} ${escapeHtml(it.qty)}`
          })
          .join(', ')
        const coach = r.assignedName ? ` (${escapeHtml(r.assignedName)})` : ''
        const { need, combos } = altInfoOf(r.teamId)
        altTotal += need
        const alt = need
          ? `<b>대체식 ${need}</b><span class="cmb"> ${combos.map(escapeHtml).join(' / ')}</span>`
          : ''
        return `<tr><td class="c">☐</td><td class="t">팀 ${escapeHtml(r.teamId)}${coach}</td><td>${items}</td><td class="a">${alt}</td></tr>`
      })
      .join('')
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>배부 체크리스트 — ${escapeHtml(label)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: 'Malgun Gothic', system-ui, sans-serif; padding: 16px; color:#111; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .sub { color:#666; font-size:12px; margin-bottom:12px; }
  table { width:100%; border-collapse: collapse; font-size: 13px; }
  th, td { border:1px solid #999; padding:6px 8px; text-align:left; vertical-align:top; }
  th { background:#eee; }
  td.c { width:28px; text-align:center; font-size:16px; }
  td.t { white-space:nowrap; font-weight:700; }
  td.a { white-space:nowrap; }
  td.a b { color:#b45309; }
  .cmb { color:#666; font-size:11px; }
  .pbtn { padding:8px 14px; font-size:14px; margin-bottom:12px; }
  /* 폰에서 열어 확인하는 경우 — 종이 기준 여백·글씨를 그대로 두면 아주 작게
     보입니다. 화면에서 읽을 수 있는 크기로 조정하고 버튼도 손가락 크기로 */
  @media screen and (max-width: 640px) {
    body { padding: 12px; }
    h1 { font-size: 17px; }
    table { font-size: 14px; }
    th, td { padding: 8px 6px; }
    td.c { width: 34px; font-size: 18px; }
    td.t { white-space: normal; }
    td.a { white-space: normal; }
    .cmb { display:block; font-size:12px; }
    .pbtn { width:100%; min-height:48px; font-size:16px; font-weight:700; }
  }
  @media print { .noprint { display:none; } }
</style></head><body>
<h1>배부 체크리스트 — ${escapeHtml(label)} · ${escapeHtml(rangeLabel)}</h1>
<div class="sub">총 ${rangedRows.length}팀 · 배부 시 왼쪽 칸에 체크${
      altTotal ? ` · <b>대체식 ${altTotal}개 필요</b>` : ''
    }</div>
<button class="noprint pbtn" onclick="window.print()">🖨 인쇄</button>
<table><thead><tr><th>완료</th><th>팀</th><th>주문 내역</th><th>대체식</th></tr></thead><tbody>${rowsHtml}</tbody></table>
</body></html>`
    const w = window.open('', '_blank')
    if (!w) {
      alert(
        '팝업이 차단되어 체크리스트를 열 수 없습니다.\n브라우저의 팝업 차단을 허용한 뒤 다시 눌러주세요.\n(인쇄는 데스크톱 브라우저에서 여는 편이 편합니다)',
      )
      return
    }
    w.document.write(html)
    w.document.close()
  }

  return (
    <div>
      <section className="panel">
        <h3>메뉴별 합산 수량</h3>
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
                    {/* '(1인)'은 여기서 군더더기라 뺍니다. 좁은 화면에서는 두 메뉴를
                        한 줄에 담기 위해 배부 목록과 같은 짧은 이름을 씁니다 */}
                    <span className="total-name">
                      <span className="total-name-full">
                        {MENU_BY_ID[menuId]?.baseName || menuId}
                      </span>
                      <span className="total-name-short">
                        {MENU_BY_ID[menuId]?.shortLabel || MENU_BY_ID[menuId]?.baseName || menuId}
                      </span>
                    </span>
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

      {/* 검색·도구는 아래 팀별 목록에 걸리는 조작이라 목록 바로 위에 둡니다.
          (합산 수량은 목록과 무관한 총계라 맨 위) */}
      <div className="toolbar">
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
              placeholder="팀 번호로 검색 (예: 47)"
              value={teamQuery}
              onChange={(e) => setTeamQuery(e.target.value)}
              aria-label="팀 번호 검색"
            />
          </label>
          {/* 폰 전용 더보기 — 넓은 화면에서는 오른쪽 버튼들이 그대로 보입니다 */}
          <div className="search-more-wrap">
            <button
              className={`search-more${moreOpen ? ' on' : ''}`}
              onClick={() => setMoreOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              aria-label="도구 더보기"
            >
              ⋯
            </button>
            {moreOpen && (
              <>
                <div className="search-more-backdrop" onClick={() => setMoreOpen(false)} />
                <div className="search-more-menu" role="menu">
                  <button
                    role="menuitem"
                    onClick={() => {
                      setShowAllergyPanel(true)
                      setShowSoldoutPanel(false)
                      setMoreOpen(false)
                    }}
                  >
                    🥗 알레르기 현황
                    <b>{allergyInfo.teamsWith.length}</b>
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setShowSoldoutPanel(true)
                      setShowAllergyPanel(false)
                      setMoreOpen(false)
                    }}
                  >
                    🚫 품절 관리
                  </button>
                </div>
              </>
            )}
          </div>
          <button
            className={`btn-ghost toolbar-tool${showAllergyPanel ? ' active' : ''}`}
            onClick={() => {
              setShowAllergyPanel((current) => !current)
              setShowSoldoutPanel(false)
            }}
          >
            알레르기 {allergyInfo.teamsWith.length}
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
          {/* 종이 체크리스트는 노트북에서 뽑습니다. 폰에서는 앱의 배부 목록이
              실시간이고 체크도 바로 되므로 이 버튼을 감춥니다(styles.css) */}
          <button className="btn-ghost toolbar-tool checklist-tool" onClick={printChecklist}>
            체크리스트
          </button>
        </div>
      </div>


      {showAllergyPanel && (
        <div className="bottom-sheet-backdrop" onClick={closeUtilityPanels}>
          <section
            ref={allergyDialogRef}
            className="bottom-sheet allergy-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="allergy-sheet-title"
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
            style={allergyDrag.sheetStyle}
          >
            <div className="sheet-handle" aria-hidden="true" {...allergyDrag.handleHandlers} />
            <div className="sheet-head">
              <h3 id="allergy-sheet-title">알레르기 현황</h3>
              <button className="sheet-close" onClick={closeUtilityPanels}>닫기</button>
            </div>
            <p className="sheet-description">팀별 대체 메뉴 준비에 참고하세요.</p>
            <div className="sheet-body">
              {/* 대체식이 반드시 필요한 인원 — 준비 수량의 기준이 되는 숫자 */}
              <div className="alt-meal-summary">
                <div className="alt-meal-title">🍱 대체 메뉴 필요 개수</div>
                {/* 필요한 건 "몇 개를 준비하는가" 하나. 조합별 내역은 접어둡니다. */}
                {altMealInfo.rows.map(({ meal, count }) => (
                  <div key={meal.id} className="alt-meal-row">
                    <span className="alt-meal-name">{meal.label}</span>
                    <b className={count ? 'alt-meal-count on' : 'alt-meal-count'}>{count}개</b>
                  </div>
                ))}
                {altMealInfo.rows.some((r) => r.count > 0) && (
                  <details className="alt-meal-detail">
                    <summary>상세 보기</summary>
                    {altMealInfo.rows
                      .filter((r) => r.count > 0)
                      .map(({ meal, count, combos }) => (
                        <p key={meal.id}>
                          <b>
                            {meal.label} {count}개
                          </b>
                          {' — '}
                          {Object.entries(combos)
                            .sort(([, a], [, b]) => b - a)
                            .map(([combo, n]) => `${combo} ${n}`)
                            .join(' · ')}
                        </p>
                      ))}
                    {altMealInfo.coveredByOtherMenu > 0 && (
                      <p className="alt-meal-note">
                        알레르기가 있지만 같은 끼니의 다른 메뉴로 해결되는{' '}
                        <b>{altMealInfo.coveredByOtherMenu}명</b>은 위 개수에서 제외했습니다.
                      </p>
                    )}
                  </details>
                )}
              </div>
              {allergyInfo.teamsWith.length === 0 ? (
                <p className="empty-text">알레르기를 등록한 인원이 없습니다.</p>
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
            ref={soldoutDialogRef}
            className="bottom-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="soldout-sheet-title"
            tabIndex={-1}
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
                          {m.baseName || m.name}
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

      <section className="panel delivery-team-panel">
        {/* 구간을 고르면 아래 목록이 그 구간으로 걸러지므로 한 구역에 둡니다.
            위: 구간(오래 유지되는 상위 맥락) → 아래: 미배부/완료(자주 왕복).
            검색 중이거나 끼니 '전체'일 때는 구간·탭이 의미가 없어 제목만 씁니다. */}
        {singleMeal && !hasQuery ? (
          <div className="delivery-controls">
            <div
              className="coach-tabs delivery-ranges"
              role="group"
              aria-label="배부할 팀 번호 구간"
            >
              <button
                className={`coach-tab${teamRange === 'all' ? ' on' : ''}`}
                onClick={() => setTeamRange('all')}
              >
                전체
              </button>
              {rangeOptions.map((range) => (
                <button
                  key={range.id}
                  className={`coach-tab${teamRange === range.id ? ' on' : ''}`}
                  onClick={() => setTeamRange(range.id)}
                >
                  {range.label}
                </button>
              ))}
            </div>
            <div className="coach-tabs delivery-status-tabs">
              <button
                className={`coach-tab${deliveryTab === 'pending' ? ' on' : ''}`}
                onClick={() => setDeliveryTab('pending')}
              >
                미배부 팀 <b className="tab-count">{pendingRows.length}</b>
              </button>
              <button
                className={`coach-tab${deliveryTab === 'done' ? ' on' : ''}`}
                onClick={() => setDeliveryTab('done')}
              >
                배부 완료 팀 <b className="tab-count">{completedRows.length}</b>
              </button>
            </div>
          </div>
        ) : (
          <div className="panel-head-row">
            <h3>
              {'팀별 주문'}
              {!singleMeal && ` (${visibleRows.length}팀)`}
              {hasQuery && ` — "${queryNum}번" 검색 중`}
            </h3>
          </div>
        )}

        {!singleMeal && teamRows.length > 0 && (
          <p className="deliver-hint">
            끼니({MEALS.map((m) => m.label).join('/')})를 선택하면 팀별 <b>완료 체크</b>를 쓸 수 있어요.
          </p>
        )}

        {shownRows.length === 0 ? (
          <p className="empty-text">
            {hasQuery
              ? `팀 ${String(queryNum).padStart(2, '0')}의 주문 내역이 없습니다.`
              : !singleMeal
                ? '아직 주문이 없습니다.'
                : deliveryTab === 'done'
                  ? '아직 배부 완료한 팀이 없습니다.'
                  : '선택한 구간의 배부가 모두 완료됐습니다.'}
          </p>
        ) : (
          <TeamRowList
            rows={shownRows}
            mealFilter={mealFilter}
            singleMeal={singleMeal}
            isDelivered={isDelivered}
            onToggleDelivered={onToggleDelivered}
          />
        )}
      </section>
    </div>
  )
}
