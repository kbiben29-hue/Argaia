// Red Rains pieces of the table: the chimera's status (Red Rains tokens, phase, ultimate threshold,
// last behaviour roll) and its face-down threat cards.

import type { GameState } from '../engine/types'
import { ultimateThreshold, threatValue } from '../engine/solo'
import { imageUrl } from '../data/cardText'
import { defOf } from '../engine/engine'

export function SoloPanel({ s, compact }: { s: GameState; compact?: boolean }) {
	const so = s.solo!
	const thr = ultimateThreshold(s)
	return (
		<div className={`solo-panel ${compact ? 'compact' : ''}`} title="Red Rains: tokens build towards the chimera’s ultimate">
			<div className="rr-row">
				<span className="rr-label">Red Rains</span>
				{Array.from({ length: Math.max(thr, so.redRains) }, (_, i) => (
					<span key={i} className={`rr-token ${i < so.redRains ? 'on' : ''}`} />
				))}
				<span className="rr-n">
					{so.redRains}/{thr}
				</span>
			</div>
			<div className="rr-meta">
				<span className="phase">Phase {so.phase}</span>
				<span>Threat {threatValue(s)}</span>
				{so.fatigued && <span className="fatigued">Fatigued</span>}
			</div>
			{so.roll && !compact && (
				<div className="rr-roll">
					<span className="d12">{so.roll.d12}</span> {so.roll.text}
				</div>
			)}
		</div>
	)
}

/** The chimera's face-down aspects (threat cards), left to right: the leftmost is revealed next. */
export function ThreatRow({ s, w }: { s: GameState; w: number }) {
	const so = s.solo!
	if (so.threatZone.length === 0) return null
	return (
		<div className="threat-row" title="Threat cards: face-down aspects. The leftmost one is revealed next.">
			{so.threatZone.map((u, i) => {
				const blood = Number(defOf(s.inst[u].stub).blood ?? 1)
				return (
					<div key={u} className={`threat-card ${i === 0 ? 'next' : ''}`} style={{ width: w, height: Math.round(w * 1.4) }}>
						<img src={imageUrl(`back-blood-${blood}`)} alt="" draggable={false} onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')} />
						<span className="threat-blood">🩸{blood}</span>
					</div>
				)
			})}
		</div>
	)
}
