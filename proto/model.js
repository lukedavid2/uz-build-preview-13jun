/* model.js — chord builder v2 prototype
   Core state + music-theory engine + unified note model.
   Vanilla JS; everything hangs off window.MODEL. See MAPPING.md for the
   prototype↔production field map. */
(function () {
  'use strict';

  const PC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const FLAT_KEYS = { F: 1, Bb: 1, Eb: 1, Ab: 1, Db: 1, Gb: 1 };
  const MAJOR = [0, 2, 4, 5, 7, 9, 11];
  const HMINOR = [0, 2, 3, 5, 7, 8, 11];
  const NMINOR = [0, 2, 3, 5, 7, 8, 10];          // natural minor = default melody/degree scale in minor
  const MIN_UNION = [0, 2, 3, 5, 7, 8, 9, 10, 11]; // natural+harmonic+melodic — used only for tier grading
  const OPEN = [64, 59, 55, 50, 45, 40]; // string 0 = high e … 5 = low E (midi)
  const STRING_LBL = ['e', 'B', 'G', 'D', 'A', 'E'];

  function spell(pc, keyName) { return (FLAT_KEYS[keyName] ? FLATS : NAMES)[((pc % 12) + 12) % 12]; }
  function parseChord(name) {
    const m = String(name).match(/^([A-G][#b]?)(.*)$/);
    return m ? { root: m[1], suffix: m[2] || '' } : { root: 'C', suffix: '' };
  }
  const isMinor = (suf) => /^m(?!aj)/.test(suf);
  const isDim = (suf) => /dim|°|o/.test(suf);
  const isAug = (suf) => /aug|\+/.test(suf);

  function transpose(name, semis, keyName) {
    const { root, suffix } = parseChord(name);
    const pc = (PC[root] + semis + 1200) % 12;
    return spell(pc, keyName) + suffix;
  }

  // chord intervals keyed by suffix (longest / most-specific prefix wins)
  const QUAL = [
    ['maj13', [0,4,7,11,2,9]], ['maj9', [0,4,7,11,2]], ['maj7', [0,4,7,11]], ['M7', [0,4,7,11]],
    ['m13', [0,3,7,10,2,9]], ['m11', [0,3,7,10,2,5]], ['m9', [0,3,7,10,2]],
    ['m7b5', [0,3,6,10]], ['m7-5', [0,3,6,10]], ['mmaj7', [0,3,7,11]], ['m6', [0,3,7,9]], ['m7', [0,3,7,10]], ['madd9', [0,3,7,2]], ['m', [0,3,7]], ['min', [0,3,7]],
    ['dim7', [0,3,6,9]], ['dim', [0,3,6]], ['\u00b07', [0,3,6,9]], ['\u00b0', [0,3,6]], ['o7', [0,3,6,9]],
    ['aug7', [0,4,8,10]], ['aug', [0,4,8]], ['+', [0,4,8]],
    ['7sus4', [0,5,7,10]], ['7sus2', [0,2,7,10]], ['sus2', [0,2,7]], ['sus4', [0,5,7]], ['sus', [0,5,7]],
    ['13', [0,4,7,10,2,9]], ['11', [0,4,7,10,2,5]], ['9', [0,4,7,10,2]], ['7', [0,4,7,10]],
    ['6/9', [0,4,7,9,2]], ['69', [0,4,7,9,2]], ['6', [0,4,7,9]],
    ['add9', [0,4,7,2]], ['5', [0,7]], ['', [0,4,7]],
  ];
  function intervalsFor(suffix) { const s = suffix || ''; for (const [k, iv] of QUAL) { if (k && s.indexOf(k) === 0) return iv; } return [0,4,7]; }
  // chord tones (pitch classes)
  function chordPitchClasses(name) {
    const { root, suffix } = parseChord(name); const r = PC[root];
    return intervalsFor(suffix).map((i) => (r + i) % 12);
  }
  function chordVoicing(name, octave) {
    const { root, suffix } = parseChord(name); const base = (octave || 4) * 12 + PC[root];
    return intervalsFor(suffix).map((i) => base + i);
  }
  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function midiToName(m, keyName) { return spell(((m % 12) + 12) % 12, keyName); }

  // ---- scales / degrees -----------------------------------------------------
  function scaleSemis(minor) { return minor ? NMINOR : MAJOR; }
  function scalePcs(keyPc, minor) { return scaleSemis(minor).map((s) => (keyPc + s) % 12); }
  function gradePcs(keyPc, minor) { return (minor ? MIN_UNION : MAJOR).map((s) => (keyPc + s) % 12); } // lenient: minor ♭6/♮6/♭7/♮7 all read in-scale
  // degree d(1..7), octave o(0-based), acc(-1..1) → midi. base: o0 d1 ≈ C4(+key)
  function degMidi(d, o, acc, keyPc, minor) {
    const sc = scaleSemis(minor);
    return 60 + keyPc + 12 * o + sc[(d - 1) % 7] + (acc || 0);
  }
  // tab assignment for a midi pitch — lowest playable fret 0..15
  function deriveTab(midi) {
    let best = null;
    for (let s = 0; s < 6; s++) {
      const fret = midi - OPEN[s];
      if (fret >= 0 && fret <= 19 && (!best || fret < best.fret)) best = { string: s, fret };
    }
    if (best) return best;
    // out of comfortable range — clamp to the closest playable string
    let alt = null;
    for (let s = 0; s < 6; s++) { const f = midi - OPEN[s]; if (f >= 0 && (!alt || f < alt.fret)) alt = { string: s, fret: Math.min(f, 24) }; }
    return alt || { string: 5, fret: 0 };
  }
  // theory tier of a pitch against a chord + key: 'chord'|'scale'|'outside'
  function gradePitch(midi, chordName, keyPc, minor) {
    const pc = ((midi % 12) + 12) % 12;
    if (chordPitchClasses(chordName).indexOf(pc) >= 0) return 'chord';
    if (gradePcs(keyPc, minor).indexOf(pc) >= 0) return 'scale';
    return 'outside';
  }

  // ---- functional palette catalog (mirrors renderChordGrid grouping) --------
  // returns groups of { name, roman, cat } transposed into the current key.
  function paletteFor(keyName, minor) {
    const k = PC[keyName];
    const mk = (semi, qual, roman, cat) => ({ name: spell((k + semi) % 12, keyName) + qual, roman, cat: cat || '' });
    if (!minor) {
      return [
        { label: 'Secondary dominants', hint: 'each resolves up a 4th', cat: 'cat-secdom',
          chords: [mk(9, '7', 'V/ii', 'cat-secdom'), mk(11, '7', 'V/iii', 'cat-secdom'), mk(0, '7', 'V/IV', 'cat-secdom'), mk(2, '7', 'V/V', 'cat-secdom'), mk(4, '7', 'V/vi', 'cat-secdom')] },
        { label: 'Diatonic', hint: 'in key', cat: '',
          chords: [mk(0, '', 'I', ''), mk(2, 'm', 'ii', ''), mk(4, 'm', 'iii', ''), mk(5, '', 'IV', ''), mk(7, '', 'V', ''), mk(9, 'm', 'vi', ''), mk(11, 'dim', 'vii°', '')] },
        { label: 'Modal interchange', hint: 'from parallel minor', cat: 'cat-borrowed',
          chords: [mk(3, '', '♭III', 'cat-borrowed'), mk(8, '', '♭VI', 'cat-borrowed'), mk(5, 'm', 'iv', 'cat-borrowed'), mk(10, '', '♭VII', 'cat-borrowed')] },
        { label: 'Borrowed modes', hint: 'colour tones', cat: '',
          chords: [mk(2, '', 'II', 'cat-lydian'), mk(10, '7', '♭VII7', 'cat-mixo'), mk(1, '', '♭II', 'cat-phryg'), mk(7, '', 'V△', 'cat-dom')] },
      ];
    }
    return [
      { label: 'Minor core', hint: 'harmonic minor', cat: '',
        chords: [mk(0, 'm', 'i', ''), mk(5, 'm', 'iv', ''), mk(7, '7', 'V7', 'cat-secdom'), mk(8, '', '♭VI', ''), mk(10, '', '♭VII', ''), mk(3, '', '♭III', '')] },
      { label: 'Tension', hint: 'leading & diminished', cat: 'cat-phryg',
        chords: [mk(2, 'dim', 'ii°', 'cat-phryg'), mk(11, 'dim', 'vii°', 'cat-phryg'), mk(3, 'aug', '♭III+', 'cat-lydian'), mk(1, '', '♭II (N)', 'cat-borrowed')] },
      { label: 'Secondary', hint: 'tonicise', cat: 'cat-secdom',
        chords: [mk(0, '7', 'V7/iv', 'cat-secdom'), mk(2, '7', 'V7/V', 'cat-secdom'), mk(5, '7', 'V7/♭VII', 'cat-secdom')] },
    ];
  }

  // classify any chord against the key (for tints on typed/loaded chips)
  function classifyChordInKey(name, keyName, minor) {
    const groups = paletteFor(keyName, minor);
    for (const g of groups) for (const c of g.chords) if (c.name === name) return c.cat;
    // fall back by pitch-class membership
    const { root } = parseChord(name); const pc = PC[root]; const k = PC[keyName];
    if (scalePcs(k, minor).indexOf(pc) < 0) return 'cat-borrowed';
    return '';
  }
  function catFor(roman) {
    if (/^V\//.test(roman)) return 'cat-secdom';
    if (/♭/.test(roman)) return 'cat-borrowed';
    return '';
  }

  let _id = 100;
  const uid = (p) => `${p}${(_id++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  function chord(name, roman, beats, cat) {
    return { id: uid('c'), name, roman, beats: beats || 4, start: 0, shape: null, cat: cat || catFor(roman) };
  }
  function rest(beats) { return { id: uid('r'), rest: true, beats: beats || 4 }; }
  // unified note: degree d(1..7)+octave o+acc gives pitch (melody view);
  // optional string/fret override the derived tab position; artic/passing for tab.
  function note(bar, slot, len, d, o, acc) {
    return { id: uid('n'), bar, slot, len: len || 1, d, o: o || 0, acc: acc || 0, artic: 'none', passing: false, string: null, fret: null };
  }

  // a couple of demo chord shapes (frets per string e B G D A E; null = muted)
  // derive a playable open-position fingering (frets per string e B G D A E; null = muted)
  function defaultShape(name) {
    const pcs = chordPitchClasses(name); const rootPc = PC[parseChord(name).root];
    const frets = []; let haveRoot = false;
    for (let s = 0; s < 6; s++) {
      let chosen = null;
      for (let f = 0; f <= 4; f++) { const pc = (OPEN[s] + f) % 12; if (pcs.indexOf(pc) >= 0) { chosen = f; if (pc === rootPc) haveRoot = true; break; } }
      frets[s] = chosen;
    }
    if (frets.every((f) => f === null)) return null;
    return { frets, baseFret: 0 };
  }
  const SHAPES = {
    A7: { frets: [0, 2, 0, 2, 0, null], baseFret: 0 },
    D7: { frets: [2, 1, 2, 0, null, null], baseFret: 0 },
    E7: { frets: [0, 0, 1, 0, 2, 0], baseFret: 0 },
  };

  function seed() {
    const verse = {
      id: 'verse', name: 'Verse', mode: 'stacked', zoom: 1, scroll: 0, loop: true, bpb: 4,
      tabOpen: false, melodyOpen: false,
      tabAuthored: false, melodyAuthored: true,
      melRes: 8, melOctaves: 2, melLabel: 'notes', melChromatic: false,
      tabColor: true, tabLabel: 'fret',
      chords: [
        Object.assign(chord('A7', 'I7', 4, 'cat-mixo'), { shape: SHAPES.A7, start: 0 }),
        Object.assign(chord('D7', 'IV7', 4, 'cat-mixo'), { shape: SHAPES.D7, start: 4 }),
        Object.assign(chord('A7', 'I7', 4, 'cat-mixo'), { start: 8 }),
        Object.assign(chord('E7', 'V7', 4, 'cat-secdom'), { shape: SHAPES.E7, start: 12 }),
      ],
      notes: [
        note(0, 0, 2, 1, 0), note(0, 3, 1, 3, 0), note(0, 5, 2, 5, 0),
        note(1, 0, 1, 4, 0), note(1, 2, 1, 3, 0), note(1, 4, 2, 1, 0),
        note(2, 0, 2, 5, 0), note(2, 4, 2, 3, 0),
        note(3, 0, 1, 2, 0), note(3, 2, 1, 4, 0), note(3, 4, 3, 1, 0),
      ],
    };
    const chorus = {
      id: 'chorus', name: 'Chorus', mode: 'stacked', zoom: 1, scroll: 0, loop: true, bpb: 4,
      tabOpen: false, melodyOpen: false,
      tabAuthored: true, melodyAuthored: false,
      melRes: 8, melOctaves: 2, melLabel: 'notes', melChromatic: false,
      tabColor: true, tabLabel: 'fret',
      chords: [
        Object.assign(chord('D7', 'IV7', 4, 'cat-mixo'), { start: 0 }), Object.assign(chord('D7', 'IV7', 4, 'cat-mixo'), { start: 4 }),
        Object.assign(chord('A7', 'I7', 4, 'cat-mixo'), { start: 8 }),
        Object.assign(chord('E7', 'V7', 2, 'cat-secdom'), { start: 12 }), Object.assign(chord('A7', 'I7', 2, 'cat-mixo'), { start: 14 }),
      ],
      notes: [
        note(0, 0, 2, 1, 0), note(0, 4, 2, 5, 0),
        note(1, 0, 2, 4, 0), note(1, 4, 2, 1, 0),
        note(2, 0, 2, 1, 0), note(2, 4, 2, 3, 0),
        note(3, 0, 4, 5, 0),
      ],
    };
    return {
      key: 'A', minor: false, bpm: 96, style: 'Pop', loop: true,
      playing: false, muted: false, playBeat: 0,
      currentLine: 'verse',
      selection: { lineId: null, ids: [] }, selNote: null, clipboard: [],
      undo: [],
      lines: [verse, chorus],
    };
  }

  function bpb(line) { return line.bpb || 4; }
  function totalBeats(line) { return line.chords.reduce((m, c) => Math.max(m, (c.start || 0) + c.beats), 0); }
  function nbarsOf(line) { return Math.max(1, line.minBars || 0, Math.ceil(totalBeats(line) / bpb(line) - 1e-9)); }
  function axisBeats(line) { return nbarsOf(line) * bpb(line); }
  function lineById(state, id) { return state.lines.find((l) => l.id === id); }
  // chord sounding at an absolute beat offset within a line (null over a rest); handles half-bar chords
  function chordAtBeat(line, beat) { let best = null; for (const c of line.chords) { const s = c.start || 0; if (beat >= s && beat < s + c.beats) best = c; } return best; }

  function lineToken(line) {
    const head = (line.bpb && line.bpb !== 4) ? `${line.bpb}/` : '';
    return head + line.chords.slice().sort((a, b) => (a.start || 0) - (b.start || 0)).map((c) => `${c.name}@${c.start || 0}.${c.beats}`).join('-');
  }
  function melLineToken(line) { return (line.notes || []).map((n) => `${n.bar}.${n.slot}.${n.len}.${n.d}.${n.o}.${n.acc || 0}${n.string != null ? '.s' + n.string : ''}${n.artic && n.artic !== 'none' ? '.x' + n.artic : ''}`).join('_'); }
  function shareToken(state) {
    const p = state.lines.map(lineToken).join('|');
    const hasNotes = state.lines.some((l) => l.notes && l.notes.length);
    const m = hasNotes ? '&m=' + state.lines.map(melLineToken).join('|') : '';
    return `/?key=${state.key}${state.minor ? 'm' : ''}&p=${p}${m}`;
  }

  window.MODEL = {
    PC, NAMES, FLATS, OPEN, STRING_LBL, MAJOR, HMINOR, SHAPES,
    spell, parseChord, isMinor, transpose,
    chordPitchClasses, chordVoicing, midiToFreq, midiToName,
    scaleSemis, scalePcs, gradePcs, degMidi, deriveTab, gradePitch, intervalsFor,
    paletteFor, classifyChordInKey, catFor,
    chord, rest, note, uid, seed,
    totalBeats, nbarsOf, axisBeats, bpb, lineById, chordAtBeat, lineToken, shareToken, defaultShape,
  };
})();
