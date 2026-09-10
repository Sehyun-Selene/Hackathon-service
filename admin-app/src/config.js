// =====================================================================
//  ⚙️ 서비스 설정 파일 — PRD에서 TBD(추후 확정)로 표시된 값 모음
//
//  값이 확정되면 "이 파일만" 수정하면 됩니다. 코드 어디에도 하드코딩 없음.
//
//  ⚠️ 중요: participant-app/src/config.js 와 admin-app/src/config.js 는
//     반드시 동일한 내용으로 유지하세요. 두 앱은 코드베이스가 완전히
//     분리되어 있어 한쪽만 고치면 두 화면의 동작이 서로 어긋납니다.
// =====================================================================

// ---------------------------------------------------------------
// 0. 공유 API 서버 주소
//    참가자 앱과 관리자 앱은 서로 다른 배포 URL(다른 origin)이므로,
//    데이터를 주고받으려면 이 작은 공유 서버(shared-api/)를 거칩니다.
//    → shared-api를 Render/Railway 등에 배포한 뒤, 그 주소로 교체하세요.
//    → 비워두면('') 이 기기(브라우저)의 localStorage만 사용합니다
//      (다른 사람 화면과 공유되지 않음 — 로컬 개발/시연용).
// ---------------------------------------------------------------
export const API_BASE_URL =
  import.meta.env?.VITE_API_BASE_URL ?? 'https://hackathon-api-hi55.onrender.com'

// ---------------------------------------------------------------
// 1. 주문 타임라인  (주문 시간 확정: DAY 1 13:30~16:00)
//
//    주문은 첫날 딱 한 번만 받습니다:
//      ① 13:30~16:00 → 야식·아침 한 번에 주문 (각 2가지 메뉴 중 선택)
//    이후/이외에는 주문 기능이 없습니다:
//      - 간식·저녁: 주문 없이 인원수 기준 일괄 제공
//      - 둘째 날 점심·이후 아이스크림: 인원수 기준 일괄 제공
//      - 음료: 냉장고에서 자율적으로 가져감 (주문 없음)
//
//    - label                 : 식사 이름 (식사 탭·장바구니·관리자 화면 표기)
//    - shortLabel            : 주문 화면 제목에 쓰는 짧은 이름. 없으면 label 사용.
//    - orderStart ~ orderEnd : 주문 가능(메뉴판 노출·수정·취소 가능) 구간
//      (여러 식사가 같은 구간을 공유하면 한 화면에서 탭으로 함께 주문)
//    - eatAt                 : 식사 시각. 주문 내역은 orderStart부터
//                              eatAt까지 참가자 화면에 노출됨
//    - fixedMenu             : true면 일괄 메뉴(선택 없이 수량만 담음)
//    - 시각 문자열은 로컬 시간(KST 기기 기준)으로 해석됩니다.
// ---------------------------------------------------------------
export const MEALS = [
  {
    id: 'midnight',
    label: '[DAY 1] 야식',
    shortLabel: '야식',
    orderStart: '2026-09-21T13:30:00',
    orderEnd: '2026-09-21T16:00:00',
    eatAt: '2026-09-21T21:00:00',
  },
  {
    id: 'breakfast',
    label: '[DAY 2] 아침',
    shortLabel: '아침',
    orderStart: '2026-09-21T13:30:00',
    orderEnd: '2026-09-21T16:00:00',
    eatAt: '2026-09-22T09:00:00',
  },
]

// ---------------------------------------------------------------
// 1-2. 안내 이미지 탭 (타임테이블 · 음식 여정)
//
//   이미지 한 장을 그대로 보여주는 탭입니다. 폰에서 잘리지 않게 폭에
//   맞춰 전체를 보여주고, 글씨를 키워 보려면 눌러서 원본을 엽니다
//   (앱 화면은 확대를 막아둬서 이미지 안에서 손가락 확대가 안 됩니다).
//
//   - leagues : 이 탭을 보여줄 리그. 타임테이블은 필드리그 일정이라
//               개발자리그에는 보여주지 않습니다.
//   - src     : 뒤의 ?v= 는 캐시 무효화용입니다. public/ 안의 파일은 이름에
//               해시가 붙지 않아, 같은 이름으로 내용만 바꾸면 이미 한 번
//               열어본 폰이 옛 이미지를 계속 보여줄 수 있습니다.
//               이미지를 교체할 때마다 이 숫자를 올리세요.
// ---------------------------------------------------------------
export const IMAGE_BOARDS = [
  {
    id: 'timetable',
    label: '타임테이블',
    icon: '🗓️',
    title: '해커톤 타임테이블',
    src: './board/timetable.jpg?v=5',
    alt: 'PLAI 타임테이블 — DAY1 9/21, DAY2 9/22 시간별 일정',
    leagues: ['field'],
  },
  {
    id: 'journey',
    label: '음식 여정',
    icon: '🗺️',
    title: 'PLAI 음식 여정',
    src: './board/food-journey.jpg',
    alt: '음식 여정 지도 — 간식·저녁·야식·아침·점심·간식 순서와 시각',
    leagues: ['field', 'dev'],
  },
]

// 그 팀이 볼 수 있는 안내 이미지 탭
export function imageBoardsFor(teamId) {
  const league = leagueOf(teamId)?.id
  if (!league) return []
  return IMAGE_BOARDS.filter((b) => b.leagues.includes(league))
}

// ---------------------------------------------------------------
// 2. 마스터 메이트 호출
//    호출 사유 선택 없음 — 버튼 한 번으로 바로 호출됩니다.
// ---------------------------------------------------------------
// 팀당 호출 가능 총 횟수 (확정: 5회) — 초과 시 호출 버튼 자동 비활성화
export const CALL_LIMIT_PER_TEAM = 5

// 아이디어 보드 작성 시간.
// 보드를 완성해야 마스터 메이트를 호출할 수 있어, 팀의 첫 호출 때 한 번
// 확인 팝업을 띄웁니다. 문구의 시각은 여기서 뽑습니다 — 글자로 박아두면
// 시간이 바뀔 때 화면에만 옛 시간이 남습니다.
export const IDEA_BOARD = { start: '2026-09-21T14:00:00', end: '2026-09-21T16:00:00' }

// ---------------------------------------------------------------
// 2-1. 리그와 팀 (자리배치 시트에서 옮김)
//
//   테이블에 붙은 번호가 그대로 팀 번호입니다 — 필드리그는 E-45,
//   개발자리그는 G-12. 접두어가 없으면 두 리그의 같은 번호가 한 팀으로
//   섞여 주문·호출이 엉킵니다.
//   리모트리그(O-)는 현장에 오지 않아 이 서비스를 쓰지 않습니다.
//
//   size = 그 팀의 인원. 주문 수량 상한으로 쓰입니다.
//     신청 시트의 '인원' 열은 쓰지 않습니다. 그건 지원할 때 답한 계획 인원이지
//     확정 명단이 아니라서, 그 열을 믿었던 E-40·E-75·G-13·G-17이 모두 실제보다
//     크게 잡혀 있었습니다(각 3·3·4·4 → 2·2·3·2). 운영진이 확인해 준 인원을
//     씁니다.
//   name = 팀명. 등록할 때 번호를 확인시켜 주는 용도입니다.
// ---------------------------------------------------------------
// count = 그 리그에서 가장 큰 테이블 번호입니다. 팀 수와 다를 수 있습니다 —
// 개발자리그는 번호가 G-31까지 가지만 G-05는 빈자리여서 30팀이고,
// 필드리그는 외부사 자리가 E-200번대라 번호만 206까지 갑니다(실제 112팀).
// 실제 팀 목록은 아래 TEAMS에서 뽑습니다.
// calls = 마스터 메이트 호출을 쓰는 리그인지. 개발자리그는 쓰지 않아,
// 그 팀으로 등록하면 참가자 화면에 호출 탭이 아예 나오지 않고
// 관리자 호출 횟수 격자에도 들어가지 않습니다.
export const LEAGUES = [
  { id: 'field', prefix: 'E', label: '필드리그', count: 208, calls: true },
  // G는 47까지 갑니다 — 개발자리그 자리에 앉은 필드리그 팀(G-47)이 있어서입니다.
  // 아래 TEAM_LEAGUE_OVERRIDES 참고.
  { id: 'dev', prefix: 'G', label: '개발자리그', count: 47, calls: false },
]

