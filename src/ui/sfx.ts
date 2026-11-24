// Sound effects, synthesized live with the Web Audio API (no audio files, nothing copyrighted).
// Browsers only allow sound after the player has tapped something, so the context starts lazily.

let ctx: AudioContext | null = null
let master: GainNode | null = null
let muted = (() => {
	try {
		return localStorage.getItem('argaia.muted') === '1'
	} catch {
		return false
	}
})()

export const isMuted = () => muted
export function setMuted(m: boolean) {
	muted = m
	try {
		localStorage.setItem('argaia.muted', m ? '1' : '0')
	} catch {
		/* ignore */
	}
}

function ac(): AudioContext | null {
	if (muted || typeof window === 'undefined') return null
	try {
		if (!ctx) {
			const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
			if (!C) return null
			ctx = new C()
			master = ctx.createGain()
			master.gain.value = 0.3
			master.connect(ctx.destination)
		}
		if (ctx.state === 'suspended') void ctx.resume()
		return ctx
	} catch {
		return null
	}
}

export function unlockAudio() {
	ac()
}

function tone(freq: number, dur: number, o: { type?: OscillatorType; at?: number; vol?: number; to?: number } = {}) {
	const a = ac()
	if (!a || !master) return
	const t0 = a.currentTime + (o.at ?? 0)
	const osc = a.createOscillator()
	const g = a.createGain()
	osc.type = o.type ?? 'sine'
	osc.frequency.setValueAtTime(freq, t0)
	if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + dur)
	g.gain.setValueAtTime(0.0001, t0)
	g.gain.exponentialRampToValueAtTime(o.vol ?? 0.4, t0 + 0.01)
	g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
	osc.connect(g)
	g.connect(master)
	osc.start(t0)
	osc.stop(t0 + dur + 0.05)
}

function noise(dur: number, vol = 0.3, at = 0, freq = 800) {
	const a = ac()
	if (!a || !master) return
	const len = Math.floor(a.sampleRate * dur)
	const buf = a.createBuffer(1, len, a.sampleRate)
	const data = buf.getChannelData(0)
	for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
	const src = a.createBufferSource()
	src.buffer = buf
	const f = a.createBiquadFilter()
	f.type = 'bandpass'
	f.frequency.value = freq
	const g = a.createGain()
	g.gain.value = vol
	src.connect(f)
	f.connect(g)
	g.connect(master)
	src.start(a.currentTime + at)
}

export const sfx = {
	card: () => (noise(0.12, 0.25, 0, 2400), tone(660, 0.12, { vol: 0.12 })),
	dice: () => [0, 0.05, 0.11, 0.16].forEach((t) => noise(0.05, 0.35, t, 3000)),
	chime: () => (tone(880, 0.5, { vol: 0.18 }), tone(1320, 0.6, { vol: 0.1, at: 0.06 })),
	hit: () => (noise(0.18, 0.5, 0, 500), tone(160, 0.2, { type: 'triangle', to: 70, vol: 0.4 })),
	destroy: () => (noise(0.45, 0.5, 0, 300), tone(220, 0.5, { type: 'sawtooth', to: 50, vol: 0.2 })),
	shield: () => tone(520, 0.35, { type: 'triangle', to: 1040, vol: 0.2 }),
	turn: () => tone(523, 0.25, { vol: 0.15 }),
	win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.5, { at: i * 0.12, vol: 0.2 })),
	lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.5, { at: i * 0.16, vol: 0.2, type: 'triangle' })),
}

/** Pick a sound for a new log line. */
export function soundFor(line: string): (() => void) | null {
	if (/wins!|draw/.test(line)) return sfx.win
	if (/is destroyed/.test(line)) return sfx.destroy
	if (/takes \d+ damage/.test(line)) return sfx.hit
	if (/prevents|reacts with/.test(line)) return sfx.shield
	if (/^— Round/.test(line)) return sfx.dice
	if (/dice power|places an? \w+ die|meditates/.test(line)) return sfx.chime
	if (/plays |comes into play|uses /.test(line)) return sfx.card
	return null
}
