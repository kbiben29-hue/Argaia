// Bot-vs-bot games as a rules sanity check: `npm run sim -- 50`
import { apply, newGame } from '../src/engine/engine'
import { botIntent } from '../src/bot/bot'

import type { BotLevel } from '../src/bot/bot'
const n = Number(process.argv[2] ?? 20)
// optional: npm run sim -- 20 expert normal   (level for seat 0, level for seat 1)
const levels = [(process.argv[3] ?? 'normal') as BotLevel, (process.argv[4] ?? 'normal') as BotLevel]
const seatWins = [0, 0]
const wins = { arren: 0, issa: 0, draw: 0, stuck: 0 }
let rounds = 0
for (let g = 0; g < n; g++) {
	const decks: [string, string] = g % 2 ? ['arren', 'issa'] : ['issa', 'arren']
	let s = newGame({ seed: 4242 + g * 7, decks, names: ['P0', 'P1'] })
	let steps = 0
	while (s.pending.kind !== 'over' && steps++ < 4000) {
		const i = botIntent(s, levels[s.pending.player])
		if (!i) break
		s = apply(s, i)
	}
	if (s.pending.kind !== 'over') wins.stuck++
	else if (s.pending.winner === null) wins.draw++
	else {
		wins[decks[s.pending.winner] as 'arren' | 'issa']++
		seatWins[s.pending.winner]++
	}
	rounds += s.round
}
console.log(`${n} games`, wins, `seat wins (${levels.join(' vs ')})`, seatWins, `avg rounds ${(rounds / n).toFixed(1)}`)
