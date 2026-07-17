/* ------------------------------------------------------------------
 *  Deck navigation hook — keyboard, touch, slide state, fullscreen
 * ----------------------------------------------------------------- */
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface UseDeckNavigationOptions {
  total: number
}

export function useDeckNavigation({ total }: UseDeckNavigationOptions) {
  const [index, setIndex] = useState(0)
  const [direction, setDirection] = useState(1)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const deckRef = useRef<HTMLDivElement>(null)

  // Touch tracking
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  const goTo = useCallback(
    (n: number) => {
      setIndex((prev) => {
        const clamped = Math.max(0, Math.min(n, total - 1))
        if (clamped === prev) return prev
        setDirection(clamped > prev ? 1 : -1)
        return clamped
      })
    },
    [total],
  )

  const next = useCallback(() => {
    setIndex((prev) => {
      if (prev >= total - 1) return prev
      setDirection(1)
      return prev + 1
    })
  }, [total])

  const prev = useCallback(() => {
    setIndex((prev) => {
      if (prev <= 0) return prev
      setDirection(-1)
      return prev - 1
    })
  }, [])

  const toggleFullscreen = useCallback(async () => {
    const el = deckRef.current
    if (!el) return
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen()
      } else {
        await document.exitFullscreen()
      }
    } catch {
      /* fullscreen not supported or denied */
    }
  }, [])

  // Keyboard
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Don't intercept when user is typing in an input or when a control button is focused
      const target = e.target as HTMLElement
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
      // If a button is focused, let Space/Enter activate the button natively — don't double-fire
      if (target.tagName === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return

      switch (e.key) {
        case 'ArrowRight':
        case ' ':
          e.preventDefault()
          next()
          break
        case 'ArrowLeft':
          e.preventDefault()
          prev()
          break
        case 'Escape':
          if (document.fullscreenElement) {
            document.exitFullscreen()
          }
          break
        case 'f':
        case 'F':
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault()
            toggleFullscreen()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [next, prev, toggleFullscreen])

  // Touch / swipe
  useEffect(() => {
    const el = deckRef.current
    if (!el) return

    function onTouchStart(e: TouchEvent) {
      const t = e.touches[0]
      if (t) touchStart.current = { x: t.clientX, y: t.clientY }
    }

    function onTouchEnd(e: TouchEvent) {
      if (!touchStart.current) return
      const t = e.changedTouches[0]
      if (!t) return

      const dx = t.clientX - touchStart.current.x
      const dy = t.clientY - touchStart.current.y
      touchStart.current = null

      // Horizontal swipe must be significantly larger than vertical
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return

      if (dx < 0) next()
      else prev()
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchend', onTouchEnd, { passive: true })

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [next, prev])

  // Fullscreen change listener
  useEffect(() => {
    function onFS() {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', onFS)
    return () => document.removeEventListener('fullscreenchange', onFS)
  }, [])

  return {
    index,
    direction,
    isFullscreen,
    deckRef,
    goTo,
    next,
    prev,
    toggleFullscreen,
    canPrev: index > 0,
    canNext: index < total - 1,
  }
}
