import { buildDocs } from './docs.mjs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
const provenance = JSON.parse(readFileSync('runtime/vendor/kivil/SOURCE.json', 'utf8'));
for (const [name, expected] of Object.entries(provenance.sha256)) {
  if (createHash('sha256').update(readFileSync(`runtime/vendor/kivil/src/${name}`)).digest('hex') !== expected) throw new Error(`Pinned interpreter changed: ${name}`);
}
execFileSync('cargo', ['build', '--manifest-path', 'runtime/Cargo.toml', '--target', 'wasm32-unknown-unknown', '--release', '--locked'], { stdio: 'inherit' });
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
cpSync('web', 'dist', { recursive: true });
cpSync('runtime/target/wasm32-unknown-unknown/release/kivil_playground_runtime.wasm', 'dist/runtime.wasm');
buildDocs();
// Version every browser asset so a returning session cannot mix old JS with the new UI.
const files = readdirSync('dist', { recursive: true }).filter((name) => /\.(?:html|css|js|svg|wasm|json)$/.test(name)).sort();
const hash = createHash('sha256');
for (const name of files) hash.update(name + '\0').update(readFileSync(`dist/${name}`));
const version = hash.digest('hex').slice(0, 12);
for (const name of files.filter((name) => /\.(?:html|js)$/.test(name))) {
  const source = readFileSync(`dist/${name}`, 'utf8');
  writeFileSync(`dist/${name}`, source.replace(/(['"])(\.\.?\/[^'"?]+\.(?:js|wasm|css|svg|json))\1/g, (_, quote, path) => `${quote}${path}?v=${version}${quote}`));
}
console.log(`Built Kıvıl Web IDE in dist/ (${version})`);
