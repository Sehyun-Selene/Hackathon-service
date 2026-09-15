import {
  EVENT_POSTER,
  DEV_LEAGUE_EVENTS,
  PLATFORM_LINK,
  EXTRA_LINKS,
  checkoutSurveyFor,
} from '../config.js'

// 바로가기 탭 — 앱 밖으로 나가야 하는 곳과 이벤트 안내를 모은 화면입니다.
//
// 순서에 뜻이 있습니다:
//   ① 해커톤 플랫폼   — 제출 때문에 반드시 쓰는 곳. 소제목 없이 맨 위에
//                       홀로 둡니다. 묶음의 한 줄이 되면 "여러 링크 중
//                       하나"로 읽혀서요.
//   ② 공통 이벤트     — 포스터 한 장에 다섯 개가 다 보입니다.
//   ③ 개발자리그 전용 — 개발자리그에만, 포스터 번호를 이어서(06·07).
//   ④ 이벤트 안내 전체— 더 알고 싶은 사람만 여는 층입니다.
//   ⑤ 더 관심이 있다면— 안 해도 그만인 것. 맨 아래, 조용한 글씨로.
//
// 포스터는 안내 이미지 탭(타임테이블·음식 여정)과 같은 방식입니다 — 폭에
// 맞춰 전체를 보여주고, 눌러서 원본을 크게 엽니다. 앱 화면은 손가락 확대를
// 막아둬서(index.html의 viewport) 이미지 안에서는 키워 볼 수 없거든요.
//
// showDevEvents: 개발자리그 참가자인지. 필드리그에는 06·07이 해당하지
// 않으므로 아예 보여주지 않습니다 — 못 하는 이벤트를 띄워두면 혼란입니다.
export default function LinksSection({
  teamId,
  teamButton = null,
  showDevEvents = false,
  onOpenGuide,
}) {
  // 체크아웃 설문은 필드리그에만 섭니다 — 개발자리그는 설문이 따로 있습니다.
  const survey = checkoutSurveyFor(teamId)
  const extras = survey ? [...EXTRA_LINKS, survey] : EXTRA_LINKS
  return (
    <section className="links-board">
      <div className="card-head-row">
        <h3 className="card-title image-board-title">
          <span className="image-board-icon" aria-hidden="true">
            🔗
          </span>
          바로가기
        </h3>
        {teamButton}
      </div>

      {/* 이 화면에서 테두리에 색이 들어간 유일한 카드입니다 — 여기가 먼저
          눈에 걸려야 합니다. */}
      <a
        className="platform-link"
        href={PLATFORM_LINK.url}
        target="_blank"
        rel="noreferrer"
      >
        <span className="platform-link-icon" aria-hidden="true">
          🖥️
        </span>
        <span className="platform-link-text">
          <b>{PLATFORM_LINK.title}</b>
          <small>{PLATFORM_LINK.desc}</small>
        </span>
        <span className="platform-link-go" aria-hidden="true">
          ↗
        </span>
      </a>

      <h4 className="links-subtitle">🏕️ 필드리그 &amp; 개발자리그 공통 이벤트</h4>
      <a className="image-board-frame" href={EVENT_POSTER.src} target="_blank" rel="noreferrer">
        <img src={EVENT_POSTER.src} alt={EVENT_POSTER.alt} />
        <span className="image-board-zoom">🔍 눌러서 크게 보기</span>
      </a>

      {showDevEvents && (
        <>
          <h4 className="links-subtitle">🔥 개발자리그 전용 이벤트</h4>
          <ul className="dev-event-list">
            {DEV_LEAGUE_EVENTS.map((event) => (
              <li key={event.no} className="dev-event">
                <span className="dev-event-no" aria-hidden="true">
                  {event.no}
                </span>
                <span className="dev-event-text">
                  <b>{event.title}</b>
                  <small>{event.desc}</small>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* 참가 방법·굿즈·자주 묻는 질문은 길어서 이 화면에 다 펼치면 아래가
          한참 밀립니다. 눌러서 화면을 꽉 채워 봅니다 — 앱을 떠나지는
          않습니다. 그래서 ↗ 가 아니라 › 입니다. */}
      <button type="button" className="links-guide-btn" onClick={onOpenGuide}>
        <span className="links-guide-icon" aria-hidden="true">
          📖
        </span>
        <span className="links-guide-text">
          <b>이벤트 안내 전체 보기</b>
          <small>참여 방법 · 굿즈 · 자주 묻는 질문</small>
        </span>
        <span className="links-guide-go" aria-hidden="true">
          ›
        </span>
      </button>

      {/* 위 소제목들보다 한 단 조용하게 — 안 해도 그만인 것들입니다 */}
      <h4 className="links-aside">더 관심이 있다면?</h4>
      <div className="quick-link-list">
        {extras.map((link) => (
          <a
            key={link.id}
            className="quick-link"
            href={link.url}
            target="_blank"
            rel="noreferrer"
          >
            <span className="quick-link-text">
              <b>{link.title}</b>
              <small>{link.desc}</small>
            </span>
            <span className="quick-link-go" aria-hidden="true">
              ↗
            </span>
          </a>
        ))}
      </div>
    </section>
  )
}
