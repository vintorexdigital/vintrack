// Fails on any high or critical advisory in production dependencies except the ones listed here.
// Each exception is a build-time tool advisory (Expo's Metro bundler) that has no patched release yet,
// so `npm audit` cannot be made to pass by upgrading. None of this code ships in the app bundle.
// Remove an entry as soon as a fixed version exists.
import { execSync } from 'node:child_process';

const ACCEPTED = {
  'GHSA-vfj7-8cjw-p6xm': 'braces (via Metro): no release newer than 3.0.3',
  'GHSA-86w9-cpqp-85rv': 'node-forge (via @expo/code-signing-certificates): no release newer than 1.4.0',
};

let raw;
try {
  raw = execSync('npm audit --omit=dev --json', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
} catch (e) {
  raw = e.stdout; // npm audit exits non-zero when it finds anything
}
const report = JSON.parse(raw);
const found = new Map();
for (const [name, v] of Object.entries(report.vulnerabilities ?? {})) {
  for (const via of v.via) {
    if (typeof via === 'object' && ['high', 'critical'].includes(via.severity)) {
      const id = via.url?.split('/').pop() ?? via.title;
      found.set(id, `${name}: ${via.title}`);
    }
  }
}
const unexpected = [...found].filter(([id]) => !(id in ACCEPTED));
for (const [id, why] of found) console.log(`${id in ACCEPTED ? 'accepted' : 'BLOCKING'}  ${id}  ${why}`);
if (unexpected.length) {
  console.error(`\n${unexpected.length} high-severity advisory(ies) not on the accepted list.`);
  process.exit(1);
}
console.log('\nNo unaccepted high-severity advisories.');
