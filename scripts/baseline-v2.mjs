// Keep pre-upgrade validators tied to the verified V2 commit, even after V3 edits.
// Reads tracked source from local Git only; does not check out or write any file.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
export async function loadV2Api() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const result = await build({
    stdin: { contents: "export * from './src/model.ts'; export * from './src/storage.ts'; export { validateBackup } from './src/data.ts';", resolveDir: root },
    bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent',
    plugins: [{ name: 'verified-v2-source', setup(builder) {
      builder.onLoad({ filter: /\/src\/(model|storage|data)\.ts$/ }, args => ({
        contents: execFileSync('git', ['show', `06f48184deb741cff58cdb1ee38b4d800942bb06:src/${args.path.split('/').pop()}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
        loader: 'ts', resolveDir: `${root}/src`,
      }));
    } }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
