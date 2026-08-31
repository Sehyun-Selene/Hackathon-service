// =====================================================================
//  공유 데이터 저장소 어댑터 (PRD 3.3)
//
//  참가자 앱과 관리자 앱은 "오직 이 저장소를 통해서만" 데이터를 주고받음.
//
//  - API_BASE_URL이 설정된 경우: shared-api/(작은 공유 KV 서버)를 호출.
//    ⚠️ 서버 통신 실패 시 조용히 localStorage로 폴백하지 않고 에러를
//    던집니다 — 폴백하면 "저장된 척"하지만 다른 기기에는 안 보이는
//    가짜 성공이 되기 때문. 호출하는 쪽에서 잡아서 사용자에게 알립니다.
//  - API_BASE_URL이 비어 있으면: localStorage (이 브라우저 안에서만
//    유효 — 로컬 개발/시연용).
//
//  키 설계 (PRD 3.3 — 팀별 키 분리로 동시 쓰기 충돌 최소화):
//    team:{team_id}          팀 정보(계열사, 인원수, 알레르기)  — 참가자 등록
//    team-roster             등록된 팀 id 목록 (관리자 열거용)
//    order:{team_id}         해당 팀의 전체 주문 내역
//    call:{team_id}          해당 팀의 호출 목록(현재 상태 + 이력)
//    call-count:{team_id}    해당 팀의 누적 호출 횟수
//    coach-roster            등록된 마스터 메이트 목록 [{id, name, company}]
//    soldout                 품절 메뉴 map { menuId: true } (관리자만 씀)
// =====================================================================
import { API_BASE_URL } from '../config.js'

const LOCAL_PREFIX = 'hackathon-torder:'
const REQUEST_TIMEOUT_MS = 8000

async function fetchWithTimeout(url, options) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    window.clearTimeout(timer)
  }
}

function parseLocal(raw) {
  if (raw == null) return null
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

async function apiGetMany(keys) {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/get`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keys }),
  })
  if (!res.ok) throw new Error('공유 서버 조회 실패')
  return res.json()
}

async function apiSet(key, value) {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/set`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  })
  if (!res.ok) throw new Error('공유 서버 저장 실패')
}

// 아래 함수들은 API 모드에서 통신 실패 시 throw 합니다.
// 읽기(폴링)는 App에서 잡아 "연결 오류" 배너로, 쓰기(주문/호출)는
// 버튼 핸들러에서 잡아 실패 알림으로 표시하세요.
export async function storageGet(key) {
  if (API_BASE_URL) {
    const result = await apiGetMany([key])
    return result[key] ?? null
  }
  return parseLocal(window.localStorage.getItem(LOCAL_PREFIX + key))
}

export async function storageSet(key, value) {
  if (API_BASE_URL) {
    await apiSet(key, value)
    return true
  }
  window.localStorage.setItem(LOCAL_PREFIX + key, JSON.stringify(value))
  return true
}

export async function storageGetMany(keys) {
  if (API_BASE_URL) {
    const result = await apiGetMany(keys)
    return keys.map((k) => result[k] ?? null)
  }
  return keys.map((k) => parseLocal(window.localStorage.getItem(LOCAL_PREFIX + k)))
}


// ---------------------------------------------------------------
//  원자적 동작 (서버가 읽고-고쳐-쓴다)
//
//  공유 목록(team-roster, coach-roster, call:*)을 앱에서 읽고 고쳐 쓰면,
//  두 명이 같은 순간에 하면 나중 쓰기가 앞 쓰기를 지웁니다. 서버는 단일
//  스레드라 서버 안에서 처리하면 이 경쟁이 사라집니다.
//
//  배포 시차(앱이 먼저 갱신되고 서버가 아직 구버전) 대비로, 엔드포인트가
//  없으면(404) 예전 방식으로 물러납니다. 서버까지 갱신되면 자동으로
//  원자적 경로를 씁니다.
// ---------------------------------------------------------------
async function apiPost(path, body) {
  const res = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.status === 404) {
    const err = new Error('구버전 서버')
    err.code = 'endpoint-missing'
    throw err
  }
  let data = {}
  try {
    data = await res.json()
  } catch {
    /* 본문 없음 */
  }
  if (!res.ok) {
    const err = new Error(data.error || '요청 실패')
    err.code = data.error || 'failed'
    err.data = data
    throw err
  }
  return data
}

