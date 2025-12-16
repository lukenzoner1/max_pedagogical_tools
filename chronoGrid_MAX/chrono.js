// superpose_exporter_simple.js — Node for Max (ESM)
// Usage :
//   1) [jsui chronojsui.js] → dumpcontent 1
//      → envoie : stockdump dict <json> dans Node
//   2) [node.script superpose_exporter_simple.js]
//      → exportmidi "C:/chemin/vers/pattern.mid"
//
// 1 pitch par layer :
//   layer 0 → 60, layer 1 → 62, layer 2 → 64, etc.
// (base 60 + i*2)

import Max  from 'max-api';
import fs   from 'fs';
import path from 'path';
import { writeMidi } from 'midi-file';

// ----------------- utils -----------------
function clamp(v, lo, hi){
  return Math.min(hi, Math.max(lo, v));
}

const TPB = 480;          // ticks per beat
const BPM = 120;          // tempo fixe (Live s’en fout, tu peux re-caler derrière)
const GATE = 0.9;         // fraction de la longueur de step

// état
const S = {
  dictObj: null          // dump JSON de chronojsui (buildSuperposeObject)
};

// parse pattern si besoin
function parsePatternString(str){
  const out = [];
  const s = String(str || '').trim();
  for (let i=0; i<s.length; i++){
    const c = s[i];
    if (c==='x' || c==='X' || c==='1') out.push(1);
    else if (c==='-' || c==='0')      out.push(0);
  }
  return out.length ? out : [1];
}

// ----------------- coeur : dict → MIDI -----------------
function buildMidiFromDictSimple(outPath){
  if (!S.dictObj || !Array.isArray(S.dictObj.layers) || S.dictObj.layers.length === 0){
    throw new Error("Aucun layer dans le dict : appeler d'abord 'stockdump dict <json>' depuis chronojsui.");
  }

  const layers = S.dictObj.layers;

  // piste tempo
  const usPerBeat = Math.round(60000000 / BPM);
  const tempoTrack = [
    {
      deltaTime: 0,
      meta: true,
      type: 'timeSignature',
      numerator: 4,
      denominator: 4,
      metronome: 24,
      thirtyseconds: 8
    },
    {
      deltaTime: 0,
      meta: true,
      type: 'setTempo',
      microsecondsPerBeat: usPerBeat
    },
    {
      deltaTime: 0,
      meta: true,
      type: 'endOfTrack'
    }
  ];

  const abs = [];
  // nom de piste
  abs.push({ time: 0, ev: { meta: true, type: 'trackName', text: 'superpose layers (simple)' } });

  // longueur totale = 1 mesure 4/4
  const barTicks = TPB * 4;

  layers.forEach((L, i) => {
    const steps = Math.max(1, parseInt(L.steps, 10) || 16);

    // pattern : dans ton chronojsui.js, le dump met 'pattern: [...]'
    let patt = [];
    if (Array.isArray(L.pattern)) {
      patt = L.pattern.slice();
    } else if (Array.isArray(L.patt)) {
      patt = L.patt.slice();
    } else {
      patt = parsePatternString(String(L.pattern || ""));
    }
    if (!patt.length) patt = [1];

    // rotation en pas : dans le dump, c’est 'rotate'
    const rotSteps = parseFloat(
      (L.rotate !== undefined ? L.rotate : L.rot) || 0
    ) || 0;

    // pitch du layer : base 60, +2 par layer
    let pitchLayer = clamp(60 + i * 2, 0, 127);

    // si un jour tu ajoutes ces champs au dump, ça reste compatible
    if (Number.isFinite(L.note)) {
      pitchLayer = clamp(60 + (parseInt(L.note, 10) || 0), 0, 127);
    }
    if (Number.isFinite(L.pitchAbs)) {
      pitchLayer = clamp(parseInt(L.pitchAbs, 10) || pitchLayer, 0, 127);
    }

    const stepTicks = Math.max(1, Math.floor(barTicks / steps));
    const noteDur   = Math.max(1, Math.floor(stepTicks * GATE));

    for (let s = 0; s < steps; s++){
      // appliquer la rotation en "pas" (comme un offset négatif dans la pattern)
      const baseIndex = ((s - rotSteps) % steps + steps) % steps;
      const on = patt[baseIndex % patt.length];

      if (!on) continue;

      const t = s * stepTicks;

      abs.push({
        time: t,
        ev: {
          type: 'noteOn',
          channel: 0,
          noteNumber: pitchLayer,
          velocity: 100
        }
      });

      abs.push({
        time: t + noteDur,
        ev: {
          type: 'noteOff',
          channel: 0,
          noteNumber: pitchLayer,
          velocity: 0
        }
      });
    }
  });

  // tri + conversion en deltaTime
  abs.sort((A, B) =>
    (A.time - B.time) ||
    ((A.ev.type === 'noteOff') - (B.ev.type === 'noteOff')) ||
    ((A.ev.noteNumber || 0) - (B.ev.noteNumber || 0))
  );

  const track = [];
  let last = 0;
  for (const r of abs){
    const dt = Math.max(0, (r.time | 0) - last);
    track.push({ ...r.ev, deltaTime: dt });
    last = r.time | 0;
  }
  track.push({ deltaTime: 0, meta: true, type: 'endOfTrack' });

  const midi = {
    header: { format: 1, numTracks: 2, ticksPerBeat: TPB },
    tracks: [tempoTrack, track]
  };

  const buf = Buffer.from(writeMidi(midi));
  fs.writeFileSync(outPath, buf);
}

// ----------------- Handlers Max -----------------

// stockdump dict <json>
Max.addHandler('stockdump', (...args) => {
  try {
    if (!args || args.length < 2) {
      Max.post("Usage : stockdump dict <json>");
      return;
    }
    const kind = String(args[0]).toLowerCase();
    if (kind !== 'dict') {
      Max.post("Ce script simplifié n'accepte que 'stockdump dict <json>' (pas 'string').");
      return;
    }

    const jsonStr = String(args[1] || "{}");
    S.dictObj = JSON.parse(jsonStr);

    const nLayers = Array.isArray(S.dictObj.layers) ? S.dictObj.layers.length : 0;
    Max.outlet(`stockdump OK (dict) layers=${nLayers}`);
  } catch (err) {
    Max.post("ERROR stockdump:", err?.message || String(err));
  }
});

// exportmidi "<path.mid>"
Max.addHandler('exportmidi', (outPathRaw) => {
  try {
    const outPath = path.resolve(String(outPathRaw || 'superpose.mid'));

    if (!S.dictObj) {
      throw new Error("Aucun dump stocké : appelle 'dumpcontent 1' sur chronojsui → 'stockdump dict <json>'.");
    }

    buildMidiFromDictSimple(outPath);
    Max.outlet(`exportmidi OK → ${outPath}`);
  } catch (err) {
    Max.post("ERROR exportmidi:", err?.message || String(err));
  }
});
