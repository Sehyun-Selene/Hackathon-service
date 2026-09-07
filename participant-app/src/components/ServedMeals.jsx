import { SERVED_MEALS } from '../config.js'

// 주문 없이 제공되는 음식(간식·저녁·점심) 안내.
//
// 주문 대상이 아니라 "무엇이 나오는지" 보여주는 것뿐이므로 수량 조절이나
// 담기 없이 사진과 목록만 보여줍니다.
// 한 끼당 12~13가지라 펼쳐두면 주문 화면이 밀려 내려가, 기본은 접어둡니다
// (details/summary — 브라우저 기본 동작이라 따로 상태를 들 필요가 없습니다).
// 사진은 접힌 동안 받지 않도록 lazy로 둡니다 — 일곱 장을 처음부터 받으면
// 현장 와이파이에서 주문 화면이 늦게 뜹니다.
// 폰에서는 토글을 펼쳐도 화면이 그대로여서, 펼친 내용을 보려면 직접
// 내려야 했습니다. 펼친 칸을 화면 위로 올려줍니다.
// 닫을 때는 움직이지 않습니다 — 닫는 사람은 이미 그 자리를 보고 있습니다.
// 사진 자리는 CSS(aspect-ratio)로 미리 잡혀 있어, 사진이 아직 안 받아졌어도
// 위치가 밀리지 않습니다.
function scrollOpenedIntoView(event) {
  const el = event.currentTarget
  if (!el.open) return
  const 줄임 = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  requestAnimationFrame(() => {
    const top = el.getBoundingClientRect().top + window.scrollY - 10
    window.scrollTo({ top, behavior: 줄임 ? 'auto' : 'smooth' })
  })
}

export default function ServedMeals() {
  if (!SERVED_MEALS.length) return null
  return (
    <div className="served-meals">
      {SERVED_MEALS.map((meal) => (
        <details key={meal.id} className="served-meal" onToggle={scrollOpenedIntoView}>
          <summary className="served-meal-summary">
            <span className="served-meal-title">
              {meal.icon || '🍚'} {meal.label}
              {meal.cuisine ? ` · ${meal.cuisine}` : ''}
            </span>
            {/* 제공 시각만. 가짓수는 펼치면 바로 보이는 정보라 뺐습니다 */}
            {meal.servedAt && <span className="served-meal-meta">{meal.servedAt}</span>}
          </summary>
          {meal.photos?.length > 0 && (
            <div className={`served-photos${meal.photos.length > 1 ? ' multi' : ''}`}>
              {meal.photos.map((photo) => (
                <figure className="served-photo" key={photo.src}>
                  <img src={photo.src} alt={photo.caption} loading="lazy" />
                  <figcaption>{photo.caption}</figcaption>
                </figure>
              ))}
            </div>
          )}
          {/* 사진 캡션만으로 충분한 끼니(간식)는 항목 목록이 없습니다 */}
          {meal.items?.length > 0 && (
            <ul className="served-meal-list">
              {meal.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          {/* 끼니마다 안내가 다를 수 있습니다 (간식은 종류를 고르는 방식) */}
          <p className="served-meal-note">
            {meal.note || '주문 없이 인원수대로 제공됩니다.'}
          </p>
        </details>
      ))}
    </div>
  )
}
