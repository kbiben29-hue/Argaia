# Argaia

**Play:** https://kbiben29-hue.github.io/Argaia/ ·
**Mac app:** [Argaia-Mac.dmg](https://github.com/kbiben29-hue/Argaia/releases/latest/download/Argaia-Mac.dmg) ·
**Windows app:** [Argaia-Windows-Setup.exe](https://github.com/kbiben29-hue/Argaia/releases/latest/download/Argaia-Windows-Setup.exe)

Every push to `main` rebuilds all three (`.github/workflows/release.yml`); the links always point at the newest build.

Argaia lets you play **Ashes** (Ashes Reborn / Ashes Ascendancy, by Plaid Hat Games) in a web browser.
It's a fan project with no official standing. Six decks cover all nine magic types:

| Phoenixborn | Deck | Dice |
|---|---|---|
| Arren Frostpeak | The Sentinels of Skies (Ascendancy starter) | astral |
| Issa Brightmore | The Spark of Invention (Ascendancy starter) | artifice |
| Jessa Na Ni | The Bloodwoods Queen | ceremonial + charm |
| Harold Westraven | The Demons of Darmas | ceremonial + sympathy |
| Xander Heartsblood | The King of Titans | natural + divine |
| Hope Everthorn | The Artist of Dreams | illusion + time |

The four Reborn decks are official preconstructed decks. They were chosen as the most-built Phoenixborn on
[ashes.live](https://ashes.live) (public decks per Phoenixborn) that, between them, cover the seven magic
types the starters don't.

- **Red Rains: The Corpse of Viros** — the first chimera, as a solo game (Standard or Heroic, stage 1–3).
  The chimera plays itself from its behaviour table: it reveals face-down aspects, attacks, raises rage dice,
  gathers Red Rains tokens and unleashes its ultimate, moving through three phases. Destroying an aspect
  wounds it by the aspect's blood value. (This uses the "Fury" aspects: Rampage, Hunting Instincts,
  Firebelly, Iron Scales, Frozen Fear and Whiplash.)

- **Vs computer** — Easy, Normal or Expert (looks at your best reply before it moves).
- **Two players** on one device (the hand is hidden while you pass it over).
- **Play a friend** online with an invite link.
- **Learn** — two levels, like Holodeck:
  - **Tutorial: practice game** — a real game against the computer with a coach that explains each step
    (First Five, dice and costs, main and side actions, attacking, blocking, guarding, reactions, recovery)
    and makes the suggested card, die or button glow.
  - **Deck lessons & combos** — for Arren and for Issa (the starter decks): a guide to the deck's game plan, then a coached game
    where the coach points out combos as they come up, plus combo drills: set positions with a goal
    ("win this turn"), coached step by step, with a debrief when you solve them.

Every game saves itself and can be undone move by move. **Forfeit** is in the menu, and **Manual fixes**
(menu switch) adds buttons to the card viewer to fix a mistake by hand: add or remove a wound, exhaust or
ready a card, return it to hand or discard it.

## iPhone and iPad

- **iPad** shows the full table scaled to fit (landscape is best).
- **iPhone** gets its own phone layout: the opponent at the top, your side below, your hand docked at the
  bottom. Tap any card to see it big with its buttons.
- Open the play link in Safari, then **Share → Add to Home Screen** for a full-screen Argaia app.

## Look and feel

Styled after Ashes itself: a slate-blue table, ivory and silver panels like the card frames, gold trim,
and the real dice symbols and colours. Status and buttons sit in the right-hand column on computers and
iPads, and above your hand on phones.

## How to play on the table

- **Tap a card** (or point at it with a mouse) to see it large with its rules text and what you can do with it
  (Play, use its ability, attack with it, attack it). Tap it again or press Esc to close. Hand cards also
  zoom when you point at them.
- **Drag and drop** (mouse or finger): drag a card from your hand up onto the table to play it, drag one of
  your units onto an enemy unit to attack it (an arrow follows you) or onto their Phoenixborn to start an
  attack, and drag a power die onto a card to use its dice power.
- **Ability buttons** (⚡) appear right on your cards when their ability can be used.
- **Piles**: each side shows its draw pile, discard pile (top card showing) and conjuration pile — tap the
  discard or conjuration pile to look through it.
- **Paying**: the game picks the cheapest dice for you; tap dice to swap before you confirm.
- **Attack**: press Attack (or "Attack with this unit"), tap their Phoenixborn or a unit, tap your attackers, then **Attack!**
- **Dice power**: tap one of your dice showing its power symbol, then tap the card to put it on.
- **Meditate**: press Meditate, tap a card to discard (or *Top of deck*), tap a die, pick its new side; repeat, then **Done**.
- Questions (blocks, guards, counters, reactions, targets) pop up when they're yours to answer;
  *See the table* lets you look before you answer.

## What the game does for you

The rules engine (`src/engine/`) runs the whole game: First Five, rolling and the first player choice,
prepare-phase discards and fatigue, main and side actions, dice costs (power pays class and basic,
class pays basic), parallel play of ready spells and stacking, conjuration piles, battlefield and
spellboard limits, attacks on a Phoenixborn (blocks) or a unit (guards, Phoenixborn guard once a round,
Unit Guard, counters), simultaneous battle damage, wounds and destruction, exhaustion, reactions (one per
player per turn), the recovery phase and the first player token. Every card in all six decks has its
abilities automated, and all nine dice powers work (astral, artifice, natural, illusion, ceremonial, charm,
divine, sympathy, time). That includes keywords like Stalk, Terrifying, Gigantic, Transform, Group Tactics,
Overkill, Life Drain and Armored; mounts with riders; Blood Puppets on the opponent's side; Hunter's Mark;
Law of Domination; reactions such as Dodge, Barrier, Final Cry, Redirect, Consume Soul, Double Down,
Ensnare and Void Pulse; and Jessa's Screams of the Departed.

## Where the cards come from

The Red Rains rules come from the published Red Rains rules as implemented by the open-source
[Ashteki](https://github.com/ashteki/ashteki) client (reference only; no code was copied).

Card text and pictures are loaded while you play from
[kbiben29-hue/ashes-cards](https://github.com/kbiben29-hue/ashes-cards) (downloaded there from the fan site
[ashes.live](https://ashes.live)) and cached on your device. This repo only holds names and numbers.

## Running it yourself

On a Mac, double-click **Start Argaia.command** (needs [Node.js](https://nodejs.org) LTS). On Windows,
**Start Argaia (Windows).bat**. Or:

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # rules tests + random-game fuzz test
npm run sim -- 20  # computer-vs-computer games, every deck pairing (+ vs the chimera)
npm run sim -- 20 jessa viros   # one pairing
npm run build      # static site in dist/
```

## Legal

Ashes, Ashes Reborn and Ashes Ascendancy are © Plaid Hat Games. Plaid Hat Games has no connection to this
project and hasn't approved it.
