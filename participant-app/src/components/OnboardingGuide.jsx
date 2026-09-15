import logo52g from '../assets/52g-logo.png'
import GuideSection from './GuideSection.jsx'
import LanternIcon from './LanternIcon.jsx'

// 이용 안내 — 팀 등록을 마친 직후 한 번 서는 화면.
//
// 등록 '앞'에 있던 것을 뒤로 옮겼습니다. 안내 내용이 리그마다 다른데
// (개발자리그는 호출을 쓰지 않습니다), 등록 전에는 어느 리그인지 알 수
// 없어 양쪽 안내를 다 띄우고 있었습니다.
//
// 주문 시간 공지(OrderNotice)는 여기 두지 않습니다 — 주문할 자리에서 봐야
// 하는 내용이라 음식 주문 탭에만 둡니다.
export default function OnboardingGuide({ teamId, onNext }) {
  return (
    <div className="app screen screen-guide">
      <header className="screen-head">
        <div>
          <div className="header-brand">
            <LanternIcon state="active" size={16} className="brand-lantern" />
            G-Order
          </div>
          <h1 className="screen-title">이용 안내</h1>
          <p className="screen-sub">꼭 읽어주세요</p>
        </div>
        <img className="header-logo" src={logo52g} alt="52g" />
      </header>

      <div className="screen-body">
        <GuideSection teamId={teamId} />
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
