// =====================================================================
//  슬랙 호출 알림 (Incoming Webhook, 의존성 없음)
//
//  마스터 메이트 호출을 슬랙 채널로 보냅니다. 관리자 페이지를 켜두지
//  않아도 담당 메이트 폰에 알림이 도착하게 하는 것이 목적입니다.
//
//  ── 알림 단계 ──────────────────────────────────────────────────
//    호출 즉시    담당 메이트만 멘션 (그 사람 폰만 울림)
//    N분 미처리   @channel 로 채널 공개 (여유 있는 메이트가 주워감)
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
//    ALERT_UNCLAIMED_MIN   채널 공개 전환 시간(분). 기본 15
//    ALERT_LEAD_MIN        운영 총괄 알림 시간(분). 기본 25
//    ALERT_LEAD_REPEAT_MIN 운영 총괄 재알림 간격(분). 기본 10
//    ALERT_IN_PROGRESS_MIN 처리 시작 후 장기 미완료 경고 시간(분). 기본 20
//    ALERT_UNCLAIMED_MENTION  미처리 알림의 호출 방식. 기본 'channel'
//                          'channel' → @channel (슬랙을 닫아둔 사람도 푸시 받음)
//                          'here'    → @here   (슬랙에 '활동 중'인 사람만)
//                          'none'    → 멘션 없음 (채널을 보고 있어야 알아챔)
//                          ※ 메이트가 슬랙 채팅방을 상주하지 않고 관리자
//                            페이지를 보는 구조라면 'channel' 이 맞습니다.
//                            @here 는 활동 상태에 의존해 놓칠 수 있습니다.
// =====================================================================

const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || ''
const LEAD_USER_ID = process.env.SLACK_LEAD_USER_ID || ''
const num = (name, fallback) => {
  const n = parseInt(process.env[name] || '', 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}
// 기본 15분 — 메이트가 한 팀에 머무는 시간이 15분이라, 그보다 짧게 잡으면
// 다른 팀 멘토링 중인 담당자를 정상 상황에서도 계속 재촉하게 됩니다.
const UNCLAIMED_MIN = num('ALERT_UNCLAIMED_MIN', 15)
const LEAD_MIN = num('ALERT_LEAD_MIN', 25)
const LEAD_REPEAT_MIN = num('ALERT_LEAD_REPEAT_MIN', 10)
const IN_PROGRESS_MIN = num('ALERT_IN_PROGRESS_MIN', 20)
// 미처리 알림은 특정 담당자를 지목하지 않으므로 멘션이 없으면 아무 폰도
// 울리지 않고 채널에 글만 쌓입니다. 그래서 기본값을 @channel 로 둡니다.
// (@here 는 슬랙에 '활동 중'인 사람만 받아서, 슬랙을 닫아둔 메이트는 놓칩니다)
const MENTION_TAGS = { channel: '<!channel>', here: '<!here>', none: '' }
const UNCLAIMED_MENTION = (() => {
  const raw = (process.env.ALERT_UNCLAIMED_MENTION || '').trim().toLowerCase()
  if (raw in MENTION_TAGS) return raw
  // 이전 설정(ALERT_UNCLAIMED_HERE=0)을 쓰던 배포와의 호환
  const legacyOff = ['0', 'false', 'no'].includes(
    (process.env.ALERT_UNCLAIMED_HERE || '').trim().toLowerCase(),
  )
  return legacyOff ? 'none' : 'channel'
})()

const enabled = Boolean(WEBHOOK_URL)
const MIN = 60 * 1000

// 마지막 전송 상태 — /health 로 점검
const state = {
  enabled,
  unclaimedMin: UNCLAIMED_MIN,
  leadMin: LEAD_MIN,
  inProgressMin: IN_PROGRESS_MIN,
  unclaimedMention: UNCLAIMED_MENTION,
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
// 멘션과 이름을 함께 씁니다. 멘션만 두면, 그 ID가 이 채널에서 풀리지 않을 때
// (외부 연계 채널에 다른 워크스페이스 사람이 들어온 경우 등) 누구 담당인지
// 읽을 수 없는 알림이 됩니다. 이름을 붙여두면 최악의 경우에도 사람은 알아봅니다.
function mateLabel(call) {
  const name = call.assignedName ? escapeMrkdwn(call.assignedName) : ''
  if (call.assignedSlackId) {
    return name ? `<@${call.assignedSlackId}> (${name})` : `<@${call.assignedSlackId}>`
  }
  if (name) return `${name} 메이트`
  return null
}

// 참가자가 작성한 사유가 <!channel> 같은 Slack 제어 문법으로 해석되지 않게
// 막습니다. 일반 텍스트의 줄바꿈과 한글은 그대로 유지됩니다.
function escapeMrkdwn(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function quote(reason) {
  const text = escapeMrkdwn(reason).trim()
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
  const name = call.assignedName
    ? ` (담당 ${escapeMrkdwn(call.assignedName)} 메이트 응답 없음)`
    : ''
  // 슬랙 알림을 실제로 보내려면 '<!channel>' / '<!here>' 형식이어야 합니다.
  // 리터럴 '@channel' 은 글자로만 표시되고 아무에게도 알림이 가지 않습니다.
  const tag = MENTION_TAGS[UNCLAIMED_MENTION]
  const mention = tag ? `${tag} ` : ''
  return (
    `⏳ ${mention}*팀 ${call.team}* ${waitedMin}분째 미처리 — 여유 있는 분이 받아주세요${name}\n` +
    `${quote(call.reason)}`
  )
}

function leadDigestText(stuck) {
  const mention = LEAD_USER_ID ? `<@${LEAD_USER_ID}> ` : ''
  const lines = stuck
    .sort((a, b) => a.waitedMin - b.waitedMin)
    .reverse()
    .map((s) => {
      const name = s.call.assignedName
        ? `담당 ${escapeMrkdwn(s.call.assignedName)}`
        : '담당 미배정'
      const phase = s.phase === 'in_progress' ? '처리 시작 후' : '대기'
      return `• 팀 ${s.call.team} — ${phase} ${s.waitedMin}분 (${name})`
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

// 미등록·미주문 팀 재촉 — 관리자가 직접 누를 때만 나갑니다.
// 참가자 폰으로는 푸시를 보낼 수 없어(iOS 웹 푸시는 홈 화면 추가가 필요),
// 찾아갈 수 있는 메이트에게 보냅니다.
function _digestText({ kind, label, teams }) {
  const head =
    kind === 'orders'
      ? `⏰ *${label} 미주문 ${teams.length}팀*`
      : `📝 *팀 등록을 아직 안 한 ${teams.length}팀*`
  const tail =
    kind === 'orders'
      ? '담당 구간의 팀에 들러 주문을 도와주세요.'
      : '담당 구간의 팀에 들러 QR 등록을 도와주세요.'
  return `<!channel> ${head}
팀 ${teams.join(', ')}
${tail}`
}

async function notifyDigest(payload) {
  return post(_digestText(payload))
}

module.exports = {
  enabled,
  state,
  notifyDigest,
  _digestText,
  UNCLAIMED_MENTION,
  UNCLAIMED_MIN,
  LEAD_MIN,
  LEAD_REPEAT_MIN,
  IN_PROGRESS_MIN,
  MIN,
  notifyNewCall,
  notifyUnclaimed,
  notifyLead,
  // 테스트용으로 문구 생성기도 노출
  _text: { newCallText, unclaimedText, leadDigestText },
}
