import { teamLabel } from '../config.js'
import { fmtTimeOnly } from '../lib/time.js'
import Icon from './Icon.jsx'

// 노트북에서만 쓰는 오른쪽 상세 칸.
//
// 폰에서는 화면이 하나뿐이라 "고르고 → 아래 바에서 처리"가 맞습니다.
// 노트북에서는 그 구조를 그대로 늘리면 목록 한 줄이 1000px가 되고 아래
// 절반이 빈 채로 남습니다. 폭이 남으니 목록 옆에 펼쳐 놓습니다 —
// 사유를 말줄임 없이 끝까지 읽고, 처리 버튼도 여기에 함께 둡니다.
//
// 걷다가 오탭하는 문제는 노트북에 없으므로, 폰에서 목록 카드에서 버튼을
// 걷어냈던 이유도 여기서는 적용되지 않습니다.
export default function CallDetail({ call, coach, canControl, onUpdateStatus, agoText, nowMs }) {
  if (!call) {
    return (
      <aside className="detail detail-empty">
        <Icon name="bell" size={30} />
        <p>왼쪽에서 호출을 선택하세요</p>
        <span>고른 호출의 사유와 처리 버튼이 여기 나옵니다</span>
      </aside>
    )
  }

  const busy = call.status === 'in_progress'
  const name = teamLabel(call.team)

  return (
    <aside className="detail">
      <div className="detail-head">
        <div className="detail-team">
          <b>팀 {call.team}</b>
          {name && <span className="detail-team-name">{name}</span>}
        </div>
        <span className={`detail-state${busy ? ' busy' : ''}`}>
          {busy
            ? `처리중${call.handledBy ? ` · ${call.handledBy}` : ''}`
            : `${agoText(nowMs - call.createdAt)} 경과`}
        </span>
      </div>

      <dl className="detail-meta">
        <div>
          <dt>담당</dt>
          <dd>{call.assignedLabel}</dd>
        </div>
        <div>
          <dt>접수</dt>
          <dd>{fmtTimeOnly(new Date(call.createdAt))}</dd>
        </div>
        {busy && call.startedAt && (
          <div>
            <dt>처리 시작</dt>
            <dd>{fmtTimeOnly(new Date(call.startedAt))}</dd>
          </div>
        )}
      </dl>

      {/* 폰 목록에서는 한 줄로 잘리는 사유를, 여기서는 끝까지 읽습니다.
          메이트가 무엇을 들고 갈지 정하는 유일한 단서입니다. */}
      <div className={`detail-reason${call.reason ? '' : ' empty'}`}>
        {call.reason || '사유가 작성되지 않았습니다'}
      </div>

      <div className="detail-actions">
        {call.status === 'waiting' ? (
          <button
            type="button"
            className="dock-btn primary"
            onClick={() => onUpdateStatus(call.team, call.id, 'in_progress')}
          >
            <Icon name="bell" size={19} />
            처리 시작
          </button>
        ) : canControl ? (
          <>
            {/* 잘못 누른 '처리 시작'을 되돌립니다. 되돌리지 못하면 그 호출이
                미처리 목록에서 사라지고, 슬랙 미처리 알림도 그 상태만 보므로
                아무 알림 없이 묻힙니다. */}
            <button
              type="button"
              className="dock-btn ghost"
              onClick={() => onUpdateStatus(call.team, call.id, 'waiting', call)}
              title="미처리 상태로 되돌립니다"
            >
              <Icon name="undo" size={19} />
              되돌리기
            </button>
            <button
              type="button"
              className="dock-btn done"
              onClick={() => onUpdateStatus(call.team, call.id, 'done')}
            >
              <Icon name="check" size={19} />
              완료 처리
            </button>
          </>
        ) : (
          <p className="detail-note">
            {call.handledBy || '다른 메이트'}가 처리 중입니다
          </p>
        )}
      </div>
    </aside>
  )
}
