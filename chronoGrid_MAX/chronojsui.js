autowatch = 1;
inlets = 1;
outlets = 2; // 0: dict/debug, 1: messages pour node / writer

// --- jsui / mgraphics ---
mgraphics.init();
mgraphics.relative_coords = 0;
mgraphics.autofill = 0;

// --- état global ---
var BG = [0.09,0.09,0.10,1];
var STYLE = "dots";
var MAX_RING_SPACING = 22;
var VIEWMODE = "chrono"; // "chrono" | "grid"

var layers = []; // [{patt[], rot, color[4], radius, label, pitch, vel, _Rcache}]
var playPhase = 0;
var PLAY_DIR  = 1;   // 1 = avant, -1 = arrière (info dump seulement)
var CYCLE_FREQ = 1.0; // Hz, 1 => cycle = 1 s

// longueur du clip cible (beats) pour l’écriture Live (writer)
var CLIP_LEN_BEATS = 4.0;

var selected = -1;

// Connexions entre pas ON adjacents (vue circulaire)
var CONNECT_ON = 1;
var CONNECT_WIDTH = 2.0;
var CONNECT_ALPHA = 0.9;

var fontName = "Arial";
var fontSize = 10;

// --- utils ---
function clamp(v, lo, hi){ return Math.min(hi, Math.max(lo, v)); }

function pattFromString(s){
  var out = [], str = String(s||"").trim();
  for (var i=0;i<str.length;i++){
    var ch = str.charAt(i);
    if (ch==='x'||ch==='X'||ch==='1') out.push(1);
    else if (ch==='-'||ch==='0') out.push(0);
  }
  if (!out.length) out = [1];
  return out;
}

function rgba(c){
  mgraphics.set_source_rgba(c[0], c[1], c[2], (c.length>3?c[3]:1));
}

function mulColor(c,k,a){
  return [(c[0]||0)*k,(c[1]||0)*k,(c[2]||0)*k,(a!=null?a:(c[3]||1))];
}

function viewSize(){
  var r = this.box.rect;
  return [r[2]-r[0], r[3]-r[1]];
}

function ringRadiusForIndex(i,n){
  var wh=viewSize(), w=wh[0], h=wh[1];
  var Rmax=Math.min(w,h)/2-16;
  var spacing=Math.min(MAX_RING_SPACING, Math.max(12,(Rmax-20)/Math.max(1,(n-1))));
  return Rmax - i*spacing;
}

function angForStep(step,steps,rot){
  var base=-Math.PI/2;
  return ((step+(rot||0))/Math.max(1,steps))*Math.PI*2+base;
}

function defaultColor(i){
  var pal=[
    [0.91,0.39,0.23,1],
    [0.26,0.67,0.98,1],
    [0.36,0.84,0.52,1],
    [0.86,0.45,0.86,1],
    [1.00,0.80,0.20,1],
    [0.97,0.29,0.47,1]
  ];
  return pal[i%pal.length];
}

function gcd(a,b){
  while (b){
    var t=a%b;
    a=b; b=t;
  }
  return Math.abs(a);
}

function lcm(a,b){
  return Math.abs(a*b)/gcd(a,b);
}

// steps = longueur de pattern
function layerSteps(L){
  return Math.max(1, (L.patt && L.patt.length) ? L.patt.length : 1);
}

function layersLCMSteps(){
  if (!layers.length) return 1;
  var v = layerSteps(layers[0]);
  for (var i=1;i<layers.length;i++){
    v = lcm(v, layerSteps(layers[i]));
  }
  return Math.max(1,v|0);
}

function compositeList(){
  var S=layersLCMSteps();
  var out=new Array(S); for (var i=0;i<S;i++) out[i]=0;
  for (var li=0; li<layers.length; li++){
    var L=layers[li],
        steps=layerSteps(L),
        rot=+L.rot||0,
        patt=(L.patt&&L.patt.length)?L.patt:[1];
    for (var i=0;i<S;i++){
      var pos=((i/S)*steps)-rot;
      var base=Math.floor(((pos%steps)+steps)%steps);
      var on = patt[base % patt.length] ? 1 : 0;
      out[i] = out[i] || on;
    }
  }
  return out;
}

function listToPatternString(lst){
  var s="";
  for (var i=0;i<lst.length;i++) s+= (lst[i] ? "1" : "0");
  return s;
}

