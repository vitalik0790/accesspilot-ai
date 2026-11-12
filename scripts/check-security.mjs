// Dependency-free CI guard. Reports file names only, never matching credentials.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const gitFiles = (...args) => execFileSync('git', ['ls-files', '-z', ...args], { encoding: 'utf8' }).split('\0').filter(Boolean);
const files = [...new Set(gitFiles('--cached', '--others', '--exclude-standard'))];
const templates = new Set(['.env.example', 'server/.env.example']);
const excluded = /(^|\/)(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?|dist|build|node_modules|\.codex|\.agents|\.aws|\.cache|\.wrangler)(?:\/|$)/;
const credential = /sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|https?:\/\/[^\s/:]+:[^\s/@]+@|xox[baprs]-[A-Za-z0-9-]{20,}|sb_secret_[A-Za-z0-9_-]{16,}/;
const known = [];
for (const path of ['.env.local', 'server/.env.local', '.dev.vars']) {
  if (!existsSync(path)) continue;
  for (const match of readFileSync(path, 'utf8').matchAll(/^[A-Z_]*(?:KEY|TOKEN|SECRET|PASSWORD)\s*=\s*(.+)$/gm)) {
    const value = match[1].trim().replace(/^["']|["']$/g, '');
    if (value.length >= 8) known.push(value);
  }
}
function scan(content, path) {
  if (known.some(value => content.includes(value))) throw new Error(`Configured credential detected: ${path}`);
  // This exact dummy URL tests rejection of credential-bearing backend URLs.
  if (path === 'tests/build-security.test.ts') content = content.replaceAll('https://' + 'user:password@backend.example', 'REJECTED_TEST_URL');
  if (credential.test(content)) throw new Error(`Credential pattern detected: ${path}`);
}
for (const path of files) {
  if (!templates.has(path) && excluded.test(path)) throw new Error(`Excluded repository path: ${path}`);
  const content = readFileSync(path, 'utf8');
  scan(content, path);
  if (templates.has(path) && /^OPENAI_API_KEY=\S+/m.test(content)) throw new Error(`Nonempty credential template: ${path}`);
}
// Inspect the actual index too, even if a working copy has since been cleaned.
for (const path of gitFiles('--cached')) {
  scan(execFileSync('git', ['show', `:${path}`], { encoding: 'utf8' }), path);
}
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}
if (process.argv.includes('--artifacts')) {
  for (const entry of ['dist/background.js', 'dist/manifest.json', 'build/server/index.js', 'build/worker/worker.js']) {
    if (!existsSync(entry)) throw new Error(`Required build missing: ${entry}`);
  }
  for (const dir of ['dist', 'build/server', 'build/worker']) {
    for (const path of walk(dir)) scan(readFileSync(path, 'utf8'), path);
  }
  const worker = readFileSync('build/worker/worker.js', 'utf8');
  if (/node:|process\.env|api\.openai\.com|local-developer|AUTH_MODE|OPENAI_API_KEY/.test(worker)) throw new Error('Unexpected production Worker dependency or development switch');
  for (const path of walk('dist')) {
    if (/api\.openai\.com|__OPENAI_API_KEY__/.test(readFileSync(path, 'utf8'))) throw new Error(`Direct provider access in extension: ${path}`);
  }
}
console.log(`Security checks passed for ${files.length} publishable files and indexed content${process.argv.includes('--artifacts') ? ', plus all three build outputs' : ''}.`);
