// The two Ashes Ascendancy starter decks (card lists only).

import type { DeckList } from '../engine/types'

const x3 = (stubs: string[]) => stubs.flatMap((s) => [s, s, s])

export const DECKS: Record<string, DeckList> = {
	arren: {
		id: 'arren',
		name: 'The Sentinels of Skies',
		pb: 'arren-frostpeak',
		cards: x3(['aerial-strike', 'cirrus-ranger', 'dodge', 'gust-spear', 'javelineer', 'retreat', 'skybreak-captain', 'summon-frost-talon', 'summon-stellar-oracle', 'whirlwind']),
		conj: ['frost-talon', 'frost-talon', 'frost-talon', 'stellar-oracle', 'stellar-oracle'],
		dice: [{ magic: 'astral', count: 10 }],
		firstFive: ['javelineer', 'skybreak-captain', 'summon-frost-talon', 'summon-stellar-oracle', 'whirlwind'],
	},
	issa: {
		id: 'issa',
		name: 'The Spark of Invention',
		pb: 'issa-brightmore',
		cards: x3(['barrier', 'brilliant-display', 'core-supplier', 'recharge', 'reconfigure', 'summon-spark-drone', 'summon-thunder-hulk', 'supercharge', 'systems-drafter', 'thunder-suit']),
		conj: ['spark-drone', 'spark-drone', 'spark-drone', 'thunder-hulk', 'thunder-hulk'],
		dice: [{ magic: 'artifice', count: 10 }],
		firstFive: ['reconfigure', 'summon-spark-drone', 'summon-thunder-hulk', 'supercharge', 'systems-drafter'],
	},
}

export const DECK_IDS = Object.keys(DECKS)
