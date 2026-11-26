// Script registry. Kept in its own module so engine.ts, flows.ts and effects.ts can import each
// other's helpers; every lookup happens at call time, never while modules are loading.

import type { Script } from './engine'
import { FLOWS } from './flows'
import { CARD_SCRIPTS } from './effects'

export { ABILITIES, HOOKS, KEYWORDS, PLAY_CHECKS, type Ability } from './effects'

export function script(key: string): Script | undefined {
	return FLOWS[key] ?? CARD_SCRIPTS[key]
}
