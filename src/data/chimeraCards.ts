// Red Rains: The Corpse of Viros (the first chimera), numbers only. Values follow the published
// Red Rains cards (as also used by the open-source Ashteki client). Images come from ashes-cards.

import type { CardDef } from '../engine/types'

export const CHIMERA_CARDS: Record<string, CardDef> = {
	'corpse-of-viros': { stub: 'corpse-of-viros', name: 'The Corpse of Viros', type: 'Chimera', life: 30, ultimate: 3, threat: 4, battlefield: 99, spellboard: 0 },
	rampage: { stub: 'rampage', name: 'Rampage', type: 'Aspect', aim: 'right', attack: 2, life: 2, recover: 0, blood: 1, statusCount: 2 },
	'hunting-instincts': { stub: 'hunting-instincts', name: 'Hunting Instincts', type: 'Aspect', aim: 'left', attack: 4, life: 3, recover: 0, blood: 2 },
	firebelly: { stub: 'firebelly', name: 'Firebelly', type: 'Aspect', aim: 'jaw', attack: 1, life: 2, recover: 0, blood: 1 },
	'iron-scales': { stub: 'iron-scales', name: 'Iron Scales', type: 'Aspect', aim: 'left', attack: 3, life: 2, recover: 0, blood: 2 },
	'frozen-fear': { stub: 'frozen-fear', name: 'Frozen Fear', type: 'Aspect', aim: 'jaw', attack: 3, life: 3, recover: 0, blood: 2 },
	whiplash: { stub: 'whiplash', name: 'Whiplash', type: 'Aspect', aim: 'right', attack: 2, life: 1, recover: 0, blood: 1 },
}

/** The Fury aspect deck: three of each. */
export const VIROS_ASPECTS = ['rampage', 'hunting-instincts', 'firebelly', 'iron-scales', 'frozen-fear', 'whiplash'].flatMap((s) => [s, s, s])

/** Starting threat cards by blood value, per difficulty and stage (Standard 1 is the one-player default). */
export const VIROS_SETUP: Record<string, number[]> = {
	S1: [1, 2, 2, 2],
	S2: [1, 2, 1, 2, 2],
	S3: [1, 2, 1, 2, 1, 2],
	H1: [1, 2, 1, 1, 2],
	H2: [1, 2, 1, 1, 1, 2],
	H3: [1, 2, 1, 2, 1, 1, 2],
}

/** Our own one-line summaries of each aspect (the chimera's cards aren't in the card database). */
export const ASPECT_HELP: Record<string, string> = {
	'corpse-of-viros': 'The chimera. Wounds here win you the game. Rage dice, Red Rains tokens and its ultimate drive it.',
	rampage: 'Attacks your rightmost unit. Status 2: at the start of the chimera’s turn, spends a status token to re-roll all basic rage dice.',
	'hunting-instincts': 'Attacks your leftmost unit. When it destroys a unit in a fight, the chimera gains a Red Rains token.',
	firebelly: 'Attacks your Phoenixborn. When it attacks, it deals 1 damage to each of your units and your Phoenixborn.',
	'iron-scales': 'Attacks your leftmost unit. Damage to it is reduced to 1. Defender: while ready it blocks and guards for the chimera.',
	'frozen-fear': 'Attacks your Phoenixborn. Terrifying 1. When it destroys a unit in a fight, your Phoenixborn is exhausted.',
	whiplash: 'Attacks your rightmost unit. When revealed: destroys your leftmost damaged unit, or deals 1 damage to your leftmost unit.',
}
