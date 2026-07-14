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
//    team:{team_id}          팀 정보(계열사, 인원수, 알러지)  — 참가자 등록
//    team-roster             등록된 팀 id 목록 (관리자 열거용)
//    order:{team_id}         해당 팀의 전체 주문 내역
//    call:{team_id}          해당 팀의 호출 목록(현재 상태 + 이력)
//    call-count:{team_id}    해당 팀의 누적 호출 횟수
//    coach-roster            등록된 코치 목록 [{id, name, company}]
//    soldout                 품절 메뉴 map { menuId: true } (관리자만 씀)
// =====================================================================
import { API_BASE_URL } from '../config.js'

const LOCAL_PREFIX = 'hackathon-torder:'

function parseLocal(raw) {
  if (raw == null) return null
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

async function apiGetMany(keys) {
  const res = await fetch(`${API_BASE_URL}/api/get`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keys }),
  })
  if (!res.ok) throw new Error('공유 서버 조회 실패')
  return res.json()
}

async function apiSet(key, value) {
  const res = await fetch(`${API_BASE_URL}/api/set`, {
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

// ---- 키 빌더 ----
export const teamKey = (teamId) => `team:${teamId}`
export const orderKey = (teamId) => `order:${teamId}`
export const callKey = (teamId) => `call:${teamId}`
export const callCountKey = (teamId) => `call-count:${teamId}`
export const TEAM_ROSTER_KEY = 'team-roster'
export const COACH_ROSTER_KEY = 'coach-roster'
export const SOLDOUT_KEY = 'soldout'

// ---- 팀 번호 정규화: "5", "05", "005" → "05" (100 이상은 "105") ----
export function normalizeTeam(raw) {
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n) || n <= 0) return null
  return String(n).padStart(2, '0')
}