// --- dessin anneau (vue chrono) ---
function drawRing(cx,cy,R,steps,color,patt,rot){
  rgba([color[0]*0.4,color[1]*0.4,color[2]*0.4,0.5]);
  mgraphics.set_line_width(0.5);
  mgraphics.arc(cx,cy,R,0,Math.PI*2);
  mgraphics.stroke();

  var onCol=[color[0],color[1],color[2],1],
      offCol=[color[0]*0.6,color[1]*0.6,color[2]*0.6,0.5];
  var dotr=clamp(R*0.04,2.0,5.5);

  var pos=new Array(steps);
  for (var s=0;s<steps;s++){
    var a=angForStep(s,steps,rot), ca=Math.cos(a), sa=Math.sin(a);
    var isOn = patt && patt.length ? patt[s % patt.length] : 1;
    pos[s]={x:cx+R*ca, y:cy+R*sa, on:isOn, angle:a};
  }

  for (var s=0;s<steps;s++){
    var isOn=pos[s].on, col=isOn?onCol:offCol;
    if (STYLE==="ticks"){
      var r0=R-8, r1=R+6, ca=Math.cos(pos[s].angle), sa=Math.sin(pos[s].angle);
      rgba(col);
      mgraphics.set_line_width(isOn?2.0:1.0);
      mgraphics.move_to(cx+r0*ca,cy+r0*sa);
      mgraphics.line_to(cx+r1*ca,cy+r1*sa);
      mgraphics.stroke();
    } else if (STYLE==="bars"){
      var rIn=R-6, rOut=R+6, ca2=Math.cos(pos[s].angle), sa2=Math.sin(pos[s].angle);
      rgba(col);
      mgraphics.set_line_width(2.0);
      mgraphics.move_to(cx+rIn*ca2,cy+rIn*sa2);
      mgraphics.line_to(cx+rOut*ca2,cy+rOut*sa2);
      mgraphics.stroke();
    } else {
      rgba(col);
      mgraphics.arc(pos[s].x,pos[s].y,dotr*(isOn?1.0:0.8),0,Math.PI*2);
      if (isOn) mgraphics.fill(); else mgraphics.stroke();
    }
  }

  if (CONNECT_ON){
    var segCol=mulColor(onCol,0.9,CONNECT_ALPHA);
    rgba(segCol);
    mgraphics.set_line_width(CONNECT_WIDTH);
    for (var k=0;k<steps;k++){
      var n=(k+1)%steps;
      if (pos[k].on && pos[n].on){
        mgraphics.move_to(pos[k].x,pos[k].y);
        mgraphics.line_to(pos[n].x,pos[n].y);
        mgraphics.stroke();
      }
    }
  }
}

function drawLabel(cx,cy,R,text,color){
  if (!text) return;
  mgraphics.select_font_face(fontName);
  mgraphics.set_font_size(fontSize);
  rgba([color[0],color[1],color[2],0.9]);
  var tm=mgraphics.text_measure(text), tw=tm?tm[0]:0;
  mgraphics.move_to(cx-tw/2, cy-(R+14));
  mgraphics.show_text(text);
}

function drawPlayhead(cx,cy,Rmin,Rmax,ph){
  var a=-Math.PI/2 + (ph%1)*Math.PI*2,
      ca=Math.cos(a),
      sa=Math.sin(a);
  rgba([1,1,1,0.85]);
  mgraphics.set_line_width(2.0);
  mgraphics.move_to(cx+Rmin*ca,cy+Rmin*sa);
  mgraphics.line_to(cx+Rmax*ca,cy+Rmax*sa);
  mgraphics.stroke();
}

