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
//    coach-roster            등록된 마스터 메이트 목록 [{id, name}]
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

// 메뉴별 남은 수량. 서버가 모든 팀의 주문을 합쳐 계산합니다 —
// 이 기기가 남의 주문을 볼 수 없으니 직접 셀 수 없습니다.
// 공유 서버가 없는 로컬 모드에서는 상한을 적용하지 않습니다(빈 값).
export async function fetchStock() {
  if (!API_BASE_URL) return { remaining: {}, sold: {}, stock: {} }
  try {
    return await apiPost('/api/stock', {})
  } catch (err) {
    if (err.code === 'endpoint-missing') return { remaining: {}, sold: {}, stock: {} }
    throw err
  }
}

// 주문 저장 — 준비 수량을 넘기면 서버가 거절합니다(err.code === 'stock').
// 화면에서도 닫아두지만, 마지막 한 판을 두 팀이 동시에 담는 순간은
// 서버만 가릴 수 있습니다.
export async function orderSave(teamId, meals) {
  return apiPost('/api/order-save', { teamId, meals })
}

// 팀 등록 — 팀 목록에 내 번호를 원자적으로 추가
export async function rosterAddTeam(teamId) {
  if (!API_BASE_URL) {
    const roster = (await storageGet(TEAM_ROSTER_KEY)) || { ids: [] }
    if (!roster.ids.includes(teamId)) {
      roster.ids.push(teamId)
      await storageSet(TEAM_ROSTER_KEY, roster)
    }
    return { ok: true }
  }
  try {
    return await apiPost('/api/roster-add', { teamId })
  } catch (err) {
    if (err.code !== 'endpoint-missing') throw err
    const roster = (await storageGet(TEAM_ROSTER_KEY)) || { ids: [] }
    if (!roster.ids.includes(teamId)) {
      roster.ids.push(teamId)
      await storageSet(TEAM_ROSTER_KEY, roster)
    }
    return { ok: true, legacy: true }
  }
}

// 호출 추가 — 제한 검사·호출 추가·횟수 증가를 서버에서 한 번에.
// 제한을 넘겼으면 err.code === 'limit' 으로 던집니다.
export async function callAdd(teamId, call) {
  if (!API_BASE_URL) {
    const current = (await storageGet(callKey(teamId))) || { team: teamId, calls: [] }
    current.calls = [...(current.calls || []), call]
    await storageSet(callKey(teamId), current)
    const count = (await storageGet(callCountKey(teamId))) || 0
    await storageSet(callCountKey(teamId), (typeof count === 'number' ? count : 0) + 1)
    return { ok: true }
  }
  try {
    return await apiPost('/api/call-add', { teamId, call })
  } catch (err) {
    if (err.code !== 'endpoint-missing') throw err
    const current = (await storageGet(callKey(teamId))) || { team: teamId, calls: [] }
    current.calls = [...(current.calls || []), call]
    await storageSet(callKey(teamId), current)
    const count = (await storageGet(callCountKey(teamId))) || 0
    await storageSet(callCountKey(teamId), (typeof count === 'number' ? count : 0) + 1)
    return { ok: true, legacy: true }
  }
}

// ---- 키 빌더 ----
export const teamKey = (teamId) => `team:${teamId}`
export const orderKey = (teamId) => `order:${teamId}`
export const callKey = (teamId) => `call:${teamId}`
export const callCountKey = (teamId) => `call-count:${teamId}`
export const TEAM_ROSTER_KEY = 'team-roster'
export const COACH_ROSTER_KEY = 'coach-roster'
export const SOLDOUT_KEY = 'soldout'
// 관리자가 누른 '주문해주세요' 재촉 표시 { at, mealId }
export const NUDGE_KEY = 'nudge'

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
