// Tutorial coach: explains what's happening in plain words and makes the suggested move glow.
// The suggestion comes from the computer opponent's own move picker, so it's always legal.

import { bestPicks, chooseIntent } from '../bot/bot'
import { abilitiesOf } from '../engine/engine'
import { nameOf } from '../engine/engine'
import type { GameState, Intent, PlayerId } from '../engine/types'

export interface Hint {
	cards?: number[]
	dice?: string[]
	buttons?: string[]
	options?: string[]
}

export interface CoachStep {
	key: string
	title: string
	body: string
	hint?: Hint
}

export const INTRO: { title: string; body: string }[] = [
	{
		title: 'Welcome to Ashes',
		body: 'You are a Phoenixborn, a demigod duelling another Phoenixborn. Deal damage to theirs until its wounds reach its life value and you win. You’ll play Arren Frostpeak, who fights with astral dice, against Issa Brightmore and her artifice dice.',
	},
	{
		title: 'Dice are your magic',
		body: 'Each round you roll your 10 dice. A die shows a power symbol (best), a class symbol, or a basic symbol (plainest). Costs ask for symbols: a power symbol can pay a class or basic cost too, but a basic symbol only pays basic costs. Spent dice go to your exhausted pool and are re-rolled next round.',
	},
	{
		title: 'Your cards',
		body: 'Allies are units that fight on your battlefield. Ready spells sit on your spellboard and can be used again and again (many summon conjurations — units from your conjuration pile). Action spells happen once. Alteration spells attach to a unit and boost it. Reaction spells are played on the other player’s turn when something specific happens.',
	},
	{
		title: 'A turn',
		body: 'Players take turns. On your turn you take one main action (◆: play a card, use an ability, attack, or pass) and may take one side action (◇: a side-cost card or ability, a dice power, or meditate). When both players pass in a row, the round ends: units heal, exhaustion comes off, and everyone re-rolls.',
	},
	{
		title: 'Attacking',
		body: 'Attack their Phoenixborn with any of your ready units — they can block each attacker with one of theirs. Or attack a single unit with one of yours — it can counter, and their Phoenixborn can guard it once a round. Units that attack or counter become exhausted. Tap any card to see it big. Whatever glows is the coach’s suggestion.',
	},
]

function describe(s: GameState, i: Intent): { what: string; hint: Hint } {
	switch (i.t) {
		case 'play':
			return { what: `play ${nameOf(s, i.card)}`, hint: { cards: [i.card], dice: i.dice } }
		case 'activate':
			return { what: `use ${nameOf(s, i.card)} (${abilitiesOf(s, i.card)[i.ab ?? 0]?.label ?? 'ability'})`, hint: { cards: [i.card], dice: i.dice } }
		case 'dicePower':
			return { what: `use a dice power: put your power die on ${nameOf(s, i.target)}`, hint: { dice: [i.die], cards: [i.target] } }
		case 'attack':
			return { what: `attack ${i.target === 'pb' ? 'their Phoenixborn' : nameOf(s, i.target)} with ${i.attackers.map((a) => nameOf(s, a)).join(', ')}`, hint: { cards: [...i.attackers, ...(i.target === 'pb' ? [] : [i.target])], buttons: ['attack'] } }
		case 'pass':
			return { what: 'pass (your main action does nothing this turn)', hint: { buttons: ['pass'] } }
		case 'endTurn':
			return { what: 'end your turn', hint: { buttons: ['endTurn'] } }
		default:
			return { what: 'continue', hint: {} }
	}
}

