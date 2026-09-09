import { CALL_LIMIT_PER_TEAM } from '../config.js'

// 참가자 안내사항 — 참가자가 꼭 알아야 할 기본 규칙 모음.
// 첫 입장 안내 화면(OnboardingGuide)에서 펼친 카드 목록으로 보여줍니다.
// ※ 주문 시간 안내는 공지사항(OrderNotice)이 따로 담당합니다.
// showCall=false면 호출 항목을 빼고 보여줍니다 (개발자리그는 호출을 쓰지 않음)
export default function GuideSection({ showCall = true }) {
  return (
    <div className="guide-body">
      {showCall && (
        <div className="guide-block">
          <span className="guide-block-icon" aria-hidden="true">🙋</span>
          <div className="guide-block-text">
            <b>마스터 메이트 호출</b>
            <p>도움이 필요하면 마스터 메이트를 호출하세요.</p>
            <p className="guide-call-limit">
              <span>팀당</span>
              <strong>{CALL_LIMIT_PER_TEAM}회</strong>
              <span>까지 가능합니다.</span>
            </p>
          </div>
        </div>
      )}
      <div className="guide-block">
        <span className="guide-block-icon" aria-hidden="true">👥</span>
        <div className="guide-block-text">
          <b>음식은 팀 인원수에 맞게</b>
          <p>각 식사마다 등록한 팀 인원수만큼만 담을 수 있어요.</p>
        </div>
      </div>
      <div className="guide-block">
        <span className="guide-block-icon" aria-hidden="true">🥗</span>
        <div className="guide-block-text">
          <b>알레르기</b>
          <p>메뉴에 포함된 알레르기 유발 물질 중 해당 사항이 있다면 하단에 표기해주세요.</p>
        </div>
      </div>
    </div>
  )
}
