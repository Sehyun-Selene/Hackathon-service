// 두 앱의 config.js가 서로 같은지, 그리고 호출 배정에 구멍이 없는지 봅니다.
//
// 배정이 어긋나면 조용히 잘못 돌아갑니다 — 담당자가 없는 팀의 호출은 아무에게도
// 안 가고, 두 사람에게 붙은 팀은 둘이 동시에 달려갑니다. 그래서 행사 전에
// 한 번은 이 검사를 통과시켜 두는 편이 안전합니다.
//
//   node shared-api/validate-config.js
//
// 오류(errors)는 고쳐야 하는 것, 경고(warnings)는 알고만 있으면 되는 것입니다.
// 슬랙 ID가 비어 있는 사람은 오류가 아닙니다 — 아직 못 받은 ID를 추측해 넣으면
// 엉뚱한 사람에게 호출 알림이 갑니다. 비어 있으면 이름만 표기됩니다.
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

async function main() {
  const participantPath = path.resolve(__dirname, '../participant-app/src/config.js')
  const adminPath = path.resolve(__dirname, '../admin-app/src/config.js')
  const normalize = (text) => text.replace(/\r\n/g, '\n')
  const errors = []
  const warnings = []

  if (
    normalize(fs.readFileSync(participantPath, 'utf8')) !==
    normalize(fs.readFileSync(adminPath, 'utf8'))
  ) {
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

  // 호출을 쓰는 리그의 팀만 담당자가 필요합니다 (개발자리그는 호출이 없습니다).
  const callable = new Set(config.CALLABLE_TEAM_IDS || [])
  const ids = new Set()
  const slackIds = new Map()
  const owners = new Map()

  active.forEach((coach, index) => {
    // 같은 이름이 둘 있어(이상윤·Yunie / 이상윤·Yun) 이름은 열쇠로 못 씁니다.
    const label = config.crewLabel ? config.crewLabel(coach) : coach.name || `항목 ${index + 1}`

    if (!coach.id?.trim()) errors.push(`${label}: id가 비어 있습니다.`)
    else if (ids.has(coach.id)) errors.push(`${label}: id(${coach.id})가 중복되었습니다.`)
    else ids.add(coach.id)

    if (!coach.name?.trim()) errors.push(`항목 ${index + 1}: 이름이 비어 있습니다.`)

    const slackId = coach.slackUserId || ''
    if (!slackId) {
      warnings.push(`${label}: 슬랙 ID 미확인 — 알림에 이름만 표기됩니다.`)
    } else if (!/^[UW][A-Z0-9]+$/.test(slackId)) {
      errors.push(`${label}: 슬랙 ID 형식이 잘못되었습니다(${slackId}).`)
    } else if (slackIds.has(slackId)) {
      errors.push(`${label}: 슬랙 ID가 ${slackIds.get(slackId)}와 중복되었습니다.`)
    } else {
      slackIds.set(slackId, label)
    }

    if (coach.placeholder) {
      warnings.push(`${label}: 아직 누구인지 정해지지 않은 자리입니다 — 행사 전에 채우세요.`)
    }

    // 총관리자는 전체를 보므로 담당 구간이 없는 게 정상입니다.
    if (!coach.callManager && !(coach.teamNumbers || []).length) {
      warnings.push(`${label}: 담당 팀이 없습니다.`)
    }

    ;(coach.teamNumbers || []).forEach((teamId) => {
      if (!config.TEAMS?.[teamId]) {
        errors.push(`${label}: 팀 목록에 없는 번호 ${teamId}`)
        return
      }
      if (!callable.has(teamId)) {
        errors.push(`${label}: 호출을 쓰지 않는 리그의 팀 ${teamId}`)
        return
      }
      const previous = owners.get(teamId)
      if (previous) errors.push(`팀 ${teamId}: ${previous}·${label}에게 중복 배정되었습니다.`)
      else owners.set(teamId, label)
    })
  })

  const missing = [...callable].filter((teamId) => !owners.has(teamId))
  if (missing.length) errors.push(`담당자가 없는 팀 ${missing.length}개: ${missing.join(', ')}`)

  const managers = active.filter((coach) => coach.callManager)
  if (managers.length !== 1) {
    errors.push(`호출 총관리자는 정확히 1명이어야 합니다. 현재 ${managers.length}명입니다.`)
  }

  if (warnings.length) {
    console.log(`알아두면 되는 것 (${warnings.length}건)\n- ${warnings.join('\n- ')}\n`)
  }

  if (errors.length) {
    console.error(`설정 검사 실패 (${errors.length}건)\n- ${errors.join('\n- ')}`)
    process.exitCode = 1
    return
  }

  console.log(
    `설정 검사 통과: 명단 ${active.length}명 · 호출 대상 ${callable.size}팀 전부 단일 배정 · ` +
      `총관리자 ${managers[0].name}`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