const QUESTION_HELP: Record<string, { title: string; body: string }> = {
	firstFive: { title: 'Choose your First Five', body: 'Pick five different cards to start in your hand; the rest are shuffled into your deck. The highlighted five are the deck’s suggested start — units and ready spells you can get out early.' },
	firstPlayer: { title: 'Who goes first?', body: 'You rolled the most basic symbols, so you choose. Going first lets you set up before your opponent can react.' },
	prepareDiscard: { title: 'Prepare: discard', body: 'Each round you may discard cards you don’t want, then draw back up to five. Keeping a card is usually fine early on.' },
	block: { title: 'Block?', body: 'They are attacking your Phoenixborn. A blocking unit takes that attacker’s damage instead, and deals its own attack back. Blocking with a unit that survives (or trades well) saves your Phoenixborn’s life.' },
	guard: { title: 'Guard?', body: 'One of your units is attacked. Your Phoenixborn can guard it once per round (taking the damage itself), or a unit with Unit Guard can step in.' },
	counter: { title: 'Counter?', body: 'Your unit was attacked. If it counters it deals its attack back to the attacker, but it becomes exhausted afterwards.' },
	reaction: { title: 'A reaction!', body: 'You hold a reaction spell whose moment has come. You may play one reaction per turn, even on the other player’s turn.' },
	recoveryDice: { title: 'Recovery: re-roll?', body: 'Dice you leave in your active pool keep their sides into the next round. Exhaust basic dice to re-roll them for a chance at better symbols.' },
	target: { title: 'Choose a target', body: 'The glowing choice is the coach’s pick — usually a unit it can destroy.' },
}

export function coachFor(s: GameState, me: PlayerId, seen: Set<string>): CoachStep | null {
	if (s.pending.kind === 'over') return null
	if (s.pending.player !== me) return { key: 'wait', title: 'Their move', body: 'Your opponent is thinking. Watch the log on the right to see what they do.' }
	if (s.pending.kind === 'choose') {
		const q = s.pending.question
		const help = QUESTION_HELP[q.kind ?? ''] ?? { title: 'Your choice', body: q.prompt }
		const key = `q:${q.kind}`
		return { key, title: help.title, body: seen.has(key) ? `${q.prompt} The glowing choice is a good one.` : help.body, hint: { options: bestPicks(q) } }
	}
	const i = chooseIntent(s)
	if (!i) return null
	const d = describe(s, i)
	let key = 'turn'
	let body = ''
	if (!s.turn.main && !s.turn.side) {
		key = 'turn-start'
		body = 'Your turn: one main action (◆) and up to one side action (◇), in either order.'
	} else if (s.turn.main && !s.turn.side) {
		key = 'side-left'
		body = 'You’ve taken your main action. You can still take a side action, or end your turn.'
	} else {
		key = 'main-left'
		body = 'You’ve used your side action. Now take your main action — or pass if there’s nothing useful.'
	}
	return { key, title: 'Your turn', body: `${seen.has(key) ? '' : body + ' '}Suggested: ${d.what}.`, hint: d.hint }
}

/** One-off explanations when something new happens. */
export function eventNote(prev: GameState, next: GameState, me: PlayerId, seen: Set<string>): CoachStep | null {
	const fresh = next.log.slice(prev.log.length).join(' \n')
	const note = (key: string, title: string, body: string) => (seen.has(key) ? null : { key, title, body })
	if (/astral die on .* prevents/.test(fresh)) return note('n:astral', 'Astral dice protect', 'An astral die on a card prevents 1 damage, then goes back to the exhausted pool. Arren keeps one on herself to power Aerial Strike and Whirlwind’s card draw.')
	if (/is destroyed/.test(fresh)) return note('n:destroyed', 'A unit is destroyed', 'When a unit’s wounds reach its life it’s destroyed. Allies go to the discard pile; conjurations go back to their conjuration pile and can be summoned again.')
	if (/Recovery:/.test(fresh)) return note('n:recovery', 'End of the round', 'Both players passed in a row, so the round is over. Units remove wounds equal to their recover value, every card loses one exhaustion token, dice on cards go back to the exhausted pool, and the first player token passes over.')
	if (/reacts with/.test(fresh) && next.active === me) return note('n:reaction', 'They reacted', 'Your opponent played a reaction spell during your turn. Each player can play one reaction per turn.')
	if (/charged/.test(fresh) || /artifice dice power/.test(fresh)) return note('n:charged', 'Charged cards', 'Issa’s artifice dice sit on cards to charge them. Thunder Hulks can only attack while charged; Barrier protects charged cards.')
	return null
}
