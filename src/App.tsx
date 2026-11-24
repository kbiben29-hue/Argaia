import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { actor, newGame, tryApply } from './engine/engine'
import type { GameState, Intent, PlayerId } from './engine/types'
import { botIntent, type BotLevel } from './bot/bot'
import { loadCardText } from './data/cardText'
import { DECKS } from './data/decks'
import { Board, type LayoutChoice } from './ui/Board'
import { Setup, type SetupResult } from './ui/Setup'
import { coachFor, eventNote, INTRO, type CoachStep } from './ui/coach'
import { hostGame, joinGame, newGameCode, type Conn, type Host } from './net/transport'
import { clearJoinFromUrl, isGuestMsg, isHostMsg, joinCodeFromUrl, joinLink, type GuestMsg, type HostMsg } from './net/online'
import { isMuted, setMuted, soundFor, unlockAudio } from './ui/sfx'
import { loadDiceFont } from './ui/Die'

const W = 1440
const H = 900
const SAVE = 'argaia.save.v1'

interface Session {
	history: GameState[]
	bot: boolean
	level?: BotLevel
	tutorial?: { intro: number; seen: string[]; note: CoachStep | null }
	online?: { role: 'host' | 'guest'; code: string; seat: PlayerId }
}

interface Lobby {
	role: 'host' | 'guest'
	code: string
	name: string
	deck: string
	status: string
	error?: string
}

const LAYOUT_KEY = 'argaia.layout'
function readLayout(): LayoutChoice {
	try {
		const v = localStorage.getItem(LAYOUT_KEY)
		return v === 'pocket' || v === 'console' ? v : 'auto'
	} catch {
		return 'auto'
	}
}

/** Phones get the phone layout; iPads and computers get the full table scaled to fit. */
function usePhone() {
	const test = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches && Math.min(window.innerWidth, window.innerHeight) < 600
	const [phone, setPhone] = useState(test)
	useEffect(() => {
		const f = () => setPhone(test())
		window.addEventListener('resize', f)
		window.addEventListener('orientationchange', f)
		return () => (window.removeEventListener('resize', f), window.removeEventListener('orientationchange', f))
	}, [])
	return phone
}

function useFit() {
	const [fit, setFit] = useState({ scale: 1, left: 0, top: 0 })
	useLayoutEffect(() => {
		const f = () => {
			const scale = Math.min(window.innerWidth / W, window.innerHeight / H)
			setFit({ scale, left: (window.innerWidth - W * scale) / 2, top: (window.innerHeight - H * scale) / 2 })
		}
		f()
		window.addEventListener('resize', f)
		window.addEventListener('orientationchange', f)
		return () => (window.removeEventListener('resize', f), window.removeEventListener('orientationchange', f))
	}, [])
	return fit
}

function loadSave(): Session | null {
	try {
		const raw = localStorage.getItem(SAVE)
		return raw ? (JSON.parse(raw) as Session) : null
	} catch {
		return null
	}
}

