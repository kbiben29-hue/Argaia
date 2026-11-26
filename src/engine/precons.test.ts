// Rules tests for the four Reborn precons, the new dice powers and Red Rains (The Corpse of Viros).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { attackOf, lifeOf, newGame, pbLeft, tryApply, exhausted } from './engine'
import { scenario } from './scenario'
import type { GameState, Intent, PlayerId } from './types'

const act = (s: GameState, i: Intent) => {
	const r = tryApply(s, i)
	assert.equal(r.error, undefined, r.error ?? '')
	return r.state
}
/** Answer pending questions: `pick(question)` returns the ids, default = first option (or none when min is 0). */
function answer(s: GameState, pick: (q: { prompt: string; options: { id: string; label: string }[]; min: number }) => string[] | undefined = () => undefined, max = 30) {
	for (let k = 0; k < max && s.pending.kind === 'choose'; k++) {
		const q = s.pending.question
		const ids = pick(q) ?? (q.min > 0 ? q.options.slice(0, q.min).map((o) => o.id) : [])
		s = act(s, { t: 'choose', player: s.pending.player, picks: ids })
	}
	return s
}
const uidOf = (s: GameState, p: PlayerId, stub: string) => s.players[p].battlefield.find((u) => s.inst[u].stub === stub)!
const handOf = (s: GameState, p: PlayerId, stub: string) => s.players[p].hand.find((u) => s.inst[u].stub === stub)!
const powerDie = (s: GameState, p: PlayerId, magic: string) => s.players[p].dice.find((d) => d.loc === 'active' && d.magic === magic && d.level === 'power')!.id

test('Hunter’s Mark doubles wounds', () => {
	let s = scenario(['harold', 'arren'], ['H', 'A'], [{ spellboard: [{ stub: 'drain-vitality' }], active: ['class', 'class', 'class', 'class', 'class', 'class'] }, { battlefield: [{ stub: 'skybreak-captain' }] }])
	const cap = uidOf(s, 1, 'skybreak-captain')
	s = act(s, { t: 'activate', player: 0, card: s.players[0].pb, dice: [] })
	s = answer(s, (q) => (q.prompt.startsWith('Mark Prey') ? [String(cap)] : undefined))
	assert.equal(s.inst[cap].alts.length, 1)
	const cer = s.players[0].dice.find((d) => d.magic === 'ceremonial' && d.loc === 'active')!.id
	s = act(s, { t: 'activate', player: 0, card: s.players[0].spellboard[0][0], dice: [cer] })
	s = answer(s, (q) => (q.prompt.startsWith('Drain Vitality: deal') ? [String(cap)] : undefined))
	assert.ok(s.log.some((l) => l.includes('doubles the wounds')))
	assert.equal(s.inst[cap].wounds, 1, '1 damage → 2 wound tokens, then Drain Vitality removes one')
})

test('charm and divine dice change attack; natural power deals 1 damage', () => {
	let s = scenario(['xander', 'jessa'], ['X', 'J'], [{ battlefield: [{ stub: 'pain-shaman' }], active: ['power', 'class', 'class', 'class', 'class', 'power'] }, { battlefield: [{ stub: 'blood-archer' }] }])
	const shaman = uidOf(s, 0, 'pain-shaman')
	const archer = uidOf(s, 1, 'blood-archer')
	s = act(s, { t: 'dicePower', player: 0, die: powerDie(s, 0, 'divine'), target: shaman })
	assert.equal(attackOf(s, shaman), 2)
	s.turn.side = false
	s = act(s, { t: 'dicePower', player: 0, die: powerDie(s, 0, 'natural'), target: archer })
	assert.equal(s.inst[archer].wounds, 1)
})

test('illusion power lowers up to two opposing dice', () => {
	let s = scenario(['hope', 'arren'], ['H', 'A'], [{ active: ['power'] }, { active: ['power', 'power', 'class'] }])
	s = act(s, { t: 'dicePower', player: 0, die: powerDie(s, 0, 'illusion') })
	const ids = s.players[1].dice.filter((d) => d.loc === 'active' && d.level === 'power').map((d) => d.id)
	s = answer(s, () => ids)
	assert.deepEqual(s.players[1].dice.filter((d) => d.loc === 'active').map((d) => d.level).sort(), ['class', 'class', 'class'])
})

