import { useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { attackOf, charge, def, diceOn, lifeOf, recoverOf, isUnit, pbLife } from '../engine/engine'
import type { GameState } from '../engine/types'
import { imageUrl } from '../data/cardText'
import { DieChip } from './Die'

/** Where each card was last drawn, so a card that moves (hand → battlefield, play → discard) flies there. */
const lastRect = new Map<number, { x: number; y: number; w: number }>()

export interface CardProps {
	s: GameState
	uid: number
	w: number
	onClick?: (uid: number) => void
	onHover?: (uid: number | null) => void
	onPointerDown?: (uid: number, e: RPointerEvent) => void
	glow?: boolean
	selected?: boolean
	/** attack-mode highlights */
	mark?: 'target' | 'attacker' | 'valid' | null
	/** hide live stats (hand cards) */
	plain?: boolean
	className?: string
	/** a ready-to-use ability button drawn on the card */
	chip?: { label: string; onClick: () => void; glow?: boolean }
}

/** A card image with its live state drawn on top: wounds, exhaustion, dice, attachments, stats. */
export function Card({ s, uid, w, onClick, onHover, onPointerDown, glow, selected, mark, plain, className, chip }: CardProps) {
	const c = s.inst[uid]
	const d = def(s, uid)
	const h = Math.round(w * 1.4)
	const unit = isUnit(s, uid)
	const pb = d.type === 'Phoenixborn'
	const dice = diceOn(s, uid)
	const ref = useRef<HTMLDivElement>(null)
	const mounted = useRef(false)

	// fly from where this card was last seen
	useLayoutEffect(() => {
		const el = ref.current
		if (!el) return
		const r = el.getBoundingClientRect()
		const prev = lastRect.get(uid)
		const first = !mounted.current
		mounted.current = true
		lastRect.set(uid, { x: r.left, y: r.top, w: r.width })
		if (!first || !prev || r.width === 0 || typeof el.animate !== 'function') return
		const dx = prev.x - r.left
		const dy = prev.y - r.top
		if (Math.hypot(dx, dy) < 30) return
		const scale = r.width / el.offsetWidth || 1
		el.animate([{ transform: `translate(${dx / scale}px, ${dy / scale}px) scale(${prev.w / r.width})`, zIndex: 50 }, { transform: 'none', zIndex: 50 }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' })
	})

	const cls = ['card', glow ? 'glow' : '', selected ? 'sel' : '', mark ? `m-${mark}` : '', c.exhaust > 0 && !plain ? 'exh' : '', className ?? ''].join(' ')
	return (
		<div
			ref={ref}
			className={cls}
			style={{ width: w, height: h }}
			onClick={onClick ? (e) => (e.stopPropagation(), onClick(uid)) : undefined}
			onMouseEnter={onHover ? () => onHover(uid) : undefined}
			onMouseLeave={onHover ? () => onHover(null) : undefined}
			onPointerDown={onPointerDown ? (e) => onPointerDown(uid, e) : undefined}
			data-uid={uid}
		>
			<CardFace stub={c.stub} name={d.name} type={String(d.type)} w={w} />
			{!plain && (
				<>
					{c.exhaust > 0 && <div className="tok exhaust">⟳{c.exhaust > 1 ? c.exhaust : ''}</div>}
					{c.wounds > 0 && <div className="tok wound">{c.wounds}</div>}
					{dice.length > 0 && (
						<div className="on-dice">
							{dice.map((x) => (
								<DieChip key={x.id} die={x} size={Math.max(18, Math.round(w / 5.5))} />
							))}
						</div>
					)}
					{c.alts.length > 0 && (
						<div className="alts">
							{c.alts.map((a) => (
								<span key={a} className="alt" onClick={onClick ? (e) => (e.stopPropagation(), onClick(a)) : undefined}>
									{def(s, a).name}
								</span>
							))}
						</div>
					)}
					{unit && (
						<div className="stats">
							<span className="atk" title="Attack">
								⚔{attackOf(s, uid)}
							</span>
							<span className="life" title="Life left">
								♥{lifeOf(s, uid) - c.wounds}
							</span>
							<span className="rec" title="Recover">
								↻{recoverOf(s, uid)}
							</span>
						</div>
					)}
					{pb && (
						<div className="stats pbstats">
							<span className="life">♥{pbLife(s, c.owner) - c.wounds}</span>
						</div>
					)}
					{charge(s, uid) > 0 && unit && <div className="charged">charged</div>}
					{chip && (
						<button className={`ab-chip ${chip.glow ? 'glow' : ''}`} onClick={(e) => (e.stopPropagation(), chip.onClick())} onPointerDown={(e) => e.stopPropagation()}>
							⚡ {chip.label}
						</button>
					)}
				</>
			)}
		</div>
	)
}

/** Just the picture (falls back to a drawn card with the name if the image can't load). */
export function CardFace({ stub, name, type, w }: { stub: string; name: string; type: string; w: number }) {
	const [bad, setBad] = useState(false)
	if (bad)
		return (
			<div className="face fallback" style={{ fontSize: Math.max(9, w / 11) }}>
				<b>{name}</b>
				<small>{type}</small>
			</div>
		)
	return <img className="face" src={imageUrl(stub)} alt={name} draggable={false} loading="lazy" onError={() => setBad(true)} />
}
