import ServedMeals from './ServedMeals.jsx'

// 안내 이미지 한 장을 그대로 보여주는 탭 (타임테이블 · 음식 여정).
//
// 폰으로 보는 화면이라 두 가지를 신경 씁니다:
//   ① 잘리지 않게 — 폭에 맞추고 높이는 비율대로 둡니다(object-fit 없음).
//      틀에 맞춰 자르면 시간표의 끝이나 지도의 한쪽이 사라집니다.
//   ② 글씨를 키워 볼 수 있게 — 앱 화면은 확대를 막아둬서(index.html의
//      viewport user-scalable=no) 이미지 안에서 손가락 확대가 되지 않습니다.
//      그래서 눌러 원본을 새 탭에서 열도록 했습니다. 브라우저 기본
//      이미지 화면에는 그 제한이 걸리지 않아 자유롭게 확대됩니다.
//
// 음식 여정 탭에는 지도 아래에 주문 없이 제공되는 끼니(간식·저녁·점심)를
// 이어 붙입니다. 지도에서 순서를 보고 바로 그 끼니에 무엇이 나오는지
// 펼쳐 볼 수 있는 자리라서요 — 주문 화면에는 주문할 것만 남깁니다.
export default function ImageBoard({ board, teamButton = null }) {
  return (
    <section className="image-board">
      <div className="card-head-row">
        <h3 className="card-title image-board-title">
          <span className="image-board-icon" aria-hidden="true">
            {board.icon}
          </span>
          {board.title}
        </h3>
        {teamButton}
      </div>
      <a className="image-board-frame" href={board.src} target="_blank" rel="noreferrer">
        <img src={board.src} alt={board.alt} />
        <span className="image-board-zoom">🔍 눌러서 크게 보기</span>
      </a>
      {board.id === 'journey' && (
        <div className="image-board-meals">
          <h4 className="image-board-subtitle">🍚 주문 없이 제공되는 끼니</h4>
          <ServedMeals />
        </div>
      )}
    </section>
  )
}
