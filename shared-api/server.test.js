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
  assert.equal((await post('/api/roster-add', { teamId: 'E-207' })).status, 400)
  assert.equal((await post('/api/roster-add', { teamId: 'G-32' })).status, 400)
  // 실제로 쓰는 번호는 받습니다 — E-105(개발자리그에서 옮겨온 자리),
  // E-200(외부사 자리). 서버는 접두어별 상한만 알고 중간 빈자리(G-05,
  // E-106~199)는 모릅니다. 그건 참가자 앱이 팀 목록으로 막습니다.
  assert.equal((await post('/api/roster-add', { teamId: 'E-105' })).status, 200)
  assert.equal((await post('/api/roster-add', { teamId: 'E-200' })).status, 200)
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
