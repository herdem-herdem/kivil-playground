import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const repository = resolve(process.argv[2] || '../Kıvıl');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim();
const hashes = {};
for (const name of ['diagnostic.rs', 'lexer.rs', 'parser.rs', 'interpreter.rs']) {
  const source = execFileSync('git', ['show', `${commit}:src/${name}`], { cwd: repository });
  writeFileSync(`runtime/vendor/kivil/src/${name}`, source);
  hashes[name] = createHash('sha256').update(source).digest('hex');
}
writeFileSync('runtime/vendor/kivil/SOURCE.json', JSON.stringify({ repository: 'https://github.com/herdem-herdem/kivil', commit, sha256: hashes }, null, 2) + '\n');
console.log(`Pinned interpreter to ${commit}. Run all tests before publishing.`);
