import { Fragment, useCallback, useMemo, useState } from 'react'
import {
  MEALS,
  MENUS,
  MENU_BY_ID,
  MEAL_BY_ID,
  LEAGUES,
  CATERING_SWAPS,
  cateringSwapCounts,
  DELIVERY_TEAM_RANGE_SIZE,
  getAssignedCoachForTeam,
  coachGroupForTeam,
  personDiet,
  TEAM_IDS_BY_LEAGUE,
} from '../config.js'
import { getOpenMeals, now } from '../lib/time.js'
import { useMediaQuery } from '../lib/useMediaQuery.js'
import Icon from './Icon.jsx'
import AdminDock from './AdminDock.jsx'
import { useSheetDrag } from '../lib/useSheetDrag.js'
import { useDialogFocus } from '../lib/useDialogFocus.js'

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

// 배부 목록의 한 줄.
//
// 배부하는 사람이 읽는 것은 "팀 번호 → 메뉴별 개수"뿐이라, 수량을 가장 크게
// 두고 한 줄에 담습니다. 메뉴 칸은 그 끼니의 메뉴 수만큼 **고정**해서, 한 메뉴만
// 주문한 팀이 섞여 있어도 숫자가 항상 같은 열에 옵니다(주문 없는 칸은 비움).
// 인원수는 배부에 쓰이지 않아 표시하지 않습니다.
function TeamRowList({ rows, mealFilter, singleMeal, isDelivered, onToggleDelivered }) {
  const slots = singleMeal ? MENUS[mealFilter] || [] : []
  return (
    // --rows: 넓은 화면에서 두 칼럼으로 나눌 때 왼쪽 칼럼에 넣을 행 수.
    // 홀수면 왼쪽을 하나 더 채웁니다(위에서 아래로 읽는 순서와 맞음).
    <div className="team-rows" style={{ '--rows': Math.ceil(rows.length / 2) }}>
      {rows.map((row) => {
        const done = isDelivered(row.teamId)
        const qtyOf = (menuId) =>
          row.items.filter((it) => it.menuId === menuId).reduce((sum, it) => sum + it.qty, 0)
        return (
          <div key={row.teamId} className={`team-row${done ? ' delivered' : ''}`}>
            <b className="team-row-no">팀 {row.teamId}</b>
            {slots.length ? (
              <div className="team-row-slots" style={{ '--slots': slots.length }}>
                {slots.map((menu) => {
                  const qty = qtyOf(menu.id)
                  return (
                    <span key={menu.id} className={`slot${qty ? '' : ' empty'}`}>
                      {qty > 0 && (
                        <>
                          <span className="slot-name">{menu.shortLabel || menu.name}</span>
                          <b className="slot-qty">{qty}</b>
                        </>
                      )}
                    </span>
                  )
                })}
              </div>
            ) : (
              /* 끼니 '전체' 보기 — 고정 칸이 성립하지 않아 나열합니다 */
              <div className="team-row-slots wrap">
                {row.items.map((item, index) => (
                  <span key={index} className="slot">
                    <span className="meal-tag">{MEAL_BY_ID[item.mealId]?.label}</span>
                    <span className="slot-name">
                      {MENU_BY_ID[item.menuId]?.shortLabel || MENU_BY_ID[item.menuId]?.name}
                    </span>
                    <b className="slot-qty">{item.qty}</b>
                  </span>
                ))}
              </div>
            )}
            {singleMeal && (
              <label className="deliver-check">
                <input
                  type="checkbox"
                  checked={done}
                  onChange={(event) =>
                    onToggleDelivered(row.teamId, mealFilter, event.target.checked)
                  }
                />
                {/* 아주 좁은 폰에서는 메뉴명이 잘리지 않게 이 글자를 접습니다
                    (체크박스만으로도 뜻이 통함) */}
                <span className="tiny-hide">완료</span>
              </label>
            )}
          </div>
        )
      })}
    </div>
  )
}

