// Numbers-only card data for the Ashes Ascendancy starter decks (names, types, costs and values).
// Card rules text and images are loaded at run time from github.com/kbiben29-hue/ashes-cards; the
// engine never reads card text — every ability is scripted in effects.ts.

import type { CardDef } from '../engine/types'

export const STARTER_CARDS: Record<string, CardDef> = {
	'aerial-strike': {"stub": "aerial-strike", "name": "Aerial Strike", "type": "Action Spell", "placement": "Discard", "cost": ["[[side]]", "1 [[basic]]"], "unique": "Arren Frostpeak"},
	'arren-frostpeak': {"stub": "arren-frostpeak", "name": "Arren Frostpeak", "type": "Phoenixborn", "life": 15, "battlefield": 7, "spellboard": 3},
	'barrier': {"stub": "barrier", "name": "Barrier", "type": "Reaction Spell", "placement": "Discard", "cost": ["1 [[artifice:power]]"]},
	'brilliant-display': {"stub": "brilliant-display", "name": "Brilliant Display", "type": "Action Spell", "placement": "Discard", "cost": ["[[main]]", "1 [[basic]]"], "unique": "Issa Brightmore"},
	'cirrus-ranger': {"stub": "cirrus-ranger", "name": "Cirrus Ranger", "type": "Ally", "placement": "Battlefield", "attack": 2, "life": 2, "recover": 1, "cost": ["[[main]]", "1 [[astral:class]]", "1 [[basic]]"]},
	'core-supplier': {"stub": "core-supplier", "name": "Core Supplier", "type": "Ally", "placement": "Battlefield", "attack": 2, "life": 2, "recover": 1, "cost": ["[[main]]", "1 [[artifice:class]]", "1 [[basic]]"]},
	'dodge': {"stub": "dodge", "name": "Dodge", "type": "Reaction Spell", "placement": "Discard", "cost": ["1 [[astral:power]]"]},
	'frost-talon': {"stub": "frost-talon", "name": "Frost Talon", "type": "Conjuration", "placement": "Battlefield", "attack": 1, "life": 1, "recover": 0, "copies": 3},
	'gust-spear': {"stub": "gust-spear", "name": "Gust Spear", "type": "Alteration Spell", "placement": "Unit", "attack": "+1", "cost": ["[[side]]", "1 [[astral:class]]"]},
	'issa-brightmore': {"stub": "issa-brightmore", "name": "Issa Brightmore", "type": "Phoenixborn", "life": 18, "battlefield": 5, "spellboard": 5},
	'javelineer': {"stub": "javelineer", "name": "Javelineer", "type": "Ally", "placement": "Battlefield", "attack": 1, "life": 1, "recover": 1, "cost": ["[[main]]", "1 [[astral:power]]"]},
	'recharge': {"stub": "recharge", "name": "Recharge", "type": "Action Spell", "placement": "Discard", "cost": ["[[main]]", "1 [[artifice:power]]", "1 [[discard]]"]},
	'reconfigure': {"stub": "reconfigure", "name": "Reconfigure", "type": "Ready Spell", "placement": "Spellboard", "cost": ["[[side]]"]},
	'retreat': {"stub": "retreat", "name": "Retreat", "type": "Action Spell", "placement": "Discard", "cost": ["[[side]]"]},
	'skybreak-captain': {"stub": "skybreak-captain", "name": "Skybreak Captain", "type": "Ally", "placement": "Battlefield", "attack": 3, "life": 3, "recover": 2, "cost": ["[[main]]", "1 [[astral:power]]", "1 [[astral:class]]", "1 [[basic]]"]},
	'spark-drone': {"stub": "spark-drone", "name": "Spark Drone", "type": "Conjuration", "placement": "Battlefield", "attack": 0, "life": 2, "recover": 0, "copies": 3},
	'stellar-oracle': {"stub": "stellar-oracle", "name": "Stellar Oracle", "type": "Conjuration", "placement": "Battlefield", "attack": 2, "life": 2, "recover": 0, "copies": 2},
	'summon-frost-talon': {"stub": "summon-frost-talon", "name": "Summon Frost Talon", "type": "Ready Spell", "placement": "Spellboard", "cost": ["[[main]]"]},
	'summon-spark-drone': {"stub": "summon-spark-drone", "name": "Summon Spark Drone", "type": "Ready Spell", "placement": "Spellboard", "cost": ["[[main]]"]},
	'summon-stellar-oracle': {"stub": "summon-stellar-oracle", "name": "Summon Stellar Oracle", "type": "Ready Spell", "placement": "Spellboard", "cost": ["[[main]]"]},
	'summon-thunder-hulk': {"stub": "summon-thunder-hulk", "name": "Summon Thunder Hulk", "type": "Ready Spell", "placement": "Spellboard", "cost": ["[[main]]"]},
	'supercharge': {"stub": "supercharge", "name": "Supercharge", "type": "Ready Spell", "placement": "Spellboard", "cost": ["[[side]]", "1 [[artifice:class]]"]},
	'systems-drafter': {"stub": "systems-drafter", "name": "Systems Drafter", "type": "Ally", "placement": "Battlefield", "attack": 1, "life": 1, "recover": 1, "cost": ["[[main]]", "1 [[artifice:class]]"]},
	'thunder-hulk': {"stub": "thunder-hulk", "name": "Thunder Hulk", "type": "Conjuration", "placement": "Battlefield", "attack": 3, "life": 3, "recover": 0, "copies": 2},
	'thunder-suit': {"stub": "thunder-suit", "name": "Thunder Suit", "type": "Alteration Spell", "placement": "Unit", "attack": "+2", "life": "+2", "recover": "+1", "cost": ["[[main]]", "1 [[artifice:class]]", "1 [[basic]]"]},
	'whirlwind': {"stub": "whirlwind", "name": "Whirlwind", "type": "Ready Spell", "placement": "Spellboard", "cost": ["[[side]]", "1 [[astral:class]]"]},
}