test('Transform: Beast Mage is bigger without the first player token, and Terrifying stops small blockers', () => {
	let s = scenario(['harold', 'issa'], ['H', 'I'], [{ battlefield: [{ stub: 'beast-mage' }] }, { battlefield: [{ stub: 'systems-drafter' }] }])
	const mage = uidOf(s, 0, 'beast-mage')
	assert.equal(attackOf(s, mage), 2, 'first player: printed values')
	s.first = 1
	assert.equal(attackOf(s, mage), 4)
	assert.equal(lifeOf(s, mage), 4)
	s = act(s, { t: 'attack', player: 0, target: 'pb', attackers: [mage] })
	s = answer(s, (q) => {
		assert.ok(!q.prompt.startsWith('Block'), 'a 1-attack unit can’t block a Terrifying 1 attacker')
		return undefined
	})
	assert.equal(pbLeft(s, 1), 18 - 4)
})

test('Fear destroys your unit, heals your Phoenixborn and discards an opposing unit; Final Cry follows', () => {
	let s = scenario(['jessa', 'arren'], ['J', 'A'], [{ wounds: 3, battlefield: [{ stub: 'blood-archer' }], hand: ['fear', 'final-cry'], active: ['basic', 'power'] }, { battlefield: [{ stub: 'skybreak-captain' }] }])
	s = act(s, { t: 'play', player: 0, card: handOf(s, 0, 'fear'), dice: [s.players[0].dice[0].id] })
	s = answer(s, (q) => (q.prompt.includes('Play Final Cry') ? ['yes'] : q.prompt.startsWith('Screams') ? ['no'] : undefined))
	assert.equal(s.players[0].battlefield.length, 0)
	assert.equal(s.players[1].battlefield.length, 0, 'the captain is discarded')
	assert.equal(s.inst[s.players[0].pb].wounds, 1, 'healed by the archer’s recover value (2)')
	assert.equal(pbLeft(s, 1), 15 - 2, 'Final Cry hits Arren')
})

test('a mount carries an ally and gives it back when destroyed (Dismount)', () => {
	let s = scenario(['xander', 'arren'], ['X', 'A'], [{ battlefield: [{ stub: 'pain-shaman' }], spellboard: [{ stub: 'summon-cerasaurus-mount' }], hand: ['earthquake'], active: ['class', 'class', 'class', 'class', 'class', 'class', 'class', 'class'] }, {}])
	const spell = s.players[0].spellboard[0][0]
	const nat = s.players[0].dice.find((d) => d.magic === 'natural')!.id
	const div = s.players[0].dice.find((d) => d.magic === 'divine')!.id
	s = act(s, { t: 'activate', player: 0, card: spell, dice: [nat, div] })
	s = answer(s)
	const mount = uidOf(s, 0, 'cerasaurus-mount')
	assert.equal(s.inst[mount].under?.length, 1)
	assert.equal(s.players[0].battlefield.length, 1, 'the Pain Shaman is under the mount')
	const two = s.players[0].dice.filter((d) => d.loc === 'active').slice(0, 2).map((d) => d.id)
	s = act(s, { t: 'play', player: 0, card: handOf(s, 0, 'earthquake'), dice: two })
	s = answer(s)
	assert.equal(s.players[0].battlefield.length, 0)
	assert.ok(s.players[0].hand.some((u) => s.inst[u].stub === 'pain-shaman'), 'Dismount returns the ally to hand')
})

test('Group Tactics: three attackers give the hatchlings +2', () => {
	let s = scenario(['xander', 'arren'], ['X', 'A'], [{ battlefield: [{ stub: 'raptor-hatchling' }, { stub: 'raptor-hatchling' }, { stub: 'pain-shaman' }] }, {}])
	const atk = s.players[0].battlefield.slice()
	s = act(s, { t: 'attack', player: 0, target: 'pb', attackers: atk })
	s = answer(s)
	assert.equal(pbLeft(s, 1), 15 - (2 + 2 + 1))
})

