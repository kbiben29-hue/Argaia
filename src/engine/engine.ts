// Ashes rules engine: game state helpers, intents and the task runner.
//
// Every multi-step piece of the game (setup, the prepare and recovery phases, attacks, card
// effects) is a Task script (flows.ts, effects.ts). A script asks players questions with `c.ask()`.
// If a question has no recorded answer yet the run is thrown away (nothing it did is kept), the
// state's `pending` becomes that question, and once the player answers the task re-runs from the
// start with the recorded answers. The engine is deterministic (seeded RNG), so re-runs replay
// exactly.

import { autoPay, parseCost, paysExactly, type Cost } from './dice'
import { Rng } from './rng'
import { script, ABILITIES, HOOKS, KEYWORDS, PLAY_CHECKS } from './scripts'
import { STARTER_CARDS } from '../data/starterCards'
import { DECKS } from '../data/decks'
import {
	other,
	type CardDef,
	type DeckList,
	type Die,
	type GameState,
	type Inst,
	type Intent,
	type Level,
	type PlayerId,
	type PlayerState,
	type Question,
	type Task,
} from './types'

// ───────── card data ─────────

export const CARDS: Record<string, CardDef> = { ...STARTER_CARDS }

export const inst = (s: GameState, uid: number): Inst => s.inst[uid]
export const defOf = (stub: string): CardDef => CARDS[stub] ?? { stub, name: stub, type: '?' }
export const def = (s: GameState, uid: number): CardDef => defOf(s.inst[uid].stub)
export const nameOf = (s: GameState, uid: number) => def(s, uid).name
export const num = (v: number | string | undefined): number => (typeof v === 'number' ? v : Number(String(v ?? '0').replace('+', '')) || 0)
export const isUnitType = (t: string) => t === 'Ally' || t === 'Conjuration'
export const isUnit = (s: GameState, uid: number) => isUnitType(def(s, uid).type)
export const hasKw = (s: GameState, uid: number, kw: string) => (KEYWORDS[s.inst[uid].stub] ?? []).includes(kw)

// ───────── queries ─────────

export function controller(s: GameState, uid: number): PlayerId {
	const c = s.inst[uid]
	if (c.zone === 'attached' && c.host !== undefined) return controller(s, c.host)
	return c.owner
}

export const exhausted = (s: GameState, uid: number) => s.inst[uid].exhaust > 0
export const inPlay = (s: GameState, uid: number) => ['battlefield', 'spellboard', 'pb', 'attached'].includes(s.inst[uid]?.zone)

export const diceOn = (s: GameState, uid: number): Die[] => s.players.flatMap((p) => p.dice.filter((d) => d.loc === 'card' && d.on === uid))
export const astralOn = (s: GameState, uid: number) => diceOn(s, uid).find((d) => d.magic === 'astral')
/** "Charged": a card with an artifice die on it (once per die). */
export const charge = (s: GameState, uid: number) => diceOn(s, uid).filter((d) => d.magic === 'artifice').length
export const pbHasAstral = (s: GameState, p: PlayerId) => !!astralOn(s, s.players[p].pb)

export const activeDice = (s: GameState, p: PlayerId) => s.players[p].dice.filter((d) => d.loc === 'active')
export const exhaustedDice = (s: GameState, p: PlayerId) => s.players[p].dice.filter((d) => d.loc === 'exhausted')
export const findDie = (s: GameState, id: string): Die | undefined => s.players[0].dice.find((d) => d.id === id) ?? s.players[1].dice.find((d) => d.id === id)

export const units = (s: GameState, p: PlayerId) => s.players[p].battlefield
export const spells = (s: GameState, p: PlayerId) => s.players[p].spellboard.flat()
/** Phoenixborn, units, ready spells and attached alterations a player controls. */
export function cardsInPlay(s: GameState, p: PlayerId): number[] {
	const pl = s.players[p]
	const alts = s.players.flatMap((q) => q.battlefield).filter((u) => controller(s, u) === p).flatMap((u) => s.inst[u].alts)
	return [pl.pb, ...pl.battlefield, ...pl.spellboard.flat(), ...alts]
}

