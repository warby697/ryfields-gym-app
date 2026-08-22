// One-off: normalise existing member names to Title Case (matches functions/src/shared/text.ts).
// Preview:  node scripts/fix-name-casing.mjs
// Apply:    node scripts/fix-name-casing.mjs apply
import { initializeApp, cert } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const key = JSON.parse(readFileSync('C:/Users/pwpt/Documents/Apps/ryfields-gym-app/.secrets/ryfields-gym-firebase-adminsdk-fbsvc-7671db904e.json', 'utf8'));
initializeApp({ credential: cert(key) });
const db = getFirestore();
const apply = process.argv.includes('apply');

const fixWord = w => { if (!w) return w; const uniform = w === w.toUpperCase() || w === w.toLowerCase(); return uniform ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w; };
const titleCaseName = name => name.split(/(\s+)/).map(p => /\s+/.test(p) ? p : p.split('-').map(fixWord).join('-')).join('').trim();

const members = await db.collection('members').get();
let changed = 0, batch = db.batch(), writes = 0;
for (const doc of members.docs) {
  const m = doc.data();
  const fn = titleCaseName(String(m.firstName || '')), ln = titleCaseName(String(m.lastName || ''));
  if (fn === m.firstName && ln === m.lastName) continue;
  changed++;
  console.log(`${m.memberNumber}: "${m.firstName} ${m.lastName}" -> "${fn} ${ln}"`);
  if (apply) {
    const email = String(m.email || '').toLowerCase();
    batch.update(doc.ref, { firstName: fn, lastName: ln, searchTokens: [fn.toLowerCase(), ln.toLowerCase(), email, String(m.memberNumber || '').toLowerCase()], updatedAt: FieldValue.serverTimestamp() });
    if (++writes === 450) { await batch.commit(); batch = db.batch(); writes = 0; }
  }
}
if (apply && writes) await batch.commit();
console.log(`\n${changed} name(s) ${apply ? 'updated' : 'would change'} (of ${members.size}).`);
