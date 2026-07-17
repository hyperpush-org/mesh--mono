import catalog from './capabilities.public.json'

export type CapabilityState = 'unavailable' | 'preview' | 'beta' | 'live'
export type CapabilityKey = keyof typeof catalog.capabilities

export const PUBLIC_CAPABILITIES = Object.entries(catalog.capabilities).map(([key, value]) => ({
  key: key as CapabilityKey,
  label: value.publicLabel,
  state: value.state as CapabilityState,
}))

export function publicCapability(key: CapabilityKey) {
  const capability = catalog.capabilities[key]
  return {
    key,
    label: capability.publicLabel,
    state: capability.state as CapabilityState,
  }
}

export function livePublicCapabilities() {
  return PUBLIC_CAPABILITIES.filter((capability) => capability.state === 'live')
}
