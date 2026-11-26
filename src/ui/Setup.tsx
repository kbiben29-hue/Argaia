import { useState } from 'react'
import { DECKS, DECK_IDS } from '../data/decks'
import { defOf } from '../engine/engine'
import type { BotLevel } from '../bot/bot'
import { CardFace } from './Card'
import { DieChip } from './Die'
import { DECK_LESSONS, drillsFor, PLANS, pbName, type DeckId } from './lessons'

export interface SetupResult {
	decks: [string, string]
	names: [string, string]
	bot: boolean
	level: BotLevel
	tutorial: boolean
	online?: 'host' | 'guest'
	seed: number
	/** deck lessons: coached game with a deck, or one of its drills */
	lesson?: { deck: DeckId; drill?: string }
	/** Red Rains: a solo game against The Corpse of Viros */
	solo?: { level: 'S' | 'H'; stage: 1 | 2 | 3 }
}

type Tab = 'computer' | 'hotseat' | 'friend' | 'redrains' | 'learn'

const NAME_KEY = 'argaia.name'
const readName = () => {
	try {
		return localStorage.getItem(NAME_KEY) || 'Player'
	} catch {
		return 'Player'
	}
}

export function Setup({ onStart, joinCode, canResume, resumeLabel, onResume, initialLessons }: { onStart: (r: SetupResult) => void; joinCode: string | null; canResume: boolean; resumeLabel?: string; onResume: () => void; initialLessons?: boolean }) {
	const [tab, setTab] = useState<Tab>(joinCode ? 'friend' : initialLessons ? 'learn' : 'computer')
	const [deck0, setDeck0] = useState('arren')
	const [deck1, setDeck1] = useState('issa')
	const [name0, setName0] = useState(readName)
	const [name1, setName1] = useState('Player 2')
	const [level, setLevel] = useState<BotLevel>('normal')
	const [soloLevel, setSoloLevel] = useState<'S' | 'H'>('S')
	const [stage, setStage] = useState<1 | 2 | 3>(1)
	const seed = () => (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0
	const saveName = (n: string) => {
		setName0(n)
		try {
			localStorage.setItem(NAME_KEY, n)
		} catch {
			/* ignore */
		}
	}
	const otherDeck = (d: string) => DECK_IDS.find((x) => x !== d) ?? d

	const deckPicker = (value: string, set: (d: string) => void, label: string) => (
		<div className="deckpick">
			<div className="dp-label">{label}</div>
			<div className="dp-row">
				{DECK_IDS.map((id) => {
					const d = DECKS[id]
					const pb = defOf(d.pb)
					return (
						<button key={id} className={`deckcard ${value === id ? 'on' : ''}`} onClick={() => set(id)}>
							<CardFace stub={d.pb} name={pb.name} type="Phoenixborn" w={110} />
							<span className="dc-name">{pb.name}</span>
							<span className="dc-deck">{d.name}</span>
							<span className="dc-magic">
								{d.dice.map((x) => (
									<DieChip key={x.magic} die={{ magic: x.magic, level: 'power' }} size={22} />
								))}
								{d.dice.map((x) => x.magic).join(' + ')}
							</span>
						</button>
					)
				})}
			</div>
		</div>
	)

	return (
		<div className="home">
			<header className="home-head">
				<div className="logo">ARGAIA</div>
				<div className="tagline">A table for Ashes: Rise of the Phoenixborn — six decks, every magic type, and Red Rains</div>
			</header>
			{canResume && (
				<button className="resume primary" onClick={onResume}>
					{resumeLabel ?? 'Resume your last game'}
				</button>
			)}
			<nav className="tabs">
				{(
					[
						['computer', 'Vs computer'],
						['hotseat', 'Two players'],
						['friend', 'Play a friend'],
						['redrains', 'Red Rains'],
						['learn', 'Learn'],
					] as [Tab, string][]
				).map(([k, label]) => (
					<button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
						{label}
					</button>
				))}
			</nav>

			{tab === 'learn' && (
				<section className="panel">
					<h2>Learn to play</h2>
					<label className="field">
						Your name <input value={name0} onChange={(e) => saveName(e.target.value)} maxLength={24} />
					</label>
					<div className="learn-card">
						<h3>Tutorial: practice game</h3>
						<p>A coached game: you play Arren Frostpeak against the computer’s Issa Brightmore. The coach explains every step — dice, costs, attacks, blocks, reactions — and makes the suggested move glow. You can switch it off any time.</p>
						<button className="primary big" onClick={() => onStart({ decks: ['arren', 'issa'], names: [name0 || 'Player', 'Issa (computer)'], bot: true, level: 'easy', tutorial: true, seed: seed() })}>
							Start the tutorial
						</button>
					</div>
					<div className="learn-card">
						<h3>Deck lessons &amp; combos</h3>
						<p className="dim">For each deck: a guide to its game plan, then a coached game where the coach points out combos as they come up, plus combo drills — set positions with a goal, coached step by step.</p>
						<div className="lessons">
							{DECK_LESSONS.map((id: DeckId) => {
								const d = DECKS[id]
								return (
									<div key={id} className="lesson-deck">
										<CardFace stub={d.pb} name={pbName(id)} type="Phoenixborn" w={96} />
										<div className="lesson-body">
											<div className="dc-name">{pbName(id)}</div>
											<div className="dc-deck">{d.name}</div>
											<p className="small">{PLANS[id][0].body}</p>
											<div className="lesson-buttons">
												<button className="primary" onClick={() => onStart({ decks: [id, id === 'arren' ? 'issa' : 'arren'], names: [name0 || 'Player', `${pbName(id === 'arren' ? 'issa' : 'arren').split(' ')[0]} (computer)`], bot: true, level: 'easy', tutorial: true, lesson: { deck: id }, seed: seed() })}>
													Game plan + coached game
												</button>
												{drillsFor(id).map((dr) => (
													<button key={dr.id} title={dr.goal} onClick={() => onStart({ decks: [id, id === 'arren' ? 'issa' : 'arren'], names: [name0 || 'Player', 'Computer'], bot: true, level: 'normal', tutorial: true, lesson: { deck: id, drill: dr.id }, seed: seed() })}>
														Drill: {dr.title}
													</button>
												))}
											</div>
										</div>
									</div>
								)
							})}
						</div>
					</div>
				</section>
			)}

			{tab === 'computer' && (
				<section className="panel">
					<h2>Play the computer</h2>
					{deckPicker(deck0, (d) => (setDeck0(d), deck1 === d && setDeck1(otherDeck(d))), 'Your deck')}
					{deckPicker(deck1, setDeck1, 'The computer’s deck')}
					<div className="row">
						<label className="field">
							Your name <input value={name0} onChange={(e) => saveName(e.target.value)} maxLength={24} />
						</label>
						<label className="field">
							Difficulty
							<select value={level} onChange={(e) => setLevel(e.target.value as BotLevel)}>
								<option value="easy">Easy</option>
								<option value="normal">Normal</option>
								<option value="expert">Expert (thinks a move ahead)</option>
							</select>
						</label>
					</div>
					<button
						className="primary big"
						onClick={() => {
							const d1 = deck1
							onStart({ decks: [deck0, d1], names: [name0 || 'Player', `${defOf(DECKS[d1].pb).name.split(' ')[0]} (computer)`], bot: true, level, tutorial: false, seed: seed() })
						}}
					>
						Start
					</button>
				</section>
			)}

			{tab === 'hotseat' && (
				<section className="panel">
					<h2>Two players, one device</h2>
					<p className="dim">Pass the device between turns — your hand is hidden until you tap.</p>
					{deckPicker(deck0, (d) => (setDeck0(d), setDeck1(otherDeck(d))), 'Player 1')}
					<label className="field">
						Player 1 name <input value={name0} onChange={(e) => saveName(e.target.value)} maxLength={24} />
					</label>
					{deckPicker(deck1, setDeck1, 'Player 2')}
					<label className="field">
						Player 2 name <input value={name1} onChange={(e) => setName1(e.target.value)} maxLength={24} />
					</label>
					<button className="primary big" onClick={() => onStart({ decks: [deck0, deck1], names: [name0 || 'Player 1', name1 || 'Player 2'], bot: false, level, tutorial: false, seed: seed() })}>
						Start
					</button>
				</section>
			)}

			{tab === 'friend' && (
				<section className="panel">
					<h2>{joinCode ? 'Join your friend’s game' : 'Play a friend online'}</h2>
					<p className="dim">{joinCode ? 'Pick your deck and press Join.' : 'Create an invite link and send it to your friend. When they open it, the game starts for both of you.'}</p>
					{deckPicker(deck0, setDeck0, 'Your deck')}
					<label className="field">
						Your name <input value={name0} onChange={(e) => saveName(e.target.value)} maxLength={24} />
					</label>
					<button className="primary big" onClick={() => onStart({ decks: [deck0, otherDeck(deck0)], names: [name0 || 'Player', 'Friend'], bot: false, level, tutorial: false, online: joinCode ? 'guest' : 'host', seed: seed() })}>
						{joinCode ? 'Join game' : 'Create invite link'}
					</button>
				</section>
			)}

			{tab === 'redrains' && (
				<section className="panel">
					<h2>Red Rains: The Corpse of Viros</h2>
					<p className="dim">A solo game against a chimera. It plays itself: each turn it rolls on its behaviour table, reveals face-down aspects and attacks. Rage dice and Red Rains tokens build towards its ultimate, which hits all your cards and pushes it into its next phase. Destroying an aspect wounds it by the aspect’s blood value — wear it down to 0 to win.</p>
					<div className="viros-row">
						<CardFace stub="corpse-of-viros" name="The Corpse of Viros" type="Chimera" w={150} />
						<div>
							{deckPicker(deck0, setDeck0, 'Your deck')}
							<div className="row">
								<label className="field">
									Your name <input value={name0} onChange={(e) => saveName(e.target.value)} maxLength={24} />
								</label>
								<label className="field">
									Difficulty
									<select value={soloLevel} onChange={(e) => setSoloLevel(e.target.value as 'S' | 'H')}>
										<option value="S">Standard (life 30)</option>
										<option value="H">Heroic (life 35)</option>
									</select>
								</label>
								<label className="field">
									Stage (starting threat)
									<select value={stage} onChange={(e) => setStage(Number(e.target.value) as 1 | 2 | 3)}>
										<option value={1}>Stage 1</option>
										<option value={2}>Stage 2</option>
										<option value={3}>Stage 3</option>
									</select>
								</label>
							</div>
						</div>
					</div>
					<button className="primary big" onClick={() => onStart({ decks: [deck0, 'viros'], names: [name0 || 'Player', 'The Corpse of Viros'], bot: true, level, tutorial: false, seed: seed(), solo: { level: soloLevel, stage } })}>
						Face the chimera
					</button>
				</section>
			)}

			<footer className="home-foot">
				<p>
					On iPhone or iPad: tap <b>Share → Add to Home Screen</b> for a full-screen app. Card text and images come from{' '}
					<a href="https://ashes.live" target="_blank" rel="noreferrer">
						ashes.live
					</a>
					. Ashes is a game by Plaid Hat Games; this is an unofficial fan project.
				</p>
			</footer>
		</div>
	)
}
