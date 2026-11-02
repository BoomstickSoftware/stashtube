import type { WantedScene } from '@flix/shared'

// A scene that can still be fetched: Whisparr lists it unmonitored, or only StashDB knows it.
export const canGetState = (s: WantedScene['state']) => s === 'available' || s === 'remote'
