// Computer opponent. "Normal" tries every legal move, plays out the questions it raises (both
// players answer by their option scores), and keeps the move that leaves the best position.
// "Easy" does the same but sometimes picks a random reasonable move instead.

import { apply, attackOf, charge, astralOn, exhausted, lifeOf, pbLeft, units, activeDice } from '../engine/engine'
import { legalIntents } from '../engine/moves'
import { Rng } from '../engine/rng'
import { other, type GameState, type Intent, type PlayerId, type Question } from '../engine/types'

export type BotLevel = 'easy' | 'normal' | 'expert'

/** Best answer to a question by option score (defaults for the First Five). */
export function bestPicks(q: Question): string[] {
	if (q.kind === 'firstFive' && q.defaults?.length === q.min) return q.defaults
	const ranked = q.options.slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
	const out: string[] = []
	let inGroup = 0
	const ok = (id: string) => {
		if (!q.group || !q.group.ids.includes(id)) return true
		return inGroup < q.group.max
	}
	const take = (id: string) => {
		out.push(id)
		if (q.group?.ids.includes(id)) inGroup++
	}
	for (const o of ranked) {
		if (out.length >= q.max) break
		if ((o.score ?? 0) > 0 && ok(o.id)) take(o.id)
	}
	for (const o of ranked) {
		if (out.length >= q.min) break
		if (!out.includes(o.id) && ok(o.id)) take(o.id)
	}
	return out
}

/** Answer every pending question by score (used for lookahead). */
function resolve(s: GameState, limit = 40): GameState {
	for (let k = 0; k < limit && s.pending.kind === 'choose'; k++) {
		const p = s.pending.player
		s = apply(s, { t: 'choose', player: p, picks: bestPicks(s.pending.question) })
	}
	return s
}

export function evaluate(s: GameState, me: PlayerId): number {
	const foe = other(me)
	if (s.pending.kind === 'over') return s.pending.winner === me ? 10000 : s.pending.winner === null ? 0 : -10000
	let v = 0
	v += (pbLeft(s, me) - pbLeft(s, foe)) * 3
	if (pbLeft(s, foe) <= 4) v += (5 - pbLeft(s, foe)) * 3
	if (pbLeft(s, me) <= 4) v -= (5 - pbLeft(s, me)) * 3
	const side = (p: PlayerId) => {
		let x = 0
		for (const u of units(s, p)) {
			const left = lifeOf(s, u) - s.inst[u].wounds
			x += 1.5 + attackOf(s, u) * 1.4 + left * 0.9 + (exhausted(s, u) ? 0 : 0.6)
			if (s.inst[u].stub === 'thunder-hulk' && charge(s, u) === 0) x -= 2
			if (astralOn(s, u)) x += 0.6
			x += charge(s, u) * 0.6
		}
		const pl = s.players[p]
		x += pl.hand.length * 0.9
		x += pl.spellboard.flat().length * 1.6
		x += pl.spellboard.flat().reduce((n, u) => n + charge(s, u) * 0.9, 0)
		if (astralOn(s, pl.pb)) x += 1.6
		x += charge(s, pl.pb) * 0.6
		x += activeDice(s, p).reduce((n, d) => n + (d.level === 'power' ? 0.55 : d.level === 'class' ? 0.45 : 0.3), 0)
		return x
	}
	v += side(me) - side(foe)
	return v
}

export function scoreIntent(s: GameState, i: Intent, me: PlayerId): number {
	let n: GameState
	try {
		n = resolve(apply(s, i))
	} catch {
		return -Infinity
	}
	let v = evaluate(n, me)
	if (i.t === 'pass') {
		// passing hands the round's tempo to the opponent; if they just passed, it ends the round
		v -= s.lastPassed ? 0.1 : 0.4
	}
	if (i.t === 'endTurn') v -= 0.05
	return v
}

export function chooseIntent(s: GameState): Intent | null {
	if (s.pending.kind === 'over') return null
	const me = s.pending.player
	if (s.pending.kind === 'choose') return { t: 'choose', player: me, picks: bestPicks(s.pending.question) }
	const moves = legalIntents(s)
	let best: Intent | null = null
	let bestV = -Infinity
	for (const m of moves) {
		const v = scoreIntent(s, m, me)
		if (v > bestV) {
			bestV = v
			best = m
		}
	}
	return best
}

/**
 * Expert: take the best few moves by the normal score, then for each one let the opponent reply with
 * their own best move (and answer every question that raises), and keep the move that holds up best.
 */
export function expertIntent(s: GameState): Intent | null {
	if (s.pending.kind !== 'act') return chooseIntent(s)
	const me = s.pending.player
	const scored = legalIntents(s)
		.map((m) => ({ m, v: scoreIntent(s, m, me) }))
		.filter((x) => x.v > -Infinity)
		.sort((a, b) => b.v - a.v)
		.slice(0, 7)
	let best: Intent | null = null
	let bestV = -Infinity
	for (const { m, v: first } of scored) {
		let n: GameState
		try {
			n = resolve(apply(s, m))
		} catch {
			continue
		}
		// play on until it's the opponent's move (finish our own turn greedily: side action, end turn)
		for (let k = 0; k < 4 && n.pending.kind === 'act' && n.pending.player === me; k++) {
			const i = chooseIntent(n)
			if (!i) break
			n = resolve(apply(n, i))
		}
		let v = evaluate(n, me)
		if (n.pending.kind === 'act' && n.pending.player !== me) {
			const reply = chooseIntent(n)
			if (reply) {
				try {
					v = evaluate(resolve(apply(n, reply)), me)
				} catch {
					/* keep v */
				}
			}
		}
		v = v * 0.7 + first * 0.3
		if (v > bestV) {
			bestV = v
			best = m
		}
	}
	return best ?? chooseIntent(s)
}

export function botIntent(s: GameState, level: BotLevel = 'normal'): Intent | null {
	if (level === 'expert') return expertIntent(s)
	if (level === 'easy' && s.pending.kind === 'act') {
		const r = new Rng((s.rng ^ (s.log.length * 2654435761)) >>> 0)
		if (r.float() < 0.3) {
			const moves = legalIntents(s).filter((m) => m.t !== 'pass')
			if (moves.length) return moves[r.int(moves.length)]
		}
	}
	return chooseIntent(s)
}
