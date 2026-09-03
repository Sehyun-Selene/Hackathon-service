import { SERVED_MEALS } from '../config.js'

// 주문 없이 제공되는 식사(저녁·점심) 구성 안내.
//
// 주문 대상이 아니라 "무엇이 나오는지" 보여주는 것뿐이므로 수량 조절이나
// 담기 없이 목록만 보여줍니다.
// 한 끼당 12~13가지라 펼쳐두면 주문 화면이 밀려 내려가, 기본은 접어둡니다
// (details/summary — 브라우저 기본 동작이라 따로 상태를 들 필요가 없습니다).
export default function ServedMeals() {
  if (!SERVED_MEALS.length) return null
  return (
    <div className="served-meals">
      {SERVED_MEALS.map((meal) => (
        <details key={meal.id} className="served-meal">
          <summary className="served-meal-summary">
            <span className="served-meal-title">
              🍚 {meal.label}
              {meal.cuisine ? ` · ${meal.cuisine}` : ''}
            </span>
            {/* 시각이 정해지면 config의 servedAt에 넣으면 여기에 붙습니다 */}
            <span className="served-meal-meta">
              {meal.servedAt ? `${meal.servedAt} · ` : ''}
              {meal.items.length}가지
            </span>
          </summary>
          <ul className="served-meal-list">
            {meal.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="served-meal-note">주문 없이 인원수대로 제공됩니다.</p>
        </details>
      ))}
    </div>
  )
}
