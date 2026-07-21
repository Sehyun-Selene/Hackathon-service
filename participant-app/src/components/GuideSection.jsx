import { MEALS, CALL_LIMIT_PER_TEAM } from '../config.js'
import { fmtClock } from '../lib/time.js'

// 같은 주문 구간(orderStart~orderEnd)을 공유하는 식사끼리 묶음
// (예: 저녁·야식·아침을 16~17시에 한 번에 주문)
function orderWindows() {
  const windows = []
  MEALS.forEach((m) => {
    const key = `${m.orderStart}~${m.orderEnd}`
    let w = windows.find((x) => x.key === key)
    if (!w) {
      w = { key, orderStart: m.orderStart, orderEnd: m.orderEnd, meals: [] }
      windows.push(w)
    }
    w.meals.push(m)
  })
  return windows
}

// 참가자 안내사항 — 참가자가 꼭 알아야 할 기본 규칙 모음.
// 온보딩 화면에서는 펼친 상태로, 메인 화면에서는 접힌 상태(defaultOpen=false)로 사용.
export default function GuideSection({ defaultOpen = false }) {
  return (
    <details className="guide-section card" open={defaultOpen}>
      <summary className="guide-summary">📋 이용 안내 (꼭 읽어주세요)</summary>
      <div className="guide-body">
        <div className="guide-block">
          <b>🍽️ 주문 시간</b>
          <ul>
            {orderWindows().map((w) => (
              <li key={w.key}>
                <div>
                  <span className="guide-meal">{w.meals.map((m) => m.label).join('·')}</span>
                  {fmtClock(new Date(w.orderStart))} ~ {fmtClock(new Date(w.orderEnd))} 주문
                </div>
                <span className="guide-eat">
                  → {w.meals.map((m) => `${m.label} ${fmtClock(new Date(m.eatAt))}`).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
          <p>
            둘째 날 점심과 이후 아이스크림은 주문 없이 인원수 기준으로 제공됩니다.
            <br />
            음료는 냉장고에서 자유롭게 가져가세요.
          </p>
        </div>
        <div className="guide-block">
          <b>👥 음식은 팀 인원수에 맞게</b>
          <p>각 식사마다 등록한 팀 인원수만큼만 담을 수 있어요.</p>
        </div>
        <div className="guide-block">
          <b>🙋 캠프지기 호출</b>
          <p>도움이 필요하면 캠프지기를 호출하세요.</p>
          <p className="guide-call-limit">
            <span>팀당</span>
            <strong>{CALL_LIMIT_PER_TEAM}회</strong>
            <span>까지 가능합니다.</span>
          </p>
        </div>
        <div className="guide-block">
          <b>🥗 알러지</b>
          <p>
            팀 등록 시 입력한 알러지 정보를 운영진이 확인해 대체 메뉴를 준비합니다.
            <br />
            메뉴 옆 알러지 표시도 함께 확인해 주세요.
          </p>
        </div>
      </div>
    </details>
  )
}
