import { useState, useEffect, useRef, useCallback } from 'react'

export interface UndoItem {
  label: string
  fn: () => Promise<void>
}

export function useUndoStack() {
  const [stack, setStack] = useState<UndoItem[]>([])
  const [mensaje, setMensaje] = useState<string | null>(null)
  const stackRef = useRef<UndoItem[]>([])
  stackRef.current = stack

  const pushUndo = useCallback((item: UndoItem) => {
    setStack((prev) => [...prev.slice(-19), item])
  }, [])

  const undo = useCallback(async () => {
    const last = stackRef.current[stackRef.current.length - 1]
    if (!last) return
    setStack((prev) => prev.slice(0, -1))
    await last.fn()
    setMensaje(`↩ Deshecho: ${last.label}`)
    setTimeout(() => setMensaje(null), 3000)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        const active = document.activeElement
        const isInput = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
        if (isInput) return
        e.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo])

  return { pushUndo, mensaje, canUndo: stack.length > 0 }
}
