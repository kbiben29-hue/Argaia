// Card abilities for the four Reborn preconstructed decks:
//   Jessa Na Ni — The Bloodwoods Queen (ceremonial + charm)
//   Harold Westraven — The Demons of Darmas (ceremonial + sympathy)
//   Xander Heartsblood — The King of Titans (natural + divine)
//   Hope Everthorn — The Artist of Dreams (illusion + time)
// Same conventions as effects.ts. All help strings are our own wording; no card text is stored here.

import { autoPay } from './dice'
import { cost } from './dice'
import {
	activeDice,
	attach,
	attackOf,
	checkDestroyed,
	checkPhoenixborn,
	conjAvailable,
	controller,
	dealDamage,
	def,
	destroyUnit,
	diceOn,
	discardFromHand,
	drawCards,
	exhausted,
	exhaustedDice,
	findDie,
	focusOf,
	isChimera,
	kwValue,
	chimeraDiscardTop,
	leavePlay,
	lifeOf,
	log,
	moveCard,
	moveDie,
	nameOf,
	pbLeft,
	placeUnit,
	recoverOf,
	units,
	battlefieldSize,
	type Ctx,
	type Destroyed,
	type Script,
} from './engine'
import { one } from './flows'
import { allUnits, changeDice, changeOwnDice, conjure, damageAnyUnit, dieLabel, heal, hitScore, left, lowerDice, mark, pickUnit, raiseOwnDice, summonCheck, touchDice, unitValue } from './helpers'
import { addRedRains } from './solo'
import type { Ability, ReactionPay } from './effects'
import { offerReaction } from './effects'
import { other, type GameState, type Level, type PlayerId } from './types'

// ───────── small helpers ─────────

const has = (s: GameState, p: PlayerId, f: (u: number) => boolean) => units(s, p).some(f)
const allies = (s: GameState, p: PlayerId) => units(s, p).filter((u) => def(s, u).type === 'Ally')
const room = (s: GameState, p: PlayerId) => units(s, p).length < battlefieldSize(s, p)

/** Score for hurting your own unit (Blood decks like that when it destroys a Blood Shaman, etc.). */
function selfHurtScore(s: GameState, u: number, amount: number): number {
	const dies = amount >= left(s, u)
	const st = s.inst[u].stub
	if (st === 'blood-shaman') return dies ? 6 : 1
	if (st === 'blood-puppet') return dies ? 5 : 2
	if (st === 'living-doll') return dies ? -2 : 3 // wounds to move onto a Phoenixborn
	return dies ? -unitValue(s, u) : 1 - amount / Math.max(1, left(s, u))
}

function pickPb(c: Ctx, prompt: string): number {
	const s = c.s
	const opts = [0, 1].map((p) => ({ id: String(s.players[p].pb), label: nameOf(s, s.players[p].pb) + (p === c.owner ? ' (yours)' : ''), uid: s.players[p].pb, score: p === c.owner ? -5 : 5 }))
	return Number(one(c, c.owner, prompt, opts, 'target'))
}

/** Take an unexhausted ally of yours out of play and put it face down under a new mount conjuration. */
function mountUp(c: Ctx, mountStub: string) {
	const s = c.s
	const ally = pickUnit(
		c,
		c.owner,
		`Which unexhausted ally rides the ${def(s, conjAvailable(s, c.owner, mountStub) ?? s.players[c.owner].pb).name}? (It goes face down under it.)`,
		allies(s, c.owner).filter((u) => !exhausted(s, u)),
		(u) => 5 - unitValue(s, u) + s.inst[u].wounds,
	)
	if (ally === null) return
	const mount = conjAvailable(s, c.owner, mountStub)
	if (mount === undefined) return log(s, 'No mount left in the conjuration pile.')
	const name = nameOf(s, ally)
	leavePlay(s, ally, 'discard')
	const pl = s.players[s.inst[ally].owner]
	pl.discard.splice(pl.discard.indexOf(ally), 1)
	s.inst[ally].zone = 'under'
	if (!placeUnit(s, c.owner, mount)) {
		moveCard(s, ally, 'discard')
		return
	}
	s.inst[mount].under = [ally]
	log(s, `${name} mounts up: ${nameOf(s, mount)} comes into play.`)
}

function searchDiscardAlly(c: Ctx, prompt: string) {
	const s = c.s
	const opts = s.players[c.owner].discard.filter((u) => def(s, u).type === 'Ally')
	const pick = one(c, c.owner, prompt, [...new Set(opts.map((u) => s.inst[u].stub))].map((st) => {
		const u = opts.find((x) => s.inst[x].stub === st)!
		return { id: String(u), label: nameOf(s, u), uid: u, score: Number(def(s, u).attack ?? 0) + Number(def(s, u).life ?? 0) }
	}), 'search')
	if (pick === null) return null
	moveCard(s, Number(pick), 'hand')
	log(s, `${s.players[c.owner].name} returns ${nameOf(s, Number(pick))} to hand.`)
	return Number(pick)
}

