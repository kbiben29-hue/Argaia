// Card abilities for the Ashes Ascendancy starter decks (Arren Frostpeak's astral deck and Issa
// Brightmore's artifice deck). Scripts are keyed `${stub}:${trigger}`:
//   play   – an action spell resolving        enter  – a unit coming into play
//   attach – an alteration spell attaching    ability – an activated ability (cost in ABILITIES)
// Reactions (Dodge, Barrier) are offered through HOOKS at the moment their trigger happens.
// All descriptions here are our own wording; card text itself is never stored in this repo.

import { cost, autoPay, type Cost } from './dice'
import {
	activeDice,
	astralOn,
	attackOf,
	cardsInPlay,
	charge,
	checkDestroyed,
	conjAvailable,
	controller,
	dealDamage,
	def,
	discardFromHand,
	drawCards,
	exhausted,
	exhaustedDice,
	findDie,
	lifeOf,
	log,
	lower,
	moveDie,
	nameOf,
	pbHasAstral,
	placeUnit,
	units,
	leavePlay,
	type Ctx,
	type Script,
} from './engine'
import { one, runCard } from './flows'
import { LEVELS, other, type ChoiceOption, type Die, type GameState, type Level, type PlayerId } from './types'

// ───────── helpers ─────────

/** Rough worth of a unit on the table (bot + coach scores). */
export function unitValue(s: GameState, u: number): number {
	return attackOf(s, u) * 1.5 + Math.max(0, lifeOf(s, u) - s.inst[u].wounds) + (exhausted(s, u) ? 0 : 0.5)
}

const dieLabel = (d: Die) => `${d.magic[0].toUpperCase()}${d.magic.slice(1)} die · ${d.level}`

/** Choose a target unit an opponent controls to deal `amount` damage to. */
function damageFoeUnit(c: Ctx, amount: number, prompt: string): number | null {
	const s = c.s
	const opts = units(s, c.rival).map((u) => {
		const left = lifeOf(s, u) - s.inst[u].wounds
		const prevented = astralOn(s, u) ? 1 : 0
		const kills = amount - prevented >= left
		return { id: String(u), label: `${nameOf(s, u)} (${left} life left)`, uid: u, score: (kills ? 10 + unitValue(s, u) : Math.min(amount, left) / Math.max(1, left)) }
	})
	const pick = one(c, c.owner, prompt, opts, 'target')
	if (pick === null) return null
	dealDamage(c, Number(pick), amount)
	return Number(pick)
}

/** Lower `n` different dice in the opponent's active pool one level each. */
function lowerFoeDice(c: Ctx, n: number) {
	const s = c.s
	const pool = activeDice(s, c.rival)
	if (pool.length === 0) return
	const k = Math.min(n, pool.length)
	const picks = c.ask(c.owner, {
		prompt: `Lower ${k} di${k > 1 ? 'ce' : 'e'} in ${s.players[c.rival].name}’s active pool one level (power → class → basic).`,
		options: pool.map((d) => ({ id: d.id, label: dieLabel(d), dieId: d.id, score: d.level === 'power' ? 3 : d.level === 'class' ? 2 : 0 })),
		min: k,
		max: k,
		kind: 'lowerDice',
	})
	for (const id of picks) {
		const d = findDie(s, id)!
		const from = d.level
		lower(d)
		log(s, from === 'basic' ? `${s.players[c.rival].name}’s ${d.magic} die is already basic.` : `${s.players[c.rival].name}’s ${d.magic} die goes from ${from} to ${d.level}.`)
	}
}