// 테이블 번호의 접두어와 소속 리그가 다른 팀.
//
//   지금까지는 자리가 곧 리그였습니다 — E 자리에 앉으면 필드리그,
//   G 자리에 앉으면 개발자리그. G-47(현대모비스)에서 처음 갈라집니다.
//   필드리그 팀인데 필드 구역에 자리가 없어 개발자리그 구역에 앉았습니다.
//
//   테이블에 붙은 번호가 참가자가 보는 유일한 단서이므로, 번호를 바꾸지
//   않고 여기서 리그만 따로 적어 둡니다. 등록 화면에서 '개발자리그 · 47'을
//   고르면 leagueOf가 필드리그로 돌려주어, 호출 탭과 타임테이블 탭이
//   그대로 열립니다. 참가자는 아무것도 신경 쓸 게 없습니다.
export const TEAM_LEAGUE_OVERRIDES = {
  'G-47': 'field',
}

export const TEAMS = {
  'E-01': { name: "어벤처스", size: 2 },
  'E-02': { name: "Grill Me", size: 3 },
  'E-03': { name: "오디세이", size: 2 },
  'E-04': { name: "CTRL + AI", size: 2 },
  'E-05': { name: "리투(Lee Two)", size: 2 },
  'E-06': { name: "KJ", size: 2 },
  'E-07': { name: "안녕하세요차지비입니다잘부탁드립니다.", size: 3 },
  'E-08': { name: "지금, 차지", size: 3 },
  'E-09': { name: "당진파파", size: 3 },
  'E-10': { name: "빌드업", size: 3 },
  'E-11': { name: "스마트스퀘어", size: 2 },
  'E-12': { name: "스마트터빈", size: 3 },
  'E-13': { name: "파도", size: 2 },
  'E-14': { name: "HOPE", size: 4 },
  'E-15': { name: "Jun & Kun", size: 2 },
  'E-16': { name: "고객운영팀", size: 3 },
  'E-17': { name: "서든어택", size: 4 },
  'E-18': { name: "성능주의", size: 4 },
  'E-19': { name: "파울링 헌터스", size: 4 },
  'E-20': { name: "20W50", size: 3 },
  'E-21': { name: "시고시고", size: 3 },
  'E-22': { name: "아장아장", size: 4 },
  'E-23': { name: "오뒷에이아이야", size: 3 },
  'E-24': { name: "지칼드림팀", size: 3 },
  'E-25': { name: "체크메이트", size: 3 },
  'E-26': { name: "컴플AI언스", size: 3 },
  'E-27': { name: "Bid-Tamin", size: 2 },
  'E-28': { name: "Fixipedia", size: 4 },
  'E-29': { name: "MOC MATE", size: 3 },
  'E-30': { name: "Pringles", size: 4 },
  'E-31': { name: "RA", size: 4 },
  'E-32': { name: "AIDEAL (에이디얼)", size: 4 },
  'E-33': { name: "기사회생", size: 4 },
  'E-34': { name: "보건보건", size: 3 },
  'E-35': { name: "AIgnition", size: 4 },
  'E-36': { name: "BID ONE(비드원)", size: 4 },
  'E-37': { name: "BS", size: 4 },
  'E-38': { name: "FanTAXtic", size: 2 },
  'E-39': { name: "GS 공구리에이티브", size: 4 },
  'E-40': { name: "MU", size: 2 },
  'E-41': { name: "Noise Huntrix", size: 3 },
  'E-42': { name: "XI-Nergy", size: 3 },
  'E-43': { name: "NARASEE", size: 3 },
  'E-44': { name: "Xisafety", size: 3 },
  'E-45': { name: "3삼5오", size: 4 },
  'E-46': { name: "강동어겐", size: 4 },
  'E-47': { name: "김이조장", size: 4 },
  'E-48': { name: "딱걸렸4", size: 4 },
  'E-49': { name: "리스크 제로", size: 4 },
  'E-50': { name: "미녀사총사", size: 4 },
  'E-51': { name: "불티를깨워", size: 2 },
  'E-52': { name: "블랙핑크", size: 4 },
  'E-53': { name: "뽀삐", size: 2 },
  'E-54': { name: "세끼통역", size: 3 },
  'E-55': { name: "수퍼프롬프트", size: 2 },
  'E-56': { name: "신선강화B", size: 4 },
  'E-57': { name: "신선강화C", size: 3 },
  'E-58': { name: "안AI잘부", size: 4 },
  'E-59': { name: "온앤오프", size: 3 },
  'E-60': { name: "우연이연", size: 4 },
  'E-61': { name: "커넥트 you & me", size: 3 },
  'E-62': { name: "커타고", size: 4 },
  'E-63': { name: "햄샘수", size: 3 },
  'E-64': { name: "홈동이들", size: 4 },
  'E-65': { name: "효리수", size: 4 },
  'E-66': { name: "Audit Say (오디세이)", size: 4 },
  'E-67': { name: "GiveS", size: 4 },
  'E-68': { name: "HiAi", size: 4 },
  'E-69': { name: "HLH컴퍼니", size: 3 },
  'E-70': { name: "SO, GOOD", size: 3 },
  'E-71': { name: "Team Argo", size: 4 },
  'E-72': { name: "Team Hermes", size: 4 },
  'E-73': { name: "VOC세편살", size: 3 },
  'E-74': { name: "끝까지 버팀", size: 3 },
  'E-75': { name: "구미 야호", size: 2 },
  'E-76': { name: "FC동해", size: 2 },
  'E-77': { name: "위험한팀", size: 2 },
  'E-78': { name: "공하Z", size: 2 },
  'E-79': { name: "미철즈", size: 2 },
  'E-80': { name: "신림파", size: 3 },
  'E-81': { name: "DNA (Dining Needs Analyzer)", size: 4 },
  'E-82': { name: "JOEvolution", size: 3 },
  'E-83': { name: "JSS", size: 4 },
  'E-84': { name: "W/IRD", size: 2 },
  'E-85': { name: "쉬거라", size: 4 },
  'E-86': { name: "용쑤형", size: 4 },
  'E-87': { name: "지글 지글 식사팀", size: 4 },
  'E-88': { name: "추심단", size: 4 },
  'E-89': { name: "AI고 뭐고 일단 해", size: 4 },
  'E-90': { name: "GSG26", size: 3 },
  'E-91': { name: "Market Radar", size: 3 },
  'E-92': { name: "MAY THE MISO BE WITH YOU", size: 2 },
  'E-93': { name: "Zero Shot", size: 4 },
  'E-94': { name: "잘찾조", size: 2 },
  'E-95': { name: "서울의별", size: 3 },
  'E-96': { name: "에푸씨", size: 2 },
  'E-97': { name: "A-01", size: 4 },
  'E-98': { name: "A-02", size: 3 },
  'E-99': { name: "A-03", size: 3 },
  'E-100': { name: "A-04", size: 4 },
  'E-101': { name: "A-05", size: 3 },
  'E-102': { name: "A-06", size: 4 },
  'E-103': { name: "A-07", size: 4 },
  'E-104': { name: "A-08", size: 4 },
  // 개발자리그 G-05에 있다가 필드리그로 옮겨온 팀입니다
  'E-105': { name: "써브(Thermal Bridge)", size: 2 },
  // 배정표에서 뒤늦게 나온 GS건설 팀입니다
  'E-106': { name: "일단해보자", size: 3 },

  // 외부사 — 자리배치표에는 자리가 없고 번호만 시트에 적혀 있습니다.
  // 팀명이 아직 없어 회사명으로 확인시켜 줍니다(company). 정해지면 name을 채우세요.
  'E-200': { name: "", company: "오리온", size: 4 },
  'E-201': { name: "", company: "오리온", size: 4 },
  'E-202': { name: "", company: "오리온", size: 4 },
  'E-203': { name: "", company: "한전", size: 4 },
  'E-204': { name: "", company: "한국표준과학연구원", size: 2 },
  'E-205': { name: "", company: "한국경제신문", size: 4 },
  'E-206': { name: "", company: "한국동서발전", size: 4 },
  'E-207': { name: "", company: "삼양인터네셔널", size: 4 },
  'E-208': { name: "", company: "삼양통상", size: 3 },

  'G-01': { name: "JDD", size: 3 },
  'G-02': { name: "KNOW:HOW", size: 1 },
  'G-03': { name: "TBD", size: 4 },
  'G-04': { name: "샘탁", size: 2 },
  'G-06': { name: "AX퍼펭단", size: 2 },
  'G-07': { name: "맥민희언즈", size: 4 },
  'G-08': { name: "화공이지만, 개발은 하고 싶어", size: 3 },
  'G-09': { name: "CATCH", size: 3 },
  'G-10': { name: "CorroVision", size: 3 },
  'G-11': { name: "CTRL+WHY", size: 3 },
  'G-12': { name: "Wave Maker", size: 1 },
  'G-13': { name: "2D2D", size: 3 },
  'G-14': { name: "캠핑왕 랄프", size: 3 },
  'G-15': { name: "AI구조대", size: 3 },
  'G-16': { name: "AutoGeo", size: 2 },
  'G-17': { name: "GS AIX", size: 2 },
  'G-18': { name: "NDA 검토 자동화", size: 1 },
  'G-19': { name: "RE:BUILDERS", size: 2 },
  'G-20': { name: "2038", size: 4 },
  'G-21': { name: "맥미닝(MakMeaning)", size: 3 },
  'G-22': { name: "뭐해보카", size: 4 },
  'G-23': { name: "비전트랙커", size: 2 },
  'G-24': { name: "일단커밋", size: 3 },
  'G-25': { name: "초경량", size: 2 },
  'G-26': { name: "하데스", size: 2 },
  'G-27': { name: "Josh", size: 1 },
  'G-28': { name: "Team Synergy", size: 4 },
  'G-29': { name: "SMP상한가", size: 2 },
  'G-30': { name: "에방", size: 2 },
  'G-31': { name: "D-01", size: 2 },
  // 개발자리그 구역 뒷자리 — 명단 시트에 팀명·인원만 있고 참가자 이름은
  // 아직 비어 있는 자리입니다. 인원은 시트의 인원 열을 그대로 씁니다.
  'G-40': { name: "서울대1", size: 4 },
  'G-41': { name: "서울대2", size: 4 },
  'G-42': { name: "정구봉팀1", size: 2 },
  'G-43': { name: "정구봉팀2", size: 2 },
  'G-44': { name: "정구봉팀3", size: 2 },
  'G-45': { name: "정구봉팀4", size: 2 },
  'G-46': { name: "정구봉팀5", size: 2 },
  // 필드리그 팀입니다 — 자리만 개발자리그 구역입니다 (TEAM_LEAGUE_OVERRIDES)
  'G-47': { name: "WIATHON", company: "현대위아", size: 3 },
}

