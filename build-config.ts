import type { Plugin } from 'vite';
import manifest from './public/manifest.json';
export function backendOrigin(value: string, development: boolean): string {
  if (!value) return '';
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      (url.protocol !== 'https:' && !(development && url.protocol === 'http:' && url.hostname === '127.0.0.1')) ||
      url.hostname === 'api.openai.com') throw new Error('Backend URL must be an HTTPS origin (loopback HTTP allowed only for local builds).');
  return url.origin;
}
export function extensionManifest(origin: string) {
  return { ...manifest, host_permissions: origin ? [origin + '/*'] : [],
    content_security_policy: { extension_pages: "script-src 'self'; object-src 'none'; connect-src " + (origin || "'none'") } };
}
export function boundaryPlugin(origin: string, forbidden: string[]): Plugin {
  return {
    name: 'backend-boundary',
    generateBundle(_, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type === 'chunk' && Object.keys(output.modules).some(id => /[/\\]server[/\\]/.test(id))) throw new Error('Server module reached extension bundle.');
        const text = output.type === 'chunk' ? output.code : String(output.source);
        if (forbidden.some(secret => secret.length >= 8 && text.includes(secret)) || /sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{16,}/.test(text)) throw new Error('Credential detected in extension output.');
      }
      this.emitFile({ type: 'asset', fileName: 'manifest.json', source: JSON.stringify(extensionManifest(origin), null, 2) });
    },
  };
}
