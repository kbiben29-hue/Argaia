// The game's own flow as task scripts: setup (First Five), prepare phase, recovery phase,
// playing a card, using an ability, and attacks (blocks, guards, counters, battles).

import {
	attach,
	attackOf,
	charge,
	checkDestroyed,
	checkPhoenixborn,
	controller,
	dealDamage,
	def,
	defOf,
	diceOn,
	discardFromHand,
	drawCards,
	exhausted,
	hasKw,
	inPlay,
	isUnit,
	lifeOf,
	log,
	moveDie,
	nameOf,
	placeReadySpell,
	placeUnit,
	playCost,
	queue,
	recoverOf,
	units,
	withRng,
	activeDice,
	cardsInPlay,
	canDefendAgainst,
	isChimera,
	isPbType,
	findDie,
	moveCard,
	kwValue,
	type Ctx,
	type Script,
} from './engine'
import { CARD_SCRIPTS, HOOKS } from './effects'
import { unitValue, left, lowerDice, pickUnit, hitScore, heal } from './helpers'
import { afterFight, attackTriggers, endOfRound, lawInPlay } from './precons'
import { chimeraBlocks, chimeraGuard, soloRecoveryAfter, soloRecoveryBeforeReady, soloSetup } from './solo'
import { DECKS } from '../data/decks'
import { touchDice as import_touch } from './helpers'
import { LEVELS, other, type ChoiceOption, type GameState, type Level, type PlayerId } from './types'

const FACES: Level[] = ['power', 'class', 'class', 'class', 'basic', 'basic']

export function one(c: Ctx, player: PlayerId, prompt: string, options: ChoiceOption[], kind?: string): string | null {
	if (options.length === 0) return null
	return c.ask(player, { prompt, options, min: 1, max: 1, kind })[0] ?? null
}

/** Run a card's script (if it has one) inside the current task. */
export function runCard(c: Ctx, key: string, data: Record<string, unknown>) {
	const fn = CARD_SCRIPTS[key]
	if (fn) fn({ ...c, data })
}

const dieLabel = (magic: string, level: string) => `${magic[0].toUpperCase()}${magic.slice(1)} · ${level}`

// ───────── setup ─────────

const setup: Script = (c) => {
	const s = c.s
	for (const p of [0, 1] as PlayerId[]) {
		if (isChimera(s, p)) continue
		const pl = s.players[p]
		const deck = DECKS[pl.deckId]
		const stubs = [...new Set(pl.deck.map((u) => s.inst[u].stub))]
		const uniques = stubs.filter((st) => defOf(st).unique)
		const picks = c.ask(p, {
			prompt: 'Choose your First Five: five different cards to start in your hand.',
			options: stubs.map((st) => ({ id: st, label: defOf(st).name, uid: pl.deck.find((u) => s.inst[u].stub === st), score: deck?.firstFive.includes(st) ? 10 : 0 })),
			min: 5,
			max: 5,
			defaults: (deck?.firstFive ?? []).filter((st) => stubs.includes(st)),
			group: { ids: uniques, max: 1, label: 'At most one Phoenixborn-unique card can be in your First Five' },
			kind: 'firstFive',
		})
		for (const st of picks) {
			const uid = pl.deck.find((u) => s.inst[u].stub === st)!
			pl.deck.splice(pl.deck.indexOf(uid), 1)
			pl.hand.push(uid)
			s.inst[uid].zone = 'hand'
		}
	}
	withRng(s, (r) => {
		for (const pl of s.players) pl.deck = r.shuffle(pl.deck)
	})
	if (s.solo) soloSetup(s)
	log(s, s.solo ? 'You have chosen your First Five.' : 'Both players have chosen their First Five.')
	queue(s, 'prepare', 0)
}

// ───────── prepare phase ─────────