export const LEAGUE_BY_PREFIX = Object.fromEntries(LEAGUES.map((l) => [l.prefix, l]))
// 리그별 팀 번호 목록 — 번호를 1부터 만들어 쓰지 않고 TEAMS에 실제로 있는
// 것만 모읍니다. G-05처럼 중간이 빈 리그에서 없는 팀이 격자에 생기기 때문입니다.
// 접두어가 아니라 실제 소속 리그로 나눕니다 — G-47은 G 자리에 앉은
// 필드리그 팀이라 필드리그 쪽에 들어가야 호출 격자·집계에 잡힙니다.
export const TEAM_IDS_BY_LEAGUE = Object.fromEntries(
  LEAGUES.map((l) => [
    l.id,
    Object.keys(TEAMS)
      .filter((id) => (TEAM_LEAGUE_OVERRIDES[id] || LEAGUE_BY_PREFIX[id.charAt(0)]?.id) === l.id)
      .sort((a, b) => parseInt(a.slice(2), 10) - parseInt(b.slice(2), 10)),
  ]),
)
export const ALL_TEAM_IDS = LEAGUES.flatMap((l) => TEAM_IDS_BY_LEAGUE[l.id])
// 팀 번호에서 리그 찾기 ('E-45' → 필드리그).
// 접두어가 소속과 다른 팀(G-47)은 TEAM_LEAGUE_OVERRIDES가 이깁니다.
export function leagueOf(teamId) {
  const id = String(teamId || '')
  const override = TEAM_LEAGUE_OVERRIDES[id]
  if (override) return LEAGUES.find((l) => l.id === override) || null
  return LEAGUE_BY_PREFIX[id.charAt(0)] || null
}
// 테이블 번호의 접두어로 찾는 리그 — 등록 화면의 번호 입력칸처럼
// "자리"를 다룰 때 씁니다. 소속을 물을 때는 leagueOf를 쓰세요.
export function tableLeagueOf(teamId) {
  return LEAGUE_BY_PREFIX[String(teamId || '').charAt(0)] || null
}
// 이 팀이 마스터 메이트를 호출할 수 있는지 (개발자리그는 호출을 쓰지 않습니다)
export function leagueAllowsCall(teamId) {
  return leagueOf(teamId)?.calls !== false
}
// 호출을 쓰는 리그의 팀 번호만 — 관리자 호출 횟수 격자에 씁니다
export const CALLABLE_TEAM_IDS = ALL_TEAM_IDS.filter(leagueAllowsCall)

// 그 팀의 인원 (모르면 null — 시트에 없는 번호)
export function teamSize(teamId) {
  return TEAMS[teamId]?.size ?? null
}
// 등록할 때 "이 팀이 맞나"를 확인시켜 주는 이름. 팀명이 아직 없는 외부사는
// 회사명으로 대신합니다 — 빈 이름을 보여주면 확인이 되지 않습니다.
export function teamLabel(teamId) {
  const team = TEAMS[teamId]
  if (!team) return ""
  return team.name || team.company || ""
}
// 그 리그에서 실제로 쓰는 번호 구간 — 입력칸 안내에 씁니다 (예: "1~105 · 200~206")
//
// 소속이 아니라 테이블 접두어로 셉니다. 이 안내가 붙는 입력칸은 "E- 뒤에
// 몇 번" 처럼 자리를 묻는 칸이기 때문입니다. 개발자리그를 고른 참가자가
// 47(현대모비스, 실제 소속은 필드리그)을 넣어야 하므로, 그 번호가 안내에
// 보여야 합니다.
export function leagueNumberHint(leagueId) {
  const prefix = LEAGUES.find((l) => l.id === leagueId)?.prefix
  if (!prefix) return ""
  const nums = Object.keys(TEAMS)
    .filter((id) => id.charAt(0) === prefix)
    .map((id) => parseInt(id.slice(2), 10))
    .sort((a, b) => a - b)
  if (!nums.length) return ""
  const parts = []
  let start = nums[0]
  let prev = nums[0]
  for (let i = 1; i <= nums.length; i++) {
    const n = nums[i]
    // 번호가 크게 뛰면 다른 구역입니다 (필드리그 106 → 200, 개발자리그 31 → 40).
    // 한두 자리 비어 있는 것(G-05)까지 끊으면 안내가 누더기가 되므로,
    // 자리 몇 개가 아니라 구역이 갈렸다고 볼 만한 폭에서만 끊습니다.
    // 지금 실제로 벌어져 있는 틈은 G-05 하나(2)와 구역 경계 둘(9·94)뿐입니다.
    if (n === undefined || n - prev > 4) {
      parts.push(start === prev ? String(start) : start + '~' + prev)
      start = n
    }
    prev = n
  }
  return parts.join(' · ')
}
// 정렬용 숫자 키. 'E-01' 같은 문자열은 그냥 빼면 NaN이 되므로,
// 리그 순서(LEAGUES 배열 순) × 1000 + 번호로 바꿔 씁니다.
// 모르는 번호는 맨 뒤로 보냅니다.
export function teamSortKey(teamId) {
  const prefix = String(teamId || '').charAt(0)
  const index = LEAGUES.findIndex((l) => l.prefix === prefix)
  const num = parseInt(String(teamId || '').slice(2), 10)
  if (index < 0 || !Number.isFinite(num)) return Number.MAX_SAFE_INTEGER
  return index * 1000 + num
}


// ---------------------------------------------------------------
// 3. 크루 명단  (담당 팀 배정은 확정 후 teamNumbers에 채우기)
//
//    시트 「해커톤 크루 R&R」에서 옮겨온 명단입니다. 역할이 하는 일이
//    서로 달라 목록을 나눠 둡니다.
//      COACH_ASSIGNMENTS — 호출을 받는 사람 (마스터 메이트 + 호출 총관리자)
//      PLAY_MATES        — 플레이 메이트. 호출 대상이 아닙니다
//      FOOD_CREW         — 식음 운영. 주문 현황을 맡습니다
//
//    ※ 닉네임 칸이 이메일이던 분들은 비워 뒀습니다 — 화면에 쓰지 않는
//      개인 연락처를 설정 파일에 담을 이유가 없습니다.
// ---------------------------------------------------------------

