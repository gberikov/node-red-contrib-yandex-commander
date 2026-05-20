import * as esbuild from 'esbuild';
import { readFileSync, mkdirSync, copyFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

const nodes = ['connect', 'station', 'get', 'in', 'out'];
const isWatch = process.argv.includes('--watch');
const isProd = process.argv.includes('--prod');

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

async function buildRuntime() {
  const entryPoints = getRuntimeEntryPoints();
  const ctx = await esbuild.context({
    entryPoints,
    outdir: 'build',
    platform: 'node',
    format: 'cjs',
    target: 'es2022',
    sourcemap: isProd ? false : 'inline',
    tsconfig: './tsconfig.json',
    conditions: ['node'],
    logLevel: 'info',
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

async function buildEditor(name) {
  const editorDir = `src/nodes/${name}/html`;
  const result = await esbuild.build({
    entryPoints: [`${editorDir}/editor.ts`],
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2020',
    minify: isProd,
    tsconfig: './tsconfig.json',
  });

  const js = result.outputFiles[0].text;
  const htmlFiles = readdirSync(editorDir).filter((f) => f.endsWith('.html'));
  const htmlContents = htmlFiles.map((f) => readFileSync(join(editorDir, f), 'utf8'));

  const output = `<script type="text/javascript">\n${js}</script>\n${htmlContents.join('\n')}`;

  const outDir = `build/nodes/${name}`;
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${name}.html`), output);
  console.log(`[editor] ${name}.html`);
}

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

async function main() {
  await buildRuntime();
  await Promise.all(nodes.map((n) => buildEditor(n)));
  copyStatic();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
