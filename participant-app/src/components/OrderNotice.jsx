import { MEALS } from '../config.js'
import { fmtHM } from '../lib/time.js'

// '2026-09-21T13:30:00' → '[9/21]'
// 공지에는 [DAY 1]보다 실제 날짜가 헷갈리지 않습니다. 라벨을 파싱하지
// 않고 그 식사의 시각에서 직접 뽑아, 날짜가 바뀌어도 어긋나지 않습니다.
const fmtMD = (iso) => {
  const d = new Date(iso)
  return `[${d.getMonth() + 1}/${d.getDate()}]`
}

// 주문 시간 공지 — 주문 화면과 첫 입장 안내 화면에서 같은 내용을 씁니다.
// 두 곳이 서로 다른 말을 하지 않도록 한 컴포넌트에서 뽑아 씁니다.
//
// 문구의 시각은 전부 config.MEALS에서 뽑습니다. 예전에는 "14시부터 15시까지"가
// 글자로 박혀 있어, 시간이 바뀌면 화면에만 옛 시간이 남는 문제가 있었습니다.
// soloRule: '팀에서 한 명만 대표로 주문해주세요'를 이 목록에 넣을지.
// 주문 가능한 화면에서는 이 줄만 목록 위로 따로 올려 두므로(담기 전에
// 읽어야 효과가 있어서), 목록에서는 빼서 같은 화면에 두 번 나오지 않게 합니다.
export default function OrderNotice({ className = '', soloRule = true }) {
  // 모든 식사가 같은 주문 구간을 공유하면 한 문장으로 묶어 안내
  const windows = [...new Set(MEALS.map((m) => `${m.orderStart}~${m.orderEnd}`))]
  const shared = windows.length === 1 ? MEALS[0] : null
  return (
    <div className={`notice-panel order-notice${className ? ` ${className}` : ''}`}>
      {/* 제목은 호출 화면의 '📌 호출 전에 꼭 읽어보세요!'와 같은 형태 —
          이모지를 별도 요소로 두면 글자보다 커져 두 탭이 달라 보입니다 */}
      <b className="notice-panel-title">📢 공지사항</b>
      <ul className="notice-panel-list">
        {shared ? (
          <li>
            {MEALS.map((m) => m.shortLabel || m.label).join('과 ')}은{' '}
            {fmtMD(shared.orderStart)} {fmtHM(shared.orderStart)}부터 {fmtHM(shared.orderEnd)}까지
            주문합니다.
          </li>
        ) : (
          MEALS.map((m) => (
            <li key={m.id}>
              {m.label}은 {fmtMD(m.orderStart)} {fmtHM(m.orderStart)}부터 {fmtHM(m.orderEnd)}까지
              주문합니다.
            </li>
          ))
        )}
        <li>
          {MEALS.map((m) => `${m.shortLabel || m.label}은 ${fmtMD(m.eatAt)} ${fmtHM(m.eatAt)}에`)
            .join(', ')}{' '}
          제공합니다.
        </li>
        {/* 한 판을 나눠 먹는 크기로 오해하면 팀 인원보다 적게 담습니다 */}
        <li>야식 피자는 한 판이 1인용입니다.</li>
        {/* 팀원이 각자 담으면 서로의 주문을 덮어써서 수량이 어긋납니다 */}
        {soloRule && (
          <li>
            <b>팀에서 한 명만 대표로 주문해주세요.</b>
          </li>
        )}
      </ul>
    </div>
  )
}