const yes = (c: Ctx, p: PlayerId, prompt: string, score: number, kind = 'optional') =>
	one(c, p, prompt, [
		{ id: 'no', label: 'No', score: 0 },
		{ id: 'yes', label: 'Yes', score },
	], kind) === 'yes'

// ───────── scripts ─────────

export const PRECON_SCRIPTS: Record<string, Script> = {
	// ── Jessa Na Ni: The Bloodwoods Queen ──
	'blood-archer:ability': (c) => {
		const s = c.s
		const me = c.data.uid as number
		const tgt = pickUnit(c, c.owner, 'Blood Shot: deal 1 damage to which unit?', allUnits(s).filter((u) => u !== me), (u) => hitScore(s, c.owner, u, 1))
		s.inst[me].wounds += 1
		log(s, `${nameOf(s, me)} takes a wound to shoot.`)
		if (tgt !== null) dealDamage(c, tgt, 1)
	},
	'blood-transfer:ability': (c) => {
		const s = c.s
		const u = pickUnit(c, c.owner, 'Blood Transfer: deal 2 damage to which of your units?', units(s, c.owner), (x) => selfHurtScore(s, x, 2))
		if (u === null) return
		if (dealDamage(c, u, 2) === 0) return
		const others = units(s, c.owner).filter((x) => x !== u && s.inst[x].wounds > 0)
		const pb = s.players[c.owner].pb
		const opts = [
			...others.map((x) => ({ id: String(x), label: `Remove 2 wounds from ${nameOf(s, x)}`, uid: x, score: Math.min(2, s.inst[x].wounds) + unitValue(s, x) / 4 })),
			...(s.inst[pb].wounds > 0 ? [{ id: 'pb', label: `Remove 1 wound from ${nameOf(s, pb)}`, uid: pb, score: 1.5 }] : []),
		]
		const pick = one(c, c.owner, 'Blood Transfer: then heal…', [{ id: 'none', label: 'Nothing', score: 0 }, ...opts], 'heal')
		if (pick === 'pb') heal(s, pb, 1)
		else if (pick && pick !== 'none') heal(s, Number(pick), 2)
		checkDestroyed(s, c)
	},
	'cut-the-strings:ability': (c) => {
		const s = c.s
		const u = pickUnit(c, c.owner, 'Cut the Strings: deal 2 damage to which of your units?', units(s, c.owner), (x) => selfHurtScore(s, x, 2))
		if (u === null) return
		if (dealDamage(c, u, 2) === 0) return
		checkDestroyed(s, c)
		const alts = allUnits(s).flatMap((x) => s.inst[x].alts)
		const pick = one(c, c.owner, 'Cut the Strings: discard an alteration spell?', [
			{ id: 'none', label: 'No', score: 0 },
			...alts.map((a) => ({ id: String(a), label: `${nameOf(s, a)} on ${nameOf(s, s.inst[a].host!)}`, uid: a, score: controller(s, a) === c.owner ? -3 : 3 })),
		], 'target')
		if (pick && pick !== 'none') {
			log(s, `${nameOf(s, Number(pick))} is discarded.`)
			leavePlay(s, Number(pick), 'discard')
		}
	},
	'fear:play': (c) => {
		const s = c.s
		const u = pickUnit(c, c.owner, 'Fear: destroy which of your units?', units(s, c.owner), (x) => recoverOf(s, x) * 2 - unitValue(s, x) + (s.inst[x].stub === 'blood-puppet' ? 4 : 0))
		if (u === null) return
		const rec = recoverOf(s, u)
		destroyUnit(c, u)
		if (rec) heal(s, s.players[c.owner].pb, rec)
		const foe = pickUnit(c, c.owner, 'Fear: discard which opposing unit?', units(s, c.rival), (x) => unitValue(s, x))
		if (foe !== null) {
			log(s, `${nameOf(s, foe)} is discarded.`)
			leavePlay(s, foe, 'discard')
		}
	},
	'living-doll:ability': (c) => {
		const s = c.s
		const me = c.data.uid as number
		const pb = pickPb(c, 'Pain Link: move a wound from Living Doll onto which Phoenixborn?')
		s.inst[me].wounds -= 1
		s.inst[pb].wounds += 1
		log(s, `A wound moves from ${nameOf(s, me)} to ${nameOf(s, pb)}.`)
		checkPhoenixborn(s)
	},
	'summon-blood-puppet:ability': (c) => {
		const s = c.s
		const opts = ([c.rival, c.owner] as PlayerId[]).filter((p) => room(s, p)).map((p) => ({ id: String(p), label: p === c.owner ? 'My battlefield' : `${s.players[p].name}’s battlefield`, score: p === c.owner ? 1 : 3 }))
		const pick = one(c, c.owner, 'Put the Blood Puppet onto whose battlefield? (It wounds its controller’s Phoenixborn each round.)', opts, 'target')
		if (pick === null) return
		conjure(c, 'blood-puppet', Number(pick) as PlayerId)
	},
	'blood-puppet:ability': (c) => {
		dealDamage(c, c.data.uid as number, 1)
		checkDestroyed(c.s, c)
	},

	// ── Harold Westraven: The Demons of Darmas ──
	'harold-westraven:ability': (c) => {
		const s = c.s
		const tgt = pickUnit(c, c.owner, 'Mark Prey: attach Hunter’s Mark to which unit?', allUnits(s), (u) => (controller(s, u) === c.owner ? -5 : unitValue(s, u)))
		if (tgt === null) return
		const markCard = Object.values(s.inst).find((x) => x.stub === 'hunters-mark' && x.owner === c.owner)
		if (!markCard) return
		if (markCard.zone === 'attached') leavePlay(s, markCard.uid, 'discard')
		attach(s, markCard.uid, tgt)
		log(s, `Hunter’s Mark is attached to ${nameOf(s, tgt)}.`)
	},
	'adrenaline-rush:play': (c) => {
		const s = c.s
		const u = pickUnit(c, c.owner, 'Adrenaline Rush: which of your units (1 damage, then 1 exhaustion removed)?', units(s, c.owner), (x) => (exhausted(s, x) ? 3 + attackOf(s, x) : 0) - (left(s, x) <= 1 ? 8 : 0))
		if (u === null) return
		dealDamage(c, u, 1)
		checkDestroyed(s, c)
		if (s.inst[u].zone === 'battlefield' && s.inst[u].exhaust > 0) {
			s.inst[u].exhaust -= 1
			log(s, `${nameOf(s, u)} is readied.`)
		}
	},
	'dark-reaping:play': (c) => {
		const s = c.s
		const u = pickUnit(c, c.owner, 'Dark Reaping: destroy which of your units?', units(s, c.owner), (x) => -unitValue(s, x))
		if (u === null) return
		destroyUnit(c, u)
		changeOwnDice(c, 5)
	},
	'drain-vitality:ability': (c) => {
		const s = c.s
		const hit = damageAnyUnit(c, 1, 'Drain Vitality: deal 1 damage to which unit?')
		if (hit === null) return
		checkDestroyed(s, c)
		const wounded = [...allUnits(s), ...[0, 1].map((p) => s.players[p].pb)].filter((u) => s.inst[u].wounds > 0)
		const h = pickUnit(c, c.owner, 'Drain Vitality: remove a wound from which unit?', wounded.filter((u) => s.inst[u].zone === 'battlefield'), (u) => (controller(s, u) === c.owner ? 3 : -3))
		if (h !== null) heal(s, h, 1)
	},
	'drain-vitality:ability#2': (c) => {
		const s = c.s
		const from = pickUnit(c, c.owner, 'Remove a status token from which unit?', allUnits(s).filter((u) => s.inst[u].status > 0), (u) => (controller(s, u) === c.owner ? -2 : 2))
		if (from === null) return
		s.inst[from].status -= 1
		const to = pickUnit(c, c.owner, 'Place a status token on which unit?', allUnits(s), (u) => (controller(s, u) === c.owner ? 2 : -2))
		if (to !== null) s.inst[to].status += 1
		log(s, `A status token moves${to !== null ? ` from ${nameOf(s, from)} to ${nameOf(s, to)}` : ''}.`)
	},
	'summon-vampire-bat-swarm:ability': (c) => void conjure(c, 'vampire-bat-swarm'),
	'transmute-magic:play': (c) => {
		const s = c.s
		for (let k = 0; k < 10; k++) {
			const ex = exhaustedDice(s, c.owner)
			const act = activeDice(s, c.owner)
			if (ex.length === 0 || act.length === 0) break
			const pick = one(c, c.owner, 'Transmute Magic: swap a die from your exhausted pool into your active pool?', [
				{ id: 'done', label: 'Done swapping', score: 0.5 },
				...ex.map((d) => ({ id: d.id, label: `Exhausted ${d.magic} die`, dieId: d.id, score: 2 })),
			], 'transmute')
			if (!pick || pick === 'done') break
			const out = one(c, c.owner, 'Which active die goes to your exhausted pool in its place?', act.map((d) => ({ id: d.id, label: dieLabel(d), dieId: d.id, score: d.level === 'basic' ? 3 : d.level === 'class' ? 1 : -1 })), 'transmute')
			const lv = one(c, c.owner, 'Put the new die on which side?', (['power', 'class', 'basic'] as Level[]).map((l) => ({ id: l, label: l, score: l === 'power' ? 3 : l === 'class' ? 2 : 0 })), 'dieSide') as Level
			const din = findDie(s, pick)!
			moveDie(findDie(s, out!)!, 'exhausted')
			moveDie(din, 'active')
			din.level = lv
			log(s, `${s.players[c.owner].name} swaps a die: a ${din.magic} die comes in on ${lv}.`)
		}
		changeDice(c, 1, c.owner)
		changeDice(c, 1, c.rival)
	},

	// ── Xander Heartsblood: The King of Titans ──
	'xander-heartsblood:ability': (c) => void searchDiscardAlly(c, 'Reincarnate: return which ally from your discard pile to your hand?'),
	'earthquake:play': (c) => {
		const s = c.s
		const main = pickUnit(c, c.owner, 'Earthquake: deal 4 damage to which unit? (Every other unit takes 1.)', allUnits(s), (u) => hitScore(s, c.owner, u, 4))
		if (main === null) return
		dealDamage(c, main, 4)
		for (const u of allUnits(s)) if (u !== main) dealDamage(c, u, 1)
		checkDestroyed(s, c)
	},
	'law-of-domination:enter': (c) => {
		const s = c.s
		if (!units(s, c.rival).length || !units(s, c.owner).length) return log(s, 'Law of Domination: both players need a unit, so nothing happens.')
		const theirs = pickUnit(c, c.rival, 'Law of Domination: choose one of your units to fight (unpreventable damage both ways).', units(s, c.rival), (u) => -unitValue(s, u) + attackOf(s, u))
		const mine = pickUnit(c, c.owner, `Law of Domination: which of your units fights ${theirs === null ? 'it' : nameOf(s, theirs)}?`, units(s, c.owner), (u) => attackOf(s, u) * 2 + left(s, u) - (theirs !== null && attackOf(s, theirs) >= left(s, u) ? unitValue(s, u) : 0))
		if (theirs === null || mine === null) return
		const a = attackOf(s, mine)
		const b = attackOf(s, theirs)
		log(s, `${nameOf(s, mine)} (${a}) and ${nameOf(s, theirs)} (${b}) deal damage to each other.`)
		dealDamage(c, theirs, a, { unpreventable: true })
		dealDamage({ ...c, owner: c.rival, rival: c.owner }, mine, b, { unpreventable: true, by: c.rival })
		checkDestroyed(s, c)
	},
	'mass-heal:play': (c) => {
		const s = c.s
		const divine = activeDice(s, c.owner).some((d) => d.magic === 'divine' && d.level !== 'basic')
		let mineOnly = false
		if (divine) mineOnly = one(c, c.owner, 'Mass Heal: which version?', [
			{ id: 'all', label: 'Remove 1 wound from every unit', score: 1 },
			{ id: 'mine', label: 'Remove 1 wound from your Phoenixborn and each of your units', score: 2 },
		], 'mode') === 'mine'
		const list = mineOnly ? [s.players[c.owner].pb, ...units(s, c.owner)] : allUnits(s)
		for (const u of list) heal(s, u, 1)
		log(s, 'Mass Heal resolves.')
	},
	'natures-wrath:play': (c) => {
		for (const u of allUnits(c.s)) dealDamage(c, u, 1)
		checkDestroyed(c.s, c)
	},
	'pain-shaman:enter': (c) => {
		const s = c.s
		const list = allUnits(s)
		const pick = one(c, c.owner, 'Exchange Pain: deal 1 damage to a unit?', [{ id: 'none', label: 'No', score: 0 }, ...list.map((u) => ({ id: String(u), label: `${nameOf(s, u)}${controller(s, u) === c.owner ? '' : ' (opponent)'}`, uid: u, score: hitScore(s, c.owner, u, 1) }))], 'target')
		if (!pick || pick === 'none') return
		dealDamage(c, Number(pick), 1)
		checkDestroyed(s, c)
		const wounded = [...allUnits(s), s.players[0].pb, s.players[1].pb].filter((u) => s.inst[u].wounds > 0)
		const h = one(c, c.owner, 'Exchange Pain: then remove a wound from…', wounded.map((u) => ({ id: String(u), label: nameOf(s, u), uid: u, score: controller(s, u) === c.owner ? 3 : -3 })), 'heal')
		if (h !== null) heal(s, Number(h), 1)
	},
	'raptor-herder:enter': (c) => void conjure(c, 'raptor-hatchling'),
	'sacred-ground:ability': (c) => {
		const s = c.s
		for (const u of units(s, c.owner)) s.marks.push({ kind: 'kw', kw: 'armored', amount: 1, uid: u, player: c.owner, until: 'next' })
		log(s, `${s.players[c.owner].name}’s units gain Armored 1 until their next turn.`)
	},
	'summon-archasaurus-mount:play': (c) => mountUp(c, 'archasaurus-mount'),
	'summon-cerasaurus-mount:ability': (c) => mountUp(c, 'cerasaurus-mount'),
	'summon-shining-hydra:play': (c) => void conjure(c, 'shining-hydra'),
	'shining-hydra:ability': (c) => {
		const s = c.s
		const me = c.data.uid as number
		const head = conjAvailable(s, c.owner, 'shining-hydra-head')
		if (head === undefined) return
		s.inst[me].wounds -= 1
		attach(s, head, me)
		log(s, 'The Shining Hydra grows a new head (+1 attack, Terrifying 1).')
	},

	// ── Hope Everthorn: The Artist of Dreams ──
	'hope-everthorn:ability': (c) => {
		const s = c.s
		const opts = units(s, c.owner).filter((u) => def(s, u).type === 'Conjuration' && lifeOf(s, u) === 1 && conjAvailable(s, c.owner, s.inst[u].stub) !== undefined)
		const u = pickUnit(c, c.owner, 'Duplicate: copy which conjuration (it’s destroyed at the end of this turn)?', opts, (x) => attackOf(s, x) + 1)
		if (u === null) return
		const copy = conjure(c, s.inst[u].stub)
		if (copy !== null) s.marks.push({ kind: 'doom', uid: copy, until: 'turn' })
	},
	'dream-fracture:ability': (c) => {
		const s = c.s
		lowerDice(c, c.rival, 1)
		if (!activeDice(s, c.rival).some((d) => d.level === 'power')) {
			log(s, `${s.players[c.rival].name} has no power dice left: Dream Fracture hits their Phoenixborn.`)
			dealDamage(c, s.players[c.rival].pb, 1)
		}
	},
	'dreamlock-mage:ability': (c) => void lowerDice(c, c.rival, 1, c.owner, false, true),
	'keepsake:ability': (c) => {
		const s = c.s
		const me = c.data.uid as number
		const n = s.inst[me].status
		leavePlay(s, me, 'discard')
		log(s, `Keepsake is discarded to deal ${n} damage.`)
		damageAnyUnit(c, n, `Keepsake: deal ${n} damage to which unit?`)
		checkDestroyed(s, c)
	},
	'summon-fox-spirit:ability': (c) => void conjure(c, 'fox-spirit'),
	'summon-fox-spirit:ability#2': (c) => void conjure(c, 'fox-spirit'),
	'summon-wishing-wing:ability': (c) => {
		const u = conjure(c, 'wishing-wing')
		if (u !== null && focusOf(c.s, c.data.uid as number) >= 2) {
			c.s.inst[u].status += 1
			log(c.s, 'Focus 2: the Wishing Wing gets a status token.')
		}
	},
	'fox-spirit:enter': (c) => {
		const s = c.s
		const pool = activeDice(s, c.owner).filter((d) => d.level !== 'power')
		if (!pool.length) return
		if (yes(c, c.owner, 'Keen: raise a die in your active pool one level?', 2)) raiseOwnDice(c, 1)
	},
	'wishing-wing:enter': (c) => {
		const s = c.s
		if (activeDice(s, c.owner).some((d) => d.magic === 'time' && d.level === 'power')) {
			s.inst[c.data.uid as number].status += 1
			log(s, 'Opportunist: the Wishing Wing gets a status token.')
		}
	},
}

