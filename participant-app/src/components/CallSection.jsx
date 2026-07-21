import { useState } from 'react'
import { CALL_LIMIT_PER_TEAM } from '../config.js'
import { now, fmtAgo } from '../lib/time.js'

const STATUS_LABEL = { waiting: '대기중', in_progress: '처리중', done: '완료' }
const STATUS_STEPS = ['waiting', 'in_progress', 'done']

// 캠프지기 호출 — 시간대와 무관하게 항상 노출
// 사유 선택 없이 버튼 → 확인 → 바로 호출.
// 팀 번호 기준 캠프지기 개인별 배정: 우리 팀 번호를 담당하는 캠프지기가 우선 응답
// (config.COACH_ASSIGNMENTS — 아직 팀 번호가 배정되지 않았으면 assignedCoachName은 null)
// 호출 횟수 제한 예외 여부는 참가자가 정하지 않고, 처리하는 관리자가
// 호출 하나하나에 대해 직접 판단해 설정함 (관리자 CallsTab 참고)
export default function CallSection({ callData, callCount, assignedCoachName, onCall }) {
  const [confirming, setConfirming] = useState(false)
  const [sending, setSending] = useState(false)

  const calls = callData?.calls || []
  const active = [...calls].reverse().find((c) => c.status !== 'done') || null
  const lastDone = !active ? [...calls].reverse().find((c) => c.status === 'done') : null
  const remaining = Math.max(0, CALL_LIMIT_PER_TEAM - callCount)
  const limitReached = remaining <= 0

  const send = async () => {
    setSending(true)
    setConfirming(false)
    try {
      await onCall()
    } catch {
      alert('네트워크 오류로 호출이 전송되지 않았습니다.\n잠시 후 다시 시도해주세요.')
    }
    setSending(false)
  }

  return (
    <section className="call-section">
      <div className="card-head-row">
        <h3 className="card-title call-title">🙋 캠프지기 호출</h3>
        <span className={`call-quota${limitReached ? ' quota-over' : ''}`}>
          사용 {callCount}회 / 남은 횟수 {remaining}회
        </span>
      </div>
      <p className="call-company-note">
        {assignedCoachName ? (
          <>
            <b>{assignedCoachName}</b> 캠프지기가 담당합니다. (그분이 바쁘면 다른 캠프지기가 대신 응답할 수 있어요)
          </>
        ) : (
          '담당 캠프지기가 확인 후 응답합니다.'
        )}
      </p>

      {active ? (
        <div className="call-status-box">
          <p className="call-status-reason">
            {fmtAgo(now().getTime() - active.createdAt)} 호출
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
          {active.status === 'waiting' && <p className="call-hint">캠프지기가 곧 확인할 예정입니다.</p>}
          {active.status === 'in_progress' && (
            <p className="call-hint">
              {active.handledBy ? `${active.handledBy} 캠프지기가` : '캠프지기가'} 이동 중입니다 🏃
            </p>
          )}
        </div>
      ) : limitReached ? (
        <div className="call-limit-box">
          <p>
            <b>호출 가능 횟수({CALL_LIMIT_PER_TEAM}회)를 모두 사용했습니다.</b>
          </p>
          <p className="call-hint">더 이상 캠프지기를 호출할 수 없습니다. 급한 문의는 운영 데스크로 와주세요.</p>
          <button className="btn-primary" disabled>
            캠프지기 호출 (횟수 초과)
          </button>
        </div>
      ) : confirming ? (
        <div className="reason-box">
          <p className="call-hint">
            캠프지기를 호출할까요? <b>(남은 횟수 {remaining}회)</b>
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
            🙋 캠프지기 호출하기
          </button>
        </div>
      )}
    </section>
  )
}
