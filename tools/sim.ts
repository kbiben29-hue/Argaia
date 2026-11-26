// Bot-vs-bot games as a rules sanity check.
//   npm run sim -- 20                    every deck against every other deck, 20 games per pairing
//   npm run sim -- 20 jessa viros        one pairing (viros = Red Rains: The Corpse of Viros)
//   npm run sim -- 20 jessa hope expert normal
import { apply, newGame } from '../src/engine/engine'
import { botIntent, type BotLevel } from '../src/bot/bot'
import { DECK_IDS } from '../src/data/decks'

const n = Number(process.argv[2] ?? 10)
const a0 = process.argv[3]
const a1 = process.argv[4]
const levels = [(process.argv[5] ?? 'normal') as BotLevel, (process.argv[6] ?? 'normal') as BotLevel]

function play(d0: string, d1: string, seed: number) {
	let s = newGame({ seed, decks: [d0, d1], names: ['P0', 'P1'] })
	let steps = 0
	while (s.pending.kind !== 'over' && steps++ < 6000) {
		const i = botIntent(s, levels[s.pending.player])
		if (!i) break
		s = apply(s, i)
	}
	return s
}

const pairs: [string, string][] = a0 ? [[a0, a1 ?? 'viros']] : []
if (!a0) {
	for (let i = 0; i < DECK_IDS.length; i++) for (let j = i + 1; j < DECK_IDS.length; j++) pairs.push([DECK_IDS[i], DECK_IDS[j]])
	for (const d of DECK_IDS) pairs.push([d, 'viros'])
}
const total: Record<string, { w: number; g: number }> = {}
for (const [x, y] of pairs) {
	const res = { [x]: 0, [y]: 0, draw: 0, stuck: 0 } as Record<string, number>
	let rounds = 0
	for (let g = 0; g < n; g++) {
		const swap = y !== 'viros' && g % 2 === 1
		const [d0, d1] = swap ? [y, x] : [x, y]
		const s = play(d0, d1, 4242 + g * 7)
		rounds += s.round
		if (s.pending.kind !== 'over') res.stuck++
		else if (s.pending.winner === null) res.draw++
		else res[[d0, d1][s.pending.winner]]++
	}
	for (const d of [x, y]) {
		total[d] ??= { w: 0, g: 0 }
		total[d].w += res[d]
		total[d].g += n
	}
	console.log(`${x} vs ${y}:`, res, `avg rounds ${(rounds / n).toFixed(1)}`)
}
console.log('win rates:', Object.entries(total).map(([d, t]) => `${d} ${Math.round((100 * t.w) / t.g)}%`).join(', '))
