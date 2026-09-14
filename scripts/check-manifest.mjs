import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const manifest = JSON.parse(await readFile('.output/chrome-mv3/manifest.json', 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(
  [...manifest.permissions].sort(),
  ['sidePanel', 'storage', 'webNavigation'].sort(),
);
assert.deepEqual(manifest.host_permissions, ['https://learn.zybooks.com/*']);
assert.deepEqual(
  manifest.content_scripts.flatMap((entry) => entry.matches),
  ['https://learn.zybooks.com/*'],
);
assert.equal(manifest.side_panel.default_path, 'sidepanel.html');
assert.equal(manifest.minimum_chrome_version, '116');
assert(!JSON.stringify(manifest).includes('localhost'));
console.log('Production manifest verified: exact host and intended permissions only.');
