import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { actor, newGame, tryApply } from './engine/engine'
import type { GameState, Intent, PlayerId } from './engine/types'
import { botIntent, type BotLevel } from './bot/bot'
import { loadCardText } from './data/cardText'
import { DECKS } from './data/decks'
import { Board, type LayoutChoice } from './ui/Board'
import { Setup, type SetupResult } from './ui/Setup'
import { coachFor, eventNote, INTRO, type CoachStep } from './ui/coach'
import { comboNote, deckName, DRILLS, drillCoach, drillsFor, PLANS, rivalDeck, type DeckId } from './ui/lessons'
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
	tutorial?: Tutorial
	online?: { role: 'host' | 'guest'; code: string; seat: PlayerId }
}

interface Tutorial {
	intro: number
	seen: string[]
	note: CoachStep | null
	/** deck lessons: a coached game with a starter deck, or one of its combo drills */
	deck?: DeckId
	drill?: string
}

/** Pages shown before play: the general intro, a deck's game plan, or a drill's goal. */
function pagesFor(t: Tutorial): { title: string; body: string }[] {
	if (t.drill) {
		const d = DRILLS.find((x) => x.id === t.drill)!
		return [{ title: d.title, body: `${deckName(d.deck)} combo drill. Goal: ${d.goal} The coach walks you through it step by step — whatever glows is the next move.` }]
	}
	if (t.deck) return PLANS[t.deck]
	return INTRO
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
	const [manual, setManual] = useState(() => {
		try {
			return localStorage.getItem('argaia.manual') === '1'
		} catch {
			return false
		}
	})
	const toggleManual = () => {
		setManual(!manual)
		try {
			localStorage.setItem('argaia.manual', manual ? '0' : '1')
		} catch {
			/* ignore */
		}
	}
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
				const cur = tutorial.drill ? null : coachFor(state, 0, seen)
				if (cur && actor(state) === 0) seen.add(cur.key)
				const note = tutorial.drill ? null : (tutorial.note ?? (tutorial.deck ? comboNote(tutorial.deck, r.state, 0, seen) : null) ?? eventNote(state, r.state, 0, seen))
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
		if (session.tutorial && session.tutorial.intro < pagesFor(session.tutorial).length) return
		// drills are one turn: the computer only reacts (blocks, guards, counters), it never takes a turn
		if (session.tutorial?.drill && state.active !== 0) return
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
		lastLog.current = 0
		if (r.lesson?.drill) {
			const d = DRILLS.find((x) => x.id === r.lesson!.drill)!
			setSession({ history: [d.build(r.seed, r.names[0])], bot: true, level: 'normal', tutorial: { intro: 0, seen: [], note: null, deck: r.lesson.deck, drill: d.id } })
			setViewer(0)
			setHandoff(null)
			return
		}
		const decks: [string, string] = r.lesson ? [r.lesson.deck, rivalDeck(r.lesson.deck)] : r.decks
		const g = newGame({ seed: r.seed, decks, names: r.names, ...(r.solo ? { soloLevel: r.solo.level, soloStage: r.solo.stage } : {}) })
		setSession({ history: [g], bot: r.bot, level: r.level, tutorial: r.tutorial ? { intro: 0, seen: [], note: null, ...(r.lesson ? { deck: r.lesson.deck } : {}) } : undefined })
		setViewer(0)
		setHandoff(null)
	}
	const undo = () => {
		if (!session || session.history.length < 2) return
		let h = session.history.slice(0, -1)
		if (session.bot) while (h.length > 1 && actor(h[h.length - 1]) === 1) h = h.slice(0, -1)
		setSession({ ...session, history: h })
	}

	const drill = session?.tutorial?.drill ? DRILLS.find((d) => d.id === session.tutorial!.drill) : undefined
	const coachStep = session?.tutorial && state ? (drill ? drillCoach(drill, state, session.history[0]) : coachFor(state, 0, new Set(session.tutorial.seen))) : null
	const [lessonsOpen, setLessonsOpen] = useState(false)
	const restartDrill = (id: string) => {
		const d = DRILLS.find((x) => x.id === id)!
		const name = session?.history[0].players[0].name ?? 'Player'
		lastLog.current = 0
		setSession({ history: [d.build((Date.now() >>> 0) ^ 0x5bd1, name)], bot: true, level: 'normal', tutorial: { intro: 1, seen: [], note: null, deck: d.deck, drill: d.id } })
	}

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
				initialLessons={lessonsOpen}
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
					holdQuestion={!!t && t.intro < pagesFor(t).length}
					manual={manual}
					onManual={toggleManual}
					canForfeit={!t?.drill}
					hint={coachStep && t && !t.note && t.intro >= pagesFor(t).length ? coachStep.hint : undefined}
					coach={t ? <CoachPanel session={session} step={coachStep} setSession={setSession} onDrill={restartDrill} onLessons={() => (setLessonsOpen(true), setSession(null))} /> : undefined}
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

function CoachPanel({ session, step, setSession, onDrill, onLessons }: { session: Session; step: CoachStep | null; setSession: (s: Session) => void; onDrill: (id: string) => void; onLessons: () => void }) {
	const t = session.tutorial!
	const pages = pagesFor(t)
	const update = (patch: Partial<Tutorial>) => setSession({ ...session, tutorial: { ...t, ...patch } })
	const drill = t.drill ? DRILLS.find((d) => d.id === t.drill) : undefined
	const st = session.history[session.history.length - 1]
	const tag = drill ? `COMBO DRILL · ${deckName(drill.deck)}` : t.deck ? `DECK LESSON · ${deckName(t.deck)}` : 'TUTORIAL'
	let title: string
	let body: string
	let button: { label: string; onClick: () => void } | null = null
	const extra: { label: string; onClick: () => void }[] = []
	if (t.intro < pages.length) {
		title = pages[t.intro].title
		body = pages[t.intro].body
		button = { label: t.intro === pages.length - 1 ? (drill ? 'Start the drill' : 'Start playing') : 'Next', onClick: () => update({ intro: t.intro + 1 }) }
	} else if (drill && drill.success(st, session.history[0])) {
		const list = drillsFor(drill.deck)
		const next = list[list.indexOf(drill) + 1]
		title = 'Drill complete ✓'
		body = drill.lesson
		button = next ? { label: `Next: ${next.title}`, onClick: () => onDrill(next.id) } : { label: 'Back to the lessons', onClick: onLessons }
		extra.push({ label: 'Do it again', onClick: () => onDrill(drill.id) })
		if (next) extra.push({ label: 'Back to the lessons', onClick: onLessons })
	} else if (drill && (st.active !== 0 || st.pending.kind === 'over' || !step)) {
		title = 'Not quite'
		body = `The goal was: ${drill.goal} Try again — follow the glowing hints, or try your own way.`
		button = { label: 'Try again', onClick: () => onDrill(drill.id) }
		extra.push({ label: 'Back to the lessons', onClick: onLessons })
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
				{tag}
				{t.intro < pages.length && pages.length > 1 ? ` · ${t.intro + 1}/${pages.length}` : ''}
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
			{extra.map((b) => (
				<button key={b.label} onClick={b.onClick}>
					{b.label}
				</button>
			))}
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
