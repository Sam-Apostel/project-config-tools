import { describe, it, expect } from 'vitest';
import { extractJsConfig } from './js-extract.js';

describe('extractJsConfig', () => {
  it('reads top-level literals from `export default { … }`', () => {
    const r = extractJsConfig(
      `export default { reactStrictMode: true, images: { domains: ['a.com'] }, trailingSlash: false }`,
    );
    expect(r.opaque).toBe(false);
    expect(r.values).toEqual({
      reactStrictMode: true,
      images: { domains: ['a.com'] },
      trailingSlash: false,
    });
    expect(r.dynamicKeys).toEqual([]);
  });

  it('unwraps defineConfig(...) calls', () => {
    const r = extractJsConfig(
      `import { defineConfig } from 'vite';\nexport default defineConfig({ base: './', build: { outDir: 'dist' } })`,
    );
    expect(r.values).toEqual({ base: './', build: { outDir: 'dist' } });
  });

  it('flags non-literal (dynamic) keys but still reads the literals', () => {
    const r = extractJsConfig(
      `export default {\n  reactStrictMode: false,\n  webpack(config) { return config },\n  env: process.env.FOO,\n}`,
    );
    expect(r.values).toEqual({ reactStrictMode: false });
    expect(r.dynamicKeys.sort()).toEqual(['env', 'webpack']);
  });

  it('handles module.exports and `satisfies`', () => {
    expect(extractJsConfig(`module.exports = { swcMinify: true }`).values).toEqual({
      swcMinify: true,
    });
    const sat = extractJsConfig(`export default { port: 3000 } satisfies Options`);
    expect(sat.values).toEqual({ port: 3000 });
  });

  it('is opaque when the config is an external identifier or unparseable', () => {
    expect(extractJsConfig(`import cfg from './cfg'; export default cfg`).opaque).toBe(true);
    expect(extractJsConfig(`this is not valid <<<`).opaque).toBe(true);
  });
});
