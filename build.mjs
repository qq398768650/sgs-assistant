import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const OWNER = 'qq398768650';
const REPO = 'sgs-assistant';
const BRANCH = 'main';
const RAW = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}`;

const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const VERSION = manifest.version;

const modules = [
  'src/modules/deck.js',
  'src/modules/peek.js',
  'src/modules/rewards.js',
  'src/modules/claims.js',
  'src/modules/popup.js',
  'src/modules/rogue.js',
  'src/content.js',
  'src/inject.js'
];

function read(rel) {
  return readFileSync(join(root, rel), 'utf8').replace(/^\uFEFF/, '').trimEnd();
}

const header = `// ==UserScript==
// @name         三国杀助手
// @namespace    https://github.com/${OWNER}/${REPO}
// @version      ${VERSION}
// @description  ${manifest.description}
// @author       ${OWNER}
// @match        *://*.sanguosha.com/*
// @run-at       document-start
// @grant        none
// @updateURL    ${RAW}/sgs-assistant.user.js
// @downloadURL  ${RAW}/sgs-assistant.user.js
// @require      ${RAW}/data/game-data.js
// @require      ${RAW}/data/rogue-fights.js
// ==/UserScript==
`;

const body = modules.map(read).join('\n\n');

writeFileSync(join(root, 'sgs-assistant.user.js'), header + '\n' + body + '\n', 'utf8');

function wrapData(jsonRel, jsRel, globalName) {
  const data = JSON.parse(readFileSync(join(root, jsonRel), 'utf8'));
  writeFileSync(join(root, jsRel), 'window.' + globalName + '=' + JSON.stringify(data) + ';\n', 'utf8');
}

wrapData('data/game-data.json', 'data/game-data.js', '__SGS_GAMEDATA__');
wrapData('data/rogue-fights.json', 'data/rogue-fights.js', '__SGS_ROGUEFIGHTS__');

console.log('built sgs-assistant.user.js @ ' + VERSION);
console.log('built data/game-data.js, data/rogue-fights.js');
