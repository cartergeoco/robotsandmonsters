# RAM — Robots & Monsters

RAM is a digital D&D/TTRPG role-playing simulator where the user acts as Game
Master and AI agents play the Player Characters. It is designed around fast,
direct control of characters, encounters, maps, and the shared narrative while
keeping each AI character independent.

The project is inspired by
[DougDoug's Multi-Agent GPT Characters](https://github.com/DougDougGithub/Multi-Agent-GPT-Characters).
Map and token assets can be sourced separately from
[2-Minute Tabletop](https://2minutetabletop.com); those assets are not bundled
with this repository.

## Current features

- Infinite canvas map with grid coordinates, hover feedback, middle-mouse
  panning, cursor-centered zooming, and draggable tokens.
- Player Character creation and editing, including identity, levels, HP, AC,
  abilities, skills, traits, features, inventory, status effects, personality,
  and token art.
- Library with built-in and custom tokens plus categorized weapons, armor,
  trinkets, consumables, tools, materials, quest items, trash, and other items.
- Editable token visuals and per-cell map bounds, with map-token organization
  and controls in the Environment panel.
- Shared GM console with full-screen, physics-based 3D dice rolls, calculated
  totals, character response controls, and clear-history confirmation.
- Independent AI turns through OpenAI-compatible APIs. Each character receives
  its own sheet, its own view of the map, and the shared scene history, so it
  remains aware of the party without speaking or acting for another PC.
- Budgeted character context: a perception bubble around the character, an ally
  roster, keyword-triggered rule and item lookups, private per-character
  knowledge, and a rolling session memory. See
  [Character context](#character-context).
- Automatic local campaign persistence.
- Persisted light/dark themes, curated color palettes, interface density,
  readable text scales, reduced motion/transparency, enhanced focus, and
  console preferences.

## Character context

A character has to know its sheet, the ground it stands on, its allies, and the
rules, without being handed the whole campaign every turn. Sending everything
degrades the reply and buries what matters, so each turn assembles a small
budgeted packet instead of a data dump. `src/aiContext.ts` builds it and
`src/ai.ts` sends it.

The packet is assembled in layers, deliberately ordered so the most important
material sits at the start and the end of the prompt:

| Layer | Content | Cost |
| --- | --- | --- |
| Own sheet | Full compacted sheet: stats, gear mechanics, rules, actions | ~500-900 tokens |
| Core rules | The dozen rules needed every turn, always present | ~200 tokens |
| Private knowledge | Secrets and hooks for this character only | Author's choice |
| Session memory | Rolling digest of history that left the window | ~10 bullets |
| Ally roster | One line per ally: build, health, armour, distance, effects | ~30 tokens each |
| Scene | Place, light, and nearby tokens with distance and bearing | ~20 tokens each |
| Reference | Rules, items, creatures, and places this moment mentions | Capped by budget |
| Console | Recent messages, word for word | Set by line count |

Only the character's own sheet is sent in full. Allies appear as what a
companion could see and be told, and map tokens appear as what the character
could perceive: everything past the awareness radius is a distant shape, and
lighting changes how the scene reads. Rules and items are looked up by keyword
from the recent console and nearby tokens, never dumped wholesale, and anything
already on the character's sheet is skipped rather than repeated.

When console lines age out of the verbatim window they are condensed into
session memory, so a long campaign is remembered without an ever-growing
prompt. Summaries can drift, so the digest is editable from the brain icon in
the Console header. Game Master notices such as connection errors stay with the
Game Master and never enter a prompt; dice results do.

Everything is tunable in Settings under AI: console lines sent in full, scene
awareness in feet, the token ceiling for lookups, and session memory. A typical
turn lands around 1,200-2,000 input tokens.

## PC functions

AI player characters can call structured functions instead of guessing at exact
sheet or map data. Native tool calling is used when the selected provider
supports it; other and local models can fall back to a compact text protocol.
Use **Test tools** in AI Settings to verify the full round trip separately from
the basic connection test.

Functions follow a strict authority boundary:

- **Queries** read the PC's sheet, inventory, actions, modifiers, visible
  creatures and objects, distances, paths, and perceptibility. They never change
  campaign state.
- **Declarations** let a PC speak, emote, request a roll, or announce movement
  and actions. The default is a persistent intent bubble above the PC token;
  proposals can be accepted or dismissed, while announcements remain
  informational.
- **Bookkeeping** can equip gear and maintain private memories and a current
  goal. It affects only that PC's sheet.

Gameplay Settings control movement, action, roll, and bookkeeping autonomy
independently. Movement and actions default to announcement rather than
automatic board changes. Hidden creatures remain filtered through character
perception, and save-area hazards stay GM-only unless explicitly revealed.
Entity handles are short and valid for one turn, so models can refer to targets
without receiving internal campaign UUIDs.

Function schemas consume prompt space, and Settings shows their approximate
cost. When functions are enabled, only identity, vitals, personality, and a
sheet-query reminder are sent up front; exact sheet sections are fetched on
demand to offset that cost.

## Development

Requirements:

- Node.js 18 or newer
- npm

Install and start the development server:

```bash
npm install
npm run dev
```

Create a distributable production build:

```bash
npm run build
```

Preview that build locally:

```bash
npm run preview
```

AI configuration is available from the in-app settings panel. RAM supports
OpenAI-compatible endpoints such as OpenAI, OpenRouter, LM Studio, and Ollama.
API credentials are stored in the browser's local storage and must never be
committed to this repository.

## Repository branches

- `main` — stable working branch. Every commit intended for distribution must
  pass the production build.
- `nightly` — integration branch for semi-working and work-in-progress changes.
  It must remain buildable and suitable for nightly distribution.
- Feature/update branches — isolated development branches for future major
  updates. Merge these into `nightly` for integration and testing before
  promoting them to `main`.

### Future update branch names

Future update branches use:

```text
a<Future-Version-Code>-<Update-Name>
```

Example:

```text
a1.3.0-Confetti-Update
```

This means **Alpha 1.3.0 — The Confetti Update**. Git branch names cannot
contain spaces, so every space in the update name must be replaced by a
hyphen. Keep names concise and use title casing for readability.

## Versioning

RAM releases use `Version.Update.Patch`:

```text
1.2.3
```

- `Version` — the product generation.
- `Update` — a major feature update within that version.
- `Patch` — a compatible fix or small improvement to that update.

For example, `1.2.3` is the third patch of the second update in Version 1.
Update work begins on an alpha branch, is integrated into `nightly`, and is
promoted to `main` when it is ready for stable distribution.

## Project organization

```text
.
├── public/
│   ├── fonts/            Local Voces and Lekton font files and OFL licenses
│   └── ram-logo.png      RAM application mark
├── src/
│   ├── components/       React interface and canvas components
│   │   └── ui/           RAM primitives and world glyphs
│   ├── ai.ts             AI request assembly and API adapter
│   ├── aiContext.ts      Character context packets, lookups, and budgeting
│   ├── store.ts          Persistent campaign state and actions
│   ├── types.ts          Shared domain models
│   ├── util.ts           File and dice utilities
│   ├── global.css        Application design system and layout
│   ├── App.tsx           Main application composition
│   └── main.tsx          Browser entry point
├── index.html            Vite HTML entry point
├── package.json          Dependencies and npm scripts
├── tsconfig.json         TypeScript configuration
└── vite.config.ts        Development and build configuration
```

Generated dependencies and production output are intentionally excluded from
Git. User-provided maps, tokens, campaign data, and API settings remain in the
browser and are not repository assets.

## Technology

- React
- TypeScript
- Vite
- Zustand
- Three.js, React Three Fiber, and Rapier
- HTML Canvas
- Lucide icons
- Voces and Lekton typography (bundled under the SIL Open Font License)

## Planned direction

Future development can include richer encounter automation, additional
environment controls, music and ambience management, asset-library workflows,
and scalable campaign storage. New systems should preserve RAM's minimalist,
transparent, dark, and cozy interface while prioritizing responsiveness and
data efficiency.
