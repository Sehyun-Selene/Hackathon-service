import { useCallback, useRef, useState } from 'react'

// 하단 시트 핸들 끌어내려서 닫기. 거리 또는 속도 임계값 넘으면 닫힘, 아니면 스냅백.
const CLOSE_DISTANCE = 80 // px
const CLOSE_VELOCITY = 0.5 // px/ms

export function useSheetDrag(onClose) {
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const startRef = useRef(null) // { y, t }

  const onPointerDown = useCallback((e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    startRef.current = { y: e.clientY, t: Date.now() }
    setDragging(true)
  }, [])

  const onPointerMove = useCallback((e) => {
    if (!startRef.current) return
    setDragY(Math.max(0, e.clientY - startRef.current.y))
  }, [])

  const endDrag = useCallback(() => {
    if (!startRef.current) {
      setDragging(false)
      return
    }
    const { t } = startRef.current
    startRef.current = null
    setDragging(false)
    // 함수형 업데이트로 최신 dragY 읽어서 stale closure 방지
    setDragY((current) => {
      const dt = Math.max(1, Date.now() - t)
      if (current > CLOSE_DISTANCE || current / dt > CLOSE_VELOCITY) onClose()
      return 0
    })
  }, [onClose])

  return {
    dragging,
    sheetStyle: {
      transform: dragY ? `translateY(${dragY}px)` : undefined,
      transition: dragging ? 'none' : 'transform 0.2s ease',
    },
    handleHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  }
}