// ───────── activated abilities ─────────

export const PRECON_ABILITIES: Record<string, Ability> = {
	'blood-archer': { label: 'Blood Shot', cost: cost('side'), help: 'Put a wound on this unit to deal 1 damage to another unit' },
	'blood-transfer': {
		label: 'Blood Transfer',
		cost: cost('side', 'exhaust', 'charm:class', 'ceremonial:class'),
		help: '2 damage to your unit; then heal 2 from another of your units or 1 from your Phoenixborn',
		check: (s, p) => (units(s, p).length ? null : 'You need a unit'),
	},
	'cut-the-strings': {
		label: 'Cut the Strings',
		cost: cost('main', 'exhaust', 'ceremonial:class', 'basic'),
		help: '2 damage to your unit, then you may discard an alteration spell',
		check: (s, p) => (units(s, p).length ? null : 'You need a unit'),
	},
	'living-doll': { label: 'Pain Link', cost: cost('side'), help: 'Move a wound from this unit onto a Phoenixborn', check: (s, _p, u) => (s.inst[u].wounds > 0 ? null : 'It has no wounds to move') },
	'summon-blood-puppet': {
		label: 'Summon Blood Puppet',
		cost: cost('main', 'exhaust', 'ceremonial:class'),
		help: 'Put a Blood Puppet onto either battlefield (it wounds its controller every round)',
		check: (s, p) => (conjAvailable(s, p, 'blood-puppet') === undefined ? 'None left in your conjuration pile' : room(s, 0) || room(s, 1) ? null : 'Both battlefields are full'),
	},
	'blood-puppet': { label: 'Self Inflict', cost: cost('side', 'basic'), help: 'Deal 1 damage to this Blood Puppet' },
	'harold-westraven': { label: 'Mark Prey', cost: cost('side', 'exhaust'), help: 'Attach Hunter’s Mark to a unit: double wounds, and attacks on it can’t be guarded', check: (s) => (allUnits(s).length ? null : 'There’s no unit to mark') },
	'drain-vitality': { label: 'Drain', cost: cost('main', 'exhaust', 'ceremonial:class'), help: '1 damage to a unit, then remove a wound from a unit', check: (s) => (allUnits(s).length ? null : 'There’s no unit') },
	'drain-vitality#2': {
		label: 'Shift Status',
		cost: cost('side', 'exhaust', 'sympathy:class'),
		help: 'Move a status token from one unit to another',
		check: (s) => (allUnits(s).some((u) => s.inst[u].status > 0) ? null : 'No unit has a status token'),
	},
	'summon-vampire-bat-swarm': { label: 'Summon Vampire Bat Swarm', cost: cost('main', 'exhaust', 'ceremonial:class', 'sympathy:class'), help: 'Put a Vampire Bat Swarm onto your battlefield', check: summonCheck('vampire-bat-swarm') },
	'xander-heartsblood': {
		label: 'Reincarnate',
		cost: cost('side', 'exhaust', 'divine:class'),
		help: 'Return an ally from your discard pile to your hand',
		check: (s, p) => (s.players[p].discard.some((u) => def(s, u).type === 'Ally') ? null : 'No ally in your discard pile'),
	},
	'sacred-ground': { label: 'Sacred Ground', cost: cost('side', 'exhaust'), help: 'Your units gain Armored 1 (prevent 1 damage each time) until your next turn', check: (s, p) => (units(s, p).length ? null : 'You have no units') },
	'summon-cerasaurus-mount': {
		label: 'Summon Cerasaurus Mount',
		cost: cost('side', 'exhaust', 'natural:class', 'divine:class'),
		help: 'Swap a ready ally of yours for a Cerasaurus Mount (the ally rides underneath)',
		check: (s, p) => (conjAvailable(s, p, 'cerasaurus-mount') === undefined ? 'None left in your conjuration pile' : allies(s, p).some((u) => !exhausted(s, u)) ? null : 'You need an unexhausted ally'),
	},
	'shining-hydra': {
		label: 'Regenerate Heads',
		cost: cost('side'),
		help: 'Remove a wound from the Hydra to attach a Shining Hydra Head (+1 attack, Terrifying 1)',
		check: (s, p, u) => (s.inst[u].wounds === 0 ? 'The Hydra needs a wound to regrow' : conjAvailable(s, p, 'shining-hydra-head') === undefined ? 'No heads left' : null),
	},
	'hope-everthorn': {
		label: 'Duplicate',
		cost: cost('side', 'exhaust', 'basic'),
		help: 'Copy a life-1 conjuration of yours until the end of the turn',
		check: (s, p) => (units(s, p).some((u) => def(s, u).type === 'Conjuration' && lifeOf(s, u) === 1 && conjAvailable(s, p, s.inst[u].stub) !== undefined) ? (room(s, p) ? null : 'Your battlefield is full') : 'You need a life-1 conjuration with a copy left in your pile'),
	},
	'dream-fracture': { label: 'Dream Fracture', cost: cost('main', 'exhaust'), help: 'Lower an opposing die; 1 damage to their Phoenixborn if they have no power dice left', check: (s, p) => (activeDice(s, other(p)).length ? null : 'Your opponent has no active dice') },
	'dreamlock-mage': { label: 'Restrict', cost: cost('side'), help: 'Lower a power die in your opponent’s active pool', check: (s, p) => (activeDice(s, other(p)).some((d) => d.level === 'power') ? null : 'Your opponent has no power dice') },
	keepsake: { label: 'Keepsake', cost: cost('main', 'illusion:class'), help: 'Discard it to deal damage to a unit equal to its status tokens', check: (s, _p, u) => (s.inst[u].status === 0 ? 'It has no status tokens yet' : allUnits(s).length ? null : 'There’s no unit') },
	'summon-fox-spirit': { label: 'Summon Fox Spirit', cost: cost('main', 'exhaust', 'illusion:class'), help: 'Put a Fox Spirit onto your battlefield', check: summonCheck('fox-spirit') },
	'summon-fox-spirit#2': {
		label: 'Summon Fox Spirit (side)',
		cost: cost('side', 'exhaust', 'illusion:class'),
		help: 'Focus 1: summon a Fox Spirit as a side action',
		check: (s, p, u) => (focusOf(s, u) < 1 ? 'Needs a second copy stacked with it (Focus 1)' : summonCheck('fox-spirit')(s, p)),
	},
	'summon-wishing-wing': { label: 'Summon Wishing Wing', cost: cost('main', 'exhaust', 'time:class'), help: 'Put a Wishing Wing onto your battlefield (Focus 2: with a status token)', check: summonCheck('wishing-wing') },
}