export default function App() {
	const fit = useFit()
	const phone = usePhone()
	const [, setTextReady] = useState(0)
	const [session, setSession] = useState<Session | null>(null)
	const [viewer, setViewer] = useState<PlayerId>(0)
	const [handoff, setHandoff] = useState<PlayerId | null>(null)
	const botTimer = useRef<number | undefined>(undefined)
	const [layoutChoice, setLayoutChoice] = useState<LayoutChoice>(() => readLayout())
	const pocket = layoutChoice === 'pocket' || (layoutChoice === 'auto' && phone)
	const [muted, setMutedState] = useState(isMuted())
	const chooseLayout = (c: LayoutChoice) => {
		setLayoutChoice(c)
		try {
			localStorage.setItem(LAYOUT_KEY, c)
		} catch {
			/* ignore */
		}
	}
	const [lobby, setLobby] = useState<Lobby | null>(null)
	const [net, setNet] = useState<{ ok: boolean; text: string } | null>(null)
	const [netError, setNetError] = useState<string | null>(null)
	const [joinCode, setJoinCode] = useState<string | null>(() => joinCodeFromUrl())
	const sessionRef = useRef<Session | null>(null)
	const lobbyRef = useRef<Lobby | null>(null)
	const hostRef = useRef<Host | null>(null)
	const connRef = useRef<Conn | null>(null)
	sessionRef.current = session
	lobbyRef.current = lobby

	useEffect(() => {
		loadCardText().then(() => setTextReady((n) => n + 1))
		void loadDiceFont()
	}, [])

	const state = session?.history[session.history.length - 1]

	useEffect(() => {
		if (!session) return
		try {
			localStorage.setItem(SAVE, JSON.stringify({ ...session, history: session.history.slice(-40) }))
		} catch {
			/* storage full */
		}
	}, [session])

	// sounds for new log lines
	const lastLog = useRef(0)
	useEffect(() => {
		if (!state) return
		const fresh = state.log.slice(lastLog.current)
		lastLog.current = state.log.length
		if (fresh.length > 30) return
		const fx = fresh.map(soundFor).filter(Boolean)
		if (fx.length) fx[fx.length - 1]!()
	}, [state])

	const send = useCallback(
		(i: Intent) => {
			if (!session || !state) return 'No game'
			const r = tryApply(state, i)
			if (r.error) return r.error
			if (session.online?.role === 'guest') {
				if (!connRef.current) return 'Not connected to your friend’s game'
				connRef.current.send({ type: 'intent', intent: i } satisfies GuestMsg)
				return undefined
			}
			let tutorial = session.tutorial
			if (tutorial) {
				const seen = new Set(tutorial.seen)
				const cur = coachFor(state, 0, seen)
				if (cur && actor(state) === 0) seen.add(cur.key)
				const note = tutorial.note ?? eventNote(state, r.state, 0, seen)
				tutorial = { ...tutorial, seen: [...seen], note }
			}
			setSession({ ...session, history: [...session.history, r.state], tutorial })
			return undefined
		},
		[session, state],
	)

	// Hot-seat: whoever must decide sits at the bottom; hide their hand until they take the device.
	useEffect(() => {
		if (!state || !session) return
		const who = actor(state)
		if (session.online) {
			setViewer(session.online.seat)
			setHandoff(null)
			return
		}
		if (session.bot) {
			setViewer(0)
			return
		}
		if (who !== null && who !== viewer) {
			setViewer(who)
			setHandoff(who)
		}
	}, [state, session, viewer])

	// Online host: every new state goes to the guest.
	useEffect(() => {
		if (!state || session?.online?.role !== 'host' || !connRef.current) return
		connRef.current.send({ type: 'state', state } satisfies HostMsg)
	}, [state, session?.online?.role])

	const closeNet = () => {
		connRef.current?.close()
		connRef.current = null
		hostRef.current?.destroy()
		hostRef.current = null
		setNet(null)
	}

	const attachGuest = (c: Conn) => {
		connRef.current?.close()
		connRef.current = c
		setNet({ ok: true, text: 'Friend connected' })
		c.onClose(() => {
			if (connRef.current === c) {
				connRef.current = null
				setNet({ ok: false, text: 'Friend disconnected — they can reopen your link to come back' })
			}
		})
		c.onMessage((m) => {
			if (!isGuestMsg(m)) return
			const cur = sessionRef.current
			if (m.type === 'hello') {
				if (cur?.online?.role === 'host') {
					const st = cur.history[cur.history.length - 1]
					c.send({ type: 'start', state: st, hostName: st.players[0].name } satisfies HostMsg)
					return
				}
				const lb = lobbyRef.current
				if (!lb) return
				const guestDeck = DECKS[m.deck] ? m.deck : lb.deck === 'arren' ? 'issa' : 'arren'
				const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0
				const g = newGame({ seed, decks: [lb.deck, guestDeck], names: [lb.name, (m.name || 'Friend').slice(0, 24)] })
				setSession({ history: [g], bot: false, online: { role: 'host', code: lb.code, seat: 0 } })
				setLobby(null)
				c.send({ type: 'start', state: g, hostName: lb.name } satisfies HostMsg)
				return
			}
			if (m.type === 'intent') {
				if (!cur) return
				const st = cur.history[cur.history.length - 1]
				if (m.intent.player !== 1) return
				const r = tryApply(st, m.intent)
				if (r.error) c.send({ type: 'error', message: r.error } satisfies HostMsg)
				else {
					const next = { ...cur, history: [...cur.history.slice(-39), r.state] }
					sessionRef.current = next
					setSession(next)
				}
			}
		})
	}

	const openHost = async (code: string) => {
		closeNet()
		setNet({ ok: false, text: 'Opening the game for your friend…' })
		try {
			const h = await hostGame(code)
			hostRef.current = h
			h.onConnection(attachGuest)
			h.onError((e) => setNet({ ok: false, text: e }))
			setNet({ ok: false, text: 'Waiting for your friend to open the link…' })
			setLobby((lb) => (lb ? { ...lb, status: 'Waiting for your friend to open the link…' } : lb))
		} catch (e) {
			const msg = (e as Error).message
			setNet({ ok: false, text: msg })
			setLobby((lb) => (lb ? { ...lb, error: msg } : lb))
		}
	}

	const openGuest = async (code: string, name: string, deck: string) => {
		closeNet()
		setNet({ ok: false, text: 'Connecting to your friend’s game…' })
		try {
			const c = await joinGame(code)
			connRef.current = c
			setNet({ ok: true, text: 'Connected' })
			c.onClose(() => {
				if (connRef.current === c) {
					connRef.current = null
					setNet({ ok: false, text: 'Disconnected — reopen the invite link to reconnect' })
				}
			})
			c.onMessage((m) => {
				if (!isHostMsg(m)) return
				if (m.type === 'start') {
					setLobby(null)
					setSession({ history: [m.state], bot: false, online: { role: 'guest', code, seat: 1 } })
				} else if (m.type === 'state') setSession((prev) => (prev ? { ...prev, history: [...prev.history.slice(-39), m.state] } : prev))
				else if (m.type === 'error') setNetError(m.message)
			})
			c.send({ type: 'hello', name, deck } satisfies GuestMsg)
		} catch (e) {
			const msg = (e as Error).message
			setNet({ ok: false, text: msg })
			setLobby((lb) => (lb ? { ...lb, error: msg } : lb))
		}
	}

	useEffect(() => () => closeNet(), [])

	// Computer opponent plays seat 1.
	useEffect(() => {
		if (!state || !session?.bot) return
		if (actor(state) !== 1) return
		if (session.tutorial && session.tutorial.intro < INTRO.length) return
		botTimer.current = window.setTimeout(
			() => {
				const i = botIntent(state, session.level ?? 'normal')
				if (i) send(i)
			},
			session.tutorial ? 1000 : 600,
		)
		return () => window.clearTimeout(botTimer.current)
	}, [state, session, send])

	const start = (r: SetupResult) => {
		unlockAudio()
		if (r.online === 'host') {
			const code = newGameCode()
			setLobby({ role: 'host', code, name: r.names[0], deck: r.decks[0], status: 'Opening…' })
			void openHost(code)
			return
		}
		if (r.online === 'guest' && joinCode) {
			setLobby({ role: 'guest', code: joinCode, name: r.names[0], deck: r.decks[0], status: 'Connecting…' })
			clearJoinFromUrl()
			void openGuest(joinCode, r.names[0], r.decks[0])
			return
		}
		const g = newGame({ seed: r.seed, decks: r.decks, names: r.names })
		lastLog.current = 0
		setSession({ history: [g], bot: r.bot, level: r.level, tutorial: r.tutorial ? { intro: 0, seen: [], note: null } : undefined })
		setViewer(0)
		setHandoff(null)
	}
	const undo = () => {
		if (!session || session.history.length < 2) return
		let h = session.history.slice(0, -1)
		if (session.bot) while (h.length > 1 && actor(h[h.length - 1]) === 1) h = h.slice(0, -1)
		setSession({ ...session, history: h })
	}

	const coachStep = session?.tutorial && state ? coachFor(state, 0, new Set(session.tutorial.seen)) : null

	let body
	if (lobby && (!session || !state))
		body = (
			<LobbyScreen
				lobby={lobby}
				net={net}
				onCancel={() => {
					closeNet()
					setLobby(null)
				}}
				onRetry={() => (lobby.role === 'host' ? openHost(lobby.code) : openGuest(lobby.code, lobby.name, lobby.deck))}
			/>
		)
	else if (!session || !state)
		body = (
			<Setup
				onStart={start}
				joinCode={joinCode}
				canResume={!!loadSave()}
				resumeLabel={loadSave()?.online ? 'Resume online game' : undefined}
				onResume={() => {
					const s = loadSave()
					if (!s) return
					unlockAudio()
					if (s.online?.role === 'guest') {
						const st = s.history[s.history.length - 1]
						const me = st.players[1]
						setLobby({ role: 'guest', code: s.online.code, name: me.name, deck: me.deckId, status: 'Reconnecting…' })
						void openGuest(s.online.code, me.name, me.deckId)
						return
					}
					lastLog.current = s.history[s.history.length - 1].log.length
					setSession(s)
					if (s.online?.role === 'host') void openHost(s.online.code)
				}}
			/>
		)
	else {
		const t = session.tutorial
		body = (
			<>
				<Board
					state={state}
					send={send}
					viewer={viewer}
					hideHand={handoff !== null}
					bot={session.bot}
					onUndo={session.history.length > 1 && !session.online ? undo : undefined}
					onMenu={() => (session.online && closeNet(), setSession(null), setJoinCode(null))}
					layout={pocket ? 'pocket' : 'console'}
					layoutChoice={layoutChoice}
					onLayout={chooseLayout}
					muted={muted}
					onMute={() => (setMuted(!muted), setMutedState(!muted))}
					holdQuestion={!!t && t.intro < INTRO.length}
					hint={coachStep && t && !t.note && t.intro >= INTRO.length ? coachStep.hint : undefined}
					coach={t ? <CoachPanel session={session} step={coachStep} setSession={setSession} /> : undefined}
					netBadge={session.online ? <NetBadge net={net} code={session.online.code} host={session.online.role === 'host'} error={netError} onDismiss={() => setNetError(null)} /> : undefined}
				/>
				{handoff !== null && !session.bot && state.pending.kind !== 'over' && (
					<div className="handoff" onClick={() => setHandoff(null)}>
						<div>
							Pass the device to <b>{state.players[handoff].name}</b>
							<small>Tap when ready</small>
						</div>
					</div>
				)}
			</>
		)
	}

	if (pocket && session && state && !lobby) return <div className="pocket-root">{body}</div>
	if (!session || !state || lobby) return <div className="page-root">{body}</div>
	return (
		<div className="viewport">
			<div className="stage" style={{ width: W, height: H, transform: `scale(${fit.scale})`, left: fit.left, top: fit.top }}>
				{body}
			</div>
		</div>
	)
}

