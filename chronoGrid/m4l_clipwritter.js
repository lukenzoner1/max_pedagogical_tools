autowatch = 1;
inlets = 1;
outlets = 2; // 0 -> live.object (clip_slot), 1 -> live.object (clip)

var _pending = null;
var _clipLen = 4.0;
var _gate = 0.90;

// --- accepte "stockdump dict <json>"
function stockdump(type, payload){
  type = String(type||"");
  if (type !== "dict") return;
  _ingestJson(payload);
}

// --- accepte "dict <json>" (si tu routes stockdump dans le patch)
function dict(payload){
  _ingestJson(payload);
}

function _ingestJson(payload){
  var obj;
  try {
    obj = JSON.parse(String(payload||"{}"));
  } catch(e){
    _pending = null;
    return;
  }
  if (!obj || !obj.layers || !obj.layers.length) return;

  _pending = obj;

  if (obj.clip_len_beats != null){
    var b = parseFloat(obj.clip_len_beats);
    if (!isNaN(b) && b > 0) _clipLen = b;
  }

  outlet(0, ["get", "has_clip"]);
}

function has_clip(v){
  if (!_pending) return;
  v = +v||0;

  if (!v){
    outlet(0, ["call", "create_clip", _clipLen]);
    var t = new Task(function(){
      outlet(0, ["get", "clip"]);
    }, this);
    t.schedule(50);
  } else {
    outlet(0, ["get", "clip"]);
  }
}

function clip(id){
  if (!_pending) return;

  id = parseInt(id, 10) || 0;
  if (id <= 0){
    _pending = null;
    return;
  }

  var layers = _pending.layers || [];
  var flat = [];

  for (var li=0; li<layers.length; li++){
    var L = layers[li];
    var steps = Math.max(1, (+L.steps||1));
    var patt = (L.pattern && L.pattern.length) ? L.pattern : [1];
    var rot = +L.rotate||0;
    var rotSteps = Math.round(rot);

    var pitch = (L.pitch!=null) ? (parseInt(L.pitch,10)||0) : (36+li);
    pitch = Math.max(0, Math.min(127, pitch));

    var vel = (L.vel!=null) ? (parseInt(L.vel,10)||100) : 100;
    vel = Math.max(1, Math.min(127, vel));

    for (var s=0; s<steps; s++){
      var idx = ((s - rotSteps) % steps + steps) % steps;
      if (!patt[idx % patt.length]) continue;

      var tBeats = (s/steps) * _clipLen;
      var dBeats = (_clipLen/steps) * _gate;

      flat.push(pitch, tBeats, dBeats, vel, 0);
    }
  }

  var N = Math.floor(flat.length/5);

  // clip live.object: il doit recevoir "id <id>" (pas "set id")
  outlet(1, ["id", id]);
  outlet(1, ["call", "select_all_notes"]);
  outlet(1, ["call", "replace_notes"]);
  outlet(1, ["call", "notes", N].concat(flat));
  outlet(1, ["call", "done"]);
  outlet(1, ["call", "notify"]);

  _pending = null;
}
