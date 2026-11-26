// Red Rains: a solo game against a chimera — here The Corpse of Viros (Standard or Heroic).
//
// The chimera is player 1. Its "Phoenixborn" is the chimera card (life 30 / 35); its units are
// aspects, which start face down as threat cards and are revealed by its behaviour. It never
// thinks: each turn it rolls a d12 on its behaviour table (by phase), raises and re-rolls rage
// dice, and gains Red Rains tokens; at the ultimate threshold it unleashes its ultimate and moves
// to the next phase. Rules follow the Red Rains rulebook as implemented by the Ashteki client.

import {
	activeDice,
	canAttackWith,
	canDefendAgainst,
	checkDestroyed,
	dealDamage,
	def,
	exhausted,
	hasKw,
	isUnit,
	leavePlay,
	log,
	nameOf,
	refillChimeraDeck,
	units,
	withRng,
	type Ctx,
	type Script,
} from './engine'
import { lowerDice, touchDice } from './helpers'
import { other, type GameState, type PlayerId } from './types'

const chim = (s: GameState) => s.solo!.chimera
const human = (s: GameState) => other(chim(s))
const rage = (s: GameState) => s.players[chim(s)].dice
export const ultimateThreshold = (s: GameState) => 3 + s.inst[s.players[chim(s)].pb].exhaust
export const threatValue = (s: GameState) => s.solo!.setup.length + s.solo!.extraThreat
/** Face-up aspects in play. */
export const aspects = (s: GameState) => units(s, chim(s)).filter((u) => def(s, u).type === 'Aspect')

// ───────── setup ─────────

/** Shuffle the aspects and lay out the starting threat cards by blood value. */
export function soloSetup(s: GameState) {
	const p = chim(s)
	const pl = s.players[p]
	withRng(s, (r) => {
		pl.deck = r.shuffle(pl.deck)
	})
	for (const blood of s.solo!.setup) {
		const i = pl.deck.findIndex((u) => Number(def(s, u).blood) === blood)
		if (i < 0) continue
		const u = pl.deck.splice(i, 1)[0]
		s.inst[u].zone = 'threat'
		s.solo!.threatZone.push(u)
	}
	withRng(s, (r) => {
		pl.deck = r.shuffle(pl.deck)
	})
	log(s, `The Corpse of Viros rises with ${s.solo!.threatZone.length} face-down aspects. ${s.solo!.level === 'H' ? 'Heroic' : 'Standard'} difficulty, stage ${s.solo!.stage}.`)
}

/** Add face-down aspects from the top of the aspect deck. */
export function addThreat(s: GameState, n: number) {
	const pl = s.players[chim(s)]
	for (let k = 0; k < n; k++) {
		if (pl.deck.length === 0) refillChimeraDeck(s)
		const u = pl.deck.shift()
		if (u === undefined) return
		s.inst[u].zone = 'threat'
		s.solo!.threatZone.push(u)
		if (pl.deck.length === 0) refillChimeraDeck(s)
	}
}

// ───────── rage dice and Red Rains ─────────

/** Red Rains tokens, one at a time: reaching the ultimate threshold unleashes the ultimate. */
export function addRedRains(c: Ctx, n: number, why: string) {
	const s = c.s
	if (!s.solo) return
	for (let k = 0; k < n; k++) {
		s.solo.redRains += 1
		log(s, `${why}: the chimera gains a Red Rains token (${s.solo.redRains}/${ultimateThreshold(s)}).`)
		if (s.solo.redRains >= ultimateThreshold(s)) ultimate(c)
	}
}

function ultimate(c: Ctx) {
	const s = c.s
	const so = s.solo!
	const cc: Ctx = { ...c, owner: chim(s), rival: human(s) }
	so.redRains -= ultimateThreshold(s)
	log(s, `☠ The Corpse of Viros unleashes its ultimate (phase ${so.phase})!`)
	// trespassers (e.g. a Blood Puppet on its battlefield, alterations on aspects) are discarded
	for (const u of units(s, chim(s)).slice()) if (s.inst[u].owner !== chim(s)) leavePlay(s, u, 'discard')
	for (const u of aspects(s)) for (const a of s.inst[u].alts.slice()) leavePlay(s, a, 'discard')
	if (so.phase < 3) {
		const dmg = so.phase
		for (const u of units(s, human(s)).slice()) dealDamage(cc, u, dmg)
		dealDamage(cc, s.players[human(s)].pb, dmg)
		checkDestroyed(s, cc)
	} else {
		log(s, 'The ultimate adds another face-down aspect.')
		addThreat(s, 1)
	}
	if (so.phase < 3) {
		so.phase = (so.phase + 1) as 2 | 3
		log(s, `The chimera moves to phase ${so.phase}.`)
	}
}