function CoachPanel({ session, step, setSession }: { session: Session; step: CoachStep | null; setSession: (s: Session) => void }) {
	const t = session.tutorial!
	const update = (patch: Partial<NonNullable<Session['tutorial']>>) => setSession({ ...session, tutorial: { ...t, ...patch } })
	let title: string
	let body: string
	let button: { label: string; onClick: () => void } | null = null
	if (t.intro < INTRO.length) {
		title = INTRO[t.intro].title
		body = INTRO[t.intro].body
		button = { label: t.intro === INTRO.length - 1 ? 'Start playing' : 'Next', onClick: () => update({ intro: t.intro + 1 }) }
	} else if (t.note) {
		title = t.note.title
		body = t.note.body
		button = { label: 'Got it', onClick: () => update({ note: null, seen: [...t.seen, t.note!.key] }) }
	} else if (step) {
		title = step.title
		body = step.body
	} else return null
	return (
		<div className="coach" onClick={(e) => e.stopPropagation()}>
			<div className="coach-tag">
				TUTORIAL{t.intro < INTRO.length ? ` · ${t.intro + 1}/${INTRO.length}` : ''}
				<button className="coach-off" onClick={() => setSession({ ...session, tutorial: undefined })}>
					Turn off
				</button>
			</div>
			<div className="coach-title">{title}</div>
			<div className="coach-body">{body}</div>
			{button && (
				<button className="primary" onClick={button.onClick}>
					{button.label}
				</button>
			)}
		</div>
	)
}

