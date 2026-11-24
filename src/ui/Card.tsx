import { useState } from 'react'
import { attackOf, charge, def, diceOn, lifeOf, recoverOf, isUnit, pbLife } from '../engine/engine'
import type { GameState } from '../engine/types'
import { imageUrl } from '../data/cardText'
import { DieChip } from './Die'

export interface CardProps {
	s: GameState
	uid: number
	w: number
	onClick?: (uid: number) => void
	glow?: boolean
	selected?: boolean
	/** attack-mode highlights */
	mark?: 'target' | 'attacker' | 'valid' | null
	/** hide live stats (hand cards) */
	plain?: boolean
	className?: string
}

/** A card image with its live state drawn on top: wounds, exhaustion, dice, attachments, stats. */
export function Card({ s, uid, w, onClick, glow, selected, mark, plain, className }: CardProps) {
	const c = s.inst[uid]
	const d = def(s, uid)
	const h = Math.round(w * 1.4)
	const unit = isUnit(s, uid)
	const pb = d.type === 'Phoenixborn'
	const dice = diceOn(s, uid)
	const cls = ['card', glow ? 'glow' : '', selected ? 'sel' : '', mark ? `m-${mark}` : '', c.exhaust > 0 && !plain ? 'exh' : '', className ?? ''].join(' ')
	return (
		<div className={cls} style={{ width: w, height: h }} onClick={onClick ? (e) => (e.stopPropagation(), onClick(uid)) : undefined} data-uid={uid}>
			<CardFace stub={c.stub} name={d.name} type={String(d.type)} w={w} />
			{!plain && (
				<>
					{c.exhaust > 0 && <div className="tok exhaust">⟳{c.exhaust > 1 ? c.exhaust : ''}</div>}
					{c.wounds > 0 && <div className="tok wound">{c.wounds}</div>}
					{dice.length > 0 && (
						<div className="on-dice">
							{dice.map((x) => (
								<DieChip key={x.id} die={x} size={Math.max(16, Math.round(w / 6))} />
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
