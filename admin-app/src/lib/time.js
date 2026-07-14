// =====================================================================
//  시간 유틸
//  - URL에 ?now=2026-09-21T14:30 파라미터를 주면 그 시각 기준으로 동작
//    (개발/시연용 시간 시뮬레이션 — 오프셋 방식이라 카운트다운도 흐름)
// =====================================================================
import { MEALS } from '../config.js'

let offsetMs = 0
try {
  const param = new URLSearchParams(window.location.search).get('now')
  if (param) {
    const t = new Date(param).getTime()
    if (!Number.isNaN(t)) offsetMs = t - Date.now()
  }
} catch {
  /* SSR 등 window 없는 환경 무시 */
}

export function now() {
  return new Date(Date.now() + offsetMs)
}

export function fmtClock(d) {
  const dt = d instanceof Date ? d : new Date(d)
  return `${dt.getMonth() + 1}/${dt.getDate()} ${String(dt.getHours()).padStart(2, '0')}:${String(
    dt.getMinutes(),
  ).padStart(2, '0')}`
}

export function fmtTimeOnly(d) {
  const dt = d instanceof Date ? d : new Date(d)
  return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
}

export function fmtCountdown(ms) {
  if (ms < 0) ms = 0
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0 ? `${h}시간 ${m}분 ${sec}초` : `${m}분 ${sec}초`
}

export function fmtAgo(ms) {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}초 전`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}분 전`
  return `${Math.floor(m / 60)}시간 ${m % 60}분 전`
}

// ---- 식사 시간대 판단 (PRD 4.2) ----
export function mealTimes(meal) {
  return {
    start: new Date(meal.orderStart).getTime(),
    end: new Date(meal.orderEnd).getTime(),
    eat: new Date(meal.eatAt).getTime(),
  }
}

// 현재 주문 가능한 식사 (주문 가능 시간대가 겹치지 않는다고 가정)
export function getOpenMeal(t) {
  return MEALS.find((m) => {
    const { start, end } = mealTimes(m)
    return t >= start && t < end
  }) || null
}

// 다음 주문 가능 식사 (아직 시작 전인 것 중 가장 빠른 것)
export function getNextMeal(t) {
  return (
    MEALS.filter((m) => mealTimes(m).start > t).sort(
      (a, b) => mealTimes(a).start - mealTimes(b).start,
    )[0] || null
  )
}

// 주문 내역이 화면에 노출되는 식사들: orderStart <= now < eatAt (겹침 허용)
export function getVisibleMeals(t) {
  return MEALS.filter((m) => {
    const { start, eat } = mealTimes(m)
    return t >= start && t < eat
  })
}
