/* Main pitch deck shell — canvas, controls, transitions */
/* updated: hex-fallback PDF export */
'use client'

import { useCallback } from 'react'
import { deckData } from '@/lib/pitch/deck-data'
import { PitchCanvas } from './pitch-canvas'
import { PitchSlide } from './pitch-slide'
import { SlideTransition } from './slide-transition'
import { DeckControls } from './deck-controls'
import { useDeckNavigation } from './use-deck-navigation'
import { useDeckPdf } from './use-deck-pdf'

export function PitchDeck() {
  const { slides } = deckData
  const {
    index,
    direction,
    isFullscreen,
    deckRef,
    goTo,
    next,
    prev,
    toggleFullscreen,
    canPrev,
    canNext,
  } = useDeckNavigation({ total: slides.length })

  const { isExporting, progress, exportError, exportPdf } = useDeckPdf()

  const currentSlide = slides[index]

  const handleExport = useCallback(() => {
    exportPdf(slides, () => index, goTo)
  }, [exportPdf, slides, index, goTo])

  if (!currentSlide) return null

  return (
    <div
      ref={deckRef}
      data-testid="pitch-deck"
      className="relative h-dvh w-full overflow-hidden bg-background"
    >
      {/* Subtle grid background */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:72px_72px]" />

      {/* 16:9 canvas */}
      <PitchCanvas>
        <div data-pitch-canvas className="relative h-full w-full overflow-hidden">
          <SlideTransition slideKey={currentSlide.id} direction={direction}>
            <PitchSlide slide={currentSlide} />
          </SlideTransition>
        </div>
      </PitchCanvas>

      {/* Controls overlay */}
      <DeckControls
        slides={slides}
        index={index}
        canPrev={canPrev}
        canNext={canNext}
        isFullscreen={isFullscreen}
        isExporting={isExporting}
        onPrev={prev}
        onNext={next}
        onGoTo={goTo}
        onToggleFullscreen={toggleFullscreen}
        onExportPdf={handleExport}
      />

      {/* Export progress overlay */}
      {isExporting && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="space-y-4 text-center">
            <div className="h-8 w-8 mx-auto animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <p className="font-mono text-sm text-muted-foreground">
              Exporting PDF… {progress}%
            </p>
          </div>
        </div>
      )}
      {exportError && (
        <p
          role="alert"
          className="absolute bottom-16 left-1/2 z-[70] -translate-x-1/2 rounded-lg border border-destructive/40 bg-background px-4 py-2 text-sm text-destructive"
        >
          {exportError}
        </p>
      )}
    </div>
  )
}