const prepare: Script = (c) => {
	const s = c.s
	s.phase = 'prepare'
	log(s, `— Round ${s.round} —`)
	const roll = (p: PlayerId, all: boolean) =>
		!isChimera(s, p) &&
		withRng(s, (r) => {
			for (const d of s.players[p].dice)
				if (all ? d.loc !== 'card' : d.loc === 'exhausted') {
					d.level = FACES[r.int(6)]
					d.loc = 'active'
				}
		})
	roll(0, false)
	roll(1, false)
	if (s.round === 1 && s.solo) {
		s.first = other(s.solo.chimera)
		log(s, `${s.players[s.first].name} takes the first player token.`)
	} else if (s.round === 1) {
		// the player with the most basic symbols chooses who goes first; ties re-roll
		const basics = (p: PlayerId) => activeDice(s, p).filter((d) => d.level === 'basic').length
		for (let k = 0; basics(0) === basics(1) && k < 50; k++) {
			roll(0, true)
			roll(1, true)
		}
		const chooser: PlayerId = basics(0) > basics(1) ? 0 : 1
		log(s, `${s.players[chooser].name} rolled the most basic symbols and chooses the first player.`)
		queue(s, 'firstPlayer', chooser)
	}
	queue(s, 'prepareCards', s.first)
}

const firstPlayer: Script = (c) => {
	const s = c.s
	const chooser = c.owner
	const pick = one(
		c,
		chooser,
		'You rolled the most basic symbols. Who takes the first player token?',
		[
			{ id: 'me', label: 'I go first', score: 2 },
			{ id: 'them', label: `${s.players[other(chooser)].name} goes first`, score: 0 },
		],
		'firstPlayer',
	)
	s.first = pick === 'me' ? chooser : other(chooser)
	log(s, `${s.players[s.first].name} takes the first player token.`)
}

const prepareCards: Script = (c) => {
	const s = c.s
	for (const p of [s.first, other(s.first)] as PlayerId[]) {
		const pl = s.players[p]
		if (pl.hand.length === 0 || isChimera(s, p)) continue
		const picks = c.ask(p, {
			prompt: 'Prepare: discard any cards you don’t want (you then draw back up to 5).',
			options: pl.hand.map((u) => ({ id: String(u), label: nameOf(s, u), uid: u, score: -1 })),
			min: 0,
			max: pl.hand.length,
			kind: 'prepareDiscard',
		})
		for (const id of picks) discardFromHand(s, Number(id))
		if (picks.length) log(s, `${pl.name} discards ${picks.length} card${picks.length > 1 ? 's' : ''}.`)
	}
	let fatigue = false
	for (const p of [s.first, other(s.first)] as PlayerId[]) {
		if (isChimera(s, p)) continue
		const pl = s.players[p]
		const need = Math.max(0, 5 - pl.hand.length)
		const got = drawCards(s, p, need)
		if (got < need) {
			s.inst[pl.pb].wounds += need - got
			fatigue = true
			log(s, `${pl.name} can’t draw ${need - got} card${need - got > 1 ? 's' : ''}: fatigue — ${need - got} wound${need - got > 1 ? 's' : ''} on ${nameOf(s, pl.pb)}.`)
		}
	}
	if (fatigue) checkPhoenixborn(s)
	s.phase = 'turns'
	s.active = s.first
	s.turn = { main: false, side: false, passed: false }
	s.lastPassed = false
}

// ───────── recovery phase ─────────

const recovery: Script = (c) => {
	const s = c.s
	s.phase = 'recovery'
	for (const p of [0, 1] as PlayerId[]) for (const u of units(s, p)) s.inst[u].wounds = Math.max(0, s.inst[u].wounds - recoverOf(s, u))
	if (s.solo) soloRecoveryBeforeReady(s)
	for (const p of [0, 1] as PlayerId[]) {
		for (const u of cardsInPlay(s, p)) s.inst[u].exhaust = Math.max(0, s.inst[u].exhaust - 1)
		s.players[p].guarded = false
		for (const d of s.players[p].dice) if (d.loc === 'card') moveDie(d, 'exhausted')
	}
	log(s, 'Recovery: units heal, one exhaustion token comes off each card, and dice on cards go back to the exhausted pools.')
	if (s.solo) soloRecoveryAfter(c)
	queue(s, 'recoveryDice', s.first)
}