/** Place a die of `magic` from the player's exhausted pool onto a card (astral: max one per card). */
function placeFromExhausted(c: Ctx, p: PlayerId, magic: 'astral' | 'artifice', targets: number[], prompt: string, optional = false): number | null {
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

function placeScore(s: GameState, u: number, magic: string): number {
	const t = def(s, u).type
	if (magic === 'astral') return t === 'Phoenixborn' ? 6 : unitValue(s, u)
	// artifice: charge the cards that care most
	const st = s.inst[u].stub
	if (st === 'thunder-hulk') return charge(s, u) === 0 ? 9 : 2
	if (st === 'supercharge' || st === 'summon-spark-drone') return charge(s, u) === 0 ? 7 : 1
	if (t === 'Phoenixborn') return 4
	if (t === 'Ally' || t === 'Conjuration') return 3 + unitValue(s, u) / 4
	return 1
}

function conjure(c: Ctx, stub: string): number | null {
	const s = c.s
	const uid = conjAvailable(s, c.owner, stub)
	if (uid === undefined) {
		log(s, `No ${def(s, c.data.uid as number).name.replace('Summon ', '')} left in the conjuration pile.`)
		return null
	}
	if (!placeUnit(s, c.owner, uid)) return null
	log(s, `${nameOf(s, uid)} comes into play.`)
	runCard(c, `${stub}:enter`, { uid })
	return uid
}

const mark = (s: GameState, uid: number, amount: number) => s.marks.push({ kind: 'attack', uid, amount, until: 'turn' })

function changeOwnDice(c: Ctx, n: number) {
	const s = c.s
	for (let k = 0; k < n; k++) {
		const pool = activeDice(s, c.owner)
		if (pool.length === 0) return
		const pick = one(
			c,
			c.owner,
			`Change a die in your active pool to a side of your choice (${k + 1} of ${n}).`,
			[{ id: 'none', label: 'Leave the rest', score: -1 }, ...pool.map((d) => ({ id: d.id, label: dieLabel(d), dieId: d.id, score: d.level === 'basic' ? 3 : d.level === 'class' ? 2 : 0 }))],
			'changeDie',
		)
		if (!pick || pick === 'none') return
		const d = findDie(s, pick)!
		const lv = one(
			c,
			c.owner,
			'Which side?',
			LEVELS.map((l) => ({ id: l, label: l, score: l === 'power' ? 3 : l === 'class' ? 2 : 0 })),
			'dieSide',
		) as Level
		d.level = lv
		log(s, `${s.players[c.owner].name} turns a ${d.magic} die to ${lv}.`)
	}
}

// ───────── scripts ─────────

export const CARD_SCRIPTS: Record<string, Script> = {
	// Phoenixborn
	'arren-frostpeak:ability': (c) => {
		damageFoeUnit(c, 1, 'Ascend: deal 1 damage to which opposing unit?')
		const pb = c.s.players[c.owner].pb
		if (!astralOn(c.s, pb)) placeFromExhausted(c, c.owner, 'astral', [pb], 'Place an astral die on Arren.')
	},
	'issa-brightmore:ability': (c) => {
		const n = drawCards(c.s, c.owner, 2)
		log(c.s, `${c.s.players[c.owner].name} draws ${n} card${n === 1 ? '' : 's'}.`)
		placeFromExhausted(c, c.owner, 'artifice', cardsInPlay(c.s, c.owner).filter((u) => c.s.inst[u].zone !== 'attached'), 'Place an artifice die on which card you control?')
	},

	// Arren's deck
	'aerial-strike:play': (c) => {
		if (!pbHasAstral(c.s, c.owner)) return log(c.s, 'Arren has no astral die on her, so Aerial Strike does nothing.')
		damageFoeUnit(c, 4, 'Aerial Strike: deal 4 damage to which opposing unit?')
	},
	'cirrus-ranger:enter': (c) => {
		if (!pbHasAstral(c.s, c.owner)) return
		log(c.s, 'Aerial Ambush!')
		dealDamage(c, c.s.players[c.rival].pb, 1)
		lowerFoeDice(c, 1)
	},
	'gust-spear:attach': (c) => lowerFoeDice(c, 2),
	'javelineer:ability': (c) => {
		const me = c.data.uid as number
		damageFoeUnit(c, attackOf(c.s, me), `Frost Throw: deal ${attackOf(c.s, me)} damage to which opposing unit?`)
	},
	'retreat:play': (c) => {
		const s = c.s
		const opts = units(s, c.owner).filter((u) => def(s, u).type === 'Ally' && exhausted(s, u))
		const pick = one(
			c,
			c.owner,
			'Return which exhausted ally (and anything attached to it) to your hand?',
			opts.map((u) => ({ id: String(u), label: nameOf(s, u), uid: u, score: s.inst[u].wounds * 2 + 1 })),
			'target',
		)
		if (pick === null) return
		log(s, `${nameOf(s, Number(pick))} retreats to ${s.players[c.owner].name}’s hand.`)
		leavePlay(s, Number(pick), 'hand')
	},
	'skybreak-captain:enter': (c) => {
		const me = c.data.uid as number
		placeFromExhausted(c, c.owner, 'astral', [me], 'Uplift: place an astral die on Skybreak Captain.')
	},
	'skybreak-captain:ability': (c) => {
		const s = c.s
		const me = c.data.uid as number
		const opts = units(s, c.owner).filter((u) => u !== me)
		const pick = one(c, c.owner, 'Aerial Command: which other unit gets +1 attack this turn?', opts.map((u) => ({ id: String(u), label: nameOf(s, u), uid: u, score: exhausted(s, u) ? 0 : attackOf(s, u) + 1 })), 'target')
		if (pick === null) return
		mark(s, Number(pick), 1)
		log(s, `${nameOf(s, Number(pick))} gets +1 attack this turn.`)
	},
	'summon-frost-talon:ability': (c) => void conjure(c, 'frost-talon'),
	'summon-stellar-oracle:ability': (c) => void conjure(c, 'stellar-oracle'),
	'stellar-oracle:enter': (c) => {
		const s = c.s
		const n = drawCards(s, c.owner, 2)
		log(s, `Divination: ${s.players[c.owner].name} draws ${n}.`)
		if (n < 2) return
		const pick = one(
			c,
			c.owner,
			'Divination: put a card from your hand on top of your draw pile.',
			s.players[c.owner].hand.map((u) => ({ id: String(u), label: nameOf(s, u), uid: u, score: def(s, u).type === 'Reaction Spell' ? 0 : -1 })),
			'deckTop',
		)
		if (pick === null) return
		const pl = s.players[c.owner]
		const uid = Number(pick)
		pl.hand.splice(pl.hand.indexOf(uid), 1)
		pl.deck.unshift(uid)
		s.inst[uid].zone = 'deck'
	},
	'whirlwind:ability': (c) => {
		lowerFoeDice(c, 2)
		if (pbHasAstral(c.s, c.owner)) {
			drawCards(c.s, c.owner, 1)
			log(c.s, `${c.s.players[c.owner].name} draws a card.`)
		}
	},

	// Issa's deck
	'brilliant-display:play': (c) => {
		const s = c.s
		const n = s.players[c.owner].dice.filter((d) => d.loc === 'card' && d.magic === 'artifice' && d.on !== undefined && controller(s, d.on) === c.owner).length
		log(s, `Brilliant Display resolves ${n} time${n === 1 ? '' : 's'}.`)
		for (let k = 0; k < n; k++) {
			if (units(s, c.rival).length === 0) break
			damageFoeUnit(c, 1, `Brilliant Display (${k + 1} of ${n}): deal 1 damage to which opposing unit?`)
			checkDestroyed(s)
		}
	},
	'core-supplier:enter': (c) => {
		for (let k = 0; k < 2; k++) {
			const placed = placeFromExhausted(c, c.owner, 'artifice', cardsInPlay(c.s, c.owner).filter((u) => c.s.inst[u].zone !== 'attached'), `Supply: place an artifice die on a card you control (${k + 1} of 2).`, true)
			if (placed === null) return
		}
	},
	'recharge:play': (c) => {
		const s = c.s
		const opts = cardsInPlay(s, c.owner).filter((u) => charge(s, u) > 0 && s.inst[u].zone !== 'attached')
		const pick = one(c, c.owner, 'Recharge: remove 1 exhaustion and 2 wounds from which charged card?', opts.map((u) => ({ id: String(u), label: `${nameOf(s, u)} (${s.inst[u].wounds} wounds, ${s.inst[u].exhaust} exhaustion)`, uid: u, score: s.inst[u].wounds + s.inst[u].exhaust * 2 })), 'target')
		if (pick === null) return
		const t = s.inst[Number(pick)]
		t.exhaust = Math.max(0, t.exhaust - 1)
		t.wounds = Math.max(0, t.wounds - 2)
		log(s, `${nameOf(s, t.uid)} is recharged.`)
	},
	'reconfigure:ability': (c) => {
		const s = c.s
		const mine = cardsInPlay(s, c.owner).filter((u) => s.inst[u].zone !== 'attached')
		const dice = s.players[c.owner].dice.filter((d) => d.loc === 'card' && d.magic === 'artifice' && mine.includes(d.on!))
		const from = one(c, c.owner, 'Reconfigure: move an artifice die from which card?', dice.map((d) => ({ id: d.id, label: `Die on ${nameOf(s, d.on!)}`, dieId: d.id, uid: d.on, score: -placeScore(s, d.on!, 'artifice') })), 'moveDie')
		if (from === null) return
		const die = findDie(s, from)!
		const to = one(c, c.owner, 'Move it onto which card?', mine.filter((u) => u !== die.on).map((u) => ({ id: String(u), label: nameOf(s, u), uid: u, score: placeScore(s, u, 'artifice') })), 'placeDie')
		if (to === null) return
		log(s, `The artifice die moves from ${nameOf(s, die.on!)} to ${nameOf(s, Number(to))}.`)
		moveDie(die, 'card', Number(to))
	},
	'summon-spark-drone:ability': (c) => {
		conjure(c, 'spark-drone')
		if (charge(c.s, c.data.uid as number) > 0) changeOwnDice(c, 2)
	},
	'summon-thunder-hulk:ability': (c) => void conjure(c, 'thunder-hulk'),
	'supercharge:ability': (c) => {
		const s = c.s
		if (charge(s, c.data.uid as number) === 0) return log(s, 'Supercharge isn’t charged, so nothing happens.')
		const all = [...units(s, c.owner), ...units(s, c.rival)]
		const pick = one(c, c.owner, 'Supercharge: which unit gets +2 attack this turn?', all.map((u) => ({ id: String(u), label: `${nameOf(s, u)}${controller(s, u) === c.owner ? '' : ' (opponent)'}`, uid: u, score: controller(s, u) === c.owner && !exhausted(s, u) ? attackOf(s, u) + 2 : -3 })), 'target')
		if (pick === null) return
		mark(s, Number(pick), 2)
		log(s, `${nameOf(s, Number(pick))} gets +2 attack this turn.`)
	},
	'systems-drafter:enter': (c) => {
		const s = c.s
		const opts = s.players[c.owner].spellboard.flat().filter((u) => s.inst[u].exhaust > 0)
		const pick = one(c, c.owner, 'Rethink: remove an exhaustion token from which ready spell?', opts.map((u) => ({ id: String(u), label: nameOf(s, u), uid: u, score: 1 })), 'target')
		if (pick === null) return
		s.inst[Number(pick)].exhaust -= 1
		log(s, `${nameOf(s, Number(pick))} is readied.`)
	},
	'thunder-suit:attach': (c) => {
		const host = c.data.host as number
		placeFromExhausted(c, c.owner, 'artifice', [host], `Place an artifice die on ${nameOf(c.s, host)}.`)
	},
}

// ───────── activated abilities ─────────

export interface Ability {
	label: string
	cost: Cost
	/** what it does, in our own words (shown on the button) */
	help: string
	check?: (s: GameState, p: PlayerId, uid: number) => string | null
}

const summonCheck = (stub: string) => (s: GameState, p: PlayerId) =>
	conjAvailable(s, p, stub) === undefined ? 'None left in your conjuration pile' : units(s, p).length >= Number(def(s, s.players[p].pb).battlefield) ? 'Your battlefield is full' : null

export const ABILITIES: Record<string, Ability> = {
	'arren-frostpeak': { label: 'Ascend', cost: cost('side', 'exhaust', 'astral:class'), help: '1 damage to an opposing unit, then an astral die onto Arren' },
	'issa-brightmore': { label: 'Inspiration', cost: cost('side', 'exhaust', 'artifice:class'), help: 'Draw 2, then an artifice die onto a card you control' },
	javelineer: { label: 'Frost Throw', cost: cost('main', 'exhaust'), help: 'Damage an opposing unit equal to this unit’s attack', check: (s, p) => (units(s, other(p)).length ? null : 'No opposing unit to hit') },
	'skybreak-captain': {
		label: 'Aerial Command',
		cost: cost('side'),
		help: '+1 attack to another unit this turn (needs an astral die on the Captain)',
		check: (s, p, uid) => (!astralOn(s, uid) ? 'Needs an astral die on it' : units(s, p).length < 2 ? 'No other unit to boost' : null),
	},
	'summon-frost-talon': { label: 'Summon Frost Talon', cost: cost('main', 'exhaust', 'astral:class'), help: 'Put a Frost Talon onto your battlefield', check: summonCheck('frost-talon') },
	'summon-stellar-oracle': { label: 'Summon Stellar Oracle', cost: cost('main', 'exhaust', 'astral:class', 'basic'), help: 'Put a Stellar Oracle onto your battlefield', check: summonCheck('stellar-oracle') },
	whirlwind: { label: 'Whirlwind', cost: cost('main', 'exhaust'), help: 'Lower 2 opposing dice; draw 1 if Arren has an astral die' },
	reconfigure: {
		label: 'Reconfigure',
		cost: cost('side', 'exhaust'),
		help: 'Move an artifice die between your cards',
		check: (s, p) => (s.players[p].dice.some((d) => d.loc === 'card' && d.magic === 'artifice' && controller(s, d.on!) === p) ? null : 'None of your cards has an artifice die'),
	},
	supercharge: { label: 'Supercharge', cost: cost('side', 'exhaust'), help: '+2 attack to a unit this turn (needs an artifice die on this spell)', check: (s, _p, uid) => (charge(s, uid) ? null : 'Needs an artifice die on it (charged)') },
	'summon-spark-drone': { label: 'Summon Spark Drone', cost: cost('main', 'exhaust', 'artifice:class'), help: 'Put a Spark Drone onto your battlefield; if charged, set 2 dice', check: summonCheck('spark-drone') },
	'summon-thunder-hulk': { label: 'Summon Thunder Hulk', cost: cost('main', 'exhaust', 'artifice:class', 'basic'), help: 'Put a Thunder Hulk onto your battlefield', check: summonCheck('thunder-hulk') },
}

/** Keywords the engine checks directly. */
export const KEYWORDS: Record<string, string[]> = {
	'frost-talon': ['stalk'],
	'spark-drone': ['unitGuard'],
	'thunder-hulk': ['dormant', 'overkill'],
}

/** Extra conditions for playing a card from hand. */
export const PLAY_CHECKS: Record<string, (s: GameState, p: PlayerId, uid: number) => string | null> = {
	retreat: (s, p) => (units(s, p).some((u) => def(s, u).type === 'Ally' && exhausted(s, u)) ? null : 'You need an exhausted ally to return'),
	recharge: (s, p) => (cardsInPlay(s, p).some((u) => charge(s, u) > 0) ? null : 'You need a charged card (one with an artifice die)'),
}

// ───────── reactions ─────────

function canPayReaction(s: GameState, p: PlayerId, stub: string): { card: number; dice: Die[] } | null {
	const pl = s.players[p]
	if (pl.reacted || s.phase !== 'turns') return null
	const card = pl.hand.find((u) => s.inst[u].stub === stub)
	if (card === undefined) return null
	const c = def(s, card).cost
	const reqs = c?.map((x) => x) ?? []
	const parsed = cost(...reqs)
	const dice = autoPay(activeDice(s, p), parsed.magic)
	return dice ? { card, dice } : null
}

function payReaction(s: GameState, p: PlayerId, r: { card: number; dice: Die[] }) {
	for (const d of r.dice) moveDie(d, 'exhausted')
	discardFromHand(s, r.card)
	s.players[p].reacted = true
	log(s, `${s.players[p].name} reacts with ${nameOf(s, r.card)}!`)
}

export const HOOKS = {
	/** Dodge: after an opponent declares attackers. */
	attackersDeclared(c: Ctx, defender: PlayerId) {
		const s = c.s
		const r = canPayReaction(s, defender, 'dodge')
		if (!r) return
		const mine = units(s, defender).filter((u) => !astralOn(s, u))
		if (mine.length === 0) return
		const attackers = (c.data.attackers as number[]) ?? []
		const threat = attackers.reduce((n, a) => n + attackOf(s, a), 0)
		const pick = one(
			c,
			defender,
			'Play Dodge? Put an astral die on one of your units; this turn your astral dice don’t exhaust when they prevent damage.',
			[
				{ id: 'no', label: 'Don’t react', score: 0 },
				{ id: 'yes', label: 'Play Dodge', score: threat >= 3 ? 2 : -1 },
			],
			'reaction',
		)
		if (pick !== 'yes') return
		payReaction(s, defender, r)
		placeFromExhausted(c, defender, 'astral', mine, 'Dodge: place an astral die on which of your units?')
		s.marks.push({ kind: 'dodge', player: defender, until: 'turn' })
	},
	/** Barrier: after a charged card you control is dealt damage. Returns damage prevented. */
	damaged(c: Ctx, target: number, amount: number): number {
		const s = c.s
		if (charge(s, target) === 0) return 0
		const p = controller(s, target)
		const r = canPayReaction(s, p, 'barrier')
		if (!r) return 0
		const left = def(s, target).type === 'Phoenixborn' ? 99 : lifeOf(s, target) - s.inst[target].wounds
		const pick = one(
			c,
			p,
			`${nameOf(s, target)} is about to take ${amount} damage. Play Barrier to prevent 3 of it?`,
			[
				{ id: 'no', label: 'Don’t react', score: 0 },
				{ id: 'yes', label: 'Play Barrier', score: amount >= left ? 4 : amount >= 2 ? 1 : -1 },
			],
			'reaction',
		)
		if (pick !== 'yes') return 0
		payReaction(s, p, r)
		return 3
	},
}
