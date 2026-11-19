import {copyFileSync, mkdirSync} from 'node:fs';
import {resolve} from 'node:path';

const destination = resolve(process.argv[2] ?? 'dist', 'verified');
mkdirSync(destination, {recursive: true});
for (const name of ['train', 'rush']) copyFileSync(`src/verified/${name}.mjs`, resolve(destination, `${name}.mjs`));
copyFileSync('src/verified/BEND-LICENSE.txt', resolve(destination, 'BEND-LICENSE.txt'));
