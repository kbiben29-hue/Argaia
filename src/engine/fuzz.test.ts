// Random games: every legal move and every answer is picked at random. Catches crashes, stuck
// states and broken invariants (dice counts, card counts) across thousands of positions.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply, newGame } from './engine'
import { legalIntents } from './moves'
import { Rng } from './rng'
import type { GameState, Intent } from './types'

function randomAnswer(s: GameState, r: Rng): Intent {
	if (s.pending.kind !== 'choose') throw new Error('not a question')
	const q = s.pending.question
	const ids = r.shuffle(q.options.map((o) => o.id))
	let n = q.min + r.int(q.max - q.min + 1)
	let picks = ids.slice(0, n)
	if (q.group) {
		const g = q.group
		const keep: string[] = []
		let inG = 0
		for (const id of ids) {
			if (keep.length === n) break
			if (g.ids.includes(id)) {
				if (inG >= g.max) continue
				inG++
			}
			keep.push(id)
		}
		picks = keep
		n = keep.length
	}
	return { t: 'choose', player: s.pending.player, picks }
}

function invariants(s: GameState) {
	for (const p of [0, 1] as const) {
		const pl = s.players[p]
		assert.equal(pl.dice.length, 10, 'ten dice each')
		const count = pl.deck.length + pl.hand.length + pl.discard.length + pl.spellboard.flat().length + pl.battlefield.filter((u) => s.inst[u].stub !== 'frost-talon' && s.inst[u].stub !== 'stellar-oracle' && s.inst[u].stub !== 'spark-drone' && s.inst[u].stub !== 'thunder-hulk').length
		const attached = Object.values(s.inst).filter((c) => c.owner === p && c.zone === 'attached').length
		const stack = Object.values(s.inst).filter((c) => c.owner === p && c.zone === 'stack').length
		assert.equal(count + attached + stack, 30, `30 cards for player ${p}`)
		assert.equal(pl.conj.length + pl.battlefield.filter((u) => ['frost-talon', 'stellar-oracle', 'spark-drone', 'thunder-hulk'].includes(s.inst[u].stub)).length, 5, 'five conjurations')
		for (const d of pl.dice) if (d.loc === 'card') assert.ok(['battlefield', 'spellboard', 'pb', 'attached'].includes(s.inst[d.on!].zone), 'dice only sit on cards in play')
		assert.ok(pl.battlefield.length <= 7)
	}
}

test('random games finish without errors', () => {
	let finished = 0
	for (let g = 0; g < 300; g++) {
		const r = new Rng(1000 + g)
		let s = newGame({ seed: 77 + g * 13, decks: g % 2 ? ['arren', 'issa'] : ['issa', 'arren'], names: ['A', 'B'] })
		for (let step = 0; step < 3000 && s.pending.kind !== 'over'; step++) {
			let i: Intent
			if (s.pending.kind === 'choose') i = randomAnswer(s, r)
			else {
				const moves = legalIntents(s)
				assert.ok(moves.length > 0, 'there is always a move')
				// lean towards actions so games end
				const acts = moves.filter((m) => m.t !== 'pass' && m.t !== 'endTurn')
				i = acts.length && r.float() < 0.85 ? acts[r.int(acts.length)] : moves[r.int(moves.length)]
			}
			s = apply(s, i)
			invariants(s)
		}
		if (s.pending.kind === 'over') finished++
	}
	assert.ok(finished > 200, `most games end (${finished}/300)`)
})
