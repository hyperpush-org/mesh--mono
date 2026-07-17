import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { buildSocialMetadata, siteUrl } from '@/lib/social-metadata'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })

const title = 'hyperpush — Production Error Tracking for Fast-Moving Teams'
const description =
  'Capture production errors, group issues, inspect recorded evidence, and manage issue and alert lifecycle from one focused workflow.'
const socialMetadata = buildSocialMetadata({
  title,
  description,
  canonicalPath: '/',
})

type ThemeStyle = React.CSSProperties & Record<`--${string}`, string>

// Keep the runtime color tokens in broadly supported RGB syntax. The CSS
// optimizer may serialize stylesheet colors as Lab; inline tokens avoid older
// browser and accessibility-engine misinterpretation while preserving the same
// visual palette.
const runtimeTheme: ThemeStyle = {
  '--background': 'rgb(2 2 2)',
  '--foreground': 'rgb(248 248 248)',
  '--card': 'rgb(6 6 6)',
  '--card-foreground': 'rgb(248 248 248)',
  '--popover': 'rgb(3 3 3)',
  '--popover-foreground': 'rgb(248 248 248)',
  '--primary': 'rgb(248 248 248)',
  '--primary-foreground': 'rgb(2 2 2)',
  '--secondary': 'rgb(18 18 18)',
  '--secondary-foreground': 'rgb(248 248 248)',
  '--muted': 'rgb(11 11 11)',
  '--muted-foreground': 'rgb(146 146 146)',
  '--accent': 'rgb(0 207 133)',
  '--accent-foreground': 'rgb(2 2 2)',
  '--destructive': 'rgb(212 9 36)',
  '--destructive-foreground': 'rgb(248 248 248)',
  '--border': 'rgb(27 27 27)',
  '--input': 'rgb(18 18 18)',
  '--ring': 'rgb(0 207 133)',
}

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: title,
    template: '%s | hyperpush',
  },
  description,
  keywords: [
    'error tracking',
    'error grouping',
    'stack trace monitoring',
    'sentry alternative',
    'developer tools',
    'issue lifecycle',
    'in-product alerts',
  ],
  authors: [{ name: 'hyperpush', url: siteUrl }],
  creator: 'hyperpush',
  publisher: 'hyperpush',
  formatDetection: { email: false, address: false, telephone: false },
  ...socialMetadata,
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: '16x16 32x32 48x48', type: 'image/x-icon' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#141414' },
    { media: '(prefers-color-scheme: light)', color: '#141414' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const analyticsEnabled = process.env.NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS === 'true'

  return (
    <html lang="en" className="scroll-smooth">
      <body
        className={`${geist.variable} ${geistMono.variable} font-sans antialiased overflow-x-hidden`}
        style={runtimeTheme}
      >
        {children}
        {analyticsEnabled ? <Analytics /> : null}
      </body>
    </html>
  )
}
