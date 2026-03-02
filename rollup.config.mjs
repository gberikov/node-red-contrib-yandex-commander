import fg from 'fast-glob';
import { dirname, join, posix } from 'node:path';
import { defineConfig } from 'rollup';
import typescript from '@rollup/plugin-typescript';
import { readFileSync } from 'node:fs';

function normalizePath(p) {
  return posix.normalize(p.replace(/\\/g, '/'));
}

const packageJson = JSON.parse(readFileSync('./package.json').toString());
const allNodeTypes = Object.keys(packageJson['node-red'].nodes);

const htmlWatch = () => {
  return {
    name: 'htmlWatch',
    load(id) {
      const editorDir = dirname(id);
      const htmlFiles = fg.sync(normalizePath(join(editorDir, '*.html')));
      htmlFiles.map((file) => this.addWatchFile(file));
    }
  };
};

const htmlBundle = () => {
  return {
    name: 'htmlBundle',
    renderChunk(code, chunk, _options) {
      const path = chunk.facadeModuleId;
      const editorDir = dirname(path);
      const htmlFiles = fg.sync(normalizePath(join(editorDir, '*.html')));
      const htmlContents = htmlFiles.map((fPath) => readFileSync(fPath));
      code = `<script type="text/javascript">\n${code}\n</script>\n${htmlContents.join('\n')}`;
      return {
        code,
        map: { mappings: '' }
      };
    }
  };
};

// Extract the directory name from the node type (e.g. "yandex-commander-connect" -> "connect")
function getNodeDir(nodeType) {
  const buildPath = packageJson['node-red'].nodes[nodeType];
  // buildPath is like "build/nodes/connect/connect.js"
  const parts = buildPath.split('/');
  return parts[2]; // "connect", "station", "get", "in", "out"
}

const getPlugins = (nodeDir) => [
  htmlWatch(),
  typescript({
    lib: ['es5', 'es6', 'dom'],
    include: [`src/nodes/${nodeDir}/html/editor.ts`],
    target: 'es5',
    tsconfig: false,
    noEmitOnError: false
  }),
  htmlBundle()
];

const makeConfigItem = (nodeType) => {
  const nodeDir = getNodeDir(nodeType);
  return defineConfig({
    input: `src/nodes/${nodeDir}/html/editor.ts`,
    output: {
      file: `build/nodes/${nodeDir}/${nodeDir}.html`,
      format: 'es'
    },
    external: ['node-red'],
    plugins: getPlugins(nodeDir),
    watch: {
      clearScreen: false
    }
  });
};

const config = allNodeTypes.map((nodeType) => makeConfigItem(nodeType));

export default config;