/** When every rage die shows a non-basic side, they all reset to basic and the chimera gains a Red Rains token. */
function checkRage(c: Ctx) {
	const s = c.s
	const dice = rage(c.s)
	if (dice.length && dice.every((d) => d.level !== 'basic')) {
		for (const d of dice) d.level = 'basic'
		log(s, 'All rage dice are raised: they reset to basic.')
		addRedRains(c, 1, 'Full rage')
	}
}

export function raiseRage(c: Ctx, n: number) {
	const s = c.s
	for (let k = 0; k < n; k++) {
		const d = rage(s).find((x) => x.level === 'basic')
		if (!d) break
		d.level = 'power'
		log(s, 'The chimera raises a rage die.')
		checkRage(c)
	}
}

export function rerollRage(c: Ctx, n: number) {
	const s = c.s
	const dice = rage(s).filter((d) => d.level === 'basic').slice(0, n)
	if (!dice.length) return
	withRng(s, (r) => {
		for (const d of dice) d.level = r.int(2) === 0 ? 'power' : 'basic'
	})
	log(s, `The chimera re-rolls ${dice.length} basic rage di${dice.length > 1 ? 'ce' : 'e'}: ${dice.map((d) => d.level).join(', ')}.`)
	touchDice(s, chim(s), dice.length)
	checkRage(c)
}

// ───────── attacking ─────────

/** The first aspect from the left (or right) that can attack. */
function attacker(s: GameState, from: 'left' | 'right' = 'left'): number | null {
	const list = aspects(s)
	if (from === 'right') list.reverse()
	return list.find((u) => canAttackWith(s, u) && !!def(s, u).aim) ?? null
}

/** Jaw aspects go for the Phoenixborn; left/right ones for the leftmost/rightmost unit (if any). */
function targetFor(s: GameState, a: number): 'pb' | number {
	const aim = def(s, a).aim
	const foeUnits = units(s, human(s)).filter((u) => !s.marks.some((m) => m.kind === 'kw' && m.kw === 'shroud' && m.uid === u))
	if (aim === 'jaw' || foeUnits.length === 0) return 'pb'
	return aim === 'right' ? foeUnits[foeUnits.length - 1] : foeUnits[0]
}

/** Queue an attack (as the chimera's main action). */
function doAttack(c: Ctx, a?: number | null) {
	const s = c.s
	const who = a ?? attacker(s)
	if (who === null || who === undefined || !canAttackWith(s, who)) return false
	const target = targetFor(s, who)
	s.queue.push({ key: 'attack', owner: chim(s), data: { target, attackers: [who] }, answers: [] })
	return true
}

/** Flip the leftmost threat card face up; it comes into play. */
function reveal(c: Ctx): number | null {
	const s = c.s
	const u = s.solo!.threatZone.shift()
	if (u === undefined) return null
	const t = s.inst[u]
	t.zone = 'battlefield'
	t.status = Number(def(s, u).statusCount ?? 0)
	s.players[chim(s)].battlefield.push(u)
	log(s, `The chimera reveals ${nameOf(s, u)}.`)
	if (t.stub === 'whiplash') {
		const foe = units(s, human(s))
		const damaged = foe.find((x) => s.inst[x].wounds > 0)
		if (damaged !== undefined) {
			log(s, `Whiplash destroys ${nameOf(s, damaged)}.`)
			s.inst[damaged].hitBy = chim(s)
			s.inst[damaged].hitKind = 'effect'
			s.inst[damaged].wounds = 99
			checkDestroyed(s, c)
		} else if (foe.length) {
			dealDamage(c, foe[0], 1)
			checkDestroyed(s, c)
		}
	}
	return u
}

const canAttack = (s: GameState) => attacker(s) !== null

// ───────── behaviour ─────────

type Act = { text: string; run: (c: Ctx) => void }
const R: Act = { text: 'Reveal.', run: (c) => void reveal(c) }
const AR: Act = { text: 'Attack, if able. If not, reveal.', run: (c) => void (canAttack(c.s) ? doAttack(c) : reveal(c)) }
const RA: Act = { text: 'Reveal, then attack with the revealed aspect.', run: (c) => void doAttack(c, reveal(c)) }
const side = (text: string, f: (c: Ctx) => void): Act => ({ text: `${text} Then reveal.`, run: (c) => (f(c), void reveal(c)) })
const lower2: Act = side('Side: you lower 2 non-basic dice in your active pool one level.', (c) => void lowerDice(c, human(c.s), 2, human(c.s), true))
const burnPb: Act = side('Side: 1 damage to your Phoenixborn.', (c) => void dealDamage(c, c.s.players[human(c.s)].pb, 1))
const burnUnit: Act = side('Side: 1 damage to your leftmost unit.', (c) => {
	const u = units(c.s, human(c.s))[0]
	if (u !== undefined) {
		dealDamage(c, u, 1)
		checkDestroyed(c.s, c)
	}
})
const raise = (n: number): Act => side(`Side: raise ${n} basic rage di${n > 1 ? 'ce' : 'e'}.`, (c) => raiseRage(c, n))
const rr: Act = side('Side: gain a Red Rains token.', (c) => addRedRains(c, 1, 'Behaviour'))

