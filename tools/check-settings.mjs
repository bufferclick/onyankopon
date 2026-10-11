import { DEFAULT_SETTINGS } from '../src/core/Settings.js';
import fs from 'node:fs'; import path from 'node:path';
const files=[]; (function walk(d){for(const f of fs.readdirSync(d)){const p=path.join(d,f); if(fs.statSync(p).isDirectory())walk(p); else if(p.endsWith('.js'))files.push(p);}})('src');
const used=new Map();
for(const f of files){const s=fs.readFileSync(f,'utf8');
  for(const m of s.matchAll(/settings\.get\(\s*'([a-z]+)'\s*,\s*'([A-Za-z0-9]+)'\s*\)/g)){
    const k=m[1]+'.'+m[2]; if(!used.has(k))used.set(k,new Set()); used.get(k).add(f);}
  for(const m of s.matchAll(/get\(\s*'([a-z]+)'\s*,\s*'([A-Za-z0-9]+)'\s*\)/g)){
    const k=m[1]+'.'+m[2]; if(!used.has(k))used.set(k,new Set()); used.get(k).add(f);}
  for(const m of s.matchAll(/s\.get\(\s*'([a-z]+)'\s*,\s*'([A-Za-z0-9]+)'\s*\)/g)){
    const k=m[1]+'.'+m[2]; if(!used.has(k))used.set(k,new Set()); used.get(k).add(f);}
}
const missing=[];
for(const [k,fs2] of used){const [sec,key]=k.split('.'); const def=DEFAULT_SETTINGS[sec];
  if(!def){missing.push(`${k}  (no section)  ${[...fs2].join(',')}`); continue;}
  if(!(key in def)) missing.push(`${k}  ${[...fs2].join(',')}`);
}
console.log(missing.length? 'MISSING KEYS:\n'+missing.join('\n') : 'all settings keys exist');
