import {readdirSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
for(const file of readdirSync('src').filter(f=>f.endsWith('.js')))execFileSync(process.execPath,['--check','src/'+file],{stdio:'inherit'});
const html=readFileSync('index.html','utf8');
if(/(?:src|href)="\/(?!\/)/.test(html)||readFileSync('src/app.js','utf8').includes('src="/assets/'))throw new Error('Absolute asset path breaks GitHub Pages project hosting.');
console.log('JavaScript syntax and Pages asset paths passed.');
