// "Abilities at a glance": the Phoenixborn cards (and, in Red Rains, the chimera's behaviour and
// ultimate cards) shown off to the side so their special abilities are always in view.

import { useState } from 'react'
import { abilitiesOf, nameOf } from '../engine/engine'
import { behaviourText, ultimateThreshold } from '../engine/solo'
import type { GameState, PlayerId } from '../engine/types'
import { cardText, imageUrl } from '../data/cardText'
import { CardFace } from './Card'
import { RichText } from './Die'

interface Entry {
	key: string
	img: string
	title: string
	sub: string
	lines: string[]
	/** a card in play: open it in the viewer instead of zooming the picture */
	uid?: number
}

function entries(s: GameState, me: PlayerId): Entry[] {
	const out: Entry[] = []
	for (const p of [me, (1 - me) as PlayerId]) {
		const pb = s.players[p].pb
		const st = s.inst[pb].stub
		if (s.solo && s.solo.chimera === p) continue
		const t = cardText(st)?.text
		const abs = abilitiesOf(s, pb)
		out.push({
			key: `pb${p}`,
			img: st,
			uid: pb,
			title: nameOf(s, pb),
			sub: p === me ? 'Your Phoenixborn' : `${s.players[p].name}’s Phoenixborn`,
			lines: t ? [t] : abs.map((a) => `${a.label}: ${a.help}`),
		})
	}
	if (s.solo) {
		const ph = s.solo.phase
		const rows: string[] = []
		for (let r = 1; r <= 12; r++) {
			const text = behaviourText(ph, r)
			const last = rows[rows.length - 1]
			const prev = last?.split(': ').slice(1).join(': ')
			if (last && prev === text) {
				const [range] = last.split(': ')
				rows[rows.length - 1] = `${range.split('–')[0]}–${r}: ${text}`
			} else rows.push(`${r}: ${text}`)
		}
		out.push({
			key: 'behaviour',
			img: `corpse-of-viros-behavior-${ph}`,
			title: `Behaviour · phase ${ph}`,
			sub: 'The chimera rolls a d12 each turn while it has face-down aspects',
			lines: rows,
		})
		out.push({
			key: 'ultimate',
			img: `corpse-of-viros-ultimate-${ph}`,
			title: `Ultimate · phase ${ph}`,
			sub: `Unleashed at ${ultimateThreshold(s)} Red Rains tokens (it has ${s.solo.redRains})`,
			lines: [ph < 3 ? `Deals ${ph} damage to each of your units and to your Phoenixborn, then the chimera moves to phase ${ph + 1}.` : 'Adds another face-down aspect (threat card).'],
		})
	}
	return out
}

export function Reference({ s, me, onView, compact }: { s: GameState; me: PlayerId; onView: (uid: number) => void; compact?: boolean }) {
	const [zoom, setZoom] = useState<string | null>(null)
	const list = entries(s, me)
	return (
		<div className={`reference ${compact ? 'compact' : ''}`}>
			<div className="ref-head">Abilities at a glance</div>
			{list.map((e) => (
				<div key={e.key} className="ref-row">
					<button className="ref-img" style={{ width: compact ? 64 : 74, height: Math.round((compact ? 64 : 74) * 1.4) }} onClick={() => (e.uid !== undefined ? onView(e.uid) : setZoom(e.img))} title="Tap to see it big">
						<CardFace key={e.img} stub={e.img} name={e.title} type="" w={compact ? 64 : 74} />
					</button>
					<div className="ref-body">
						<div className="ref-title">{e.title}</div>
						<div className="ref-sub">{e.sub}</div>
						{e.lines.map((l, i) => (
							<div key={i} className="ref-line">
								<RichText text={l} />
							</div>
						))}
					</div>
				</div>
			))}
			{zoom && (
				<div className="ref-zoom" onClick={() => setZoom(null)}>
					<img src={imageUrl(zoom)} alt="" draggable={false} />
				</div>
			)}
		</div>
	)
}
