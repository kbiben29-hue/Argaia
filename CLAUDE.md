# CLAUDE.md

Argaia is an unofficial browser implementation of **Ashes** (Ashes Reborn / Ascendancy, Plaid Hat Games):
a pure TypeScript rules engine, a React UI, hot-seat play, a computer opponent, online play with a friend
and a tutorial coach. It is a sibling of Afterlife (kbiben29-hue/Afterlife-) and Holodeck and follows the
same ideas. Currently: the two Ashes Ascendancy starter decks (Arren Frostpeak, Issa Brightmore).

## Commands

```bash
npm run dev          # Vite app on :5173
npm test             # tsx --test src/**/*.test.ts (node:test, no vitest)
npm run sim -- 50    # bot-vs-bot games; prints wins per deck
npm run build        # vite build (base './')
```

## Layout

- `src/engine/types.ts` — GameState, Inst (every card instance), Die, Intent, Question, Pending.
- `src/engine/engine.ts` — state helpers, `newGame()`, `apply(state, intent)` (pure: clones, never mutates),
  `tryApply()` for the UI, problem checks (`playProblem`, `abilityProblem`, `attackProblem`, `dicePowerProblem`),
  the task runner and the damage pipeline (`dealDamage` → Barrier hook → astral die → wounds → defeat).
- `src/engine/flows.ts` — the game's own task scripts: setup (First Five), prepare (roll → first player →
  discard/draw/fatigue), recovery (heal/exhaustion/dice → re-roll choice → end of round), play, ability, attack.
- `src/engine/effects.ts` — every starter card: `CARD_SCRIPTS` keyed `${stub}:play|enter|attach|ability`,
  `ABILITIES` (cost + our own one-line help), `KEYWORDS` (stalk, unitGuard, dormant, overkill),
  `PLAY_CHECKS`, `HOOKS` for the two reactions (Dodge after attackers are declared, Barrier when a charged card is dealt damage).
- `src/engine/dice.ts` — cost parsing (`[[main]]`, `1 [[astral:class]]`…), `paysExactly`, `autoPay`.
- `src/engine/moves.ts` — `legalIntents(state)` (dice auto-paid); used by the bot, coach and fuzz test.
- `src/bot/bot.ts` — tries each legal move, answers the follow-up questions by option `score`, keeps the best `evaluate()`.
- `src/data/starterCards.ts` — names, types, costs and values only (no rules text). `src/data/decks.ts` — the two decklists.
- `src/data/cardText.ts` — loads text + images from raw.githubusercontent.com/kbiben29-hue/ashes-cards at run time (cached in localStorage).
- `src/ui/` — `Board.tsx` (console table + pocket phone layout from the same pieces), `Setup.tsx`, `Card.tsx`, `Die.tsx`, `coach.ts`, `sfx.ts`, `styles.css`.
- `src/engine/scenario.ts` — build a position directly (drills, tests).
- `src/ui/lessons.ts` — per-deck `PLANS`, `COMBOS` (alerts in coached deck games), `DRILLS` (built with `scenario`; `lessons.test.ts` solves each one and checks the obvious wrong move fails). Lesson text is our own wording.
- `src/App.tsx` — fit-to-screen scaling of the 1440×900 stage, history/undo, autosave, bot loop, online host/guest.

## Tasks and questions

Multi-step things are Tasks run by `settle()`. A script asks with `c.ask(player, question)`; with no recorded
answer it throws `NeedChoice`, the whole run is discarded and `pending` becomes `{kind:'choose'}`; the `choose`
intent records the answer and the task re-runs from the start. **Anything the player should see before
answering must be committed by an earlier task** (that's why prepare and recovery are split into several tasks).
A question with one option (min 1) or exactly min=max=options is answered automatically. Options carry a
`score` for the bot and the coach.

## Layouts

`Board` renders **console** (1440×900 table scaled to fit; computers and iPad) and **pocket** (phone:
touch-first page, foe at top, sticky prompt bar, hand docked at the bottom, bottom sheets for the card viewer,
questions and the menu/log). Auto picks pocket on touch screens under 600px short side; the menu has a switch
(localStorage `argaia.layout`). Tapping a card opens the viewer with its actions — no hover needed anywhere.

## Online play

Same as Afterlife: `src/net/transport.ts` (PeerJS from unpkg; `?net=local` = BroadcastChannel between tabs),
`src/net/online.ts`. Host = seat 0 referees, guest = seat 1. Peer id `argaia-<code>`.

## Releases

`.github/workflows/release.yml` on every push to main: tests → GitHub Pages (https://kbiben29-hue.github.io/Argaia/,
Pages source "GitHub Actions") → Tauri apps (`Argaia-Mac.dmg`, `Argaia-Windows-Setup.exe`) on a new release.

## Hard rules

- **Engine determinism**: no `Math.random`, `Date.now` or `new Date` in `src/engine/**` and `src/bot/**`; use `state.rng` via `Rng`.
- **The engine is DOM-free**: no imports from `src/ui`. Engine tests run in plain Node.
- **Rules source**: the Ashes Ascendancy comprehensive rulebook. Card text overrides rules.
- **No card rules text in this repo** (it's loaded from ashes-cards). Help strings are our own wording.
- Every rules change gets a test in `src/engine/*.test.ts`; run `npm test` and `npm run sim` before committing.

## Next steps

1. More decks: add numbers to `starterCards.ts` (or a new data file), scripts to `effects.ts`, a decklist to `decks.ts`
   (precon lists: ashes.live / Ashteki's `data/decks/precon-*.json`). Natural Magic expansion (Garden of Brilliance,
   Shaper of Storms) is the natural next pair.
2. The Dragonborn (solo PvE boss from the starter set).
3. A stronger bot (Issa is weaker in bot-vs-bot games: it doesn't plan charging).
4. Deck builder.
