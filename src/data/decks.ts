// The decks we play (card lists only): the two Ashes Ascendancy starter decks and four Reborn
// preconstructed decks, chosen so every magic type is covered (and by how popular each Phoenixborn
// is on ashes.live).

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
	jessa: {
		id: 'jessa',
		name: 'The Bloodwoods Queen',
		pb: 'jessa-na-ni',
		cards: x3(['blood-archer', 'blood-shaman', 'blood-transfer', 'cut-the-strings', 'fear', 'final-cry', 'living-doll', 'redirect', 'summon-blood-puppet', 'undying-heart']),
		conj: ['blood-puppet', 'blood-puppet', 'blood-puppet', 'blood-puppet', 'blood-puppet'],
		dice: [{ magic: 'ceremonial', count: 5 }, { magic: 'charm', count: 5 }],
		firstFive: ['blood-archer', 'blood-transfer', 'living-doll', 'summon-blood-puppet', 'final-cry'],
	},
	harold: {
		id: 'harold',
		name: 'The Demons of Darmas',
		pb: 'harold-westraven',
		cards: x3(['adrenaline-rush', 'beast-mage', 'beast-warrior', 'consume-soul', 'dark-reaping', 'drain-vitality', 'master-vampire', 'psychic-vampire', 'summon-vampire-bat-swarm', 'transmute-magic']),
		conj: ['hunters-mark', 'vampire-bat-swarm', 'vampire-bat-swarm', 'vampire-bat-swarm'],
		dice: [{ magic: 'ceremonial', count: 5 }, { magic: 'sympathy', count: 5 }],
		firstFive: ['summon-vampire-bat-swarm', 'master-vampire', 'beast-mage', 'drain-vitality', 'psychic-vampire'],
	},
	xander: {
		id: 'xander',
		name: 'The King of Titans',
		pb: 'xander-heartsblood',
		cards: x3(['earthquake', 'law-of-domination', 'mass-heal', 'natures-wrath', 'pain-shaman', 'raptor-herder', 'sacred-ground', 'summon-archasaurus-mount', 'summon-cerasaurus-mount', 'summon-shining-hydra']),
		conj: ['raptor-hatchling', 'raptor-hatchling', 'raptor-hatchling', 'archasaurus-mount', 'cerasaurus-mount', 'cerasaurus-mount', 'shining-hydra', 'shining-hydra-head', 'shining-hydra-head', 'shining-hydra-head'],
		dice: [{ magic: 'natural', count: 5 }, { magic: 'divine', count: 5 }],
		firstFive: ['raptor-herder', 'summon-cerasaurus-mount', 'pain-shaman', 'sacred-ground', 'summon-shining-hydra'],
	},
	hope: {
		id: 'hope',
		name: 'The Artist of Dreams',
		pb: 'hope-everthorn',
		cards: x3(['double-down', 'dream-fracture', 'dreamlock-mage', 'ensnare', 'keepsake', 'realm-walker', 'reimagine', 'summon-fox-spirit', 'summon-wishing-wing', 'void-pulse']),
		conj: ['fox-spirit', 'fox-spirit', 'fox-spirit', 'wishing-wing', 'wishing-wing', 'wishing-wing'],
		dice: [{ magic: 'illusion', count: 5 }, { magic: 'time', count: 5 }],
		firstFive: ['summon-fox-spirit', 'summon-wishing-wing', 'dreamlock-mage', 'realm-walker', 'dream-fracture'],
	},
}

export const DECK_IDS = Object.keys(DECKS)