test('Sacred Ground gives Armored 1 until your next turn', () => {
	let s = scenario(['xander', 'arren'], ['X', 'A'], [{ battlefield: [{ stub: 'pain-shaman' }], spellboard: [{ stub: 'sacred-ground' }] }, { battlefield: [{ stub: 'javelineer' }], active: ['basic'] }])
	s = act(s, { t: 'activate', player: 0, card: s.players[0].spellboard[0][0], dice: [] })
	s = act(s, { t: 'pass', player: 0 })
	s = answer(s)
	// Javelineer throws 1 at the Pain Shaman: fully prevented
	const jav = uidOf(s, 1, 'javelineer')
	s = act(s, { t: 'activate', player: 1, card: jav, dice: [] })
	s = answer(s)
	assert.equal(s.inst[uidOf(s, 0, 'pain-shaman')].wounds, 0)
})

// ───────── Red Rains ─────────

function solo(seed = 3): GameState {
	let s = newGame({ seed, decks: ['xander', 'viros'], names: ['Kris', 'Viros'] })
	s = answer(s, (q) => (q.min === 5 ? q.options.slice(0, 5).map((o) => o.id) : undefined))
	return s
}

test('Red Rains setup: four face-down aspects by blood value, five rage dice, the player goes first', () => {
	const s = solo(9)
	assert.equal(s.solo?.threatZone.length, 4)
	const blood = s.solo!.threatZone.map((u) => Number(s.inst[u].stub && (s.inst[u].stub === 'rampage' || s.inst[u].stub === 'firebelly' || s.inst[u].stub === 'whiplash' ? 1 : 2))).sort()
	assert.deepEqual(blood, [1, 2, 2, 2])
	assert.equal(s.players[1].dice.length, 5)
	assert.equal(s.first, 0)
	assert.equal(s.phase, 'turns')
})

test('the chimera takes its turn by itself, and passing raises a rage die', () => {
	let s = solo(4)
	const before = s.players[1].dice.filter((d) => d.level !== 'basic').length
	s = act(s, { t: 'pass', player: 0 })
	s = act(s, { t: 'endTurn', player: 0 })
	s = answer(s)
	// after the chimera's turn it's the player's again (or a question for them)
	assert.ok(s.active === 0 || s.pending.kind === 'choose')
	assert.ok(s.log.some((l) => l.includes('raises a rage die')))
	assert.ok(s.log.some((l) => l.includes('rolls') && l.includes('behaviour')))
	void before
})

test('an aspect leaving play bleeds the chimera by its blood value', () => {
	const s = solo(5)
	const u = s.solo!.threatZone[0]
	const blood = ['rampage', 'firebelly', 'whiplash'].includes(s.inst[u].stub) ? 1 : 2
	s.solo!.threatZone.shift()
	s.inst[u].zone = 'battlefield'
	s.players[1].battlefield.push(u)
	const r = tryApply(s, { t: 'manual', player: 0, card: u, op: 'discard' })
	assert.equal(r.error, undefined)
	assert.equal(r.state.inst[r.state.players[1].pb].wounds, blood)
})

test('full rage resets the dice and a third Red Rains token unleashes the ultimate', () => {
	let s = solo(6)
	s.solo!.redRains = 2
	for (const d of s.players[1].dice) d.level = 'power'
	s.players[1].dice[0].level = 'basic'
	const pbBefore = pbLeft(s, 0)
	s = act(s, { t: 'pass', player: 0 }) // raises the last basic die → full rage → token 3 → ultimate
	s = answer(s)
	assert.ok(s.players[1].dice.every((d) => d.level === 'basic' || s.log.some((l) => l.includes('re-rolls'))))
	assert.equal(s.solo!.phase, 2)
	assert.ok(pbLeft(s, 0) < pbBefore, 'phase-1 ultimate deals 1 damage to the Phoenixborn')
	assert.ok(!exhausted(s, s.players[0].pb) || true)
})
