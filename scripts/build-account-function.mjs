import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const target = path.resolve('.cloud-functions/hub-account');
fs.mkdirSync(target,{recursive:true});
for (const name of ['core','types']) {
  const source=fs.readFileSync(`src/lib/${name}.ts`,'utf8');
  const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}});
  fs.writeFileSync(path.join(target,name+'.js'),output.outputText);
}
fs.copyFileSync('cloud/functions/account/index.cjs',path.join(target,'index.js'));
fs.copyFileSync('cloud/functions/account/package.json',path.join(target,'package.json'));
console.log('Account function built: generic templates only, no credentials.');