// 3-1. 마스터 메이트 — 참가자의 호출을 받아 찾아가는 사람들
//    - name       : 관리자 앱 입장 시 입력하는 이름. 여기 적힌 글자와
//                   정확히 같아야 담당 팀이 연결됩니다.
//    - nickname   : 시트의 닉네임. 이름이 겹칠 때 누구인지 가리는 용도입니다.
//                   ⚠️ 이름이 같은 분이 있습니다: 이상윤(Yunie·GS 엔텍) /
//                   이상윤(Yun·GS파워). 이름만으로는 두 사람을 가릴 수
//                   없어, 담당 팀을 채우기 전에 입장 방식을 정해야 합니다.
//    - teamNumbers: 담당 팀 번호 배열. 자리배치표와 같은 표기를 씁니다
//                   (예: ['E-01', 'E-02', 'E-03']). 두 자리로 맞춰 주세요.
//                   한 사람이 두 리그를 겹쳐 맡지 않습니다.
//    - slackUserId: 슬랙 멤버 ID (예: 'U01ABCDEF'). 채우면 그 사람만
//                   멘션되어 개인 알림을 받습니다. 비어 있으면 이름만 표기.
//                   ※ 슬랙 프로필 → 더보기 → '멤버 ID 복사'
//    - callManager: true면 전체 팀의 호출 횟수와 미등록·미주문 재촉 권한을
//                   가집니다. 담당 구간 없이 전체를 보는 운영 총괄 한 명에게만.
//    - groupId    : 여러 명이 한 구간을 함께 맡을 때의 그룹 (COACH_GROUPS).
//                   그룹 구성원은 teamNumbers가 모두 같습니다.

// 3-1-a. 마스터 메이트 그룹 — 구간을 쪼개지 않고 여럿이 함께 맡는 경우.
//
//   기본 배정은 "한 팀에 한 사람"입니다. 누가 갈지 정해져 있어야 서로
//   미루지 않기 때문입니다. 리테일 조는 반대로 하기로 했습니다 — 팀을
//   쪼개지 않고 30팀을 13명이 함께 봅니다. 호출 알림이 구성원 전원에게
//   가고, 그중 손이 빈 사람이 갑니다.
//
//   구현은 단순합니다: 구성원 모두가 같은 teamNumbers를 가집니다. 그래서
//   관리자 앱의 '내 담당 팀만', 호출 횟수 격자, 완료 이력이 별도 분기 없이
//   그대로 동작합니다. 달라지는 건 "담당자 한 명 찾기"뿐이라, 그 자리에만
//   getAssignedCoachesForTeam(복수형)을 씁니다.
const 팀번호대 = (prefix, from, to) => {
  const out = []
  for (let n = from; n <= to; n++) out.push(prefix + '-' + String(n).padStart(2, '0'))
  return out
}
export const COACH_GROUPS = [
  {
    id: 'retail',
    label: '리테일',
    // 기존에 이 13명이 나눠 맡고 있던 구간을 그대로 합친 것입니다 (E-45~E-74)
    teamNumbers: 팀번호대('E', 45, 74),
  },
]
const GROUP_TEAMS = Object.fromEntries(COACH_GROUPS.map((g) => [g.id, g.teamNumbers]))

