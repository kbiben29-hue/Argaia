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
}

type Tab = 'computer' | 'hotseat' | 'friend' | 'learn'

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
							<span className={`dc-magic mg-${d.dice[0].magic}`}>
								<DieChip die={{ magic: d.dice[0].magic, level: 'power' }} size={22} />
								<DieChip die={{ magic: d.dice[0].magic, level: 'class' }} size={22} />
								<DieChip die={{ magic: d.dice[0].magic, level: 'basic' }} size={22} />
								{d.dice[0].magic} dice
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
				<div className="tagline">A table for Ashes: Rise of the Phoenixborn — Ascendancy starter decks</div>
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
					{deckPicker(deck0, setDeck0, 'Your deck')}
					<div className="row">
						<label className="field">
							Your name <input value={name0} onChange={(e) => saveName(e.target.value)} maxLength={24} />
						</label>
						<label className="field">
							Difficulty
							<select value={level} onChange={(e) => setLevel(e.target.value as BotLevel)}>
								<option value="easy">Easy</option>
								<option value="normal">Normal</option>
							</select>
						</label>
					</div>
					<button
						className="primary big"
						onClick={() => {
							const d1 = otherDeck(deck0)
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
