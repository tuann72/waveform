import { useRef, type RefObject } from 'react'

interface UseDialDragOptions {
  trackRef: RefObject<HTMLDivElement | null>
  onChange: (position: number) => void
  disabled?: boolean
}

export function useDialDrag({ trackRef, onChange, disabled }: UseDialDragOptions) {
  const isDragging = useRef(false)

  function computePosition(clientX: number): number {
    if (!trackRef.current) return 50
    const rect = trackRef.current.getBoundingClientRect()
    const raw = ((clientX - rect.left) / rect.width) * 100
    return Math.max(0, Math.min(100, raw))
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (disabled) return
    isDragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    onChange(computePosition(e.clientX))
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging.current || disabled) return
    onChange(computePosition(e.clientX))
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    isDragging.current = false
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  return { handlePointerDown, handlePointerMove, handlePointerUp }
}