export const PRECON_KEYWORDS: Record<string, string[]> = {
	'beast-mage': ['terrifying:1', 'transform:2'],
	'beast-warrior': ['groupTactics:1', 'transform:1'],
	'master-vampire': ['stalk', 'lifeDrain:1'],
	'vampire-bat-swarm': ['groupTactics:1'],
	'archasaurus-mount': ['gigantic:2'],
	'cerasaurus-mount': ['overkill:1'],
	'raptor-hatchling': ['groupTactics:2'],
	'shining-hydra-head': ['terrifying:1'],
	'undying-heart': ['undying'],
}

const own = (s: GameState, p: PlayerId) => (units(s, p).length ? null : 'You need a unit of your own')
export const PRECON_CHECKS: Record<string, (s: GameState, p: PlayerId, uid: number) => string | null> = {
	fear: own,
	'adrenaline-rush': own,
	'dark-reaping': own,
	earthquake: (s) => (allUnits(s).length ? null : 'There’s no unit to hit'),
	'summon-archasaurus-mount': (s, p) => (conjAvailable(s, p, 'archasaurus-mount') === undefined ? 'None left in your conjuration pile' : allies(s, p).some((u) => !exhausted(s, u)) ? null : 'You need an unexhausted ally'),
	'summon-shining-hydra': (s, p) => summonCheck('shining-hydra')(s, p),
}

