import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tryApply, apply, canAttackWith, playCost, suggestDice } from '../engine/engine'
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

const die = (s: GameState, magic: string, level: string) => s.players[0].dice.find((d) => d.loc === 'active' && d.magic === magic && d.level === level)!.id
const yesTo = (q: { options: { id: string }[] }) => (q.options.some((o) => o.id === 'yes') ? ['yes'] : null)

function solveFun(id: string, s: GameState): GameState {
	switch (id) {
		case 'fun-side-action':
			s = answer(go(s, { t: 'dicePower', player: 0, die: die(s, 'natural', 'power'), target: unit(s, 1, 'frost-talon') }))
			return answer(go(s, { t: 'attack', player: 0, target: 'pb', attackers: [unit(s, 0, 'cerasaurus-mount')] }))
		case 'fun-meditate': {
			s = go(s, {
				t: 'meditate',
				player: 0,
				items: [
					{ from: 'hand', card: hand(s, 'transmute-magic'), die: die(s, 'ceremonial', 'class'), level: 'power' },
					{ from: 'hand', card: hand(s, 'consume-soul'), die: die(s, 'sympathy', 'basic'), level: 'class' },
				],
			})
			const mv = hand(s, 'master-vampire')
			return answer(go(s, { t: 'play', player: 0, card: mv, dice: suggestDice(s, 0, playCost(s, mv))! }))
		}
		case 'fun-mark': {
			const cap = unit(s, 1, 'skybreak-captain')
			s = answer(go(s, { t: 'activate', player: 0, card: s.players[0].pb, dice: [] }), () => [String(cap)])
			return answer(go(s, { t: 'attack', player: 0, target: cap, attackers: [unit(s, 0, 'psychic-vampire')] }))
		}
		case 'fun-fuel':
			return answer(go(s, { t: 'play', player: 0, card: hand(s, 'fear'), dice: [die(s, 'charm', 'basic')] }), yesTo)
		case 'fun-wide':
			return answer(go(s, { t: 'attack', player: 0, target: 'pb', attackers: s.players[0].battlefield.slice() }))
		case 'fun-dice-denial': {
			const powers = s.players[1].dice.filter((d) => d.loc === 'active' && d.level === 'power').map((d) => d.id)
			s = answer(go(s, { t: 'dicePower', player: 0, die: die(s, 'illusion', 'power') }), () => powers.slice(0, 2))
			return answer(go(s, { t: 'activate', player: 0, card: s.players[0].spellboard[0][0], dice: [] }))
		}
		case 'fun-bleed':
			return answer(go(s, { t: 'dicePower', player: 0, die: die(s, 'natural', 'power'), target: unit(s, 1, 'whiplash') }))
	}
	return s
}

test('the obvious attack fails in every Finding-the-fun puzzle', () => {
	for (const d of DRILLS.filter((x) => x.course === 'fun')) {
		const start = d.build(7)
		const mine = start.players[0].battlefield.filter((u) => canAttackWith(start, u))
		if (d.id === 'fun-wide') {
			const s = answer(go(start, { t: 'attack', player: 0, target: 'pb', attackers: [unit(start, 0, 'raptor-herder')] }))
			assert.ok(!d.success(s, start), 'one attacker is not enough')
			continue
		}
		if (mine.length === 0) continue
		const target = d.id === 'fun-mark' ? unit(start, 1, 'skybreak-captain') : 'pb'
		const s = answer(go(start, { t: 'attack', player: 0, target, attackers: target === 'pb' ? mine : mine.slice(0, 1) }))
		assert.ok(!d.success(s, start), `${d.id}: a straight attack doesn't solve it`)
	}
})

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
		s = solveFun(d.id, s)
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
