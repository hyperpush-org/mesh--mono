/// <reference types="vite/client" />
import type { ReactNode } from 'react'
import { Analytics } from '@vercel/analytics/react'
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import geistSans400 from '@fontsource/geist/400.css?url'
import geistSans500 from '@fontsource/geist/500.css?url'
import geistSans600 from '@fontsource/geist/600.css?url'
import geistSans700 from '@fontsource/geist/700.css?url'
import geistMono400 from '@fontsource/geist-mono/400.css?url'
import geistMono500 from '@fontsource/geist-mono/500.css?url'
import geistMono600 from '@fontsource/geist-mono/600.css?url'
import geistMono700 from '@fontsource/geist-mono/700.css?url'
import { Toaster } from '@/components/ui/toaster'
import appCss from '../../app/globals.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'hyperpush — Error Tracking Dashboard',
      },
      {
        name: 'description',
        content:
          'Production error tracking with grouped issues, recorded evidence, in-product alerts, and project-scoped settings.',
      },
    ],
    links: [
      { rel: 'stylesheet', href: geistSans400 },
      { rel: 'stylesheet', href: geistSans500 },
      { rel: 'stylesheet', href: geistSans600 },
      { rel: 'stylesheet', href: geistSans700 },
      { rel: 'stylesheet', href: geistMono400 },
      { rel: 'stylesheet', href: geistMono500 },
      { rel: 'stylesheet', href: geistMono600 },
      { rel: 'stylesheet', href: geistMono700 },
      { rel: 'stylesheet', href: appCss },
      {
        rel: 'icon',
        href: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        rel: 'icon',
        href: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        rel: 'icon',
        href: '/icon.svg',
        type: 'image/svg+xml',
      },
      {
        rel: 'apple-touch-icon',
        href: '/apple-icon.png',
      },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  const analyticsEnabled =
    import.meta.env.PROD && import.meta.env.VITE_ENABLE_VERCEL_ANALYTICS === 'true'

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="font-sans antialiased select-none">
        {children}
        <Toaster />
        {analyticsEnabled ? <Analytics /> : null}
        <Scripts />
      </body>
    </html>
  )
}
