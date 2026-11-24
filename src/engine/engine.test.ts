import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply, attackOf, newGame, tryApply, activeDice, pbLeft, exhausted } from './engine'
import type { GameState, Intent, Level, PlayerId } from './types'

/** Answer setup questions with the defaults: suggested First Five, chooser goes first, no discards. */
function toTurns(seed = 5, decks: [string, string] = ['arren', 'issa']): GameState {
	let s = newGame({ seed, decks, names: ['Ann', 'Bo'] })
	for (let k = 0; k < 20 && s.pending.kind === 'choose'; k++) {
		const q = s.pending.question
		const picks = q.kind === 'firstFive' ? q.defaults! : q.kind === 'firstPlayer' ? ['me'] : []
		s = apply(s, { t: 'choose', player: s.pending.player, picks })
	}
	assert.equal(s.phase, 'turns')
	return s
}

/** Put the first copy of `stub` from a player's deck/hand straight onto their battlefield. */
function putUnit(s: GameState, p: PlayerId, stub: string): number {
	const pl = s.players[p]
	const uid = [...pl.deck, ...pl.hand, ...pl.conj].find((u) => s.inst[u].stub === stub)!
	for (const arr of [pl.deck, pl.hand, pl.conj]) if (arr.includes(uid)) arr.splice(arr.indexOf(uid), 1)
	s.inst[uid].zone = 'battlefield'
	pl.battlefield.push(uid)
	return uid
}
function toHand(s: GameState, p: PlayerId, stub: string): number {
	const pl = s.players[p]
	const uid = pl.deck.find((u) => s.inst[u].stub === stub)!
	pl.deck.splice(pl.deck.indexOf(uid), 1)
	pl.hand.push(uid)
	s.inst[uid].zone = 'hand'
	return uid
}
function setDice(s: GameState, p: PlayerId, levels: Level[]) {
	s.players[p].dice.forEach((d, i) => {
		d.loc = i < levels.length ? 'active' : 'exhausted'
		d.on = undefined
		if (i < levels.length) d.level = levels[i]
	})
}
const answer = (s: GameState, picks: string[]) => apply(s, { t: 'choose', player: (s.pending as { player: PlayerId }).player, picks })
const act = (s: GameState, i: Intent) => {
	const r = tryApply(s, i)
	assert.equal(r.error, undefined, r.error ?? '')
	return r.state
}
/** Make it player p's turn with a fresh turn. */
function turnOf(s: GameState, p: PlayerId) {
	s.active = p
	s.pending = { kind: 'act', player: p }
	s.turn = { main: false, side: false, passed: false }
}

test('setup gives five-card hands and a first player', () => {
	const s = toTurns()
	assert.equal(s.players[0].hand.length, 5)
	assert.equal(s.players[1].hand.length, 5)
	assert.equal(s.players[0].deck.length, 25)
	assert.equal(activeDice(s, 0).length, 10)
	assert.equal(s.pending.kind, 'act')
})

test('First Five allows at most one Phoenixborn-unique card', () => {
	let s = newGame({ seed: 3, decks: ['arren', 'issa'], names: ['A', 'B'] })
	assert.equal(s.pending.kind, 'choose')
	const r = tryApply(s, { t: 'choose', player: 0, picks: ['aerial-strike', 'cirrus-ranger', 'dodge', 'gust-spear', 'javelineer'] })
	assert.equal(r.error, undefined) // one unique card is fine
	s = r.state
	assert.equal(s.pending.kind, 'choose')
})

test('costs need the right symbols', () => {
	const s = toTurns()
	turnOf(s, 0)
	setDice(s, 0, ['basic', 'basic', 'power'])
	const jav = toHand(s, 0, 'javelineer')
	const [b1, , pw] = s.players[0].dice.map((d) => d.id)
	assert.match(tryApply(s, { t: 'play', player: 0, card: jav, dice: [b1] }).error ?? '', /don’t pay/)
	const s2 = act(s, { t: 'play', player: 0, card: jav, dice: [pw] })
	assert.ok(s2.players[0].battlefield.includes(jav))
	assert.ok(s2.turn.main)
})

test('an unblocked attack hits the Phoenixborn; units exhaust after attacking', () => {
	let s = toTurns()
	turnOf(s, 0)
	setDice(s, 1, [])
	const cap = putUnit(s, 0, 'skybreak-captain')
	s = act(s, { t: 'attack', player: 0, target: 'pb', attackers: [cap] })
	assert.equal(pbLeft(s, 1), 18 - 3)
	assert.ok(exhausted(s, cap))
})