export function attackOf(s: GameState, uid: number): number {
	const c = s.inst[uid]
	let a = num(def(s, uid).attack)
	for (const alt of c.alts) a += num(def(s, alt).attack)
	for (const m of s.marks) if (m.kind === 'attack' && m.uid === uid) a += m.amount ?? 0
	return Math.max(0, a)
}
export function lifeOf(s: GameState, uid: number): number {
	const c = s.inst[uid]
	let l = num(def(s, uid).life)
	for (const alt of c.alts) l += num(def(s, alt).life)
	return Math.max(0, l)
}
export function recoverOf(s: GameState, uid: number): number {
	const c = s.inst[uid]
	let r = num(def(s, uid).recover)
	for (const alt of c.alts) r += num(def(s, alt).recover)
	return Math.max(0, r)
}
export const battlefieldSize = (s: GameState, p: PlayerId) => num(def(s, s.players[p].pb).battlefield)
export const spellboardSize = (s: GameState, p: PlayerId) => num(def(s, s.players[p].pb).spellboard)
export const pbLife = (s: GameState, p: PlayerId) => num(def(s, s.players[p].pb).life)
export const pbLeft = (s: GameState, p: PlayerId) => pbLife(s, p) - s.inst[s.players[p].pb].wounds

/** Who has to do something now (null when the game is over). */
export function actor(s: GameState): PlayerId | null {
	return s.pending.kind === 'over' ? null : s.pending.player
}

export function playCost(s: GameState, uid: number): Cost {
	return parseCost(def(s, uid).cost)
}

/** Can this unit attack at all right now (ignoring whose turn it is)? */
export function canAttackWith(s: GameState, uid: number): boolean {
	if (!isUnit(s, uid) || s.inst[uid].zone !== 'battlefield' || exhausted(s, uid)) return false
	if (hasKw(s, uid, 'dormant') && charge(s, uid) === 0) return false
	return true
}

// ───────── state changes used by flows and card scripts ─────────

export function log(s: GameState, line: string) {
	s.log.push(line)
	if (s.log.length > 400) s.log.splice(0, s.log.length - 400)
}

export function drawCards(s: GameState, p: PlayerId, n: number): number {
	const pl = s.players[p]
	let k = 0
	for (; k < n && pl.deck.length > 0; k++) {
		const uid = pl.deck.shift()!
		pl.hand.push(uid)
		s.inst[uid].zone = 'hand'
	}
	return k
}

export function moveDie(d: Die, loc: Die['loc'], on?: number) {
	d.loc = loc
	d.on = loc === 'card' ? on : undefined
}

function resetCard(c: Inst) {
	c.wounds = 0
	c.exhaust = 0
	c.status = 0
	c.alts = []
	c.host = undefined
}

const removeFrom = (arr: number[], uid: number) => {
	const i = arr.indexOf(uid)
	if (i >= 0) arr.splice(i, 1)
}

/** Put a card where it goes when it leaves play: conjurations back to the pile, others to discard or hand. */
function sendTo(s: GameState, uid: number, dest: 'discard' | 'hand' | 'deckTop') {
	const c = s.inst[uid]
	const pl = s.players[c.owner]
	const t = def(s, uid).type
	resetCard(c)
	if (t === 'Conjuration' || t === 'Conjured Alteration Spell') {
		c.zone = 'conj'
		pl.conj.push(uid)
	} else if (dest === 'hand') {
		c.zone = 'hand'
		pl.hand.push(uid)
	} else if (dest === 'deckTop') {
		c.zone = 'deck'
		pl.deck.unshift(uid)
	} else {
		c.zone = 'discard'
		pl.discard.push(uid)
	}
}

/** Remove a card from play (unit, ready spell or alteration), with its dice and attachments. */
export function leavePlay(s: GameState, uid: number, dest: 'discard' | 'hand' = 'discard') {
	const c = s.inst[uid]
	for (const d of diceOn(s, uid)) moveDie(d, 'exhausted')
	for (const alt of c.alts.slice()) {
		for (const d of diceOn(s, alt)) moveDie(d, 'exhausted')
		sendTo(s, alt, dest)
	}
	c.alts = []
	if (c.zone === 'battlefield') removeFrom(s.players[c.owner].battlefield, uid)
	else if (c.zone === 'spellboard') {
		const pl = s.players[c.owner]
		for (const st of pl.spellboard) removeFrom(st, uid)
		pl.spellboard = pl.spellboard.filter((st) => st.length > 0)
	} else if (c.zone === 'attached' && c.host !== undefined) removeFrom(s.inst[c.host].alts, uid)
	s.marks = s.marks.filter((m) => m.uid !== uid)
	sendTo(s, uid, dest)
}

