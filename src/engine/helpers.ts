// Small building blocks shared by every deck's card scripts: choosing targets, dealing damage,
// dice changes, conjuring, searching. Nothing here runs while modules load (only inside tasks).

import {
	activeDice,
	astralOn,
	attackOf,
	conjAvailable,
	controller,
	dealDamage,
	def,
	exhausted,
	exhaustedDice,
	findDie,
	isChimera,
	lifeOf,
	log,
	lower,
	moveDie,
	nameOf,
	placeUnit,
	raise,
	units,
	type Ctx,
} from './engine'
import { one, runCard } from './flows'
import { LEVELS, other, type ChoiceOption, type Die, type GameState, type Level, type PlayerId } from './types'

/** Rough worth of a unit on the table (bot + coach scores). */
export function unitValue(s: GameState, u: number): number {
	return attackOf(s, u) * 1.5 + Math.max(0, lifeOf(s, u) - s.inst[u].wounds) + (exhausted(s, u) ? 0 : 0.5)
}

export const left = (s: GameState, u: number) => lifeOf(s, u) - s.inst[u].wounds
export const dieLabel = (d: Die) => `${d.magic[0].toUpperCase()}${d.magic.slice(1)} die · ${d.level}`
export const mark = (s: GameState, uid: number, amount: number) => s.marks.push({ kind: 'attack', uid, amount, until: 'turn' })
export const allUnits = (s: GameState) => [...units(s, 0), ...units(s, 1)]
export const whose = (s: GameState, c: Ctx, u: number) => (controller(s, u) === c.owner ? '' : ' (opponent)')

/** Score for dealing `amount` damage to unit `u` from the point of view of player `me`. */
export function hitScore(s: GameState, me: PlayerId, u: number, amount: number): number {
	const l = left(s, u)
	const prevented = astralOn(s, u) ? 1 : 0
	const kills = amount - prevented >= l
	const v = kills ? 10 + unitValue(s, u) : Math.min(amount, l) / Math.max(1, l)
	return controller(s, u) === me ? -v : v
}

/** Choose a unit from `list` (null if there's none). */
export function pickUnit(c: Ctx, player: PlayerId, prompt: string, list: number[], score: (u: number) => number, kind = 'target'): number | null {
	const s = c.s
	const opts = list.map((u) => ({ id: String(u), label: `${nameOf(s, u)}${controller(s, u) === player ? '' : ' (opponent)'} · ${left(s, u)} life left`, uid: u, score: score(u) }))
	const pick = one(c, player, prompt, opts, kind)
	return pick === null ? null : Number(pick)
}

/** Choose a target unit an opponent controls to deal `amount` damage to. */
export function damageFoeUnit(c: Ctx, amount: number, prompt: string): number | null {
	const u = pickUnit(c, c.owner, prompt, units(c.s, c.rival), (x) => hitScore(c.s, c.owner, x, amount))
	if (u === null) return null
	dealDamage(c, u, amount)
	return u
}

/** Choose any unit to deal `amount` damage to. */
export function damageAnyUnit(c: Ctx, amount: number, prompt: string, list = allUnits(c.s)): number | null {
	const u = pickUnit(c, c.owner, prompt, list, (x) => hitScore(c.s, c.owner, x, amount))
	if (u === null) return null
	dealDamage(c, u, amount)
	return u
}

/** Keepsake: after dice in an opponent's active pool are re-rolled, lowered or set, its owner's Keepsakes gain status. */
export function touchDice(s: GameState, owner: PlayerId, n: number) {
	if (n <= 0) return
	const watcher = other(owner)
	for (const u of s.players[watcher].spellboard.flat())
		if (s.inst[u].stub === 'keepsake' && s.inst[u].status < 4) {
			const before = s.inst[u].status
			s.inst[u].status = Math.min(4, before + n)
			if (s.inst[u].status > before) log(s, `Keepsake gains ${s.inst[u].status - before} status token${s.inst[u].status - before > 1 ? 's' : ''}.`)
		}
}