// --- dessin vue "grid" ---
function paintGrid(){
  var sz = viewSize(),
      W  = sz[0],
      H  = sz[1];

  rgba(BG);
  mgraphics.rectangle(0,0,W,H);
  mgraphics.fill();

  if (!layers.length){
    mgraphics.select_font_face(fontName);
    mgraphics.set_font_size(12);
    rgba([1,1,1,0.6]);
    var msg="chronojsui grid — addlayer 1010 0 Kick";
    var tm=mgraphics.text_measure(msg), tw=tm?tm[0]:0;
    mgraphics.move_to((W-tw)/2, H/2+5);
    mgraphics.show_text(msg);
    return;
  }

  var marginX = 20;
  var marginY = 20;
  var nLayers = layers.length;

  var colW = (W - 2*marginX) / Math.max(1,nLayers);
  var colH = (H - 2*marginY);

  mgraphics.select_font_face(fontName);
  mgraphics.set_font_size(fontSize);

  for (var li=0; li<nLayers; li++){
    var L      = layers[li];
    var steps  = layerSteps(L);
    var patt   = (L.patt && L.patt.length) ? L.patt : [1];
    var rot    = +L.rot||0;

    var x0 = marginX + li*colW;
    var x1 = x0 + colW;
    var colColor = L.color || defaultColor(li);

    var cellH = colH / steps;

    rgba([colColor[0]*0.3,colColor[1]*0.3,colColor[2]*0.3,0.7]);
    mgraphics.set_line_width(1.0);
    mgraphics.rectangle(x0, marginY, colW, colH);
    mgraphics.stroke();

    for (var s=0; s<steps; s++){
      var baseIndex = ((s - rot) % steps + steps) % steps;
      var on = patt[baseIndex % patt.length] ? 1 : 0;

      var y0 = marginY + s*cellH;
      var cx = (x0+x1)*0.5;
      var cy = y0 + cellH*0.5;

      rgba([0.2,0.2,0.22,0.4]);
      mgraphics.rectangle(x0, y0, colW, cellH);
      mgraphics.fill();

      var r = Math.min(colW,cellH)*0.35;
      if (on){
        rgba([colColor[0],colColor[1],colColor[2],1.0]);
        mgraphics.rectangle(cx - r, cy - r, 2*r, 2*r);
        mgraphics.fill();
      } else {
        var rOff = r*0.7;
        rgba([colColor[0]*0.6,colColor[1]*0.6,colColor[2]*0.6,0.6]);
        mgraphics.rectangle(cx - rOff, cy - rOff, 2*rOff, 2*rOff);
        mgraphics.stroke();
      }
    }

    if (L.label){
      rgba([1,1,1,0.8]);
      var tm2=mgraphics.text_measure(L.label), tw2=tm2?tm2[0]:0;
      mgraphics.move_to(x0 + (colW-tw2)/2, marginY + colH + fontSize + 3);
      mgraphics.show_text(L.label);
    }

    if (li === selected){
      rgba([1,1,1,0.35]);
      mgraphics.set_line_width(2.0);
      mgraphics.rectangle(x0-2, marginY-2, colW+4, colH+4);
      mgraphics.stroke();
    }
  }

  var ph = playPhase % 1;
  if (ph < 0) ph += 1;

  var yPlay = marginY + colH * ph;

  rgba([1,1,1,0.85]);
  mgraphics.set_line_width(2.0);
  mgraphics.move_to(marginX,       yPlay);
  mgraphics.line_to(W - marginX,   yPlay);
  mgraphics.stroke();
}

// --- rendu principal ---
function paint(){
  if (VIEWMODE === "grid"){
    paintGrid();
    return;
  }

  var sz=viewSize(), W=sz[0], H=sz[1], cx=W/2, cy=H/2;
  rgba(BG);
  mgraphics.rectangle(0,0,W,H);
  mgraphics.fill();

  if (!layers.length){
    mgraphics.select_font_face(fontName);
    mgraphics.set_font_size(12);
    rgba([1,1,1,0.6]);
    var msg="chronojsui — addlayer 1010 0 Kick";
    var tm=mgraphics.text_measure(msg), tw=tm?tm[0]:0;
    mgraphics.move_to(cx-tw/2, cy+5);
    mgraphics.show_text(msg);
    return;
  }

  var Rmin=1e9, Rmax=0;
  for (var i=0;i<layers.length;i++){
    var L=layers[i],
        steps=layerSteps(L),
        R=(typeof L.radius==="number")?L.radius:ringRadiusForIndex(i,layers.length);
    L._Rcache=R;
    Rmin=Math.min(Rmin,R);
    Rmax=Math.max(Rmax,R);
    drawRing(cx,cy,R,steps,L.color||defaultColor(i),L.patt,L.rot);
    if (L.label) drawLabel(cx,cy,R,L.label,L.color||defaultColor(i));
  }

  if (selected>=0 && layers[selected]){
    var Rsel=(typeof layers[selected].radius==="number")
              ? layers[selected].radius
              : ringRadiusForIndex(selected,layers.length);
    mgraphics.set_line_width(1.5);
    rgba([1,1,1,0.20]);
    mgraphics.arc(cx,cy,Rsel,0,Math.PI*2);
    mgraphics.stroke();
  }

  drawPlayhead(cx,cy,Math.max(0,Rmin-16),Rmax+10,playPhase);
}

// --- switch de vue ---
function chrono(){ VIEWMODE = "chrono"; refresh(); }
function grid(){ VIEWMODE = "grid"; refresh(); }

