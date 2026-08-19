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
//  엔드포인트:
//    POST /api/get    body: { keys: string[] }        → { key: value, ... }
//    POST /api/set    body: { key: string, value: * } → { ok: true }
//    POST /api/reset  body: { token: string }         → 전체 삭제(행사 전 초기화용)
//    GET  /health                                     → 상태 확인용(크론 대상)
// =====================================================================
const http = require('http')
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
const persistOn = Boolean(REDIS_URL && REDIS_TOKEN)

// 마지막 영속화 상태 — /health 로 확인해 행사 전에 정상 동작을 점검합니다.
let persistState = persistOn ? { mode: 'redis', lastOk: null, lastError: null } : { mode: 'memory' }

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
// 실패해도 서버는 뜹니다 (빈 상태로 시작 — 행사 중 완전 정지보다는 낫기 때문).
async function restoreFromRedis() {
  if (!persistOn) {
    console.log('[persist] 메모리 전용 모드 (UPSTASH 환경변수 없음)')
    return
  }
  try {
    // HGETALL 결과는 [field1, value1, field2, value2, ...] 형태
    const flat = (await redisCommand(['HGETALL', REDIS_HASH], 10000)) || []
    for (let i = 0; i < flat.length; i += 2) {
      try {
        store.set(flat[i], JSON.parse(flat[i + 1]))
      } catch {
        // 개별 키가 깨져 있어도 나머지는 살립니다
      }
    }
    persistState.lastOk = new Date().toISOString()
    console.log(`[persist] 복원 완료 — ${store.size}개 키`)
  } catch (err) {
    persistState.lastError = String(err.message || err)
    console.error('[persist] 복원 실패 — 빈 상태로 시작합니다:', persistState.lastError)
  }
}

// 쓰기 반영. 원격 기록이 실패해도 메모리에는 이미 값이 있으므로
// 요청 자체는 성공으로 응답하고, 실패 사실만 /health 에 남깁니다.
async function persistKey(key, value) {
  if (!persistOn) return true
  try {
    await redisCommand(['HSET', REDIS_HASH, key, JSON.stringify(value)])
    persistState.lastOk = new Date().toISOString()
    persistState.lastError = null
    return true
  } catch (err) {
    persistState.lastError = String(err.message || err)
    console.error(`[persist] 저장 실패 (${key}):`, persistState.lastError)
    return false
  }
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
    if (waitedMin >= slack.LEAD_MIN) stuck.push({ call, waitedMin })
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

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(JSON.stringify(body))
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
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {})
    return
  }

  const url = new URL(req.url, `http://${req.headers.host}`)

  // 크론이 주기적으로 찌르는 엔드포인트 — 슬립 방지 겸 상태 점검
  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, { ok: true, keys: store.size, persist: persistState, slack: slack.state })
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
      sendJson(res, 200, { ok: true, persisted })

      // 알림은 응답을 보낸 뒤 뒤에서 처리 — 참가자 화면이 기다리지 않게
      if (freshCalls.length) alertNewCalls(freshCalls).catch(() => {})
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
restoreFromRedis().finally(() => {
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
