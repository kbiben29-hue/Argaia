import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
	abilityProblem,
	activeDice,
	attackProblem,
	canAttackWith,
	controller,
	def,
	dicePowerProblem,
	dicePowerTargets,
	diceOn,
	exhaustedDice,
	findDie,
	inPlay,
	nameOf,
	pbLeft,
	pbLife,
	playCost,
	playProblem,
	suggestDice,
	battlefieldSize,
	spellboardSize,
} from '../engine/engine'
import { ABILITIES } from '../engine/effects'
import { paysExactly, type Req } from '../engine/dice'
import { other, LEVELS, type AttackTarget, type GameState, type Intent, type Level, type MeditateItem, type PlayerId, type Question } from '../engine/types'
import { cardText } from '../data/cardText'
import { Card, CardFace } from './Card'
import { CostView, DieChip, RichText } from './Die'
import type { Hint } from './coach'

export type LayoutKind = 'console' | 'pocket'
export type LayoutChoice = 'auto' | LayoutKind

type Mode =
	| null
	| { k: 'pay'; what: 'play' | 'activate'; card: number; dice: string[]; reqs: Req[] }
	| { k: 'attack'; target: AttackTarget | null; attackers: number[] }
	| { k: 'power'; die: string }
	| { k: 'med'; items: MeditateItem[]; src: { from: 'hand' | 'deck' | 'spell'; card?: number } | null }

export interface BoardProps {
	state: GameState
	send: (i: Intent) => string | undefined
	viewer: PlayerId
	hideHand: boolean
	bot: boolean
	onUndo?: () => void
	onMenu: () => void
	layout: LayoutKind
	layoutChoice: LayoutChoice
	onLayout: (c: LayoutChoice) => void
	hint?: Hint
	coach?: ReactNode
	netBadge?: ReactNode
	muted: boolean
	onMute: () => void
	/** keep questions closed (tutorial intro pages showing) */
	holdQuestion?: boolean
}

