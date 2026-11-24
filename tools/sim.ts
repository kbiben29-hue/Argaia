// Bot-vs-bot games as a rules sanity check: `npm run sim -- 50`
import { apply, newGame } from '../src/engine/engine'
import { botIntent } from '../src/bot/bot'

const n = Number(process.argv[2] ?? 20)
const wins = { arren: 0, issa: 0, draw: 0, stuck: 0 }
let rounds = 0
for (let g = 0; g < n; g++) {
	const decks: [string, string] = g % 2 ? ['arren', 'issa'] : ['issa', 'arren']
	let s = newGame({ seed: 4242 + g * 7, decks, names: ['P0', 'P1'] })
	let steps = 0
	while (s.pending.kind !== 'over' && steps++ < 4000) {
		const i = botIntent(s, 'normal')
		if (!i) break
		s = apply(s, i)
	}
	if (s.pending.kind !== 'over') wins.stuck++
	else if (s.pending.winner === null) wins.draw++
	else wins[decks[s.pending.winner] as 'arren' | 'issa']++
	rounds += s.round
}
console.log(`${n} games`, wins, `avg rounds ${(rounds / n).toFixed(1)}`)