/** The Corpse of Viros behaviour table: [phase][roll 1..12]. */
const TABLE: Record<1 | 2 | 3, Act[]> = {
	1: [R, R, AR, AR, RA, RA, lower2, lower2, lower2, raise(1), raise(1), rr],
	2: [R, AR, AR, AR, RA, RA, burnPb, burnPb, burnPb, raise(2), raise(2), rr],
	3: [AR, AR, AR, RA, RA, RA, burnUnit, burnUnit, burnUnit, raise(3), raise(3), rr],
}
export const behaviourText = (phase: 1 | 2 | 3, roll: number) => TABLE[phase][roll - 1].text

// ───────── scripts ─────────

const chimeraTurn: Script = (c) => {
	const s = c.s
	const so = s.solo!
	// status abilities first (Rampage: re-roll all basic rage dice)
	for (const u of aspects(s))
		if (s.inst[u].stub === 'rampage' && s.inst[u].status > 0) {
			s.inst[u].status -= 1
			log(s, 'Rampage stirs the rage dice.')
			rerollRage(c, 99)
		}
	if (so.threatZone.length > 0) {
		rerollRage(c, 1)
		const d12 = withRng(s, (r) => r.int(12) + 1)
		const act = TABLE[so.phase][d12 - 1]
		so.roll = { d12, text: act.text }
		log(s, `The chimera rolls ${d12} for behaviour (phase ${so.phase}): ${act.text}`)
		act.run(c)
	} else if (canAttack(s)) {
		so.roll = undefined
		doAttack(c)
	} else {
		so.roll = undefined
		s.turn.passed = true
		log(s, 'The chimera passes.')
	}
	s.turn.main = true
	s.turn.side = true
}

/** When you pass while threat cards remain, the chimera raises a basic rage die. */
const chimeraOnPass: Script = (c) => raiseRage(c, 1)

export const SOLO_SCRIPTS: Record<string, Script> = { chimeraTurn, chimeraOnPass }

// ───────── recovery ─────────

/** Red Rains steps of the recovery phase (after wounds are recovered). `beforeReady` runs before exhaustion comes off. */
export function soloRecoveryBeforeReady(s: GameState) {
	const so = s.solo!
	const ex = s.inst[s.players[chim(s)].pb].exhaust
	if (ex && so.redRains) {
		const n = Math.min(ex, so.redRains)
		so.redRains -= n
		log(s, `The exhausted chimera loses ${n} Red Rains token${n > 1 ? 's' : ''}.`)
	}
}
export function soloRecoveryAfter(c: Ctx) {
	const s = c.s
	const so = s.solo!
	const have = aspects(s).length + so.threatZone.length
	if (have < threatValue(s)) {
		addThreat(s, threatValue(s) - have)
		log(s, `The chimera replenishes its threat cards to ${threatValue(s)}.`)
	}
	const n = aspects(s).length
	if (n) addRedRains(c, n, `${n} aspect${n > 1 ? 's' : ''} in play`)
	for (const u of aspects(s)) {
		const pips = Number(def(s, u).statusCount ?? 0)
		if (s.inst[u].status < pips) s.inst[u].status = pips
	}
}

// ───────── defending ─────────

/** Chimera blocks for an attack on it: each ready Defender aspect blocks the first attacker it can. */
export function chimeraBlocks(s: GameState, attackers: number[]): Map<number, number> {
	const out = new Map<number, number>()
	const used = new Set<number>()
	for (const d of aspects(s)) {
		if (!hasKw(s, d, 'defender') || exhausted(s, d) || used.has(d)) continue
		const a = attackers.find((x) => !out.has(x) && canDefendAgainst(s, d, x))
		if (a === undefined) continue
		out.set(a, d)
		used.add(d)
		log(s, `${nameOf(s, d)} blocks ${nameOf(s, a)}.`)
	}
	return out
}

/** Chimera guard for an attack on one of its aspects: a Defender guards; otherwise the chimera guards on a d12 roll of 9+. */
export function chimeraGuard(s: GameState, a: number, target: number, noGuard: boolean): number | 'pb' | null {
	if (noGuard || !isUnit(s, target) || def(s, target).type !== 'Aspect' || hasKw(s, target, 'defender')) return null
	for (const d of aspects(s)) if (d !== target && hasKw(s, d, 'defender') && !exhausted(s, d) && canDefendAgainst(s, d, a)) return d
	const pl = s.players[chim(s)]
	if (pl.guarded || exhausted(s, pl.pb)) return null
	const d12 = withRng(s, (r) => r.int(12) + 1)
	log(s, `The chimera rolls ${d12} to guard${d12 >= 9 ? ' — it guards!' : '.'}`)
	return d12 >= 9 ? 'pb' : null
}

export const rageSummary = (s: GameState) => rage(s).map((d) => d.level)