const recoveryDice: Script = (c) => {
	const s = c.s
	for (const p of [s.first, other(s.first)] as PlayerId[]) {
		const act = activeDice(s, p)
		if (act.length === 0 || isChimera(s, p)) continue
		const picks = c.ask(p, {
			prompt: 'Recovery: choose any active dice to exhaust so they are re-rolled next round (the rest keep their sides).',
			options: act.map((d) => ({ id: d.id, label: dieLabel(d.magic, d.level), dieId: d.id, score: d.level === 'basic' ? 1 : -1 })),
			min: 0,
			max: act.length,
			kind: 'recoveryDice',
		})
		for (const id of picks) moveDie(s.players[p].dice.find((d) => d.id === id)!, 'exhausted')
	}
	endOfRound(c)
	s.marks = s.marks.filter((m) => m.until !== 'round')
	s.first = other(s.first)
	s.round += 1
	queue(s, 'prepare', s.first)
}

// ───────── playing cards and abilities ─────────

const play: Script = (c) => {
	const s = c.s
	const uid = c.data.uid as number
	const d = def(s, uid)
	const p = c.owner
	const cost = playCost(s, uid)
	for (let k = 0; k < cost.discard; k++) {
		const pick = one(
			c,
			p,
			`Discard a card to pay for ${d.name}.`,
			s.players[p].hand.map((u) => ({ id: String(u), label: nameOf(s, u), uid: u, score: -1 })),
			'discardCost',
		)
		if (pick) discardFromHand(s, Number(pick))
	}
	switch (d.type) {
		case 'Ally':
			if (placeUnit(s, p, uid)) runCard(c, `${d.stub}:enter`, { uid })
			break
		case 'Ready Spell':
			placeReadySpell(s, p, uid)
			runCard(c, `${d.stub}:enter`, { uid })
			break
		case 'Alteration Spell': {
			const all = [...units(s, p), ...units(s, other(p))]
			const host = one(
				c,
				p,
				`Attach ${d.name} to which unit?`,
				all.map((u) => ({ id: String(u), label: `${nameOf(s, u)}${controller(s, u) === p ? '' : ' (opponent)'}`, uid: u, score: controller(s, u) === p ? 5 + unitValue(s, u) : -5 })),
				'attach',
			)
			if (host === null) {
				s.inst[uid].zone = 'discard'
				s.players[p].discard.push(uid)
				break
			}
			attach(s, uid, Number(host))
			log(s, `${d.name} is attached to ${nameOf(s, Number(host))}.`)
			runCard(c, `${d.stub}:attach`, { uid, host: Number(host) })
			break
		}
		default:
			runCard(c, `${d.stub}:play`, { uid })
			if (s.inst[uid].zone === 'stack') {
				s.inst[uid].zone = 'discard'
				s.players[s.inst[uid].owner].discard.push(uid)
			}
	}
	checkDestroyed(s, c)
}