export function discardFromHand(s: GameState, uid: number) {
	const c = s.inst[uid]
	removeFrom(s.players[c.owner].hand, uid)
	c.zone = 'discard'
	s.players[c.owner].discard.push(uid)
}

/** Place a unit on its controller's battlefield (a full battlefield discards it). Returns false if it didn't fit. */
export function placeUnit(s: GameState, p: PlayerId, uid: number): boolean {
	const pl = s.players[p]
	const c = s.inst[uid]
	removeFrom(pl.hand, uid)
	removeFrom(pl.conj, uid)
	if (pl.battlefield.length >= battlefieldSize(s, p)) {
		log(s, `${pl.name}'s battlefield is full — ${nameOf(s, uid)} is discarded.`)
		sendTo(s, uid, 'discard')
		return false
	}
	resetCard(c)
	c.zone = 'battlefield'
	pl.battlefield.push(uid)
	return true
}

export function placeReadySpell(s: GameState, p: PlayerId, uid: number) {
	const pl = s.players[p]
	const c = s.inst[uid]
	removeFrom(pl.hand, uid)
	resetCard(c)
	c.zone = 'spellboard'
	const stack = pl.spellboard.find((st) => s.inst[st[0]].stub === c.stub)
	if (stack) stack.push(uid)
	else pl.spellboard.push([uid])
}

export function attach(s: GameState, alt: number, host: number) {
	const c = s.inst[alt]
	removeFrom(s.players[c.owner].hand, alt)
	removeFrom(s.players[c.owner].conj, alt)
	resetCard(c)
	c.zone = 'attached'
	c.host = host
	s.inst[host].alts.push(alt)
}

export const conjAvailable = (s: GameState, p: PlayerId, stub: string) => s.players[p].conj.find((u) => s.inst[u].stub === stub)

export function lower(d: Die) {
	d.level = d.level === 'power' ? 'class' : 'basic'
}
export function raise(d: Die) {
	d.level = d.level === 'basic' ? 'class' : 'power'
}

// ───────── tasks ─────────

export class NeedChoice {
	constructor(
		public player: PlayerId,
		public question: Question,
	) {}
}
export class GameOver {
	constructor(public winner: PlayerId | null) {}
}

export interface Ctx {
	s: GameState
	owner: PlayerId
	rival: PlayerId
	data: Record<string, unknown>
	ask(player: PlayerId, q: Question): string[]
	log(line: string): void
}

export type Script = (c: Ctx) => void

export function queue(s: GameState, key: string, owner: PlayerId, data: Record<string, unknown> = {}) {
	s.queue.push({ key, owner, data, answers: [] })
}

function runTask(s: GameState, task: Task): { state: GameState } | { need: NeedChoice } {
	const clone = structuredClone(s)
	clone.queue.shift()
	let i = 0
	const c: Ctx = {
		s: clone,
		owner: task.owner,
		rival: other(task.owner),
		data: task.data,
		ask(player, q) {
			if (q.options.length === 0) return []
			if (q.options.length === 1 && q.min >= 1) return [q.options[0].id]
			if (q.min === q.max && q.options.length === q.min) return q.options.map((o) => o.id)
			const a = task.answers[i++]
			if (a) return a
			throw new NeedChoice(player, q)
		},
		log: (line) => log(clone, line),
	}
	try {
		const fn = script(task.key)
		if (!fn) throw new Error(`No script for ${task.key}`)
		fn(c)
		return { state: clone }
	} catch (e) {
		if (e instanceof NeedChoice) return { need: e }
		if (e instanceof GameOver) {
			clone.phase = 'over'
			clone.queue = []
			clone.pending = { kind: 'over', winner: e.winner }
			return { state: clone }
		}
		throw e
	}
}