export const COACH_ASSIGNMENTS = [
  // 담당 팀(teamNumbers)이 빈 분들은 이번 배정표에 이름이 없는 경우입니다
  // (박지훈/Ready · 안효진/Mario · 이재현/L 은 플레이 메이트로 역할이 바뀜).
  // 명단에서 지우지 않고 담당 팀만 비워 둡니다 — 지우면 당일 관리자 화면에
  // 들어올 수 없게 되고, 담당이 없어도 다른 팀 호출은 대신 처리할 수 있습니다.
  // 호출 총관리자 — 담당 구간 없이 전체를 봅니다
  { id: 'call-manager', name: '김세현', nickname: 'Selene', company: '(주)GS', teamNumbers: [], slackUserId: 'U0BED7LG02D', callManager: true },
  { id: 'mate-01', name: '고병현', nickname: 'Joseph', company: '(주)GS', teamNumbers: ['E-97', 'E-98', 'E-99'], slackUserId: 'U095U417XLG' },
  { id: 'mate-02', name: '한만호', nickname: 'Ryan', company: '(주)GS', teamNumbers: ['E-80', 'E-81'], slackUserId: 'U088AHTLTNJ' },
  { id: 'mate-03', name: '이진수', nickname: 'Jin', company: '(주)GS', teamNumbers: ['E-82', 'E-83', 'E-84'], slackUserId: 'U05R86E8HEZ' },
  { id: 'mate-04', name: '장희원', nickname: 'Eric', company: '(주)GS', teamNumbers: ['E-200', 'E-201', 'E-202', 'G-47'], slackUserId: 'U0AQZ6EHNL8' },
  { id: 'mate-05', name: '김민규', nickname: 'Tomi', company: '(주)GS', teamNumbers: ['E-41', 'E-106', 'E-42'], slackUserId: 'U0BDVTQBSRM' },
  { id: 'mate-06', name: '김진호', nickname: 'Hugo', company: '(주)GS', groupId: 'retail', teamNumbers: GROUP_TEAMS.retail, slackUserId: 'U0BED7JHMKK' },
  { id: 'mate-07', name: '정승현', nickname: 'Josh', company: '보령LNG터미널', teamNumbers: ['E-03'], slackUserId: 'U0A6RPS2CCX' },
  { id: 'mate-08', name: '이성규', nickname: 'Connor', company: '위드인천에너지', teamNumbers: ['E-04'], slackUserId: 'U0A7776PR98' },
  { id: 'mate-09', name: '정승환', nickname: 'Gon', company: '인천종합에너지', teamNumbers: ['E-05', 'E-06'], slackUserId: 'U0A7AQSBVMJ' },
  { id: 'mate-10', name: '김한희', nickname: 'Hani', company: 'GS에너지', teamNumbers: [], slackUserId: 'U0A75666VFG' },
  { id: 'mate-11', name: '방민규', nickname: 'Mr.Q', company: '파르나스호텔', teamNumbers: ['E-77', 'E-78', 'E-79'], slackUserId: 'U0A7776NHB4' },
  { id: 'mate-12', name: '이한호', nickname: 'Lars', company: 'E&R', teamNumbers: ['E-91', 'E-92', 'E-93'], slackUserId: 'U0A769P1TQA' },
  { id: 'mate-13', name: '한준이', nickname: 'Aiden', company: '구미열병합발전', teamNumbers: ['E-75'], slackUserId: 'U0A70RJ4M35' },
  { id: 'mate-14', name: '황정섭', nickname: 'jay', company: '동해전력', teamNumbers: ['E-76'], slackUserId: 'U0A73Q40XTP' },
  { id: 'mate-15', name: '박태준', nickname: 'Tony', company: '포천그린에너지', teamNumbers: ['E-103', 'E-104', 'E-105'], slackUserId: 'U0A7L52HBQ9' },
  { id: 'mate-16', name: '정다운', nickname: 'William', company: 'GS EPS', teamNumbers: ['E-09', 'E-10', 'E-11'], slackUserId: 'U0A79T8DPJQ' },
  { id: 'mate-17', name: '김태윤', nickname: 'Kai', company: 'GS EPS', teamNumbers: ['E-12', 'E-13', 'E-14', 'E-15'], slackUserId: 'U0A7776MAPL' },
  { id: 'mate-18', name: '신창호', nickname: 'Kyle', company: 'GS건설', teamNumbers: ['E-32', 'E-33', 'E-34'], slackUserId: 'U0A7MFA2H46' },
  { id: 'mate-19', name: '박일락', nickname: 'Ryan', company: 'GS 엔텍', teamNumbers: ['E-94'], slackUserId: 'U0A70RJ3H6X' },
  { id: 'mate-20', name: '이상윤', nickname: 'Yunie', company: 'GS 엔텍', teamNumbers: ['E-88', 'E-89', 'E-90'], slackUserId: 'U0A73Q3RY8M' },
  { id: 'mate-21', name: '김경미', nickname: 'May', company: 'GS글로벌', teamNumbers: ['E-85', 'E-86', 'E-87'], slackUserId: 'U0A7AQNM476' },
  { id: 'mate-22', name: '김승철', nickname: 'Ciso', company: 'GS리테일', groupId: 'retail', teamNumbers: GROUP_TEAMS.retail, slackUserId: 'U0A7565GHGW' },
  { id: 'mate-23', name: '박지훈', nickname: 'Ready', company: 'GS리테일', groupId: 'retail', teamNumbers: GROUP_TEAMS.retail, slackUserId: 'U0A7L551CNM' },
  { id: 'mate-24', name: '안효진', nickname: 'Mario', company: 'GS리테일', groupId: 'retail', teamNumbers: GROUP_TEAMS.retail, slackUserId: 'U0A7AQS8F0U' },
  { id: 'mate-25', name: '이재현', nickname: 'L', company: 'GS스포츠', teamNumbers: [], slackUserId: 'U0A6RPQTWUF' },
  { id: 'mate-26', name: '박형남', nickname: 'Jason', company: 'GSC 예울마루', teamNumbers: ['E-26', 'E-27'], slackUserId: 'U0A7GSR77MZ' },
  { id: 'mate-28', name: '진영주', nickname: 'Pablo', company: 'GS칼텍스', teamNumbers: ['E-20', 'E-21', 'E-22'], slackUserId: 'U0A7776JMS6' },
  { id: 'mate-29', name: '홍승표', nickname: 'Pio', company: 'GS칼텍스', teamNumbers: ['E-23', 'E-24', 'E-25'], slackUserId: 'U0A7AQS77RS' },
  { id: 'mate-30', name: '김민엽', nickname: 'Tyler', company: 'GS파워', teamNumbers: ['E-16', 'E-17'], slackUserId: 'U0A7777H726' },
  { id: 'mate-31', name: '이상윤', nickname: 'Yun', company: 'GS파워', teamNumbers: ['E-18', 'E-19'], slackUserId: 'U0A7564NH9U' },
  { id: 'mate-32', name: '공민우', nickname: '', company: '캐롯글로벌', groupId: 'retail', teamNumbers: GROUP_TEAMS.retail, slackUserId: 'U0BQV5RERDL' },
  { id: 'mate-33', name: '조현아', nickname: '', company: '캐롯글로벌', groupId: 'retail', teamNumbers: GROUP_TEAMS.retail, slackUserId: 'U0BSWD9L0ER' },
  { id: 'mate-34', name: '장지수', nickname: '', company: '캐롯글로벌', groupId: 'retail', teamNumbers: GROUP_TEAMS.retail, slackUserId: 'U0BQV5Q8BKQ' },
  { id: 'mate-35', name: '김혜린', nickname: '', company: '캐롯글로벌', groupId: 'retail', teamNumbers: GROUP_TEAMS.retail, slackUserId: 'U0BFN296B1R' },
  { id: 'mate-36', name: '마재훈', nickname: '', company: '캐롯글로벌', groupId: 'retail', teamNumbers: GROUP_TEAMS.retail, slackUserId: 'U0BTUMDKMEC' },
  { id: 'mate-37', name: '이혜준', nickname: '', company: '캐롯글로벌', groupId: 'retail', teamNumbers: GROUP_TEAMS.retail, slackUserId: 'U0BSZHLP23X' },
  { id: 'mate-38', name: '황시아', nickname: '', company: '캐롯글로벌', teamNumbers: ['E-28', 'E-29'], slackUserId: 'U0A20QMDWNT' },
  { id: 'mate-39', name: '권두순', nickname: '', company: '캐롯글로벌', teamNumbers: ['E-30', 'E-31'], slackUserId: 'U0BSTM908LC' },
  { id: 'mate-40', name: '김현중', nickname: '', company: '캐롯글로벌', teamNumbers: ['E-35', 'E-36', 'E-37'], slackUserId: 'U0BTL3FBYP4' },
  { id: 'mate-42', name: '이소연', nickname: '', company: '캐롯글로벌', teamNumbers: ['E-38', 'E-39', 'E-40'], slackUserId: 'U0BTRHDUNHL' },
  // 배정표의 '캐롯글로벌 1'이 이분입니다
  { id: 'mate-41', name: '이영미', nickname: '', company: '캐롯글로벌', teamNumbers: ['E-100', 'E-101', 'E-102'], slackUserId: 'U0BUTKF6G2E' },
  { id: 'mate-44', name: '이상욱', nickname: 'Lodi', company: 'GS차지비', teamNumbers: ['E-07', 'E-08'], slackUserId: 'U0A82DA597S' },
  // 배정표에서 뒤늦게 나온 두 분입니다 (김민수/Liam은 플레이 메이트 명단에도
  // 있습니다 — 이번 배정에서는 마스터 메이트로 팀을 맡았습니다)
  { id: 'mate-45', name: '심재혁', nickname: 'Simpson', company: '(주)GS', teamNumbers: ['E-203', 'E-204', 'E-205', 'E-206'], slackUserId: 'U08Q1RBGWP7' },
  { id: 'mate-46', name: '김민수', nickname: 'Liam', company: '삼양통상', teamNumbers: ['E-208'], slackUserId: 'U0A7M79J606' },
  // 최종 배정표에서 새로 마스터 메이트가 된 분들입니다. 김현민·하지희·장수연
  // 님은 플레이 메이트 명단에도 있습니다 — 이번 배정에서 마스터 메이트로
  // 팀을 맡았습니다. 김헌기·한정민 님은 현업이라 아직 슬랙 계정이 없습니다 —
  // 계정이 생기면 채웁니다. 그때까지 호출 알림에는 이름만 나갑니다.
  { id: 'mate-47', name: '김원희', nickname: 'Ian', company: '', teamNumbers: ['E-01', 'E-43', 'E-44'], slackUserId: 'U08DB572AF4' },
  { id: 'mate-48', name: '김현민', nickname: 'Charlie', company: 'GS에너지', teamNumbers: ['E-02'], slackUserId: 'U0A749Q7TD4' },
  { id: 'mate-49', name: '김헌기', nickname: 'darion', company: '', groupId: 'retail', teamNumbers: GROUP_TEAMS.retail, slackUserId: '' },
  { id: 'mate-50', name: '한정민', nickname: 'Peter', company: '', groupId: 'retail', teamNumbers: GROUP_TEAMS.retail, slackUserId: '' },
  { id: 'mate-51', name: '하지희', nickname: 'Lia', company: 'GS스포츠', teamNumbers: ['E-95', 'E-96'], slackUserId: 'U0AHW7U9A57' },
  { id: 'mate-52', name: '장수연', nickname: 'Jen', company: '삼양인터내셔날', teamNumbers: ['E-207'], slackUserId: 'U0A6RPQSR8X' },
  // 리테일 조 전체를 보는 두 분(Ciso · HONG)입니다. 담당 구간을 따로 나눠
  // 받지는 않지만 조에 들어오는 호출을 전부 봐야 하는 역할이라, 리테일
  // 그룹에 함께 넣습니다. HONG은 플레이 메이트 명단에도 있습니다.
  { id: 'mate-53', name: '권태홍', nickname: 'HONG', company: 'GS리테일', groupId: 'retail', teamNumbers: GROUP_TEAMS.retail, slackUserId: 'U0A769LAGRY' },
]

// 3-2. 플레이 메이트 — 팀 곁에서 아이디어를 함께 보는 사람들.
//    호출 알림을 받지 않으므로 슬랙 ID를 두지 않습니다.
//    호출 대상이 아니라 관리자 앱의 호출 배정에는 들어가지 않습니다.
//    (지금은 명단만 보관합니다 — 코드에서 읽는 곳이 아직 없습니다)
export const PLAY_MATES = [
  { id: 'play-01', name: '김현민', nickname: 'Charlie', company: 'GS에너지' },
  { id: 'play-03', name: '정원재', nickname: 'Jeff', company: '파르나스호텔' },
  { id: 'play-04', name: '허재연', nickname: 'Jenna', company: '파르나스호텔' },
  { id: 'play-05', name: '곽서림', nickname: 'Lisa', company: '파르나스호텔' },
  { id: 'play-06', name: '신명준', nickname: 'M', company: '반월열병합발전' },
  { id: 'play-07', name: '곽동욱', nickname: 'Levi', company: 'GS EPS' },
  { id: 'play-08', name: '장윤수', nickname: 'Paul', company: 'GS건설' },
  { id: 'play-09', name: '이형민', nickname: 'Lee Leo', company: 'GS건설' },
  { id: 'play-10', name: '문정길', nickname: 'Jade', company: 'GS글로벌' },
  { id: 'play-11', name: '박재학', nickname: 'Jack', company: 'GS 엔텍' },
  { id: 'play-12', name: '고영남', nickname: 'Kevin', company: 'GS 엔텍' },
  { id: 'play-13', name: '천지인', nickname: 'Jinny', company: 'GS글로벌' },
  { id: 'play-14', name: '권태홍', nickname: 'HONG', company: 'GS리테일' },
  { id: 'play-15', name: '김정화', nickname: 'Kevin', company: 'GS리테일' },
  { id: 'play-16', name: '김유진', nickname: 'Jia', company: 'GS리테일' },
  { id: 'play-17', name: '배지수', nickname: 'Suzanne', company: 'GS문화재단' },
  { id: 'play-18', name: '김용일', nickname: 'Henry', company: 'GS스포츠' },
  { id: 'play-19', name: '하지희', nickname: 'Lia', company: 'GS스포츠' },
  { id: 'play-20', name: '지동한', nickname: 'David', company: 'GS칼텍스' },
  { id: 'play-21', name: '홍지영', nickname: 'JY', company: 'GS칼텍스' },
  { id: 'play-22', name: '노엘', nickname: 'Eddy', company: 'GS칼텍스' },
  { id: 'play-23', name: '유용희', nickname: 'Willie', company: 'GS파워' },
  { id: 'play-24', name: '윤동환', nickname: 'Chris', company: '자이에스엔디' },
  { id: 'play-25', name: '권용환', nickname: 'Quan', company: 'GS파워' },
  { id: 'play-26', name: '이승재', nickname: 'Jerry', company: '광동제약' },
  { id: 'play-27', name: '채지혜', nickname: 'Day', company: '광동제약' },
  { id: 'play-28', name: '이진주', nickname: 'Judy', company: '광동제약' },
  { id: 'play-29', name: '서기호', nickname: 'Kyo', company: '광동제약' },
  { id: 'play-30', name: '장지원', nickname: 'Anna', company: '광동제약' },
  { id: 'play-31', name: '이성덕', nickname: 'Lee', company: '삼양인터내셔날' },
  { id: 'play-32', name: '장수연', nickname: 'Jen', company: '삼양인터내셔날' },
  { id: 'play-33', name: '김민수', nickname: 'Liam', company: '삼양통상' },
  { id: 'play-34', name: '황세현', nickname: 'Sean', company: '삼양통상' },
  { id: 'play-35', name: '이제승', nickname: 'Jason', company: '일동제약' },
  { id: 'play-36', name: '유동환', nickname: 'Brody', company: '일동제약' },
  { id: 'play-37', name: '권순형', nickname: 'Mike', company: '일동제약' },
]

