import {mkdir,writeFile,copyFile,cp,rm,readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
// Each release gets a fresh asset directory. Relative module imports inherit
// that directory, so cached code from an earlier release cannot be mixed in.
const html=await readFile('index.html','utf8'),files=(await readdir('src')).sort(),hash=createHash('sha256');hash.update(html);
for(const file of files)hash.update(file).update(await readFile('src/'+file));
const release='r/'+hash.digest('hex').slice(0,12);
await rm('dist',{recursive:true,force:true});
await mkdir('dist/'+release,{recursive:true});
await writeFile('dist/index.html',html.replaceAll('./src/',`./${release}/src/`));
await cp('src','dist/'+release+'/src',{recursive:true});
await cp('assets','dist/assets',{recursive:true});
await copyFile('.nojekyll','dist/.nojekyll');
console.log(`Static website ready in dist/ with versioned assets: ${release}`);