// ───────── attacks ─────────

/** "When declared as an attacker" effects and Group Tactics. */
export function attackTriggers(c: Ctx, attackers: number[], target: 'pb' | number) {
	const s = c.s
	const foe = c.rival
	for (const a of attackers) {
		const st = s.inst[a].stub
		if (st === 'realm-walker') {
			const opts = units(s, foe).filter((u) => !exhausted(s, u))
			const u = pickUnit(c, foe, 'Isolate: exhaust one of your unexhausted units (your choice).', opts, (x) => -unitValue(s, x) - (attackers.length && target === x ? 0 : 0))
			if (u !== null) {
				s.inst[u].exhaust += 1
				log(s, `Isolate: ${nameOf(s, u)} is exhausted.`)
			}
		}
		if (st === 'fox-spirit' && target !== 'pb' && exhausted(s, target)) {
			mark(s, a, 2)
			log(s, 'Pounce: Fox Spirit gets +2 attack against an exhausted unit.')
		}
		if (st === 'firebelly') {
			log(s, 'Firebelly breathes fire: 1 damage to each of your units and your Phoenixborn.')
			for (const u of units(s, foe)) dealDamage(c, u, 1)
			dealDamage(c, s.players[foe].pb, 1)
		}
	}
	if (attackers.length >= 3)
		for (const a of attackers) {
			const n = kwValue(s, a, 'groupTactics')
			if (n) {
				mark(s, a, n)
				log(s, `Group Tactics: ${nameOf(s, a)} gets +${n} attack.`)
			}
		}
	checkDestroyed(s, c)
}