function LobbyScreen({ lobby, net, onCancel, onRetry }: { lobby: Lobby; net: { ok: boolean; text: string } | null; onCancel: () => void; onRetry: () => void }) {
	const [copied, setCopied] = useState(false)
	const link = joinLink(lobby.code)
	const share = async () => {
		const nav = navigator as Navigator & { share?: (d: { title: string; url: string }) => Promise<void> }
		try {
			if (nav.share) await nav.share({ title: 'Play Ashes with me', url: link })
			else {
				await navigator.clipboard.writeText(link)
				setCopied(true)
				window.setTimeout(() => setCopied(false), 2000)
			}
		} catch {
			/* cancelled */
		}
	}
	return (
		<div className="home lobby">
			<h2>{lobby.role === 'host' ? 'Invite a friend' : 'Joining your friend’s game'}</h2>
			{lobby.role === 'host' && (
				<>
					<p>Send this link to your friend. When they open it and press Join, the game starts for both of you.</p>
					<div className="invite">
						<input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
						<button className="primary" onClick={share}>
							{copied ? 'Copied!' : 'Share link'}
						</button>
					</div>
					<p className="dim">Keep this page open until your friend joins. Game code: {lobby.code}</p>
				</>
			)}
			<div className={`lobby-status ${lobby.error ? 'bad' : ''}`}>{lobby.error ?? net?.text ?? lobby.status}</div>
			<div className="row">
				{lobby.error && (
					<button className="primary" onClick={onRetry}>
						Try again
					</button>
				)}
				<button onClick={onCancel}>Cancel</button>
			</div>
		</div>
	)
}

function NetBadge({ net, code, host, error, onDismiss }: { net: { ok: boolean; text: string } | null; code: string; host: boolean; error: string | null; onDismiss: () => void }) {
	const [open, setOpen] = useState(false)
	return (
		<div className={`netbadge ${net?.ok ? 'ok' : 'bad'}`} onClick={(e) => e.stopPropagation()}>
			<button className="nb-pill" onClick={() => setOpen(!open)} title={net?.text ?? 'Not connected'}>
				<span className="dot" />
				{net?.ok ? 'Online' : 'Offline'}
			</button>
			{(open || error) && (
				<div className="nb-pop" onClick={() => (onDismiss(), setOpen(false))}>
					<div>{net?.text ?? 'Not connected'}</div>
					<div className="dim">
						{host ? 'You’re hosting' : 'Your friend is hosting'} · game {code}
					</div>
					{error && <div className="error-inline">{error}</div>}
				</div>
			)}
		</div>
	)
}
