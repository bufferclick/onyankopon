import { ABILITIES } from '../src/data/abilities.js';
for (const a of ABILITIES) {
  if (!a.effects) continue;
  console.log(a.id.padEnd(18), JSON.stringify(a.effects));
}
console.log('--- damage blocks');
for (const a of ABILITIES) console.log(a.id.padEnd(18), JSON.stringify(a.damage), 'cost=', JSON.stringify(a.cost), 'hits=', a.hits, 'tick=', a.tickInterval, 'rank=', JSON.stringify(a.rank));
