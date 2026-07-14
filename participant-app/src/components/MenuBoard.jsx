import { useEffect, useMemo, useState } from 'react'
import { MENUS, MENU_BY_ID } from '../config.js'
import { now, fmtClock, fmtCountdown, mealTimes } from '../lib/time.js'

const CATEGORY_LABEL = { food: '🍜 음식', drink: '🥤 음료' }

// 현재 시각이 주문 가능 시간대면 메뉴판, 아니면 "다음 주문 가능 시간" 안내 (PRD 4.2)
// 음식은 팀 인원수(memberCount)만큼만 담을 수 있음 (PRD 요청 #3). 음료는 제한 없음.
export default function MenuBoard({ openMeal, nextMeal, soldout, savedOrder, memberCount, onSave }) {
  const [draft, setDraft] = useState({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)

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
          <p className="closed-hint">코치 호출은 언제든 가능합니다 👇</p>
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

  return (
    <section className="card">
      <div className="card-head-row">
        <h3 className="card-title">
          🍽️ {openMeal.label} 주문 <span className="badge-open">주문 가능</span>
        </h3>
        <div className="countdown">
          마감까지 <b>{fmtCountdown(remain)}</b>
        </div>
      </div>
      <p className={`guide-banner${foodLimitReached ? ' limit' : ''}`}>
        음식 {foodQty}/{memberCount}개 담음 (팀 인원수만큼 · 음료는 제한 없음)
      </p>

      {['food', 'drink'].map((cat) => (
        <div key={cat} className="menu-cat">
          <h4 className="menu-cat-title">{CATEGORY_LABEL[cat]}</h4>
          {menus
            .filter((m) => m.category === cat)
            .map((m) => {
              const isSoldout = !!soldout[m.id]
              const qty = draft[m.id] || 0
              return (
                <div key={m.id} className={`menu-row${isSoldout ? ' soldout' : ''}`}>
                  <div className="menu-photo" aria-hidden="true">
                    {m.image ? <img src={m.image} alt="" /> : <span className="menu-photo-ph">🍽️</span>}
                  </div>
                  <div className="menu-info">
                    <span className="menu-name">{m.name}</span>
                    {m.badges.map((b) => (
                      <span key={b} className="diet-badge">
                        {b}
                      </span>
                    ))}
                    {m.allergyNote && <span className="allergy-note">{m.allergyNote}</span>}
                    {isSoldout && <span className="soldout-badge">품절</span>}
                  </div>
                  <div className="qty-ctrl">
                    <button
                      className="qty-btn"
                      disabled={isSoldout || qty === 0}
                      onClick={() => setQty(m.id, -1)}
                      aria-label={`${m.name} 수량 줄이기`}
                    >
                      −
                    </button>
                    <span className="qty-num">{qty}</span>
                    <button
                      className="qty-btn"
                      disabled={isSoldout || (cat === 'food' && foodLimitReached)}
                      onClick={() => setQty(m.id, +1)}
                      aria-label={`${m.name} 수량 늘리기`}
                    >
                      +
                    </button>
                  </div>
                </div>
              )
            })}
        </div>
      ))}

      {foodLimitReached && (
        <p className="limit-hint">음식은 팀 인원수({memberCount}명)만큼 담았습니다. 더 담으려면 인원수를 조정하세요.</p>
      )}

      {/* 스크롤해도 항상 보이는 하단 고정 요약바 */}
      <div className="sticky-order-bar">
        <div className="sticky-order-summary">
          {totalQty > 0 ? (
            <>
              <span className="sticky-order-qty">{totalQty}</span>개 담음
            </>
          ) : (
            <span className="sticky-order-empty">메뉴를 선택해 주세요</span>
          )}
        </div>
        <div className="sticky-order-actions">
          {canCancel && (
            <button className="btn-danger-ghost" onClick={cancelAll} disabled={saving}>
              전체 취소
            </button>
          )}
          <button className="btn-primary" onClick={submit} disabled={saving || !dirty}>
            {saving ? '저장 중…' : savedFlash ? '✓ 저장 완료!' : hasSaved ? `주문 수정 (${totalQty}개)` : `주문하기 (${totalQty}개)`}
          </button>
        </div>
      </div>
    </section>
  )
}
