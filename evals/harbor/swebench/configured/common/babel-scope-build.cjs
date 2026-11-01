// Babel's existing Gulpfile.mjs maps src/ to lib/ and invokes babel-worker.cjs.
// Reconstruct requested lib/ trees without removing bootstrap inputs mid-build.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = process.cwd();
const packages = [...new Set(process.argv.slice(2))].sort();
const staged = [];

function incomplete(message) {
  const error = new Error('INCOMPLETE: ' + message);
  error.exitCode = 2;
  throw error;
}

function checkGenerationInputs() {
  const { baseCommit } = JSON.parse(fs.readFileSync(path.join(__dirname, 'repo-profile.json'), 'utf8'));
  if (!/^[0-9a-f]{40}$/.test(baseCommit || '')) incomplete('the repository profile must pin its original base commit');
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  const tracked = git(['diff', '--name-only', '--no-renames', '-z', baseCommit, '--']);
  const changed = [...tracked, ...git(['ls-files', '--others', '--exclude-standard', '-z'])];
  const needsGeneration = changed.filter(file => {
    const source = file.match(/^(?:packages|codemods|eslint)\/[^/]+\/src\/(.*)$/)?.[1];
    return file.startsWith('packages/babel-helpers/src/helpers/') ||
      file.startsWith('packages/babel-helpers/scripts/') ||
      (source && /(?:^|\/)(?:generated\/|[^/]*-generated\.)/.test(source)) ||
      /^packages\/babel-types\/src\/definitions\//.test(file);
  });
  if (needsGeneration.length) incomplete('native helper/artifact generation is required for ' + [...new Set(needsGeneration)].sort().join(', '));
  const unsupported = changed.filter(file =>
    /^(?:packages|codemods|eslint)\/[^/]+\//.test(file) &&
    !/^(?:packages|codemods|eslint)\/[^/]+\/(?:src|test)\//.test(file) &&
    !/(?:\.md$|\/LICENSE(?:\.[^/]*)?$)/i.test(file));
  unsupported.push(...tracked.filter(file => /^(?:scripts\/|\.yarn\/|(?:babel\.|jest\.)config\.|babel-worker\.cjs$|Gulpfile\.mjs$|Makefile(?:\.|$)|package\.json$|yarn\.lock$)/.test(file)));
  if (unsupported.length) incomplete('native generation/build support is required for changed build inputs: ' + [...new Set(unsupported)].sort().join(', '));
}

async function visit(dir, scope, worker) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(dir, item.name);
    const relative = path.relative(root, file).split(path.sep).join('/');
    // This is the same raw-helper exclusion as Gulp's defaultSourcesGlob.
    if (relative.startsWith('packages/babel-helpers/src/helpers/')) continue;
    if (item.isDirectory()) {
      await visit(file, scope, worker);
    } else if (/\.(?:js|cjs|ts)$/.test(file) && !file.endsWith('.d.ts')) {
      const output = path.relative(scope.src, file).replace(/\.ts$/, '.js');
      const dest = path.join(scope.fresh, output);
      await worker.transform(relative, dest, {
        sourceMaps: true,
        sourceFileName: path.relative(path.dirname(path.join(scope.lib, output)), file),
      });
    }
  }
}
(async () => {
  try {
    if (!packages.length) incomplete('expected at least one package directory');
    checkGenerationInputs();
    for (const pkg of packages) {
      if (!/^(packages|codemods|eslint)\/[^/]+$/.test(pkg) || ['.', '..'].includes(pkg.split('/')[1])) incomplete('invalid package scope: ' + pkg);
      const src = path.join(root, pkg, 'src');
      if (!fs.existsSync(src) || !fs.statSync(src).isDirectory()) incomplete('no native source tree for ' + pkg);
      const dir = fs.mkdtempSync(path.join(root, pkg, '.haechi-scope-'));
      const scope = { src, dir, fresh: path.join(dir, 'fresh'), backup: path.join(dir, 'previous'), lib: path.join(root, pkg, 'lib'), swapped: false, backedUp: false };
      staged.push(scope);
      fs.mkdirSync(scope.fresh);
    }
    const worker = require(path.join(root, 'babel-worker.cjs'));
    // Compile all packages before replacing dependencies used by Babel itself.
    for (const scope of staged) await visit(scope.src, scope, worker);
    for (const scope of staged) {
      if (fs.existsSync(scope.lib)) {
        // Docker overlay layers cannot rename a lower-layer directory (EXDEV).
        // Copy a complete backup before removing the old tree for the swap.
        fs.cpSync(scope.lib, scope.backup, { recursive: true });
        scope.backedUp = true;
        fs.rmSync(scope.lib, { recursive: true });
      }
      fs.renameSync(scope.fresh, scope.lib);
      scope.swapped = true;
    }
  } catch (error) {
    for (const scope of [...staged].reverse()) {
      if (scope.swapped || scope.backedUp) fs.rmSync(scope.lib, { recursive: true, force: true });
      if (scope.backedUp) fs.renameSync(scope.backup, scope.lib);
    }
    throw error;
  } finally {
    for (const scope of staged) fs.rmSync(scope.dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = error.exitCode || 1; });