export function Board(props: BoardProps) {
	const { state: s, send, viewer: me, hideHand, hint, layout } = props
	const foe = other(me)
	const [mode, setMode] = useState<Mode>(null)
	const [sel, setSel] = useState<number | null>(null)
	const [toast, setToast] = useState<string | null>(null)
	const [peek, setPeek] = useState(false)
	const [facePick, setFacePick] = useState<string | null>(null)
	const [sheet, setSheet] = useState<'menu' | null>(null)
	const toastTimer = useRef<number | undefined>(undefined)

	const myAct = s.pending.kind === 'act' && s.pending.player === me
	const myQ = s.pending.kind === 'choose' && s.pending.player === me ? s.pending.question : null

	// a new position cancels half-finished actions that no longer make sense
	const lastLog = s.log.length
	useEffect(() => {
		setMode(null)
		setFacePick(null)
		setPeek(false)
	}, [lastLog, s.pending.kind])
	useEffect(() => {
		if (sel !== null && !s.inst[sel]) setSel(null)
	}, [s, sel])

	const flash = (msg: string) => {
		setToast(msg)
		window.clearTimeout(toastTimer.current)
		toastTimer.current = window.setTimeout(() => setToast(null), 2600)
	}
	const go = (i: Intent) => {
		const err = send(i)
		if (err) flash(err)
		else {
			setMode(null)
			if (layout === 'pocket') setSel(null)
		}
		return err
	}

	// ───── starting actions ─────
	const startPay = (what: 'play' | 'activate', card: number) => {
		const c = what === 'play' ? playCost(s, card) : ABILITIES[s.inst[card].stub].cost
		const dice = suggestDice(s, me, c)
		if (c.magic.length === 0) return go({ t: what, player: me, card, dice: [] })
		if (!dice) return flash('You don’t have the right dice for that')
		setMode({ k: 'pay', what, card, dice, reqs: c.magic })
		if (layout === 'pocket') setSel(null)
	}
	const startAttack = (target: AttackTarget | null, attacker?: number) => {
		setMode({ k: 'attack', target, attackers: attacker !== undefined ? [attacker] : [] })
		if (layout === 'pocket') setSel(null)
	}

	// ───── taps ─────
	const tapCard = (uid: number) => {
		if (mode?.k === 'attack') {
			const foeSide = controller(s, uid) === foe && (s.inst[uid].zone === 'battlefield' || s.inst[uid].zone === 'pb')
			if (foeSide) {
				const target: AttackTarget = s.inst[uid].zone === 'pb' ? 'pb' : uid
				setMode({ ...mode, target, attackers: target === 'pb' ? mode.attackers : mode.attackers.slice(0, 1) })
				return
			}
			if (controller(s, uid) === me && s.inst[uid].zone === 'battlefield') {
				if (!canAttackWith(s, uid)) return flash(`${nameOf(s, uid)} can’t attack right now`)
				const has = mode.attackers.includes(uid)
				const single = mode.target !== null && mode.target !== 'pb'
				setMode({ ...mode, attackers: has ? mode.attackers.filter((a) => a !== uid) : single ? [uid] : [...mode.attackers, uid] })
				return
			}
		}
		if (mode?.k === 'power') {
			const d = findDie(s, mode.die)
			if (d && dicePowerTargets(s, me, d).includes(uid)) {
				go({ t: 'dicePower', player: me, die: mode.die, target: uid })
				return
			}
		}
		if (mode?.k === 'med') {
			const c = s.inst[uid]
			if (c.owner === me && (c.zone === 'hand' || c.zone === 'spellboard')) {
				if (mode.items.some((it) => it.card === uid)) return flash('That card is already being discarded')
				setMode({ ...mode, src: { from: c.zone === 'hand' ? 'hand' : 'spell', card: uid } })
				return
			}
		}
		setSel(uid)
	}
	const tapDie = (id: string) => {
		const d = findDie(s, id)
		if (!d) return
		if (mode?.k === 'pay' && d.owner === me && d.loc === 'active') {
			const has = mode.dice.includes(id)
			setMode({ ...mode, dice: has ? mode.dice.filter((x) => x !== id) : [...mode.dice, id] })
			return
		}
		if (mode?.k === 'med' && d.owner === me && d.loc === 'active') {
			if (!mode.src) return flash('First tap a card to discard (or Top of deck)')
			setFacePick(id)
			return
		}
		if (myAct && d.owner === me && d.loc === 'active' && d.level === 'power') {
			const err = dicePowerProblem(s, me, id)
			if (err) return flash(err)
			setMode({ k: 'power', die: id })
			setSel(null)
			return
		}
		if (d.owner === me && d.loc === 'active' && myAct) flash('Only a die showing its power symbol has a dice power (side action)')
	}

	// ───── highlights ─────
	const hintCards = new Set(hint?.cards ?? [])
	const hintDice = new Set(hint?.dice ?? [])
	const hintBtn = new Set(hint?.buttons ?? [])
	const markOf = (uid: number): 'target' | 'attacker' | 'valid' | null => {
		if (mode?.k === 'attack') {
			if (mode.target === 'pb' && uid === s.players[foe].pb) return 'target'
			if (mode.target === uid) return 'target'
			if (mode.attackers.includes(uid)) return 'attacker'
			if (controller(s, uid) === me && s.inst[uid].zone === 'battlefield' && canAttackWith(s, uid)) return 'valid'
			if (controller(s, uid) === foe && (s.inst[uid].zone === 'battlefield' || s.inst[uid].zone === 'pb')) return 'valid'
		}
		if (mode?.k === 'power') {
			const d = findDie(s, mode.die)
			if (d && dicePowerTargets(s, me, d).includes(uid)) return 'valid'
		}
		if (mode?.k === 'med' && s.inst[uid].owner === me && (s.inst[uid].zone === 'hand' || s.inst[uid].zone === 'spellboard')) return mode.src?.card === uid || mode.items.some((it) => it.card === uid) ? 'attacker' : 'valid'
		if (s.attack) {
			if (s.attack.attackers.includes(uid)) return 'attacker'
			const a0 = s.attack.attackers[0]
			if (s.attack.target === uid || (s.attack.target === 'pb' && a0 !== undefined && s.inst[a0] && uid === s.players[other(s.inst[a0].owner)].pb)) return 'target'
		}
		return null
	}
	const cardProps = (uid: number) => ({ s, uid, onClick: tapCard, glow: hintCards.has(uid), selected: sel === uid, mark: markOf(uid) })

	const dieProps = (id: string) => {
		const inPay = mode?.k === 'pay' && mode.dice.includes(id)
		const medded = mode?.k === 'med' && mode.items.some((it) => it.die === id)
		return { glow: hintDice.has(id) || (mode?.k === 'power' && mode.die === id), selected: inPay || medded, onClick: () => tapDie(id) }
	}

	// ───── pieces ─────
	const W = layout === 'console'
	const sizes = W ? { pb: 90, unit: 108, foeUnit: 96, spell: 76, hand: 108, die: 28 } : { pb: 56, unit: 80, foeUnit: 70, spell: 50, hand: 70, die: 25 }

	const diceTray = (p: PlayerId) => {
		const act = activeDice(s, p)
		const ex = exhaustedDice(s, p)
		const order = (l: Level) => LEVELS.indexOf(l)
		return (
			<div className="dice-tray">
				<div className="pool active" title="Active dice pool">
					{act
						.slice()
						.sort((a, b) => order(a.level) - order(b.level))
						.map((d) => (
							<DieChip key={d.id} die={d} size={sizes.die} {...dieProps(d.id)} />
						))}
					{act.length === 0 && <span className="empty">no active dice</span>}
				</div>
				<div className="pool exhausted" title="Exhausted dice pool">
					{ex.map((d) => (
						<DieChip key={d.id} die={d} size={Math.round(sizes.die * 0.66)} dim />
					))}
				</div>
			</div>
		)
	}

	const spellboard = (p: PlayerId, w: number) => {
		const pl = s.players[p]
		return (
			<div className="spellboard" title={`Spellboard (${pl.spellboard.length}/${spellboardSize(s, p)} slots)`}>
				{pl.spellboard.map((st) => (
					<div className="stack" key={st[0]} style={{ width: w + (st.length - 1) * Math.round(w * 0.22) }}>
						{st.map((u, i) => (
							<div key={u} className="stack-item" style={{ left: i * Math.round(w * 0.22) }}>
								<Card {...cardProps(u)} w={w} />
							</div>
						))}
					</div>
				))}
				{Array.from({ length: W ? Math.max(0, spellboardSize(s, p) - pl.spellboard.length) : 0 }, (_, i) => (
					<div key={`e${i}`} className="slot" style={{ width: w, height: Math.round(w * 1.4) }} />
				))}
			</div>
		)
	}

	const battlefield = (p: PlayerId, w: number) => {
		const pl = s.players[p]
		return (
			<div className={`battlefield ${p === me ? 'mine' : 'theirs'}`}>
				{pl.battlefield.map((u) => (
					<Card key={u} {...cardProps(u)} w={w} />
				))}
				{pl.battlefield.length === 0 && <div className="bf-empty">{p === me ? 'Your battlefield' : `${pl.name}’s battlefield`} · empty</div>}
				<div className="bf-count">
					{pl.battlefield.length}/{battlefieldSize(s, p)}
				</div>
			</div>
		)
	}

	const piles = (p: PlayerId) => {
		const pl = s.players[p]
		return (
			<div className="piles">
				<span title="Cards in hand">✋ {pl.hand.length}</span>
				<span title="Draw pile">▤ {pl.deck.length}</span>
				<span title="Discard pile">🗑 {pl.discard.length}</span>
				<span title="Conjuration pile">✧ {pl.conj.length}</span>
			</div>
		)
	}

	const pbBlock = (p: PlayerId, withDice = false) => {
		const pl = s.players[p]
		return (
			<div className="pb-block">
				<Card {...cardProps(pl.pb)} w={sizes.pb} />
				<div className="pb-info">
					<div className="pname">
						{pl.name} {s.first === p && <span className="first" title="First player">①</span>}
						{pl.guarded && <span className="guarded" title="Guarded this round">🛡</span>}
					</div>
					<div className="lifebar">
						<div style={{ width: `${(100 * pbLeft(s, p)) / pbLife(s, p)}%` }} />
						<span>
							{pbLeft(s, p)}/{pbLife(s, p)}
						</span>
					</div>
					{piles(p)}
					{withDice && diceTray(p)}
				</div>
			</div>
		)
	}

	const hand = (
		<div className={`hand ${hideHand ? 'hidden' : ''}`}>
			{s.players[me].hand.map((u) =>
				hideHand ? (
					<div key={u} className="card back" style={{ width: sizes.hand, height: Math.round(sizes.hand * 1.4) }} />
				) : (
					<Card key={u} {...cardProps(u)} w={sizes.hand} plain className={myAct && !playProblem(s, me, u) && suggestDice(s, me, playCost(s, u)) ? 'can' : ''} />
				),
			)}
		</div>
	)

	// ───── prompt bar ─────
	const turnState = `◆ ${s.turn.main ? 'used' : 'ready'} · ◇ ${s.turn.side ? 'used' : 'ready'}`
	let barText: ReactNode
	const buttons: ReactNode[] = []
	const btn = (key: string, label: string, onClick: () => void, opts: { primary?: boolean; disabled?: boolean } = {}) => (
		<button key={key} className={`${opts.primary ? 'primary' : ''} ${hintBtn.has(key) ? 'glow' : ''}`} disabled={opts.disabled} onClick={onClick}>
			{label}
		</button>
	)
	if (s.pending.kind === 'over') {
		const w = s.pending.winner
		barText = <b>{w === null ? 'A draw!' : w === me ? 'You win!' : `${s.players[w].name} wins.`}</b>
		buttons.push(btn('menu', 'New game', props.onMenu, { primary: true }))
	} else if (mode?.k === 'pay') {
		const ok = paysExactly(
			mode.dice.map((id) => findDie(s, id)!),
			mode.reqs,
		)
		barText = (
			<>
				Pay for <b>{nameOf(s, mode.card)}</b>: <CostView cost={{ main: false, side: false, exhaust: false, discard: 0, magic: mode.reqs }} size={22} /> — tap dice to change.
			</>
		)
		buttons.push(btn('cancel', 'Cancel', () => setMode(null)))
		buttons.push(btn('confirm', 'Confirm', () => go({ t: mode.what, player: me, card: mode.card, dice: mode.dice }), { primary: true, disabled: !ok }))
	} else if (mode?.k === 'attack') {
		const err = mode.target === null ? 'Tap the Phoenixborn or unit to attack' : attackProblem(s, me, mode.target, mode.attackers)
		barText =
			mode.target === null ? (
				<>Attack: tap their Phoenixborn or one of their units.</>
			) : mode.target === 'pb' ? (
				<>
					Attack <b>{nameOf(s, s.players[foe].pb)}</b>: tap your units to send ({mode.attackers.length} chosen).
				</>
			) : (
				<>
					Attack <b>{nameOf(s, mode.target)}</b>: tap one of your units.
				</>
			)
		buttons.push(btn('cancel', 'Cancel', () => setMode(null)))
		buttons.push(btn('attack', 'Attack!', () => mode.target !== null && go({ t: 'attack', player: me, target: mode.target, attackers: mode.attackers }), { primary: true, disabled: !!err }))
	} else if (mode?.k === 'power') {
		const d = findDie(s, mode.die)
		barText = <>Dice power: tap the card to put this {d?.magic} die on{d?.magic === 'astral' ? ' (it prevents 1 damage)' : ' (charges it)'}.</>
		buttons.push(btn('cancel', 'Cancel', () => setMode(null)))
	} else if (mode?.k === 'med') {
		barText = mode.src ? (
			<>Now tap a die in your active pool to choose its new side.</>
		) : (
			<>Meditate: tap a card in your hand, a ready spell, or Top of deck to discard — each one sets one die to any side.</>
		)
		buttons.push(btn('cancel', 'Cancel', () => setMode(null)))
		buttons.push(btn('deck', 'Top of deck', () => setMode({ ...mode, src: { from: 'deck' } }), { disabled: s.players[me].deck.length <= mode.items.filter((x) => x.from === 'deck').length }))
		buttons.push(btn('confirm', `Done (${mode.items.length})`, () => go({ t: 'meditate', player: me, items: mode.items }), { primary: true, disabled: mode.items.length === 0 }))
	} else if (myQ) {
		barText = <>{props.holdQuestion ? 'Read the tutorial pages first.' : peek ? 'Looking at the table — ' : ''}{props.holdQuestion ? '' : 'Answer the question.'}</>
		if (peek) buttons.push(btn('show', 'Back to the question', () => setPeek(false), { primary: true }))
	} else if (s.pending.kind === 'choose') {
		barText = <>Waiting for {s.players[s.pending.player].name}…</>
	} else if (myAct) {
		barText = (
			<>
				<b>Your turn</b> · round {s.round} · {turnState}
			</>
		)
		if (!s.turn.main) buttons.push(btn('attack', 'Attack', () => startAttack(null)))
		if (!s.turn.side) buttons.push(btn('meditate', 'Meditate', () => setMode({ k: 'med', items: [], src: null })))
		if (!s.turn.main) buttons.push(btn('pass', 'Pass', () => go({ t: 'pass', player: me })))
		else buttons.push(btn('endTurn', 'End turn', () => go({ t: 'endTurn', player: me }), { primary: true }))
	} else {
		barText = (
			<>
				{s.players[s.active].name}’s turn · round {s.round}
			</>
		)
	}

	const promptBar = (
		<div className={`prompt ${myAct || myQ ? 'mine' : ''}`}>
			<div className="ptext">{barText}</div>
			<div className="pbtns">{buttons}</div>
			{toast && <div className="toast">{toast}</div>}
		</div>
	)

	// ───── card viewer ─────
	const viewerContent = sel !== null && s.inst[sel] ? <Viewer s={s} uid={sel} me={me} myAct={myAct} startPay={startPay} startAttack={startAttack} hideHand={hideHand} /> : null

	// ───── question ─────
	const question = myQ && !peek && !props.holdQuestion ? <Choice key={`${s.log.length}:${myQ.prompt}:${s.queue[0]?.answers.length ?? 0}`} s={s} q={myQ} glow={new Set(hint?.options ?? [])} onPeek={() => setPeek(true)} onAnswer={(picks) => go({ t: 'choose', player: me, picks })} onView={setSel} /> : null

	const facePicker =
		facePick && mode?.k === 'med' ? (
			<div className="facepick" onClick={() => setFacePick(null)}>
				<div onClick={(e) => e.stopPropagation()}>
					<div>New side for this die:</div>
					<div className="faces">
						{LEVELS.map((l) => (
							<DieChip
								key={l}
								die={{ magic: findDie(s, facePick)!.magic, level: l }}
								size={56}
								onClick={() => {
									setMode({ ...mode, items: [...mode.items, { ...mode.src!, die: facePick, level: l }], src: null })
									setFacePick(null)
								}}
							/>
						))}
					</div>
				</div>
			</div>
		) : null

	const logBox = <LogBox lines={s.log} />

	const menuButtons = (
		<div className="menu-buttons">
			<button onClick={props.onMenu}>☰ Menu</button>
			{props.onUndo && <button onClick={props.onUndo}>↶ Undo</button>}
			<button onClick={props.onMute}>{props.muted ? '🔇' : '🔊'}</button>
			<select value={props.layoutChoice} onChange={(e) => props.onLayout(e.target.value as LayoutChoice)} title="Screen layout">
				<option value="auto">Layout: auto</option>
				<option value="console">Table</option>
				<option value="pocket">Phone</option>
			</select>
		</div>
	)

	if (layout === 'pocket')
		return (
			<div className="pocket" onClick={() => setSel(null)}>
				<div className="p-foe">
					<div className="p-foebar">
						{pbBlock(foe, true)}
						<button className="p-menu" onClick={(e) => (e.stopPropagation(), setSheet('menu'))}>
							☰
						</button>
					</div>
					{s.players[foe].spellboard.length > 0 && <div className="p-row">{spellboard(foe, 44)}</div>}
					<div className="p-row">{battlefield(foe, sizes.foeUnit)}</div>
				</div>
				{props.netBadge}
				<div className="p-prompt">{promptBar}</div>
				{props.coach && <div className="p-coach">{props.coach}</div>}
				<div className="p-me">
					<div className="p-row">{battlefield(me, sizes.unit)}</div>
					<div className="p-row p-spells">
						{spellboard(me, sizes.spell)}
						{s.players[me].spellboard.length === 0 && <span className="dim small">Spellboard empty (0/{spellboardSize(s, me)})</span>}
					</div>
					<div className="p-mine">{pbBlock(me, true)}</div>
				</div>
				<div className="p-hand">{hand}</div>
				{viewerContent && (
					<div className="sheet" onClick={(e) => (e.stopPropagation(), setSel(null))}>
						<div className="sheet-body" onClick={(e) => e.stopPropagation()}>
							<button className="sheet-x" onClick={() => setSel(null)}>
								✕
							</button>
							{viewerContent}
						</div>
					</div>
				)}
				{question && <div className="sheet q">{<div className="sheet-body">{question}</div>}</div>}
				{sheet === 'menu' && (
					<div className="sheet" onClick={(e) => (e.stopPropagation(), setSheet(null))}>
						<div className="sheet-body" onClick={(e) => e.stopPropagation()}>
							<button className="sheet-x" onClick={() => setSheet(null)}>
								✕
							</button>
							{menuButtons}
							{logBox}
						</div>
					</div>
				)}
				{facePicker}
			</div>
		)

	return (
		<div className="console" onClick={() => mode === null && setSel(null)}>
			<div className="tablezone">
				<div className="c-foe">
					{pbBlock(foe)}
					{diceTray(foe)}
					{spellboard(foe, 66)}
					<div className="foe-hand" title={`${s.players[foe].name}’s hand`}>
						{s.players[foe].hand.map((u) => (
							<div key={u} className="card back mini" />
						))}
					</div>
				</div>
				{battlefield(foe, sizes.foeUnit)}
				{promptBar}
				{battlefield(me, sizes.unit)}
				<div className="c-me">
					{pbBlock(me)}
					{diceTray(me)}
					{spellboard(me, sizes.spell)}
				</div>
				{hand}
			</div>
			<div className="side">
				{menuButtons}
				{props.netBadge}
				{props.coach}
				<div className="viewer">{viewerContent ?? <div className="viewer-empty">Tap any card to see it here.</div>}</div>
				{logBox}
			</div>
			{question && <div className="modal">{question}</div>}
			{facePicker}
		</div>
	)
}

