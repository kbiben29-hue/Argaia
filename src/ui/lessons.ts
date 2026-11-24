// Deck lessons for the two Ascendancy starter decks: a game-plan guide per deck, combo alerts during
// a coached game, and combo drills (set positions with a goal and step-by-step coaching).
// All text is our own wording.

import { astralOn, charge, pbHasAstral, units } from '../engine/engine'
import { scenario } from '../engine/scenario'
import type { GameState, PlayerId } from '../engine/types'
import { DECKS } from '../data/decks'
import type { CoachStep, Hint } from './coach'

export type DeckId = 'arren' | 'issa'
export const DECK_LESSONS: DeckId[] = ['arren', 'issa']
export const deckName = (id: string) => DECKS[id]?.name ?? id
export const rivalDeck = (id: DeckId): DeckId => (id === 'arren' ? 'issa' : 'arren')
export const pbName = (id: DeckId) => (id === 'arren' ? 'Arren Frostpeak' : 'Issa Brightmore')

// ───────── game plans ─────────

export const PLANS: Record<DeckId, { title: string; body: string }[]> = {
	arren: [
		{
			title: 'The Sentinels of Skies — the game plan',
			body: 'Arren Frostpeak fights with astral magic: fast, evasive units, damage that picks off the opponent’s units, and astral dice that soak up hits. You win by keeping their battlefield clear and chipping at their Phoenixborn every round.',
		},
		{
			title: 'Astral dice protect',
			body: 'An astral die’s power is a side action: put the die on one of your units or on Arren. Whenever that card is dealt damage, the die prevents 1 and goes back to your exhausted pool. A card can only hold one astral die. Skybreak Captain brings its own die with it (Uplift).',
		},
		{
			title: 'Keep a die on Arren',
			body: 'Several cards get better while Arren herself has an astral die: Aerial Strike deals 4 damage to a unit (otherwise nothing), Cirrus Ranger’s Aerial Ambush hits their Phoenixborn and lowers one of their dice, and Whirlwind also draws you a card. Arren’s own ability, Ascend, deals 1 damage and puts an astral die on her — use it early in the round.',
		},
		{
			title: 'Units and summons',
			body: 'Summon Frost Talon makes 1/1s with Stalk: when they attack a unit, nothing can guard it. Stellar Oracle (Divination) draws you 2 and lets you set up your next card. Javelineer throws its attack value at a unit as a main action — boost it with Skybreak Captain’s Aerial Command or Gust Spear first.',
		},
		{
			title: 'Tricks',
			body: 'Dodge is a reaction: when they declare attackers, put an astral die on one of your units — and for the rest of that turn your astral dice keep preventing damage without being used up. Gust Spear and Whirlwind lower their dice, which can leave them short of the power symbols their best cards need. Retreat saves an exhausted ally (and what’s attached to it) by returning it to your hand.',
		},
	],
	issa: [
		{
			title: 'The Spark of Invention — the game plan',
			body: 'Issa Brightmore builds machines and powers them with artifice dice. Her units start slow, but once they are charged they hit hard and are hard to kill. You win by charging the right cards, then smashing through with Thunder Hulks.',
		},
		{
			title: 'Charged cards',
			body: 'An artifice die’s power is a side action: put the die on any card you control — a unit, a ready spell or Issa herself. A card with an artifice die on it is charged (once for each die). Dice stay on cards until the end of the round, then go back to your exhausted pool. Core Supplier, Thunder Suit and Issa’s Inspiration also place dice from your exhausted pool.',
		},
		{
			title: 'Thunder Hulks',
			body: 'Thunder Hulks are 3/3s that can’t attack unless they are charged (Dormant). Charge one and it attacks — and Overkill deals 1 extra damage to their Phoenixborn every time it destroys a unit by attacking, even a unit that blocked it. Thunder Suit makes any unit +2/+2 and charges it in one go.',
		},
		{
			title: 'Spells that care about charge',
			body: 'Supercharge gives +2 attack to a unit, but only while Supercharge itself is charged. Summon Spark Drone, when charged, lets you set 2 dice to any side. Brilliant Display deals 1 damage for every artifice die on your cards — count them before you cast it. Reconfigure moves a die between your cards so one die can do two jobs in a round.',
		},
		{
			title: 'Protect your machines',
			body: 'Spark Drones have Unit Guard: they can step in when one of your units is attacked. Barrier is a reaction: when a charged card of yours is dealt damage, prevent 3 of it. Recharge heals 2 wounds and removes an exhaustion token from a charged card — including Issa.',
		},
	],
}

