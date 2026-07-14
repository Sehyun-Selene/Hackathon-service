import { MENU_BY_ID } from '../config.js'
import { fmtClock } from '../lib/time.js'

// 주문 내역 노출 규칙 (PRD 4.2 핵심 로직):
// 각 식사의 내역은 orderStart ~ eatAt 동안 노출, 구간이 겹치면 동시에 표시
export default function OrderHistory({ visibleMeals, openMeal, savedOrder }) {
  return (
    <section className="card">
      <h3 className="card-title">🧾 우리 팀 주문 내역</h3>
      {visibleMeals.length === 0 ? (
        <p className="empty-text">현재 표시할 주문 내역이 없습니다.</p>
      ) : (
        visibleMeals.map((meal) => {
          const entry = savedOrder?.meals?.[meal.id]
          const items = entry?.items || []
          const editable = openMeal?.id === meal.id
          return (
            <div key={meal.id} className="history-meal">
              <div className="history-meal-head">
                <b>{meal.label}</b>
                <span className="history-meta">
                  식사 {fmtClock(new Date(meal.eatAt))} · 이 시각까지 표시됨
                  {editable && ' · 마감 전 수정 가능'}
                </span>
              </div>
              {items.length === 0 ? (
                <p className="empty-text">아직 주문한 항목이 없습니다.</p>
              ) : (
                <ul className="history-list">
                  {items.map((it) => {
                    const menu = MENU_BY_ID[it.menuId]
                    return (
                      <li key={it.menuId}>
                        <span>{menu ? menu.name : it.menuId}</span>
                        <b>{it.qty}개</b>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })
      )}
    </section>
  )
}