/** Run queued tasks until one needs a decision; then work out who acts next. */
function settle(s: GameState): GameState {
	while (s.queue.length > 0 && s.phase !== 'over') {
		const r = runTask(s, s.queue[0])
		if ('need' in r) {
			s.pending = { kind: 'choose', player: r.need.player, question: r.need.question }
			return s
		}
		s = r.state
	}
	if (s.phase === 'over') return s
	if (s.phase === 'turns') {
		if (s.turn.main && s.turn.side) {
			endTurn(s)
			return settle(s)
		}
		s.pending = { kind: 'act', player: s.active }
	}
	return s
}

/** Damage pipeline: reactions (Barrier), astral dice, wound tokens, Phoenixborn defeat. Returns wounds placed. */
export function dealDamage(c: Ctx, target: number, amount: number): number {
	const s = c.s
	if (amount <= 0 || !inPlay(s, target)) return 0
	const ctl = controller(s, target)
	let amt = amount
	amt = Math.max(0, amt - HOOKS.damaged(c, target, amt))
	const astral = astralOn(s, target)
	if (astral && amt > 0) {
		amt -= 1
		const keep = s.marks.some((m) => m.kind === 'dodge' && m.player === ctl)
		if (!keep) moveDie(astral, 'exhausted')
		log(s, `An astral die on ${nameOf(s, target)} prevents 1 damage${keep ? '' : ' and is exhausted'}.`)
	}
	if (amt <= 0) return 0
	s.inst[target].wounds += amt
	log(s, `${nameOf(s, target)} takes ${amt} damage.`)
	if (s.inst[target].zone === 'pb') checkPhoenixborn(s)
	return amt
}

export function checkPhoenixborn(s: GameState) {
	const dead = ([0, 1] as PlayerId[]).filter((p) => pbLeft(s, p) <= 0)
	if (dead.length === 0) return
	const winner = dead.length === 2 ? null : other(dead[0])
	log(s, winner === null ? 'Both Phoenixborn fall — it’s a draw.' : `${nameOf(s, s.players[dead[0]].pb)} is defeated. ${s.players[winner].name} wins!`)
	throw new GameOver(winner)
}

/** Destroy every unit whose wounds reach its life. Returns the destroyed uids. */
export function checkDestroyed(s: GameState): number[] {
	const out: number[] = []
	for (const p of [s.active, other(s.active)] as PlayerId[])
		for (const u of s.players[p].battlefield.slice())
			if (s.inst[u].wounds >= lifeOf(s, u)) {
				log(s, `${nameOf(s, u)} is destroyed.`)
				leavePlay(s, u, 'discard')
				out.push(u)
			}
	return out
}

// ───────── turns ─────────

function endTurn(s: GameState) {
	s.marks = s.marks.filter((m) => m.until !== 'turn')
	s.players[0].reacted = false
	s.players[1].reacted = false
	if (s.turn.passed && s.lastPassed) {
		s.phase = 'recovery'
		s.turn = { main: false, side: false, passed: false }
		s.lastPassed = false
		queue(s, 'recovery', s.first)
		return
	}
	s.lastPassed = s.turn.passed
	s.active = other(s.active)
	s.turn = { main: false, side: false, passed: false }
}

// ───────── new game ─────────

export interface NewGameOpts {
	seed: number
	decks: [DeckList, DeckList] | [string, string]
	names: [string, string]
}

