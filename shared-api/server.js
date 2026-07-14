// =====================================================================
//  해커톤 주문/호출 서비스 — 공유 KV API (의존성 없음, 순수 Node http)
//
//  참가자 앱과 관리자 앱이 서로 다른 배포 URL(다른 origin)에 있어도
//  이 서버 하나를 통해 PRD 3.3의 키(order:*, call:*, coach-location:* 등)를
//  주고받습니다. 데이터는 메모리에만 저장 — 행사 종료 후 보관 불필요
//  요구사항과 일치 (서버 재시작 시 초기화됨).
//
//  엔드포인트:
//    POST /api/get   body: { keys: string[] }        → { key: value, ... }
//    POST /api/set    body: { key: string, value: * } → { ok: true }
//    GET  /health                                     → 상태 확인용
// =====================================================================
const http = require('http')

const store = new Map()
const PORT = process.env.PORT || 3001

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

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, { ok: true, keys: store.size })
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
      store.set(key, value)
      sendJson(res, 200, { ok: true })
    } catch {
      sendJson(res, 400, { error: 'invalid request' })
    }
    return
  }

  sendJson(res, 404, { error: 'not found' })
})

server.listen(PORT, () => {
  console.log(`shared kv api listening on :${PORT}`)
})
