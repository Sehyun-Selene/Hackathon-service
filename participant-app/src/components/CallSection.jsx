import { useState } from 'react'
import { CALL_LIMIT_PER_TEAM, CALL_REASONS } from '../config.js'
import { now, fmtAgo } from '../lib/time.js'

const STATUS_LABEL = { waiting: '대기중', in_progress: '처리중', done: '완료' }
const STATUS_STEPS = ['waiting', 'in_progress', 'done']
const OTHER_REASON = '기타'

// 코치 호출 (PRD 4.3) — 시간대와 무관하게 항상 노출
// 팀 번호 기준 코치 개인별 배정: 우리 팀 번호를 담당하는 코치가 우선 응답
// (config.COACH_ASSIGNMENTS — 아직 팀 번호가 배정되지 않았으면 assignedCoachName은 null)
// 호출 횟수 제한 예외 여부는 참가자가 정하지 않고, 처리하는 관리자가
// 호출 하나하나에 대해 직접 판단해 설정함 (관리자 CallsTab 참고)
export default function CallSection({ callData, callCount, assignedCoachName, onCall }) {
  const [showReasons, setShowReasons] = useState(false)
  const [showOtherInput, setShowOtherInput] = useState(false)
  const [otherText, setOtherText] = useState('')
  const [sending, setSending] = useState(false)

  const calls = callData?.calls || []
  const active = [...calls].reverse().find((c) => c.status !== 'done') || null
  const lastDone = !active ? [...calls].reverse().find((c) => c.status === 'done') : null
  const remaining = Math.max(0, CALL_LIMIT_PER_TEAM - callCount)
  const limitReached = remaining <= 0

  const send = async (reason) => {
    setSending(true)
    setShowReasons(false)
    setShowOtherInput(false)
    try {
      await onCall(reason)
    } catch {
      alert('네트워크 오류로 호출이 전송되지 않았습니다.\n잠시 후 다시 시도해주세요.')
    }
    setSending(false)
  }

  const selectReason = (r) => {
    if (r === OTHER_REASON) {
      setShowOtherInput(true)
      return
    }
    send(r)
  }

  const sendOther = () => {
    const detail = otherText.trim()
    send(detail ? `${OTHER_REASON} - ${detail}` : OTHER_REASON)
    setOtherText('')
  }

  return (
    <section className="call-section">
      <div className="card-head-row">
        <h3 className="card-title">🙋 코치 호출</h3>
        <span className={`call-quota${limitReached ? ' quota-over' : ''}`}>
          사용 {callCount}회 / 남은 횟수 {remaining}회
        </span>
      </div>
      <p className="call-company-note">
        {assignedCoachName ? (
          <>
            <b>{assignedCoachName}</b> 코치가 담당합니다. (그 코치가 바쁘면 다른 코치가 대신 응답할 수 있어요)
          </>
        ) : (
          '담당 코치가 확인 후 응답합니다.'
        )}
      </p>

      {active ? (
        <div className="call-status-box">
          <p className="call-status-reason">
            사유: <b>{active.reason}</b> · {fmtAgo(now().getTime() - active.createdAt)} 호출
            {active.countsTowardLimit === false && (
              <span className="no-limit-tag"> (횟수 미포함)</span>
            )}
          </p>
          <div className="status-steps">
            {STATUS_STEPS.map((s, i) => {
              const currentIdx = STATUS_STEPS.indexOf(active.status)
              return (
                <div key={s} className={`status-step${i <= currentIdx ? ' on' : ''}`}>
                  {STATUS_LABEL[s]}
                </div>
              )
            })}
          </div>
          {active.status === 'waiting' && <p className="call-hint">코치가 곧 확인할 예정입니다.</p>}
          {active.status === 'in_progress' && (
            <p className="call-hint">
              {active.handledBy ? `${active.handledBy} 코치가` : '코치가'} 이동 중입니다 🏃
            </p>
          )}
        </div>
      ) : limitReached ? (
        <div className="call-limit-box">
          <p>
            <b>호출 가능 횟수({CALL_LIMIT_PER_TEAM}회)를 모두 사용했습니다.</b>
          </p>
          <p className="call-hint">더 이상 코치를 호출할 수 없습니다. 급한 문의는 운영 데스크로 와주세요.</p>
          <button className="btn-primary" disabled>
            코치 호출 (횟수 초과)
          </button>
        </div>
      ) : showReasons ? (
        <div className="reason-box">
          <p className="call-hint">호출 사유를 선택해 주세요</p>
          <div className="reason-grid">
            {CALL_REASONS.map((r) => (
              <button
                key={r}
                className={`btn-reason${r === OTHER_REASON && showOtherInput ? ' on' : ''}`}
                disabled={sending}
                onClick={() => selectReason(r)}
              >
                {r}
              </button>
            ))}
          </div>
          {showOtherInput && (
            <div className="other-reason-row">
              <input
                className="setup-input"
                placeholder="어떤 도움이 필요하신지 적어주세요"
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !sending && sendOther()}
                autoFocus
              />
              <button className="btn-primary sm" disabled={sending} onClick={sendOther}>
                전송
              </button>
            </div>
          )}
          <button
            className="btn-ghost"
            onClick={() => {
              setShowReasons(false)
              setShowOtherInput(false)
              setOtherText('')
            }}
          >
            닫기
          </button>
        </div>
      ) : (
        <div>
          {lastDone && (
            <p className="call-hint">
              지난 호출({lastDone.reason})이 완료되었습니다. 필요하면 다시 호출할 수 있어요.
            </p>
          )}
          <button className="btn-call" disabled={sending} onClick={() => setShowReasons(true)}>
            🙋 코치 호출하기
          </button>
        </div>
      )}
    </section>
  )
}
