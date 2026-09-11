import logo52g from '../assets/52g-logo.png'
import GuideSection from './GuideSection.jsx'
import LanternIcon from './LanternIcon.jsx'

// S2 이용 안내 — 팀 등록 앞에 오는 첫 화면.
//
// 예전에는 등록 화면 안에 접힌 상자(details)로 들어 있어, 대부분 펼치지
// 않은 채 지나갔습니다. 규칙을 모르고 등록하면 주문 시간·호출 횟수를
// 뒤늦게 알게 되므로, 등록 앞에 한 화면으로 세우고 다 펼쳐 보여줍니다.
//
// 주문 시간 공지(OrderNotice)는 여기 두지 않습니다 — 주문할 자리에서 봐야
// 하는 내용이라 음식 주문 탭에만 둡니다.
// 리그를 아직 고르기 전이라 호출 안내도 함께 보여줍니다.
export default function OnboardingGuide({ onNext }) {
  return (
    <div className="app screen screen-guide">
      <header className="screen-head">
        <div>
          <div className="header-brand">G-Order</div>
          <h1 className="screen-title">이용 안내</h1>
          <p className="screen-sub">꼭 읽어주세요</p>
        </div>
        <img className="header-logo" src={logo52g} alt="52g" />
      </header>

      <div className="screen-body">
        <GuideSection showCall />
      </div>

      <div className="screen-foot">
        <button className="btn-primary" onClick={onNext}>
          알겠어요
        </button>
      </div>

      <LanternIcon className="screen-guide-mark" state="active" size={168} />
    </div>
  )
}