/** After attacker `a` destroyed `victim` in a fight (Life Drain, Overkill, Hunting Instincts, Frozen Fear). */
export function afterFight(c: Ctx, a: number, victimStub: string) {
	const s = c.s
	const st = s.inst[a].stub
	void victimStub
	const drain = kwValue(s, a, 'lifeDrain')
	const pb = s.players[c.owner].pb
	if (drain && s.inst[pb].wounds > 0) {
		heal(s, pb, drain)
		log(s, 'Life Drain.')
	}
	const over = kwValue(s, a, 'overkill')
	if (over) {
		log(s, `Overkill: ${nameOf(s, a)} deals ${over} damage to ${nameOf(s, s.players[c.rival].pb)}.`)
		dealDamage(c, s.players[c.rival].pb, over, { kind: 'attack' })
	}
	if (st === 'hunting-instincts') addRedRains(c, 1, 'Hunting Instincts')
	if (st === 'frozen-fear') {
		s.inst[s.players[c.rival].pb].exhaust += 1
		log(s, `Frozen Fear: ${nameOf(s, s.players[c.rival].pb)} is exhausted.`)
	}
}

/** Is a Law of Domination in play (attack and counter damage can't be prevented)? */
export const lawInPlay = (s: GameState) => s.players.some((p) => p.spellboard.flat().some((u) => s.inst[u].stub === 'law-of-domination'))

