import * as esbuild from 'esbuild';
import { readFileSync, mkdirSync, copyFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));
const nodes = ['connect', 'station', 'get', 'in', 'out'];
const isWatch = process.argv.includes('--watch');

/** Find all .ts files in src/, excluding editor.ts files */
function getRuntimeEntryPoints() {
  const all = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.ts') && !full.replace(/\\/g, '/').includes('/html/editor.ts')) {
        all.push(full);
      }
    }
  }
  walk('src');
  return all;
}

/** Plugin to rewrite @/* imports to relative paths in source before compilation */
const aliasPlugin = {
  name: 'alias-resolver',
  setup(build) {
    build.onLoad({ filter: /\.ts$/ }, async (args) => {
      const source = readFileSync(args.path, 'utf8');
      if (!source.includes('@/')) return undefined;
      const fileDir = dirname(args.path);
      const srcDir = resolve('src');
      const rewritten = source.replace(
        /(from\s+['"])@\/([^'"]+)(['"])/g,
        (_match, prefix, importPath, suffix) => {
          const abs = resolve(srcDir, importPath);
          let rel = relative(fileDir, abs).replace(/\\/g, '/');
          if (!rel.startsWith('.')) rel = './' + rel;
          return prefix + rel + suffix;
        }
      );
      return { contents: rewritten, loader: 'ts' };
    });
  },
};

// --- Runtime build ---
async function buildRuntime() {
  const entryPoints = getRuntimeEntryPoints();
  const ctx = await esbuild.context({
    entryPoints,
    outdir: 'build',
    platform: 'node',
    format: 'cjs',
    target: 'es2021',
    sourcemap: true,
    plugins: [aliasPlugin],
  });
  if (isWatch) {
    await ctx.watch();
    console.log('[runtime] watching...');
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    console.log('[runtime] done');
  }
}

// --- Editor build (per node) ---
async function buildEditor(name) {
  const editorDir = `src/nodes/${name}/html`;
  const result = await esbuild.build({
    entryPoints: [`${editorDir}/editor.ts`],
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2015',
    minify: false,
  });

  const js = result.outputFiles[0].text;

  // Collect all .html files from the editor directory
  const htmlFiles = readdirSync(editorDir).filter(f => f.endsWith('.html'));
  const htmlContents = htmlFiles.map(f => readFileSync(join(editorDir, f), 'utf8'));

  const output = `<script type="text/javascript">\n${js}</script>\n${htmlContents.join('\n')}`;

  const outDir = `build/nodes/${name}`;
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${name}.html`), output);
  console.log(`[editor] ${name}.html`);
}

// --- Copy static files ---
function cpR(src, dest) {
  if (!existsSync(src)) return;
  const st = statSync(src);
  if (st.isDirectory()) {
    mkdirSync(dest, { recursive: true });
    for (const f of readdirSync(src)) {
      cpR(join(src, f), join(dest, f));
    }
  } else {
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
  }
}

function copyStatic() {
  cpR('nodes/icons', 'build/nodes/icons');
  for (const name of nodes) {
    const localesDir = `src/nodes/${name}/locales`;
    if (existsSync(localesDir)) {
      cpR(localesDir, `build/nodes/${name}/locales`);
    }
  }
  console.log('[static] copied');
}

// --- Main ---
async function main() {
  await buildRuntime();
  await Promise.all(nodes.map(n => buildEditor(n)));
  copyStatic();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
