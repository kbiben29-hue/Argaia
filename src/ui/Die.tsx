import type React from 'react'
import type { Die, Level } from '../engine/types'

// The real Ashes dice symbols come from the phg-ashes icon font, kept in the ashes-cards repo and loaded
// at run time (see loadDiceFont). Until it has loaded (or if it can't), simple stand-in icons are shown.

const FONT_URL = 'https://raw.githubusercontent.com/kbiben29-hue/ashes-cards/main/assets/fonts'

/** Glyph code points in the phg-ashes font. */
const GLYPH: Record<string, Partial<Record<Level, number>>> = {
	astral: { power: 0xe817, class: 0xe818 },
	artifice: { power: 0xe819, class: 0xe81a },
	natural: { power: 0xe80b, class: 0xe80a },
	illusion: { power: 0xe808, class: 0xe807 },
	ceremonial: { power: 0xe802, class: 0xe801 },
	charm: { power: 0xe804, class: 0xe803 },
	divine: { power: 0xe80f, class: 0xe810 },
	sympathy: { power: 0xe81f, class: 0xe81e },
	time: { power: 0xe811, class: 0xe815 },
}
const BASIC = 0xe800

const FALLBACK: Record<string, string> = {
	astral: '✦',
	artifice: '⚙',
	natural: '❦',
	illusion: '◐',
	ceremonial: '☠',
	charm: '♡',
	divine: '☀',
	sympathy: '❂',
	time: '⧗',
	rage: '✹',
}

let fontPromise: Promise<void> | null = null
/** Load the dice font once; adds the `phg` class to <html> when it's ready. */
export function loadDiceFont(): Promise<void> {
	if (fontPromise) return fontPromise
	fontPromise = (async () => {
		try {
			if (typeof FontFace === 'undefined') return
			const f = new FontFace('phg-ashes', `url(${FONT_URL}/phg-ashes.woff2) format('woff2'), url(${FONT_URL}/phg-ashes.woff) format('woff')`)
			await f.load()
			document.fonts.add(f)
			document.documentElement.classList.add('phg')
		} catch {
			/* offline: keep the stand-in icons */
		}
	})()
	return fontPromise
}

export const glyphFor = (magic: string, level: Level) => String.fromCodePoint(level === 'basic' ? BASIC : (GLYPH[magic]?.[level] ?? BASIC))

/** One die: the real dice colours and symbols (power, class or basic). */
export function DieChip({ die, size = 34, onClick, glow, selected, dim }: { die: Pick<Die, 'magic' | 'level'> & { id?: string }; size?: number; onClick?: () => void; glow?: boolean; selected?: boolean; dim?: boolean }) {
	const cls = ['die', `mg-${die.magic}`, `lv-${die.level}`, glow ? 'glow' : '', selected ? 'sel' : '', dim ? 'dim' : '', onClick ? 'tap' : ''].join(' ')
	return (
		<span className={cls} style={{ width: size, height: size, fontSize: size * 0.74 }} onClick={onClick ? (e) => (e.stopPropagation(), onClick()) : undefined} title={`${die.magic} · ${die.level}`}>
			{die.magic === 'rage' ? <span className="g plain">{die.level === 'power' ? '✹' : '·'}</span> : <span className="g">{glyphFor(die.magic, die.level)}</span>}
			<span className="fb">{die.level === 'basic' ? <i className="dot" /> : <span className="ic">{FALLBACK[die.magic] ?? '?'}</span>}</span>
		</span>
	)
}

/** A cost symbol: a magic type's power or class symbol, or the generic basic symbol (any die). */
export function CostSymbol({ magic, level, size = 20 }: { magic?: string; level: Level; size?: number }) {
	return <DieChip die={{ magic: (magic ?? 'any') as Die['magic'], level }} size={size} />
}

/** A cost as symbols: ◆ main, ◇ side, ⟳ exhaust, dice symbols, discard. */
export function CostView({ cost, size = 18 }: { cost: { main: boolean; side: boolean; exhaust: boolean; discard: number; magic: { magic?: string; level: Level }[] }; size?: number }) {
	const bits: React.ReactNode[] = []
	if (cost.main) bits.push(<span key="m" className="cost-word">◆ Main</span>)
	if (cost.side) bits.push(<span key="s" className="cost-word">◇ Side</span>)
	if (cost.exhaust) bits.push(<span key="e" className="cost-word">⟳</span>)
	cost.magic.forEach((r, i) => bits.push(<CostSymbol key={`d${i}`} magic={r.magic} level={r.level} size={size} />))
	if (cost.discard) bits.push(<span key="x" className="cost-word">discard {cost.discard}</span>)
	if (bits.length === 0) bits.push(<span key="f" className="cost-word">free</span>)
	return <span className="cost">{bits}</span>
}

/** Card text with [[symbols]] drawn as dice symbols and action icons. */
export function RichText({ text }: { text: string }) {
	const parts = text.split(/(\[\[[^\]]+\]\])/g)
	return (
		<>
			{parts.map((p, i) => {
				const m = p.match(/^\[\[([^\]]+)\]\]$/)
				if (!m) return <span key={i}>{p}</span>
				const sym = m[1]
				if (sym === 'main') return <b key={i}>◆</b>
				if (sym === 'side') return <b key={i}>◇</b>
				if (sym === 'exhaust') return <b key={i}>⟳</b>
				if (sym === 'discard') return <b key={i}>discard</b>
				if (sym === 'basic') return <CostSymbol key={i} level="basic" size={17} />
				const [magic, level] = sym.split(':')
				if (level === 'power' || level === 'class') return <CostSymbol key={i} magic={magic} level={level} size={17} />
				return <b key={i}>{sym}</b>
			})}
		</>
	)
}
