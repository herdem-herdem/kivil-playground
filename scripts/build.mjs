import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
const provenance = JSON.parse(readFileSync('runtime/vendor/kivil/SOURCE.json', 'utf8'));
for (const [name, expected] of Object.entries(provenance.sha256)) {
  if (createHash('sha256').update(readFileSync(`runtime/vendor/kivil/src/${name}`)).digest('hex') !== expected) throw new Error(`Pinned interpreter changed: ${name}`);
}
execFileSync('cargo', ['build', '--manifest-path', 'runtime/Cargo.toml', '--target', 'wasm32-unknown-unknown', '--release', '--locked'], { stdio: 'inherit' });
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
cpSync('web', 'dist', { recursive: true });
cpSync('runtime/target/wasm32-unknown-unknown/release/kivil_playground_runtime.wasm', 'dist/runtime.wasm');
console.log('Built static playground in dist/');
