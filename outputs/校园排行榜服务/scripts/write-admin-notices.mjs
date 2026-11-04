import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const roots = ['@tiptap/core', '@tiptap/extension-image', '@tiptap/react', '@tiptap/starter-kit', '@tiptap/static-renderer'];

// Read only the installed, locked runtime closure; never install or fetch packages.
export async function writeAdminNotices(bundledModules = []) {
  const lock = JSON.parse(await fs.readFile(path.join(root, 'package-lock.json'), 'utf8'));
  const records = new Map(), sections = new Map(), optionalMissing = new Set(), unbundledOptional = new Set();
  const bundledNames = new Set(bundledModules.flatMap(id => [...id.replaceAll('\\', '/').matchAll(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)/g)].map(match => match[1])));
  // The local project package is covered by the project's own copyright/license.
  bundledNames.delete('@qisheng/shared');
  async function locate(name, from) {
    let directory = from;
    while (directory === root || directory.startsWith(root + path.sep)) {
      const candidate = path.join(directory, 'node_modules', name);
      try { await fs.access(path.join(candidate, 'package.json')); return candidate; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      directory = path.dirname(directory);
    }
    return null;
  }
  async function visit(name, from, optional = false) {
    // Type declarations are not part of the editor's shipped runtime.
    if (name.startsWith('@types/')) return null;
    const directory = await locate(name, from);
    if (!directory) {
      if (optional) { optionalMissing.add(name); return null; }
      throw new Error('Missing installed editor runtime dependency: ' + name);
    }
    const pkg = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'));
    const key = pkg.name + '@' + pkg.version;
    const locked = lock.packages?.[path.relative(root, directory).split(path.sep).join('/')];
    if (!locked || locked.version !== pkg.version || pkg.name !== name)
      throw new Error('Installed editor dependency does not match package-lock.json: ' + key);
    if (records.has(key)) return key;
    const files = (await fs.readdir(directory, { withFileTypes: true }))
      .filter(entry => entry.isFile() && /^(licen[cs]e|copying|notice)(?:[.-]|$)/i.test(entry.name))
      .map(entry => entry.name).sort();
    if (!files.length) throw new Error('Missing full license text: ' + key);
    const record = { name: pkg.name, version: pkg.version, license: typeof pkg.license === 'string' ? pkg.license : pkg.license?.type ?? 'UNKNOWN', files: [], dependencies: [] };
    records.set(key, record);
    const texts = [];
    for (const file of files) {
      const bytes = await fs.readFile(path.join(directory, file));
      if (!bytes.toString('utf8').trim()) throw new Error('Empty license text: ' + key + '/' + file);
      record.files.push({ name: file, sha256: createHash('sha256').update(bytes).digest('hex') });
      texts.push('--- ' + file + ' ---\n' + bytes.toString('utf8'));
    }
    sections.set(key, texts.join('\n\n'));
    const dependencies = { ...pkg.dependencies, ...pkg.optionalDependencies, ...pkg.peerDependencies };
    for (const dependency of Object.keys(dependencies).sort()) {
      const optionalDependency = Object.hasOwn(pkg.optionalDependencies ?? {}, dependency) || pkg.peerDependenciesMeta?.[dependency]?.optional === true;
      // Optional menu entry points are shipped only when the build actually uses them.
      if (optionalDependency && !bundledNames.has(dependency)) { unbundledOptional.add(dependency); continue; }
      const child = await visit(dependency, directory, optionalDependency);
      if (child) record.dependencies.push(child);
    }
    return key;
  }
  for (const name of roots) await visit(name, root);
  for (const name of [...bundledNames].sort()) await visit(name, root);
  const packages = [...records.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
  const output = path.join(root, 'admin', 'dist', 'licenses');
  await fs.mkdir(output, { recursive: true });
  const text = 'Editor runtime third-party notices\n\nFull license and notice files from the installed package-lock.json runtime dependency closure.\nIncludes bundled optional dependencies and runtime peers; excludes unused optional entry points, type-only packages and build tools.\n\n' + packages.map(record => {
    const key = record.name + '@' + record.version;
    return '='.repeat(72) + '\n' + key + '\nDeclared license: ' + record.license + '\n\n' + sections.get(key);
  }).join('\n\n') + '\n';
  await fs.writeFile(path.join(output, 'THIRD-PARTY.txt'), text);
  await fs.writeFile(path.join(output, 'dependencies.json'), JSON.stringify({ schema: 1, roots, packages, optionalMissing: [...optionalMissing].sort(), unbundledOptional: [...unbundledOptional].sort() }, null, 2) + '\n');
  console.log('Admin editor notices: ' + packages.length + ' packages; missing optional packages: ' + optionalMissing.size);
  return { packages, optionalMissing: [...optionalMissing].sort() };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await writeAdminNotices();
