import { MEALS, CALL_LIMIT_PER_TEAM } from '../config.js'
import { fmtClock } from '../lib/time.js'

// 참가자 안내사항 (PRD 요청 #7) — 참가자가 꼭 알아야 할 기본 규칙 모음.
// 온보딩 화면에서는 펼친 상태로, 메인 화면에서는 접힌 상태(defaultOpen=false)로 사용.
export default function GuideSection({ defaultOpen = false }) {
  return (
    <details className="guide-section card" open={defaultOpen}>
      <summary className="guide-summary">📋 이용 안내 (꼭 읽어주세요)</summary>
      <div className="guide-body">
        <div className="guide-block">
          <b>🍽️ 식사 주문 시간</b>
          <ul>
            {MEALS.map((m) => (
              <li key={m.id}>
                <span className="guide-meal">{m.label}</span>
                {fmtClock(new Date(m.orderStart))} ~ {fmtClock(new Date(m.orderEnd))} 주문
                <span className="guide-eat">→ {fmtClock(new Date(m.eatAt))} 식사</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="guide-block">
          <b>👥 음식은 팀 인원수에 맞게</b>
          <p>음식은 등록한 팀 인원수만큼만 주문할 수 있어요. 음료는 제한이 없습니다.</p>
        </div>
        <div className="guide-block">
          <b>🙋 코치 호출</b>
          <p>도움이 필요하면 코치를 호출하세요.</p>
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
