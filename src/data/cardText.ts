// Card rules text and images, loaded at run time from Kris's card repo
// (github.com/kbiben29-hue/ashes-cards, downloaded there from ashes.live). Cached in localStorage
// so the game works offline after the first load. The engine never needs this: it's for display.

const BASE = 'https://raw.githubusercontent.com/kbiben29-hue/ashes-cards/main'
const KEY = 'argaia.cards.v1'

export interface CardText {
	stub: string
	name: string
	type: string
	text?: string
}

let table: Record<string, CardText> = {}

import { ASPECT_HELP } from './chimeraCards'

const IMAGE_ALIAS: Record<string, string> = { 'corpse-of-viros': 'corpse-of-viros-1p-standard-1' }
export const imageUrl = (stub: string) => `${BASE}/images/${IMAGE_ALIAS[stub] ?? stub}.jpg`
export const cardText = (stub: string): CardText | undefined => table[stub] ?? (ASPECT_HELP[stub] ? { stub, name: stub, type: 'Aspect', text: ASPECT_HELP[stub] } : undefined)

export async function loadCardText(): Promise<void> {
	try {
		const cached = localStorage.getItem(KEY)
		if (cached) table = JSON.parse(cached)
	} catch {
		/* ignore */
	}
	try {
		const res = await fetch(`${BASE}/data/cards.json`, { cache: 'no-cache' })
		if (!res.ok) return
		const all = (await res.json()) as CardText[]
		const next: Record<string, CardText> = {}
		for (const c of all) next[c.stub] = { stub: c.stub, name: c.name, type: c.type, text: c.text }
		table = next
		try {
			localStorage.setItem(KEY, JSON.stringify(next))
		} catch {
			/* storage full */
		}
	} catch {
		/* offline: keep the cached copy (or none — cards then show names and numbers only) */
	}
}

const SYMBOLS: Record<string, string> = {
	main: '◆ Main',
	side: '◇ Side',
	exhaust: '⟳ Exhaust',
	discard: 'Discard',
	basic: 'basic',
}

/** Card text with [[symbols]] turned into readable words. */
export function readable(text: string | undefined): string {
	if (!text) return ''
	return text.replace(/\[\[([^\]]+)\]\]/g, (_, sym: string) => {
		if (SYMBOLS[sym]) return SYMBOLS[sym]
		if (sym.includes(':')) {
			const [m, l] = sym.split(':')
			return `${m} ${l}`
		}
		return sym
	})
}