const ability: Script = (c) => {
	const uid = c.data.uid as number
	const which = (c.data.ab as number) ?? 0
	runCard(c, `${c.s.inst[uid].stub}:ability${which ? `#${which + 1}` : ''}`, { uid })
	checkDestroyed(c.s, c)
}

// ───────── dice powers that resolve with questions ─────────

const dicePower: Script = (c) => {
	const s = c.s
	const p = c.owner
	const magic = c.data.magic as string
	const target = c.data.target as number | undefined
	switch (magic) {
		case 'ceremonial': {
			const opts = s.players[p].discard.filter((u) => def(s, u).type === 'Ally')
			const pick = one(c, p, 'Ceremonial power: return which ally from your discard pile to your hand? (Then 1 damage to your Phoenixborn.)', opts.map((u) => ({ id: String(u), label: nameOf(s, u), uid: u, score: unitScoreFromDef(s, u) })), 'search')
			if (pick !== null) {
				moveCard(s, Number(pick), 'hand')
				log(s, `${nameOf(s, Number(pick))} returns to ${s.players[p].name}’s hand.`)
				dealDamage(c, s.players[p].pb, 1)
			}
			break
		}
		case 'illusion': {
			const pool = activeDice(s, c.rival)
			const n = Math.min(2, pool.length)
			const picks = c.ask(p, {
				prompt: `Illusion power: lower up to ${n} dice in ${s.players[c.rival].name}’s active pool one level.`,
				options: pool.map((d) => ({ id: d.id, label: `${d.magic} · ${d.level}`, dieId: d.id, score: d.level === 'power' ? 3 : d.level === 'class' ? 2 : -1 })),
				min: 0,
				max: n,
				kind: 'lowerDice',
			})
			for (const id of picks) {
				const d = findDie(s, id)!
				d.level = d.magic === 'rage' || d.level === 'class' ? 'basic' : d.level === 'power' ? 'class' : 'basic'
			}
			if (picks.length) log(s, `${picks.length} of ${s.players[c.rival].name}’s dice are lowered.`)
			void lowerDice
			touch(s, c.rival, picks.length)
			break
		}
		case 'sympathy': {
			drawCards(s, p, 1)
			log(s, `${s.players[p].name} draws a card.`)
			const hand = s.players[p].hand
			const pick = one(c, p, 'Sympathy power: put a card from your hand back on your draw pile?', [{ id: 'none', label: 'Keep them all', score: 1 }, ...hand.map((u) => ({ id: String(u), label: nameOf(s, u), uid: u, score: 0 }))], 'deckTop')
			if (pick && pick !== 'none') {
				const where = one(c, p, 'Top or bottom of your draw pile?', [
					{ id: 'top', label: 'Top', score: 1 },
					{ id: 'bottom', label: 'Bottom', score: 2 },
				], 'deckTop')
				moveCard(s, Number(pick), 'deck', where === 'bottom')
				log(s, `${s.players[p].name} puts a card on the ${where} of their draw pile.`)
			}
			break
		}
		case 'natural':
			if (target !== undefined) {
				dealDamage(c, target, 1)
				checkDestroyed(s, c)
			}
			break
		case 'time': {
			if (target !== undefined) {
				s.inst[target].status += 1
				log(s, `${nameOf(s, target)} gets a status token.`)
			}
			const withStatus = [...units(s, 0), ...units(s, 1), ...s.players[0].spellboard.flat(), ...s.players[1].spellboard.flat()].filter((u) => s.inst[u].status > 0)
			const pick = one(c, p, 'Time power: then remove a status token from a card?', [{ id: 'none', label: 'No', score: 0.5 }, ...withStatus.map((u) => ({ id: String(u), label: `${nameOf(s, u)} (${s.inst[u].status})`, uid: u, score: def(s, u).type === 'Aspect' && s.inst[u].stub === 'rampage' ? 2 : -1 }))], 'target')
			if (pick && pick !== 'none') {
				s.inst[Number(pick)].status -= 1
				log(s, `A status token comes off ${nameOf(s, Number(pick))}.`)
			}
			break
		}
	}
	// Reimagine: keep a time or illusion power die for paying reactions
	if (magic === 'time' || magic === 'illusion') {
		const re = s.players[p].spellboard.flat().find((u) => s.inst[u].stub === 'reimagine' && !s.players[p].dice.some((d) => d.loc === 'card' && d.on === u))
		const die = findDie(s, c.data.die as string)
		if (re !== undefined && die && die.loc === 'exhausted') {
			const ok = one(c, p, 'Reimagine: place that die (power side) and an exhaustion token on Reimagine, to pay for a reaction later?', [
				{ id: 'no', label: 'No', score: 0 },
				{ id: 'yes', label: 'Yes', score: 1 },
			], 'optional')
			if (ok === 'yes') {
				die.level = 'power'
				moveDie(die, 'card', re)
				s.inst[re].exhaust += 1
				log(s, 'The die rests on Reimagine.')
			}
		}
	}
}

const unitScoreFromDef = (s: GameState, u: number) => Number(def(s, u).attack ?? 0) * 1.5 + Number(def(s, u).life ?? 0)
const touch = (s: GameState, owner: PlayerId, n: number) => void import_touch(s, owner, n)

// ───────── attacks ─────────

const attack: Script = (c) => {
	const s = c.s
	const me = c.owner
	const foe = c.rival
	const target = c.data.target as 'pb' | number
	const attackers = c.data.attackers as number[]
	const foePb = s.players[foe].pb
	const chimeraDefends = isChimera(s, foe)
	s.attack = { target, attackers }
	log(s, `${s.players[me].name} attacks ${target === 'pb' ? nameOf(s, foePb) : nameOf(s, target)} with ${attackers.map((a) => nameOf(s, a)).join(', ')}.`)

	attackTriggers(c, attackers, target)
	HOOKS.attackersDeclared(c, foe, attackers)
	if (target !== 'pb' && !inPlay(s, target)) {
		log(s, 'The target is gone — the attack ends.')
		for (const a of attackers) if (s.inst[a].zone === 'battlefield') s.inst[a].exhaust += 1
		s.attack = null
		return
	}
	const unpreventable = lawInPlay(s)

	// the defender declares blockers (attack on a Phoenixborn) or a guard (attack on a unit)
	const defenders = new Map<number, number>()
	if (target === 'pb') {
		if (chimeraDefends) for (const [a, d] of chimeraBlocks(s, attackers)) defenders.set(a, d)
		else {
			const used = new Set<number>()
			for (const a of attackers) {
				if (!inPlay(s, a)) continue
				const opts = units(s, foe).filter((u) => !exhausted(s, u) && !used.has(u) && canDefendAgainst(s, u, a))
				if (opts.length === 0) continue
				const pick = one(
					c,
					foe,
					`Block ${nameOf(s, a)} (attack ${attackOf(s, a)}, life ${lifeOf(s, a) - s.inst[a].wounds})? A blocker takes the hit instead of your Phoenixborn and must counter.`,
					[{ id: 'none', label: 'No block', score: 0 }, ...opts.map((u) => ({ id: String(u), label: `Block with ${nameOf(s, u)} (${attackOf(s, u)}/${lifeOf(s, u) - s.inst[u].wounds})`, uid: u, score: blockScore(c, a, u, attackers.filter((x) => !defenders.has(x)).reduce((n, x) => n + attackOf(s, x), 0)) }))],
					'block',
				)
				if (pick && pick !== 'none') {
					defenders.set(a, Number(pick))
					used.add(Number(pick))
					log(s, `${nameOf(s, Number(pick))} blocks ${nameOf(s, a)}.`)
				}
			}
		}
	} else {
		const a = attackers[0]
		const noGuard = hasKw(s, a, 'stalk') || s.inst[target].alts.some((x) => s.inst[x].stub === 'hunters-mark')
		if (noGuard && !chimeraDefends) log(s, `${nameOf(s, target)} can’t be guarded against this attack.`)
		let guard: number | null = null
		if (chimeraDefends) {
			const g = chimeraGuard(s, a, target, noGuard)
			if (g === 'pb') {
				guard = foePb
				s.players[foe].guarded = true
			} else guard = g
		} else if (!noGuard) {
			const opts: ChoiceOption[] = []
			const lethal = attackOf(s, a) >= left(s, target)
			if (!s.players[foe].guarded && !exhausted(s, foePb)) opts.push({ id: 'pb', label: `${nameOf(s, foePb)} guards (takes the damage; once per round)`, uid: foePb, score: lethal && unitValue(s, target) >= 4 ? 2 : -1 })
			for (const u of units(s, foe)) if (u !== target && !exhausted(s, u) && hasKw(s, u, 'unitGuard') && canDefendAgainst(s, u, a)) opts.push({ id: String(u), label: `${nameOf(s, u)} guards`, uid: u, score: lethal ? 3 - unitValue(s, u) / 2 : -1 })
			if (opts.length) {
				const pick = one(c, foe, `${nameOf(s, a)} attacks ${nameOf(s, target)}. Guard it?`, [{ id: 'none', label: 'No guard', score: 0 }, ...opts], 'guard')
				if (pick === 'pb') {
					guard = foePb
					s.players[foe].guarded = true
				} else if (pick && pick !== 'none') guard = Number(pick)
			}
		}
		if (guard !== null) {
			defenders.set(a, guard)
			log(s, `${nameOf(s, guard)} guards ${nameOf(s, target)}.`)
			HOOKS.guardDeclared(c, me, guard)
		}
	}

	// battles, in the order the attackers were declared
	for (const a of attackers) {
		const declared = defenders.get(a)
		if (!inPlay(s, a) || s.inst[a].zone !== 'battlefield' || exhausted(s, a)) {
			if (declared === foePb) s.players[foe].guarded = false
			log(s, `${nameOf(s, a)} can no longer attack — no battle.`)
			continue
		}
		const victim = declared !== undefined && inPlay(s, declared) ? declared : target === 'pb' ? foePb : target
		const mustCounter = declared !== undefined && victim === declared
		if (!inPlay(s, victim)) {
			log(s, `${nameOf(s, a)}’s target is gone; it deals no damage.`)
			s.inst[a].exhaust += 1
			continue
		}
		let counter = false
		if (isUnit(s, victim) && !exhausted(s, victim)) {
			if (mustCounter || chimeraDefends) counter = true
			else {
				const myAtk = attackOf(s, victim)
				const kills = myAtk >= lifeOf(s, a) - s.inst[a].wounds
				const pick = one(
					c,
					foe,
					`Counter with ${nameOf(s, victim)}? It deals ${myAtk} damage back to ${nameOf(s, a)}, then becomes exhausted.`,
					[
						{ id: 'yes', label: `Counter (${myAtk} damage)`, score: myAtk > 0 ? (kills ? 3 : 1) : -1 },
						{ id: 'no', label: 'Don’t counter', score: 0 },
					],
					'counter',
				)
				counter = pick === 'yes'
			}
		}
		const dmgA = attackOf(s, a)
		const dmgD = counter ? attackOf(s, victim) : 0
		log(s, `Battle: ${nameOf(s, a)} (${dmgA}) vs ${nameOf(s, victim)}${counter ? ` (counters for ${dmgD})` : ''}.`)
		const victimIsUnit = isUnit(s, victim)
		const victimStub = s.inst[victim].stub
		dealDamage(c, victim, dmgA, { kind: 'attack', by: me, unpreventable })
		if (counter && dmgD > 0 && inPlay(s, a)) dealDamage({ ...c, owner: foe, rival: me }, a, dmgD, { kind: 'counter', by: foe, unpreventable })
		const gone = checkDestroyed(s, c)
		if (victimIsUnit && gone.includes(victim)) afterFight(c, a, victimStub)
		if (inPlay(s, a) && s.inst[a].zone === 'battlefield') s.inst[a].exhaust += 1
		const alert = def(s, victim).type === 'Aspect' || hasKw(s, victim, 'alert')
		if (counter && !alert && inPlay(s, victim) && s.inst[victim].zone === 'battlefield') s.inst[victim].exhaust += 1
	}
	s.attack = null
	void diceOn
	void charge
}

/** Defender's view of blocking attacker `a` with unit `u`. */
function blockScore(c: Ctx, a: number, u: number, incoming: number): number {
	const s = c.s
	const myLeft = lifeOf(s, u) - s.inst[u].wounds
	const theirLeft = lifeOf(s, a) - s.inst[a].wounds
	const dies = attackOf(s, a) >= myLeft
	const kills = attackOf(s, u) >= theirLeft
	const pbLeftNow = (() => {
		const pb = s.players[c.rival].pb
		return Number(defOf(s.inst[pb].stub).life) - s.inst[pb].wounds
	})()
	// lethal if this attacker alone, or all unblocked attackers together, would finish the Phoenixborn
	const danger = attackOf(s, a) >= pbLeftNow ? 20 : incoming >= pbLeftNow ? 10 + attackOf(s, a) : 0
	let sc = danger
	if (kills && !dies) sc += 6
	else if (kills && dies) sc += unitValue(s, a) - unitValue(s, u) + 1
	else if (!dies) sc += 1.5
	else sc -= unitValue(s, u) - attackOf(s, a) / 2
	return sc
}

export const FLOWS: Record<string, Script> = { setup, prepare, firstPlayer, prepareCards, recovery, recoveryDice, play, ability, dicePower, attack }

export { LEVELS }
