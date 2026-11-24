import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
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
import { other, LEVELS, type AttackTarget, type GameState, type Intent, type Level, type ManualOp, type MeditateItem, type PlayerId, type Question } from '../engine/types'
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

type Drag = { kind: 'hand' | 'unit' | 'die'; id: number | string; x0: number; y0: number; x: number; y: number; active: boolean; touch: boolean }

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
	/** keep questions closed (tutorial intro pages showing) */
	holdQuestion?: boolean
	/** "Manual fixes" tools in the card viewer */
	manual: boolean
	onManual: () => void
	/** forfeit allowed (not in drills) */
	canForfeit?: boolean
	muted: boolean
	onMute: () => void
}

const hoverable = () => typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches

export function Board(props: BoardProps) {
	const { state: s, send, viewer: me, hideHand, hint, layout } = props
	const foe = other(me)
	const W = layout === 'console'
	const [mode, setMode] = useState<Mode>(null)
	const [sel, setSel] = useState<number | null>(null)
	const [hover, setHover] = useState<number | null>(null)
	const [toast, setToast] = useState<string | null>(null)
	const [qHidden, setQHidden] = useState(false)
	const [facePick, setFacePick] = useState<string | null>(null)
	const [sheet, setSheet] = useState<'menu' | null>(null)
	const [pile, setPile] = useState<{ p: PlayerId; which: 'discard' | 'conj' } | null>(null)
	const [banner, setBanner] = useState<{ text: string; key: number } | null>(null)
	const [drag, setDrag] = useState<Drag | null>(null)
	const [confirmForfeit, setConfirmForfeit] = useState(false)
	const dragged = useRef(false)
	const toastTimer = useRef<number | undefined>(undefined)

	const myAct = s.pending.kind === 'act' && s.pending.player === me
	const myQ = s.pending.kind === 'choose' && s.pending.player === me ? s.pending.question : null

	// a new position cancels half-finished actions
	const lastLog = s.log.length
	useEffect(() => {
		setMode(null)
		setFacePick(null)
		setQHidden(false)
	}, [lastLog, s.pending.kind])
	useEffect(() => {
		if (sel !== null && !s.inst[sel]) setSel(null)
	}, [s, sel])

	// "Your turn" banner whenever the turn comes to you
	const turnKey = `${s.round}:${s.active}:${s.phase}`
	const prevTurn = useRef(turnKey)
	useEffect(() => {
		if (prevTurn.current === turnKey) return
		const newRound = !prevTurn.current.startsWith(`${s.round}:`)
		prevTurn.current = turnKey
		if (s.phase === 'turns' && s.active === me && !hideHand) setBanner({ text: newRound ? `Round ${s.round} · your turn` : 'Your turn', key: Date.now() })
	}, [turnKey, s, me, hideHand])
	useEffect(() => {
		if (!banner) return
		const t = window.setTimeout(() => setBanner(null), 1400)
		return () => window.clearTimeout(t)
	}, [banner])

	// Esc closes things
	useEffect(() => {
		const f = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return
			setMode(null)
			setSel(null)
			setPile(null)
			setSheet(null)
			setFacePick(null)
		}
		window.addEventListener('keydown', f)
		return () => window.removeEventListener('keydown', f)
	}, [])

	// on phones, bring the glowing hint into view
	useEffect(() => {
		if (W || !hint) return
		const t = window.setTimeout(() => document.querySelector('.pocket .p-foe .glow, .pocket .p-me .glow')?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }), 250)
		return () => window.clearTimeout(t)
	}, [hint, W])

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
			if (!W) setSel(null)
		}
		return err
	}

	// ───── starting actions ─────
	const startPay = (what: 'play' | 'activate', card: number) => {
		const why = what === 'play' ? playProblem(s, me, card) : abilityProblem(s, me, card)
		if (why) return flash(why)
		const c = what === 'play' ? playCost(s, card) : ABILITIES[s.inst[card].stub].cost
		const dice = suggestDice(s, me, c)
		if (c.magic.length === 0) return go({ t: what, player: me, card, dice: [] })
		if (!dice) return flash('You don’t have the right dice for that')
		setMode({ k: 'pay', what, card, dice, reqs: c.magic })
		setSel(null)
	}
	const startAttack = (target: AttackTarget | null, attacker?: number) => {
		setMode({ k: 'attack', target, attackers: attacker !== undefined ? [attacker] : [] })
		if (!W) setSel(null)
	}
	const attackNow = (target: AttackTarget, attackers: number[]) => {
		const err = attackProblem(s, me, target, attackers)
		if (err) return flash(err)
		go({ t: 'attack', player: me, target, attackers })
	}

	// ───── taps ─────
	const tapCard = (uid: number) => {
		if (dragged.current) return
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
		setSel(sel === uid ? null : uid)
	}
	const tapDie = (id: string) => {
		if (dragged.current) return
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

	// ───── drag and drop (mouse and fingers) ─────
	const beginDrag = (kind: Drag['kind'], id: number | string, e: RPointerEvent) => {
		if (!myAct || mode !== null || e.button > 0) return
		setDrag({ kind, id, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, active: false, touch: e.pointerType !== 'mouse' })
	}
	const dragRef = useRef<Drag | null>(null)
	dragRef.current = drag
	const dropRef = useRef<(d: Drag, x: number, y: number) => void>(() => {})
	dropRef.current = (d, x, y) => {
		dragged.current = true
		window.setTimeout(() => (dragged.current = false), 60)
		const el = document.elementFromPoint(x, y) as HTMLElement | null
		const uidEl = el?.closest('[data-uid]') as HTMLElement | null
		const target = uidEl ? Number(uidEl.dataset.uid) : null
		if (d.kind === 'hand') {
			if (el?.closest('.hand')) return
			startPay('play', d.id as number)
		} else if (d.kind === 'unit') {
			if (target === null || !s.inst[target] || controller(s, target) !== foe) return
			if (s.inst[target].zone === 'pb') {
				const err = attackProblem(s, me, 'pb', [d.id as number])
				if (err) return flash(err)
				setMode({ k: 'attack', target: 'pb', attackers: [d.id as number] })
				flash('Add more attackers if you like, then press Attack!')
			} else if (s.inst[target].zone === 'battlefield') attackNow(target, [d.id as number])
		} else if (d.kind === 'die') {
			if (target === null) return
			const err = dicePowerProblem(s, me, d.id as string, target)
			if (err) return flash(err)
			go({ t: 'dicePower', player: me, die: d.id as string, target })
		}
	}
	const dragging = drag !== null
	useEffect(() => {
		if (!dragging) return
		const move = (e: PointerEvent) => {
			setDrag((d) => {
				if (!d) return d
				const dx = e.clientX - d.x0
				const dy = e.clientY - d.y0
				let active = d.active
				// on touch screens only an upward drag starts, so rows still scroll sideways
				if (!active && Math.hypot(dx, dy) > 10) active = d.touch ? dy < 0 && Math.abs(dy) > Math.abs(dx) : true
				return { ...d, x: e.clientX, y: e.clientY, active }
			})
		}
		const up = (e: PointerEvent) => {
			const d = dragRef.current
			setDrag(null)
			if (d?.active) dropRef.current(d, e.clientX, e.clientY)
		}
		const cancel = () => setDrag(null)
		window.addEventListener('pointermove', move)
		window.addEventListener('pointerup', up)
		window.addEventListener('pointercancel', cancel)
		return () => {
			window.removeEventListener('pointermove', move)
			window.removeEventListener('pointerup', up)
			window.removeEventListener('pointercancel', cancel)
		}
	}, [dragging])

	// ───── highlights ─────
	const hintCards = new Set(hint?.cards ?? [])
	const hintDice = new Set(hint?.dice ?? [])
	const hintBtn = new Set(hint?.buttons ?? [])
	const attackFrom = s.attack?.attackers[0]
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
		if (drag?.active && drag.kind === 'unit' && controller(s, uid) === foe && (s.inst[uid].zone === 'battlefield' || s.inst[uid].zone === 'pb')) return 'valid'
		if (drag?.active && drag.kind === 'die') {
			const d = findDie(s, drag.id as string)
			if (d && dicePowerTargets(s, me, d).includes(uid)) return 'valid'
		}
		if (s.attack && attackFrom !== undefined && s.inst[attackFrom]) {
			if (s.attack.attackers.includes(uid)) return 'attacker'
			if (s.attack.target === uid || (s.attack.target === 'pb' && uid === s.players[other(s.inst[attackFrom].owner)].pb)) return 'target'
		}
		return null
	}

	/** Ability button on one of my cards, when its ability can be used right now. */
	const chipFor = (uid: number) => {
		if (!myAct || mode !== null || controller(s, uid) !== me) return undefined
		const ab = ABILITIES[s.inst[uid].stub]
		if (!ab || abilityProblem(s, me, uid) || !suggestDice(s, me, ab.cost)) return undefined
		return { label: ab.label.replace(/^Summon /, ''), onClick: () => startPay('activate', uid), glow: hintCards.has(uid) }
	}
	const cardProps = (uid: number, opts: { drag?: Drag['kind']; chip?: boolean } = {}) => ({
		s,
		uid,
		onClick: tapCard,
		onHover: hoverable() ? setHover : undefined,
		onPointerDown: opts.drag ? (u: number, e: RPointerEvent) => beginDrag(opts.drag!, u, e) : undefined,
		glow: hintCards.has(uid),
		selected: sel === uid,
		mark: markOf(uid),
		chip: opts.chip ? chipFor(uid) : undefined,
		className: drag?.active && drag.id === uid ? 'dragging' : '',
	})
	const dieProps = (id: string) => {
		const inPay = mode?.k === 'pay' && mode.dice.includes(id)
		const medded = mode?.k === 'med' && mode.items.some((it) => it.die === id)
		return { glow: hintDice.has(id) || (mode?.k === 'power' && mode.die === id), selected: inPay || medded, onClick: () => tapDie(id) }
	}

	// ───── sizes ─────
	const sz = W ? { pb: 96, unit: 118, foeUnit: 104, spell: 80, foeSpell: 66, hand: 110, die: 30, pile: 56 } : { pb: 56, unit: 84, foeUnit: 72, spell: 54, foeSpell: 46, hand: 74, die: 26, pile: 38 }

	// ───── pieces ─────
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
							<span key={`${d.id}:${d.level}`} className="die-wrap roll" onPointerDown={p === me && d.level === 'power' ? (e) => beginDrag('die', d.id, e) : undefined}>
								<DieChip die={d} size={sz.die} {...(p === me ? dieProps(d.id) : { glow: hintDice.has(d.id) })} />
							</span>
						))}
					{act.length === 0 && <span className="empty">no active dice</span>}
				</div>
				{ex.length > 0 && (
					<div className="pool exhausted" title="Exhausted dice pool">
						{ex.map((d) => (
							<DieChip key={d.id} die={d} size={Math.round(sz.die * 0.62)} dim />
						))}
					</div>
				)}
			</div>
		)
	}

	const spellboard = (p: PlayerId, w: number) => {
		const pl = s.players[p]
		const off = Math.round(w * 0.24)
		return (
			<div className="spellboard" title={`Spellboard (${pl.spellboard.length}/${spellboardSize(s, p)} slots)`}>
				{pl.spellboard.map((st) => {
					// the ability button goes on the copy that can be used
					const usable = p === me ? st.find((u) => chipFor(u)) : undefined
					return (
						<div className="stack" key={st[0]} style={{ width: w + (st.length - 1) * off }}>
							{st.map((u, i) => (
								<div key={u} className="stack-item" style={{ left: i * off, zIndex: i }}>
									<Card {...cardProps(u)} w={w} chip={u === usable ? chipFor(u) : undefined} />
								</div>
							))}
						</div>
					)
				})}
				{W &&
					Array.from({ length: Math.max(0, spellboardSize(s, p) - pl.spellboard.length) }, (_, i) => (
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
					<Card key={u} {...cardProps(u, { drag: p === me ? 'unit' : undefined, chip: p === me })} w={w} />
				))}
				{pl.battlefield.length === 0 && <div className="bf-empty">{p === me ? 'Your battlefield' : `${pl.name}’s battlefield`}</div>}
				<div className="bf-count">
					{pl.battlefield.length}/{battlefieldSize(s, p)}
				</div>
			</div>
		)
	}

	/** Draw pile, discard pile (top card showing; tap to look through) and conjuration pile. */
	const piles = (p: PlayerId, w: number) => {
		const pl = s.players[p]
		const top = pl.discard[pl.discard.length - 1]
		const h = Math.round(w * 1.4)
		return (
			<div className="piles">
				<div className="pile" title="Draw pile">
					<div className="card back" style={{ width: w, height: h }} />
					<span className="n">{pl.deck.length}</span>
					<small>deck</small>
				</div>
				<div className="pile tap" title="Discard pile — tap to look through it" onClick={(e) => (e.stopPropagation(), setPile({ p, which: 'discard' }))}>
					{top !== undefined ? (
						<div className="pile-top" style={{ width: w, height: h }}>
							<CardFace stub={s.inst[top].stub} name={nameOf(s, top)} type="" w={w} />
						</div>
					) : (
						<div className="slot" style={{ width: w, height: h }} />
					)}
					<span className="n">{pl.discard.length}</span>
					<small>discard</small>
				</div>
				<div className="pile tap" title="Conjuration pile — tap to look through it" onClick={(e) => (e.stopPropagation(), setPile({ p, which: 'conj' }))}>
					<div className="card back conj" style={{ width: w, height: h }} />
					<span className="n">{pl.conj.length}</span>
					<small>conjure</small>
				</div>
			</div>
		)
	}

	const pbBlock = (p: PlayerId, compact = false) => {
		const pl = s.players[p]
		return (
			<div className={`pb-block ${compact ? 'compact' : ''}`}>
				<Card {...cardProps(pl.pb, { chip: p === me })} w={sz.pb} />
				<div className="pb-info">
					<div className="pname">
						{pl.name} {s.first === p && <span className="first" title="First player">◈</span>}
						{pl.guarded && <span className="guarded" title="Guarded this round">🛡</span>}
					</div>
					<div className="lifebar" title="Phoenixborn life left">
						<div style={{ width: `${(100 * pbLeft(s, p)) / pbLife(s, p)}%` }} />
						<span>
							{pbLeft(s, p)} / {pbLife(s, p)}
						</span>
					</div>
					<div className="counts">
						<span title="Cards in hand">✋ {pl.hand.length}</span>
						{!W && (
							<>
								<span title="Draw pile">▤ {pl.deck.length}</span>
								<span className="tap" title="Discard pile" onClick={(e) => (e.stopPropagation(), setPile({ p, which: 'discard' }))}>
									⌫ {pl.discard.length}
								</span>
								<span className="tap" title="Conjuration pile" onClick={(e) => (e.stopPropagation(), setPile({ p, which: 'conj' }))}>
									✧ {pl.conj.length}
								</span>
							</>
						)}
					</div>
					{!W && diceTray(p)}
				</div>
			</div>
		)
	}

	const hand = (
		<div className={`hand ${hideHand ? 'hidden' : ''}`}>
			{s.players[me].hand.map((u) =>
				hideHand ? (
					<div key={u} className="card back" style={{ width: sz.hand, height: Math.round(sz.hand * 1.4) }} />
				) : (
					<Card
						key={u}
						{...cardProps(u, { drag: 'hand' })}
						w={sz.hand}
						plain
						className={`${myAct && !playProblem(s, me, u) && suggestDice(s, me, playCost(s, u)) ? 'can' : ''} ${drag?.active && drag.id === u ? 'dragging' : ''}`}
					/>
				),
			)}
		</div>
	)

	// ───── status / prompt ─────
	let barText: ReactNode
	const buttons: ReactNode[] = []
	const btn = (key: string, label: string, onClick: () => void, opts: { primary?: boolean; disabled?: boolean } = {}) => (
		<button key={key} className={`${opts.primary ? 'primary' : ''} ${hintBtn.has(key) ? 'glow' : ''}`} disabled={opts.disabled} onClick={onClick}>
			{label}
		</button>
	)
	if (s.pending.kind === 'over') {
		const w = s.pending.winner
		barText = <b className="big">{w === null ? 'A draw!' : w === me ? 'Victory!' : `${s.players[w].name} wins.`}</b>
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
		const err = mode.target === null ? 'pick' : attackProblem(s, me, mode.target, mode.attackers)
		barText =
			mode.target === null ? (
				<>
					<b>Attack:</b> tap their Phoenixborn or one of their units.
				</>
			) : mode.target === 'pb' ? (
				<>
					<b>Attack {nameOf(s, s.players[foe].pb)}:</b> tap your units to send ({mode.attackers.length} chosen).
				</>
			) : (
				<>
					<b>Attack {nameOf(s, mode.target)}:</b> tap one of your units.
				</>
			)
		buttons.push(btn('cancel', 'Cancel', () => setMode(null)))
		buttons.push(btn('attack', 'Attack!', () => mode.target !== null && attackNow(mode.target, mode.attackers), { primary: true, disabled: !!err }))
	} else if (mode?.k === 'power') {
		const d = findDie(s, mode.die)
		barText = <>Dice power: tap the card to put this {d?.magic} die on{d?.magic === 'astral' ? ' — it prevents 1 damage' : ' — it charges that card'}.</>
		buttons.push(btn('cancel', 'Cancel', () => setMode(null)))
	} else if (mode?.k === 'med') {
		barText = mode.src ? <>Now tap a die in your active pool to choose its new side.</> : <>Meditate: tap a card in your hand, a ready spell, or Top of deck — each discard sets one die to any side.</>
		buttons.push(btn('cancel', 'Cancel', () => setMode(null)))
		buttons.push(btn('deck', 'Top of deck', () => setMode({ ...mode, src: { from: 'deck' } }), { disabled: s.players[me].deck.length <= mode.items.filter((x) => x.from === 'deck').length }))
		buttons.push(btn('confirm', `Done (${mode.items.length})`, () => go({ t: 'meditate', player: me, items: mode.items }), { primary: true, disabled: mode.items.length === 0 }))
	} else if (myQ) {
		barText = props.holdQuestion ? <>Read the tutorial pages first.</> : <>Your decision — see the question.</>
		if (qHidden && !props.holdQuestion) buttons.push(btn('show', 'Show the question', () => setQHidden(false), { primary: true }))
	} else if (s.pending.kind === 'choose') {
		barText = <>Waiting for {s.players[s.pending.player].name}…</>
	} else if (myAct) {
		barText = (
			<>
				<b>Your turn</b> <span className="dim">· round {s.round}</span>
				<span className="actions-left">
					<span className={s.turn.main ? 'used' : ''}>◆ main</span>
					<span className={s.turn.side ? 'used' : ''}>◇ side</span>
				</span>
			</>
		)
		if (!s.turn.main) buttons.push(btn('attack', 'Attack', () => startAttack(null)))
		if (!s.turn.side) buttons.push(btn('meditate', 'Meditate', () => setMode({ k: 'med', items: [], src: null })))
		if (!s.turn.main) buttons.push(btn('pass', 'Pass', () => go({ t: 'pass', player: me })))
		else buttons.push(btn('endTurn', 'End turn', () => go({ t: 'endTurn', player: me }), { primary: true }))
	} else {
		barText = (
			<>
				{s.players[s.active].name}’s turn <span className="dim">· round {s.round}</span>
			</>
		)
	}

	const promptBar = (
		<div className={`prompt ${myAct || myQ ? 'mine' : ''}`} onClick={(e) => e.stopPropagation()}>
			<div className="ptext">{barText}</div>
			{buttons.length > 0 && <div className="pbtns">{buttons}</div>}
			{toast && <div className="toast">{toast}</div>}
		</div>
	)

	// ───── viewer ─────
	const viewing = sel ?? (W ? hover : null)
	const viewerContent =
		viewing !== null && s.inst[viewing] ? (
			<Viewer s={s} uid={viewing} me={me} myAct={myAct} startPay={startPay} startAttack={startAttack} hideHand={hideHand} manual={props.manual} onManual={(card, op) => go({ t: 'manual', player: me, card, op })} onView={setSel} big={W} />
		) : null

	// ───── question (floating; the table stays visible) ─────
	const question =
		myQ && !qHidden && !props.holdQuestion ? (
			<div className="qpanel" onClick={(e) => e.stopPropagation()}>
				<Choice key={`${s.log.length}:${myQ.prompt}:${s.queue[0]?.answers.length ?? 0}`} s={s} q={myQ} glow={new Set(hint?.options ?? [])} onHide={() => setQHidden(true)} onAnswer={(picks) => go({ t: 'choose', player: me, picks })} onView={setSel} />
			</div>
		) : null

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

	const pileList = pile ? (pile.which === 'discard' ? s.players[pile.p].discard.slice().reverse() : s.players[pile.p].conj) : []
	const pileBrowser = pile ? (
		<div className="pilebrowser" onClick={() => setPile(null)}>
			<div className="pile-body" onClick={(e) => e.stopPropagation()}>
				<div className="pile-head">
					<b>
						{s.players[pile.p].name}’s {pile.which === 'discard' ? 'discard pile' : 'conjuration pile'} ({pileList.length})
					</b>
					<button onClick={() => setPile(null)}>Close</button>
				</div>
				<div className="pile-cards">
					{pileList.map((u) => (
						<div key={u} className="pile-card" onClick={() => (setSel(u), setPile(null))}>
							<CardFace stub={s.inst[u].stub} name={nameOf(s, u)} type="" w={W ? 120 : 92} />
						</div>
					))}
					{pileList.length === 0 && <div className="dim">Empty.</div>}
				</div>
			</div>
		</div>
	) : null

	const logBox = <LogBox lines={s.log} />

	const menuButtons = (
		<div className="menu-buttons" onClick={(e) => e.stopPropagation()}>
			<button onClick={props.onMenu} title="Back to the home screen (the game is saved)">
				☰ Home
			</button>
			{props.onUndo && <button onClick={props.onUndo}>↶ Undo</button>}
			<select value={props.layoutChoice} onChange={(e) => props.onLayout(e.target.value as LayoutChoice)} title="Screen layout">
				<option value="auto">Layout: auto</option>
				<option value="console">Table</option>
				<option value="pocket">Phone</option>
			</select>
			<button onClick={props.onMute} title="Sound on/off">
				{props.muted ? '🔇' : '🔊'}
			</button>
			<label className="switch" title="Tools to fix mistakes by hand (wounds, exhaustion, discard)">
				<input type="checkbox" checked={props.manual} onChange={props.onManual} /> Manual fixes
			</label>
			{props.canForfeit !== false && s.pending.kind !== 'over' && (
				<button className={confirmForfeit ? 'danger' : ''} onClick={() => (confirmForfeit ? (go({ t: 'forfeit', player: me }), setConfirmForfeit(false)) : setConfirmForfeit(true))} onBlur={() => setConfirmForfeit(false)}>
					{confirmForfeit ? 'Tap again to forfeit' : '⚑ Forfeit'}
				</button>
			)}
		</div>
	)

	const dragLayer =
		drag?.active &&
		createPortal(
			<div className="draglayer">
				{drag.kind === 'hand' ? (
					<div className="drag-ghost" style={{ left: drag.x, top: drag.y }}>
						<CardFace stub={s.inst[drag.id as number].stub} name="" type="" w={110} />
					</div>
				) : (
					<svg className="drag-arrow">
						<defs>
							<marker id="ah" markerWidth="10" markerHeight="10" refX="6" refY="5" orient="auto">
								<path d="M0,0 L10,5 L0,10 z" />
							</marker>
						</defs>
						<line x1={drag.x0} y1={drag.y0} x2={drag.x} y2={drag.y} markerEnd="url(#ah)" />
					</svg>
				)}
			</div>,
			document.body,
		)

	const bannerEl = banner ? (
		<div key={banner.key} className="banner">
			<span>{banner.text}</span>
		</div>
	) : null

	if (!W)
		return (
			<div className="pocket" onClick={() => setSel(null)}>
				<div className="p-foe">
					<div className="p-foebar">
						{pbBlock(foe, true)}
						<button className="p-menu" onClick={(e) => (e.stopPropagation(), setSheet('menu'))}>
							☰
						</button>
					</div>
					{s.players[foe].spellboard.length > 0 && <div className="p-row">{spellboard(foe, sz.foeSpell)}</div>}
					<div className="p-row">{battlefield(foe, sz.foeUnit)}</div>
				</div>
				{props.netBadge}
				{props.coach && <div className="p-coach">{props.coach}</div>}
				<div className="p-me">
					<div className="p-row">{battlefield(me, sz.unit)}</div>
					<div className="p-row p-spells">
						{spellboard(me, sz.spell)}
						{s.players[me].spellboard.length === 0 && <span className="dim small">Spellboard empty (0/{spellboardSize(s, me)})</span>}
					</div>
					<div className="p-mine">{pbBlock(me, true)}</div>
				</div>
				<div className="p-dock" onClick={(e) => e.stopPropagation()}>
					{promptBar}
					<div className="p-hand">{hand}</div>
				</div>
				{viewerContent && (
					<div className="float-viewer" onClick={(e) => e.stopPropagation()}>
						<button className="fv-x" onClick={() => setSel(null)}>
							✕
						</button>
						{viewerContent}
					</div>
				)}
				{question}
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
				{pileBrowser}
				{facePicker}
				{bannerEl}
				{dragLayer}
			</div>
		)

	return (
		<div className="console" onClick={() => mode === null && setSel(null)}>
			<div className="tablezone">
				<div className="mat foe">
					{pbBlock(foe)}
					{diceTray(foe)}
					{spellboard(foe, sz.foeSpell)}
					{piles(foe, sz.pile - 8)}
				</div>
				{battlefield(foe, sz.foeUnit)}
				<div className="divider" />
				{battlefield(me, sz.unit)}
				<div className="mat me">
					{pbBlock(me)}
					{diceTray(me)}
					{spellboard(me, sz.spell)}
					{piles(me, sz.pile)}
				</div>
				{hand}
				{question}
			</div>
			<div className="side">
				{menuButtons}
				{props.netBadge}
				{promptBar}
				{props.coach}
				<div className="viewer">{viewerContent ?? <div className="viewer-empty">Tap or point at any card to see it here.</div>}</div>
				{logBox}
			</div>
			{pileBrowser}
			{facePicker}
			{bannerEl}
			{dragLayer}
		</div>
	)
}

