import { useEffect, useMemo, useState } from 'react'
import { MENUS, MENU_BY_ID, MEAL_BY_ID } from '../config.js'
import { now, fmtClock, fmtCountdown, mealTimes } from '../lib/time.js'
import { useSheetDrag } from '../lib/useSheetDrag.js'

// 현재 시각이 주문 가능 시간대면 메뉴판, 아니면 "다음 주문 가능 시간" 안내.
// 여러 식사가 같은 주문 구간을 공유하면(저녁·야식·아침) 식사 탭으로 전환하며
// 한 장바구니에 담아 한 번에 주문합니다.
// 각 식사(끼니)마다 팀 인원수(memberCount)만큼만 담을 수 있습니다.
export default function MenuBoard({
  openMeals,
  nextMeals,
  soldout,
  savedOrder,
  memberCount,
  onRefresh,
  onSave,
}) {
  // draft: { mealId: { menuId: qty } }
  const [draft, setDraft] = useState({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [activeMealId, setActiveMealId] = useState(openMeals[0]?.id || null)
  const [showCart, setShowCart] = useState(false) // 하단 장바구니 시트
  const [refreshing, setRefreshing] = useState(false)
  const cartDrag = useSheetDrag(() => setShowCart(false))

  // openMeals는 매 렌더마다 새 배열 → id 목록 문자열로 변화 감지
  const mealsKey = openMeals.map((m) => m.id).join(',')

  const savedByMeal = useMemo(() => {
    const map = {}
    openMeals.forEach((m) => {
      const items = savedOrder?.meals?.[m.id]?.items || []
      map[m.id] = Object.fromEntries(items.map((it) => [it.menuId, it.qty]))
    })
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedOrder, mealsKey])

  useEffect(() => {
    if (!dirty) setDraft(savedByMeal)
  }, [savedByMeal, dirty])

  useEffect(() => {
    setDraft({})
    setDirty(false)
    setActiveMealId((cur) =>
      openMeals.some((m) => m.id === cur) ? cur : openMeals[0]?.id || null,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mealsKey])

  const refreshBoard = async () => {
    if (!onRefresh || refreshing) return
    setRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setRefreshing(false)
    }
  }

  if (openMeals.length === 0) {
    return (
      <section className="menu-board">
        <h3 className="card-title">🍽️ 음식 주문</h3>
        <div className="closed-box">
          <div className="closed-emoji">⏰</div>
          {nextMeals.length > 0 ? (
            <>
              <p className="closed-main">지금은 주문 가능 시간이 아닙니다</p>
              <p className="closed-sub">
                다음 주문: <b>{nextMeals.map((m) => m.label).join('·')}</b> —{' '}
                {fmtClock(new Date(nextMeals[0].orderStart))}부터
              </p>
            </>
          ) : (
            <>
              <p className="closed-main">모든 주문이 마감되었습니다</p>
              <p className="closed-sub">이후 식사·간식은 주문 없이 제공됩니다</p>
            </>
          )}
          <p className="closed-hint">캠프지기 호출은 언제든 가능합니다</p>
        </div>
      </section>
    )
  }

  const activeMeal = openMeals.find((m) => m.id === activeMealId) || openMeals[0]
  const { end } = mealTimes(activeMeal)
  const remain = end - now().getTime()
  const menus = MENUS[activeMeal.id] || []
  const multiMeal = openMeals.length > 1

  // 식사별 담은 수량 (끼니마다 인원수만큼 제한)
  const mealQty = (mealId) =>
    Object.values(draft[mealId] || {}).reduce((s, q) => s + q, 0)
  const mealLimitReached = (mealId) => mealQty(mealId) >= memberCount

  const setQty = (mealId, menuId, delta) => {
    setDraft((d) => {
      const mealDraft = d[mealId] || {}
      const cur = mealDraft[menuId] || 0
      // 증가 시 인원수 초과 차단 — 최신 draft(d)로 다시 합산해
      // 연타(빠른 클릭)에도 한도를 정확히 지킴
      if (delta > 0) {
        const curTotal = Object.values(mealDraft).reduce((s, q) => s + q, 0)
        if (curTotal >= memberCount) return d
      }
      const next = Math.max(0, cur + delta)
      return { ...d, [mealId]: { ...mealDraft, [menuId]: next } }
    })
    setDirty(true)
  }

  const totalQty = openMeals.reduce((s, m) => s + mealQty(m.id), 0)
  // 장바구니: 식사별 그룹
  const cartGroups = openMeals
    .map((m) => ({
      meal: m,
      items: Object.entries(draft[m.id] || {})
        .filter(([, q]) => q > 0)
        .map(([menuId, qty]) => ({ menuId, qty })),
    }))
    .filter((g) => g.items.length > 0)

  const submit = async () => {
    setSaving(true)
    // 열려 있는 모든 식사의 주문을 한 번에 저장
    const mealsMap = {}
    openMeals.forEach((m) => {
      mealsMap[m.id] = Object.entries(draft[m.id] || {})
        .filter(([, qty]) => qty > 0)
        .map(([menuId, qty]) => ({ menuId, qty }))
    })
    try {
      await onSave(mealsMap)
    } catch {
      setSaving(false)
      alert('네트워크 오류로 주문이 저장되지 않았습니다.\n잠시 후 "주문하기"를 다시 눌러주세요.')
      return
    }
    setDirty(false)
    setSaving(false)
    setSavedFlash(true)
    setShowCart(false)
    setTimeout(() => setSavedFlash(false), 2000)
  }

  const hasSaved = openMeals.some((m) => Object.keys(savedByMeal[m.id] || {}).length > 0)
  const canCancel = hasSaved || totalQty > 0

  const cancelAll = async () => {
    if (!hasSaved) {
      setDraft({})
      setDirty(false)
      return
    }
    setSaving(true)
    const emptyMap = {}
    openMeals.forEach((m) => {
      emptyMap[m.id] = []
    })
    try {
      await onSave(emptyMap)
    } catch {
      setSaving(false)
      alert('네트워크 오류로 취소가 저장되지 않았습니다.\n잠시 후 다시 시도해주세요.')
      return
    }
    setDraft({})
    setDirty(false)
    setSaving(false)
  }

  return (
    <section className="menu-board">
      {/* 티오더식 헤더: 아이콘 + 타이틀 + 마감 카운트다운 */}
      <div className="board-header">
        <div className="board-header-icon">🍽️</div>
        <div className="board-header-text">
          <div className="board-header-title">
            {multiMeal ? openMeals.map((m) => m.label).join('·') : activeMeal.label} 주문
          </div>
          <div className="board-header-sub">
            {multiMeal ? '한 번에 담아 주문할 수 있어요' : '먹고 싶은 메뉴를 담아주세요'}
          </div>
        </div>
        <div className="board-header-actions">
          <div className="board-countdown">
            <span className="board-countdown-label">마감까지</span>
            <b>{fmtCountdown(remain)}</b>
          </div>
          <button
            className={`board-refresh-btn${refreshing ? ' refreshing' : ''}`}
            onClick={refreshBoard}
            disabled={refreshing}
            aria-label="주문 정보 새로고침"
          >
            <span aria-hidden="true">⟳</span>
          </button>
        </div>
      </div>

      {/* 식사 탭 (저녁/야식/아침처럼 여러 식사를 함께 주문할 때) */}
      {multiMeal && (
        <div className="cat-tabs">
          {openMeals.map((m) => {
            const q = mealQty(m.id)
            return (
              <button
                key={m.id}
                className={`cat-tab${activeMeal.id === m.id ? ' on' : ''}`}
                onClick={() => setActiveMealId(m.id)}
              >
                {m.label}
                {q > 0 && <span className="cat-tab-count">{q}</span>}
              </button>
            )
          })}
        </div>
      )}

      {/* 일괄 메뉴(도시락) 안내 */}
      {activeMeal.fixedMenu && (
        <p className="fixed-menu-hint">
          {activeMeal.label}은 일괄 메뉴예요. <b>먹을 인원수만큼 수량만</b> 담아주세요.
        </p>
      )}

      {/* 사진 카드 2열 그리드 */}
      <div className="food-grid">
        {menus.map((m) => {
          const isSoldout = !!soldout[m.id]
          const qty = draft[activeMeal.id]?.[m.id] || 0
          const plusDisabled = isSoldout || mealLimitReached(activeMeal.id)
          return (
            <div key={m.id} className={`food-card${isSoldout ? ' soldout' : ''}${qty > 0 ? ' picked' : ''}`}>
              <div className="food-card-photo">
                {m.image ? <img src={m.image} alt="" /> : <span className="food-card-ph">🍽️</span>}
                {qty > 0 && <span className="food-card-qtybadge">{qty}</span>}
                {isSoldout && <span className="food-card-soldout">품절</span>}
              </div>
              <div className="food-card-body">
                <div className="food-card-info">
                  <div className="food-card-name">{m.name}</div>
                  {(m.badges.length > 0 || m.allergyNote) && (
                    <div className="food-badges">
                      {m.badges.map((b) => (
                        <span key={b} className="diet-badge">
                          {b}
                        </span>
                      ))}
                      {m.allergyNote && <span className="allergy-note">{m.allergyNote}</span>}
                    </div>
                  )}
                </div>
                <div className="food-card-action">
                  {qty === 0 ? (
                    <button
                      className="add-btn"
                      disabled={plusDisabled}
                      onClick={() => setQty(activeMeal.id, m.id, +1)}
                      aria-label={`${m.name} 담기`}
                    >
                      ＋
                    </button>
                  ) : (
                    <div className="card-stepper">
                      <button
                        className="qty-btn"
                        onClick={() => setQty(activeMeal.id, m.id, -1)}
                        aria-label={`${m.name} 수량 줄이기`}
                      >
                        −
                      </button>
                      <span className="qty-num">{qty}</span>
                      <button
                        className="qty-btn"
                        disabled={plusDisabled}
                        onClick={() => setQty(activeMeal.id, m.id, +1)}
                        aria-label={`${m.name} 수량 늘리기`}
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {mealLimitReached(activeMeal.id) && (
        <p className="limit-hint">
          {activeMeal.label}은 팀 인원수({memberCount}명)만큼 담았어요. 바꾸려면 담은 걸 빼고 다시 담으세요.
        </p>
      )}

      {/* 하단 고정 바 — 누르면 장바구니 시트 열림 (티오더식) */}
      <button
        className="cart-bar"
        onClick={() => setShowCart(true)}
        aria-label="담은 메뉴 보기"
      >
        <span className="cart-bar-left">
          <span className="cart-bar-icon">🛒</span>
          담은 메뉴 보기
          <span className="cart-bar-count">{totalQty}</span>
        </span>
        <span className="cart-bar-more" aria-hidden="true">›</span>
      </button>

      {/* 장바구니 하단 시트 */}
      {showCart && (
        <div className="sheet-overlay" onClick={() => setShowCart(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} style={cartDrag.sheetStyle}>
            <div className="sheet-handle" {...cartDrag.handleHandlers} />
            <div className="sheet-head">
              <h3>🛒 장바구니 ({totalQty})</h3>
              <button className="sheet-close" onClick={() => setShowCart(false)} aria-label="닫기">
                ✕
              </button>
            </div>
            <div className="sheet-body">
              {cartGroups.length === 0 ? (
                <p className="empty-text">담은 메뉴가 없어요. 메뉴를 담아주세요.</p>
              ) : (
                cartGroups.map(({ meal, items }) => (
                  <div key={meal.id} className="cart-meal-group">
                    {multiMeal && (
                      <div className="cart-meal-label">
                        {MEAL_BY_ID[meal.id]?.label || meal.id}
                      </div>
                    )}
                    {items.map(({ menuId, qty }) => (
                      <div key={menuId} className="cart-item">
                        <span className="cart-item-name">{MENU_BY_ID[menuId]?.name || menuId}</span>
                        <div className="card-stepper">
                          <button
                            className="qty-btn"
                            onClick={() => setQty(meal.id, menuId, -1)}
                            aria-label="수량 줄이기"
                          >
                            −
                          </button>
                          <span className="qty-num">{qty}</span>
                          <button
                            className="qty-btn"
                            disabled={mealLimitReached(meal.id)}
                            onClick={() => setQty(meal.id, menuId, +1)}
                            aria-label="수량 늘리기"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
            <div className="sheet-foot">
              {canCancel && (
                <button className="cart-clear-dark" onClick={cancelAll} disabled={saving}>
                  비우기
                </button>
              )}
              <button className="cart-submit" onClick={submit} disabled={saving || !dirty}>
                {saving ? '저장 중…' : savedFlash ? '✓ 저장 완료!' : hasSaved ? `주문 수정 (${totalQty})` : `주문하기 (${totalQty})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
