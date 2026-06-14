/* tab.js — guitar-tab lane for the unified ruler.
   Mirrors production Tab Enterer: 4-tier theory colouring (toggle), fret-number ↔
   note-name labels (toggle), per-note articulations (hammer/pull/slide/mute),
   passing-note flag, transpose-all. Chord *zones* are gone — the bar ruler aligns
   it. Tab notes ARE the line's notes (one model, two views). */
(function () {
  'use strict';
  const M = window.MODEL;
  const STR_H = 18;
  const ARTIC = { none: '', slideUp: '/', slideDown: '\\', hammer: 'h', pull: 'p', mute: '' };

  function midiToDeg(midi, keyPc, minor) {
    const sc = M.scaleSemis(minor); const degOf = {}; sc.forEach((s, i) => { degOf[s] = i + 1; });
    const s = midi - 60 - keyPc; const o = Math.floor(s / 12); const rel = ((s % 12) + 12) % 12;
    if (degOf[rel] !== undefined) return { d: degOf[rel], o, acc: 0 };
    if (degOf[(rel - 1 + 12) % 12] !== undefined) return { d: degOf[(rel - 1 + 12) % 12], o, acc: 1 };
    if (degOf[(rel + 1) % 12] !== undefined) return { d: degOf[(rel + 1) % 12], o, acc: -1 };
    return { d: 1, o, acc: 0 };
  }
  function noteMidi(state, n) { return M.degMidi(n.d, n.o, n.acc, M.PC[state.key], state.minor); }
  function posOf(state, n) {
    const midi = noteMidi(state, n);
    if (n.string != null) { const f = midi - M.OPEN[n.string]; if (f >= 0 && f <= 24) return { string: n.string, fret: f, midi }; }
    const t = M.deriveTab(midi); return { string: t.string, fret: t.fret, midi };
  }
  function chordAtBar(line, bar) {
    let acc = 0; const beat = bar * 4;
    for (const c of line.chords) { if (beat < acc + c.beats) return c.rest ? null : c; acc += c.beats; }
    for (let i = line.chords.length - 1; i >= 0; i--) if (!line.chords[i].rest) return line.chords[i];
    return null;
  }
  // assign each note a string/fret with continuity so a melody is spread across the neck, not dumped on high E
  function voiceNotes(state, line) {
    const map = {};
    const ns = line.notes.slice().sort((a, b) => (a.bar * 1000 + a.slot) - (b.bar * 1000 + b.slot));
    let prev = null;
    for (const n of ns) {
      const midi = noteMidi(state, n);
      if (n.string != null) { const f = midi - M.OPEN[n.string]; if (f >= 0 && f <= 24) { map[n.id] = { string: n.string, fret: f, midi }; prev = map[n.id]; continue; } }
      const cands = []; for (let s = 0; s < 6; s++) { const f = midi - M.OPEN[s]; if (f >= 0 && f <= 17) cands.push({ string: s, fret: f, midi }); }
      if (!cands.length) { const t = M.deriveTab(midi); map[n.id] = { string: t.string, fret: t.fret, midi }; prev = map[n.id]; continue; }
      let best = null, bestC = 1e9;
      for (const c of cands) {
        const target = prev ? Math.min(12, prev.fret) : 5;
        let cost = Math.abs(c.fret - target) + (c.fret > 12 ? (c.fret - 12) * 2 : 0);
        cost += prev ? Math.abs(c.string - prev.string) * 0.8 : Math.abs(c.string - 3) * 0.4;
        if (cost < bestC) { bestC = cost; best = c; }
      }
      map[n.id] = best; prev = best;
    }
    return map;
  }

  function toolbar(state, line) {
    const L = line.id;
    const b = (act, txt, on, title) => `<span class="mel-tb-btn${on ? ' on' : ''}" data-action="${act}" data-line="${L}" title="${title}">${txt}</span>`;
    const ned = noteEditor(state, line);
    return `<div class="lane-toolbar tab-toolbar">
      <span class="lane-tag">♫ Tab</span>
      ${b('tabLabelToggle', line.tabLabel === 'note' ? 'Notes' : 'Fret', false, 'fret number ↔ note name')}
      ${b('tabColorToggle', '◐ Theory', line.tabColor !== false, '4-tier theory colouring')}
      <span class="mel-tb-btn" data-action="tabTranspose" data-line="${L}" data-dir="-1" title="transpose all down">◂ Down</span>
      <span class="mel-tb-btn" data-action="tabTranspose" data-line="${L}" data-dir="1" title="transpose all up">Up ▸</span>
      ${line.tabAuthored ? '' : `<span class="derive-tag">⤳ auto from melody</span><span class="acceptbtn" data-action="acceptTab" data-line="${L}">✓ Accept</span>`}
      ${ned ? `<span class="tb-div"></span>${ned}` : ''}
    </div>`;
  }

  function render(state, line) {
    const keyPc = M.PC[state.key];
    const res = line.melRes || 8; const bp = M.bpb(line); const spb = bp * res / 4; const nbars = M.nbarsOf(line); const totalSlots = nbars * spb;
    const H = 6 * STR_H;
    const colorOn = line.tabColor !== false && line.tabAuthored !== false; // ghosts stay neutral
    const ghost = line.tabAuthored ? '' : ' ghost';

    const gutter = M.STRING_LBL.map((s, i) => `<div class="tab-rlabel" style="top:${i * STR_H}px;height:${STR_H}px">${s}</div>`).join('');

    // sort notes by time per string to place articulation glyphs
    const pos = voiceNotes(state, line);
    const marks = line.notes.map((n) => {
      const p = pos[n.id] || posOf(state, n);
      const ch = M.chordAtBeat(line, n.bar * bp + n.slot * 4 / res);
      const tier = n.passing ? 'passing' : (ch ? M.gradePitch(p.midi, ch.name, keyPc, state.minor) : 'scale');
      const sel = state.selNote && state.selNote.noteId === n.id && state.selNote.lane === 'tab';
      const x = (n.bar * spb + n.slot + 0.5) / totalSlots * 100;
      const art = ARTIC[n.artic] ? `<sup class="artic">${ARTIC[n.artic]}</sup>` : '';
      const tcls = colorOn ? ` tier-${tier}` : '';
      const inner = sel
        ? `<input class="tab-fret-input" type="text" inputmode="numeric" pattern="[0-9]*" name="uzfret-${n.id}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-1p-ignore data-lpignore="true" data-form-type="other" data-line="${line.id}" data-nid="${n.id}" maxlength="2" value="${n.artic === 'mute' ? 'x' : p.fret}" />`
        : (n.artic === 'mute' ? 'x' : (line.tabLabel === 'note' ? M.spell(((p.midi % 12) + 12) % 12, state.key) : p.fret));
      return `<div class="tab-mark${tcls}${ghost}${sel ? ' sel' : ''}" data-action="selTabNote" data-line="${line.id}" data-nid="${n.id}"
        style="left:${x}%;top:${p.string * STR_H + STR_H / 2}px">${inner}${art}</div>`;
    }).join('');

    return `<div class="tab-lane" data-tab="${line.id}">
      ${toolbar(state, line)}
      <div class="tab-gridwrap">
        <div class="tab-gutter" style="height:${H}px">${gutter}</div>
        <div class="tab-grid" data-line="${line.id}" data-res="${res}" data-spb="${spb}" data-nbars="${nbars}"
          style="height:${H}px;background-image:repeating-linear-gradient(180deg,#d8d0bc 0 1px,transparent 1px ${STR_H}px);background-position:0 ${STR_H / 2}px">
          ${marks}
        </div>
      </div>
    </div>`;
  }

  function noteEditor(state, line) {
    if (!state.selNote || state.selNote.lane !== 'tab' || state.selNote.lineId !== line.id) return '';
    const n = line.notes.find((x) => x.id === state.selNote.noteId);
    if (!n) return '';
    const p = posOf(state, n); const L = line.id;
    const ab = (a, t) => `<span class="st-btn${n.artic === a ? ' on' : ''}" data-action="setArtic" data-line="${L}" data-nid="${n.id}" data-art="${a}">${t}</span>`;
    return `<div class="seltools tabedit">
      <span class="who">Tab note <span style="color:var(--muted);font-weight:600;font-size:11px">str ${M.STRING_LBL[p.string]} · ${M.spell(((p.midi % 12) + 12) % 12, state.key)}</span></span>
      <span class="lbl">Fret:</span>
      <span class="st-btn" data-action="tabFret" data-line="${L}" data-nid="${n.id}" data-dir="-1">−</span>
      <span class="fretval">${n.artic === 'mute' ? '×' : p.fret}</span>
      <span class="st-btn" data-action="tabFret" data-line="${L}" data-nid="${n.id}" data-dir="1">＋</span>
      <span class="st-btn" data-action="tabString" data-line="${L}" data-nid="${n.id}" title="move to another string, same pitch">⇅ String</span>
      <span style="width:6px"></span>
      <span class="lbl">Artic:</span><select class="uz-select" data-change="setArticSel" data-line="${L}" data-nid="${n.id}">${[['none','— none'],['slideUp','Slide ↗'],['slideDown','Slide ↘'],['hammer','Hammer'],['pull','Pull'],['mute','× Mute']].map(([v,t]) => `<option value="${v}"${n.artic === v ? ' selected' : ''}>${t}</option>`).join('')}</select>
      <span class="st-btn${n.passing ? ' on' : ''}" data-action="tabPassing" data-line="${L}" data-nid="${n.id}" title="mark as passing note">p Passing</span>
      <span style="flex:1"></span>
      <span class="st-btn danger" data-action="tabNoteDel" data-line="${L}" data-nid="${n.id}">× Remove</span>
    </div>`;
  }

  function install(A, getState, render, pushUndo, toast) {
    const lof = (d) => M.lineById(getState(), d.line);
    const nof = (d) => { const l = lof(d); return l && l.notes.find((x) => x.id === d.nid); };
    const H = {
      tabLabelToggle(d) { const l = lof(d); l.tabLabel = l.tabLabel === 'note' ? 'fret' : 'note'; },
      tabColorToggle(d) { const l = lof(d); l.tabColor = l.tabColor === false ? true : false; },
      tabTranspose(d) { const l = lof(d); if (!l.tabAuthored) l.tabAuthored = true; pushUndo(); l.notes.forEach((n) => reMidi(getState(), n, +d.dir)); },
      acceptTab(d) { lof(d).tabAuthored = true; },
      selTabNote(d) { const l = lof(d); if (!l.tabAuthored) l.tabAuthored = true; const s = getState(); const n = l.notes.find((x) => x.id === d.nid); if (n && n.string == null) n.string = posOf(s, n).string; s.selNote = { lane: 'tab', lineId: d.line, noteId: d.nid }; s.selection = { lineId: null, ids: [] }; },
      setArtic(d) { const n = nof(d); if (n) { pushUndo(); n.artic = d.art; } },
      tabPassing(d) { const n = nof(d); if (n) { pushUndo(); n.passing = !n.passing; } },
      tabFret(d) { const n = nof(d); if (n) { pushUndo(); reMidi(getState(), n, +d.dir); } },
      tabString(d) { const l = lof(d); const n = nof(d); if (!n) return; const p = posOf(getState(), n); const midi = p.midi;
        for (let k = 1; k <= 5; k++) { const s = (p.string + k) % 6; const f = midi - M.OPEN[s]; if (f >= 0 && f <= 24) { n.string = s; break; } } },
      tabNoteDel(d) { const l = lof(d); pushUndo(); l.notes = l.notes.filter((x) => x.id !== d.nid); getState().selNote = null; },
    };
    Object.keys(H).forEach((k) => { A[k] = (d, e) => { H[k](d, e); render(); const s = getState(); if (s.selNote && s.selNote.lane === 'tab') { const inp = document.querySelector('.tab-fret-input'); if (inp) inp.focus(); } }; });
  }
  // transpose a note by semis, keep degree representation in sync
  function reMidi(state, n, semis) {
    const midi = M.degMidi(n.d, n.o, n.acc, M.PC[state.key], state.minor) + semis;
    const dd = midiToDeg(midi, M.PC[state.key], state.minor);
    n.d = dd.d; n.o = dd.o; n.acc = dd.acc;
  }

  // hover-to-enter: bar broken into res slots × 6 strings; click an empty cell to add
  function installPointer(getState, render, pushUndo) {
    document.addEventListener('pointermove', (e) => {
      const grid = e.target.closest('.tab-grid');
      document.querySelectorAll('.tab-hover').forEach((h) => { if (!grid || h.parentElement !== grid) h.remove(); });
      if (!grid) return;
      const rect = grid.getBoundingClientRect();
      const res = +grid.dataset.res, nbars = +grid.dataset.nbars; const spb = (+grid.dataset.spb) || res; const totalSlots = nbars * spb;
      const xrel = (e.clientX - rect.left) / rect.width;
      const slot = Math.max(0, Math.min(totalSlots - 1, Math.floor(xrel * totalSlots)));
      const string = Math.max(0, Math.min(5, Math.floor((e.clientY - rect.top) / STR_H)));
      let h = grid.querySelector('.tab-hover'); if (!h) { h = document.createElement('div'); h.className = 'tab-hover'; grid.appendChild(h); }
      h.style.left = (slot + 0.5) / totalSlots * 100 + '%';
      h.style.top = string * STR_H + STR_H / 2 + 'px';
      h.style.width = 1 / totalSlots * 100 + '%';
      grid._hover = { slot, string, res, spb };
    });
    document.addEventListener('pointerdown', (e) => {
      const grid = e.target.closest('.tab-grid'); if (!grid) return;
      if (e.target.closest('.tab-mark')) return; // selecting an existing note
      let info = grid._hover;
      if (!info) { const rect = grid.getBoundingClientRect(); const r2 = +grid.dataset.res, nb2 = +grid.dataset.nbars, sp2 = (+grid.dataset.spb) || r2; const tot = nb2 * sp2; const xr = (e.clientX - rect.left) / rect.width; info = { slot: Math.max(0, Math.min(tot - 1, Math.floor(xr * tot))), string: Math.max(0, Math.min(5, Math.floor((e.clientY - rect.top) / STR_H))), res: r2, spb: sp2 }; }
      const st = getState(); const line = M.lineById(st, grid.dataset.line); if (!line) return;
      const sp = info.spb || info.res; const bar = Math.floor(info.slot / sp); const slot = info.slot % sp;
      const existing = line.notes.find((x) => x.bar === bar && x.slot === slot && ((x.string != null ? x.string : posOf(st, x).string) === info.string));
      if (existing) { st.selNote = { lane: 'tab', lineId: line.id, noteId: existing.id }; render(); setTimeout(() => focusFretInput(existing.id), 0); return; }
      pushUndo(); line.tabAuthored = true;
      const dd = midiToDeg(M.OPEN[info.string], M.PC[st.key], st.minor);
      const n = M.note(bar, slot, 1, dd.d, dd.o, dd.acc); n.string = info.string;
      line.notes.push(n); st.selNote = { lane: 'tab', lineId: line.id, noteId: n.id }; render(); setTimeout(() => focusFretInput(n.id), 0);
    });
    function focusFretInput(nid) { const inp = nid ? document.querySelector(`.tab-fret-input[data-nid="${nid}"]`) : document.querySelector('.tab-fret-input'); if (inp) { inp.focus(); inp.select(); } }
    function setFretOf(line, n, fret) { const s = getState(); const str = n.string != null ? n.string : posOf(s, n).string; const midi = M.OPEN[str] + Math.max(0, Math.min(24, fret)); const dd = midiToDeg(midi, M.PC[s.key], s.minor); n.d = dd.d; n.o = dd.o; n.acc = dd.acc; n.string = str; if (n.artic === 'mute') n.artic = 'none'; }
    document.addEventListener('input', (e) => {
      const inp = e.target.closest && e.target.closest('.tab-fret-input'); if (!inp) return;
      const st = getState(); const line = M.lineById(st, inp.dataset.line); if (!line) return;
      const n = line.notes.find((x) => x.id === inp.dataset.nid); if (!n) return;
      const v = String(inp.value).trim().toLowerCase();
      if (v === '') return;                                   // empty = pending; keep the note, don't revert pitch
      if (v === 'x') { n.artic = 'mute'; render(); setTimeout(() => focusFretInput(n.id), 0); return; }
      const num = parseInt(v, 10); if (!isNaN(num)) setFretOf(line, n, num);
    });
    document.addEventListener('keydown', (e) => {
      const inp = e.target.closest && e.target.closest('.tab-fret-input'); if (!inp) return;
      const st = getState(); const line = M.lineById(st, inp.dataset.line); if (!line) return;
      const n = line.notes.find((x) => x.id === inp.dataset.nid); if (!n) return;
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const res = line.melRes || 8; const spb = M.bpb(line) * res / 4; const nbars = M.nbarsOf(line); const totalSlots = nbars * spb;
        const abs = n.bar * spb + n.slot + 1; if (abs >= totalSlots) { st.selNote = null; render(); return; }
        const nb = Math.floor(abs / spb), nsl = abs % spb; const str = n.string;
        let nn = line.notes.find((x) => x.bar === nb && x.slot === nsl && ((x.string != null ? x.string : posOf(st, x).string) === str));
        if (!nn) { pushUndo(); const dd = midiToDeg(M.OPEN[str], M.PC[st.key], st.minor); nn = M.note(nb, nsl, 1, dd.d, dd.o, dd.acc); nn.string = str; line.notes.push(nn); }
        st.selNote = { lane: 'tab', lineId: line.id, noteId: nn.id }; render(); setTimeout(() => focusFretInput(nn.id), 0);
      } else if (e.key === 'Escape') { e.preventDefault(); st.selNote = null; render(); }
      else if (e.key === 'Backspace' && (inp.value === '' || (inp.selectionStart === 0 && inp.selectionEnd === inp.value.length))) { e.preventDefault(); pushUndo(); line.notes = line.notes.filter((x) => x.id !== n.id); st.selNote = null; render(); }
    });
  }

  window.TAB = { render, editor: noteEditor, install, installPointer, midiToDeg, STR_H };
})();
