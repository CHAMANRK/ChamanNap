// Version controller.  Format:  A.BBBBB.C   e.g. 1.28001.0
//   A      big version: changes only when the whole code / whole UI / whole system is replaced.
//   BBBBB  = FF*1000 + SSS : FF (2 digits) goes +1 for every normal update (every new feature); SSS (3 digits, the number after the "00")
//            goes +1 for small updates.
//   C      number after the last dot: goes +1 for refine / bug fix.
// Usage: node scripts/bump.js <kind>
//   feature : FF+1, SSS=0, C=0     (28001 -> 29000)
//   small   : SSS+1,       C=0     (28001 -> 28002)
//   fix     : C+1                  (1.28001.0 -> 1.28001.1)
//   major   : A+1, FF=1, SSS=0, C=0
//   set X.Y.Z : write exactly that version
// Updates package.json and www/js/version.js together. Run it once per edit/build you hand over.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const pj = path.join(root, 'package.json'), vj = path.join(root, 'www/js/version.js');
const pkg = JSON.parse(fs.readFileSync(pj, 'utf8'));
const kind = process.argv[2] || 'fix';
let v;
if (kind === 'set') {
  v = process.argv[3] || '';
  if (!/^\d+\.\d{5}\.\d+$/.test(v)) throw new Error('set ke baad A.BBBBB.C likho, jaise 1.28001.0');
} else {
  const m = String(pkg.version).match(/^(\d+)\.(\d{5})\.(\d+)$/);
  if (!m) throw new Error('package.json version A.BBBBB.C format me nahi hai: ' + pkg.version + ' (pehle: node scripts/bump.js set 1.28001.0)');
  let a = +m[1], ff = Math.floor(+m[2] / 1000), ss = +m[2] % 1000, c = +m[3];
  if (kind === 'major') { a++; ff = 1; ss = 0; c = 0; }
  else if (kind === 'feature') { ff++; ss = 0; c = 0; }
  else if (kind === 'small') { ss++; c = 0; if (ss > 999) throw new Error('small updates 999 se upar nahi ja sakte, feature bump karo'); }
  else if (kind === 'fix') c++;
  else throw new Error('feature, small, fix, major ya set X.Y.Z likho');
  if (ff > 99) throw new Error('FF 99 se upar nahi ja sakta, major bump karo');
  v = a + '.' + String(ff * 1000 + ss).padStart(5, '0') + '.' + c;
}
pkg.version = v;
fs.writeFileSync(pj, JSON.stringify(pkg, null, 2) + '\n');
let t = fs.readFileSync(vj, 'utf8');
if (!/const APP_VER='[^']*';/.test(t)) throw new Error('version.js me APP_VER nahi mila');
fs.writeFileSync(vj, t.replace(/const APP_VER='[^']*';/, "const APP_VER='" + v + "';"));
console.log('version ->', v);
