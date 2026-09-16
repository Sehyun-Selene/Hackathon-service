import { SERVED_MEALS, orderWindowShort } from '../config.js'

// 음식 여정 탭 아래에 붙는 끼니별 사진 안내(메뉴판).
//
// 대부분은 가만히 있어도 나오는 음식이지만, 야식·아침 둘은 주문 화면에서
// 직접 담아야 받습니다(config의 ordered). 시간 순서로 읽는 화면이라 그
// 둘만 빼면 밤이 통째로 비어 보여 함께 세우되, 주황 테두리로 한 덩이로
// 묶고 그 위에 태그를 답니다 — 끼니마다 태그를 달면 같은 말이 두 번
// 나오고, 둘이 한 번에 주문된다는 것도 드러나지 않습니다.
//
// 주문 대상이 아니라 "무엇이 나오는지" 보여주는 것뿐이므로 수량 조절이나
// 담기 없이 사진과 목록만 보여줍니다.
// 한 끼당 12~13가지라 펼쳐두면 주문 화면이 밀려 내려가, 기본은 접어둡니다
// (details/summary — 브라우저 기본 동작이라 따로 상태를 들 필요가 없습니다).
// 사진은 접힌 동안 받지 않도록 lazy로 둡니다 — 일곱 장을 처음부터 받으면
// 현장 와이파이에서 주문 화면이 늦게 뜹니다.
// 폰에서는 토글을 여닫아도 화면이 그대로여서, 펼친 내용을 보려면 직접
// 내려야 했습니다.
//   펼칠 때 → 그 칸을 화면 위쪽으로 (바로 내용이 보이게)
//   접을 때 → 그 자리에 그대로 (메뉴판을 떠나지 않습니다)
//
// 접을 때 페이지 맨 위로 보내던 것을 뺐습니다. 한 끼니를 닫으면 다른 끼니를
// 보려는 것이지 화면 꼭대기로 가려는 게 아닌데, 매번 음식 여정 지도까지
// 되돌아가 다시 내려와야 했습니다.
//
// 다만 아무것도 안 하면 곤란한 경우가 하나 있습니다. 펼친 내용 안을 한참
// 내려다본 뒤 접으면 문서가 그만큼 짧아져, 방금 접은 칸이 화면 위로 밀려나
// 엉뚱한 자리에 남습니다. 그때만 그 칸을 도로 데려옵니다.
//
// 위치는 프레임을 두 번 기다린 뒤에 잽니다. 여닫는 순간 문서 길이가 바뀌면서
// 브라우저가 스크롤을 스스로 끌어당기는데(스크롤 앵커링), 그보다 먼저
// 계산하면 목표가 어긋나고 내 스크롤이 덮어써집니다. CSS의
// overflow-anchor: none 과 함께 써야 제자리에 옵니다.
// 사진 자리는 CSS(aspect-ratio)로 잡혀 있어 사진이 아직 안 받아졌어도
// 위치가 밀리지 않습니다.
function scrollToggledIntoView(event) {
  const el = event.currentTarget
  const 펼침 = el.open
  const 줄임 = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const 자리 = el.getBoundingClientRect()
      // 접었는데 그 칸이 아직 화면 안에 잘 보이면 건드리지 않습니다 —
      // 가만히 있는 것이 가장 덜 놀랍습니다.
      const 보인다 = 자리.top >= 0 && 자리.top <= window.innerHeight - 80
      if (!펼침 && 보인다) return
      window.scrollTo({
        top: 자리.top + window.scrollY - 10,
        behavior: 줄임 ? 'auto' : 'smooth',
      })
    })
  })
}

// 시간 순서로 붙어 있는 '주문해야 받는' 끼니들을 한 덩이로 묶습니다.
// 지금은 야식(21시)·아침(9시)이 나란히 있어 한 덩이가 됩니다. 사이에
// 다른 끼니가 끼면 저절로 두 덩이로 갈라집니다.
function groupMeals(meals) {
  const groups = []
  for (const meal of meals) {
    const last = groups[groups.length - 1]
    if (meal.ordered && last?.ordered) last.meals.push(meal)
    else groups.push({ ordered: Boolean(meal.ordered), meals: [meal] })
  }
  return groups
}

function MealBlock({ meal }) {
  return (
    <details className="served-meal" onToggle={scrollToggledIntoView}>
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
              {/* ratio가 있으면 그 비율로 — 없으면 CSS 기본값(4:3) */}
              <img
                src={photo.src}
                alt={photo.caption}
                loading="lazy"
                style={photo.ratio ? { '--ratio': photo.ratio } : undefined}
              />
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
  )
}

export default function ServedMeals() {
  if (!SERVED_MEALS.length) return null
  return (
    <div className="served-meals">
      {groupMeals(SERVED_MEALS).map((group) =>
        group.ordered ? (
          <div className="served-order-group" key={group.meals[0].id}>
            {/* 태그 하나로는 '언제'가 빠집니다. 시각은 태그 옆에 붙여
                한 줄로 끝냅니다 — 줄을 더 쓰면 묶음이 무거워집니다. */}
            <div className="served-order-head">
              <span className="served-meal-tag">G-Order로 직접 주문!</span>
              <span className="served-order-when">{orderWindowShort()}</span>
            </div>
            {group.meals.map((meal) => (
              <MealBlock meal={meal} key={meal.id} />
            ))}
          </div>
        ) : (
          group.meals.map((meal) => <MealBlock meal={meal} key={meal.id} />)
        ),
      )}
    </div>
  )
}
