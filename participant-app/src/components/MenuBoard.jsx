import { useEffect, useMemo, useState } from 'react'
import { MENUS, MENU_BY_ID } from '../config.js'
import { now, fmtClock, fmtCountdown, mealTimes } from '../lib/time.js'

const CATEGORY_LABEL = { food: '🍜 음식', drink: '🥤 음료' }
const CATEGORY_TAB = { food: '음식', drink: '음료' }

// 현재 시각이 주문 가능 시간대면 메뉴판, 아니면 "다음 주문 가능 시간" 안내 (PRD 4.2)
// 음식은 팀 인원수(memberCount)만큼만 담을 수 있음 (PRD 요청 #3). 음료는 제한 없음.
export default function MenuBoard({ openMeal, nextMeal, soldout, savedOrder, memberCount, onSave }) {
  const [draft, setDraft] = useState({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [cat, setCat] = useState('food') // 카테고리 탭: 음식/음료
  const [showCart, setShowCart] = useState(false) // 하단 장바구니 시트

  const savedItems = useMemo(() => {
    if (!openMeal) return {}
    const items = savedOrder?.meals?.[openMeal.id]?.items || []
    return Object.fromEntries(items.map((it) => [it.menuId, it.qty]))
  }, [savedOrder, openMeal])

  useEffect(() => {
    if (!dirty) setDraft(savedItems)
  }, [savedItems, dirty, openMeal?.id])

  useEffect(() => {
    setDraft({})
    setDirty(false)
  }, [openMeal?.id])

  if (!openMeal) {
    return (
      <section className="card">
        <h3 className="card-title">🍽️ 음식 주문</h3>
        <div className="closed-box">
          <div className="closed-emoji">⏰</div>
          {nextMeal ? (
            <>
              <p className="closed-main">지금은 주문 가능 시간이 아닙니다</p>
              <p className="closed-sub">
                다음 주문: <b>{nextMeal.label}</b> — {fmtClock(new Date(nextMeal.orderStart))}부터
              </p>
            </>
          ) : (
            <p className="closed-main">모든 식사 주문이 마감되었습니다</p>
          )}
          <p className="closed-hint">코치 호출은 언제든 가능합니다</p>
        </div>
      </section>
    )
  }

  const { end } = mealTimes(openMeal)
  const remain = end - now().getTime()
  const menus = MENUS[openMeal.id] || []

  // 음식 담은 총 수량 (인원수 제한 대상)
  const foodQty = Object.entries(draft).reduce(
    (sum, [id, qty]) => (MENU_BY_ID[id]?.category === 'food' ? sum + qty : sum),
    0,
  )
  const foodLimitReached = foodQty >= memberCount

  const setQty = (menuId, delta) => {
    setDraft((d) => {
      const cur = d[menuId] || 0
      // 음식 증가 시 인원수 초과 차단 — 최신 draft(d)로 다시 합산해
      // 연타(빠른 클릭)에도 한도를 정확히 지킴
      if (delta > 0 && MENU_BY_ID[menuId]?.category === 'food') {
        const curFood = Object.entries(d).reduce(
          (s, [id, q]) => (MENU_BY_ID[id]?.category === 'food' ? s + q : s),
          0,
        )
        if (curFood >= memberCount) return d
      }
      const next = Math.max(0, cur + delta)
      return { ...d, [menuId]: next }
    })
    setDirty(true)
  }

  const totalQty = Object.values(draft).reduce((a, b) => a + b, 0)
  const cartItems = Object.entries(draft)
    .filter(([, q]) => q > 0)
    .map(([menuId, qty]) => ({ menuId, qty }))

  const submit = async () => {
    setSaving(true)
    const items = Object.entries(draft)
      .filter(([, qty]) => qty > 0)
      .map(([menuId, qty]) => ({ menuId, qty }))
    try {
      await onSave(openMeal.id, items)
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

  const cancelAll = async () => {
    if (!hasSaved) {
      setDraft({})
      setDirty(false)
      return
    }
    setSaving(true)
    try {
      await onSave(openMeal.id, [])
    } catch {
      setSaving(false)
      alert('네트워크 오류로 취소가 저장되지 않았습니다.\n잠시 후 다시 시도해주세요.')
      return
    }
    setDraft({})
    setDirty(false)
    setSaving(false)
  }

  const hasSaved = Object.keys(savedItems).length > 0
  const canCancel = hasSaved || totalQty > 0

  // 이 식사에 실제로 존재하는 카테고리만 탭으로 (보통 음식·음료 둘 다)
  const cats = ['food', 'drink'].filter((c) => menus.some((m) => m.category === c))
  const activeCat = cats.includes(cat) ? cat : cats[0]
  const catMenus = menus.filter((m) => m.category === activeCat)

  return (
    <section className="menu-board">
      {/* 티오더식 헤더: 아이콘 + 타이틀 + 마감 카운트다운 */}
      <div className="board-header">
        <div className="board-header-icon">🍽️</div>
        <div className="board-header-text">
          <div className="board-header-title">{openMeal.label} 주문</div>
          <div className="board-header-sub">먹고 싶은 메뉴를 담아주세요</div>
        </div>
        <div className="board-countdown">
          <span className="board-countdown-label">마감까지</span>
          <b>{fmtCountdown(remain)}</b>
        </div>
      </div>

      {/* 카테고리 탭 */}
      <div className="cat-tabs">
        {cats.map((c) => (
          <button
            key={c}
            className={`cat-tab${activeCat === c ? ' on' : ''}`}
            onClick={() => setCat(c)}
          >
            {CATEGORY_TAB[c]}
          </button>
        ))}
      </div>

      {/* 사진 카드 2열 그리드 */}
      <div className="food-grid">
        {catMenus.map((m) => {
          const isSoldout = !!soldout[m.id]
          const qty = draft[m.id] || 0
          const plusDisabled = isSoldout || (activeCat === 'food' && foodLimitReached)
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
                      onClick={() => setQty(m.id, +1)}
                      aria-label={`${m.name} 담기`}
                    >
                      ＋
                    </button>
                  ) : (
                    <div className="card-stepper">
                      <button
                        className="qty-btn"
                        onClick={() => setQty(m.id, -1)}
                        aria-label={`${m.name} 수량 줄이기`}
                      >
                        −
                      </button>
                      <span className="qty-num">{qty}</span>
                      <button
                        className="qty-btn"
                        disabled={plusDisabled}
                        onClick={() => setQty(m.id, +1)}
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

      {activeCat === 'food' && foodLimitReached && (
        <p className="limit-hint">음식은 팀 인원수({memberCount}명)만큼 담았어요. 바꾸려면 담은 걸 빼고 다시 담으세요.</p>
      )}

      {/* 하단 고정 바 — 누르면 장바구니 시트 열림 (티오더식) */}
      <button
        className="cart-bar"
        onClick={() => setShowCart(true)}
        aria-label="장바구니 보기"
      >
        <span className="cart-bar-left">
          <span className="cart-bar-icon">🛒</span>
          장바구니 보기
          <span className="cart-bar-count">{totalQty}</span>
        </span>
        <span className="cart-bar-more">담은 메뉴 보기 ›</span>
      </button>

      {/* 장바구니 하단 시트 */}
      {showCart && (
        <div className="sheet-overlay" onClick={() => setShowCart(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-head">
              <h3>🛒 장바구니 ({totalQty})</h3>
              <button className="sheet-close" onClick={() => setShowCart(false)} aria-label="닫기">
                ✕
              </button>
            </div>
            <div className="sheet-body">
              {cartItems.length === 0 ? (
                <p className="empty-text">담은 메뉴가 없어요. 메뉴를 담아주세요.</p>
              ) : (
                cartItems.map(({ menuId, qty }) => (
                  <div key={menuId} className="cart-item">
                    <span className="cart-item-name">{MENU_BY_ID[menuId]?.name || menuId}</span>
                    <div className="card-stepper">
                      <button
                        className="qty-btn"
                        onClick={() => setQty(menuId, -1)}
                        aria-label="수량 줄이기"
                      >
                        −
                      </button>
                      <span className="qty-num">{qty}</span>
                      <button
                        className="qty-btn"
                        disabled={
                          MENU_BY_ID[menuId]?.category === 'food' && foodLimitReached
                        }
                        onClick={() => setQty(menuId, +1)}
                        aria-label="수량 늘리기"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))
              )}
              {foodLimitReached && (
                <p className="limit-hint">음식은 팀 인원수({memberCount}명)만큼 담았어요.</p>
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