// 3-3. 식음 운영 — 주문·배부 현황을 맡습니다.
//    호출 알림을 받지 않으므로 슬랙 ID를 두지 않습니다. 주문 재촉은 채널
//    전체에 한 번 나가는 방식이라 개인 멘션이 필요하지 않습니다.
//    주문 현황 화면과 미주문 팀 재촉 권한이 이분에게 있습니다(아래 orderManager).
export const FOOD_CREW = [
  //  orderManager: 주문 현황을 맡은 사람. 미주문 팀을 확인하고 주문하라고
  //  재촉할 수 있습니다. 호출·등록 쪽 권한은 총관리자에게만 있습니다.
  { id: 'food-01', name: '한성우', nickname: 'Austin', company: '(주)GS', orderManager: true },
]

// 3-4. 크루 조회
//    관리자 앱에 들어오는 사람은 마스터 메이트·총관리자·식음 운영입니다.
//    플레이 메이트는 이 앱을 쓰지 않아 넣지 않습니다.
export const ADMIN_CREW = [...COACH_ASSIGNMENTS, ...FOOD_CREW]

// 명단에 같은 이름이 둘 있으면(이상윤·Yunie / 이상윤·Yun) 이름만으로는
// 누구인지 가릴 수 없습니다. 그래서 입장할 때 고른 사람의 id를 기기에
// 저장하고, 조회는 id로 합니다. 이름 조회는 옛 기록을 위한 대비책입니다.
export function crewById(crewId) {
  return ADMIN_CREW.find((c) => c.id === crewId) || null
}
// 입장 기록에서 명단 id를 되찾습니다. crewId를 저장하기 전에 들어온 기록에도
// 쓰려고 이름으로 한 번 더 찾아보되, 겹치는 이름은 포기합니다 — 둘 중
// 누구인지 모르는 채로 한 사람을 고르면 남의 담당 팀이 붙습니다.
export function resolveCrewId(coach) {
  if (!coach) return ""
  if (coach.crewId) return coach.crewId
  if (!crewNameIsUnique(coach.name)) return ""
  return ADMIN_CREW.find((c) => c.name === coach.name)?.id || ""
}
export function crewFor(coach) {
  return crewById(resolveCrewId(coach))
}

// 겹치는 이름 목록 — 이름만으로 사람을 특정할 수 없는 경우를 가려냅니다
const DUPLICATE_CREW_NAMES = new Set(
  ADMIN_CREW.map((c) => c.name).filter((name, i, all) => name && all.indexOf(name) !== i),
)
// 이름만으로 사람을 특정할 수 있는지 — 겹치는 이름이면 false
export function crewNameIsUnique(name) {
  return !!name && !DUPLICATE_CREW_NAMES.has(name)
}
// 크루는 서로를 닉네임으로 부르므로 이름 옆에 함께 씁니다 — 이름만 적으면
// 누구인지 못 알아보는 경우가 있습니다.
// (겹치는 이름을 가리는 것도 이 표기가 겸합니다: 이상윤 (Yunie) / 이상윤 (Yun))
//
// 닉네임이 없는 분은 소속을 대신 씁니다. 지금은 캐롯글로벌 11분이 그렇습니다
// — 시트의 닉네임 칸이 회사 이메일이라 비워 뒀습니다. 이름만 적히면 누구인지
// 짚을 단서가 없습니다.
const COMPANY_SHORT = { 캐롯글로벌: '캐롯' }
export function crewLabel(member) {
  if (!member) return ""
  const tag = member.nickname || COMPANY_SHORT[member.company] || member.company
  return tag ? member.name + " (" + tag + ")" : member.name
}

// 팀 번호로 담당자를 찾아 표기까지 만들어 줍니다 (화면 표시 전용).
// 짝을 이루는 비교는 이름이 아니라 crewId로 하세요 — 이름은 겹칩니다.
export function assignedCoachLabel(teamId) {
  // 그룹 구간은 사람 이름 하나로 적을 수 없습니다 — 누가 올지 정해두지
  // 않는 것이 그룹 배정이라, 첫 번째 사람의 이름을 적으면 거짓말이 됩니다.
  const group = coachGroupForTeam(teamId)
  if (group) return group.label + ' 마스터 메이트'
  return crewLabel(getAssignedCoachForTeam(teamId))
}

// 담당 구간이 없는 게 정상인 사람들 — 비워두면 배정을 빠뜨린 것처럼 보입니다
export function crewRoleLabel(member) {
  if (!member) return ""
  if (member.callManager) return "총관리자"
  if (member.orderManager) return "식음 운영"
  return ""
}

// ---------------------------------------------------------------
// 4. 알레르기 선택지
//    ⚠️ 아래 MENUS에 실제로 들어간 성분만 선택지로 둡니다. 메뉴에 없는
//      성분을 늘어놓으면 대체 메뉴 준비와 무관한 응답이 쌓이기 때문입니다.
//      → 메뉴가 바뀌면 이 목록도 함께 갱신하세요.
//    ※ 알레르기 대응 메뉴를 미리 준비하는 게 아니라, 여기서 수집한
//      현황을 운영진이 확인해 대체 메뉴를 준비하는 방식입니다.
//    ※ 저장 형태: team.allergies = [[사람1의 알레르기...], [사람2의 알레르기...]]
//      (사람 단위로 배열을 나눠 저장 — 1명이 여러 개인지 여러 명이 각각
//      하나씩인지에 따라 대체 메뉴 준비 개수/조합이 달라지기 때문)
//    ※ 이 표기는 MENUS의 allergens와 정확히 일치해야 합니다. 그래야
//      "이 사람이 어떤 메뉴를 먹을 수 있는지"(아래 personDiet/teamDiet)와
//      관리자 화면의 대체식 집계가 동작합니다.
// ---------------------------------------------------------------
export const ALLERGY_OPTIONS = ['우유', '밀', '돼지고기', '쇠고기', '토마토']

// ---------------------------------------------------------------
// 5. 규모 · 운영 상수
// ---------------------------------------------------------------
export const TOTAL_TEAMS = ALL_TEAM_IDS.length // 현장 참가 팀 수 (필드 104 + 개발 31)
export const DELIVERY_TEAM_RANGE_SIZE = 25 // 관리자 배부 화면의 팀 번호 구간 크기
// 시트에 없는 번호로 등록할 때만 쓰이는 상한 (보통은 TEAMS[teamId].size가 상한)
export const MAX_MEMBER_COUNT = 10
export const PARTICIPANT_POLL_MS = 5000 // 참가자 화면 폴링 주기
export const ADMIN_POLL_MS = 3000 // 관리자 화면 폴링 주기 (호출 알림 포함)

// 참가자 화면 다크모드 시간대 (밤 20시 ~ 아침 7시 — 야식/새벽 눈부심 방지)
export const DARK_MODE_HOURS = { start: 20, end: 7 }