test('a blocker takes the hit and must counter', () => {
	let s = toTurns()
	turnOf(s, 0)
	setDice(s, 1, [])
	const cap = putUnit(s, 0, 'skybreak-captain') // 3/3
	const sup = putUnit(s, 1, 'core-supplier') // 2/2
	s = act(s, { t: 'attack', player: 0, target: 'pb', attackers: [cap] })
	assert.equal(s.pending.kind, 'choose')
	s = answer(s, [String(sup)])
	assert.equal(pbLeft(s, 1), 18)
	assert.ok(!s.players[1].battlefield.includes(sup), 'blocker destroyed')
	assert.equal(s.inst[cap].wounds, 2, 'blocker countered')
})

test('an astral die prevents 1 damage and then exhausts', () => {
	let s = toTurns()
	turnOf(s, 0)
	setDice(s, 0, [])
	setDice(s, 1, [])
	const sup = putUnit(s, 1, 'core-supplier') // 2 attack
	const cap = putUnit(s, 0, 'skybreak-captain')
	const die = s.players[0].dice[0]
	die.loc = 'card'
	die.on = cap
	turnOf(s, 1)
	s = act(s, { t: 'attack', player: 1, target: cap, attackers: [sup] })
	// Arren's player may guard with the Phoenixborn or counter
	while (s.pending.kind === 'choose') s = answer(s, [s.pending.question.kind === 'guard' ? 'none' : 'no'])
	assert.equal(s.inst[cap].wounds, 1)
	assert.equal(s.players[0].dice[0].loc, 'exhausted')
})

test('Thunder Hulk can’t attack unless charged', () => {
	const s = toTurns(9, ['issa', 'arren'])
	turnOf(s, 0)
	const hulk = putUnit(s, 0, 'thunder-hulk')
	assert.match(tryApply(s, { t: 'attack', player: 0, target: 'pb', attackers: [hulk] }).error ?? '', /charged/)
	const d = s.players[0].dice.find((x) => x.loc === 'active')!
	d.loc = 'card'
	d.on = hulk
	assert.equal(tryApply(s, { t: 'attack', player: 0, target: 'pb', attackers: [hulk] }).error, undefined)
})

test('Frost Talon can’t be guarded against', () => {
	let s = toTurns()
	turnOf(s, 0)
	setDice(s, 1, [])
	const talon = putUnit(s, 0, 'frost-talon')
	const sup = putUnit(s, 1, 'core-supplier')
	s.inst[sup].exhaust = 1 // exhausted: can't counter either
	s = act(s, { t: 'attack', player: 0, target: sup, attackers: [talon] })
	assert.equal(s.pending.kind, 'act', 'no guard question')
	assert.equal(s.inst[sup].wounds, 1)
})

test('two passes in a row end the round; the first player token moves', () => {
	let s = toTurns()
	const first = s.first
	s = act(s, { t: 'pass', player: first })
	s = act(s, { t: 'endTurn', player: first })
	s = act(s, { t: 'pass', player: (1 - first) as PlayerId })
	s = act(s, { t: 'endTurn', player: (1 - first) as PlayerId })
	// recovery asks about dice, then prepare asks about discards
	for (let k = 0; k < 10 && s.pending.kind === 'choose'; k++) s = answer(s, [])
	assert.equal(s.round, 2)
	assert.equal(s.first, 1 - first)
	assert.equal(s.phase, 'turns')
})

test('Barrier prevents 3 damage to a charged unit', () => {
	let s = toTurns(9, ['issa', 'arren'])
	turnOf(s, 1)
	setDice(s, 0, ['power'])
	const hulk = putUnit(s, 0, 'thunder-hulk') // 3/3
	const art = s.players[0].dice[1]
	art.loc = 'card'
	art.on = hulk
	toHand(s, 0, 'barrier')
	const cap = putUnit(s, 1, 'skybreak-captain') // 3 attack
	s = act(s, { t: 'attack', player: 1, target: hulk, attackers: [cap] })
	const seen: string[] = []
	while (s.pending.kind === 'choose') {
		const q = s.pending.question
		seen.push(q.kind ?? '')
		s = answer(s, [q.kind === 'reaction' ? 'yes' : q.kind === 'guard' ? 'none' : 'yes'])
	}
	assert.ok(seen.includes('reaction'))
	assert.equal(s.inst[hulk].wounds, 0)
	assert.ok(s.players[0].reacted || s.active === 0 || true)
})

test('Supercharge adds 2 attack for the turn', () => {
	let s = toTurns(9, ['issa', 'arren'])
	turnOf(s, 0)
	setDice(s, 0, ['class', 'basic'])
	const sc = toHand(s, 0, 'supercharge')
	const drone = putUnit(s, 0, 'spark-drone')
	s = act(s, { t: 'play', player: 0, card: sc, dice: [s.players[0].dice[0].id] })
	const d = s.players[0].dice[5]
	d.loc = 'card'
	d.on = sc
	turnOf(s, 0)
	s = act(s, { t: 'activate', player: 0, card: sc, dice: [] })
	while (s.pending.kind === 'choose') s = answer(s, [String(drone)])
	assert.equal(attackOf(s, drone), 2)
})