// 주문 현황 (PRD 5.2): 팀별 내역, 시간대 필터, 메뉴별 합산, 품절 처리,
// 팀 번호 검색, 알레르기 현황, 배부 체크(끼니별), 인쇄용 체크리스트.
// 식사 선택(DAY 1 야식 / DAY 2 아침)은 좌측 메뉴의 하위 항목으로 옮겨졌으므로
// mealFilter는 App에서 관리하고 prop으로 받습니다.
// 목록 옆에 붙는 짧은 담당 표기. 리테일 조처럼 여럿이 한 구간을 맡는
// 곳에서는 구성원 한 명의 이름을 적으면 거짓이 되므로 그룹 이름을 씁니다.
function assignedShortName(teamId) {
  const group = coachGroupForTeam(teamId)
  if (group) return group.label
  return getAssignedCoachForTeam(teamId)?.name
}
export default function OrdersTab({
  scan,
  mealFilter,
  onToggleSoldout,
  onToggleDelivered,
  onSelectMeal,
  onOpenMenu,
  menuAlert,
  menuOpen,
  showMenu,
}) {
  // 넓은 화면에서는 왼쪽 사이드바가 메뉴 역할을 하므로 아래 바가 없습니다
  const wide = useMediaQuery('(min-width: 900px)')
  const [showSoldoutPanel, setShowSoldoutPanel] = useState(false)
  const [showAllergyPanel, setShowAllergyPanel] = useState(false)
  const [teamQuery, setTeamQuery] = useState('')
  // 배부 구간은 두 단계입니다: 리그를 고르고(leagueFilter) → 그 안의
  // 번호 구간을 고릅니다(teamRange, 고르지 않으면 그 리그 전체).
  const [leagueFilter, setLeagueFilter] = useState('all') // 'all' | 'E' | 'G'
  const [teamRange, setTeamRange] = useState(null)
  // 배부 목록 탭 — 'pending'(미배부) 기본, 'done'(배부 완료)
  const [deliveryTab, setDeliveryTab] = useState('pending')
  // 폰에서는 도구가 두 개뿐이라 버튼 줄을 따로 두지 않고, 검색칸 오른쪽의
  // 더보기(⋯)로 묶습니다
  const [moreOpen, setMoreOpen] = useState(false)

  const closeUtilityPanels = useCallback(() => {
    setShowAllergyPanel(false)
    setShowSoldoutPanel(false)
  }, [])

  const allergyDrag = useSheetDrag(closeUtilityPanels)
  const soldoutDrag = useSheetDrag(closeUtilityPanels)
  const allergyDialogRef = useDialogFocus(showAllergyPanel, closeUtilityPanels)
  const soldoutDialogRef = useDialogFocus(showSoldoutPanel, closeUtilityPanels)

  const filteredMealIds = mealFilter === 'all' ? MEALS.map((m) => m.id) : [mealFilter]
  const singleMeal = mealFilter !== 'all' // 배부 체크는 끼니 단위로만 의미 있음
  // 품절 관리는 시간과 상관없이 모든 메뉴를 보여줍니다. 운영진만 쓰는 화면이고,
  // 주문 구간이 열리기 전에 미리 품절을 걸어두는 편이 실제 진행에 맞습니다
  // (업체 사정은 주문 시작 전에 먼저 전달됩니다).
  // 어느 식사가 지금 열려 있는지는 표시만 해줍니다.
  const openMealIds = new Set(getOpenMeals(now().getTime()).map((m) => m.id))

  // total = 총 주문 수량, remaining = 아직 배부 안 된 수량 (배부 완료 팀은 차감)
  // 배부 진행에 따라 remaining이 실시간으로 줄어듦 → 개수 검증용
  const totals = useMemo(() => {
    const total = {}
    const remaining = {}
    Object.entries(scan.orders).forEach(([teamId, order]) => {
      filteredMealIds.forEach((mealId) => {
        const deliveredThis = !!scan.delivered?.[teamId]?.[mealId]
        ;(order.meals?.[mealId]?.items || []).forEach(({ menuId, qty }) => {
          total[menuId] = (total[menuId] || 0) + qty
          if (!deliveredThis) remaining[menuId] = (remaining[menuId] || 0) + qty
        })
      })
    })
    Object.keys(total).forEach((k) => {
      if (!(k in remaining)) remaining[k] = 0
    })
    return { total, remaining }
  }, [scan.orders, scan.delivered, mealFilter])
  const anyDelivered = Object.keys(totals.total).some((k) => totals.remaining[k] !== totals.total[k])

  // 팀별 주문 행 (선택 끼니 기준). items: [{mealId, menuId, qty}]
  const teamRows = useMemo(() => {
    return Object.entries(scan.orders)
      .map(([teamId, order]) => {
        const items = []
        filteredMealIds.forEach((mealId) => {
          ;(order.meals?.[mealId]?.items || []).forEach(({ menuId, qty }) => {
            items.push({ mealId, menuId, qty })
          })
        })
        return items.length
          ? {
              teamId,
              items,
              assignedName: assignedShortName(teamId),
              memberCount: scan.teams[teamId]?.memberCount,
            }
          : null
      })
      .filter(Boolean)
      .sort((a, b) => a.teamId.localeCompare(b.teamId, undefined, { numeric: true }))
  }, [scan.orders, scan.teams, mealFilter])

  // 검색은 손에 잡히는 대로 받습니다 — 'E-45' / 'e45' / '45' / '-45'.
  //   숫자만    → 두 리그 모두 (45 → E-45와 G-45)
  //   글자만    → 그 리그 전체 (G → G-01~G-31)
  //   하이픈·공백은 있든 없든 무시합니다.
  // 번호는 딱 맞는 것만 찾습니다. 4를 쳤을 때 40~49·104가 함께 뜨면
  // 배부하다 엉뚱한 테이블을 짚게 됩니다.
  const query = teamQuery.trim().toUpperCase()
  const hasQuery = query !== ''
  const matchesQuery = (teamId) => {
    const m = query.match(/^([EG])?[^0-9]*([0-9]{1,3})?$/)
    if (!m || (!m[1] && !m[2])) return false
    if (m[1] && teamId.charAt(0) !== m[1]) return false
    if (!m[2]) return true
    return String(teamId.slice(2)).replace(/^0+/, '') === String(parseInt(m[2], 10))
  }
  const isDelivered = (teamId) => singleMeal && !!scan.delivered?.[teamId]?.[mealFilter]

  // 배부 구간은 리그별로 25팀씩 끊습니다. 두 리그가 한 구간에 섞이면 배부
  // 동선이 엉킵니다(자리가 리그별로 떨어져 있음).
  // 끝에 반 구간도 안 되게 남으면 앞 구간에 붙입니다 — 필드리그는 101~104
  // 네 팀, 개발자리그는 26~31 여섯 팀만 있는 칩이 생겨 한 번 더 눌러야
  // 하는 것에 비해 얻는 게 없습니다. → E-76~104, G-01~31
  const rangeOptions = LEAGUES.flatMap((league) => {
    // 번호가 이어진 구역별로 먼저 나눕니다. 필드리그는 1~105 다음이 외부사
    // 200~206이라, 1부터 죽 끊으면 아무도 없는 구간 칩이 잔뜩 생깁니다.
    const nums = (TEAM_IDS_BY_LEAGUE[league.id] || []).map((id) => parseInt(id.slice(2), 10))
    const blocks = []
    nums.forEach((n, i) => {
      if (i === 0 || n - nums[i - 1] > DELIVERY_TEAM_RANGE_SIZE) blocks.push([n, n])
      else blocks[blocks.length - 1][1] = n
    })
    const ranges = []
    blocks.forEach(([from, to]) => {
      const madeAt = ranges.length
      for (let start = from; start <= to; start += DELIVERY_TEAM_RANGE_SIZE) {
        ranges.push({ start, end: Math.min(start + DELIVERY_TEAM_RANGE_SIZE - 1, to) })
      }
      // 끝에 반 구간도 안 되게 남으면 앞 구간에 붙입니다 (E-101~105 → E-76~105)
      const last = ranges[ranges.length - 1]
      if (ranges.length - madeAt > 1 && last.end - last.start + 1 < DELIVERY_TEAM_RANGE_SIZE / 2) {
        ranges.splice(ranges.length - 2, 2, { start: ranges[ranges.length - 2].start, end: last.end })
      }
    })
    return ranges.map(({ start, end }) => ({
      id: `${league.prefix}-${start}-${end}`,
      prefix: league.prefix,
      start,
      end,
      // 테이블에 붙은 번호와 같은 두 자리 표기로 씁니다(E-01~25).
      label: `${league.prefix}-${String(start).padStart(2, '0')}~${String(end).padStart(2, '0')}`,
      // 리그 칩 옆에 붙을 때는 리그가 이미 드러나 번호만 씁니다
      shortLabel: `${String(start).padStart(2, '0')}~${String(end).padStart(2, '0')}`,
    }))
  })
  const selectedRange = rangeOptions.find((range) => range.id === teamRange)
  // 리그로 한 번, 그 안의 구간으로 한 번 더 좁힙니다
  const rangedRows = teamRows.filter((row) => {
    if (leagueFilter !== 'all' && row.teamId.charAt(0) !== leagueFilter) return false
    if (!selectedRange) return true
    const n = parseInt(row.teamId.slice(2), 10)
    return n >= selectedRange.start && n <= selectedRange.end
  })
  const pendingRows = singleMeal ? rangedRows.filter((row) => !isDelivered(row.teamId)) : rangedRows
  const completedRows = singleMeal ? rangedRows.filter((row) => isDelivered(row.teamId)) : []
  const visibleRows = hasQuery ? teamRows.filter((row) => matchesQuery(row.teamId)) : pendingRows
  // 검색 중에는 검색 결과를, 아니면 선택한 배부 탭의 목록을 보여줍니다
  const shownRows = hasQuery
    ? visibleRows
    : !singleMeal
      ? rangedRows
      : deliveryTab === 'done'
        ? completedRows
        : pendingRows

  // 알레르기 현황: 같은 알레르기 조합을 가진 사람끼리 팀 안에서 묶어 표시
  const allergyInfo = useMemo(() => {
    const teamsWith = []
    Object.entries(scan.teams).forEach(([teamId, team]) => {
      const people = (team.allergies || []).map((p) => (Array.isArray(p) ? p : [p]))
      if (!people.length) return
      const groupCounts = {}
      people.forEach((personList) => {
        const allergies = [...personList].filter(Boolean).sort().join('·')
        if (allergies) groupCounts[allergies] = (groupCounts[allergies] || 0) + 1
      })
      teamsWith.push({
        teamId,
        assignedName: assignedShortName(teamId),
        groups: Object.entries(groupCounts).map(([allergies, count]) => ({ allergies, count })),
      })
    })
    teamsWith.sort((a, b) => a.teamId.localeCompare(b.teamId, undefined, { numeric: true }))
    return { teamsWith }
  }, [scan.teams])

  // 식음 운영 크루가 찾아갈 명단 — 그 끼니에 드실 수 있는 메뉴가 하나도
  // 없는 사람입니다. 참가자 등록 화면도 같은 판정으로 "식음 운영 크루가
  // 찾아갈 거예요" 라고 약속하므로, 두 화면이 같은 personDiet 를 봅니다.
  //
  // 성분이 겹치는 것만으로는 대상이 아닙니다. 같은 끼니의 다른 메뉴를 먹을
  // 수 있으면 찾아갈 일이 없습니다 (예: 쇠고기만 있으면 야식은 페퍼로니로
  // 해결). 야식과 아침은 따로 주문하니 명단도 끼니별로 나눕니다.
  const altMealInfo = useMemo(() => {
    const byMeal = {}
    MEALS.forEach((meal) => {
      byMeal[meal.id] = { meal, count: 0, groups: new Map() }
    })
    Object.entries(scan.teams).forEach(([teamId, team]) => {
      const people = (team.allergies || []).map((x) => (Array.isArray(x) ? x : [x]))
      people.forEach((personList) => {
        const { needsAlt } = personDiet(personList)
        if (needsAlt.length === 0) return
        // 사람 단위 조합으로 셉니다. 성분별로 쪼개면 우유+토마토 1명이
        // "우유 1 · 토마토 1"이 되어 합이 인원수와 어긋납니다.
        const combo = [...personList].filter(Boolean).sort().join(', ')
        needsAlt.forEach((mealId) => {
          const row = byMeal[mealId]
          if (!row) return
          row.count += 1
          const key = teamId + '|' + combo
          const cur = row.groups.get(key) || { teamId, label: combo, count: 0 }
          cur.count += 1
          row.groups.set(key, cur)
        })
      })
    })
    return {
      rows: MEALS.map((meal) => ({
        meal,
        count: byMeal[meal.id].count,
        groups: [...byMeal[meal.id].groups.values()].sort((a, b) =>
          a.teamId.localeCompare(b.teamId, undefined, { numeric: true }),
        ),
      })),
    }
  }, [scan.teams])

  // 점심·저녁 도시락처럼 재료만 빼면 되는 끼니.
  //
  // 위 찾아갈 명단과 성격이 다릅니다. 명단은 크루가 가서 무엇을 드실 수
  // 있는지 여쭐 대상일 뿐, 몇 인분을 준비하라는 수가 아닙니다 — 알레르기를
  // 알려주신 것이지 그 끼니를 드시겠다고 하신 것은 아니니까요.
  //
  // 도시락은 반대입니다. 주문 없이 인원수대로 나가므로 알레르기만 알면
  // 준비할 것이 정해집니다. 그래서 여기는 '어느 팀에 몇 개'가 그대로
  // 호텔에 넘길 수가 됩니다 (CSV·PDF).

  const cateringSwaps = useMemo(
    () =>
      CATERING_SWAPS.map((swap) => ({ swap, ...cateringSwapCounts(scan.teams, swap) })),
    [scan.teams],
  )
  const cateringTotal = cateringSwaps.reduce((n, x) => n + x.total, 0)

  // (B-2) 호텔에 넘길 도시락 제외 요청.
  //
  // 이건 크루가 화면으로 볼 일이 아닙니다 — 호텔에 "이 종류를 이만큼",
  // 배부하는 사람에게 "이 테이블에 이것을" 이라고 건네면 끝나는 일이라,
  // 시트에 띄워두는 대신 파일 두 개로 뽑습니다.
  //   CSV        : 호텔 전달용 (끼니 · 종류 · 테이블 · 수량 한 줄씩)
  //   체크리스트 : 배부용 (테이블마다 체크칸)
  const cateringRows = () => {
    const out = []
    cateringSwaps.forEach(({ swap, variants }) => {
      variants.forEach((variant) => {
        variant.teams.forEach((team) => {
          out.push({
            meal: swap.mealLabel,
            dish: swap.mealDesc,
            kind: `${variant.label} 뺀 도시락`,
            teamId: team.teamId,
            count: team.count,
          })
        })
      })
    })
    return out
  }

  const downloadCateringCsv = () => {
    const rows = cateringRows()
    if (!rows.length) {
      alert('제외 요청이 아직 없습니다.')
      return
    }
    const head = ['끼니', '도시락', '종류', '테이블 번호', '수량']
    // 쉼표가 든 값이 있습니다 (예: 도시락 이름). 전부 따옴표로 감쌉니다.
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const body = rows.map((r) => [r.meal, r.dish, r.kind, r.teamId, r.count])
    // 앞의 BOM 이 없으면 엑셀이 한글을 깨뜨립니다.
    const csv = '\uFEFF' + [head, ...body].map((r) => r.map(cell).join(',')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'G-Order_도시락_제외요청.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // 도시락 배부표를 PDF 파일로. 브라우저의 'PDF로 저장'을 그대로 씁니다 —
  // 글자가 글자로 남아(복사·검색이 됩니다) 화면을 찍어 만든 그림보다 낫고,
  // 한글 글꼴을 번들에 싣지 않아도 됩니다. 창이 뜨면 저장 창이 바로 열립니다.
  const saveCateringPdf = () => {
    // 끼니가 바깥 묶음, 도시락 종류가 안쪽 묶음입니다. 줄마다 [DAY 1]을 다시
    // 쓰면 같은 말이 스무 번 반복되고, 정작 눈이 찾는 종류·테이블이 묻힙니다.
    // 끼니마다 표를 따로 두면 쪽이 갈려 배부 담당끼리 나눠 들기 좋습니다.
    const meals = cateringSwaps.filter((x) => x.total > 0)
    if (!meals.length) {
      alert('제외 요청이 아직 없습니다.')
      return
    }
    const total = meals.reduce((n, x) => n + x.total, 0)
    const sectionsHtml = meals
      .map(({ swap, variants }) => {
        // 제목 줄(완료·테이블·수량)은 두지 않습니다. 칸이 셋뿐이고 ☐ 와
        // 테이블 번호는 보면 아는 것이라, 제목을 달면 종류 소제목과 줄이
        // 겹쳐 무엇이 묶음의 머리인지 흐려집니다.
        const rowsHtml = variants
          .map(
            (v) =>
              `<tr class="g"><td colspan="2"><b>${escapeHtml(v.label)}</b> 뺀 도시락</td><td class="n">${
                v.count
              }개</td></tr>` +
              v.teams
                .map(
                  (t) =>
                    `<tr><td class="c">☐</td><td class="t">${escapeHtml(
                      t.teamId,
                    )}</td><td class="n">${t.count}개</td></tr>`,
                )
                .join(''),
          )
          .join('')
        return `<section>
<h2>${escapeHtml(swap.mealLabel)} <span class="sub">${escapeHtml(swap.mealDesc)}</span></h2>
<table><tbody>${rowsHtml}</tbody></table>
</section>`
      })
      .join('')
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>G-Order 도시락 제외 배부표</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: 'Malgun Gothic', system-ui, sans-serif; padding: 16px; color:#111; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 0 0 6px; }
  .sub { color:#666; font-size:12px; font-weight:400; }
  /* 끼니를 나란히. 표가 좁아 한 칸을 다 쓰면 가운데가 크게 비고, 두 끼니를
     보려면 종이를 넘겨야 합니다. */
  .sheets { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 22px; margin-top: 18px; }
  section { break-inside: avoid; }
  table { width:100%; border-collapse: collapse; font-size: 13px; }
  td { border:1px solid #999; padding:6px 8px; text-align:left; }
  tr.g td { background:#f1f1f1; font-size:14px; }
  /* 이 표에서 눈이 찾는 유일한 숫자 — 종류별로 몇 개를 만드는가.
     아래 팀별 줄의 개수는 거의 1개라 배경처럼 두고, 이것만 키웁니다. */
  tr.g td.n { font-size:19px; color:#b45309; }
  td.c { width:26px; text-align:center; font-size:15px; }
  /* 테이블 번호는 E-105 가 최대라 이만큼이면 넉넉합니다 */
  td.t { width:58px; white-space:nowrap; font-weight:700; text-align:center; }
  td.n { width:48px; white-space:nowrap; text-align:center; font-weight:700; }
  tbody tr:not(.g) td.n { color:#777; font-weight:400; }
  .pbtn { padding:10px 16px; font-size:14px; font-weight:700; margin-top:12px; cursor:pointer; }
  @media screen and (max-width: 640px) {
    body { padding: 12px; }
    .sheets { grid-template-columns: 1fr; }
    table { font-size: 14px; }
    td { padding: 8px 6px; }
    td.c { width: 32px; font-size: 17px; }
    .pbtn { width:100%; min-height:48px; font-size:16px; font-weight:700; }
  }
  @page { size: A4; margin: 14mm; }
  @media print { .noprint { display:none; } }
</style></head><body>
<h1>도시락 제외 배부표</h1>
<div class="sub">총 ${total}개 · 배부 시 왼쪽 칸에 체크</div>
<div class="noprint">
<button class="pbtn" onclick="window.print()">📄 PDF로 저장</button>
<span class="sub"> 저장 창의 <b>대상</b>에서 'PDF로 저장'을 고르세요.</span>
</div>
<script>window.addEventListener('load', function () { setTimeout(function () { window.print() }, 400) })</script>
<div class="sheets">${sectionsHtml}</div>
</body></html>`
    const w = window.open('', '_blank')
    if (!w) {
      alert(
        'PDF 창이 차단되었습니다.\n브라우저의 팝업 차단을 허용한 뒤 다시 눌러주세요.',
      )
      return
    }
    w.document.write(html)
    w.document.close()
  }
  // (C) 인쇄용 배부 체크리스트 — 현재 끼니 필터 기준, 팀번호순, 종이 체크칸 포함
  const printChecklist = () => {
    const label = mealFilter === 'all' ? '전체' : MEAL_BY_ID[mealFilter].label
    const rangeLabel = selectedRange ? `${selectedRange.label}번` : '전체 팀'
    // 배부 현장에서 크루가 찾아갈 팀을 종이만 보고 알 수 있어야 합니다.
    // 화면의 알레르기 시트를 따로 열어봐야 하면 놓치게 됩니다.
    const altInfoOf = (teamId) => {
      const people = (scan.teams[teamId]?.allergies || []).map((x) => (Array.isArray(x) ? x : [x]))
      let need = 0
      const combos = []
      people.forEach((personList) => {
        const { needsAlt } = personDiet(personList)
        const hit = mealFilter === 'all' ? needsAlt.length > 0 : needsAlt.includes(mealFilter)
        if (hit) {
          need += 1
          const combo = [...personList].filter(Boolean).sort().join('·')
          if (combo) combos.push(combo)
        }
      })
      return { need, combos }
    }
    let altTotal = 0
    const rowsHtml = rangedRows
      .map((r) => {
        const items = r.items
          .map((it) => {
            const name = MENU_BY_ID[it.menuId]?.baseName || it.menuId
            const tag = mealFilter === 'all' ? `[${MEAL_BY_ID[it.mealId]?.label}] ` : ''
            return `${escapeHtml(tag)}${escapeHtml(name)} ${escapeHtml(it.qty)}`
          })
          .join(', ')
        const coach = r.assignedName ? ` (${escapeHtml(r.assignedName)})` : ''
        const { need, combos } = altInfoOf(r.teamId)
        altTotal += need
        const alt = need
          ? `<b>방문 ${need}</b><span class="cmb"> ${combos.map(escapeHtml).join(' / ')}</span>`
          : ''
        return `<tr><td class="c">☐</td><td class="t">팀 ${escapeHtml(r.teamId)}${coach}</td><td>${items}</td><td class="a">${alt}</td></tr>`
      })
      .join('')
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>배부 체크리스트 — ${escapeHtml(label)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: 'Malgun Gothic', system-ui, sans-serif; padding: 16px; color:#111; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .sub { color:#666; font-size:12px; margin-bottom:12px; }
  table { width:100%; border-collapse: collapse; font-size: 13px; }
  th, td { border:1px solid #999; padding:6px 8px; text-align:left; vertical-align:top; }
  th { background:#eee; }
  td.c { width:28px; text-align:center; font-size:16px; }
  td.t { white-space:nowrap; font-weight:700; }
  td.a { white-space:nowrap; }
  td.a b { color:#b45309; }
  .cmb { color:#666; font-size:11px; }
  .pbtn { padding:8px 14px; font-size:14px; margin-bottom:12px; }
  /* 폰에서 열어 확인하는 경우 — 종이 기준 여백·글씨를 그대로 두면 아주 작게
     보입니다. 화면에서 읽을 수 있는 크기로 조정하고 버튼도 손가락 크기로 */
  @media screen and (max-width: 640px) {
    body { padding: 12px; }
    h1 { font-size: 17px; }
    table { font-size: 14px; }
    th, td { padding: 8px 6px; }
    td.c { width: 34px; font-size: 18px; }
    td.t { white-space: normal; }
    td.a { white-space: normal; }
    .cmb { display:block; font-size:12px; }
    .pbtn { width:100%; min-height:48px; font-size:16px; font-weight:700; }
  }
  @media print { .noprint { display:none; } }
</style></head><body>
<h1>배부 체크리스트 — ${escapeHtml(label)} · ${escapeHtml(rangeLabel)}</h1>
<div class="sub">총 ${rangedRows.length}팀 · 배부 시 왼쪽 칸에 체크${
      altTotal ? ` · <b>크루 방문 ${altTotal}명</b>` : ''
    }</div>
<button class="noprint pbtn" onclick="window.print()">🖨 인쇄</button>
<table><thead><tr><th>완료</th><th>팀</th><th>주문 내역</th><th>크루 방문</th></tr></thead><tbody>${rowsHtml}</tbody></table>
</body></html>`
    const w = window.open('', '_blank')
    if (!w) {
      alert(
        '팝업이 차단되어 체크리스트를 열 수 없습니다.\n브라우저의 팝업 차단을 허용한 뒤 다시 눌러주세요.\n(인쇄는 데스크톱 브라우저에서 여는 편이 편합니다)',
      )
      return
    }
    w.document.write(html)
    w.document.close()
  }

  return (
    <div className={wide ? undefined : 'screen'}>
      <section className="panel">
        <h3>메뉴별 합산 수량</h3>
        {Object.keys(totals.total).length === 0 ? (
          <p className="empty-text">아직 주문이 없습니다.</p>
        ) : (
          <div className="totals-grid">
            {Object.entries(totals.total)
              .sort(([, a], [, b]) => b - a)
              .map(([menuId, total]) => {
                const remain = totals.remaining[menuId]
                const allDone = anyDelivered && remain === 0
                // 준비 수량(케이터링 상한) 대비 남은 개수 — 0이 되면 참가자
                // 화면에서 그 메뉴가 자동으로 닫힙니다
                const 준비 = scan.stock?.stock?.[menuId]
                const 재고남음 = scan.stock?.remaining?.[menuId]
                return (
                  <div key={menuId} className={`total-item${allDone ? ' done' : ''}`}>
                    {/* '(1인)'은 여기서 군더더기라 뺍니다. 좁은 화면에서는 두 메뉴를
                        한 줄에 담기 위해 배부 목록과 같은 짧은 이름을 씁니다 */}
                    <span className="total-name">
                      <span className="total-name-full">
                        {MENU_BY_ID[menuId]?.baseName || menuId}
                      </span>
                      <span className="total-name-short">
                        {MENU_BY_ID[menuId]?.shortLabel || MENU_BY_ID[menuId]?.baseName || menuId}
                      </span>
                      {Number.isFinite(준비) && (
                        <span className={`total-stock${재고남음 === 0 ? ' out' : ''}`}>
                          {재고남음 === 0 ? `준비 ${준비} · 마감` : `준비 ${준비} · 잔여 ${재고남음}`}
                        </span>
                      )}
                    </span>
                    <b>
                      {remain}개
                      {anyDelivered && remain !== total && (
                        <span className="total-of"> / 총 {total}</span>
                      )}
                    </b>
                  </div>
                )
              })}
          </div>
        )}
      </section>

      {/* 검색·도구는 아래 팀별 목록에 걸리는 조작이라 목록 바로 위에 둡니다.
          (합산 수량은 목록과 무관한 총계라 맨 위) */}
      <div className="toolbar">
        <div className="toolbar-actions">
          <label className="table-search-wrap">
            <svg
              className="table-search-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-4-4" />
            </svg>
            <input
              className="table-search"
              type="search"
              inputMode="numeric"
              placeholder="테이블 번호로 검색 (예: E-45)"
              value={teamQuery}
              onChange={(e) => setTeamQuery(e.target.value)}
              aria-label="팀 번호 검색"
            />
          </label>
          {/* 폰 전용 더보기 — 넓은 화면에서는 오른쪽 버튼들이 그대로 보입니다 */}
          <div className="search-more-wrap">
            <button
              className={`search-more${moreOpen ? ' on' : ''}`}
              onClick={() => setMoreOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              aria-label="도구 더보기"
            >
              ⋯
            </button>
            {moreOpen && (
              <>
                <div className="search-more-backdrop" onClick={() => setMoreOpen(false)} />
                <div className="search-more-menu" role="menu">
                  <button
                    role="menuitem"
                    onClick={() => {
                      setShowAllergyPanel(true)
                      setShowSoldoutPanel(false)
                      setMoreOpen(false)
                    }}
                  >
                    🥗 알레르기 현황
                    <b>{allergyInfo.teamsWith.length}</b>
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setShowSoldoutPanel(true)
                      setShowAllergyPanel(false)
                      setMoreOpen(false)
                    }}
                  >
                    🚫 품절 관리
                  </button>
                  {/* 도시락 제외는 크루가 화면으로 볼 일이 아니라 넘길 파일입니다 */}
                  <button
                    role="menuitem"
                    onClick={() => {
                      downloadCateringCsv()
                      setMoreOpen(false)
                    }}
                  >
                    🍱 도시락 제외 CSV
                    <b>{cateringTotal}</b>
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      saveCateringPdf()
                      setMoreOpen(false)
                    }}
                  >
                    🍱 도시락 PDF 저장
                  </button>
                </div>
              </>
            )}
          </div>
          <button
            className={`btn-ghost toolbar-tool${showAllergyPanel ? ' active' : ''}`}
            onClick={() => {
              setShowAllergyPanel((current) => !current)
              setShowSoldoutPanel(false)
            }}
          >
            알레르기 {allergyInfo.teamsWith.length}
          </button>
          <button
            className={`btn-ghost toolbar-tool${showSoldoutPanel ? ' active' : ''}`}
            onClick={() => {
              setShowSoldoutPanel((current) => !current)
              setShowAllergyPanel(false)
            }}
          >
            품절 관리
          </button>
          {/* 종이 체크리스트는 노트북에서 뽑습니다. 폰에서는 앱의 배부 목록이
              실시간이고 체크도 바로 되므로 이 버튼을 감춥니다(styles.css) */}
          <button className="btn-ghost toolbar-tool checklist-tool" onClick={printChecklist}>
            체크리스트
          </button>
          {/* 도시락 제외는 화면으로 볼 일이 아니라 호텔·배부에 넘길 파일입니다.
              좁은 화면에서는 위 ⋯ 메뉴에 같은 항목이 있습니다. */}
          <button className="btn-ghost toolbar-tool" onClick={downloadCateringCsv}>
            도시락 CSV {cateringTotal}
          </button>
          <button
            className="btn-ghost toolbar-tool checklist-tool"
            onClick={saveCateringPdf}
          >
            도시락 PDF
          </button>
        </div>
      </div>


      {showAllergyPanel && (
        <div className="bottom-sheet-backdrop" onClick={closeUtilityPanels}>
          <section
            ref={allergyDialogRef}
            className="bottom-sheet allergy-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="allergy-sheet-title"
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
            style={allergyDrag.sheetStyle}
          >
            <div className="sheet-handle" aria-hidden="true" {...allergyDrag.handleHandlers} />
            <div className="sheet-head">
              <h3 id="allergy-sheet-title">알레르기 현황</h3>
              <button className="sheet-close" onClick={closeUtilityPanels}>닫기</button>
            </div>
            <p className="sheet-description">크루가 찾아갈 팀과 도시락 준비에 참고하세요.</p>
            <div className="sheet-body">
              {/* 찾아갈 명단. 팀 번호와 함께 무엇 때문인지(알레르기)를 적어
                  둡니다 — 가서 다시 물어야 하면 한 번에 안 끝납니다.
                  칩을 늘어놓으면 줄바꿈 자리가 제각각이라 팀 번호가 눈으로
                  이어지지 않습니다. 팀 순서대로 한 줄씩 내려가는 표로 둡니다.
                  한 팀에 알레르기가 여럿이면 줄이 여럿 — 찾아가 만날 사람이
                  여럿이라는 뜻이라, 합치지 않고 그대로 둡니다. */}
              <div className="alt-request">
                <div className="alt-meal-title">🙋 식음 운영 크루가 찾아갈 명단</div>
                {/* 야식·아침을 위아래로 세우면 아래쪽은 스크롤해야 보입니다.
                    표가 좁아 나란히 두면 두 끼니가 한눈에 들어옵니다 —
                    좁은 화면에서는 저절로 위아래로 돌아갑니다(styles.css). */}
                <div className="alt-request-meals">
                {altMealInfo.rows.map(({ meal, count, groups }) => (
                  <div className="alt-request-meal" key={meal.id}>
                    {/* 합계는 적지 않습니다. 크루는 팀을 하나씩 찾아가므로
                        움직이는 단위가 줄이지 총 인원이 아니고, 줄이 곧
                        찾아갈 횟수라 세어 둘 필요가 없습니다. */}
                    <div className="alt-meal-row">
                      <span className="alt-meal-name">{meal.label}</span>
                    </div>
                    {count === 0 ? (
                      <p className="alt-meal-note">찾아갈 팀이 없습니다.</p>
                    ) : (
                      <table className="alt-request-table">
                        <thead>
                          <tr>
                            <th>팀</th>
                            <th>알레르기</th>
                            <th>인원</th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* 팀 칸은 합쳐 한 번만 씁니다 — 팀 순서로 정렬돼 있어
                              같은 팀 줄은 붙어 있습니다. 번호가 두 번 찍히면
                              두 팀처럼 보입니다. */}
                          {groups.map((group, index) => {
                            const 첫줄 = index === 0 || groups[index - 1].teamId !== group.teamId
                            const 줄수 = 첫줄
                              ? groups.filter((g) => g.teamId === group.teamId).length
                              : 0
                            return (
                              <tr key={`${group.teamId}-${group.label}`}>
                                {첫줄 && (
                                  <td className="alt-request-team" rowSpan={줄수}>
                                    {group.teamId}
                                  </td>
                                )}
                                <td>{group.label}</td>
                                <td className="alt-request-count">{group.count}명</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {showSoldoutPanel && (
        <div className="bottom-sheet-backdrop" onClick={closeUtilityPanels}>
          <section
            ref={soldoutDialogRef}
            className="bottom-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="soldout-sheet-title"
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
            style={soldoutDrag.sheetStyle}
          >
            <div className="sheet-handle" aria-hidden="true" {...soldoutDrag.handleHandlers} />
            <div className="sheet-head">
              <h3 id="soldout-sheet-title">
                품절 관리
              </h3>
              <button className="sheet-close" onClick={closeUtilityPanels}>닫기</button>
            </div>
            <p className="sheet-description">
              메뉴를 누르면 참가자 화면에서 즉시 주문할 수 없게 됩니다. 주문 시간 전에 미리
              걸어둘 수 있습니다.
            </p>
            <div className="sheet-body">
              {MEALS.map((meal) => (
                <div key={meal.id} className="soldout-row">
                  <b>
                    {meal.label}
                    {/* 지금 열려 있는 식사는 누르는 즉시 참가자 화면에 반영됩니다 */}
                    {openMealIds.has(meal.id) && <span className="meal-tag">주문 중</span>}
                  </b>
                  <div className="soldout-chips">
                    {(MENUS[meal.id] || []).map((m) => (
                      <button
                        key={m.id}
                        className={`chip${scan.soldout[m.id] ? ' soldout-on' : ''}`}
                        onClick={() => onToggleSoldout(m.id)}
                      >
                        {scan.soldout[m.id] ? '🚫 ' : ''}
                        {m.baseName || m.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      <section className="panel delivery-team-panel">
        {/* 구간을 고르면 아래 목록이 그 구간으로 걸러지므로 한 구역에 둡니다.
            위: 구간(오래 유지되는 상위 맥락) → 아래: 미배부/완료(자주 왕복).
            검색 중이거나 끼니 '전체'일 때는 구간·탭이 의미가 없어 제목만 씁니다. */}
        {singleMeal && !hasQuery ? (
          <div className="delivery-controls">
            <div
              className="coach-tabs delivery-ranges"
              role="group"
              aria-label="배부할 팀 번호 구간"
            >
              <button
                className={`coach-tab${leagueFilter === 'all' ? ' on' : ''}`}
                onClick={() => {
                  setLeagueFilter('all')
                  setTeamRange(null)
                }}
              >
                전체
              </button>
              {/* 리그를 고르면 그 리그의 구간이 바로 옆으로 펼쳐집니다.
                  두 리그의 구간 여섯 개를 한 줄에 늘어놓으면 자기 리그가
                  아닌 칩까지 훑게 되고, 폰에서는 세 줄을 차지했습니다. */}
              {LEAGUES.map((league) => {
                const open = leagueFilter === league.prefix
                const leagueRanges = rangeOptions.filter((r) => r.prefix === league.prefix)
                return (
                  <Fragment key={league.id}>
                    <button
                      className={`coach-tab${open ? ' on' : ''}`}
                      aria-expanded={open}
                      onClick={() => {
                        // 열려 있는 리그를 다시 누르면 접고 전체로 돌아갑니다
                        setLeagueFilter(open ? 'all' : league.prefix)
                        setTeamRange(null)
                      }}
                    >
                      {league.label}
                    </button>
                    {/* 구간이 하나뿐인 리그(개발자리그 31팀)는 리그 칩과 범위가
                        같아, 눌러도 아무것도 좁혀지지 않는 칩이 됩니다 */}
                    {open &&
                      leagueRanges.length > 1 &&
                      leagueRanges.map((range) => (
                        <button
                          key={range.id}
                          className={`coach-tab range-sub${teamRange === range.id ? ' on' : ''}`}
                          // 리그 칩이 이미 켜져 있어 화면에서는 번호만으로
                          // 충분하지만, 읽어주는 순서에는 리그가 필요합니다
                          aria-label={range.label}
                          onClick={() => setTeamRange(teamRange === range.id ? null : range.id)}
                        >
                          {range.shortLabel}
                        </button>
                      ))}
                  </Fragment>
                )
              })}
            </div>
            <div className="coach-tabs delivery-status-tabs">
              <button
                className={`coach-tab${deliveryTab === 'pending' ? ' on' : ''}`}
                onClick={() => setDeliveryTab('pending')}
              >
                미배부 팀 <b className="tab-count">{pendingRows.length}</b>
              </button>
              <button
                className={`coach-tab${deliveryTab === 'done' ? ' on' : ''}`}
                onClick={() => setDeliveryTab('done')}
              >
                배부 완료 팀 <b className="tab-count">{completedRows.length}</b>
              </button>
            </div>
          </div>
        ) : (
          <div className="panel-head-row">
            <h3>
              {'팀별 주문'}
              {!singleMeal && ` (${visibleRows.length}팀)`}
              {hasQuery && ` — "${teamQuery.trim()}" 검색 중`}
            </h3>
          </div>
        )}

        {!singleMeal && teamRows.length > 0 && (
          <p className="deliver-hint">
            끼니({MEALS.map((m) => m.label).join('/')})를 선택하면 팀별 <b>완료 체크</b>를 쓸 수 있어요.
          </p>
        )}

        {shownRows.length === 0 ? (
          <p className="empty-text">
            {hasQuery
              ? `"${teamQuery.trim()}"에 해당하는 주문 내역이 없습니다.`
              : !singleMeal
                ? '아직 주문이 없습니다.'
                : deliveryTab === 'done'
                  ? '아직 배부 완료한 팀이 없습니다.'
                  : '선택한 구간의 배부가 모두 완료됐습니다.'}
          </p>
        ) : (
          <TeamRowList
            rows={shownRows}
            mealFilter={mealFilter}
            singleMeal={singleMeal}
            isDelivered={isDelivered}
            onToggleDelivered={onToggleDelivered}
          />
        )}
      </section>

      {/* 폰에서는 이 바가 메뉴로 나가는 유일한 길입니다. 상단 햄버거를
          없애고 아래로 모았는데, 이 화면만 빠져 있어 들어오면 나갈 수가
          없었습니다. 넓은 화면에서는 왼쪽 사이드바가 그 일을 합니다. */}
      {!wide && (
        <AdminDock onOpenMenu={onOpenMenu} menuAlert={menuAlert} menuOpen={menuOpen} showMenu={showMenu}>
          {/* 끼니 고르기는 이 화면에서 가장 자주 쓰는 조작입니다. 예전에는
              메뉴 안 하위 항목에만 있었는데, 화면이 하나뿐인 식음 운영에게는
              메뉴가 없어 바꿀 방법이 사라졌습니다. 바로 여기 둡니다. */}
          <div className="dock-meals">
            {MEALS.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`dock-meal${mealFilter === m.id ? ' on' : ''}`}
                onClick={() => onSelectMeal?.(m.id)}
                aria-pressed={mealFilter === m.id}
              >
                {m.label}
              </button>
            ))}
          </div>
        </AdminDock>
      )}
    </div>
  )
}
