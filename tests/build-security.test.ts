// @vitest-environment node
import { expect, it } from 'vitest';
import { build } from 'vite';
import { backendOrigin, boundaryPlugin, extensionManifest } from '../build-config';
it('restricts connection permissions to one configured backend', () => {
  expect(extensionManifest('').host_permissions).toEqual([]);
  expect(extensionManifest('https://backend.example').host_permissions).toEqual(['https://backend.example/*']);
  expect(() => backendOrigin('http://127.0.0.1:8787', false)).toThrow();
  expect(backendOrigin('http://127.0.0.1:8787', true)).toBe('http://127.0.0.1:8787');
  for (const url of ['https://api.openai.com','https://user:password@backend.example','https://backend.example/?key=secret']) expect(() => backendOrigin(url, false)).toThrow();
});
it('builds the real extension without exposing injected server credentials', async () => {
  const sentinel = 'sk-proj-' + 'BUILD_SECURITY_SENTINEL_'.repeat(3);
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = sentinel;
  try {
    const result = await build({ configFile: 'vite.config.ts', mode: 'production', logLevel: 'silent', build: { write: false } });
    const outputs = (Array.isArray(result) ? result : [result]).flatMap(r => 'output' in r ? r.output : []);
    expect(outputs.length).toBeGreaterThan(0);
    for (const output of outputs) {
      const content = output.type === 'chunk' ? output.code : String(output.source);
      expect(content).not.toContain(sentinel);
      expect(content).not.toContain('api.openai.com');
      expect(content).not.toContain('__OPENAI_API_KEY__');
      if (output.type === 'chunk') expect(Object.keys(output.modules).some(path => /[/\\]server[/\\]/.test(path))).toBe(false);
    }
  } finally { if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous; }
}, 60000);
it('fails the build when a credential is deliberately included', async () => {
  const sentinel = 'sk-proj-' + 'BUILD_SECURITY_SENTINEL_'.repeat(3);
  await expect(build({ configFile: false, publicDir: false, logLevel: 'silent',
    plugins: [{ name: 'fixture', resolveId: id => id === 'fixture' ? id : undefined, load: id => id === 'fixture' ? 'console.log(' + JSON.stringify(sentinel) + ')' : undefined }, boundaryPlugin('', [sentinel])],
    build: { write: false, rollupOptions: { input: 'fixture' } },
  })).rejects.toThrow('Credential detected');
});