// ───────── viewer ─────────

const MANUAL: { op: ManualOp; label: string }[] = [
	{ op: 'wound+', label: '+1 wound' },
	{ op: 'wound-', label: '−1 wound' },
	{ op: 'exhaust+', label: 'Exhaust' },
	{ op: 'exhaust-', label: 'Ready' },
	{ op: 'hand', label: 'To hand' },
	{ op: 'discard', label: 'Discard' },
]

interface ViewerProps {
	s: GameState
	uid: number
	me: PlayerId
	myAct: boolean
	startPay: (w: 'play' | 'activate', c: number) => void
	startAttack: (t: AttackTarget | null, a?: number) => void
	hideHand: boolean
	manual: boolean
	onManual: (card: number, op: ManualOp) => void
	onView: (uid: number) => void
	big: boolean
}

function Viewer({ s, uid, me, myAct, startPay, startAttack, hideHand, manual, onManual, onView, big }: ViewerProps) {
	const c = s.inst[uid]
	const d = def(s, uid)
	const t = cardText(c.stub)
	const foe = other(me)
	if (c.zone === 'hand' && c.owner !== me) return null
	if (c.zone === 'hand' && hideHand) return null
	const actions: { key: string; label: ReactNode; why?: string | null; run: () => void; primary?: boolean }[] = []
	if (c.zone === 'hand' && c.owner === me && d.type !== 'Reaction Spell') {
		const why = playProblem(s, me, uid) ?? (suggestDice(s, me, playCost(s, uid)) ? null : 'You don’t have the right dice')
		actions.push({
			key: 'play',
			label: (
				<>
					Play <CostView cost={playCost(s, uid)} />
				</>
			),
			why: myAct ? why : 'Not your turn',
			run: () => startPay('play', uid),
			primary: true,
		})
	}
	if (c.zone === 'hand' && d.type === 'Reaction Spell') actions.push({ key: 'react', label: 'Reaction spell', why: 'You’ll be asked when its moment comes', run: () => {} })
	const ab = ABILITIES[c.stub]
	if (ab && inPlay(s, uid) && controller(s, uid) === me) {
		const why = abilityProblem(s, me, uid) ?? (suggestDice(s, me, ab.cost) ? null : 'You don’t have the right dice')
		actions.push({
			key: 'ab',
			label: (
				<>
					{ab.label} <CostView cost={ab.cost} />
				</>
			),
			why: myAct ? why : 'Not your turn',
			run: () => startPay('activate', uid),
			primary: true,
		})
	}
	if (myAct && !s.turn.main && c.zone === 'battlefield' && controller(s, uid) === me && canAttackWith(s, uid)) actions.push({ key: 'atk', label: 'Attack with this unit', run: () => startAttack(null, uid) })
	if (myAct && !s.turn.main && controller(s, uid) === foe && (c.zone === 'battlefield' || c.zone === 'pb')) actions.push({ key: 'atkme', label: `Attack ${c.zone === 'pb' ? 'this Phoenixborn' : 'this unit'}`, run: () => startAttack(c.zone === 'pb' ? 'pb' : uid) })
	const dice = diceOn(s, uid)
	const zoneName: Record<string, string> = { hand: 'in hand', battlefield: 'battlefield', spellboard: 'spellboard', discard: 'discard pile', conj: 'conjuration pile', attached: 'attached', pb: 'Phoenixborn', deck: 'deck', stack: 'being played' }
	return (
		<div className={`view ${big ? 'big' : ''}`}>
			<div className="view-img">
				<CardFace stub={c.stub} name={d.name} type={String(d.type)} w={big ? 300 : 150} />
			</div>
			<div className="view-info">
				<div className="view-name">{d.name}</div>
				<div className="view-type">
					{d.type} · {s.players[c.owner].name} · {zoneName[c.zone] ?? c.zone}
				</div>
				{t?.text && (
					<div className="view-text">
						<RichText text={t.text} />
					</div>
				)}
				{(c.wounds > 0 || c.exhaust > 0 || dice.length > 0 || c.alts.length > 0 || (c.zone === 'attached' && c.host !== undefined)) && (
					<div className="view-state">
						{c.wounds > 0 && (
							<span className="w">
								{c.wounds} wound{c.wounds > 1 ? 's' : ''}
							</span>
						)}
						{c.exhaust > 0 && <span>exhausted</span>}
						{dice.length > 0 && (
							<span>
								dice on it:{' '}
								{dice.map((x) => (
									<DieChip key={x.id} die={x} size={18} />
								))}
							</span>
						)}
						{c.alts.length > 0 && (
							<span>
								attached:{' '}
								{c.alts.map((a) => (
									<button key={a} className="linkish" onClick={() => onView(a)}>
										{nameOf(s, a)}
									</button>
								))}
							</span>
						)}
						{c.zone === 'attached' && c.host !== undefined && (
							<span>
								attached to{' '}
								<button className="linkish" onClick={() => onView(c.host!)}>
									{nameOf(s, c.host)}
								</button>
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
				{manual && inPlay(s, uid) && (
					<div className="manual">
						<small>Manual fixes</small>
						<div>
							{MANUAL.filter((m) => !(c.zone === 'pb' && (m.op === 'hand' || m.op === 'discard'))).map((m) => (
								<button key={m.op} onClick={() => onManual(uid, m.op)}>
									{m.label}
								</button>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	)
}

// ───────── questions ─────────

function Choice({ s, q, glow, onAnswer, onHide, onView }: { s: GameState; q: Question; glow: Set<string>; onAnswer: (p: string[]) => void; onHide: () => void; onView: (uid: number) => void }) {
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
		<div className="choice">
			<div className="q-head">
				<div className="q-prompt">{q.prompt}</div>
				<button className="q-hide" onClick={onHide} title="Hide this to look at the table">
					Hide
				</button>
			</div>
			{cards.length > 0 && (
				<div className="q-cards">
					{cards.map((o) => (
						<div key={o.id} className={`q-card ${picked.includes(o.id) ? 'on' : ''} ${glow.has(o.id) ? 'glow' : ''}`} onClick={() => toggle(o.id)}>
							<CardFace stub={s.inst[o.uid!].stub} name={o.label} type="" w={104} />
							<span>{o.label}</span>
							<button
								className="q-zoom"
								onClick={(e) => {
									e.stopPropagation()
									onView(o.uid!)
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
			{!single && (
				<div className="q-foot">
					<button className="primary" disabled={!ok} onClick={() => onAnswer(picked)}>
						{q.min === 0 && picked.length === 0 ? 'None — continue' : `Confirm (${picked.length}${q.min === q.max ? `/${q.min}` : ''})`}
					</button>
					{q.group && groupCount > q.group.max && <span className="error-inline">{q.group.label}</span>}
				</div>
			)}
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
			{lines.slice(-150).map((l, i) => (
				<div key={i} className={l.startsWith('—') ? 'round' : l.startsWith('Manual fix') ? 'fix' : ''}>
					{l}
				</div>
			))}
		</div>
	)
}

export { CardFace }