// ───────── combo alerts (coached game) ─────────

interface Combo {
	key: string
	deck: DeckId
	title: string
	body: string
	/** cards to make glow when the combo is ready, or null when it isn't */
	ready: (s: GameState, me: PlayerId) => number[] | null
}

const handCard = (s: GameState, p: PlayerId, stub: string) => s.players[p].hand.find((u) => s.inst[u].stub === stub)
const boardCard = (s: GameState, p: PlayerId, stub: string) => [...s.players[p].battlefield, ...s.players[p].spellboard.flat()].find((u) => s.inst[u].stub === stub)
const myTurn = (s: GameState, me: PlayerId) => s.pending.kind === 'act' && s.pending.player === me

export const COMBOS: Combo[] = [
	{
		key: 'aerial-strike',
		deck: 'arren',
		title: 'Combo: Aerial Strike is live',
		body: 'Arren has an astral die on her, so Aerial Strike deals 4 damage to a unit — enough for any unit in Issa’s deck, even a Thunder Hulk. It’s a side action, so you can still attack or summon with your main action.',
		ready: (s, me) => {
			const a = handCard(s, me, 'aerial-strike')
			return a !== undefined && pbHasAstral(s, me) && myTurn(s, me) && units(s, (1 - me) as PlayerId).length ? [a, s.players[me].pb] : null
		},
	},
	{
		key: 'ascend-first',
		deck: 'arren',
		title: 'Combo: Ascend, then strike next turn',
		body: 'You hold Aerial Strike but Arren has no astral die yet. Use Ascend (side action): 1 damage to a unit and an astral die onto Arren. Next turn, Aerial Strike deals 4.',
		ready: (s, me) => {
			const a = handCard(s, me, 'aerial-strike')
			return a !== undefined && !pbHasAstral(s, me) && myTurn(s, me) && !s.turn.side && s.inst[s.players[me].pb].exhaust === 0 ? [a, s.players[me].pb] : null
		},
	},
	{
		key: 'ambush',
		deck: 'arren',
		title: 'Combo: Cirrus Ranger’s Aerial Ambush',
		body: 'With an astral die on Arren, Cirrus Ranger deals 1 damage to Issa when it comes into play and lowers one of her dice — pick a power die she was saving.',
		ready: (s, me) => {
			const a = handCard(s, me, 'cirrus-ranger')
			return a !== undefined && pbHasAstral(s, me) && myTurn(s, me) ? [a] : null
		},
	},
	{
		key: 'javelin-boost',
		deck: 'arren',
		title: 'Combo: Aerial Command + Javelineer',
		body: 'Skybreak Captain has an astral die, so its Aerial Command (side action) gives Javelineer +1 attack — then Frost Throw (main action) deals 2 damage instead of 1.',
		ready: (s, me) => {
			const c = boardCard(s, me, 'skybreak-captain')
			const j = boardCard(s, me, 'javelineer')
			return c !== undefined && j !== undefined && astralOn(s, c) && s.inst[j].exhaust === 0 && myTurn(s, me) ? [c, j] : null
		},
	},
	{
		key: 'wake-hulk',
		deck: 'issa',
		title: 'Combo: wake the Thunder Hulk',
		body: 'Your Thunder Hulk can’t attack until it’s charged. Tap an artifice die showing its power symbol (side action) and put it on the Hulk — now it can attack, and Overkill punishes every unit it destroys.',
		ready: (s, me) => {
			const h = s.players[me].battlefield.find((u) => s.inst[u].stub === 'thunder-hulk' && charge(s, u) === 0 && s.inst[u].exhaust === 0)
			const d = s.players[me].dice.find((x) => x.loc === 'active' && x.level === 'power' && x.magic === 'artifice')
			return h !== undefined && d && myTurn(s, me) && !s.turn.side ? [h] : null
		},
	},
	{
		key: 'suit-hulk',
		deck: 'issa',
		title: 'Combo: Thunder Suit on a Thunder Hulk',
		body: 'Thunder Suit gives +2/+2 and puts an artifice die on the unit it’s attached to: a Thunder Hulk becomes a charged 5/5 that can attack right away.',
		ready: (s, me) => {
			const t = handCard(s, me, 'thunder-suit')
			const h = boardCard(s, me, 'thunder-hulk')
			return t !== undefined && h !== undefined && myTurn(s, me) ? [t, h] : null
		},
	},
	{
		key: 'display',
		deck: 'issa',
		title: 'Combo: Brilliant Display',
		body: 'Brilliant Display deals 1 damage for each artifice die on your cards. You have several dice out right now — count them and pick off their small units.',
		ready: (s, me) => {
			const b = handCard(s, me, 'brilliant-display')
			const n = s.players[me].dice.filter((d) => d.loc === 'card' && d.magic === 'artifice').length
			return b !== undefined && n >= 2 && myTurn(s, me) && units(s, (1 - me) as PlayerId).length ? [b] : null
		},
	},
	{
		key: 'supercharge',
		deck: 'issa',
		title: 'Combo: charge Supercharge',
		body: 'Supercharge only works while it has an artifice die on it. Put a die on it (dice power, Core Supplier or Inspiration), then use it to give an attacker +2.',
		ready: (s, me) => {
			const sc = boardCard(s, me, 'supercharge')
			return sc !== undefined && charge(s, sc) === 0 && myTurn(s, me) ? [sc] : null
		},
	},
]

