// =====================================================================
//  호출 기록 구글 시트 아카이빙 (Apps Script 웹앱, 의존성 없음)
//
//  참가자가 남긴 호출 사유를 구글 스프레드시트에 한 줄씩 쌓습니다.
//  서버의 저장소(Redis)는 행사가 끝나면 초기화되므로, 남는 기록은 여기뿐
//  입니다. "어떤 팀이 무엇을 물었는가"가 행사 뒤 회고의 재료입니다.
//
//  ── 왜 Apps Script 인가 ──────────────────────────────────────────
//  구글 시트 API를 직접 쓰려면 서비스 계정 · JWT 서명 · 토큰 갱신이 필요하고
//  그만큼 npm 패키지가 붙습니다. 이 서버는 의존성 없이 도는 것이 원칙이라
//  (슬랙도 Incoming Webhook 한 줄로 끝냈습니다), 시트에 붙은 Apps Script를
//  웹앱으로 배포해 그 주소로 JSON 한 번 POST 하는 방식을 씁니다.
//  스크립트 본문과 설치 절차는 sheets-archive.gs 에 있습니다.
//
//  ── 보내는 시점 ────────────────────────────────────────────────
//    호출 생성 → 한 줄 추가 (사유·담당·팀 정보)
//    완료 처리 → 같은 줄을 찾아 완료 시각·처리자만 채움
//  같은 호출 ID로 두 번 보내면 스크립트가 덮어씁니다(upsert). 그래서 재시도가
//  중복 줄을 만들지 않고, 놓친 줄은 다시 보내면 메워집니다.
//
//  ── 실패해도 호출은 성공합니다 ──────────────────────────────────
//  아카이빙은 곁다리입니다. 시트가 죽어도 참가자의 호출은 그대로 들어가고
//  담당 메이트 알림도 그대로 갑니다. 그래서 모든 전송은 응답을 보낸 뒤에,
//  실패는 기록만 남기고 삼킵니다.
//
//  환경변수 (없으면 아카이빙만 꺼진 채로 서버가 정상 동작):
//    SHEETS_WEBHOOK_URL   Apps Script 웹앱 배포 주소
//                         (https://script.google.com/macros/s/…/exec)
//    SHEETS_TOKEN         스크립트와 맞춰 둔 임의의 암호. 주소를 알아낸
//                         제3자가 시트에 줄을 넣지 못하게 막습니다.
// =====================================================================

const WEBHOOK_URL = process.env.SHEETS_WEBHOOK_URL || ''
const TOKEN = process.env.SHEETS_TOKEN || ''

const enabled = Boolean(WEBHOOK_URL)

// 상태는 /health 에 그대로 실립니다 — 행사 당일 "쌓이고 있나"를 눈으로
// 확인할 수 있어야 합니다.
const state = { sent: 0, failed: 0, lastOk: null, lastError: null }

// ISO 대신 한국 시각 문자열로 보냅니다. 시트에서 그대로 읽히는 편이,
// 여는 사람마다 시간대가 달라 어긋나는 것보다 낫습니다.
function kst(ms) {
  if (!ms) return ''
  const d = new Date(ms + 9 * 60 * 60 * 1000)
  const p = (n) => String(n).padStart(2, '0')
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
  )
}

// 호출 한 건 → 시트 한 줄.
//
// 팀명·소속은 서버가 모릅니다(그건 앱 config에 있습니다). 참가자 앱이 호출을
// 보낼 때 함께 실어 보내며, 없으면 빈 칸으로 둡니다 — 팀 번호만 있어도
// 나중에 명단과 맞출 수 있습니다.
//
// 소속(affiliation)은 계열사 이름입니다. 개인 지원자끼리 꾸린 팀은 회사가
// 여럿이라 '계열사 혼합', 계열사가 아닌 곳은 '외부사/관계사' 로 들어옵니다.
//
// 처리 시작·완료 시각과 상태는 보내지 않습니다. 메이트가 그 자리에서 처리하고
// 끝나는 일이라 기록으로 남길 값이 아니고, 회고에 쓰는 건 "무엇을 물었나"
// (사유)와 "누가 갔나"(처리자)입니다. 리그도 뺐습니다 — 호출은 필드리그만
// 씁니다.
//
// id 는 시트에 숨은 칸으로 들어갑니다. 완료 처리 때 같은 줄을 찾아 처리자를
// 채우는 열쇠라서, 화면에서 감출 뿐 지울 수는 없습니다.
function toRow(call) {
  return {
    id: String(call.id || ''),
    createdAt: kst(call.createdAt),
    teamId: String(call.team || ''),
    teamName: String(call.teamName || ''),
    affiliation: String(call.affiliation || ''),
    reason: String(call.reason || ''),
    assignedName: String(call.assignedName || ''),
    handledBy: String(call.handledBy || ''),
  }
}

async function send(row) {
  if (!enabled) return false
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, row }),
      // Apps Script 웹앱은 /exec 에서 302 로 한 번 튕깁니다 — fetch 가
      // 기본으로 따라가므로 따로 처리하지 않습니다.
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) throw new Error(`sheets ${res.status}`)
    const body = await res.json().catch(() => ({}))
    if (body && body.ok === false) throw new Error(body.error || 'sheets rejected')
    state.sent += 1
    state.lastOk = new Date().toISOString()
    state.lastError = null
    return true
  } catch (err) {
    state.failed += 1
    state.lastError = String(err.message || err)
    console.error('[sheets] 기록 실패:', state.lastError)
    return false
  }
}

// 호출 한 건을 시트에 반영합니다(추가 또는 갱신).
// 호출 성공 여부와 무관하게 절대 throw 하지 않습니다.
async function archiveCall(call) {
  if (!enabled || !call || !call.id) return false
  return send(toRow(call))
}

module.exports = {
  enabled,
  state,
  archiveCall,
  // 테스트용
  _toRow: toRow,
  _kst: kst,
}