// 관리자 화면 전체를 한 응답으로 받습니다. 새 API가 아직 배포되지 않은 짧은
// 시차에는 null을 반환해 아래의 기존 다중 조회 방식으로 안전하게 물러납니다.
export async function adminSnapshot() {
  if (!API_BASE_URL) return null
  try {
    return await apiPost('/api/snapshot', {})
  } catch (err) {
    if (err.code === 'endpoint-missing') return null
    throw err
  }
}

// 마스터 메이트 입장 — 목록을 원자적으로 갱신 (40명이 같은 시각에 입장해도
// 서로를 지우지 않게)
export async function coachUpsert(id, name, crewId) {
  if (!API_BASE_URL) {
    const roster = (await storageGet(COACH_ROSTER_KEY)) || { coaches: [] }
    const others = (roster.coaches || []).filter((c) => c.id !== id)
    await storageSet(COACH_ROSTER_KEY, { coaches: [...others, { id, name, crewId }] })
    return { ok: true }
  }
  try {
    return await apiPost('/api/coach-upsert', { id, name, crewId })
  } catch (err) {
    if (err.code !== 'endpoint-missing') throw err
    const roster = (await storageGet(COACH_ROSTER_KEY)) || { coaches: [] }
    const others = (roster.coaches || []).filter((c) => c.id !== id)
    await storageSet(COACH_ROSTER_KEY, { coaches: [...others, { id, name, crewId }] })
    return { ok: true, legacy: true }
  }
}

// 호출 상태 변경 — 그 호출 하나만 서버에서 고칩니다. 목록 전체를 덮어쓰지
// 않으므로 같은 순간에 참가자가 새 호출을 넣어도 서로 지워지지 않습니다.
// 이미 사라진 호출이면 err.code === 'call not found'.
export async function callStatusSet(teamId, callId, status, coach) {
  const expectedStatus = status === 'in_progress' ? 'waiting' : 'in_progress'
  const payload = {
    teamId,
    callId,
    status,
    expectedStatus,
    handledBy: coach?.name || '',
    handledById: coach?.id || '',
  }
  if (!API_BASE_URL) {
    const data = (await storageGet(callKey(teamId))) || { team: teamId, calls: [] }
    const call = (data.calls || []).find((c) => c.id === callId)
    if (!call) return { ok: false }
    call.status = status
    if (status === 'in_progress') {
      call.handledBy = payload.handledBy
      call.handledById = payload.handledById
      call.startedAt = Date.now()
    }
    if (status === 'done') {
      call.handledBy = call.handledBy || payload.handledBy
      call.handledById = call.handledById || payload.handledById
      call.doneAt = Date.now()
    }
    await storageSet(callKey(teamId), data)
    return { ok: true }
  }
  try {
    return await apiPost('/api/call-status', payload)
  } catch (err) {
    if (err.code !== 'endpoint-missing') throw err
    const data = (await storageGet(callKey(teamId))) || { team: teamId, calls: [] }
    const call = (data.calls || []).find((c) => c.id === callId)
    if (!call) return { ok: false }
    call.status = status
    if (status === 'in_progress') {
      call.handledBy = payload.handledBy
      call.handledById = payload.handledById
      call.startedAt = Date.now()
    }
    if (status === 'done') {
      call.handledBy = call.handledBy || payload.handledBy
      call.handledById = call.handledById || payload.handledById
      call.doneAt = Date.now()
    }
    await storageSet(callKey(teamId), data)
    return { ok: true, legacy: true }
  }
}

