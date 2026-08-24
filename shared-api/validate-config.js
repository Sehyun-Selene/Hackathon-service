const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

async function main() {
  const participantPath = path.resolve(__dirname, '../participant-app/src/config.js')
  const adminPath = path.resolve(__dirname, '../admin-app/src/config.js')
  const normalize = (text) => text.replace(/\r\n/g, '\n')
  const errors = []

  if (normalize(fs.readFileSync(participantPath, 'utf8')) !== normalize(fs.readFileSync(adminPath, 'utf8'))) {
    errors.push('participant-app과 admin-app의 config.js 내용이 다릅니다.')
  }

  const config = await import(pathToFileURL(participantPath).href)
  const assignments = config.COACH_ASSIGNMENTS || []
  const active = assignments.filter(
    (coach) => coach.name || coach.teamNumbers?.length || coach.slackUserId || coach.callManager,
  )

  if (active.length === 0) {
    console.log('설정 대기: 메이트 명단이 아직 비어 있어 배정 검사를 건너뜁니다.')
    return
  }

  const names = new Set()
  const slackIds = new Set()
  const owners = new Map()

  active.forEach((coach, index) => {
    const label = coach.name || `항목 ${index + 1}`
    if (!coach.name?.trim()) errors.push(`${label}: 이름이 비어 있습니다.`)
    else if (names.has(coach.name)) errors.push(`${label}: 이름이 중복되었습니다.`)
    else names.add(coach.name)

    if (!/^[UW][A-Z0-9]+$/.test(coach.slackUserId || '')) {
      errors.push(`${label}: Slack 멤버 ID가 없거나 형식이 잘못되었습니다.`)
    } else if (slackIds.has(coach.slackUserId)) {
      errors.push(`${label}: Slack 멤버 ID가 중복되었습니다.`)
    } else {
      slackIds.add(coach.slackUserId)
    }

    ;(coach.teamNumbers || []).forEach((teamNumber) => {
      if (!Number.isInteger(teamNumber) || teamNumber < 1 || teamNumber > config.TOTAL_TEAMS) {
        errors.push(`${label}: 범위를 벗어난 팀 번호 ${teamNumber}`)
        return
      }
      const previous = owners.get(teamNumber)
      if (previous) errors.push(`팀 ${teamNumber}: ${previous}·${label}에게 중복 배정되었습니다.`)
      else owners.set(teamNumber, label)
    })
  })

  const missing = Array.from({ length: config.TOTAL_TEAMS }, (_, index) => index + 1).filter(
    (teamNumber) => !owners.has(teamNumber),
  )
  if (missing.length) errors.push(`담당자가 없는 팀: ${missing.join(', ')}`)

  const managers = active.filter((coach) => coach.callManager)
  if (managers.length !== 1) {
    errors.push(`호출 총관리자는 정확히 1명이어야 합니다. 현재 ${managers.length}명입니다.`)
  }

  if (errors.length) {
    console.error(`설정 검사 실패 (${errors.length}건)\n- ${errors.join('\n- ')}`)
    process.exitCode = 1
    return
  }

  console.log(
    `설정 검사 통과: 메이트 ${active.length}명 · 1~${config.TOTAL_TEAMS}팀 단일 배정 · ` +
      `총관리자 ${managers[0].name}`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
