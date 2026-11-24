// Build a position directly (drills, tests): player 0's turn in the player turns phase, with chosen
// units, spells, hand, dice and wounds. Everything not placed stays in the draw pile.

import { newGame, log } from './engine'
import type { GameState, Level, PlayerId } from './types'

export interface CardSpec {
	stub: string
	wounds?: number
	exhaust?: number
	/** how many of the player's own dice sit on this card */
	dice?: number
}

export interface SideSpec {
	/** wounds on the Phoenixborn */
	wounds?: number
	/** dice on the Phoenixborn */
	pbDice?: number
	battlefield?: CardSpec[]
	spellboard?: CardSpec[]
	hand?: string[]
	/** sides of the dice in the active pool (the rest are exhausted) */
	active?: Level[]
	/** the Phoenixborn already guarded this round */
	guarded?: boolean
}

export function scenario(decks: [string, string], names: [string, string], sides: [SideSpec, SideSpec], seed = 1): GameState {
	const s = newGame({ seed, decks, names })
	s.queue = []
	s.log = []
	for (const p of [0, 1] as PlayerId[]) {
		const pl = s.players[p]
		const spec = sides[p]
		// everything back to the deck
		for (const u of pl.hand) s.inst[u].zone = 'deck'
		pl.deck.push(...pl.hand)
		pl.hand = []
		const take = (stub: string): number => {
			const fromDeck = pl.deck.findIndex((u) => s.inst[u].stub === stub)
			if (fromDeck >= 0) return pl.deck.splice(fromDeck, 1)[0]
			const fromConj = pl.conj.findIndex((u) => s.inst[u].stub === stub)
			if (fromConj >= 0) return pl.conj.splice(fromConj, 1)[0]
			throw new Error(`scenario: no ${stub} left for player ${p}`)
		}
		let die = 0
		const putDice = (uid: number, n = 0) => {
			for (let k = 0; k < n; k++) {
				const d = pl.dice[die++]
				d.loc = 'card'
				d.on = uid
				d.level = 'basic'
			}
		}
		s.inst[pl.pb].wounds = spec.wounds ?? 0
		putDice(pl.pb, spec.pbDice)
		for (const c of spec.battlefield ?? []) {
			const uid = take(c.stub)
			Object.assign(s.inst[uid], { zone: 'battlefield', wounds: c.wounds ?? 0, exhaust: c.exhaust ?? 0 })
			pl.battlefield.push(uid)
			putDice(uid, c.dice)
		}
		for (const c of spec.spellboard ?? []) {
			const uid = take(c.stub)
			Object.assign(s.inst[uid], { zone: 'spellboard', exhaust: c.exhaust ?? 0 })
			const stack = pl.spellboard.find((st) => s.inst[st[0]].stub === c.stub)
			if (stack) stack.push(uid)
			else pl.spellboard.push([uid])
			putDice(uid, c.dice)
		}
		for (const stub of spec.hand ?? []) {
			const uid = take(stub)
			s.inst[uid].zone = 'hand'
			pl.hand.push(uid)
		}
		for (const lv of spec.active ?? []) {
			const d = pl.dice[die++]
			d.loc = 'active'
			d.level = lv
		}
		for (; die < pl.dice.length; die++) {
			pl.dice[die].loc = 'exhausted'
			pl.dice[die].level = 'basic'
		}
		pl.guarded = !!spec.guarded
	}
	s.phase = 'turns'
	s.round = 3
	s.first = 0
	s.active = 0
	s.turn = { main: false, side: false, passed: false }
	s.lastPassed = false
	s.pending = { kind: 'act', player: 0 }
	log(s, '— Drill —')
	return s
}