// 품절·배부 표시 — 객체 안 필드 하나만 원자적으로 켜고 끕니다.
// 두 메이트가 같은 순간에 다른 메뉴/끼니를 건드려도 서로를 지우지 않습니다.
export async function flagSet(key, field, value) {
  const local = async () => {
    const current = (await storageGet(key)) || {}
    if (value) current[field] = true
    else delete current[field]
    await storageSet(key, current)
    return { ok: true }
  }
  if (!API_BASE_URL) return local()
  try {
    return await apiPost('/api/flag-set', { key, field, value: !!value })
  } catch (err) {
    if (err.code !== 'endpoint-missing') throw err
    return { ...(await local()), legacy: true }
  }
}

// 이 호출을 내가 잡았는가 — 신원 단위는 이름입니다 (담당 팀 연결도 이름 기준).
// 기기 id는 같은 사람이 폰과 노트북을 함께 쓰면 갈라지므로, 이름을 먼저 보고
// 이름이 비어 있는 옛 기록만 기기 id로 보완합니다.
export function isHandledByMe(call, coach) {
  if (!call || !coach) return false
  if (call.handledBy && coach.name) return call.handledBy === coach.name
  return !!call.handledById && call.handledById === coach.id
}

// 미등록·미주문 팀을 슬랙으로 재촉합니다.
//
// 참가자 폰에는 푸시를 보낼 수 없어(iOS 웹 푸시는 홈 화면 추가 필요), 실제로
// 찾아갈 수 있는 메이트에게 보냅니다. 목록은 서버가 자기 데이터로 계산하므로
// 앱이 임의 문장을 채널에 뿌릴 수는 없습니다.
// 쿨다운 중이면 err.code === 'cooldown' (err.data.retryAfterSec).
export async function notifyMissing({ kind, totalTeams, mealId, label }) {
  if (!API_BASE_URL) return { ok: false, sent: false, teams: 0 }
  return apiPost('/api/notify-missing', { kind, totalTeams, mealId, label })
}

// 참가자 화면에 '주문해주세요' 배너를 띄웁니다.
// 페이지를 열어둔 팀에만 보입니다 — 웹은 닫힌 페이지에 닿을 수 없습니다.
// 쿨다운 중이면 err.code === 'cooldown'.
export async function nudgeParticipants(mealId) {
  if (!API_BASE_URL) return { ok: false }
  return apiPost('/api/nudge', { mealId })
}

// ---- 키 빌더 ----
export const teamKey = (teamId) => `team:${teamId}`
export const orderKey = (teamId) => `order:${teamId}`
export const callKey = (teamId) => `call:${teamId}`
export const callCountKey = (teamId) => `call-count:${teamId}`
export const TEAM_ROSTER_KEY = 'team-roster'
export const COACH_ROSTER_KEY = 'coach-roster'
export const SOLDOUT_KEY = 'soldout'

// ---- 팀 번호 정규화: "5", "05", "005" → "05" (100 이상은 "105") ----
// ---- 팀 번호 정규화 ----
// 리그 접두어를 붙여 'E-03' 형태로 맞춥니다. 접두어가 없으면 두 리그의 같은
// 숫자가 한 팀으로 섞이기 때문에, 리그를 모르면 만들지 않고 null을 냅니다.
//   normalizeTeam('3', 'E')     → 'E-03'
//   normalizeTeam('E-3')        → 'E-03'
//   normalizeTeam('e104')       → 'E-104'   (세 자리는 그대로)
export function normalizeTeam(raw, prefix) {
  const text = String(raw ?? '').trim().toUpperCase()
  const m = text.match(/^([EG])?[^0-9]*([0-9]{1,3})$/)
  if (!m) return null
  const p = (m[1] || String(prefix || '').toUpperCase()).trim()
  if (p !== 'E' && p !== 'G') return null
  const n = parseInt(m[2], 10)
  if (!Number.isFinite(n) || n <= 0) return null
  return p + '-' + String(n).padStart(2, '0')
}
