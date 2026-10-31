// Version controller. Usage: node scripts/bump.js [patch|minor|major]   (default: patch)
// Updates package.json and www/js/version.js together. Run it once per edit/build you hand over.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const pj = path.join(root, 'package.json'), vj = path.join(root, 'www/js/version.js');
const pkg = JSON.parse(fs.readFileSync(pj, 'utf8'));
const m = String(pkg.version).match(/^(\d+)\.(\d+)\.(\d+)$/);
if (!m) throw new Error('package.json version sahi nahi hai: ' + pkg.version);
let [a, b, c] = [+m[1], +m[2], +m[3]];
const kind = process.argv[2] || 'patch';
if (kind === 'major') { a++; b = 0; c = 0; } else if (kind === 'minor') { b++; c = 0; } else if (kind === 'patch') c++; else throw new Error('patch, minor ya major likho');
const v = a + '.' + b + '.' + c;
pkg.version = v;
fs.writeFileSync(pj, JSON.stringify(pkg, null, 2) + '\n');
let t = fs.readFileSync(vj, 'utf8');
if (!/const APP_VER='[^']*';/.test(t)) throw new Error('version.js me APP_VER nahi mila');
fs.writeFileSync(vj, t.replace(/const APP_VER='[^']*';/, "const APP_VER='" + v + "';"));
console.log('version ->', v);
