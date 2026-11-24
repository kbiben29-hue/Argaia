import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tryApply, apply } from '../engine/engine'
import { bestPicks } from '../bot/bot'
import type { GameState, Intent, PlayerId } from '../engine/types'
import { DRILLS, drillCoach, comboNote, PLANS } from './lessons'

const go = (s: GameState, i: Intent) => {
	const r = tryApply(s, i)
	if (r.error) assert.fail(`${JSON.stringify(i)}: ${r.error}`)
	return r.state
}
/** Answer questions: the computer answers its own by score; ours with `pick` (falls back to the best). */
function answer(s: GameState, pick: (q: { options: { id: string }[] }) => string[] | null = () => null): GameState {
	for (let k = 0; k < 30 && s.pending.kind === 'choose'; k++) {
		const p = s.pending.player as PlayerId
		const q = s.pending.question
		s = apply(s, { t: 'choose', player: p, picks: (p === 0 && pick(q)) || bestPicks(q) })
	}
	return s
}
const unit = (s: GameState, p: PlayerId, stub: string) => s.players[p].battlefield.find((u) => s.inst[u].stub === stub)!
const hand = (s: GameState, stub: string) => s.players[0].hand.find((u) => s.inst[u].stub === stub)!
const powerDie = (s: GameState) => s.players[0].dice.find((d) => d.loc === 'active' && d.level === 'power')!.id
const basics = (s: GameState, n: number) => s.players[0].dice.filter((d) => d.loc === 'active' && d.level === 'basic').slice(0, n).map((d) => d.id)

test('every drill can be solved, and the coach has a step until it is', () => {
	for (const d of DRILLS) {
		const start = d.build(7)
		let s = start
		assert.ok(drillCoach(d, s, start), `${d.id}: has a first step`)
		assert.ok(!d.success(s, start), `${d.id}: not solved at the start`)
		if (d.id === 'arren-main-side') {
			const hulk = unit(s, 1, 'thunder-hulk')
			s = answer(go(s, { t: 'play', player: 0, card: hand(s, 'aerial-strike'), dice: basics(s, 1) }), () => [String(hulk)])
			s = answer(go(s, { t: 'attack', player: 0, target: unit(s, 1, 'core-supplier'), attackers: [unit(s, 0, 'skybreak-captain')] }))
		}
		if (d.id === 'arren-clear-way') {
			const drone = unit(s, 1, 'spark-drone')
			s = answer(go(s, { t: 'play', player: 0, card: hand(s, 'aerial-strike'), dice: basics(s, 1) }), () => [String(drone)])
			s = answer(go(s, { t: 'attack', player: 0, target: 'pb', attackers: [unit(s, 0, 'skybreak-captain'), unit(s, 0, 'frost-talon')] }))
		}
		if (d.id === 'issa-wake-hulk') {
			const hulk = unit(s, 0, 'thunder-hulk')
			s = go(s, { t: 'dicePower', player: 0, die: powerDie(s), target: hulk })
			s = answer(go(s, { t: 'attack', player: 0, target: 'pb', attackers: [hulk] }))
		}
		if (d.id === 'issa-display') {
			s = go(s, { t: 'dicePower', player: 0, die: powerDie(s), target: s.players[0].pb })
			const order = ['frost-talon', 'javelineer', 'stellar-oracle', 'stellar-oracle'].map((st) => unit(s, 1, st))
			let k = 0
			s = answer(go(s, { t: 'play', player: 0, card: hand(s, 'brilliant-display'), dice: basics(s, 1) }), (q) => {
				const id = String(order[Math.min(k++, 3)])
				return q.options.some((o) => o.id === id) ? [id] : null
			})
		}
		assert.ok(d.success(s, start), `${d.id}: solved`)
		assert.equal(drillCoach(d, s, start), null, `${d.id}: coach has nothing left to say`)
	}
})

test('drills can’t be solved by just attacking', () => {
	const d = DRILLS.find((x) => x.id === 'arren-clear-way')!
	const start = d.build(7)
	const s = answer(go(start, { t: 'attack', player: 0, target: 'pb', attackers: [unit(start, 0, 'skybreak-captain'), unit(start, 0, 'frost-talon')] }))
	assert.ok(!d.success(s, start), 'the Spark Drone blocks')
	const w = DRILLS.find((x) => x.id === 'issa-wake-hulk')!
	const ws = w.build(7)
	assert.ok(tryApply(ws, { t: 'attack', player: 0, target: 'pb', attackers: [unit(ws, 0, 'thunder-hulk')] }).error, 'an uncharged Hulk can’t attack')
})

test('every deck has a plan and combo alerts fire', () => {
	assert.ok(PLANS.arren.length >= 3 && PLANS.issa.length >= 3)
	const d = DRILLS.find((x) => x.id === 'arren-main-side')!
	const s = d.build(7)
	const note = comboNote('arren', s, 0, new Set())
	assert.ok(note && note.key === 'combo-aerial-strike', 'Aerial Strike alert in the first drill position')
	const w = DRILLS.find((x) => x.id === 'issa-wake-hulk')!.build(7)
	assert.equal(comboNote('issa', w, 0, new Set())?.key, 'combo-wake-hulk')
})
