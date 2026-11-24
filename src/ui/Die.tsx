import type { Die } from '../engine/types'

const ICON: Record<string, string> = {
	astral: '✦',
	artifice: '⚙',
	natural: '❦',
	illusion: '◐',
	ceremonial: '☠',
	charm: '♡',
	divine: '☀',
	sympathy: '❂',
	time: '⧗',
}

/** One die: colour = magic type; the face shows power (big icon in a burst), class (icon) or basic (dot). */
export function DieChip({ die, size = 34, onClick, glow, selected, dim }: { die: Pick<Die, 'magic' | 'level'> & { id?: string }; size?: number; onClick?: () => void; glow?: boolean; selected?: boolean; dim?: boolean }) {
	const cls = ['die', `mg-${die.magic}`, `lv-${die.level}`, glow ? 'glow' : '', selected ? 'sel' : '', dim ? 'dim' : '', onClick ? 'tap' : ''].join(' ')
	return (
		<span className={cls} style={{ width: size, height: size, fontSize: size * 0.55 }} onClick={onClick ? (e) => (e.stopPropagation(), onClick()) : undefined} title={`${die.magic} · ${die.level}`}>
			{die.level === 'basic' ? <i className="dot" /> : <span className="ic">{ICON[die.magic] ?? '?'}</span>}
			<em>{die.level === 'power' ? 'P' : die.level === 'class' ? 'C' : 'B'}</em>
		</span>
	)
}

export const magicIcon = (m: string) => ICON[m] ?? '?'