export function newGame(o: NewGameOpts): GameState {
	const decks = o.decks.map((d) => (typeof d === 'string' ? DECKS[d] : d)) as [DeckList, DeckList]
	const s: GameState = {
		rng: o.seed >>> 0 || 1,
		round: 1,
		phase: 'setup',
		first: 0,
		active: 0,
		players: [null, null] as unknown as [PlayerState, PlayerState],
		inst: {},
		nextUid: 1,
		queue: [],
		pending: { kind: 'act', player: 0 },
		turn: { main: false, side: false, passed: false },
		lastPassed: false,
		marks: [],
		log: [],
	}
	const make = (stub: string, owner: PlayerId, zone: Inst['zone']) => {
		const uid = s.nextUid++
		s.inst[uid] = { uid, stub, owner, zone, wounds: 0, exhaust: 0, status: 0, alts: [] }
		return uid
	}
	for (const p of [0, 1] as PlayerId[]) {
		const d = decks[p]
		let n = 0
		const dice: Die[] = d.dice.flatMap((x) => Array.from({ length: x.count }, () => ({ id: `${p}d${n++}`, magic: x.magic, level: 'basic' as Level, owner: p, loc: 'exhausted' as const })))
		s.players[p] = {
			name: o.names[p],
			deckId: d.id,
			pb: make(d.pb, p, 'pb'),
			deck: d.cards.map((c) => make(c, p, 'deck')),
			hand: [],
			discard: [],
			battlefield: [],
			spellboard: [],
			conj: d.conj.map((c) => make(c, p, 'conj')),
			dice,
			guarded: false,
			reacted: false,
		}
	}
	log(s, `${o.names[0]} (${nameOf(s, s.players[0].pb)}) vs ${o.names[1]} (${nameOf(s, s.players[1].pb)}).`)
	queue(s, 'setup', 0)
	return settle(s)
}

// ───────── intents ─────────

export function rng(s: GameState): Rng {
	return new Rng(s.rng)
}
export function withRng<T>(s: GameState, f: (r: Rng) => T): T {
	const r = new Rng(s.rng)
	const out = f(r)
	s.rng = r.seed
	return out
}

/** Why the player can't act freely right now (null = it's their turn and nothing is pending). */
function turnProblem(s: GameState, p: PlayerId): string | null {
	if (s.pending.kind === 'over') return 'The game is over'
	if (s.pending.kind === 'choose') return s.pending.player === p ? 'Answer the question first' : 'Waiting for the other player'
	if (s.phase !== 'turns') return 'Not during the player turns phase'
	if (s.active !== p) return 'It’s not your turn'
	return null
}

/** Problems with playing a card from hand, not counting dice (null = fine). */
export function playProblem(s: GameState, p: PlayerId, uid: number): string | null {
	const t = turnProblem(s, p)
	if (t) return t
	const c = s.inst[uid]
	if (!c || c.zone !== 'hand' || c.owner !== p) return 'That card isn’t in your hand'
	const d = def(s, uid)
	if (d.type === 'Reaction Spell') return 'Reaction spells are played when their trigger happens'
	const cost = playCost(s, uid)
	if (cost.main && s.turn.main) return 'You’ve used your main action this turn'
	if (cost.side && s.turn.side) return 'You’ve used your side action this turn'
	if (cost.magic.length > activeDice(s, p).length) return 'Not enough dice'
	if (cost.discard > s.players[p].hand.length - 1) return 'Not enough other cards to discard'
	if (d.type === 'Ally' && units(s, p).length >= battlefieldSize(s, p)) return 'Your battlefield is full'
	if (d.type === 'Ready Spell') {
		const pl = s.players[p]
		const stacked = pl.spellboard.some((st) => s.inst[st[0]].stub === c.stub)
		if (!stacked && pl.spellboard.length >= spellboardSize(s, p)) return 'Your spellboard is full'
	}
	if (d.type === 'Alteration Spell' && units(s, 0).length + units(s, 1).length === 0) return 'There’s no unit to attach it to'
	const extra = PLAY_CHECKS[c.stub]?.(s, p, uid)
	if (extra) return extra
	return null
}

export function abilityProblem(s: GameState, p: PlayerId, uid: number): string | null {
	const t = turnProblem(s, p)
	if (t) return t
	const c = s.inst[uid]
	const ab = c && ABILITIES[c.stub]
	if (!ab) return 'That card has no ability to use'
	if (!inPlay(s, uid) || controller(s, uid) !== p) return 'You don’t control that card'
	if (exhausted(s, uid)) return 'That card is exhausted'
	if (ab.cost.main && s.turn.main) return 'You’ve used your main action this turn'
	if (ab.cost.side && s.turn.side) return 'You’ve used your side action this turn'
	if (ab.cost.magic.length > activeDice(s, p).length) return 'Not enough dice'
	return ab.check?.(s, p, uid) ?? null
}