// ───────── viewer ─────────

function Viewer({ s, uid, me, myAct, startPay, startAttack, hideHand }: { s: GameState; uid: number; me: PlayerId; myAct: boolean; startPay: (w: 'play' | 'activate', c: number) => void; startAttack: (t: AttackTarget | null, a?: number) => void; hideHand: boolean }) {
	const c = s.inst[uid]
	const d = def(s, uid)
	const t = cardText(c.stub)
	const foe = other(me)
	if (c.zone === 'hand' && c.owner !== me) return null
	if (c.zone === 'hand' && hideHand) return null
	const actions: { key: string; label: ReactNode; why?: string | null; run: () => void; primary?: boolean }[] = []
	if (c.zone === 'hand' && c.owner === me && d.type !== 'Reaction Spell') {
		const why = playProblem(s, me, uid) ?? (suggestDice(s, me, playCost(s, uid)) ? null : 'You don’t have the right dice')
		actions.push({ key: 'play', label: <>Play <CostView cost={playCost(s, uid)} /></>, why: myAct ? why : 'Not your turn', run: () => startPay('play', uid), primary: true })
	}
	const ab = ABILITIES[c.stub]
	if (ab && inPlay(s, uid) && controller(s, uid) === me) {
		const why = abilityProblem(s, me, uid) ?? (suggestDice(s, me, ab.cost) ? null : 'You don’t have the right dice')
		actions.push({ key: 'ab', label: <>{ab.label} <CostView cost={ab.cost} /></>, why: myAct ? why : 'Not your turn', run: () => startPay('activate', uid), primary: true })
	}
	if (myAct && !s.turn.main && c.zone === 'battlefield' && controller(s, uid) === me && canAttackWith(s, uid)) actions.push({ key: 'atk', label: 'Attack with this unit', run: () => startAttack(null, uid) })
	if (myAct && !s.turn.main && controller(s, uid) === foe && (c.zone === 'battlefield' || c.zone === 'pb')) actions.push({ key: 'atkme', label: `Attack ${c.zone === 'pb' ? 'this Phoenixborn' : 'this unit'}`, run: () => startAttack(c.zone === 'pb' ? 'pb' : uid) })
	const dice = diceOn(s, uid)
	return (
		<div className="view">
			<div className="view-img">
				<CardFace stub={c.stub} name={d.name} type={String(d.type)} w={240} />
			</div>
			<div className="view-info">
				<div className="view-name">{d.name}</div>
				<div className="view-type">
					{d.type}
					{c.zone !== 'hand' && c.zone !== 'pb' ? ` · ${s.players[c.owner].name}` : ''}
				</div>
				{t?.text && <div className="view-text"><RichText text={t.text} /></div>}
				{(c.wounds > 0 || c.exhaust > 0 || dice.length > 0) && (
					<div className="view-state">
						{c.wounds > 0 && <span>{c.wounds} wound{c.wounds > 1 ? 's' : ''}</span>}
						{c.exhaust > 0 && <span>exhausted</span>}
						{dice.length > 0 && (
							<span>
								dice on it:{' '}
								{dice.map((x) => (
									<DieChip key={x.id} die={x} size={18} />
								))}
							</span>
						)}
					</div>
				)}
				{ab && <div className="view-help">{ab.help}</div>}
				<div className="view-actions">
					{actions.map((a) => (
						<button key={a.key} className={a.primary && !a.why ? 'primary' : ''} disabled={!!a.why} onClick={a.run} title={a.why ?? ''}>
							{a.label}
							{a.why && <small>{a.why}</small>}
						</button>
					))}
				</div>
			</div>
		</div>
	)
}

