const { after, before, test } = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const http = require('node:http')
const slack = require('./slack.js')

const PORT = 3197
const BASE = `http://127.0.0.1:${PORT}`
let child

async function post(path, body) {
  const response = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: response.status, body: await response.json() }
}

async function waitUntilReady() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const response = await fetch(BASE + '/health')
      if (response.ok) return
    } catch {
      // 프로세스가 포트를 열 때까지 잠시 기다립니다.
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('test server did not become ready')
}

before(async () => {
  child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: {
      ...process.env,
      PORT: String(PORT),
      CALL_LIMIT_PER_TEAM: '5',
      UPSTASH_REDIS_REST_URL: '',
      UPSTASH_REDIS_REST_TOKEN: '',
      SLACK_WEBHOOK_URL: '',
      // 상한 경계를 빠르게 시험하려고 작은 값으로 띄웁니다
      MENU_STOCK: 'md-a:5,md-b:5',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  await waitUntilReady()
})

after(() => {
  child?.kill()
})

test('104팀과 40명의 동시 등록을 유실하지 않고 snapshot 한 번에 반환한다', async () => {
  const teams = await Promise.all(
    Array.from({ length: 104 }, (_, index) =>
      post('/api/roster-add', { teamId: 'E-' + String(index + 1).padStart(2, '0') }),
    ),
  )
  assert.equal(teams.filter((result) => result.status === 200).length, 104)

  const coaches = await Promise.all(
    Array.from({ length: 40 }, (_, index) =>
      post('/api/coach-upsert', { id: `coach-${index}`, name: `메이트 ${index + 1}` }),
    ),
  )
  assert.equal(coaches.filter((result) => result.status === 200).length, 40)

  const snapshot = await post('/api/snapshot', {})
  assert.equal(snapshot.status, 200)
  assert.equal(Object.keys(snapshot.body.counts).length, 104)
  assert.equal(snapshot.body.coaches.length, 40)
})

test('동시 호출은 정확히 5건만 받고 생성 시각은 서버가 기록한다', async () => {
  const startedAt = Date.now()
  const results = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      post('/api/call-add', {
        teamId: 'E-01',
        call: {
          id: `call-${index}`,
          reason: '동시 호출 테스트',
          createdAt: Date.now() + 10_000_000,
        },
      }),
    ),
  )
  assert.equal(results.filter((result) => result.status === 200).length, 5)
  assert.equal(results.filter((result) => result.status === 409).length, 3)

  const calls = await post('/api/get', { keys: ['call:E-01', 'call-count:E-01'] })
  assert.equal(calls.body['call:E-01'].calls.length, 5)
  assert.equal(calls.body['call-count:E-01'], 5)
  assert.ok(calls.body['call:E-01'].calls.every((call) => call.createdAt >= startedAt))
  assert.ok(calls.body['call:E-01'].calls.every((call) => call.createdAt <= Date.now()))
})

test('같은 호출을 동시에 잡으면 한 명만 성공한다', async () => {
  const results = await Promise.all([
    post('/api/call-status', {
      teamId: 'E-01',
      callId: 'call-0',
      status: 'in_progress',
      expectedStatus: 'waiting',
      handledBy: '메이트 A',
      handledById: 'a',
    }),
    post('/api/call-status', {
      teamId: 'E-01',
      callId: 'call-0',
      status: 'in_progress',
      expectedStatus: 'waiting',
      handledBy: '메이트 B',
      handledById: 'b',
    }),
  ])
  assert.equal(results.filter((result) => result.status === 200).length, 1)
  assert.equal(results.filter((result) => result.status === 409).length, 1)
})

test('범위를 벗어나거나 정규화되지 않은 팀 번호를 거절한다', async () => {
  assert.equal((await post('/api/roster-add', { teamId: '1' })).status, 400)
  assert.equal((await post('/api/roster-add', { teamId: 'E-1' })).status, 400)
  assert.equal((await post('/api/roster-add', { teamId: 'E-209' })).status, 400)
  assert.equal((await post('/api/roster-add', { teamId: 'G-32' })).status, 400)
  // 실제로 쓰는 번호는 받습니다 — E-105(개발자리그에서 옮겨온 자리),
  // E-106(배정표에서 뒤늦게 나온 팀), E-200·E-208(외부사 자리).
  // 서버는 접두어별 상한만 알고 중간 빈자리(G-05, E-107~199)는 모릅니다.
  // 그건 참가자 앱이 팀 목록으로 막습니다.
  assert.equal((await post('/api/roster-add', { teamId: 'E-105' })).status, 200)
  assert.equal((await post('/api/roster-add', { teamId: 'E-106' })).status, 200)
  assert.equal((await post('/api/roster-add', { teamId: 'E-200' })).status, 200)
  assert.equal((await post('/api/roster-add', { teamId: 'E-208' })).status, 200)
  assert.equal((await post('/api/roster-add', { teamId: 'X-01' })).status, 400)
})