/** A combo alert when one of the deck's combos is ready and hasn't been shown. */
export function comboNote(deck: DeckId, s: GameState, me: PlayerId, seen: Set<string>): CoachStep | null {
	for (const c of COMBOS) {
		if (c.deck !== deck || seen.has('combo-' + c.key)) continue
		const cards = c.ready(s, me)
		if (cards) return { key: 'combo-' + c.key, title: c.title, body: c.body, hint: { cards } }
	}
	return null
}

// ───────── combo drills ─────────

export interface DrillStep {
	text: string
	hint: Hint
	done: (s: GameState, start: GameState) => boolean
}
export interface Drill {
	id: string
	deck: DeckId
	title: string
	goal: string
	lesson: string
	build: (seed: number, name?: string) => GameState
	steps: (s: GameState) => DrillStep[]
	success: (s: GameState, start: GameState) => boolean
}

const names = (deck: DeckId, me: string): [string, string] => [me || 'Player', `${pbName(rivalDeck(deck)).split(' ')[0]} (computer)`]
const unitOf = (s: GameState, p: PlayerId, stub: string) => s.players[p].battlefield.find((u) => s.inst[u].stub === stub) ?? -1
const inHand = (s: GameState, p: PlayerId, stub: string) => s.players[p].hand.find((u) => s.inst[u].stub === stub) ?? -1
const won = (s: GameState) => s.pending.kind === 'over' && s.pending.winner === 0
const powerDie = (s: GameState, p: PlayerId) => s.players[p].dice.find((d) => d.loc === 'active' && d.level === 'power')?.id
const answering = (s: GameState) => (s.pending.kind === 'choose' && s.pending.player === 0 ? s.pending.question : null)

