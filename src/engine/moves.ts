// Every legal move in the current position (dice paid automatically with the cheapest dice).
// Used by the computer opponent, the tutorial coach and the fuzz tests.

import {
	abilitiesOf,
	abilityProblem,
	POWER_NO_TARGET,
	activeDice,
	attackProblem,
	canAttackWith,
	cardsInPlay,
	dicePowerProblem,
	dicePowerTargets,
	playCost,
	playProblem,
	suggestDice,
	units,
} from './engine'
import { other, type GameState, type Intent, type PlayerId } from './types'

export function legalIntents(s: GameState): Intent[] {
	if (s.pending.kind !== 'act') return []
	const p = s.pending.player
	const out: Intent[] = []
	const pl = s.players[p]
	const seen = new Set<string>()
	for (const uid of pl.hand) {
		const stub = s.inst[uid].stub
		if (seen.has(stub)) continue
		seen.add(stub)
		if (playProblem(s, p, uid)) continue
		const dice = suggestDice(s, p, playCost(s, uid))
		if (dice) out.push({ t: 'play', player: p, card: uid, dice })
	}
	const stacks = new Set<string>()
	for (const uid of [...cardsInPlay(s, p), ...units(s, other(p)).filter((u) => s.inst[u].ctl === p)]) {
		const stub = s.inst[uid].stub
		abilitiesOf(s, uid).forEach((ab, k) => {
			if (abilityProblem(s, p, uid, k)) return
			if (s.inst[uid].zone === 'spellboard') {
				if (stacks.has(`${stub}#${k}`)) return
				stacks.add(`${stub}#${k}`)
			}
			const dice = suggestDice(s, p, ab.cost)
			if (dice) out.push({ t: 'activate', player: p, card: uid, dice, ...(k ? { ab: k } : {}) })
		})
	}
	if (!s.turn.side) {
		const byMagic = new Set<string>()
		for (const d of activeDice(s, p)) {
			if (d.level !== 'power' || byMagic.has(d.magic)) continue
			byMagic.add(d.magic)
			if (POWER_NO_TARGET.includes(d.magic)) {
				if (!dicePowerProblem(s, p, d.id)) out.push({ t: 'dicePower', player: p, die: d.id })
			} else for (const t of dicePowerTargets(s, p, d)) if (!dicePowerProblem(s, p, d.id, t)) out.push({ t: 'dicePower', player: p, die: d.id, target: t })
		}
	}
	if (!s.turn.main) {
		const ready = units(s, p).filter((u) => canAttackWith(s, u))
		if (ready.length) {
			if (!attackProblem(s, p, 'pb', ready)) out.push({ t: 'attack', player: p, target: 'pb', attackers: ready })
			if (ready.length > 1) for (const a of ready) out.push({ t: 'attack', player: p, target: 'pb', attackers: [a] })
			for (const t of units(s, other(p))) for (const a of ready) if (!attackProblem(s, p, t, [a])) out.push({ t: 'attack', player: p, target: t, attackers: [a] })
		}
		out.push({ t: 'pass', player: p })
	} else out.push({ t: 'endTurn', player: p })
	return out
}

export const actingPlayer = (s: GameState): PlayerId | null => (s.pending.kind === 'over' ? null : s.pending.player)