export function dicePowerTargets(s: GameState, p: PlayerId, d: Die): number[] {
	if (d.magic === 'astral') return [s.players[p].pb, ...units(s, p)].filter((u) => !astralOn(s, u))
	if (d.magic === 'artifice') return cardsInPlay(s, p).filter((u) => s.inst[u].zone !== 'attached')
	return []
}

export function dicePowerProblem(s: GameState, p: PlayerId, dieId: string, target?: number): string | null {
	const t = turnProblem(s, p)
	if (t) return t
	if (s.turn.side) return 'You’ve used your side action this turn'
	const d = findDie(s, dieId)
	if (!d || d.owner !== p || d.loc !== 'active') return 'Pick one of your active dice'
	if (d.level !== 'power') return 'Only a die showing its power symbol has a dice power'
	const targets = dicePowerTargets(s, p, d)
	if (targets.length === 0) return 'No card to place the die on'
	if (target !== undefined && !targets.includes(target)) return d.magic === 'astral' ? 'Place it on a unit or Phoenixborn you control without an astral die' : 'Place it on a card you control'
	return null
}

export function attackProblem(s: GameState, p: PlayerId, target: number | 'pb', attackers: number[]): string | null {
	const t = turnProblem(s, p)
	if (t) return t
	if (s.turn.main) return 'You’ve used your main action this turn'
	if (attackers.length === 0) return 'Choose at least one attacker'
	if (new Set(attackers).size !== attackers.length) return 'Each unit attacks once'
	for (const a of attackers) {
		if (!s.inst[a] || s.inst[a].zone !== 'battlefield' || controller(s, a) !== p) return 'Attack with your own units'
		if (exhausted(s, a)) return `${nameOf(s, a)} is exhausted`
		if (!canAttackWith(s, a)) return `${nameOf(s, a)} can’t attack unless it’s charged`
	}
	if (target !== 'pb') {
		if (!s.inst[target] || s.inst[target].zone !== 'battlefield' || controller(s, target) === p) return 'Attack an opponent’s unit'
		if (attackers.length !== 1) return 'Only one unit can attack a unit'
	}
	return null
}

export interface ApplyResult {
	state: GameState
	error?: string
}

export function tryApply(s: GameState, i: Intent): ApplyResult {
	try {
		return { state: apply(s, i) }
	} catch (e) {
		if (e instanceof RuleError) return { state: s, error: e.message }
		throw e
	}
}

export class RuleError extends Error {}
const fail = (msg: string): never => {
	throw new RuleError(msg)
}

function payDice(s: GameState, p: PlayerId, ids: string[], reqs: Cost['magic']) {
	const dice = ids.map((id) => findDie(s, id))
	if (dice.some((d) => !d || d.owner !== p || d.loc !== 'active')) fail('Pay with dice from your active pool')
	if (new Set(ids).size !== ids.length) fail('Each die pays once')
	if (!paysExactly(dice as Die[], reqs)) fail('Those dice don’t pay this cost')
	for (const d of dice as Die[]) moveDie(d, 'exhausted')
}