// --- messages globaux / couches / sélection ---
function clear(){
  layers=[];
  selected=-1;
  refresh();
}

function setbg(r,g,b,a){
  BG=[+r||0,+g||0,+b||0,(a!=null?+a:1)];
  refresh();
}

function setstyle(s){
  s=String(s||"").toLowerCase();
  if(s==="ticks"||s==="dots"||s==="bars") STYLE=s;
  refresh();
}

function setmaxringspacing(px){
  MAX_RING_SPACING=Math.max(8,+px||22);
  refresh();
}

// setcliplen <beats>
function setcliplen(beats){
  var b = parseFloat(beats);
  if (!isNaN(b) && b > 0) CLIP_LEN_BEATS = b;
}

// setplayhead <phase> [cycle_freq_hz]
function setplayhead(ph){
  var p = parseFloat(ph);
  if (isNaN(p)) p = 0;

  PLAY_DIR = (p >= 0) ? 1 : -1;

  var t = Math.abs(p);
  var frac = t - Math.floor(t); // [0,1)

  if (PLAY_DIR > 0){
    playPhase = frac;
  } else {
    playPhase = 1 - frac;
  }

  if (arguments.length >= 2){
    var f = parseFloat(arguments[1]);
    if (!isNaN(f) && f > 0){
      CYCLE_FREQ = f;
    }
  }

  refresh();
}

// addlayer <pattern> [rot] [label...]
function addlayer(pattern){
  var rot=0,label="";
  if (arguments.length>=2) rot=parseFloat(arguments[1])||0;
  if (arguments.length>=3){
    var parts=[];
    for (var i=2;i<arguments.length;i++) parts.push(String(arguments[i]));
    label=parts.join(" ");
  }
  var idx = layers.length;
  layers.push({
    patt: pattFromString(pattern),
    rot: rot,
    color: defaultColor(idx),
    radius: null,
    label: label,
    pitch: 36 + idx,
    vel: 100,
    _Rcache: null
  });
  refresh();
}

// setlayer <idx> pattern/rotate/color/radius/pitch/vel ...
function setlayer(idx,prop){
  idx=Math.max(0,parseInt(idx,10)||0);
  if(!layers[idx]) return;
  var L=layers[idx];
  var p=String(prop||"").toLowerCase();

  if (p==="pattern" && arguments.length>=3){
    var parts=[];
    for (var i=2;i<arguments.length;i++) parts.push(String(arguments[i]));
    L.patt=pattFromString(parts.join(" "));
  }
  else if (p==="rotate" && arguments.length>=3){
    L.rot=parseFloat(arguments[2])||0;
  }
  else if (p==="color" && arguments.length>=5){
    L.color=[
      +arguments[2]||0,
      +arguments[3]||0,
      +arguments[4]||0,
      (arguments[5]!=null?+arguments[5]:1)
    ];
  }
  else if (p==="radius" && arguments.length>=3){
    L.radius=Math.max(10,+arguments[2]||L.radius);
  }
  else if (p==="pitch" && arguments.length>=3){
    L.pitch = clamp(parseInt(arguments[2],10)||0, 0, 127);
  }
  else if (p==="vel" && arguments.length>=3){
    L.vel = clamp(parseInt(arguments[2],10)||100, 1, 127);
  }
  refresh();
}

function setlabel(idx){
  idx=Math.max(0,parseInt(idx,10)||0);
  if(!layers[idx]) return;
  var parts=[];
  for(var i=1;i<arguments.length;i++) parts.push(String(arguments[i]));
  layers[idx].label=parts.join(" ");
  refresh();
}

function select(idx){
  idx=Math.max(0,parseInt(idx,10)||0);
  if(!layers[idx]) return;
  selected=idx;
  refresh();
}

function setrotate(v){
  if(selected<0||!layers[selected]) return;
  setlayer(selected,"rotate",v);
}

function setpattern(){
  if(selected<0||!layers[selected]) return;
  var parts=[];
  for(var i=0;i<arguments.length;i++) parts.push(String(arguments[i]));
  setlayer(selected,"pattern",parts.join(" "));
}

function setcolor(r,g,b,a){
  if(selected<0||!layers[selected]) return;
  setlayer(selected,"color",r,g,b,a);
}

function setradius(px){
  if(selected<0||!layers[selected]) return;
  setlayer(selected,"radius",px);
}

function setlabelsel(){
  if(selected<0||!layers[selected]) return;
  var parts=[];
  for(var i=0;i<arguments.length;i++) parts.push(String(arguments[i]));
  setlabel(selected,parts.join(" "));
}

