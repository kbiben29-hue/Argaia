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
		assert.equal(pl.dice.length, s.solo?.chimera === p ? 5 : 10, 'dice count')
		const lists: Record<string, number[]> = { deck: pl.deck, hand: pl.hand, discard: pl.discard, spellboard: pl.spellboard.flat(), conj: pl.conj }
		for (const c of Object.values(s.inst)) {
			if (c.owner !== p) continue
			const l = lists[c.zone]
			if (l) assert.ok(l.includes(c.uid), `${c.stub} zone ${c.zone} matches its list`)
			if (c.zone === 'battlefield') assert.ok(s.players[0].battlefield.includes(c.uid) || s.players[1].battlefield.includes(c.uid), `${c.stub} on a battlefield`)
			if (c.zone === 'attached') assert.ok(c.host !== undefined && s.inst[c.host].alts.includes(c.uid), 'attached to its host')
			if (c.zone === 'threat') assert.ok(s.solo?.threatZone.includes(c.uid), 'threat card listed')
		}
		for (const [z, l] of Object.entries(lists)) for (const u of l) assert.equal(s.inst[u].zone, z, `listed in ${z}`)
		for (const u of pl.battlefield) assert.equal(s.inst[u].zone, 'battlefield')
		assert.equal(new Set(Object.values(lists).flat().concat(pl.battlefield)).size, Object.values(lists).flat().length + pl.battlefield.length, 'no card twice')
		for (const d of pl.dice) if (d.loc === 'card') assert.ok(['battlefield', 'spellboard', 'pb', 'attached'].includes(s.inst[d.on!].zone), 'dice only sit on cards in play')
		assert.ok(pl.battlefield.length <= (s.solo?.chimera === p ? 99 : 8))
	}
}

const PAIRS: [string, string][] = [
	['arren', 'issa'],
	['jessa', 'harold'],
	['xander', 'hope'],
	['harold', 'xander'],
	['hope', 'jessa'],
	['issa', 'xander'],
	['jessa', 'viros'],
	['harold', 'viros'],
	['xander', 'viros'],
	['hope', 'viros'],
]

test('random games finish without errors', () => {
	let finished = 0
	for (let g = 0; g < 300; g++) {
		const r = new Rng(1000 + g)
		const pair = PAIRS[g % PAIRS.length]
		let s = newGame({ seed: 77 + g * 13, decks: pair[1] === 'viros' || g % 20 < 10 ? pair : [pair[1], pair[0]], names: ['A', 'B'] })
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
	assert.ok(finished > 150, `most games end (${finished}/300)`)
})
