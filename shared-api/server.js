// =====================================================================
//  해커톤 주문/호출 서비스 — 공유 KV API (의존성 없음, 순수 Node http)
//
//  참가자 앱과 관리자 앱이 서로 다른 배포 URL(다른 origin)에 있어도
//  이 서버 하나를 통해 PRD 3.3의 키(order:*, call:*, coach-location:* 등)를
//  주고받습니다.
//
//  ── 데이터 보존 ────────────────────────────────────────────────
//  메모리(Map)를 1차 저장소로 쓰되, Upstash Redis(REST) 환경변수가
//  설정돼 있으면 쓰기마다 원격에도 함께 기록하고 부팅 시 되읽어옵니다.
//  Render 무료 티어는 (1) 무요청 15분 슬립 (2) 재시작/재배포 시
//  프로세스가 새로 뜨고 (3) 영구 디스크가 없어서, 메모리에만 두면
//  행사 중 주문·호출 데이터가 통째로 사라질 수 있기 때문입니다.
//
//  환경변수를 비워두면 예전처럼 메모리 전용으로 동작합니다(로컬 개발용).
//    UPSTASH_REDIS_REST_URL    예) https://xxx-12345.upstash.io
//    UPSTASH_REDIS_REST_TOKEN  Upstash 콘솔의 REST TOKEN
//    ADMIN_TOKEN               /api/reset 보호용 (없으면 reset 비활성)
//
//  ※ 슬립 자체는 코드로 못 막습니다. 외부 크론(cron-job.org 등)이
//    10분 간격으로 /health 를 찔러주도록 등록하세요. README 참고.
//
//  ── 슬랙 호출 알림 ────────────────────────────────────────────
//  SLACK_WEBHOOK_URL 이 설정돼 있으면 마스터 메이트 호출을 슬랙으로
//  보냅니다 (담당자 멘션 → 미처리 시 채널 공개 → 장시간 미처리 시
//  운영 총괄 묶음 알림). 상세는 slack.js 참고. 미설정 시 알림만 꺼지고
//  나머지 기능은 그대로 동작합니다.
//
//  ── 왜 원자적 엔드포인트가 필요한가 ───────────────────────────
//  /api/set 은 값을 통째로 덮어씁니다. 그래서 클라이언트가
//  "읽고 → 고치고 → 쓰는" 방식으로 공유 목록(team-roster, call:*)을
//  수정하면, 두 명이 같은 순간에 하면 나중 쓰기가 앞 쓰기를 지웁니다
//  (분실 갱신). 135팀이 동시에 등록하거나, 참가자가 호출을 추가하는
//  순간 메이트가 다른 호출을 완료하면 실제로 발생합니다.
//
//  이 서버는 단일 스레드라, 읽기-수정-쓰기를 서버 안에서 하면
//  경쟁이 원천적으로 사라집니다. 그래서 목록을 건드리는 동작은
//  아래 전용 엔드포인트로 처리합니다.
//
//  엔드포인트:
//    POST /api/get    body: { keys: string[] }        → { key: value, ... }
//    POST /api/snapshot                                → 관리자 전체 화면 1회 조회
//    POST /api/set    body: { key: string, value: * } → { ok: true }
//    POST /api/roster-add    body: { teamId }              → 팀 목록에 원자적 추가
//    POST /api/coach-upsert  body: { id, name }            → 메이트 목록 원자적 갱신
//    POST /api/call-add      body: { teamId, call }        → 제한검사+호출추가+횟수증가
//    POST /api/call-status   body: { teamId, callId, ... } → 호출 하나만 원자적 변경
//    POST /api/flag-set      body: { key, field, value }   → 품절·배부 표시 원자적 변경
//    POST /api/nudge         body: { mealId }              → 참가자 화면 재촉 배너
//    POST /api/notify-missing body: { kind, leagues, mealId, label }
//                                                          → 미등록·미주문 팀을 슬랙에 재촉
//    POST /api/reset  body: { token: string }         → 전체 삭제(행사 전 초기화용)
//    GET  /health                                     → 상태 확인용(크론 대상)
// =====================================================================
const http = require('http')
const zlib = require('zlib')
const slack = require('./slack.js')

const store = new Map()
const PORT = process.env.PORT || 3001

