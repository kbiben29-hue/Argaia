// Core types for the Ashes rules engine. The engine is pure TypeScript with no DOM access:
// `apply(state, intent)` returns a new state and never mutates its input.

export type PlayerId = 0 | 1
export const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0)

export type Magic = 'astral' | 'artifice' | 'natural' | 'illusion' | 'ceremonial' | 'charm' | 'divine' | 'sympathy' | 'time' | 'rage'
export type Level = 'power' | 'class' | 'basic'
export const LEVELS: Level[] = ['power', 'class', 'basic']

export type CardType =
	| 'Phoenixborn'
	| 'Ally'
	| 'Conjuration'
	| 'Action Spell'
	| 'Reaction Spell'
	| 'Ready Spell'
	| 'Alteration Spell'
	| 'Conjured Alteration Spell'
	| 'Chimera'
	| 'Aspect'

/** Static card data (names, types, costs, values). No rules text: abilities are scripted. */
export interface CardDef {
	stub: string
	name: string
	type: CardType | string
	placement?: string
	/** play cost as printed by the card database, e.g. ["[[main]]", "1 [[astral:class]]"]; a nested list is "either of these" */
	cost?: (string | string[])[]
	attack?: number | string
	life?: number | string
	recover?: number | string
	battlefield?: number
	spellboard?: number
	copies?: number
	/** Phoenixborn-unique card: the Phoenixborn's name */
	unique?: string
	/** Red Rains aspects: blood value, who it attacks (left / right unit or the jaw = Phoenixborn), status pips */
	blood?: number
	aim?: 'left' | 'right' | 'jaw'
	statusCount?: number
	/** Red Rains chimera: printed ultimate value and threat */
	ultimate?: number
	threat?: number
}

export interface Die {
	id: string
	magic: Magic
	level: Level
	owner: PlayerId
	/** where the die is: active pool, exhausted pool, or on a card (`on` = that card's uid) */
	loc: 'active' | 'exhausted' | 'card'
	on?: number
}

export type Zone = 'deck' | 'hand' | 'discard' | 'battlefield' | 'spellboard' | 'attached' | 'conj' | 'pb' | 'stack' | 'under' | 'threat'

/** One physical card. Phoenixborn, units, spells and conjurations are all instances. */
export interface Inst {
	uid: number
	stub: string
	owner: PlayerId
	zone: Zone
	wounds: number
	exhaust: number
	status: number
	/** alteration spells attached to this unit (uids) */
	alts: number[]
	/** for an attached alteration: the unit it's under */
	host?: number
	/** a unit on someone else's battlefield (e.g. a Blood Puppet placed on the opponent's side) */
	ctl?: PlayerId
	/** allies face down under a mount conjuration */
	under?: number[]
	/** who last dealt damage to (or destroyed) this card, and how: for "destroyed as a result of…" */
	hitBy?: PlayerId
	hitKind?: 'attack' | 'counter' | 'effect'
}

export interface PlayerState {
	name: string
	deckId: string
	pb: number
	deck: number[]
	hand: number[]
	discard: number[]
	battlefield: number[]
	/** ready spells; each slot is a stack of copies of one spell */
	spellboard: number[][]
	conj: number[]
	dice: Die[]
	/** the Phoenixborn has guarded this round (rotated) */
	guarded: boolean
	/** one reaction per player per turn */
	reacted: boolean
	/** once-per-turn abilities used this turn (e.g. Jessa's Screams of the Departed) */
	once?: string[]
}

export interface ChoiceOption {
	id: string
	label: string
	uid?: number
	dieId?: string
	/** how good this pick is for the player answering (bot + coach) */
	score?: number
}

export interface Question {
	prompt: string
	options: ChoiceOption[]
	min: number
	max: number
	/** options pre-selected in the UI */
	defaults?: string[]
	/** at most `max` of these ids may be picked together (e.g. one Phoenixborn-unique card in the First Five) */
	group?: { ids: string[]; max: number; label: string }
	/** what kind of decision this is (tutorial coach, UI styling) */
	kind?: string
}

