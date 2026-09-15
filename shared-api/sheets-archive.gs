/**
 * =====================================================================
 *  G-Order 호출 기록 아카이빙 — 구글 시트 Apps Script
 *
 *  이 파일은 서버에서 실행되지 않습니다. 구글 스프레드시트에 붙여 넣어
 *  웹앱으로 배포하고, 그 주소를 Render 환경변수 SHEETS_WEBHOOK_URL 에
 *  넣으면 shared-api/sheets.js 가 여기로 호출 기록을 보냅니다.
 *
 *  ── 설치 (10분) ───────────────────────────────────────────────────
 *  1. 구글 드라이브에서 새 스프레드시트를 만듭니다.
 *     시트(탭) 이름은 그대로 둬도 됩니다 — 아래 SHEET_NAME 이 없으면
 *     스크립트가 만들어 씁니다.
 *  2. 확장 프로그램 → Apps Script 를 엽니다.
 *  3. 기본으로 열린 Code.gs 의 내용을 지우고 이 파일 전체를 붙여 넣습니다.
 *  4. 왼쪽 톱니바퀴(프로젝트 설정) → 스크립트 속성 → 속성 추가
 *       속성  SHEETS_TOKEN
 *       값    아무나 못 맞출 임의의 문자열 (예: 32자리 랜덤)
 *     ※ 이 값을 코드에 적지 마세요. Render 환경변수 SHEETS_TOKEN 에도
 *       같은 값을 넣습니다. 주소만 알아낸 제3자가 줄을 넣지 못하게 막는
 *       유일한 장치입니다.
 *  5. 배포 → 새 배포 → 유형 '웹 앱'
 *       설명           G-Order 호출 아카이빙
 *       실행 사용자    나
 *       액세스 권한    모든 사용자          ← 서버가 로그인 없이 부릅니다
 *     배포를 누르면 권한 승인을 한 번 요구합니다(내 시트를 수정하는 권한).
 *  6. 나오는 '웹 앱 URL'(…/exec 로 끝납니다)을 복사해
 *     Render → 환경변수 SHEETS_WEBHOOK_URL 에 넣고 Manual Deploy 합니다.
 *     ※ 환경변수만 바꾸면 자동 배포가 돌지 않습니다. 반드시 재시작하세요.
 *
 *  ── 코드를 고친 뒤에는 ────────────────────────────────────────────
 *  배포 → 배포 관리 → 연필(수정) → 버전 '새 버전' → 배포.
 *  '새 배포'를 누르면 주소가 바뀌어 서버가 옛 주소로 계속 보냅니다.
 *
 *  ── 동작 ──────────────────────────────────────────────────────────
 *  같은 호출 ID가 이미 있으면 그 줄을 갱신하고, 없으면 새 줄을 답니다.
 *  덕분에 서버가 재시도해도 줄이 겹치지 않고, 완료 처리가 같은 줄의
 *  '완료'·'처리자' 칸을 채웁니다.
 * =====================================================================
 */

var SHEET_NAME = '호출 기록'

var HEADERS = [
  '호출 시각',
  '팀 번호',
  '팀명',
  '소속',
  '호출 사유',
  '담당 마스터 메이트',
  '처리자',
  '호출 ID',
]

// 호출 ID 열(마지막)은 같은 줄을 다시 찾을 때만 씁니다 — 완료 처리 때
// '처리자'를 채우는 열쇠입니다. 사람이 읽을 일이 없어 맨 끝이자 숨김입니다.
var ID_COL = HEADERS.length

function doPost(e) {
  try {
    var expected = PropertiesService.getScriptProperties().getProperty('SHEETS_TOKEN')
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}')

    // 토큰을 설정하지 않았다면 아무도 쓰지 못하게 막습니다 — 열어둔 채
    // 잊어버리는 쪽이 못 쓰는 쪽보다 위험합니다.
    if (!expected) return json({ ok: false, error: 'SHEETS_TOKEN not set in script properties' })
    if (body.token !== expected) return json({ ok: false, error: 'bad token' })

    var row = body.row || {}
    if (!row.id) return json({ ok: false, error: 'row.id required' })

    // 웹앱은 동시에 여러 번 불릴 수 있습니다. 잠그지 않으면 두 호출이
    // 같은 빈 줄을 찾아 서로를 덮어씁니다.
    var lock = LockService.getScriptLock()
    lock.waitLock(20000)
    try {
      var sheet = getSheet()
      var values = [
        row.createdAt || '',
        row.teamId || '',
        row.teamName || '',
        row.company || '',
        row.reason || '',
        row.assignedName || '',
        row.handledBy || '',
        row.id,
      ]
      var at = findRowById(sheet, row.id)
      if (at > 0) {
        // 이미 있는 줄이면 '처리자'만 채웁니다. 나머지는 호출될 때 적힌
        // 그대로 두어야 합니다 — 뒤늦게 온 값이 빈칸이면 지워버립니다.
        if (row.handledBy) sheet.getRange(at, HEADERS.length - 1).setValue(row.handledBy)
        return json({ ok: true, updated: at })
      }
      sheet.appendRow(values)
      return json({ ok: true, appended: sheet.getLastRow() })
    } finally {
      lock.releaseLock()
    }
  } catch (err) {
    return json({ ok: false, error: String(err) })
  }
}

// 브라우저로 주소를 열었을 때 "살아 있다"만 알려줍니다.
// 기록은 POST 로만 들어옵니다.
function doGet() {
  return json({ ok: true, service: 'G-Order 호출 아카이빙' })
}

// 이 스크립트가 붙어 있는 스프레드시트의 주소를 찍어 줍니다.
// 시트를 어디 뒀는지 잃어버렸을 때: 편집기 위쪽에서 이 함수를 골라 '실행' →
// 아래 '실행 로그'에 주소가 나옵니다.
function 시트주소() {
  var ss = SpreadsheetApp.getActiveSpreadsheet()
  Logger.log(ss.getName() + ' → ' + ss.getUrl())
}

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet()
  var sheet = ss.getSheetByName(SHEET_NAME)
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME)
  }
  // 제목 줄이 없거나 지금 칸 구성과 다르면 다시 씁니다. 칸을 늘리거나 줄인
  // 뒤에도 시트를 손으로 고칠 필요가 없게 — 이미 쌓인 줄은 건드리지 않으니,
  // 칸 구성을 바꿨다면 옛 줄은 지우고 새로 쌓는 편이 맞습니다.
  var head = sheet.getLastRow() > 0
    ? sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0]
    : []
  var same = head.length === HEADERS.length
  for (var i = 0; same && i < HEADERS.length; i++) {
    if (String(head[i]) !== HEADERS[i]) same = false
  }
  if (!same) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold')
    sheet.setFrozenRows(1)
    // 호출 사유는 길어서 기본 폭으로는 읽을 수 없습니다.
    sheet.setColumnWidth(5, 420)
    sheet.getRange(1, 5, sheet.getMaxRows(), 1).setWrap(true)
    // 호출 ID 는 기계만 쓰는 칸이라 감춥니다.
    sheet.hideColumns(ID_COL)
  }
  return sheet
}

// 호출 ID로 줄 번호를 찾습니다(없으면 0).
// 한 행씩 읽으면 호출마다 수백 번 왕복하므로 ID 열만 한 번에 읽습니다.
function findRowById(sheet, id) {
  var last = sheet.getLastRow()
  if (last < 2) return 0
  var ids = sheet.getRange(2, ID_COL, last - 1, 1).getValues()
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2
  }
  return 0
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  )
}