// ───────── end of round ─────────

/** Cursed (Blood Puppet) and Fleeting (Law of Domination). */
export function endOfRound(c: Ctx) {
	const s = c.s
	for (const p of [0, 1] as PlayerId[]) {
		for (const u of units(s, p).slice())
			if (s.inst[u].stub === 'blood-puppet') {
				const pb = s.players[p].pb
				s.inst[pb].wounds += 1
				log(s, `Cursed: the Blood Puppet puts a wound on ${nameOf(s, pb)}.`)
			}
		for (const u of s.players[p].spellboard.flat())
			if (s.inst[u].stub === 'law-of-domination') {
				log(s, 'Law of Domination fades (Fleeting).')
				leavePlay(s, u, 'discard')
			}
	}
	checkPhoenixborn(s)
}

// ───────── destroyed ─────────

/** Every "when destroyed" effect and destroyed-trigger reaction, in a fixed order. */
export function destroyedTriggers(c: Ctx, list: Destroyed[]) {
	const s = c.s
	for (const d of list) {
		const ctl = d.ctl
		const cc: Ctx = { ...c, owner: ctl, rival: other(ctl) }
		const human = !isChimera(s, ctl)
		// the unit's own effects
		if (d.stub === 'blood-shaman' && d.by === ctl && d.kind === 'effect' && human) {
			if (yes(cc, ctl, 'Blood Ritual: remove a wound from your Phoenixborn and raise a die one level?', 3)) {
				heal(s, s.players[ctl].pb, 1)
				raiseOwnDice(cc, 1)
			}
		}
		if (d.stub === 'psychic-vampire' && d.by !== undefined && d.by !== ctl) {
			const victim = d.by
			log(s, `Lobotomize: ${s.players[victim].name} must discard a card.`)
			if (isChimera(s, victim)) chimeraDiscardTop(s)
			else {
				const hand = s.players[victim].hand
				const pick = one({ ...c, owner: victim, rival: other(victim) }, victim, 'Lobotomize: discard a card of your choice from your hand.', hand.map((u) => ({ id: String(u), label: nameOf(s, u), uid: u, score: -1 })), 'discard')
				if (pick) discardFromHand(s, Number(pick))
			}
		}
		if (d.stub === 'vampire-bat-swarm' && human && conjAvailable(s, ctl, 'vampire-bat-swarm') !== undefined && room(s, ctl)) {
			const pay = autoPay(activeDice(s, ctl), [{ any: ['ceremonial', 'sympathy'], level: 'class' }])
			if (pay && yes(cc, ctl, 'Swarm: spend a ceremonial or sympathy class die to bring the Vampire Bat Swarm back?', 2)) {
				moveDie(pay[0], 'exhausted')
				const u = conjAvailable(s, ctl, 'vampire-bat-swarm')!
				placeUnit(s, ctl, u)
				log(s, 'The Vampire Bat Swarm returns.')
			}
		}
		if (d.stub === 'wishing-wing' && d.status > 0 && human) {
			const opts = Array.from({ length: d.status + 1 }, (_, k) => ({ id: String(k), label: k === 0 ? 'Draw nothing' : `Draw ${k}`, score: k }))
			const n = Number(one(cc, ctl, `Bequest: draw up to ${d.status} card${d.status > 1 ? 's' : ''}.`, opts, 'draw') ?? 0)
			if (n) log(s, `Bequest: ${s.players[ctl].name} draws ${drawCards(s, ctl, n)}.`)
		}
		if (d.under.length) {
			for (const al of d.under)
				if (s.inst[al].zone === 'discard') {
					moveCard(s, al, 'hand')
					log(s, `Dismount: ${nameOf(s, al)} returns to ${s.players[s.inst[al].owner].name}’s hand.`)
				}
		}
		if (d.alts.some((a) => a.stub === 'undying-heart') && d.type === 'Ally' && s.inst[d.uid].zone === 'discard' && human) {
			if (yes(cc, ctl, `Undying: return ${def(s, d.uid).name} to its owner’s hand?`, 4)) {
				moveCard(s, d.uid, 'hand')
				log(s, `${def(s, d.uid).name} returns to hand (Undying).`)
			}
		}
		// Chant of Transfusion: a status token when an ally of yours is destroyed
		if (d.type === 'Ally')
			for (const u of s.players[ctl].spellboard.flat())
				if (s.inst[u].stub === 'chant-of-transfusion' && s.inst[u].status === 0) s.inst[u].status = 1

		// Jessa: Screams of the Departed (once per turn)
		for (const p of [0, 1] as PlayerId[]) {
			const pl = s.players[p]
			if (s.inst[pl.pb].stub !== 'jessa-na-ni' || (pl.once ?? []).includes('screams') || s.inst[pl.pb].exhaust > 0) continue
			const pay = autoPay(activeDice(s, p), [{ level: 'basic' }])
			if (!pay) continue
			const pc: Ctx = { ...c, owner: p, rival: other(p) }
			if (!yes(pc, p, `${def(s, d.uid).name} was destroyed. Screams of the Departed: spend 1 basic to deal 1 damage to a Phoenixborn?`, pbLeft(s, other(p)) <= 1 ? 9 : 1.5, 'reaction')) continue
			moveDie(pay[0], 'exhausted')
			pl.once = [...(pl.once ?? []), 'screams']
			log(s, 'Screams of the Departed!')
			dealDamage(pc, s.players[other(p)].pb, 1)
		}

		// reactions
		if (human) {
			const r: ReactionPay | null = offerReaction(cc, ctl, 'final-cry', `${def(s, d.uid).name} was destroyed. Play Final Cry to deal 2 damage to the opposing Phoenixborn?`, 3)
			if (r) dealDamage(cc, s.players[other(ctl)].pb, 2)
		}
		const foe = other(ctl)
		if (d.kind === 'attack' && d.by === foe && !isChimera(s, foe)) {
			const fc: Ctx = { ...c, owner: foe, rival: ctl }
			const pb = s.players[foe].pb
			if (offerReaction(fc, foe, 'consume-soul', `You destroyed ${def(s, d.uid).name} with an attack. Play Consume Soul (remove 2 wounds and 1 exhaustion from your Phoenixborn)?`, s.inst[pb].wounds >= 2 || s.inst[pb].exhaust ? 3 : s.inst[pb].wounds ? 1 : -1)) {
				heal(s, pb, 2)
				if (s.inst[pb].exhaust) s.inst[pb].exhaust -= 1
			}
		}
		if (d.type === 'Conjuration' && d.printedLife === 1 && d.by === foe && human && conjAvailable(s, ctl, d.stub) !== undefined) {
			if (offerReaction(cc, ctl, 'double-down', `${def(s, d.uid).name} was destroyed by your opponent. Play Double Down to put 2 copies onto your battlefield?`, 4)) {
				conjure(cc, d.stub)
				conjure(cc, d.stub)
			}
		}
	}
	checkDestroyed(s, c)
	void touchDice
	void changeOwnDice
}
