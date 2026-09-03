import { useState } from 'react'
import { CALL_LIMIT_PER_TEAM } from '../config.js'
import { now, fmtAgo, fmtClock, fmtTimeOnly } from '../lib/time.js'

const STATUS_LABEL = { waiting: '대기중', in_progress: '처리중', done: '완료' }
const STATUS_STEPS = ['waiting', 'in_progress', 'done']

const REASON_PLACEHOLDER = '예) 문제가 A라고 봐서 B를 했고, 결과가 C일줄 알았는데 D가 됐어요.'
const REASON_MAX = 300

// 마스터 메이트 호출 — 시간대와 무관하게 항상 노출
// 버튼 → 호출 사유 작성(필수) → 호출. 사유는 관리자 앱 호출 알림에 함께 표시됨.
// 팀 번호 기준 마스터 메이트 개인별 배정: 우리 팀 번호를 담당하는 마스터 메이트가 우선 응답
// (config.COACH_ASSIGNMENTS — 아직 팀 번호가 배정되지 않았으면 assignedCoachName은 null)
// 호출 횟수 제한 예외 여부는 참가자가 정하지 않고, 처리하는 관리자가
// 호출 하나하나에 대해 직접 판단해 설정함 (관리자 CallsTab 참고)
export default function CallSection({ callData, callCount, assignedCoachName, onCall }) {
  const [confirming, setConfirming] = useState(false)
  const [sending, setSending] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState(false)

  const calls = callData?.calls || []
  const active = [...calls].reverse().find((c) => c.status !== 'done') || null
  const lastDone = !active ? [...calls].reverse().find((c) => c.status === 'done') : null
  // 지난 호출 내역 — 진행 중인 호출은 위 상태 박스에 이미 자세히 나오므로 뺍니다.
  // 팀원이 번갈아 보더라도 무엇을 이미 물어봤는지 알 수 있어야 합니다.
  const past = [...calls].reverse().filter((c) => c !== active)
  const remaining = Math.max(0, CALL_LIMIT_PER_TEAM - callCount)
  const limitReached = remaining <= 0

  const send = async () => {
    const text = reason.trim()
    if (!text) {
      setReasonError(true)
      return
    }
    setSending(true)
    setReasonError(false)
    setConfirming(false)
    try {
      await onCall(text)
      setReason('')
    } catch (err) {
      // 제한은 서버가 최종 판단합니다 — 다른 기기에서 이미 다 썼을 수 있음
      if (err?.code === 'limit') {
        alert(`호출 가능 횟수(${CALL_LIMIT_PER_TEAM}회)를 모두 사용했습니다.`)
      } else {
        alert('네트워크 오류로 호출이 전송되지 않았습니다.\n잠시 후 다시 시도해주세요.')
        setConfirming(true)
      }
    }
    setSending(false)
  }

  return (
    <section className="call-section">
      <div className="card-head-row">
        <h3 className="card-title call-title">🙋 마스터 메이트 호출</h3>
        <span className={`call-quota${limitReached ? ' quota-over' : ''}`}>
          사용 {callCount}회 / 남은 횟수 {remaining}회
        </span>
      </div>
      <p className="call-company-note">
        {assignedCoachName ? (
          <>
            <b>{assignedCoachName}</b> 마스터 메이트가 담당합니다. (그분이 바쁘면 다른 마스터 메이트가 대신 응답할 수 있어요)
          </>
        ) : (
          '담당 마스터 메이트가 확인 후 응답합니다.'
        )}
      </p>

      {/* 호출 가이드 — 호출 버튼보다 먼저 읽도록 상단 고정 노출 */}
      <div className="call-guide">
        <b className="call-guide-title">📌 호출 전에 꼭 읽어보세요!</b>
        <ul className="call-guide-list">
          <li>간단한 문제는 우리 팀의 플레이 메이트의 도움을 먼저 받아보세요!</li>
          <li>마스터 메이트가 머무는 시간은 팀당 15분입니다!</li>
          <li>
            시간 내 효과적인 멘토링을 위해 아래 문장을 작성하시고, 불러주세요!
            <span className="call-guide-quote">
              “문제가 A라고 봐서 B를 했고, 결과가 C일줄 알았는데 D가 됐어요.”
            </span>
          </li>
          <li>다른 팀 멘토링을 하고 있는 경우, 대기시간이 발생할 수 있습니다.</li>
          {/* 횟수는 서버가 최종 판단합니다 — 다 쓰면 버튼 자체가 눌리지 않습니다 */}
          <li>
            호출은 팀당 <b>{CALL_LIMIT_PER_TEAM}회</b>까지 가능하며, 모두 사용하면 호출
            버튼이 비활성화됩니다.
          </li>
        </ul>
      </div>

      {active ? (
        <div className="call-status-box">
          <p className="call-status-reason">{fmtAgo(now().getTime() - active.createdAt)} 호출</p>
          {active.reason && <p className="call-sent-reason">“{active.reason}”</p>}
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
          {active.status === 'waiting' && <p className="call-hint">마스터 메이트가 곧 확인할 예정입니다.</p>}
          {active.status === 'in_progress' && (
            <p className="call-hint">
              {active.handledBy ? `${active.handledBy} 마스터 메이트가` : '마스터 메이트가'} 이동 중입니다 🏃
            </p>
          )}
        </div>
      ) : limitReached ? (
        <div className="call-limit-box">
          <p>
            <b>호출 가능 횟수({CALL_LIMIT_PER_TEAM}회)를 모두 사용했습니다.</b>
          </p>
          <p className="call-hint">더 이상 마스터 메이트를 호출할 수 없습니다.</p>
          <button className="btn-primary" disabled>
            마스터 메이트 호출 (횟수 초과)
          </button>
        </div>
      ) : confirming ? (
        <div className="reason-box">
          <label className="reason-label" htmlFor="call-reason">
            무엇이 막혔는지 적어주세요 <span className="reason-required">필수</span>
          </label>
          <p className="reason-help">마스터 메이트가 미리 보고 옵니다.</p>
          <textarea
            id="call-reason"
            className={`reason-input${reasonError ? ' has-error' : ''}`}
            value={reason}
            maxLength={REASON_MAX}
            rows={4}
            placeholder={REASON_PLACEHOLDER}
            disabled={sending}
            onChange={(e) => {
              setReason(e.target.value)
              if (reasonError) setReasonError(false)
            }}
          />
          <div className="reason-meta">
            {reasonError && <span className="reason-err-text">호출 사유를 작성해주세요.</span>}
            <span className="reason-count">
              {reason.length}/{REASON_MAX}
            </span>
          </div>
          <p className="call-hint">
            마스터 메이트를 호출할까요? <b>(남은 횟수 {remaining}회)</b>
          </p>
          <div className="confirm-call-row">
            <button className="btn-call" disabled={sending} onClick={send}>
              🙋 호출하기
            </button>
            <button className="btn-ghost" disabled={sending} onClick={() => setConfirming(false)}>
              취소
            </button>
          </div>
        </div>
      ) : (
        <div>
          {lastDone && (
            <p className="call-hint">
              지난 호출이 완료되었습니다. 필요하면 다시 호출할 수 있어요.
            </p>
          )}
          <button className="btn-call" disabled={sending} onClick={() => setConfirming(true)}>
            🙋 마스터 메이트 호출하기
          </button>
        </div>
      )}

      {/* 우리 팀 지난 호출 내역 — 길어질 수 있어 접어둡니다 */}
      {past.length > 0 && (
        <details className="call-log">
          <summary className="call-log-summary">
            🗂 우리 팀 지난 호출 내역 ({past.length}건)
          </summary>
          <ul className="call-log-list">
            {past.map((c, i) => (
              <li className="call-log-item" key={c.id || i}>
                <div className="call-log-head">
                  <span className="call-log-time">{fmtClock(c.createdAt)} 호출</span>
                  <span className={`call-log-status st-${c.status}`}>
                    {STATUS_LABEL[c.status] || c.status}
                  </span>
                  {c.handledBy && <span className="call-log-who">{c.handledBy}</span>}
                  {c.doneAt && (
                    <span className="call-log-done">{fmtTimeOnly(c.doneAt)} 완료</span>
                  )}
                </div>
                {c.reason && <p className="call-log-reason">“{c.reason}”</p>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