// ---- 원격 영속 저장 (Upstash Redis REST) --------------------------
// REST 방식이라 npm 패키지 없이 fetch 만으로 씁니다 (Node 18+ 내장).
// 모든 키를 해시 하나(REDIS_HASH)에 담아두면 부팅 시 HGETALL 한 번으로
// 전체 복원이 됩니다.
const REDIS_URL = (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '')
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || ''
const REDIS_HASH = process.env.REDIS_HASH || 'torder'
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || ''
// 팀 번호는 자리배치의 테이블 번호를 그대로 씁니다 — 'E-45'(필드) / 'G-12'(개발).
// 접두어가 없으면 두 리그의 같은 숫자가 한 팀으로 섞입니다.
// 앱 config.LEAGUES와 같은 값이어야 하며, 바꿀 때는 환경변수로 함께 조정하세요.
//   예) TEAM_LEAGUES="E:206,G:31"  (외부사 자리가 E-200번대라 상한이 206)
const TEAM_LEAGUES = (process.env.TEAM_LEAGUES || 'E:206,G:31')
  .split(',')
  .map((part) => {
    const [prefix, count] = part.split(':')
    return { prefix: String(prefix || '').trim().toUpperCase(), count: Number(count) || 0 }
  })
  .filter((l) => /^[A-Z]$/.test(l.prefix) && l.count > 0)
const TEAM_COUNT_BY_PREFIX = Object.fromEntries(TEAM_LEAGUES.map((l) => [l.prefix, l.count]))
const COACH_ACTIVE_TTL_MS = Number(process.env.COACH_ACTIVE_TTL_MS || 2 * 60 * 1000)
// 팀당 호출 제한. 화면에서만 막으면 두 기기로 열어두면 넘길 수 있어
// 서버가 최종 판단합니다. 앱 config의 CALL_LIMIT_PER_TEAM과 같은 값이어야
// 하며, 바꿀 때는 환경변수로 함께 조정하세요.
const CALL_LIMIT_PER_TEAM = Number(process.env.CALL_LIMIT_PER_TEAM || 5)
// 재촉 알림 도배 방지 — 종류별로 이 간격 안에는 다시 보내지 않습니다
const NOTIFY_COOLDOWN_MS = Number(process.env.NOTIFY_COOLDOWN_SEC || 120) * 1000
const notifyMarks = {}
const persistOn = Boolean(REDIS_URL && REDIS_TOKEN)

// 마지막 영속화 상태 — /health 로 확인해 행사 전에 정상 동작을 점검합니다.
let persistState = persistOn
  ? { mode: 'redis', ready: false, lastOk: null, lastError: null }
  : { mode: 'memory', ready: true }
let persistReady = !persistOn
let restoreRetryMs = 2000
const persistPending = new Map()
let persistWaiters = []
let persistFlushTimer = null
let persistFlushing = false

// Upstash REST: 명령을 JSON 배열로 POST (예: ["HSET","torder","key","{...}"])
async function redisCommand(command, timeoutMs = 4000) {
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`upstash ${res.status}`)
  const body = await res.json()
  if (body.error) throw new Error(body.error)
  return body.result
}

// 부팅 복원: 원격에 있던 키를 전부 메모리로 되읽음.
// 실패하면 빈 데이터를 서비스하지 않고 준비중(503) 상태에서 자동 재시도합니다.
async function restoreFromRedis() {
  if (!persistOn) {
    console.log('[persist] 메모리 전용 모드 (UPSTASH 환경변수 없음)')
    return true
  }
  try {
    // HGETALL 결과는 [field1, value1, field2, value2, ...] 형태
    const flat = (await redisCommand(['HGETALL', REDIS_HASH], 10000)) || []
    const restored = new Map()
    for (let i = 0; i < flat.length; i += 2) {
      try {
        restored.set(flat[i], JSON.parse(flat[i + 1]))
      } catch {
        // 개별 키가 깨져 있어도 나머지는 살립니다
      }
    }
    // 복원이 성공한 뒤에만 현재 메모리를 교체합니다. 실패 중 빈 저장소를
    // 서비스하면 모든 주문이 사라진 것처럼 보이고 새 값이 원본을 덮을 수 있습니다.
    store.clear()
    for (const [key, value] of restored) store.set(key, value)
    persistReady = true
    persistState.ready = true
    persistState.lastOk = new Date().toISOString()
    persistState.lastError = null
    restoreRetryMs = 2000
    console.log(`[persist] 복원 완료 — ${store.size}개 키`)
    return true
  } catch (err) {
    persistReady = false
    persistState.ready = false
    persistState.lastError = String(err.message || err)
    console.error('[persist] 복원 실패 — 준비되지 않은 상태로 재시도합니다:', persistState.lastError)
    return false
  }
}

function scheduleRestoreRetry() {
  if (!persistOn || persistReady) return
  const delay = restoreRetryMs
  restoreRetryMs = Math.min(30_000, restoreRetryMs * 2)
  setTimeout(async () => {
    const ok = await restoreFromRedis()
    if (!ok) scheduleRestoreRetry()
  }, delay)
}

// 쓰기 반영. 원격 기록이 실패하면 화면에 성공으로 보이지 않도록 503을 반환하고,
// 같은 요청을 안전하게 다시 보낼 수 있게 각 전용 동작을 멱등적으로 유지합니다.
async function persistKey(key, value) {
  return persistEntries([[key, value]])
}