function setpitch(p){
  if(selected<0||!layers[selected]) return;
  setlayer(selected,"pitch",p);
}

function setvel(v){
  if(selected<0||!layers[selected]) return;
  setlayer(selected,"vel",v);
}

function onclick(x,y){
  if(!layers.length) return;
  var wh=viewSize(),
      cx=wh[0]/2,
      cy=wh[1]/2,
      dx=x-cx,
      dy=y-cy,
      r=Math.sqrt(dx*dx+dy*dy);
  var best=-1,bestd=1e9;
  for (var i=0;i<layers.length;i++){
    var R=(typeof layers[i].radius==="number")
          ? layers[i].radius
          : ringRadiusForIndex(i,layers.length);
    var d=Math.abs(r-R);
    if(d<bestd){
      bestd=d; best=i;
    }
  }
  if (best>=0 && bestd<=18){
    selected=best;
    refresh();
  }
}

function setconnect(v){
  CONNECT_ON=(parseInt(v,10)||0)?1:0;
  refresh();
}

function setconnectwidth(w){
  CONNECT_WIDTH=Math.max(0.5,parseFloat(w)||2.0);
  refresh();
}

function setconnectalpha(a){
  CONNECT_ALPHA=Math.max(0,Math.min(1,parseFloat(a)||0.9));
  refresh();
}

function refresh(){
  mgraphics.redraw();
}

// ---------- REVERSE ----------
function _reverseLayer(i){
  if (i < 0 || i >= layers.length || !layers[i]) return;
  var L = layers[i];
  if (!L.patt || !L.patt.length) L.patt = [1];
  L.patt = L.patt.slice(0).reverse();
}

// reverse            -> selected layer, sinon tous
// reverse <idx>      -> layer idx
function reverse(){
  if (!layers.length) return;

  if (arguments.length >= 1){
    var i = parseInt(arguments[0],10);
    if (!isNaN(i)) _reverseLayer(i);
  } else if (selected >= 0 && selected < layers.length){
    _reverseLayer(selected);
  } else {
    for (var k = 0; k < layers.length; k++) _reverseLayer(k);
  }
  refresh();
}

// helpers optionnels
function reverseall(){
  if (!layers.length) return;
  for (var k = 0; k < layers.length; k++) _reverseLayer(k);
  refresh();
}
function reverselayer(i){
  _reverseLayer(parseInt(i,10)||0);
  refresh();
}


// ---------- GETTERS / QUERIES (outlet 0) ----------
function _hasLayer(i){
  return (i != null && i >= 0 && i < layers.length && !!layers[i]);
}
function _selIndex(){
  return (selected >= 0 && selected < layers.length) ? selected : -1;
}
function _getIdxOrSel(idx){
  if (idx === undefined || idx === null) return _selIndex();
  var i = parseInt(idx,10);
  return (isNaN(i) ? _selIndex() : i);
}

// get <prop> [idx]
// -> outlet 0 : "get <prop> <value...>"
function get(prop, idx){
  var p = String(prop||"").toLowerCase();
  var i = _getIdxOrSel(idx);

  // props globaux même si pas de layer sélectionné
  if (p === "selected"){ outlet(0, "get", "selected", _selIndex()); return; }
  if (p === "layercount"){ outlet(0, "get", "layercount", layers.length); return; }
  if (p === "viewmode"){ outlet(0, "get", "viewmode", VIEWMODE); return; }
  if (p === "cliplen_beats" || p === "cliplen"){ outlet(0, "get", "cliplen_beats", CLIP_LEN_BEATS); return; }
  if (p === "cycle_hz" || p === "cyclefreq"){ outlet(0, "get", "cycle_hz", CYCLE_FREQ); return; }
  if (p === "play_phase"){ outlet(0, "get", "play_phase", playPhase); return; }
  if (p === "play_dir"){ outlet(0, "get", "play_dir", PLAY_DIR); return; }

  if (!_hasLayer(i)){ outlet(0, "get", p, "null"); return; }

  var L = layers[i];

  switch(p){
    case "steps":
    case "stepsamount":
      outlet(0, "get", "steps", layerSteps(L));
      break;

    case "pattern":
      outlet(0, "get", "pattern", listToPatternString(L.patt || [1]));
      break;

    case "patternlist":
      outlet(0, "get", "patternlist", (L.patt || [1]).slice(0));
      break;

    case "rotate":
      outlet(0, "get", "rotate", (+L.rot||0));
      break;

    case "color":
      outlet(0, "get", "color", (L.color || defaultColor(i)).slice(0));
      break;

    case "radius":
      outlet(0, "get", "radius", (typeof L.radius==="number") ? L.radius : "null");
      break;

    case "label":
      outlet(0, "get", "label", L.label || "");
      break;

    case "pitch":
      outlet(0, "get", "pitch", (L.pitch!=null) ? (L.pitch|0) : (36+i));
      break;

    case "vel":
      outlet(0, "get", "vel", (L.vel!=null) ? (L.vel|0) : 100);
      break;

    // composite
    case "compositesteps": {
      var S = compositeList().length;
      outlet(0, "get", "compositesteps", S);
      break;
    }
    case "compositepattern": {
      var pat = listToPatternString(compositeList());
      outlet(0, "get", "compositepattern", pat);
      break;
    }
    case "compositelist": {
      var lst = compositeList();
      outlet(0, "get", "compositelist", lst);
      break;
    }

    default:
      outlet(0, "get", p, "null");
      break;
  }
}

