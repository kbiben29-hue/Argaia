// Card abilities. The two Ascendancy starter decks (Arren Frostpeak's astral deck and Issa
// Brightmore's artifice deck) live here; the four Reborn precons are in precons.ts and the Red
// Rains chimera in solo.ts. Scripts are keyed `${stub}:${trigger}`:
//   play   – an action spell resolving        enter  – a unit (or ready spell) coming into play
//   attach – an alteration spell attaching    ability – an activated ability (cost in ABILITIES)
// Reactions are offered through HOOKS at the moment their trigger happens.
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
	diceOn,
	discardFromHand,
	drawCards,
	exhausted,
	findDie,
	isChimera,
	lifeOf,
	log,
	moveDie,
	nameOf,
	pbHasAstral,
	units,
	leavePlay,
	type Ctx,
	type Destroyed,
	type Script,
} from './engine'
import { one, runCard } from './flows'
import { changeDice, changeOwnDice, conjure, damageFoeUnit, left, lowerFoeDice, mark, placeFromExhausted, placeScore, summonCheck, unitValue } from './helpers'
import { PRECON_ABILITIES, PRECON_CHECKS, PRECON_KEYWORDS, PRECON_SCRIPTS, destroyedTriggers } from './precons'
import { SOLO_SCRIPTS } from './solo'
import { other, type ChoiceOption, type Die, type GameState, type PlayerId } from './types'

export { unitValue }

// ───────── scripts ─────────