// 여러 필드를 Redis HSET 한 명령으로 기록합니다. call 목록과 횟수처럼 반드시
// 같이 살아야 하는 값이 한쪽만 저장되는 일을 막습니다. 짧은 시간에 몰린 쓰기는
// 최신 값으로 합쳐 전송해, 오래된 요청의 Redis 응답이 나중에 도착해 최신 목록을
// 되돌리는 문제와 135팀 동시 등록 시 원격 요청 폭증을 함께 막습니다.
function persistEntries(entries) {
  if (!persistOn) return true
  entries.forEach(([key, value]) => persistPending.set(key, value))
  const result = new Promise((resolve) => persistWaiters.push(resolve))
  schedulePersistFlush()
  return result
}

function schedulePersistFlush(delay = 12) {
  if (persistFlushing || persistFlushTimer) return
  persistFlushTimer = setTimeout(flushPersistBatch, delay)
}

async function flushPersistBatch() {
  persistFlushTimer = null
  if (persistFlushing || persistPending.size === 0) return
  persistFlushing = true
  const entries = [...persistPending.entries()]
  const waiters = persistWaiters
  persistPending.clear()
  persistWaiters = []
  let ok = false
  try {
    const command = ['HSET', REDIS_HASH]
    entries.forEach(([key, value]) => command.push(key, JSON.stringify(value)))
    await redisCommand(command)
    persistState.lastOk = new Date().toISOString()
    persistState.lastError = null
    ok = true
  } catch (err) {
    persistState.lastError = String(err.message || err)
    console.error(`[persist] 저장 실패 (${entries.map(([key]) => key).join(', ')}):`, persistState.lastError)
  } finally {
    waiters.forEach((resolve) => resolve(ok))
    persistFlushing = false
    if (persistPending.size > 0) schedulePersistFlush(0)
  }
}

function sendWriteResult(res, body, persisted) {
  if (!persisted) {
    sendJson(res, 503, { error: 'persistence unavailable', retryable: true })
    return false
  }
  sendJson(res, 200, { ...body, persisted: true })
  return true
}

function validTeamId(teamId) {
  if (typeof teamId !== 'string') return false
  const m = teamId.match(/^([A-Z])-(\d{2,3})$/)
  if (!m) return false
  const max = TEAM_COUNT_BY_PREFIX[m[1]]
  if (!max) return false
  const n = Number(m[2])
  // 0 채움까지 일치해야 같은 팀이 두 키로 갈라지지 않습니다 ('E-5' vs 'E-05')
  return Number.isInteger(n) && n >= 1 && n <= max && m[2] === String(n).padStart(2, '0')
}


// ---- 슬랙 알림 발송 이력 ------------------------------------------
// 같은 호출에 같은 알림을 두 번 보내지 않도록 발송 시각을 남깁니다.
// 원격 저장소에 함께 보관해 서버가 재시작돼도 중복 발송되지 않습니다.
const ALERT_STATE_KEY = 'alert-state'
const SWEEP_MS = 30 * 1000

function alertMarkers() {
  const v = store.get(ALERT_STATE_KEY)
  return v && typeof v === 'object' ? v : {}
}

async function saveAlertMarkers(markers) {
  store.set(ALERT_STATE_KEY, markers)
  await persistKey(ALERT_STATE_KEY, markers)
}

// 저장된 모든 call:* 키에서 호출을 펼쳐 팀 번호를 붙여 돌려줍니다.
function allCalls() {
  const out = []
  for (const [key, value] of store) {
    if (!key.startsWith('call:')) continue
    const team = key.slice('call:'.length)
    for (const call of value?.calls || []) out.push({ ...call, team })
  }
  return out
}

// 새로 생긴 호출을 즉시 알림 (참가자가 호출한 그 순간 호출됨).
// 요청 응답을 붙잡지 않도록 호출부에서 await 하지 않습니다.
async function alertNewCalls(newCalls) {
  if (!slack.enabled || !newCalls.length) return
  const markers = alertMarkers()
  for (const call of newCalls) {
    if (markers[call.id]?.new) continue
    const ok = await slack.notifyNewCall(call)
    if (ok) markers[call.id] = { ...(markers[call.id] || {}), new: Date.now() }
  }
  await saveAlertMarkers(markers)
}