test('참가자 호출 사유의 Slack 멘션 문법을 일반 문자열로 바꾼다', () => {
  const text = slack._text.newCallText({ team: '01', reason: '<!channel> 테스트' })
  assert.ok(text.includes('&lt;!channel&gt;'))
  assert.ok(!text.includes('\n> <!channel>'))
})

test('Redis 쓰기 배치가 동시 팀 등록의 최신 104팀 목록을 보존한다', async () => {
  const redisPort = 3296
  const servicePort = 3297
  const fields = new Map()
  let hsetCount = 0
  const fakeRedis = http.createServer((request, response) => {
    let raw = ''
    request.on('data', (chunk) => {
      raw += chunk
    })
    request.on('end', () => {
      const command = JSON.parse(raw)
      let result = null
      if (command[0] === 'HGETALL') {
        result = [...fields.entries()].flat()
      } else if (command[0] === 'HSET') {
        hsetCount += 1
        for (let index = 2; index < command.length; index += 2) {
          fields.set(command[index], command[index + 1])
        }
        result = 1
      } else if (command[0] === 'DEL') {
        fields.clear()
        result = 1
      }
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ result }))
    })
  })
  await new Promise((resolve) => fakeRedis.listen(redisPort, '127.0.0.1', resolve))

  const service = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: {
      ...process.env,
      PORT: String(servicePort),
      UPSTASH_REDIS_REST_URL: `http://127.0.0.1:${redisPort}`,
      UPSTASH_REDIS_REST_TOKEN: 'test-token',
      SLACK_WEBHOOK_URL: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const serviceBase = `http://127.0.0.1:${servicePort}`
  try {
    for (let index = 0; index < 50; index += 1) {
      try {
        const response = await fetch(serviceBase + '/health')
        if (response.ok) break
      } catch {
        // 포트가 열릴 때까지 재시도합니다.
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    const responses = await Promise.all(
      Array.from({ length: 104 }, (_, index) =>
        fetch(serviceBase + '/api/roster-add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teamId: 'E-' + String(index + 1).padStart(2, '0') }),
        }),
      ),
    )
    assert.equal(responses.filter((response) => response.ok).length, 104)
    const roster = JSON.parse(fields.get('team-roster'))
    assert.equal(roster.ids.length, 104)
    assert.ok(hsetCount < 25, `HSET 횟수가 과도합니다: ${hsetCount}`)
  } finally {
    service.kill()
    await new Promise((resolve) => fakeRedis.close(resolve))
  }
})

test('준비 수량을 넘는 주문은 거절하고, 동시에 들어와도 상한을 넘기지 않는다', async () => {
  const 담기 = (teamId, qty) =>
    post('/api/order-save', {
      teamId,
      meals: { midnight: { items: [{ menuId: 'md-a', qty }] } },
    })

  // 상한(5) 안에서는 그대로 저장됩니다
  const 첫팀 = await 담기('G-01', 3)
  assert.equal(첫팀.status, 200)
  assert.equal(첫팀.body.remaining['md-a'], 2)

  // 같은 팀이 수량을 고칠 때 자기 몫이 두 번 세어지면 안 됩니다
  const 수정 = await 담기('G-01', 5)
  assert.equal(수정.status, 200)
  assert.equal(수정.body.remaining['md-a'], 0)

  // 다 찼으면 다른 팀은 거절
  const 초과 = await 담기('G-02', 1)
  assert.equal(초과.status, 409)
  assert.equal(초과.body.error, 'stock')
  assert.equal(초과.body.remaining, 0)

  // 자리를 비우고, 남은 2판을 여러 팀이 동시에 노리는 상황
  await 담기('G-01', 3)
  const 동시 = await Promise.all([
    담기('G-02', 2),
    담기('G-03', 2),
    담기('G-04', 2),
  ])
  assert.equal(동시.filter((r) => r.status === 200).length, 1)
  assert.equal(동시.filter((r) => r.status === 409).length, 2)

  const 최종 = await post('/api/stock', {})
  assert.equal(최종.body.sold['md-a'], 5)
  assert.equal(최종.body.remaining['md-a'], 0)
})

test('참가자 앱이 보내는 모양(끼니 → 항목 배열)을 그대로 저장한다', async () => {
  // 앱은 { midnight: [ {menuId, qty} ] } 로 보냅니다. 서버가 { items: [...] }만
  // 읽던 시절에는 항목을 못 읽고 빈 주문으로 덮어썼습니다.
  const r = await post('/api/order-save', {
    teamId: 'G-10',
    meals: { midnight: [{ menuId: 'md-b', qty: 2 }] },
  })
  assert.equal(r.status, 200)
  assert.deepEqual(r.body.order.meals.midnight.items, [{ menuId: 'md-b', qty: 2 }])
  assert.equal(r.body.sold['md-b'], 2)

  // 저장된 모양({ items })으로 다시 보내도 같은 결과
  const r2 = await post('/api/order-save', {
    teamId: 'G-11',
    meals: { midnight: { items: [{ menuId: 'md-b', qty: 1 }] } },
  })
  assert.equal(r2.status, 200)
  assert.equal(r2.body.sold['md-b'], 3)
})
