// =====================================================================
//  슬랙 호출 알림 (Incoming Webhook, 의존성 없음)
//
//  마스터 메이트 호출을 슬랙 채널로 보냅니다. 관리자 페이지를 켜두지
//  않아도 담당 메이트 폰에 알림이 도착하게 하는 것이 목적입니다.
//
//  ── 알림 단계 ──────────────────────────────────────────────────
//    호출 즉시    담당 메이트만 멘션 (그 사람 폰만 울림)
//    N분 미처리   채널에 공개 (멘션 없음 — 여유 있는 메이트가 주워감)
//    M분 미처리   운영 총괄에게 묶음 알림, 이후 반복 간격마다 갱신
//    처리 시작·완료는 보내지 않습니다 (관리자 화면에서 확인).
//
//  ※ Incoming Webhook은 보낸 메시지의 식별자를 돌려주지 않아 스레드
//    답글·이모지 반응·버튼을 쓸 수 없습니다. 그건 봇 토큰이 필요한
//    기능이라, 지금은 채널 메시지만 사용합니다.
//
//  환경변수 (모두 없으면 알림 기능 자체가 꺼진 상태로 서버가 동작):
//    SLACK_WEBHOOK_URL     슬랙에서 발급받은 Incoming Webhook 주소
//    SLACK_LEAD_USER_ID    운영 총괄의 슬랙 멤버 ID (예: U01ABCDEF)
//    ALERT_UNCLAIMED_MIN   채널 공개 전환 시간(분). 기본 5
//    ALERT_LEAD_MIN        운영 총괄 알림 시간(분). 기본 10
//    ALERT_LEAD_REPEAT_MIN 운영 총괄 재알림 간격(분). 기본 10
// =====================================================================

const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || ''
const LEAD_USER_ID = process.env.SLACK_LEAD_USER_ID || ''
const num = (name, fallback) => {
  const n = parseInt(process.env[name] || '', 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}
const UNCLAIMED_MIN = num('ALERT_UNCLAIMED_MIN', 5)
const LEAD_MIN = num('ALERT_LEAD_MIN', 10)
const LEAD_REPEAT_MIN = num('ALERT_LEAD_REPEAT_MIN', 10)

const enabled = Boolean(WEBHOOK_URL)
const MIN = 60 * 1000

// 마지막 전송 상태 — /health 로 점검
const state = {
  enabled,
  unclaimedMin: UNCLAIMED_MIN,
  leadMin: LEAD_MIN,
  sent: 0,
  lastOk: null,
  lastError: null,
}

// ---- 전송 -----------------------------------------------------------
async function post(text) {
  if (!enabled) return false
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) throw new Error(`slack ${res.status}`)
    state.sent += 1
    state.lastOk = new Date().toISOString()
    state.lastError = null
    return true
  } catch (err) {
    state.lastError = String(err.message || err)
    console.error('[slack] 전송 실패:', state.lastError)
    return false
  }
}

// ---- 문구 만들기 ----------------------------------------------------
// 참가자 앱이 호출을 만들 때 담당자 정보를 함께 넣어줍니다
// (config.COACH_ASSIGNMENTS 는 앱 쪽에만 있으므로 서버는 값만 받아 씀).
function mateLabel(call) {
  if (call.assignedSlackId) return `<@${call.assignedSlackId}>`
  if (call.assignedName) return `${call.assignedName} 메이트`
  return null
}

function quote(reason) {
  const text = (reason || '').trim()
  if (!text) return '> _사유 미작성_'
  // 줄바꿈이 있어도 인용 블록이 유지되도록 각 줄에 > 를 붙입니다
  return text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')
}

function newCallText(call) {
  const who = mateLabel(call)
  const head = who
    ? `🔔 *팀 ${call.team}* 호출  ·  담당 ${who}`
    : `🔔 *팀 ${call.team}* 호출  ·  담당 미배정 — 여유 있는 분이 받아주세요`
  return `${head}\n${quote(call.reason)}`
}

function unclaimedText(call, waitedMin) {
  const name = call.assignedName ? ` (담당 ${call.assignedName} 메이트 응답 없음)` : ''
  return (
    `⏳ *팀 ${call.team}* ${waitedMin}분째 미처리 — 여유 있는 분이 받아주세요${name}\n` +
    `${quote(call.reason)}`
  )
}

function leadDigestText(stuck) {
  const mention = LEAD_USER_ID ? `<@${LEAD_USER_ID}> ` : ''
  const lines = stuck
    .sort((a, b) => a.waitedMin - b.waitedMin)
    .reverse()
    .map((s) => {
      const name = s.call.assignedName ? `담당 ${s.call.assignedName}` : '담당 미배정'
      return `• 팀 ${s.call.team} — ${s.waitedMin}분 경과 (${name})`
    })
  return `🚨 ${mention}장시간 미처리 호출 ${stuck.length}건\n${lines.join('\n')}`
}

// ---- 공개 API -------------------------------------------------------
// 새 호출 알림 (즉시). 이미 보낸 호출은 markers 로 걸러집니다.
async function notifyNewCall(call) {
  return post(newCallText(call))
}

// 미처리 전환 알림 (멘션 없음)
async function notifyUnclaimed(call, waitedMin) {
  return post(unclaimedText(call, waitedMin))
}

// 운영 총괄 묶음 알림
async function notifyLead(stuck) {
  return post(leadDigestText(stuck))
}

module.exports = {
  enabled,
  state,
  UNCLAIMED_MIN,
  LEAD_MIN,
  LEAD_REPEAT_MIN,
  MIN,
  notifyNewCall,
  notifyUnclaimed,
  notifyLead,
  // 테스트용으로 문구 생성기도 노출
  _text: { newCallText, unclaimedText, leadDigestText },
}
