import * as THREE from 'three';
import { buildCharacter, configFromEnemy } from '../src/entities/CharacterRig.js';
import { Animator } from '../src/entities/Animator.js';
import { ENEMIES } from '../src/data/enemies.js';

let fails = 0;
for (const def of ENEMIES.slice(0, 40)) {
  const cfg = configFromEnemy(def, 5);
  const rig = buildCharacter(cfg);
  const anim = new Animator(rig);
  let meshes = 0, verts = 0;
  rig.root.traverse((o) => { if (o.isMesh) { meshes++; verts += o.geometry.attributes.position.count; } });
  // run every state for a while
  for (const st of ['idle','walk','run','sprint','jump','fall','land','dash','attack','heavy','block','parry','hit','death','cast','summon','execute','taunt','float','talk','sit']) {
    anim.setState(st, { force: true, duration: 0.6, variant: 1 });
    for (let i = 0; i < 30; i++) anim.update(1/60, { speed: 1.2, velocity: new THREE.Vector3(0.4, 0, 3), grounded: true });
  }
  let nan = false;
  rig.root.traverse((o) => {
    if (!Number.isFinite(o.position.x + o.position.y + o.position.z + o.rotation.x + o.rotation.y + o.rotation.z)) nan = true;
  });
  const bb = new THREE.Box3().setFromObject(rig.root);
  const h = bb.max.y - bb.min.y;
  if (nan) { console.log('NaN!', def.id); fails++; }
  console.log(def.id.padEnd(18), 'meshes', String(meshes).padStart(3), 'verts', String(verts).padStart(6), 'height', h.toFixed(2));
}
const player = buildCharacter({ height: 1.8, weapon: 'katana', cloth: 0x2a2a34, accent: 0xc8392c, mask: 'kitsune', tails: 3, seed: 99 });
let pm = 0; player.root.traverse(o => { if (o.isMesh) pm++; });
console.log('player meshes', pm);
console.log(fails ? `FAIL ${fails}` : 'RIG OK');
