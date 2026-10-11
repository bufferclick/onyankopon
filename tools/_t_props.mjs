import * as THREE from 'three';
import { getProp, PROP_IDS } from '/home/user/onyankopon/src/world/Props.js';
import { Terrain } from '/home/user/onyankopon/src/world/Terrain.js';
let bad = 0;
for (const id of PROP_IDS) {
  const g = getProp(id, 1);
  if (!g) { console.log('MISSING', id); bad++; continue; }
  const p = g.attributes.position.array;
  let nan = 0;
  for (let i = 0; i < p.length; i++) if (!Number.isFinite(p[i])) nan++;
  if (nan) { console.log('NaN in', id, nan); bad++; }
  if (!g.attributes.color || !g.attributes.normal || !g.attributes.uv) { console.log('missing attrs', id); bad++; }
  console.log(id.padEnd(20), String(g.attributes.position.count).padStart(6), 'verts');
}
const t = new Terrain();
const xs = [[0,0],[-620,520],[1120,-420],[640,-1320],[-700,-900],[1500,-1500],[240,-880]];
for (const [x,z] of xs) console.log(`h(${x},${z}) = ${t.heightAt(x,z).toFixed(2)} biome=${t.biomeIdAt(x,z)} slope=${t.slopeAt(x,z).toFixed(2)}`);
console.log(bad ? `FAILURES: ${bad}` : 'ALL PROPS OK');