// wrappers “à la Max” (messages simples)
function getstepsamount(){ get("steps"); }
function getpattern(){ get("pattern"); }
function getpatternlist(){ get("patternlist"); }
function getrotate(){ get("rotate"); }
function getcolor(){ get("color"); }
function getradius(){ get("radius"); }
function getlabel(){ get("label"); }
function getpitch(){ get("pitch"); }
function getvel(){ get("vel"); }
function getselected(){ get("selected"); }
function getlayercount(){ get("layercount"); }
function getviewmode(){ get("viewmode"); }
function getcliplen(){ get("cliplen_beats"); }
function getcyclefreq(){ get("cycle_hz"); }
function getplayphase(){ get("play_phase"); }
function getplaydir(){ get("play_dir"); }

function getcompositesteps(){ get("compositesteps"); }
function getcompositepattern(){ get("compositepattern"); }
function getcompositelist(){ get("compositelist"); }

// version indexée explicite (si tu veux requêter un layer sans le sélectionner)
function getlayerstepsamount(idx){ get("steps", idx); }
function getlayerpattern(idx){ get("pattern", idx); }
function getlayerrotate(idx){ get("rotate", idx); }
function getlayerpitch(idx){ get("pitch", idx); }
function getlayervel(idx){ get("vel", idx); }
function getlayerlabel(idx){ get("label", idx); }


// ---------- DUMP ----------
function buildSuperposeObject(){
  var Lout=[];
  for (var i=0;i<layers.length;i++){
    var li=layers[i];
    var steps = layerSteps(li);
    Lout.push({
      steps: steps,
      pattern: (li.patt||[1]).slice(0),
      rotate: +li.rot||0,
      pitch: (li.pitch!=null)?(li.pitch|0):(36+i),
      vel: (li.vel!=null)?(li.vel|0):100,
      color: (li.color||[1,1,1,1]).slice(0),
      radius: (typeof li.radius==="number")?li.radius:null,
      label: li.label||""
    });
  }
  var compList = compositeList();
  var S = compList.length;

  var cycleHz  = (CYCLE_FREQ > 0) ? CYCLE_FREQ : 1.0;
  var cycleSec = 1.0 / cycleHz;
  var stepDurSec = cycleSec / Math.max(1, S);

  return {
    clip_len_beats: CLIP_LEN_BEATS,
    layers: Lout,
    composite: {
      steps: S,
      list: compList.slice(0),
      pattern: listToPatternString(compList),
      cycle_hz: cycleHz,
      cycle_sec: cycleSec,
      step_dur_sec: stepDurSec,
      play_dir: PLAY_DIR,
      play_phase: playPhase
    }
  };
}

/** dumpcontent <mode> [cycle_freq_hz]
 *  mode = 0|1 → dict JSON ; mode = 2 → STRING (0/1)
 *  → outlet 1 : "stockdump dict <json>"  OU  "stockdump string <pattern>"
 */
function dumpcontent(mode){
  var m = parseInt(mode,10) || 0;
  if (!layers.length) return;

  if (arguments.length >= 2){
    var f = parseFloat(arguments[1]);
    if (!isNaN(f) && f > 0){
      CYCLE_FREQ = f;
    }
  }

  if (m === 2){
    var pat = listToPatternString(compositeList());
    outlet(1, "stockdump", "string", pat);
  } else {
    var obj = buildSuperposeObject();
    var json = JSON.stringify(obj);
    outlet(1, "stockdump", "dict", json);
  }
}
