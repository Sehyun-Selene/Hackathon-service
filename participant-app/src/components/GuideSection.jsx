import { guideMustItems, guideCanItems } from '../config.js'

// 이용 안내 본문 — 두 덩이입니다.
//
//   1  반드시 G-Order로 해야 하는 것   호출(필드리그만) · 주문
//   2  G-Order로 확인할 수 있는 것     타임테이블 · 음식 여정 · 이벤트 …
//
// 두 덩이를 나눈 이유: 이 앱은 "해야 하는 일"과 "찾아보는 정보"를 같이
// 담고 있는데, 예전 안내는 규칙만 나열해서 앱이 무엇을 하는 물건인지가
// 드러나지 않았습니다. 무게가 다르니 생김새도 다릅니다 — 1번은 카드,
// 2번은 이름만 늘어놓은 격자입니다.
//
// 1번 카드에 아이콘을 두지 않습니다. 두 장뿐이라 아이콘이 구분에 보태는
// 것이 없고, 글자가 먼저 읽히는 편이 낫습니다.
//
// 목록은 화면이 아니라 config에서 옵니다(guideMustItems·guideCanItems).
// 팀 번호만 넘기면 리그에 맞는 항목이 나옵니다 — 그래서 이 화면은 팀 등록
// '뒤'에 섭니다. 등록 전에는 어느 리그인지 알 수 없어, 호출을 쓰지 않는
// 개발자리그에도 호출 안내를 띄우게 됩니다.
export default function GuideSection({ teamId }) {
  const must = guideMustItems(teamId)
  const can = guideCanItems()

  return (
    <div className="guide-body">
      <div className="guide-sect">
        <div className="guide-sect-label">
          <span className="guide-sect-num must" aria-hidden="true">1</span>
          <b>반드시 G-Order로 해야 하는 것</b>
        </div>
        <div className="guide-must">
          {must.map((item) => (
            <div className="guide-must-card" key={item.id}>
              <b>{item.title}</b>
              <p>{item.desc}</p>
              {/* 시각만 주황으로 — 이 카드에서 놓치면 안 되는 건 시간뿐입니다.
                  알약으로 감싸 두니 눌러야 할 것처럼 보였습니다. */}
              {item.when && (
                <p className="guide-when">
                  <b>{item.when}</b>
                  {item.note ? ' ' + item.note : ''}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="guide-sect">
        <div className="guide-sect-label">
          <span className="guide-sect-num" aria-hidden="true">2</span>
          <b>G-Order로 확인할 수 있는 것</b>
        </div>
        <div className="guide-can">
          {can.map((item) => (
            <div className="guide-can-tile" key={item.id}>
              <span className="guide-can-icon" aria-hidden="true">{item.icon}</span>
              <b>{item.label}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
