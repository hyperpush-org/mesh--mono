import type { Metadata } from 'next'

const DEFAULT_SITE_URL = 'https://hyperpush.dev'

export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? DEFAULT_SITE_URL

type SocialMetadataOptions = {
  title: string
  description: string
  canonicalPath: string
}

export function buildSocialMetadata({
  title,
  description,
  canonicalPath,
}: SocialMetadataOptions): Pick<
  Metadata,
  'alternates' | 'openGraph' | 'twitter'
> {
  const canonicalUrl = new URL(canonicalPath, siteUrl).toString()
  return {
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: 'hyperpush',
      type: 'website',
      locale: 'en_US',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  }
}