/** Lower dice in `victim`'s active pool one level each; the chooser picks which (power first is best). */
export function lowerDice(c: Ctx, victim: PlayerId, n: number, chooser: PlayerId = c.owner, onlyNonBasic = false, onlyPower = false) {
	const s = c.s
	let pool = activeDice(s, victim)
	if (onlyNonBasic) pool = pool.filter((d) => d.level !== 'basic')
	if (onlyPower) pool = pool.filter((d) => d.level === 'power')
	if (pool.length === 0) return 0
	const k = Math.min(n, pool.length)
	const own = chooser === victim
	const picks = c.ask(chooser, {
		prompt: own
			? `Lower ${k} of your non-basic dice one level.`
			: `Lower ${k} di${k > 1 ? 'ce' : 'e'} in ${s.players[victim].name}’s active pool one level (power → class → basic).`,
		options: pool.map((d) => {
			const v = d.level === 'power' ? 3 : d.level === 'class' ? 2 : 0
			return { id: d.id, label: dieLabel(d), dieId: d.id, score: own ? -v : v }
		}),
		min: k,
		max: k,
		kind: 'lowerDice',
	})
	for (const id of picks) {
		const d = findDie(s, id)!
		const from = d.level
		if (d.magic === 'rage') d.level = 'basic'
		else lower(d)
		log(s, from === 'basic' ? `${s.players[victim].name}’s ${d.magic} die is already basic.` : `${s.players[victim].name}’s ${d.magic} die goes from ${from} to ${d.level}.`)
	}
	touchDice(s, victim, picks.length)
	return picks.length
}
/** Lower `n` different dice in the opponent's active pool one level each. */
export const lowerFoeDice = (c: Ctx, n: number) => lowerDice(c, c.rival, n)

/** Raise up to `n` dice in the player's own active pool one level. */
export function raiseOwnDice(c: Ctx, n: number, p: PlayerId = c.owner) {
	const s = c.s
	for (let k = 0; k < n; k++) {
		const pool = activeDice(s, p).filter((d) => d.level !== 'power')
		if (pool.length === 0) return
		const pick = one(c, p, `Raise a die in your active pool one level (${k + 1} of ${n}).`, pool.map((d) => ({ id: d.id, label: dieLabel(d), dieId: d.id, score: d.level === 'class' ? 3 : 2 })), 'raiseDie')
		if (!pick) return
		const d = findDie(s, pick)!
		raise(d)
		log(s, `${s.players[p].name} raises a ${d.magic} die to ${d.level}.`)
	}
}

/** Change up to `n` dice in `pool owner`'s active pool to a side of the chooser's choice. */
export function changeDice(c: Ctx, n: number, poolOwner: PlayerId = c.owner, optional = true) {
	const s = c.s
	const mine = poolOwner === c.owner
	let changed = 0
	for (let k = 0; k < n; k++) {
		const pool = activeDice(s, poolOwner).filter((d) => d.magic !== 'rage' || !mine)
		if (pool.length === 0) break
		const opts: ChoiceOption[] = pool.map((d) => ({ id: d.id, label: dieLabel(d), dieId: d.id, score: mine ? (d.level === 'basic' ? 3 : d.level === 'class' ? 2 : 0) : d.level === 'power' ? 3 : d.level === 'class' ? 2 : 0 }))
		if (optional) opts.unshift({ id: 'none', label: 'Leave the rest', score: mine ? 0.5 : 0.5 })
		const pick = one(c, c.owner, `Change a die in ${mine ? 'your' : `${s.players[poolOwner].name}’s`} active pool to a side of your choice (${k + 1} of ${n}).`, opts, 'changeDie')
		if (!pick || pick === 'none') break
		const d = findDie(s, pick)!
		const sides: Level[] = d.magic === 'rage' ? ['power', 'basic'] : LEVELS
		const lv = one(c, c.owner, 'Which side?', sides.map((l) => ({ id: l, label: l, score: mine ? (l === 'power' ? 3 : l === 'class' ? 2 : 0) : l === 'basic' ? 3 : 0 })), 'dieSide') as Level
		d.level = lv
		changed++
		log(s, `${s.players[c.owner].name} turns ${mine ? 'a' : `${s.players[poolOwner].name}’s`} ${d.magic} die to ${lv}.`)
	}
	if (!mine) touchDice(s, poolOwner, changed)
	return changed
}
export const changeOwnDice = (c: Ctx, n: number) => changeDice(c, n, c.owner)

