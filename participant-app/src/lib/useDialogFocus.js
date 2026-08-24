import { useEffect, useRef } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

// 시트가 열리면 키보드 포커스를 안에 두고, 닫히면 열었던 버튼으로 돌려보냅니다.
export function useDialogFocus(active, onClose) {
  const dialogRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!active) return undefined
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    const dialog = dialogRef.current
    const focusable = () => [...(dialog?.querySelectorAll(FOCUSABLE) || [])]

    document.body.style.overflow = 'hidden'
    window.requestAnimationFrame(() => (focusable()[0] || dialog)?.focus())

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (!items.length) {
        event.preventDefault()
        dialog?.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [active])

  return dialogRef
}