// ───────── questions ─────────

function Choice({ s, q, glow, onAnswer, onPeek, onView }: { s: GameState; q: Question; glow: Set<string>; onAnswer: (p: string[]) => void; onPeek: () => void; onView: (uid: number) => void }) {
	const [picked, setPicked] = useState<string[]>(() => (q.defaults ?? []).slice(0, q.max))
	const single = q.max === 1
	const groupCount = q.group ? picked.filter((id) => q.group!.ids.includes(id)).length : 0
	const ok = picked.length >= q.min && picked.length <= q.max && (!q.group || groupCount <= q.group.max)
	const toggle = (id: string) => {
		if (single) return onAnswer([id])
		setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= q.max ? p : [...p, id]))
	}
	const cards = q.options.filter((o) => o.uid !== undefined && o.dieId === undefined)
	const dice = q.options.filter((o) => o.dieId !== undefined)
	const rest = q.options.filter((o) => o.uid === undefined && o.dieId === undefined)
	return (
		<div className="choice" onClick={(e) => e.stopPropagation()}>
			<div className="q-prompt">{q.prompt}</div>
			{cards.length > 0 && (
				<div className="q-cards">
					{cards.map((o) => (
						<div key={o.id} className={`q-card ${picked.includes(o.id) ? 'on' : ''} ${glow.has(o.id) ? 'glow' : ''}`} onClick={() => toggle(o.id)}>
							<CardFace stub={s.inst[o.uid!].stub} name={o.label} type="" w={110} />
							<span>{o.label}</span>
							<button
								className="q-zoom"
								onClick={(e) => {
									e.stopPropagation()
									onView(o.uid!)
									onPeek()
								}}
								title="Look at it"
							>
								🔍
							</button>
						</div>
					))}
				</div>
			)}
			{dice.length > 0 && (
				<div className="q-dice">
					{dice.map((o) => {
						const d = findDie(s, o.dieId!)
						return (
							<div key={o.id} className={`q-die ${picked.includes(o.id) ? 'on' : ''} ${glow.has(o.id) ? 'glow' : ''}`} onClick={() => toggle(o.id)}>
								{d && <DieChip die={d} size={40} />}
								<small>{d?.loc === 'card' && d.on !== undefined ? `on ${nameOf(s, d.on)}` : ''}</small>
							</div>
						)
					})}
				</div>
			)}
			{rest.length > 0 && (
				<div className="q-buttons">
					{rest.map((o) => (
						<button key={o.id} className={`${picked.includes(o.id) ? 'on' : ''} ${glow.has(o.id) ? 'glow' : ''}`} onClick={() => toggle(o.id)}>
							{o.label}
						</button>
					))}
				</div>
			)}
			<div className="q-foot">
				<button onClick={onPeek}>See the table</button>
				{!single && (
					<button className="primary" disabled={!ok} onClick={() => onAnswer(picked)}>
						{q.min === 0 && picked.length === 0 ? 'None — continue' : `Confirm (${picked.length}${q.min === q.max ? `/${q.min}` : ''})`}
					</button>
				)}
				{q.group && groupCount > q.group.max && <span className="error-inline">{q.group.label}</span>}
			</div>
		</div>
	)
}

function LogBox({ lines }: { lines: string[] }) {
	const ref = useRef<HTMLDivElement>(null)
	useEffect(() => {
		if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
	}, [lines.length])
	return (
		<div className="log" ref={ref}>
			{lines.slice(-120).map((l, i) => (
				<div key={i} className={l.startsWith('—') ? 'round' : ''}>
					{l}
				</div>
			))}
		</div>
	)
}

export { CardFace }