// 주기적으로 미처리 호출을 훑어 단계별 알림을 보냅니다.
// 시간 기준으로만 판단하므로 재시작 후에도 상태가 그대로 이어집니다.
async function sweepAlerts() {
  if (!slack.enabled) return
  const now = Date.now()
  const markers = alertMarkers()
  let changed = false

  const waiting = allCalls().filter((c) => c.status === 'waiting' && c.createdAt)
  const stuck = []

  for (const call of waiting) {
    const waitedMin = Math.floor((now - call.createdAt) / slack.MIN)
    const m = markers[call.id] || {}

    // ① 아직 아무 알림도 못 보낸 호출 (전송 실패했거나 서버가 자던 사이 생성)
    if (!m.new) {
      if (await slack.notifyNewCall(call)) {
        markers[call.id] = { ...m, new: now }
        changed = true
      }
      continue
    }

    // ② 미처리 전환 — 채널 공개 (멘션 없음)
    if (!m.unclaimed && waitedMin >= slack.UNCLAIMED_MIN) {
      if (await slack.notifyUnclaimed(call, waitedMin)) {
        markers[call.id] = { ...markers[call.id], unclaimed: now }
        changed = true
      }
    }

    // ③ 장시간 미처리 — 운영 총괄 묶음 알림 대상으로 모음
    if (waitedMin >= slack.LEAD_MIN) stuck.push({ call, waitedMin, phase: 'waiting' })
  }

  // 처리 시작을 눌러둔 채 현장에서 완료를 잊은 호출도 총관리자에게 알립니다.
  // 대기 호출과 달리 담당자가 이미 붙었으므로 개인/채널 재알림은 하지 않습니다.
  const inProgress = allCalls().filter((c) => c.status === 'in_progress' && c.startedAt)
  for (const call of inProgress) {
    const handledMin = Math.floor((now - call.startedAt) / slack.MIN)
    if (handledMin >= slack.IN_PROGRESS_MIN) {
      stuck.push({ call, waitedMin: handledMin, phase: 'in_progress' })
    }
  }

  // 묶음 알림은 호출마다 보내지 않고 한 번에. 반복 간격이 지나면 갱신.
  if (stuck.length) {
    const lastLead = markers.__lead?.at || 0
    if (now - lastLead >= slack.LEAD_REPEAT_MIN * slack.MIN) {
      if (await slack.notifyLead(stuck)) {
        markers.__lead = { at: now }
        changed = true
      }
    }
  }

  // 완료된 호출의 마커는 정리 (무한히 쌓이지 않게)
  const liveIds = new Set(allCalls().filter((c) => c.status !== 'done').map((c) => c.id))
  for (const id of Object.keys(markers)) {
    if (id === '__lead') continue
    if (!liveIds.has(id)) {
      delete markers[id]
      changed = true
    }
  }

  if (changed) await saveAlertMarkers(markers)
}

// 응답 압축 기준 크기. 이보다 작으면 압축 이득이 없어 그냥 보냅니다.
const GZIP_MIN_BYTES = 1024

// 관리자 화면은 3초마다 전 팀의 주문·호출을 통째로 받아갑니다. 135팀이 꽉
// 차면 한 번에 258KB, 메이트 40명이면 초당 3.4MB — 무료 인스턴스가 감당하기
// 어렵고 대역폭도 빠르게 소진됩니다. 반복이 많은 JSON이라 gzip이 97% 줄여줍니다.
function sendJson(res, status, body) {
  const json = JSON.stringify(body)
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
  const raw = Buffer.from(json)
  // res.gzipOk: 요청 헤더에서 미리 판단해 둔 값 (요청 객체를 여기까지 넘기지
  // 않으려고 응답 객체에 실어둡니다)
  if (!res.gzipOk || raw.length < GZIP_MIN_BYTES) {
    res.writeHead(status, headers)
    res.end(raw)
    return
  }
  zlib.gzip(raw, (err, packed) => {
    if (err) {
      res.writeHead(status, headers)
      res.end(raw)
      return
    }
    res.writeHead(status, { ...headers, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' })
    res.end(packed)
  })
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 1_000_000) req.destroy() // 과도한 페이로드 방지
    })
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        reject(new Error('invalid json'))
      }
    })
    req.on('error', reject)
  })
}

