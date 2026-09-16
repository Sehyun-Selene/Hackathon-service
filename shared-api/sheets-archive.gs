/**
 * =====================================================================
 *  G-Order 호출 기록 아카이빙 — 구글 시트 Apps Script
 *
 *  이 파일은 서버에서 실행되지 않습니다. 구글 스프레드시트에 붙여 넣어
 *  웹앱으로 배포하고, 그 주소를 Render 환경변수 SHEETS_WEBHOOK_URL 에
 *  넣으면 shared-api/sheets.js 가 여기로 호출 기록을 보냅니다.
 *
 *  ── 설치 (10분) ───────────────────────────────────────────────────
 *  1. 기록을 남길 스프레드시트를 정합니다. 새로 만들어도 되고, 이미 쓰고
 *     있는 문서(시트가 여럿 모여 있는 그 문서)를 그대로 써도 됩니다 —
 *     '호출 기록' 탭 하나만 새로 생기고 나머지 탭은 건드리지 않습니다.
 *     ※ 기록할 곳을 나중에 바꾸려면 아래 SPREADSHEET_ID 를 보세요.
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

// 기록이 들어갈 탭 이름. 이 이름의 탭이 없으면 문서 맨 끝에 만들어 씁니다.
// 시트가 여럿 모여 있는 문서에 붙여도 이 탭 하나만 건드립니다 — 다른 탭은
// 읽지도 쓰지도 않습니다.
// 같은 이름의 탭이 이미 있고 거기 다른 자료가 들어 있으면, 덮어쓰지 않고
// 멈춥니다(아래 getSheet 참고). 그때는 이 이름을 바꾸세요.
var SHEET_NAME = '호출 기록'

// 어느 스프레드시트에 쓸지.
//
//   비워 두면  이 스크립트가 붙어 있는 문서 (확장 프로그램 → Apps Script 로
//              연 바로 그 문서). 대부분 이대로 두면 됩니다.
//   채우면     다른 문서. 주소창의 /d/ 와 /edit 사이에 있는 긴 글자를 넣으세요.
//              https://docs.google.com/spreadsheets/d/⟨이 부분⟩/edit
//              스크립트를 옮기지 않고 기록할 곳만 바꿀 때 씁니다. 처음 실행할
//              때 그 문서를 열어도 되는지 한 번 더 승인을 요구합니다.
var SPREADSHEET_ID = ''

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
        row.affiliation || '',
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
  var ss = SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet()
  Logger.log('기록이 들어가는 문서: ' + ss.getName() + ' → ' + ss.getUrl())
}

function getSheet() {
  var ss = SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet()
  var sheet = ss.getSheetByName(SHEET_NAME)
  if (!sheet) {
    // 맨 끝에 답니다. 가운데 끼워 넣으면 쓰던 탭 순서가 흐트러집니다.
    sheet = ss.insertSheet(SHEET_NAME, ss.getNumSheets())
    return setUpSheet(sheet)
  }

  // 이미 같은 이름의 탭이 있는 경우.
  //
  // 시트가 여럿 모인 문서에 붙였을 때, 하필 같은 이름의 탭이 이미 있으면
  // 남의 자료를 제 것으로 알고 제목 줄을 덮어쓰고 오른쪽 칸을 지우게 됩니다.
  // 비어 있거나 우리가 만든 탭일 때만 씁니다. 아니면 아무것도 하지 않고
  // 그렇다고 알립니다 — 지워 놓고 나중에 아는 것보다 낫습니다.
  if (sheet.getLastRow() > 0 && !looksLikeOurs(sheet)) {
    throw new Error(
      "'" + SHEET_NAME + "' 탭에 이미 다른 자료가 있습니다. " +
        'SHEET_NAME 을 쓰지 않는 이름으로 바꾸거나 그 탭을 비우세요.',
    )
  }
  return setUpSheet(sheet)
}

// 우리가 쓰던 탭인지 — 제목 줄이 지금 칸 구성이거나, 예전 구성이라도
// 첫 칸이 '호출 시각' 이면 우리 것으로 봅니다(칸을 줄인 뒤의 시트).
function looksLikeOurs(sheet) {
  var width = Math.max(sheet.getLastColumn(), 1)
  var head = sheet.getRange(1, 1, 1, width).getValues()[0]
  return String(head[0]) === HEADERS[0]
}

function setUpSheet(sheet) {
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
  // 칸 수를 줄인 뒤라면 옛 제목이 오른쪽에 남습니다. 제목이 이미 맞더라도
  // 남은 칸은 그대로 있을 수 있어, 제목 검사와 따로 매번 확인합니다.
  var extra = sheet.getLastColumn() - HEADERS.length
  if (extra > 0) sheet.getRange(1, HEADERS.length + 1, sheet.getMaxRows(), extra).clear()
  // 호출 ID 는 기계만 쓰는 칸이라 늘 감춰 둡니다.
  if (!sheet.isColumnHiddenByUser(ID_COL)) sheet.hideColumns(ID_COL)
  if (!same) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold')
    sheet.setFrozenRows(1)
    // 호출 사유는 길어서 기본 폭으로는 읽을 수 없습니다.
    sheet.setColumnWidth(5, 420)
    sheet.getRange(1, 5, sheet.getMaxRows(), 1).setWrap(true)
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