export function apply(input: GameState, i: Intent): GameState {
	const s = structuredClone(input)
	const p = i.player
	switch (i.t) {
		case 'choose': {
			if (s.pending.kind !== 'choose' || s.pending.player !== p) fail('Nothing to answer')
			const q = (s.pending as { question: Question }).question
			const ids = new Set(q.options.map((o) => o.id))
			if (i.picks.length < q.min || i.picks.length > q.max) fail(q.min === q.max ? `Pick ${q.min}` : `Pick ${q.min}–${q.max}`)
			if (new Set(i.picks).size !== i.picks.length || i.picks.some((x) => !ids.has(x))) fail('Pick from the options')
			if (q.group && i.picks.filter((x) => q.group!.ids.includes(x)).length > q.group.max) fail(q.group.label)
			s.queue[0].answers.push(i.picks)
			return settle(s)
		}
		case 'play': {
			const prob = playProblem(s, p, i.card)
			if (prob) fail(prob)
			const cost = playCost(s, i.card)
			payDice(s, p, i.dice, cost.magic)
			if (cost.main) s.turn.main = true
			if (cost.side) s.turn.side = true
			const pl = s.players[p]
			removeFrom(pl.hand, i.card)
			s.inst[i.card].zone = 'stack' // resolving: not in hand, not yet in play
			log(s, `${pl.name} plays ${nameOf(s, i.card)}.`)
			queue(s, 'play', p, { uid: i.card })
			return settle(s)
		}
		case 'activate': {
			const prob = abilityProblem(s, p, i.card)
			if (prob) fail(prob)
			const ab = ABILITIES[s.inst[i.card].stub]
			payDice(s, p, i.dice, ab.cost.magic)
			if (ab.cost.main) s.turn.main = true
			if (ab.cost.side) s.turn.side = true
			if (ab.cost.exhaust) s.inst[i.card].exhaust += 1
			log(s, `${s.players[p].name} uses ${nameOf(s, i.card)}: ${ab.label}.`)
			queue(s, 'ability', p, { uid: i.card })
			return settle(s)
		}
		case 'dicePower': {
			const prob = dicePowerProblem(s, p, i.die, i.target)
			if (prob) fail(prob)
			const d = findDie(s, i.die)!
			moveDie(d, 'card', i.target)
			s.turn.side = true
			log(s, `${s.players[p].name} uses an ${d.magic} dice power: the die goes on ${nameOf(s, i.target)}.`)
			return settle(s)
		}
		case 'meditate': {
			const t = turnProblem(s, p)
			if (t) fail(t)
			if (s.turn.side) fail('You’ve used your side action this turn')
			if (i.items.length === 0) fail('Discard at least one card to meditate')
			const pl = s.players[p]
			const seen = new Set<number>()
			let fromDeck = 0
			for (const it of i.items) {
				const d = findDie(s, it.die)
				if (!d || d.owner !== p || d.loc !== 'active') fail('Change dice in your active pool')
				if (it.from === 'deck') {
					if (fromDeck >= pl.deck.length) fail('Your draw pile is empty')
					fromDeck++
				} else {
					if (it.card === undefined || seen.has(it.card)) fail('Each card is discarded once')
					seen.add(it.card!)
					const c = s.inst[it.card!]
					if (it.from === 'hand' && (c?.zone !== 'hand' || c.owner !== p)) fail('Discard a card from your hand')
					if (it.from === 'spell' && (c?.zone !== 'spellboard' || c.owner !== p)) fail('Discard one of your ready spells')
				}
			}
			for (const it of i.items) {
				if (it.from === 'deck') {
					const top = pl.deck.shift()!
					s.inst[top].zone = 'discard'
					pl.discard.push(top)
				} else if (it.from === 'hand') discardFromHand(s, it.card!)
				else leavePlay(s, it.card!, 'discard')
				findDie(s, it.die)!.level = it.level
			}
			s.turn.side = true
			log(s, `${pl.name} meditates, discarding ${i.items.length} card${i.items.length > 1 ? 's' : ''} to set ${i.items.length} di${i.items.length > 1 ? 'ce' : 'e'}.`)
			return settle(s)
		}
		case 'attack': {
			const prob = attackProblem(s, p, i.target, i.attackers)
			if (prob) fail(prob)
			s.turn.main = true
			queue(s, 'attack', p, { target: i.target, attackers: i.attackers })
			return settle(s)
		}
		case 'pass': {
			const t = turnProblem(s, p)
			if (t) fail(t)
			if (s.turn.main) fail('You’ve used your main action this turn')
			s.turn.main = true
			s.turn.passed = true
			log(s, `${s.players[p].name} passes.`)
			return settle(s)
		}
		case 'endTurn': {
			const t = turnProblem(s, p)
			if (t) fail(t)
			if (!s.turn.main) fail('Take a main action first (or pass)')
			endTurn(s)
			return settle(s)
		}
	}
	return s
}

/** Cheapest dice to pay a cost from the player's active pool (null = can't pay). */
export function suggestDice(s: GameState, p: PlayerId, c: Cost): string[] | null {
	const pay = autoPay(activeDice(s, p), c.magic)
	return pay ? pay.map((d) => d.id) : null
}

export { DECKS }