export const DRILLS: Drill[] = [
	{
		id: 'arren-main-side',
		deck: 'arren',
		title: 'One main, one side',
		goal: 'Destroy both of Issa’s units this turn.',
		lesson: 'Aerial Strike is a side action and attacking is a main action, so you got both in one turn. Arren’s astral die made Aerial Strike deal 4 — enough for a Thunder Hulk — and the Captain’s own astral die soaked up 1 of the counter damage.',
		build: (seed, name = 'Player') =>
			scenario(
				['arren', 'issa'],
				names('arren', name),
				[
					{ pbDice: 1, battlefield: [{ stub: 'skybreak-captain', dice: 1 }], hand: ['aerial-strike', 'retreat'], active: ['basic', 'basic', 'class', 'class'] },
					{ battlefield: [{ stub: 'thunder-hulk', dice: 1 }, { stub: 'core-supplier' }], guarded: true, active: [] },
				],
				seed,
			),
		steps: (s) => {
			const hulk = unitOf(s, 1, 'thunder-hulk')
			const sup = unitOf(s, 1, 'core-supplier')
			const q = answering(s)
			return [
				{
					text: 'Arren already has an astral die on her (the small die on her card), so Aerial Strike deals 4 damage. Tap Aerial Strike, Play it, confirm the dice, then choose the Thunder Hulk.',
					hint: { cards: q ? [] : [inHand(s, 0, 'aerial-strike')], options: hulk >= 0 ? [String(hulk)] : [], buttons: ['confirm'] },
					done: (x) => unitOf(x, 1, 'thunder-hulk') < 0,
				},
				{
					text: 'That was your side action. Your main action is still free: attack the Core Supplier with Skybreak Captain (tap the Captain → Attack with this unit → tap the Supplier → Attack!). Issa’s Phoenixborn already guarded this round, so nothing can protect it.',
					hint: { cards: [unitOf(s, 0, 'skybreak-captain'), sup].filter((u) => u >= 0), buttons: ['attack'] },
					done: (x) => unitOf(x, 1, 'core-supplier') < 0,
				},
			]
		},
		success: (s) => s.players[1].battlefield.length === 0,
	},
	{
		id: 'arren-clear-way',
		deck: 'arren',
		title: 'Clear the way',
		goal: 'Win this turn: Issa has 4 life left and a Spark Drone ready to block.',
		lesson: 'Your two units had exactly 4 attack, but the Spark Drone would have blocked one of them. Destroying the only blocker first with a side action meant every point of damage reached Issa.',
		build: (seed, name = 'Player') =>
			scenario(
				['arren', 'issa'],
				names('arren', name),
				[
					{ pbDice: 1, battlefield: [{ stub: 'skybreak-captain', dice: 1 }, { stub: 'frost-talon' }], hand: ['aerial-strike', 'gust-spear'], active: ['basic', 'basic', 'class'] },
					{ wounds: 14, battlefield: [{ stub: 'spark-drone' }], active: [] },
				],
				seed,
			),
		steps: (s) => {
			const drone = unitOf(s, 1, 'spark-drone')
			return [
				{
					text: 'Skybreak Captain (3) and Frost Talon (1) make 4 — exactly lethal — but Issa would block one with her Spark Drone. Remove the blocker first: play Aerial Strike (side action) on the Spark Drone.',
					hint: { cards: answering(s) ? [] : [inHand(s, 0, 'aerial-strike')], options: drone >= 0 ? [String(drone)] : [], buttons: ['confirm'] },
					done: (x) => unitOf(x, 1, 'spark-drone') < 0,
				},
				{
					text: 'No blockers left. Press Attack, tap Issa, tap both of your units, then Attack!',
					hint: { cards: [unitOf(s, 0, 'skybreak-captain'), unitOf(s, 0, 'frost-talon'), s.players[1].pb].filter((u) => u >= 0), buttons: ['attack'] },
					done: won,
				},
			]
		},
		success: won,
	},
	{
		id: 'issa-wake-hulk',
		deck: 'issa',
		title: 'Wake the Hulk',
		goal: 'Win this turn: Arren has 3 life left and no unit that can block.',
		lesson: 'A Thunder Hulk is Dormant: it can’t attack until it’s charged. One artifice dice power (a side action) put a die on it, and then it could attack with your main action.',
		build: (seed, name = 'Player') =>
			scenario(
				['issa', 'arren'],
				names('issa', name),
				[
					{ battlefield: [{ stub: 'thunder-hulk' }], hand: ['recharge'], active: ['power', 'basic', 'basic'] },
					{ wounds: 12, battlefield: [{ stub: 'javelineer', exhaust: 1 }], active: [] },
				],
				seed,
			),
		steps: (s) => {
			const hulk = unitOf(s, 0, 'thunder-hulk')
			const die = powerDie(s, 0)
			return [
				{
					text: 'Your Thunder Hulk has 3 attack — exactly enough — but it can’t attack while uncharged. Tap your artifice die showing its power symbol (the bee), then tap the Thunder Hulk to put the die on it.',
					hint: { dice: die ? [die] : [], cards: [hulk] },
					done: (x) => hulk >= 0 && charge(x, hulk) > 0,
				},
				{
					text: 'The Hulk is charged. Press Attack, tap Arren, tap the Hulk, then Attack! Her Javelineer is exhausted and can’t block.',
					hint: { cards: [hulk, s.players[1].pb], buttons: ['attack'] },
					done: won,
				},
			]
		},
		success: won,
	},
	{
		id: 'issa-display',
		deck: 'issa',
		title: 'Brilliant Display',
		goal: 'Destroy all three of Arren’s units this turn.',
		lesson: 'Brilliant Display counts the artifice dice on your cards when it resolves. Three dice would have dealt 3 damage — one short. Adding a fourth die with a dice power first made it 4: one for each 1-life unit and two for the Stellar Oracle.',
		build: (seed, name = 'Player') =>
			scenario(
				['issa', 'arren'],
				names('issa', name),
				[
					{ pbDice: 1, spellboard: [{ stub: 'reconfigure', dice: 1 }, { stub: 'summon-spark-drone', dice: 1 }], hand: ['brilliant-display'], active: ['power', 'basic'] },
					{ battlefield: [{ stub: 'frost-talon' }, { stub: 'javelineer' }, { stub: 'stellar-oracle' }], active: [] },
				],
				seed,
			),
		steps: (s) => {
			const die = powerDie(s, 0)
			const dice = s.players[0].dice.filter((d) => d.loc === 'card').length
			const q = answering(s)
			return [
				{
					text: `Arren’s units need 1 + 1 + 2 = 4 damage, and Brilliant Display deals 1 per artifice die on your cards — you have ${dice}. First add one more: tap your power die (the bee) and put it on one of your cards (Issa, a spell, anything you control).`,
					hint: { dice: die ? [die] : [], cards: die ? [] : [s.players[0].pb] },
					done: (x) => x.players[0].dice.filter((d) => d.loc === 'card').length >= 4 || x.players[1].battlefield.length === 0,
				},
				{
					text: 'Four dice on your cards. Now play Brilliant Display (main action) and deal the 4 damage: 1 to Frost Talon, 1 to Javelineer, 2 to Stellar Oracle.',
					hint: { cards: q ? [] : [inHand(s, 0, 'brilliant-display')], options: q ? [String(unitOf(s, 1, 'stellar-oracle')), String(unitOf(s, 1, 'frost-talon')), String(unitOf(s, 1, 'javelineer'))].filter((x) => x !== '-1') : [], buttons: ['confirm'] },
					done: (x) => x.players[1].battlefield.length === 0,
				},
			]
		},
		success: (s) => s.players[1].battlefield.length === 0,
	},
]

export const drillsFor = (deck: string) => DRILLS.filter((d) => d.deck === deck)

/** The coach step for a drill: the first step that isn't done yet. */
export function drillCoach(d: Drill, s: GameState, start: GameState): CoachStep | null {
	const steps = d.steps(s)
	const i = steps.findIndex((x) => !x.done(s, start))
	if (i < 0) return null
	return { key: `${d.id}-${i}`, title: `${d.title} · step ${i + 1}/${steps.length}`, body: steps[i].text, hint: steps[i].hint }
}

