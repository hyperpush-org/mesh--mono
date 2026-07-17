import catalog from '../../capabilities.runtime.json'

export type CapabilityState = 'unavailable' | 'preview' | 'beta' | 'live'
export type CapabilityKey = keyof typeof catalog.capabilities

export const CAPABILITIES = catalog.capabilities

export function capabilityState(key: CapabilityKey): CapabilityState {
  return CAPABILITIES[key].state as CapabilityState
}

export function isCapabilityLive(key: CapabilityKey): boolean {
  return capabilityState(key) === 'live'
}
