import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]);
}
for (const file of ['src', 'test', 'scripts'].flatMap(walk).filter(f => f.endsWith('.js'))) {
  const r = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(1);
}
const roadmap = readFileSync('docs/ROADMAP.md', 'utf8');
for (let i = 1; i <= 6; i++) if (!roadmap.includes(`Phase ${i}`)) throw new Error('Missing roadmap phase');
console.log('Syntax and roadmap checks passed (not a typecheck or lint claim)');