export interface Task {
	key: string
	owner: PlayerId
	data: Record<string, unknown>
	answers: string[][]
}

export type Pending =
	| { kind: 'act'; player: PlayerId }
	| { kind: 'choose'; player: PlayerId; question: Question }
	| { kind: 'over'; winner: PlayerId | null }

/** A lasting effect, e.g. "+2 attack for the remainder of the turn". */
export interface Mark {
	/** attack: +amount attack · dodge: astral dice stay · kw: the unit has keyword `kw` · doom: destroy at end of turn */
	kind: 'attack' | 'dodge' | 'kw' | 'doom'
	uid?: number
	player?: PlayerId
	amount?: number
	kw?: string
	/** 'turn' / 'round'; 'next' = until the start of `player`'s next turn */
	until: 'turn' | 'round' | 'next'
}

/** Red Rains: the chimera's own state (it is player 1). */
export interface SoloState {
	chimera: PlayerId
	level: 'S' | 'H'
	stage: 1 | 2 | 3
	/** blood values of the starting threat cards; its length is the printed threat */
	setup: number[]
	/** 1–3: column of the behaviour table and strength of the ultimate */
	phase: 1 | 2 | 3
	redRains: number
	/** extra threat on top of the printed threat */
	extraThreat: number
	/** the aspect deck has run out once: every card discarded from it now deals 1 damage to the chimera */
	fatigued: boolean
	/** face-down aspects ("threat cards"), left to right */
	threatZone: number[]
	/** the last behaviour roll, for the UI */
	roll?: { d12: number; text: string }
}

export type Phase = 'setup' | 'prepare' | 'turns' | 'recovery' | 'over'

export interface GameState {
	rng: number
	round: number
	phase: Phase
	first: PlayerId
	active: PlayerId
	players: [PlayerState, PlayerState]
	inst: Record<number, Inst>
	nextUid: number
	queue: Task[]
	pending: Pending
	turn: { main: boolean; side: boolean; passed: boolean }
	/** the previous turn's main action was Pass (two in a row ends the phase) */
	lastPassed: boolean
	marks: Mark[]
	log: string[]
	/** set by the attack task while a battle is going on (UI arrows) */
	attack?: { target: 'pb' | number; attackers: number[] } | null
	/** units destroyed this turn (Bone Crow-style checks) */
	destroyedThisTurn?: number
	/** Red Rains solo game against a chimera */
	solo?: SoloState
}

export type AttackTarget = 'pb' | number

export interface MeditateItem {
	from: 'hand' | 'deck' | 'spell'
	/** hand card or ready spell uid (not needed for the top of the deck) */
	card?: number
	die: string
	level: Level
}

export type Intent =
	| { t: 'play'; player: PlayerId; card: number; dice: string[] }
	/** `ab`: which ability, for cards with more than one (index into abilitiesOf) */
	| { t: 'activate'; player: PlayerId; card: number; dice: string[]; ab?: number }
	/** `target` is left out for powers that don't point at a card (ceremonial, illusion, sympathy) */
	| { t: 'dicePower'; player: PlayerId; die: string; target?: number }
	| { t: 'meditate'; player: PlayerId; items: MeditateItem[] }
	| { t: 'attack'; player: PlayerId; target: AttackTarget; attackers: number[] }
	| { t: 'pass'; player: PlayerId }
	| { t: 'endTurn'; player: PlayerId }
	| { t: 'choose'; player: PlayerId; picks: string[] }
	| { t: 'forfeit'; player: PlayerId }
	/** "Manual fixes": adjust a card by hand to undo a mistake */
	| { t: 'manual'; player: PlayerId; card: number; op: ManualOp }

export type ManualOp = 'wound+' | 'wound-' | 'exhaust+' | 'exhaust-' | 'discard' | 'hand'

/** A deck as played: Phoenixborn, 30 cards (stubs, with duplicates), conjuration pile, dice, First Five suggestion. */
export interface DeckList {
	id: string
	name: string
	pb: string
	cards: string[]
	conj: string[]
	dice: { magic: Magic; count: number }[]
	firstFive: string[]
}
