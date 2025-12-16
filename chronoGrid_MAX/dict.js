autowatch = 1;
inlets = 1;
outlets = 1; // -> vers live.object (Clip)

function clamp(v, lo, hi){ return Math.min(hi, Math.max(lo, v)); }

function stockdump(){
  var a = arrayfromargs(arguments);
  var kind = String(a[0] || "");
  a.shift();
  var payload = a.join(" ");

  if (kind !== "dict") return;

  var src = JSON.parse(payload);

  var clipLen = +src.clip_len_beats || 4.0;

  // Par défaut: on écrit depuis "layers" (pitch/vel/rotate)
  var notes = [];
  var layers = src.layers || [];

  for (var li = 0; li < layers.length; li++){
    var L = layers[li];
    var steps = Math.max(1, (L.steps|0) || ((L.pattern && L.pattern.length) ? L.pattern.length : 1));
    var patt  = (L.pattern && L.pattern.length) ? L.pattern : [1];
    var rot   = +L.rotate || 0;

    var stepBeats = clipLen / steps;

    for (var s = 0; s < steps; s++){
      var baseIndex = ((s - rot) % steps + steps) % steps;
      var on = patt[baseIndex % patt.length] ? 1 : 0;
      if (!on) continue;

      notes.push({
        pitch: clamp((L.pitch!=null)?(L.pitch|0):36, 0, 127),
        start_time: s * stepBeats,
        duration: stepBeats,
        velocity: clamp((L.vel!=null)?(L.vel|0):100, 1, 127),
        mute: 0
      });
    }
  }

  // Écrit dans un Max Dict nommé "notesIn"
  var d = new Dict("notesIn");
  d.parse(JSON.stringify({ notes: notes }));

  // Commande à envoyer au live.object du Clip
  outlet(0, "call", "add_new_notes", "dictionary", "notesIn");
}
