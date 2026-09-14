import { mkdir, readFile, readdir, copyFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import './check-manifest.mjs';
const packageInfo = JSON.parse(await readFile('package.json', 'utf8'));
const name = `zyflow-${packageInfo.version}-chrome.zip`;
const files = await readdir('.output');
if (!files.includes(name)) throw new Error(`Missing .output/${name}; run npm run zip first.`);
await mkdir('release', { recursive: true });
await copyFile(`.output/${name}`, `release/${name}`);
const digest = createHash('sha256')
  .update(await readFile(`release/${name}`))
  .digest('hex');
await writeFile(`release/${name}.sha256`, `${digest}  ${name}\n`);
console.log(`Release package: release/${name}`);
