/* PDF export hook — html2canvas-pro + jsPDF at 16:9
 *
 * We inject a temporary <style> with stable hex theme values before each
 * capture so exported colors are consistent across browsers. */
'use client'

import { useCallback, useState } from 'react'

const SLIDE_W = 1920
const SLIDE_H = 1080

/**
 * Hex equivalents of the oklch theme vars used in the pitch deck.
 * Generated via canvas pixel-readback from the oklch originals.
 */
const HEX_OVERRIDES: Record<string, string> = {
  '--background': '#020202',
  '--foreground': '#f8f8f8',
  '--card': '#060606',
  '--card-foreground': '#f8f8f8',
  '--popover': '#030303',
  '--popover-foreground': '#f8f8f8',
  '--primary': '#f8f8f8',
  '--primary-foreground': '#020202',
  '--secondary': '#121212',
  '--secondary-foreground': '#f8f8f8',
  '--muted': '#0b0b0b',
  '--muted-foreground': '#808080',
  '--accent': '#00cf85',
  '--accent-foreground': '#020202',
  '--destructive': '#d40924',
  '--destructive-foreground': '#f8f8f8',
  '--border': '#1b1b1b',
  '--input': '#121212',
  '--ring': '#00cf85',
}

/** Inject a <style> that overrides CSS vars with hex values html2canvas can parse. */
function injectHexOverrides(): HTMLStyleElement {
  const style = document.createElement('style')
  style.setAttribute('data-pdf-hex-override', '')
  const declarations = Object.entries(HEX_OVERRIDES)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n')
  style.textContent = `:root {\n${declarations}\n}\n.dark {\n${declarations}\n}`
  document.head.appendChild(style)
  return style
}

export function useDeckPdf() {
  const [isExporting, setIsExporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [exportError, setExportError] = useState<string | null>(null)

  const exportPdf = useCallback(
    async (
      slides: readonly { id: string }[],
      getCurrentSlide: () => number,
      goTo: (n: number) => void,
    ) => {
      if (typeof window === 'undefined') return
      setIsExporting(true)
      setProgress(0)
      setExportError(null)

      let hexStyle: HTMLStyleElement | null = null

      try {
        // Dynamic imports — only pulled when user actually clicks export
        const html2canvasModule = await import('html2canvas-pro')
        const html2canvas = html2canvasModule.default

        // Use the browser ESM build of jsPDF to avoid node Worker issue
        const { jsPDF } = await import('jspdf')

        const pdf = new jsPDF({
          orientation: 'landscape',
          unit: 'px',
          format: [SLIDE_W, SLIDE_H],
          hotfixes: ['px_scaling'],
        })

        const originalIndex = getCurrentSlide()

        // Inject hex overrides so html2canvas can parse all colors
        hexStyle = injectHexOverrides()

        for (let i = 0; i < slides.length; i++) {
          goTo(i)
          // Wait for framer-motion transition + paint + style recalc
          await new Promise((r) => setTimeout(r, 700))

          const canvas = document.querySelector('[data-pitch-canvas]') as HTMLElement | null
          if (!canvas) continue

          const rendered = await html2canvas(canvas, {
            width: SLIDE_W,
            height: SLIDE_H,
            scale: 2,
            backgroundColor: '#020202',
            useCORS: true,
            logging: false,
          })

          const imgData = rendered.toDataURL('image/jpeg', 0.92)
          if (i > 0) pdf.addPage()
          pdf.addImage(imgData, 'JPEG', 0, 0, SLIDE_W, SLIDE_H)
          setProgress(Math.round(((i + 1) / slides.length) * 100))
        }

        pdf.save('hyperpush-pitch-deck.pdf')

        // Restore original slide
        goTo(originalIndex)
      } catch (err) {
        console.error('[pitch-pdf] Export failed:', err)
        setExportError('PDF export failed. Please try again.')
      } finally {
        // Remove hex overrides to restore oklch theme
        if (hexStyle?.parentNode) {
          hexStyle.parentNode.removeChild(hexStyle)
        }
        setIsExporting(false)
        setProgress(0)
      }
    },
    [],
  )

  return { isExporting, progress, exportError, exportPdf }
}
