autowatch = 1;
inlets = 1;
outlets = 1;

// séparateur entre symboles de sortie ("" par défaut → "x-xx-")
// ex: " " pour "x - x x -"
var sep = "";

// helper
function _map01ToXDash(token){
    if (token === 1 || token === "1") return "x";
    if (token === 0 || token === "0") return "-";
    // tout le reste passe tel quel (au cas où)
    return String(token);
}

// LISTE de 0/1 -> "x-xx-"
function list(){
    var out = [];
    for (var i=0; i<arguments.length; i++){
        out.push(_map01ToXDash(arguments[i]));
    }
    outlet(0, out.join(sep));
}

// SYMBOLE/TEXTE -> "x-xx-" (ex: "101001" ou "1 0 1 0")
function symbol(s){
    s = String(s);
    // remplace caractère par caractère, en conservant les autres
    var out = "";
    for (var i=0; i<s.length; i++){
        var ch = s.charAt(i);
        if (ch === "1") out += "x";
        else if (ch === "0") out += "-";
        else out += ch;
    }
    outlet(0, out);
}

// alias pour recevoir n’importe quel message (ex: "text 1010")
function anything(){
    // reconstruire tout le message (sélecteur + args) en une chaîne
    var a = [messagename];
    for (var i=0; i<arguments.length; i++) a.push(String(arguments[i]));
    symbol(a.join(" "));
}

// option : définir le séparateur ("" par défaut)
function setsep(s){
    sep = String(s);
}
