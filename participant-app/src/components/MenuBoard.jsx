import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MEALS, MENUS, MENU_BY_ID, MEAL_BY_ID, teamDiet } from '../config.js'
import { now, fmtClock, fmtCountdown, mealTimes } from '../lib/time.js'
import { useSheetDrag } from '../lib/useSheetDrag.js'
import { useDialogFocus } from '../lib/useDialogFocus.js'

// '2026-09-21T13:30:00' → '13시 30분' (정시는 '21시')
const fmtHM = (iso) => {
  const d = new Date(iso)
  const h = d.getHours()
  const m = d.getMinutes()
  return m ? `${h}시 ${m}분` : `${h}시`
}
// label '[DAY 1] 야식' → '[DAY 1]' (없으면 빈 문자열)
const dayOf = (label) => (label || '').match(/^\[?\s*DAY\s*\d+\s*\]?/)?.[0] || ''

// 주문 시간 공지 — 호출 탭의 가이드 박스(.call-guide)와 같은 형태로 노출.
// 주문 가능 시간대일 때와 마감/대기 상태일 때 모두 보여줍니다.
//
// 문구의 시각은 전부 config.MEALS에서 뽑습니다. 예전에는 "14시부터 15시까지"가
// 글자로 박혀 있어, 시간이 바뀌면 화면에만 옛 시간이 남는 문제가 있었습니다.
function OrderNotice() {
  // 모든 식사가 같은 주문 구간을 공유하면 한 문장으로 묶어 안내
  const windows = [...new Set(MEALS.map((m) => `${m.orderStart}~${m.orderEnd}`))]
  const shared = windows.length === 1 ? MEALS[0] : null
  return (
    <div className="call-guide order-notice">
      <b className="call-guide-title">📢 공지사항</b>
      <ul className="call-guide-list">
        {shared ? (
          <li>
            {MEALS.map((m) => m.shortLabel || m.label).join('과 ')} 모두{' '}
            {dayOf(shared.label)} {fmtHM(shared.orderStart)}부터 {fmtHM(shared.orderEnd)}까지
            신청합니다.
          </li>
        ) : (
          MEALS.map((m) => (
            <li key={m.id}>
              {m.label}은 {dayOf(m.label)} {fmtHM(m.orderStart)}부터 {fmtHM(m.orderEnd)}까지
              신청합니다.
            </li>
          ))
        )}
        <li>
          {MEALS.map((m) => `${m.shortLabel || m.label}은 ${dayOf(m.label)} ${fmtHM(m.eatAt)}에`)
            .join(', ')}{' '}
          제공합니다.
        </li>
      </ul>
    </div>
  )
}