const STARTER_SCRIPTS: Record<string, Script> = {
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
			checkDestroyed(s, c)
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

export const CARD_SCRIPTS: Record<string, Script> = { ...STARTER_SCRIPTS, ...PRECON_SCRIPTS, ...SOLO_SCRIPTS }

// ───────── activated abilities ─────────

export interface Ability {
	label: string
	cost: Cost
	/** what it does, in our own words (shown on the button) */
	help: string
	check?: (s: GameState, p: PlayerId, uid: number) => string | null
}

const STARTER_ABILITIES: Record<string, Ability> = {
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

/** Every activated ability; a card's second ability is keyed `${stub}#2`. */
export const ABILITIES: Record<string, Ability> = { ...STARTER_ABILITIES, ...PRECON_ABILITIES }

/** Keywords the engine checks directly ('name' or 'name:value'). Alterations listed here grant them to their unit. */
export const KEYWORDS: Record<string, string[]> = {
	'frost-talon': ['stalk'],
	'spark-drone': ['unitGuard'],
	'thunder-hulk': ['dormant', 'overkill:1'],
	'frozen-fear': ['terrifying:1'],
	...PRECON_KEYWORDS,
}

/** Extra conditions for playing a card from hand. */
export const PLAY_CHECKS: Record<string, (s: GameState, p: PlayerId, uid: number) => string | null> = {
	retreat: (s, p) => (units(s, p).some((u) => def(s, u).type === 'Ally' && exhausted(s, u)) ? null : 'You need an exhausted ally to return'),
	recharge: (s, p) => (cardsInPlay(s, p).some((u) => charge(s, u) > 0) ? null : 'You need a charged card (one with an artifice die)'),
	...PRECON_CHECKS,
}

// ───────── reactions ─────────

/** Dice that may pay for a reaction: the active pool, plus power dice resting on Reimagine. */
function reactionPool(s: GameState, p: PlayerId): Die[] {
	const extra = s.players[p].spellboard
		.flat()
		.filter((u) => s.inst[u].stub === 'reimagine')
		.flatMap((u) => diceOn(s, u))
		.filter((d) => d.level === 'power' && (d.magic === 'time' || d.magic === 'illusion'))
	return [...activeDice(s, p), ...extra]
}

export interface ReactionPay {
	card: number
	dice: Die[]
}

/** Can player `p` play reaction `stub` from hand now (one reaction per turn, and the dice)? */
export function canPayReaction(s: GameState, p: PlayerId, stub: string): ReactionPay | null {
	const pl = s.players[p]
	if (pl.reacted || isChimera(s, p) || s.phase === 'setup' || s.phase === 'over') return null
	const card = pl.hand.find((u) => s.inst[u].stub === stub)
	if (card === undefined) return null
	const parsed = cost(...((def(s, card).cost ?? []).filter((x) => typeof x === 'string') as string[]))
	const dice = autoPay(reactionPool(s, p), parsed.magic)
	return dice ? { card, dice } : null
}

export function payReaction(s: GameState, p: PlayerId, r: ReactionPay) {
	for (const d of r.dice) moveDie(d, 'exhausted')
	discardFromHand(s, r.card)
	s.players[p].reacted = true
	log(s, `${s.players[p].name} reacts with ${nameOf(s, r.card)}!`)
}

/** Ask whether to play a reaction. Returns the payment if the player said yes (already paid). */
export function offerReaction(c: Ctx, p: PlayerId, stub: string, prompt: string, yesScore: number): ReactionPay | null {
	const r = canPayReaction(c.s, p, stub)
	if (!r) return null
	const pick = one(
		c,
		p,
		prompt,
		[
			{ id: 'no', label: 'Don’t react', score: 0 },
			{ id: 'yes', label: `Play ${def(c.s, r.card).name}`, score: yesScore },
		],
		'reaction',
	)
	if (pick !== 'yes') return null
	payReaction(c.s, p, r)
	return r
}

export const HOOKS = {
	/** After attackers are declared: the attacker's Void Pulse, then the defender's Dodge. */
	attackersDeclared(c: Ctx, defender: PlayerId, attackers: number[] = (c.data.attackers as number[]) ?? []) {
		const s = c.s
		const attacker = other(defender)
		// Void Pulse (attacker): damage an opposing unit equal to the number of attackers
		if (units(s, defender).length) {
			const n = attackers.length
			const best = Math.max(...units(s, defender).map((u) => (left(s, u) <= n ? unitValue(s, u) : 0)))
			if (offerReaction(c, attacker, 'void-pulse', `Play Void Pulse? Deal ${n} damage to an opposing unit; if that destroys it, draw 2 and set 2 dice.`, best > 0 ? 3 : -1)) {
				const cc = { ...c, owner: attacker, rival: defender }
				const hit = damageFoeUnit(cc, n, `Void Pulse: deal ${n} damage to which opposing unit?`)
				if (hit !== null && checkDestroyed(s, cc).includes(hit)) {
					const k = drawCards(s, attacker, 2)
					log(s, `Void Pulse: ${s.players[attacker].name} draws ${k}.`)
					const who = one(cc, attacker, 'Void Pulse: change 2 dice in whose active pool?', [
						{ id: 'me', label: 'My dice', score: 2 },
						{ id: 'them', label: `${s.players[defender].name}’s dice`, score: 1 },
					])
					changeDice(cc, 2, who === 'them' ? defender : attacker)
				}
			}
		}
		// Dodge (defender)
		const mine = units(s, defender).filter((u) => !astralOn(s, u))
		if (mine.length === 0) return
		const threat = attackers.reduce((n, a) => n + attackOf(s, a), 0)
		if (offerReaction(c, defender, 'dodge', 'Play Dodge? Put an astral die on one of your units; this turn your astral dice don’t exhaust when they prevent damage.', threat >= 3 ? 2 : -1)) {
			placeFromExhausted(c, defender, 'astral', mine, 'Dodge: place an astral die on which of your units?')
			s.marks.push({ kind: 'dodge', player: defender, until: 'turn' })
		}
	},
	/** After a guard is declared against `attacker`'s attack: Ensnare (2 damage to the guard). */
	guardDeclared(c: Ctx, attacker: PlayerId, guard: number) {
		const s = c.s
		const isPb = def(s, guard).type === 'Phoenixborn'
		const kills = !isPb && left(s, guard) <= 2
		if (offerReaction(c, attacker, 'ensnare', `Play Ensnare? Deal 2 damage to ${nameOf(s, guard)}, the guard.`, kills ? 4 : isPb ? 1.5 : 0.5)) {
			dealDamage({ ...c, owner: attacker, rival: other(attacker) }, guard, 2)
		}
	},
	/** Redirect: when your Phoenixborn is about to be dealt damage, a unit of yours takes it instead. */
	redirect(c: Ctx, target: number, amount: number): number {
		const s = c.s
		const t = s.inst[target]
		if (t.zone !== 'pb') return target
		const p = t.owner
		if (units(s, p).length === 0 || !canPayReaction(s, p, 'redirect')) return target
		const pbLeftNow = Number(def(s, target).life) - t.wounds
		if (!offerReaction(c, p, 'redirect', `${nameOf(s, target)} is about to take ${amount} damage. Play Redirect so a unit of yours takes it instead?`, amount >= pbLeftNow ? 9 : amount >= 2 ? 1.5 : -1)) return target
		const opts = units(s, p).map((u) => ({ id: String(u), label: `${nameOf(s, u)} (${left(s, u)} life left)`, uid: u, score: -unitValue(s, u) + (left(s, u) > amount ? 3 : 0) }))
		const pick = one(c, p, 'Redirect: which of your units takes the damage?', opts, 'target')
		if (pick === null) return target
		log(s, `${nameOf(s, Number(pick))} takes the damage instead.`)
		return Number(pick)
	},
	/** Preventing reactions as damage is dealt: Barrier (charged card), Bravery (your unit). Returns damage prevented. */
	damaged(c: Ctx, target: number, amount: number): number {
		const s = c.s
		const p = controller(s, target)
		const isUnitTarget = s.inst[target].zone === 'battlefield'
		const lethal = isUnitTarget && amount >= left(s, target)
		if (isUnitTarget && canPayReaction(s, p, 'bravery')) {
			if (offerReaction(c, p, 'bravery', `${nameOf(s, target)} is about to take ${amount} damage. Play Bravery to prevent all of it?`, lethal ? 3 + unitValue(s, target) / 3 : -1)) return amount
		}
		if (charge(s, target) === 0) return 0
		const r = canPayReaction(s, p, 'barrier')
		if (!r) return 0
		const pick = one(
			c,
			p,
			`${nameOf(s, target)} is about to take ${amount} damage. Play Barrier to prevent 3 of it?`,
			[
				{ id: 'no', label: 'Don’t react', score: 0 },
				{ id: 'yes', label: 'Play Barrier', score: lethal || !isUnitTarget ? (amount >= 2 ? 4 : 1) : amount >= 2 ? 1 : -1 },
			],
			'reaction',
		)
		if (pick !== 'yes') return 0
		payReaction(s, p, r)
		return 3
	},
	/** Units just destroyed: their own "when destroyed" effects, then everyone's triggers and reactions. */
	destroyed(c: Ctx, list: Destroyed[]) {
		destroyedTriggers(c, list)
	},
}