const server = http.createServer(async (req, res) => {
  // 클라이언트가 gzip을 받을 수 있는지 (브라우저는 기본으로 보냅니다)
  const acceptEnc = String(req.headers['accept-encoding'] || '').toLowerCase()
  res.gzipOk = acceptEnc.includes('gzip')

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {})
    return
  }

  const url = new URL(req.url, `http://${req.headers.host}`)

  // 크론이 주기적으로 찌르는 엔드포인트 — 슬립 방지 겸 상태 점검
  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, persistReady ? 200 : 503, {
      ok: persistReady,
      ready: persistReady,
      keys: store.size,
      persist: persistState,
      slack: slack.state,
    })
    return
  }

  // Redis 복원이 실패한 동안 빈 데이터로 읽고 쓰지 않습니다. 복구가 끝나면
  // 별도 재배포 없이 자동으로 요청을 받습니다.
  if (!persistReady) {
    sendJson(res, 503, { error: 'service restoring', retryable: true })
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/get') {
    try {
      const { keys } = await readBody(req)
      const result = {}
      ;(Array.isArray(keys) ? keys : []).forEach((k) => {
        result[k] = store.has(k) ? store.get(k) : null
      })
      sendJson(res, 200, result)
    } catch {
      sendJson(res, 400, { error: 'invalid request' })
    }
    return
  }

  // 관리자 한 화면에 필요한 데이터를 한 응답으로 묶습니다. 기존 화면은 한 번
  // 갱신할 때 7개 요청을 보내 40명 접속 시 요청 수가 크게 불어났습니다.
  if (req.method === 'POST' && url.pathname === '/api/snapshot') {
    const roster = store.get('team-roster') || { ids: [] }
    const ids = Array.isArray(roster.ids) ? roster.ids.filter(validTeamId) : []
    const result = { teams: {}, orders: {}, calls: {}, counts: {}, delivered: {} }
    ids.forEach((id) => {
      const team = store.get(`team:${id}`)
      const order = store.get(`order:${id}`)
      const call = store.get(`call:${id}`)
      const count = store.get(`call-count:${id}`)
      const delivered = store.get(`delivered:${id}`)
      if (team) result.teams[id] = team
      if (order) result.orders[id] = order
      if (call) result.calls[id] = call
      result.counts[id] = typeof count === 'number' ? count : 0
      if (delivered) result.delivered[id] = delivered
    })
    const coachRoster = store.get('coach-roster') || { coaches: [] }
    const timestamp = Date.now()
    result.soldout = store.get('soldout') || {}
    result.coaches = (Array.isArray(coachRoster.coaches) ? coachRoster.coaches : []).filter(
      (coach) => !coach?.lastSeen || timestamp - coach.lastSeen <= COACH_ACTIVE_TTL_MS,
    )
    result.at = timestamp
    sendJson(res, 200, result)
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/set') {
    try {
      const { key, value } = await readBody(req)
      if (!key || typeof key !== 'string') {
        sendJson(res, 400, { error: 'key required' })
        return
      }
      // 호출 키라면 저장 전 값과 비교해 '새로 추가된 호출'을 찾아냅니다
      // (관리자의 상태 변경 쓰기와 구분하기 위해 id 기준으로 비교).
      let freshCalls = []
      if (slack.enabled && key.startsWith('call:')) {
        const before = new Set((store.get(key)?.calls || []).map((c) => c.id))
        const team = key.slice('call:'.length)
        freshCalls = (value?.calls || [])
          .filter((c) => c && !before.has(c.id))
          .map((c) => ({ ...c, team }))
      }

      store.set(key, value)
      const persisted = await persistKey(key, value)
      const sent = sendWriteResult(res, { ok: true }, persisted)

      // 알림은 응답을 보낸 뒤 뒤에서 처리 — 참가자 화면이 기다리지 않게
      if (sent && freshCalls.length) alertNewCalls(freshCalls).catch(() => {})
    } catch {
      sendJson(res, 400, { error: 'invalid request' })
    }
    return
  }

  // ---- 원자적 목록 조작 ------------------------------------------
  // 아래 네 개는 모두 "서버 안에서 읽고 고쳐 쓴다"는 점이 핵심입니다.
  // Node 단일 스레드라 이 블록 실행 중에 다른 요청이 끼어들 수 없고,
  // 따라서 동시에 들어와도 서로의 변경을 지우지 않습니다.

  // 팀 등록: team-roster.ids 에 팀 번호를 중복 없이 추가
  if (req.method === 'POST' && url.pathname === '/api/roster-add') {
    try {
      const { teamId } = await readBody(req)
      if (!validTeamId(teamId)) {
        sendJson(res, 400, { error: 'valid teamId required' })
        return
      }
      const current = store.get('team-roster')
      const ids = Array.isArray(current?.ids) ? [...current.ids] : []
      if (!ids.includes(teamId)) ids.push(teamId)
      const next = { ids }
      store.set('team-roster', next)
      const persisted = await persistKey('team-roster', next)
      sendWriteResult(res, { ok: true, count: ids.length }, persisted)
    } catch {
      sendJson(res, 400, { error: 'invalid request' })
    }
    return
  }

  // 마스터 메이트 입장: coach-roster.coaches 를 id 기준으로 갱신
  if (req.method === 'POST' && url.pathname === '/api/coach-upsert') {
    try {
      const { id, name, crewId } = await readBody(req)
      if (!id || typeof id !== 'string') {
        sendJson(res, 400, { error: 'id required' })
        return
      }
      const current = store.get('coach-roster')
      const list = Array.isArray(current?.coaches) ? current.coaches : []
      const others = list.filter((c) => c && c.id !== id)
      const safeName = String(name || '').trim().slice(0, 40)
      if (!safeName) {
        sendJson(res, 400, { error: 'name required' })
        return
      }
      // crewId는 설정 파일의 명단 항목 id입니다. 이름이 같은 사람이 있어
      // 이름만으로는 담당 팀을 가릴 수 없어 함께 저장합니다.
      const safeCrewId = /^[a-z0-9-]{1,20}$/.test(String(crewId || '')) ? String(crewId) : ''
      const next = {
        coaches: [...others, { id, name: safeName, crewId: safeCrewId, lastSeen: Date.now() }],
      }
      store.set('coach-roster', next)
      const persisted = await persistKey('coach-roster', next)
      sendWriteResult(res, { ok: true, count: next.coaches.length }, persisted)
    } catch {
      sendJson(res, 400, { error: 'invalid request' })
    }
    return
  }

  // 호출 추가: 제한 검사 → 호출 추가 → 횟수 증가를 한 번에.
  // 예전에는 앱이 call:*, call-count:* 를 따로 썼는데, 둘째 쓰기가 실패하면
  // "전송 실패"라고 안내하면서 실제로는 호출이 들어가 중복이 생겼습니다.
  if (req.method === 'POST' && url.pathname === '/api/call-add') {
    try {
      const { teamId, call } = await readBody(req)
      if (!validTeamId(teamId) || !call || typeof call !== 'object') {
        sendJson(res, 400, { error: 'teamId and call required' })
        return
      }
      const reason = String(call.reason || '').trim()
      if (!reason || reason.length > 300 || typeof call.id !== 'string' || call.id.length > 100) {
        sendJson(res, 400, { error: 'valid call id and reason required' })
        return
      }
      const callKey = `call:${teamId}`
      const countKey = `call-count:${teamId}`
      const rawCount = store.get(countKey)
      const count = typeof rawCount === 'number' ? rawCount : 0
      const current = store.get(callKey)
      const calls = Array.isArray(current?.calls) ? [...current.calls] : []
      // 중복 검사를 제한 검사보다 먼저 — 마지막 호출이 성공한 뒤 네트워크
      // 재시도가 오면, 제한을 먼저 보면 "횟수 초과"라고 답해 참가자가
      // 호출이 안 갔다고 오해합니다. 이미 들어온 호출이면 성공으로 답합니다.
      if (call.id && calls.some((c) => c && c.id === call.id)) {
        const existing = calls.find((c) => c && c.id === call.id)
        const persisted = await persistEntries([
          [callKey, { team: teamId, calls }],
          [countKey, count],
        ])
        const sent = sendWriteResult(res, { ok: true, duplicate: true, count }, persisted)
        if (sent && existing) alertNewCalls([{ ...existing, team: teamId }]).catch(() => {})
        return
      }
      if (count >= CALL_LIMIT_PER_TEAM) {
        sendJson(res, 409, { error: 'limit', count, limit: CALL_LIMIT_PER_TEAM })
        return
      }
      const record = {
        id: call.id,
        reason,
        assignedName: String(call.assignedName || '').slice(0, 40),
        assignedSlackId: /^[UW][A-Z0-9]+$/.test(String(call.assignedSlackId || ''))
          ? String(call.assignedSlackId)
          : '',
        status: 'waiting',
        createdAt: Date.now(),
      }
      calls.push(record)
      const nextCalls = { team: teamId, calls }
      const nextCount = count + 1
      store.set(callKey, nextCalls)
      store.set(countKey, nextCount)
      const persisted = await persistEntries([
        [callKey, nextCalls],
        [countKey, nextCount],
      ])
      const sent = sendWriteResult(res, { ok: true, count: nextCount }, persisted)
      // 알림은 응답 뒤에 (참가자 화면이 기다리지 않게)
      if (sent) alertNewCalls([{ ...record, team: teamId }]).catch(() => {})
    } catch {
      sendJson(res, 400, { error: 'invalid request' })
    }
    return
  }

  // 호출 상태 변경: 그 호출 하나만 고칩니다. 목록 전체를 덮어쓰지 않으므로
  // 같은 순간에 참가자가 새 호출을 추가해도 서로를 지우지 않습니다.
  if (req.method === 'POST' && url.pathname === '/api/call-status') {
    try {
      const { teamId, callId, status, handledBy, handledById, expectedStatus } = await readBody(req)
      const allowed = ['waiting', 'in_progress', 'done']
      if (!validTeamId(teamId) || !callId || !allowed.includes(status)) {
        sendJson(res, 400, { error: 'teamId, callId, status required' })
        return
      }
      const key = `call:${teamId}`
      const current = store.get(key)
      const calls = Array.isArray(current?.calls) ? current.calls : []
      const index = calls.findIndex((c) => c && c.id === callId)
      if (index < 0) {
        sendJson(res, 404, { error: 'call not found' })
        return
      }
      const currentStatus = calls[index].status
      const requiredStatus = status === 'in_progress' ? 'waiting' : 'in_progress'
      if ((expectedStatus && currentStatus !== expectedStatus) || currentStatus !== requiredStatus) {
        sendJson(res, 409, { error: 'status conflict', current: calls[index] })
        return
      }
      const stamp = Date.now()
      const call = { ...calls[index], status }
      if (status === 'waiting') {
        // 잘못 누른 '처리 시작'을 되돌리는 경우 — 담당자 흔적을 지워 아무도
        // 잡지 않은 상태로 되돌립니다 (남아 있으면 처리중으로 보임)
        delete call.handledBy
        delete call.handledById
        delete call.startedAt
      }
      if (status === 'in_progress') {
        call.handledBy = handledBy || call.handledBy || ''
        call.handledById = handledById || call.handledById || ''
        call.startedAt = stamp
      }
      if (status === 'done') {
        call.handledBy = call.handledBy || handledBy || ''
        call.handledById = call.handledById || handledById || ''
        call.doneAt = stamp
      }
      const nextCalls = [...calls]
      nextCalls[index] = call
      const next = { team: teamId, calls: nextCalls }
      store.set(key, next)
      const persisted = await persistKey(key, next)
      sendWriteResult(res, { ok: true, call }, persisted)
    } catch {
      sendJson(res, 400, { error: 'invalid request' })
    }
    return
  }

  // 품절 / 배부 완료 표시: 객체 안의 필드 하나만 켜고 끕니다.
  // 두 메이트가 같은 순간에 서로 다른 메뉴를 품절 처리하거나, 같은 팀의
  // 다른 끼니를 배부 완료하면, 앱에서 통째로 쓰던 방식은 한쪽이 사라졌습니다.
  if (req.method === 'POST' && url.pathname === '/api/flag-set') {
    try {
      const { key, field, value } = await readBody(req)
      const allowed = key === 'soldout' || (typeof key === 'string' && key.startsWith('delivered:'))
      if (!allowed || !field || typeof field !== 'string') {
        sendJson(res, 400, { error: 'key and field required' })
        return
      }
      const current = store.get(key)
      const next = current && typeof current === 'object' && !Array.isArray(current)
        ? { ...current }
        : {}
      if (value) next[field] = true
      else delete next[field]
      store.set(key, next)
      const persisted = await persistKey(key, next)
      sendWriteResult(res, { ok: true, value: next }, persisted)
    } catch {
      sendJson(res, 400, { error: 'invalid request' })
    }
    return
  }

  // 참가자 화면 재촉 — 관리자가 누르면 '주문해주세요' 배너가 뜹니다.
  //
  // 페이지를 열어둔 팀에만 보입니다(웹은 닫힌 페이지에 닿을 수 없음).
  // 팀별로 따로 보내지 않고 하나의 표시만 남기고, 아직 주문하지 않은 팀의
  // 화면에서만 배너가 뜨도록 판단은 참가자 앱이 합니다.
  if (req.method === 'POST' && url.pathname === '/api/nudge') {
    try {
      const body = await readBody(req)
      const mealId = typeof body.mealId === 'string' ? body.mealId.slice(0, 40) : ''
      const now = Date.now()
      const last = notifyMarks.nudge || 0
      const waitMs = NOTIFY_COOLDOWN_MS - (now - last)
      if (waitMs > 0) {
        sendJson(res, 429, { error: 'cooldown', retryAfterSec: Math.ceil(waitMs / 1000) })
        return
      }
      const value = { at: now, mealId }
      store.set('nudge', value)
      notifyMarks.nudge = now
      const persisted = await persistKey('nudge', value)
      sendJson(res, 200, { ok: true, at: now, persisted })
    } catch {
      sendJson(res, 400, { error: 'invalid request' })
    }
    return
  }

  // 미등록·미주문 팀 재촉을 슬랙으로.
  //
  // 참가자 폰에는 푸시를 보낼 수 없습니다(iOS 웹 푸시는 홈 화면 추가가 필요해
  // 135팀에게 시킬 수 없음). 그래서 '찾아갈 수 있는 사람'인 메이트에게 보냅니다.
  //
  // 목록은 **서버가 자기 데이터로 직접 계산**합니다. 앱이 보낸 문장을 그대로
  // 뿌리면 채널에 아무 내용이나 보낼 수 있는 통로가 되기 때문입니다.
  // 끼니 이름만 앱에서 받고, 멘션 문자를 지운 뒤 길이를 제한해서 씁니다.
  if (req.method === 'POST' && url.pathname === '/api/notify-missing') {
    try {
      const body = await readBody(req)
      const kind = body.kind === 'orders' ? 'orders' : 'teams'
      // 팀 번호는 'E-45' / 'G-12' 형태입니다. 앱이 리그 정의(접두어·개수)만
      // 넘겨주고, 어떤 팀이 빠졌는지는 서버가 자기 데이터로 계산합니다.
      // 앱이 실제 팀 번호 목록을 넘깁니다. 번호 사이가 비어 있는 리그가
      // 있어(G-05는 빈자리) 1..개수로 만들어 쓰면 없는 팀이 끼어듭니다.
      // 넘어온 번호는 형식을 검사해 걸러냅니다.
      let candidateIds = (Array.isArray(body.teamIds) ? body.teamIds : [])
        .map((x) => String(x || '').trim().toUpperCase())
        .filter(validTeamId)
        .slice(0, 1000)
      if (!candidateIds.length) {
        // 예전 앱 대비 — 리그 정의만 왔으면 번호를 만들어 씁니다
        const leagues = (Array.isArray(body.leagues) ? body.leagues : [])
          .map((l) => ({
            prefix: String(l?.prefix || '').toUpperCase(),
            count: Math.min(Math.max(Number(l?.count) || 0, 0), 500),
          }))
          .filter((l) => /^[A-Z]$/.test(l.prefix) && l.count > 0)
        candidateIds = leagues.flatMap((l) =>
          Array.from(
            { length: l.count },
            (_, i) => l.prefix + '-' + String(i + 1).padStart(2, '0'),
          ),
        )
      }
      if (!candidateIds.length) {
        sendJson(res, 400, { error: 'teamIds required' })
        return
      }
      const mealId = typeof body.mealId === 'string' ? body.mealId : ''
      // 멘션 문자와 줄바꿈을 제거해 문구 조작을 막습니다
      const label = String(body.label || '')
        .replace(/[<>@]/g, '')
        .split(String.fromCharCode(10))
        .join(' ')
        .split(String.fromCharCode(13))
        .join(' ')
        .slice(0, 40)

      if (!slack.enabled) {
        sendJson(res, 503, { error: 'slack disabled' })
        return
      }
      // 같은 종류를 연달아 보내 채널을 시끄럽게 만들지 않도록
      const now = Date.now()
      const last = notifyMarks[kind] || 0
      const waitMs = NOTIFY_COOLDOWN_MS - (now - last)
      if (waitMs > 0) {
        sendJson(res, 429, { error: 'cooldown', retryAfterSec: Math.ceil(waitMs / 1000) })
        return
      }

      const roster = store.get('team-roster')
      const registered = new Set(Array.isArray(roster?.ids) ? roster.ids : [])
      const teams = []
      for (const id of candidateIds) {
        if (kind === 'teams') {
          if (!registered.has(id)) teams.push(id)
        } else {
          if (!registered.has(id)) continue // 등록도 안 한 팀은 주문 재촉 대상이 아님
          const items = store.get('order:' + id)?.meals?.[mealId]?.items || []
          if (!items.length) teams.push(id)
        }
      }
      if (!teams.length) {
        sendJson(res, 200, { ok: true, sent: false, teams: 0 })
        return
      }
      const ok = await slack.notifyDigest({ kind, label, teams })
      if (ok) notifyMarks[kind] = now
      sendJson(res, 200, { ok, sent: ok, teams: teams.length })
    } catch {
      sendJson(res, 400, { error: 'invalid request' })
    }
    return
  }

  // 행사 전 초기화용 — 이제 데이터가 원격에 남으므로 테스트 기록을
  // 지울 수단이 필요합니다. ADMIN_TOKEN 이 없으면 아예 막습니다.
  if (req.method === 'POST' && url.pathname === '/api/reset') {
    try {
      const { token } = await readBody(req)
      if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
        sendJson(res, 403, { error: 'forbidden' })
        return
      }
      const cleared = store.size
      store.clear()
      if (persistOn) await redisCommand(['DEL', REDIS_HASH])
      sendJson(res, 200, { ok: true, cleared })
    } catch (err) {
      sendJson(res, 500, { error: String(err.message || err) })
    }
    return
  }

  sendJson(res, 404, { error: 'not found' })
})

// 복원이 끝난 뒤에 요청을 받습니다 (복원 전 /api/get 이 빈 값을
// 돌려주면 참가자 화면이 '주문 없음'으로 잘못 보일 수 있음).
restoreFromRedis()
  .then((ok) => {
    if (!ok) scheduleRestoreRetry()
  })
  .finally(() => {
    server.listen(PORT, () => {
      console.log(`shared kv api listening on :${PORT} (persist: ${persistState.mode})`)
      if (slack.enabled) {
        console.log(
          `[slack] 알림 켜짐 — 미처리 ${slack.UNCLAIMED_MIN}분` +
            `(${slack.UNCLAIMED_MENTION}) / 총괄 ${slack.LEAD_MIN}분`,
        )
        setInterval(() => sweepAlerts().catch(() => {}), SWEEP_MS)
      } else {
        console.log('[slack] 알림 꺼짐 (SLACK_WEBHOOK_URL 없음)')
      }
    })
  })