// ---------------------------------------------------------------
// 6. 메뉴  (확정 — 야식 피자 2종 / 아침 베이글 샌드위치 2종)
//    음료는 냉장고 자율 이용이라 메뉴에 없습니다. 전부 음식이며,
//    식사(끼니)마다 팀 인원수만큼만 담을 수 있습니다.
//    badges     : 메뉴 카드에 표시되는 식이 정보 뱃지 (예: '⚠️ 밀', '🌱 비건')
//    shortLabel : 관리자 배부 목록처럼 좁은 칸에서 쓰는 짧은 이름. 없으면 name.
//    name       : 메뉴 이름. 줄바꿈 문자(\n)를 넣으면 메뉴 카드에서 그 위치에서
//                 줄이 나뉩니다 (카드 이름에만 적용 — 장바구니·관리자 표기와
//                 CSV에서는 공백으로 눕혀 한 줄로 나옵니다).
//    image      : 음식 사진 경로. 파일은 participant-app/public/menu/ 에 두고
//                 './menu/파일명' 으로 씁니다 (배포 경로가 바뀌어도 동작하도록
//                 상대 경로 — vite.config의 base: './' 와 짝). 비면 🍽️ 표시.
//                 ※ 사진은 참가자 앱에만 필요하므로 admin-app에는 두지 않습니다
//                   (관리자 화면은 사진을 쓰지 않음 — 번들만 무거워짐).
//    allergyNote: 알레르기 상세 설명. **비워두면 allergens 로 자동 생성**됩니다
//                 (아래 파생 값 참고). 직접 문구를 쓰면 그 값이 그대로 쓰입니다.
//    allergens  : 이 메뉴에 포함된 알레르기 유발 성분 목록.
//                 ⚠️ 반드시 ALLERGY_OPTIONS와 똑같은 표기로 적으세요.
//                 (예: allergens: ['밀', '계란'])
//                 팀 등록 알레르기와 겹치는 인원을 관리자 화면에서 자동 집계합니다.
// ---------------------------------------------------------------
// stock = 그 메뉴로 준비된 총 수량(전 팀 합계 상한). 합계가 여기에 닿으면
//   참가자 화면에서 자동으로 닫힙니다 — 운영진이 손으로 품절을 누를 필요가
//   없습니다. 남은 수량은 서버가 실제 주문 합계로 계산합니다.
//   ⚠️ 서버(shared-api)도 같은 상한을 알아야 초과 저장을 막을 수 있습니다.
//     서버는 MENU_STOCK 환경변수(없으면 코드 기본값)를 씁니다. 여기 값을
//     바꾸면 서버 기본값도 함께 고치세요.
export const MENUS = {
  midnight: [
    {
      id: 'md-a',
      stock: 300,
      name: '페퍼로니 딜라이트 (1인)',
      shortLabel: '페퍼로니',
      badges: [],
      image: './menu/pepperoni-delight.png',
      allergyNote: '',
      allergens: ['우유', '밀', '돼지고기', '토마토'],
    },
    {
      id: 'md-b',
      stock: 300,
      name: '수퍼잭슨 (1인)',
      shortLabel: '수퍼잭슨',
      badges: [],
      image: './menu/super-jackson.png',
      // 카드가 가로형으로 바뀌어 성분 다섯 개가 한 줄에 들어갑니다.
      // 손으로 넣었던 줄바꿈을 빼고 allergens 에서 자동 생성하게 둡니다.
      allergyNote: '',
      allergens: ['우유', '밀', '돼지고기', '쇠고기', '토마토'],
    },
  ],
  breakfast: [
    {
      id: 'bf-a',
      stock: 200,
      name: '잠봉뵈르 샌드위치',
      shortLabel: '잠봉뵈르',
      badges: [],
      image: './menu/jambon-beurre.jpg',
      allergyNote: '',
      allergens: ['우유', '밀', '돼지고기'],
    },
    {
      id: 'bf-b',
      stock: 200,
      name: '햄&치즈 샌드위치',
      shortLabel: '햄&치즈',
      badges: [],
      image: './menu/ham-cheese.jpg',
      allergyNote: '',
      allergens: ['우유', '밀', '돼지고기', '토마토'],
    },
  ],
}

// ---------------------------------------------------------------
// 6. 주문 없이 제공되는 식사  (참가자는 보기만 합니다)
//
//    저녁·점심은 인원수대로 일괄 제공해서 주문을 받지 않습니다. 그래도
//    "무엇이 나오는지"는 참가자가 미리 알고 싶어 하므로 구성을 보여줍니다.
//    - label   : 화면에 쓰는 이름
//    - servedAt: 제공 시각. 아직 정해지지 않았으면 빈 문자열로 두세요
//                (비어 있으면 화면에 시각을 쓰지 않습니다)
//    - items   : 케이터링에서 받은 구성 그대로. 순서도 그대로 둡니다
//    ※ 알레르기 대체식 계산(personDiet/teamDiet)에는 쓰이지 않습니다.
//      그건 주문받는 식사(MENUS)만 대상입니다.
// ---------------------------------------------------------------
export const SERVED_MEALS = [
  {
    id: 'day1-snack',
    label: '[DAY 1] 간식',
    icon: '🍔',
    cuisine: '크라이치즈버거',
    servedAt: '15:00',
    photos: [
      // 가로로 긴 사진입니다. 기본 4:3 틀에 넣으면 좌우가 잘려서, 파일의
      // 실제 비율(720x376)을 그대로 씁니다 — 잘리지 않고 높이도 줄어듭니다.
      { src: './served/day1-snack-burger.jpg', caption: '크라이치즈버거 & 감자튀김 세트', ratio: '720 / 376' },
    ],
    // 항목 목록 없음 — 사진 캡션이 같은 말을 합니다
  },
  {
    id: 'day1-dinner',
    label: '[DAY 1] 저녁',
    cuisine: '한식',
    servedAt: '18:00',
    photos: [{ src: './served/day1-dinner.jpg', caption: '파르나스 호텔 도시락 (한식)' }],
    items: [
      '당근 케이크',
      '제철 과일',
      '바삭 병아리콩, 아보카도 샐러드',
      '차돌 묵은지 볶음',
      '영양밥',
      '갈비살 구이(소고기)',
      '닭갈비',
      '민물 장어',
      '마늘 간장 전복구이',
      '생선전',
      '씨앗 젓갈',
      '멸치 볶음',
      '얼갈이 된장국',
    ],
  },
  {
    id: 'day2-lunch',
    label: '[DAY 2] 점심',
    icon: '🥩',
    cuisine: '양식',
    servedAt: '12:00',
    photos: [{ src: './served/day2-lunch.jpg', caption: '파르나스 호텔 도시락 (양식)' }],
    items: [
      '얼그레이 치즈 케이크',
      '제철 과일',
      '로메인 시저 샐러드',
      '컬러풀 토마토, 치즈',
      '버섯 크러스트 햄버거 스테이크와 감자 구이(소고기)',
      '허브크러스트 가자미',
      '바베큐 치킨',
      '허브 버터 새우',
      '소시지',
      '올리브',
      '피클',
      '양송이 수프',
    ],
  },
  {
    id: 'day2-snack',
    label: '[DAY 2] 간식',
    icon: '🍨',
    cuisine: '아이스크림 & 파이',
    servedAt: '14:00',
    // 아이스크림·파이가 각각 두 종류라, 무엇을 고를 수 있는지 사진으로
    // 보여줍니다. 글자만으로는 어떤 건지 알기 어렵습니다.
    photos: [
      { src: './served/day2-snack-icecream-jersey.jpg', caption: '벤슨 저지밀크 아이스크림' },
      { src: './served/day2-snack-icecream-cookie.jpg', caption: '벤슨 쿠키앤크림 아이스크림' },
      { src: './served/day2-snack-pie-apple.jpg', caption: '포컬포인트 충주 사과 파이' },
      { src: './served/day2-snack-pie-lowsugar.jpg', caption: '포컬포인트 저당 충주 사과 파이' },
    ],
    // 항목 목록 없음 — 사진 캡션이 같은 말을 합니다.
    // 넷 다 받는 게 아니라 각각 한 종류를 고르는 것이라, 기본 안내 문구
    // (인원수대로 제공) 대신 이 문구를 씁니다.
    note: '아이스크림, 파이는 각각 원하는 종류로 제공됩니다.',
  },
]

// ---------------------------------------------------------------
// (파생 값 — 수정하지 마세요)
// ---------------------------------------------------------------
export const ALL_MENUS = Object.values(MENUS).flat()

