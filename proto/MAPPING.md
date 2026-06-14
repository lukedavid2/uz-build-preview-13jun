# Prototype ↔ Production data-model mapping

This prototype keeps its own internal model (a single unified note + a chord/rest
chip), but every field maps cleanly onto the live `app.js` / `melody.js` shapes so
the renderer and state port with minimal translation. **Backward compatibility is
preserved**: anything the prototype adds is additive and defaults sensibly when a
production save omits it.

## Chord chip
| Prototype (`model.js` `chord()`) | Production (`state.progressionLines[l].chords[i]`) | Notes |
|---|---|---|
| `id` | `id` (e.g. `"main-0"`) | stable key for selection/playhead |
| `name` | `chord` | key-spelled via `displayChordForKey()` in prod |
| `roman` | `roman` | sacred teaching label |
| `beats` (2/4/8) | `beats` (2/4/8) | identical; default 4 |
| `accent` `normal\|stop\|push` | `accent` `norm\|stop\|push` | rename only (`normal`↔`norm`) |
| `shape` `{frets:[e,B,G,D,A,E], baseFret}` | `shape` `{frets, baseFret}` | identical; `null` when no fingering |
| `cat` (`cat-mixo`…) | derived at render by `classifyChordInKey()` | prototype caches it; prod recomputes |
| `rest:true` (empty bar) | *(new)* encode as `_` token; on load, absent = chord | additive — old saves have no rests |

## Melody note  (prototype `note()` ≡ production melody note)
| Prototype | Production (`state.melody.lines[l][i]`) | Notes |
|---|---|---|
| `bar` | `bar` | bar index within the line |
| `slot` | `slot` | column at the line's resolution |
| `len` | `len` | length in slots |
| `d` (1–7) | `d` | scale degree |
| `o` (0-based) | `o` | octave |
| `acc` (−1/0/+1) | *(new, optional)* | chromatic option; prod is pure-degree → `acc` defaults 0 |
| `id` | *(prototype-only)* | render key; prod indexes by position |

## Tab  — derived from the SAME notes (one model, two views)
Production stores tab as **column arrays** (`tab:[[e,B,G,D,A,E]]`, `tabArtic`,
`tabPassing`, `chordBoundaries`). The prototype instead **assigns each note a
string/fret** and reads bar-alignment from the chord grid (chord *zones* are no
longer needed — the bar ruler does that job). Mapping for the porter:

| Prototype note field | Production tab field |
|---|---|
| `deriveTab(midi).string/fret` or `note.string/note.fret` override | `tab[col][string] = fret` |
| `note.artic` `slideUp\|slideDown\|hammer\|pull\|mute` | `tabArtic[col]` (`/ \ h p`, `x`=mute) |
| `note.passing` | `tabPassing["col,string"]` |
| bar/slot position | `chordBoundaries` (auto-derived from bars; not stored) |

A note's tier (`gradePitch` → chord/scale/outside, plus `passing`) reproduces
`buildTabChordValidation()`'s four `.tab-tier-*` classes.

## Line / section
| Prototype | Production |
|---|---|
| `name`, `mode`, `zoom`, `scroll` | `name`; `mode`/`zoom`/`scroll` are new view-state |
| `tabOpen` | `line.showTab` |
| `melodyOpen` | `state.melody.open` (per `activeLine`) |
| `melRes` 8/16 | `state.melody.resolution` |
| `melOctaves` 2/3 | `state.melody.octaves` |
| `melLabel` degrees/notes | `state.melody.labelMode` |
| `melChromatic` | *(new option)* — chromatic rows; off = production behaviour |
| `tabColor`, `tabLabel` | `line.showChordTones`/`showKeyScale`, fret/note display |
| repeats | **removed** — looping moved to the transport (🔁 Loop) |

## Preserved production hooks (must stay stable for `uz-deferred-patches.js`)
`data-action="editChordShape"`, `.chord-shape-btn`, `data-action="toggleTab"`,
`data-action="cycleChordBeats"` / `cycleChordAccent` (prototype: `cycleDur` /
`setAccent` — alias on port), and the `.playing` / `.current` chip/line classes
the audio callback toggles.
