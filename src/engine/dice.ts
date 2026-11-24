// Costs and dice payment.
//
// A die shows a power, class or basic symbol. A power symbol pays a power, class or basic cost of
// its magic type; a class symbol pays a class or basic cost; a basic symbol only pays basic costs.
// A basic cost ([[basic]]) may be paid by any die of any magic type.

import type { Die, Level, Magic } from './types'

export interface Req {
	magic?: Magic
	level: Level
}

export interface Cost {
	main: boolean
	side: boolean
	exhaust: boolean
	discard: number
	magic: Req[]
}

export const RANK: Record<Level, number> = { power: 2, class: 1, basic: 0 }

/** Parse printed cost pieces like "[[main]]", "1 [[astral:class]]", "1 [[discard]]". */
export function parseCost(parts: string[] | undefined): Cost {
	const c: Cost = { main: false, side: false, exhaust: false, discard: 0, magic: [] }
	for (const raw of parts ?? []) {
		const m = raw.trim().match(/^(\d+)?\s*\[\[([a-z:]+)\]\]$/)
		if (!m) continue
		const n = m[1] ? Number(m[1]) : 1
		const sym = m[2]
		if (sym === 'main') c.main = true
		else if (sym === 'side') c.side = true
		else if (sym === 'exhaust') c.exhaust = true
		else if (sym === 'discard') c.discard += n
		else if (sym === 'basic') for (let i = 0; i < n; i++) c.magic.push({ level: 'basic' })
		else {
			const [magic, level] = sym.split(':') as [Magic, Level]
			for (let i = 0; i < n; i++) c.magic.push({ magic, level: level ?? 'basic' })
		}
	}
	return c
}

/** Short cost builder for scripted abilities: cost('side', 'exhaust', 'astral:class', 'basic'). */
export function cost(...parts: string[]): Cost {
	return parseCost(parts.map((p) => (p.includes('[[') ? p : `[[${p}]]`)))
}

export const canPay = (d: Die, r: Req) => (!r.magic || d.magic === r.magic) && RANK[d.level] >= RANK[r.level]

/** True when exactly these dice can pay exactly these requirements. */
export function paysExactly(dice: Die[], reqs: Req[]): boolean {
	if (dice.length !== reqs.length) return false
	const used = new Array(dice.length).fill(false)
	const order = reqs.slice().sort((a, b) => strictness(b) - strictness(a))
	const go = (i: number): boolean => {
		if (i === order.length) return true
		for (let k = 0; k < dice.length; k++) {
			if (used[k] || !canPay(dice[k], order[i])) continue
			used[k] = true
			if (go(i + 1)) return true
			used[k] = false
		}
		return false
	}
	return go(0)
}

const strictness = (r: Req) => (r.magic ? 10 : 0) + RANK[r.level]

/**
 * The cheapest dice from `pool` (active dice) that pay `reqs`, or null if they can't be paid.
 * Spends the lowest symbols that work and keeps dice the rest of the cost still needs.
 */
export function autoPay(pool: Die[], reqs: Req[]): Die[] | null {
	if (reqs.length === 0) return []
	const order = reqs.slice().sort((a, b) => strictness(b) - strictness(a))
	const used = new Set<string>()
	const out: Die[] = []
	for (let i = 0; i < order.length; i++) {
		const r = order[i]
		const later = order.slice(i + 1)
		const cands = pool.filter((d) => !used.has(d.id) && canPay(d, r))
		if (cands.length === 0) return search(pool, reqs)
		cands.sort((a, b) => worth(a, later) - worth(b, later))
		used.add(cands[0].id)
		out.push(cands[0])
	}
	return paysExactly(out, reqs) ? out : search(pool, reqs)
}

/** How much we'd rather keep a die: higher symbols and dice later requirements need are worth more. */
function worth(d: Die, later: Req[]): number {
	let w = RANK[d.level] * 3
	if (later.some((r) => r.magic && canPay(d, r))) w += 2
	return w
}

function search(pool: Die[], reqs: Req[]): Die[] | null {
	const pick: Die[] = []
	const go = (start: number): boolean => {
		if (pick.length === reqs.length) return paysExactly(pick, reqs)
		for (let k = start; k < pool.length; k++) {
			pick.push(pool[k])
			if (go(k + 1)) return true
			pick.pop()
		}
		return false
	}
	return go(0) ? pick.slice() : null
}

export function costLabel(c: Cost): string {
	const bits: string[] = []
	if (c.main) bits.push('Main')
	if (c.side) bits.push('Side')
	if (c.exhaust) bits.push('Exhaust')
	for (const r of c.magic) bits.push(r.magic ? `${r.magic} ${r.level}` : 'basic')
	if (c.discard) bits.push(`discard ${c.discard}`)
	return bits.join(' · ') || 'Free'
}