// 알레르기 표기 자동 생성 — allergyNote가 비어 있으면 allergens 로 문구를 만듭니다.
// 같은 정보를 두 곳에 손으로 적다 어긋나면 참가자에게 잘못된 알레르기 정보가
// 보이므로, 한쪽(allergens)만 관리하면 되게 했습니다.
ALL_MENUS.forEach((m) => {
  if (!m.allergyNote && m.allergens?.length) {
    m.allergyNote = `⚠️ ${m.allergens.join('·')} 포함`
  }
  // 1인분 표기가 군더더기인 곳(관리자 합산표)에서 쓰는 이름.
  // '페퍼로니 딜라이트 (1인)' → '페퍼로니 딜라이트'
  m.baseName = m.name.split('(')[0].trim() || m.name
})
export const MENU_BY_ID = Object.fromEntries(ALL_MENUS.map((m) => [m.id, m]))
// 그 메뉴의 준비 수량 (없으면 null — 상한을 두지 않는 메뉴)
export function menuStock(menuId) {
  const n = MENU_BY_ID[menuId]?.stock
  return Number.isFinite(n) && n > 0 ? n : null
}
export const MEAL_BY_ID = Object.fromEntries(MEALS.map((m) => [m.id, m]))

// 팀 번호로 담당 마스터 메이트를 찾음 (teamNumbers가 비어있으면 null → 미배정)
// teamNumbers에는 'E-01' 같은 팀 번호가 들어갑니다.
// 리그가 다르면 같은 숫자라도 다른 팀이라 접두어까지 비교해야 합니다.
export function getAssignedCoachForTeam(teamId) {
  return getAssignedCoachesForTeam(teamId)[0] || null
}

// 그 팀을 맡은 사람 전부. 보통은 한 명이고, 그룹으로 묶인 구간
// (COACH_GROUPS — 리테일 조)에서는 여럿입니다.
// 호출 알림은 이 목록 전원에게 갑니다. 한 명만 부르면 그 사람이 자리를
// 비웠을 때 아무도 모르고, 애초에 "누가 갈지 정하지 않는" 것이 그룹 배정의
// 취지이기도 합니다.
export function getAssignedCoachesForTeam(teamId) {
  const id = String(teamId || '')
  if (!id) return []
  return COACH_ASSIGNMENTS.filter((c) => c.teamNumbers.includes(id))
}

// 그 팀이 그룹 배정 구간인지 (아니면 null)
export function coachGroupForTeam(teamId) {
  const id = String(teamId || '')
  if (!id) return null
  return COACH_GROUPS.find((g) => g.teamNumbers.includes(id)) || null
}

// 이 사람이 그 팀의 담당인지. 이름으로 비교하면 동명이인(이상윤 두 분)에서
// 어긋나고, 그룹 구간에서는 '첫 번째 사람'만 담당이 되어버립니다.
export function isCoachForTeam(member, teamId) {
  if (!member) return false
  return (member.teamNumbers || []).includes(String(teamId || ''))
}

// teamNumbers 배열을 "1~25번" / "1~10, 30~32번" 같은 범위 문자열로 압축
// (연속 구간은 a~b로 묶음, 비어있으면 null → "미배정" 표시용)
// 팀 번호를 리그별로 묶습니다 — 화면에서 격자·목록을 나눌 때 씁니다.
//   groupByLeague(['E-01','G-02']) → [{ league: 필드리그, ids: ['E-01'] }, ...]
export function groupByLeague(teamIds) {
  return LEAGUES.map((league) => ({
    league,
    ids: (teamIds || [])
      // 접두어가 아니라 소속으로 나눕니다 — G-47을 '개발자리그' 칸에 넣으면
      // 담당 메이트가 자기 팀을 엉뚱한 제목 아래에서 찾게 됩니다.
      .filter((id) => leagueOf(id)?.id === league.id)
      .sort((a, b) => teamSortKey(a) - teamSortKey(b)),
  })).filter((g) => g.ids.length > 0)
}

// 담당 팀 번호를 "E-01~E-25" 처럼 압축합니다.
// 리그가 섞이면 " · "로 나눠 씁니다 (E-01~E-20 · G-01~G-05).
export function formatTeamRange(teamIds) {
  const groups = groupByLeague(teamIds)
  if (!groups.length) return null
  // 접두어는 리그가 아니라 팀 번호에서 그대로 가져옵니다. 한 리그 안에
  // 두 접두어가 섞일 수 있기 때문입니다 (필드리그의 G-47). 리그 접두어로
  // 다시 만들면 'G-47'이 'E-47' — 실제로 있는 다른 팀 — 로 바뀝니다.
  const 조각 = groups.map(({ ids }) => {
    const 항목 = ids.map((id) => ({
      prefix: String(id).charAt(0),
      num: parseInt(String(id).slice(2), 10),
    }))
    const parts = []
    let start = 항목[0]
    let prev = 항목[0]
    const 표기 = (x) => x.prefix + '-' + String(x.num).padStart(2, '0')
    for (let i = 1; i <= 항목.length; i++) {
      const cur = 항목[i]
      if (cur && cur.prefix === prev.prefix && cur.num === prev.num + 1) {
        prev = cur
        continue
      }
      parts.push(start === prev ? 표기(start) : 표기(start) + '~' + 표기(prev))
      if (cur) {
        start = cur
        prev = cur
      }
    }
    return parts.join(', ')
  })
  return 조각.join(' · ')
}

// ---------------------------------------------------------------
// 알레르기 → 식사 가능 여부 판정  (수집한 알레르기를 "해석"하는 부분)
//
//   같은 끼니의 메뉴들이 성분을 거의 공유하기 때문에, 알레르기 한 항목만
//   달라도 결과가 크게 갈립니다. 예를 들어 현재 메뉴 구성에서는
//     - 우유·밀·돼지고기 중 하나라도 있으면 → 4개 메뉴 전부 불가(두 끼 대체식)
//     - 쇠고기만 있으면              → 야식은 페퍼로니만, 아침은 제한 없음
//     - 토마토만 있으면              → 야식은 불가, 아침은 잠봉뵈르만
//   이 판정을 화면마다 따로 계산하면 서로 어긋나므로 여기 한 곳에 둡니다.
//
//   ※ 메뉴/알레르기 구성이 바뀌면 이 함수는 그대로 두고 MENUS만 고치면 됩니다
//     (판정은 allergens 값에서 파생되므로 하드코딩된 규칙이 없습니다).
// ---------------------------------------------------------------

// 특정 알레르기 목록을 가진 1명이 해당 메뉴를 먹을 수 있는지
export function canEatMenu(menu, allergies) {
  const mine = allergies || []
  return !(menu.allergens || []).some((a) => mine.includes(a))
}

// 1명 기준 판정 → { byMeal: { [mealId]: 먹을 수 있는 메뉴[] }, needsAlt: [mealId...] }
export function personDiet(allergies) {
  const byMeal = {}
  const needsAlt = []
  MEALS.forEach((meal) => {
    const eatable = (MENUS[meal.id] || []).filter((m) => canEatMenu(m, allergies))
    byMeal[meal.id] = eatable
    if (eatable.length === 0) needsAlt.push(meal.id)
  })
  return { byMeal, needsAlt }
}

// 팀 전체 판정. team.allergies = [[1인의 알레르기...], [2인의 알레르기...]]
//   - eatableByMenu : 메뉴별로 "먹을 수 있는 팀원 수" (주문 담기 상한 계산용)
//   - eatableByMeal : 끼니별로 "한 가지라도 먹을 수 있는 팀원 수"
//   - altByMeal     : 끼니별로 "대체식이 필요한 인원 수"
//   - altPeople     : 대체식 대상 인원의 알레르기 목록 (케이터링 준비 내역용)
export function teamDiet(memberCount, allergies) {
  const people = (allergies || []).map((p) => (Array.isArray(p) ? p : [p]))
  // 알레르기를 입력하지 않은 나머지 인원은 제약이 없는 사람으로 계산
  const plain = Math.max(0, (memberCount || 0) - people.length)

  const eatableByMenu = {}
  const eatableByMeal = {}
  const altByMeal = {}
  const altPeople = {}

  MEALS.forEach((meal) => {
    ;(MENUS[meal.id] || []).forEach((menu) => {
      eatableByMenu[menu.id] = plain + people.filter((p) => canEatMenu(menu, p)).length
    })
    const okPeople = people.filter((p) => (MENUS[meal.id] || []).some((m) => canEatMenu(m, p)))
    eatableByMeal[meal.id] = plain + okPeople.length
    const alt = people.filter((p) => !(MENUS[meal.id] || []).some((m) => canEatMenu(m, p)))
    altByMeal[meal.id] = alt.length
    altPeople[meal.id] = alt
  })

  return { eatableByMenu, eatableByMeal, altByMeal, altPeople }
}