/** Place a die of `magic` from the player's exhausted pool onto a card (astral: max one per card). */
export function placeFromExhausted(c: Ctx, p: PlayerId, magic: 'astral' | 'artifice', targets: number[], prompt: string, optional = false): number | null {
	const s = c.s
	const die = exhaustedDice(s, p).find((d) => d.magic === magic)
	if (!die) {
		log(s, `${s.players[p].name} has no exhausted ${magic} die to place.`)
		return null
	}
	const ok = targets.filter((u) => magic !== 'astral' || !astralOn(s, u))
	if (ok.length === 0) return null
	const opts: ChoiceOption[] = ok.map((u) => ({ id: String(u), label: nameOf(s, u), uid: u, score: placeScore(s, u, magic) }))
	if (optional) opts.unshift({ id: 'none', label: 'Don’t place one', score: -5 })
	const pick = one(c, p, prompt, opts, 'placeDie')
	if (pick === null || pick === 'none') return null
	moveDie(die, 'card', Number(pick))
	log(s, `${s.players[p].name} places an ${magic} die on ${nameOf(s, Number(pick))}.`)
	return Number(pick)
}

export function placeScore(s: GameState, u: number, magic: string): number {
	const t = def(s, u).type
	if (magic === 'astral') return t === 'Phoenixborn' ? 6 : unitValue(s, u)
	const st = s.inst[u].stub
	const charged = s.players.some((p) => p.dice.some((d) => d.loc === 'card' && d.on === u && d.magic === 'artifice'))
	if (st === 'thunder-hulk') return !charged ? 9 : 2
	if (st === 'supercharge' || st === 'summon-spark-drone') return !charged ? 7 : 1
	if (t === 'Phoenixborn') return 4
	if (t === 'Ally' || t === 'Conjuration') return 3 + unitValue(s, u) / 4
	return 1
}

/** Put a conjuration from the owner's pile onto `onto`'s battlefield and run its "comes into play" script. */
export function conjure(c: Ctx, stub: string, onto: PlayerId = c.owner): number | null {
	const s = c.s
	const uid = conjAvailable(s, c.owner, stub)
	if (uid === undefined) {
		log(s, `No ${def(s, s.players[c.owner].conj[0] ?? s.players[c.owner].pb).name === stub ? stub : stub.replace(/-/g, ' ')} left in the conjuration pile.`)
		return null
	}
	if (!placeUnit(s, onto, uid)) return null
	log(s, `${nameOf(s, uid)} comes into play${onto === c.owner ? '' : ` on ${s.players[onto].name}’s battlefield`}.`)
	runCard({ ...c, owner: onto, rival: other(onto) }, `${stub}:enter`, { uid })
	return uid
}

/** Remove up to `n` wound tokens from a card. */
export function heal(s: GameState, uid: number, n: number) {
	const t = s.inst[uid]
	const k = Math.min(n, t.wounds)
	t.wounds -= k
	if (k) log(s, `${k} wound${k > 1 ? 's' : ''} removed from ${nameOf(s, uid)}.`)
	return k
}

/** Is this player a human-style player (not the chimera)? */
export const isPlayer = (s: GameState, p: PlayerId) => !isChimera(s, p)

/** "Summon X" check: a copy left in the conjuration pile and room on the battlefield. */
export function summonCheck(stub: string) {
	return (s: GameState, p: PlayerId) =>
		conjAvailable(s, p, stub) === undefined ? 'None left in your conjuration pile' : units(s, p).length >= Number(def(s, s.players[p].pb).battlefield) ? 'Your battlefield is full' : null
}