// 현재 시각이 주문 가능 시간대면 메뉴판, 아니면 "다음 주문 가능 시간" 안내.
// 여러 식사가 같은 주문 구간을 공유하면(저녁·야식·아침) 식사 탭으로 전환하며
// 한 장바구니에 담아 한 번에 주문합니다.
// 각 식사(끼니)마다 팀 인원수(memberCount)만큼만 담을 수 있습니다.
//
// 여기에 알레르기 제한이 더 붙습니다. 같은 끼니의 메뉴들이 성분을 거의
// 공유해서, 알레르기가 있는 팀원은 특정 메뉴를 아예 못 먹습니다. 그대로
// 인원수만큼 담게 두면 확실히 버려지는 몫이 생기므로,
//   - 메뉴별 상한 = 그 메뉴를 먹을 수 있는 팀원 수
//   - 끼니별 상한 = 그 끼니에서 하나라도 먹을 수 있는 팀원 수
// 로 자동 조정합니다 (판정은 config.teamDiet). 줄어든 몫은 운영진이
// 대체 메뉴로 준비하므로, 문구도 "못 받는다"가 아니라 그렇게 안내합니다.
export default function MenuBoard({
  openMeals,
  nextMeals,
  soldout,
  savedOrder,
  nudge,
  memberCount,
  allergies,
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
  // 관리자 재촉이 방금 온 것인지 (오래된 표시로 계속 뜨지 않게 10분만 유효)
  const NUDGE_TTL_MS = 10 * 60 * 1000
  // nudge.at은 서버가 찍은 실제 시각이므로 실제 시각으로 비교합니다.
  // now()는 개발용 ?now= 오프셋이 섞여 있어, 시간을 시뮬레이션하면 방금 온
  // 재촉도 '며칠 전'으로 판정됩니다.
  const nudgeFresh = !!nudge?.at && Date.now() - nudge.at < NUDGE_TTL_MS
  // 처음 뜰 때 한 번만 진동 — 화면을 보고 있지 않을 수도 있으므로
  const buzzedRef = useRef(null)
  useEffect(() => {
    if (!nudgeFresh) return
    if (buzzedRef.current === nudge.at) return
    buzzedRef.current = nudge.at
    navigator.vibrate?.([120, 80, 120])
  }, [nudgeFresh, nudge?.at])

  const closeCart = useCallback(() => setShowCart(false), [])
  const cartDrag = useSheetDrag(closeCart)
  const cartDialogRef = useDialogFocus(showCart, closeCart)

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
        <OrderNotice />
        <div className="closed-box">
          <div className="closed-emoji">⏰</div>
          {nextMeals.length > 0 ? (
            <>
              <p className="closed-main">지금은 주문 가능 시간이 아닙니다</p>
              <p className="closed-sub">
                <b>{nextMeals.map((m) => m.label).join(' ')}</b>은
                <br />
                {fmtClock(new Date(nextMeals[0].orderStart))}부터 가능합니다.
              </p>
            </>
          ) : (
            <>
              <p className="closed-main">모든 주문이 마감되었습니다</p>
              <p className="closed-sub">이후 식사·간식은 주문 없이 제공됩니다</p>
            </>
          )}
          <p className="closed-hint">마스터 메이트 호출은 언제든 가능합니다</p>
        </div>
      </section>
    )
  }

  const activeMeal = openMeals.find((m) => m.id === activeMealId) || openMeals[0]
  const { end } = mealTimes(activeMeal)
  const remain = end - now().getTime()
  // 마감 임박 경고 — 담아만 두고 '주문하기'를 누르지 않으면 그대로 사라집니다
  // 10분 남으면 카운트다운을 강조하고, 5분 남으면 경고를 띄웁니다
  const DEADLINE_WARN_MS = 5 * 60 * 1000
  const DEADLINE_PULSE_MS = 10 * 60 * 1000
  const nearDeadline = remain > 0 && remain <= DEADLINE_WARN_MS
  const pulseDeadline = remain > 0 && remain <= DEADLINE_PULSE_MS
  // 이미 주문한 메뉴가 뒤늦게 품절된 경우 — 참가자에게 알려줍니다
  const soldoutOrdered = MEALS.flatMap((meal) =>
    (savedOrder?.meals?.[meal.id]?.items || [])
      .filter((it) => soldout[it.menuId])
      .map((it) => MENU_BY_ID[it.menuId]?.baseName || it.menuId),
  )
  const menus = MENUS[activeMeal.id] || []
  const multiMeal = openMeals.length > 1

  // 알레르기를 반영한 상한 (알레르기가 없으면 전부 memberCount 와 같음)
  const diet = teamDiet(memberCount, allergies)
  const mealCap = (mealId) => Math.min(memberCount, diet.eatableByMeal[mealId] ?? memberCount)
  const menuCap = (menuId) => diet.eatableByMenu[menuId] ?? memberCount

  // 식사별 담은 수량
  const mealQty = (mealId) =>
    Object.values(draft[mealId] || {}).reduce((s, q) => s + q, 0)
  const mealLimitReached = (mealId) => mealQty(mealId) >= mealCap(mealId)
  const menuLimitReached = (mealId, menuId) => (draft[mealId]?.[menuId] || 0) >= menuCap(menuId)

  const setQty = (mealId, menuId, delta) => {
    setDraft((d) => {
      const mealDraft = d[mealId] || {}
      const cur = mealDraft[menuId] || 0
      // 증가 시 두 상한을 모두 검사 — 최신 draft(d)로 다시 합산해
      // 연타(빠른 클릭)에도 한도를 정확히 지킴
      if (delta > 0) {
        const curTotal = Object.values(mealDraft).reduce((s, q) => s + q, 0)
        if (curTotal >= mealCap(mealId)) return d
        if (cur >= menuCap(menuId)) return d
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
    } catch (err) {
      // 같은 팀의 다른 기기가 그 사이에 주문을 저장한 경우 — 조용히 덮어쓰면
      // 그 사람이 담은 것이 사라지므로 어느 쪽을 남길지 물어봅니다
      if (err?.code === 'order-conflict') {
        const overwrite = window.confirm(
          '다른 팀원이 방금 주문을 저장했습니다.\n\n확인 = 지금 내 화면 내용으로 저장\n취소 = 팀원이 저장한 내역 불러오기',
        )
        if (!overwrite) {
          setDirty(false)
          setSaving(false)
          await refreshBoard()
          return
        }
        try {
          await onSave(mealsMap, { force: true })
        } catch {
          setSaving(false)
          alert('네트워크 오류로 주문이 저장되지 않았습니다.\n잠시 후 다시 눌러주세요.')
          return
        }
      } else {
        setSaving(false)
        alert('네트워크 오류로 주문이 저장되지 않았습니다.\n잠시 후 "주문하기"를 다시 눌러주세요.')
        return
      }
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
            {/* 제목은 짧은 이름(야식·아침)으로 — 식사 탭에서는 label(DAY 1 야식) 사용 */}
            {multiMeal
              ? openMeals.map((m) => m.shortLabel || m.label).join('·')
              : activeMeal.shortLabel || activeMeal.label}{' '}
            주문
          </div>
          <div className="board-header-sub">
            {multiMeal ? '한 번에 담아 주문할 수 있어요' : '먹고 싶은 메뉴를 담아주세요'}
          </div>
        </div>
        <div className="board-header-actions">
          <div className={`board-countdown${pulseDeadline ? ' urgent' : ''}`}>
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

      <OrderNotice />

      {/* 담아두기만 하면 저장되지 않으므로, 마감 임박에는 눈에 띄게 알립니다 */}
      {/* 관리자가 누른 재촉. 아직 주문하지 않은 팀에만 띄웁니다
          (주문을 끝낸 팀에게 재촉이 뜨면 혼란만 줍니다) */}
      {nudgeFresh && !hasSaved && (
        <div className="nudge-banner" role="status">
          <span className="nudge-banner-icon" aria-hidden="true">🍽️</span>
          <div>
            <b>음식을 주문해주세요!</b>
            <p>
              마감까지 <b>{fmtCountdown(remain)}</b> 남았습니다. 지금 메뉴를 담아 주문해주세요.
            </p>
          </div>
        </div>
      )}

      {/* 두 경우를 모두 잡습니다.
          ① 담아만 두고 저장하지 않음 → 그대로 마감되면 사라집니다
          ② 아무것도 주문하지 않음 → 담아둔 것도 없으니 예전 조건에 걸리지
             않아 아무 안내도 못 받았습니다 (실제로 놓치는 쪽) */}
      {nearDeadline && (dirty || !hasSaved) && (
        <div className="deadline-warn">
          ⏰ 마감까지 <b>{fmtCountdown(remain)}</b> —{' '}
          {dirty ? (
            <>
              담아둔 메뉴가 <b>아직 주문되지 않았습니다.</b> 아래 <b>주문하기</b>를 눌러주세요.
            </>
          ) : (
            <>
              <b>아직 주문하지 않았습니다.</b> 지금 메뉴를 담아 주문해주세요.
            </>
          )}
        </div>
      )}

      {/* 주문한 메뉴가 뒤늦게 품절된 경우 */}
      {soldoutOrdered.length > 0 && (
        <div className="soldout-warn">
          🚫 주문하신 <b>{[...new Set(soldoutOrdered)].join(', ')}</b>이(가) 품절되었습니다. 운영진이
          대체 메뉴로 안내드립니다.
        </div>
      )}

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

      {/* 알레르기로 상한이 줄어든 경우 그 이유를 밝혀줌 — 그냥 버튼이 막히면
          품절이나 오류로 오해하기 때문. 줄어든 몫은 대체 메뉴로 준비됨을 명시 */}
      {(mealCap(activeMeal.id) < memberCount ||
        menus.some((m) => menuCap(m.id) < memberCount)) && (
        <div className="diet-cap-hint">
          <b>🥗 알레르기 반영 안내</b>
          {mealCap(activeMeal.id) < memberCount && (
            <p>
              {activeMeal.label}은 <b>{mealCap(activeMeal.id)}개</b>까지 담을 수 있어요. 남은{' '}
              {memberCount - mealCap(activeMeal.id)}명분은 <b>대체 메뉴로 따로 준비</b>됩니다.
            </p>
          )}
          {menus
            .filter((m) => menuCap(m.id) < memberCount && menuCap(m.id) > mealCap(activeMeal.id))
            .map((m) => (
              <p key={m.id}>
                {m.name.replace('\n', ' ')} — 알레르기가 있는 팀원이 있어{' '}
                <b>{menuCap(m.id)}개</b>까지 담을 수 있어요.
              </p>
            ))}
        </div>
      )}

      {/* 사진 카드 2열 그리드 */}
      <div className="food-grid">
        {menus.map((m) => {
          const isSoldout = !!soldout[m.id]
          const qty = draft[activeMeal.id]?.[m.id] || 0
          const plusDisabled =
            isSoldout || mealLimitReached(activeMeal.id) || menuLimitReached(activeMeal.id, m.id)
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
                </div>
                {/* 알레르기·식이 표기는 담기 버튼과 같은 줄에 두면 폭이 80px 남짓으로
                    좁아져 성분이 여러 줄로 잘립니다. 카드 전체 폭을 쓰도록 버튼과
                    형제로 두고, 배치는 styles.css의 order로 조정합니다.
                    (DOM 순서는 이름 → 알레르기 → 버튼 — 읽는 순서와 맞춤) */}
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
          {activeMeal.label}은 {mealCap(activeMeal.id)}개까지 담을 수 있어요
          {mealCap(activeMeal.id) < memberCount
            ? ' (알레르기 반영)'
            : ` (팀 인원수 ${memberCount}명)`}
          .
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
        <div className="sheet-overlay" onClick={closeCart}>
          <div
            ref={cartDialogRef}
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cart-sheet-title"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            style={cartDrag.sheetStyle}
          >
            <div className="sheet-handle" aria-hidden="true" {...cartDrag.handleHandlers} />
            <div className="sheet-head">
              <h3 id="cart-sheet-title">🛒 장바구니 ({totalQty})</h3>
              <button className="sheet-close" onClick={closeCart} aria-label="닫기">
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
                            disabled={mealLimitReached(meal.id) || menuLimitReached(meal.id, menuId)}
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
