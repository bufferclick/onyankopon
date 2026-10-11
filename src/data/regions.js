/**
 * The province of Kitsune-ga-Oka: nine regions on one continuous 3.2 km map.
 * Coordinates are world metres; `r` is the radius of the region's influence
 * (biome blend, spawn tables, music, weather). Regions overlap deliberately —
 * the seams are where the interesting ambushes happen.
 */

export const WORLD = {
  size: 3200,            // metres square
  half: 1600,
  seaLevel: 0,
  maxHeight: 190,
  seed: 20241010,
};

export const REGIONS = [
  {
    id: 'kawa', name: 'Kawa-no-Sato', kanji: '川の里', level: [1, 8], safe: false,
    center: [-620, 520], r: 430, biome: 'fields',
    blurb: 'Rice terraces, cedar fences, and a river that takes a child every spring.',
    enemies: [['bandit', 5], ['ronin', 2], ['boar', 2], ['deer', 1], ['crow', 1], ['kappa', 1]],
    palette: { grass: 0x6f7f4a, dirt: 0x6a5540, rock: 0x6b6b63, tree: 0x3f5a3a, treeAlt: 0x7a8a4a, water: 0x2e5a66, fog: 0x9fb0a4 },
    weather: { clear: 6, cloudy: 3, rain: 2, mist: 2 },
    ambience: 'village', music: 'day', light: { sun: 0xffe7c4, ambient: 0x8fa0b0, intensity: 1.05 },
  },
  {
    id: 'wood', name: 'Ashigaru Wood', kanji: '足軽の森', level: [5, 16],
    center: [180, 720], r: 540, biome: 'forest',
    blurb: 'Old cedars planted over old graves. The path moves when you are not looking.',
    enemies: [['ronin', 4], ['ashigaru_spear', 3], ['archer', 2], ['gaki', 2], ['boar', 2], ['tanuki', 1], ['naginata_monk', 1]],
    palette: { grass: 0x4a6a3c, dirt: 0x4a3a2c, rock: 0x5a5a54, tree: 0x2c442c, treeAlt: 0x3f5a2e, water: 0x243f4a, fog: 0x7a8a7a },
    weather: { clear: 4, cloudy: 4, rain: 3, mist: 4, storm: 1 },
    ambience: 'forest', music: 'day', light: { sun: 0xf0d9a8, ambient: 0x6a7a6a, intensity: 0.85 },
  },
  {
    id: 'reeds', name: 'The Reed Marches', kanji: '葦沼', level: [8, 20],
    center: [-940, -220], r: 500, biome: 'swamp',
    blurb: 'Warm, waist-deep water and reeds tall enough to hide a man standing up.',
    enemies: [['kappa', 4], ['gaki', 3], ['bandit', 2], ['nure_onna', 1], ['yurei', 1], ['crow', 1]],
    palette: { grass: 0x5a6a42, dirt: 0x3f3626, rock: 0x4a4a44, tree: 0x3a4a34, treeAlt: 0x6a7a3a, water: 0x33452e, fog: 0x8a9a86 },
    weather: { mist: 5, rain: 3, cloudy: 3, clear: 2 },
    ambience: 'swamp', music: 'night', light: { sun: 0xd8c8a0, ambient: 0x5a6a5a, intensity: 0.72 },
  },
  {
    id: 'bamboo', name: 'The Bamboo Sea', kanji: '竹海', level: [14, 26],
    center: [920, 640], r: 470, biome: 'bamboo',
    blurb: 'Ten million green spears. Sound travels strangely; so do knives.',
    enemies: [['ashigaru_spear', 3], ['archer', 3], ['tengu', 1], ['jorogumo', 1], ['tanuki', 2], ['boar', 1]],
    palette: { grass: 0x6a8a4a, dirt: 0x5a4a34, rock: 0x5f5f58, tree: 0x6a9a4a, treeAlt: 0x8fb45a, water: 0x2a4a4a, fog: 0xaabaa0 },
    weather: { clear: 4, cloudy: 3, rain: 3, wind: 3 },
    ambience: 'bamboo', music: 'day', light: { sun: 0xe8f0c0, ambient: 0x7a9a6a, intensity: 0.95 },
  },
  {
    id: 'yuki', name: 'Yuki Pass', kanji: '雪峠', level: [20, 34],
    center: [180, -960], r: 540, biome: 'snow',
    blurb: 'A road between two provinces, closed half the year by weather and the rest by what lives there.',
    enemies: [['namahage', 3], ['oni_brute', 2], ['ashigaru_spear', 2], ['yurei', 2], ['crow', 2]],
    palette: { grass: 0xdfe8f0, dirt: 0xa8b0bc, rock: 0x7a8290, tree: 0x2c3a3a, treeAlt: 0xe8f0f8, water: 0x4a6a8a, fog: 0xc8d8e8 },
    weather: { snow: 6, cloudy: 3, clear: 2, blizzard: 2 },
    ambience: 'wind', music: 'night', light: { sun: 0xd8e8ff, ambient: 0x8aa8c8, intensity: 0.8 },
  },
  {
    id: 'graves', name: 'Haiji Graves', kanji: '廃寺墓地', level: [24, 38],
    center: [-720, -940], r: 480, biome: 'graveyard',
    blurb: 'A temple that gave up. Ten thousand stones, none of them comfortable.',
    enemies: [['gaki', 4], ['yurei', 3], ['hanged_one', 3], ['naginata_monk', 2], ['okubi', 1], ['ubume', 1], ['gashadokuro', 0.4]],
    palette: { grass: 0x4a4a3c, dirt: 0x3a342c, rock: 0x6a6a66, tree: 0x2a2a24, treeAlt: 0x3a3a2e, water: 0x1a2622, fog: 0x5a5a5a },
    weather: { mist: 6, cloudy: 3, rain: 2, clear: 1 },
    ambience: 'graves', music: 'night', light: { sun: 0xa8b0c0, ambient: 0x4a4a5a, intensity: 0.6 },
  },
  {
    id: 'ridge', name: 'Oni Ridge', kanji: '鬼ヶ嶺', level: [30, 46],
    center: [1120, -420], r: 540, biome: 'volcanic',
    blurb: 'Ash falls like slow snow. The ground is warm through your sandals.',
    enemies: [['oni_brute', 5], ['tengu', 2], ['contractor_wraith', 2], ['okubi', 1], ['aka_kitsune', 0.5], ['oni_general', 0.4]],
    palette: { grass: 0x5a3a2a, dirt: 0x3a2a22, rock: 0x3a3434, tree: 0x2a1f1a, treeAlt: 0x5a2a1a, water: 0x8a3a1a, fog: 0x6a4a3a },
    weather: { ash: 6, cloudy: 2, clear: 2, embers: 3 },
    ambience: 'volcanic', music: 'combat', light: { sun: 0xff9a5a, ambient: 0x6a3a2a, intensity: 0.9 },
  },
  {
    id: 'shrine', name: 'Inari Sanctum', kanji: '稲荷社', level: [1, 70], safe: true,
    center: [-140, -60], r: 300, biome: 'shrine',
    blurb: 'A thousand vermilion torii and a fox with a rice sheaf in its teeth. Nothing here will hurt you. Probably.',
    enemies: [['deer', 2], ['crow', 2], ['tanuki', 1]],
    palette: { grass: 0x7a8a52, dirt: 0x7a5f42, rock: 0x8a7a6a, tree: 0x4a6a3a, treeAlt: 0xc86a4a, water: 0x3a6a7a, fog: 0xc0b0a0 },
    weather: { clear: 7, cloudy: 2, petals: 3 },
    ambience: 'shrine', music: 'shrine', light: { sun: 0xffd8a0, ambient: 0xa09080, intensity: 1.0 },
  },
  {
    id: 'capital', name: 'The Capital of Nine Bells', kanji: '九鐘の都', level: [40, 70],
    center: [640, -1320], r: 500, biome: 'city',
    blurb: 'They ring nine bells at dusk so the dead know the hour. It has been a long time since that worked.',
    enemies: [['contractor_wraith', 4], ['yurei', 3], ['jorogumo', 2], ['nurikabe', 2], ['okubi', 2], ['hanged_one', 2], ['nine_bells', 0.4]],
    palette: { grass: 0x5a5a4a, dirt: 0x4a4238, rock: 0x6a645a, tree: 0x3a3a2e, treeAlt: 0x6a2a3a, water: 0x2a3a44, fog: 0x4a4a55 },
    weather: { mist: 4, rain: 3, cloudy: 3, clear: 2, bells: 2 },
    ambience: 'city', music: 'night', light: { sun: 0xb0a8c0, ambient: 0x3a3a4a, intensity: 0.65 },
  },
];

export const REGION_BY_ID = Object.fromEntries(REGIONS.map((r) => [r.id, r]));

/** Weighted pick of a region's enemy table. */
export function pickEnemy(regionId, rng) {
  const region = REGION_BY_ID[regionId];
  if (!region) return 'bandit';
  return rng.weighted(region.enemies);
}

/** Which region contains a point (nearest centre within radius, else nearest). */
export function regionAt(x, z) {
  let best = null, bestD = Infinity;
  for (const r of REGIONS) {
    const d = Math.hypot(x - r.center[0], z - r.center[1]);
    if (d < r.r && d < bestD) { best = r; bestD = d; }
  }
  if (best) return best;
  for (const r of REGIONS) {
    const d = Math.hypot(x - r.center[0], z - r.center[1]);
    if (d < bestD) { best = r; bestD = d; }
  }
  return best;
}

/** Blend two regions' palettes for a smooth seam. */
export function paletteAt(x, z) {
  const here = regionAt(x, z);
  return here ? here.palette : REGION_BY_ID.kawa.palette;
}

/** Level band that "should" be at a point — drives enemy scaling + drops. */
export function levelAt(x, z) {
  let num = 0, den = 0;
  for (const r of REGIONS) {
    const d = Math.hypot(x - r.center[0], z - r.center[1]);
    const w = 1 / (1 + (d / (r.r * 0.75)) ** 4);
    num += ((r.level[0] + r.level[1]) / 2) * w;
    den += w;
  }
  return Math.max(1, Math.round(num / Math.max(0.0001, den)));
}

/**
 * Landmarks. Every one is discoverable (codex + XP) and many are quest
 * targets. `t` drives which prop the world builder instantiates.
 */
export const POIS = [
  // River village ------------------------------------------------------
  { id: 'kawa_village', t: 'village', region: 'kawa', pos: [-620, 520], r: 70, name: 'Kawa-no-Sato', kanji: '川の里',
    desc: 'Twelve houses, one well, and a shrine to a god nobody in the village can name.' },
  { id: 'kawa_well', t: 'well', region: 'kawa', pos: [-560, 470], name: 'The First Well', kanji: '初井', desc: 'Cold, clean, and watched.' },
  { id: 'kawa_bridge', t: 'bridge', region: 'kawa', pos: [-700, 600], name: 'Wetstone Bridge', kanji: '濡石橋', desc: 'Older than the village it feeds.' },
  { id: 'kawa_paddy', t: 'fields', region: 'kawa', pos: [-480, 640], name: 'Terraced Paddies', kanji: '棚田', desc: 'Where the rice is offered and the foxes are not.' },
  { id: 'kawa_camp', t: 'camp', region: 'kawa', pos: [-800, 420], name: 'Bandit Camp', kanji: '盗賊野営', desc: 'Three men, one fire, and a very bad plan.' },
  { id: 'kawa_dock', t: 'dock', region: 'kawa', pos: [-760, 680], name: 'Reed Dock', kanji: '葦波止場', desc: 'A single boat that does not belong to anyone.' },

  // Wood ---------------------------------------------------------------
  { id: 'wood_gate', t: 'torii', region: 'wood', pos: [40, 640], name: 'Cedar Torii', kanji: '杉鳥居', desc: 'Marks the temple path. The temple is gone.' },
  { id: 'wood_shrine', t: 'shrine', region: 'wood', pos: [200, 760], name: 'Ashigaru Shrine', kanji: '足軽社', desc: 'Offerings of broken arrows. Thousands of them.' },
  { id: 'wood_camp', t: 'camp', region: 'wood', pos: [330, 840], name: 'Ronin Camp', kanji: '浪人野営', desc: 'Six bedrolls, one pot, no master.' },
  { id: 'wood_cave', t: 'cave', region: 'wood', pos: [-40, 900], name: 'Hollow Cedar', kanji: '空洞杉', desc: 'Something lives in the hollow. It has been living there a while.', instance: 'cave_hollow' },
  { id: 'wood_watch', t: 'tower', region: 'wood', pos: [420, 620], name: 'Old Watchtower', kanji: '古物見櫓', desc: 'You can see the whole valley. The whole valley can see you.' },

  // Reeds --------------------------------------------------------------
  { id: 'reeds_hut', t: 'hut', region: 'reeds', pos: [-980, -180], name: 'Herb-Gatherer’s Hut', kanji: '薬師小屋', desc: 'Bitter smells, warm welcome, questions you should answer honestly.' },
  { id: 'reeds_altar', t: 'altar', region: 'reeds', pos: [-860, -380], name: 'Drowned Altar', kanji: '沈祭壇', desc: 'Knee-deep in black water. Offerings still arrive.' },
  { id: 'reeds_pier', t: 'dock', region: 'reeds', pos: [-1060, -60], name: 'Sunken Pier', kanji: '沈桟橋', desc: 'Half of it went under and never complained.' },

  // Bamboo -------------------------------------------------------------
  { id: 'bamboo_grove', t: 'grove', region: 'bamboo', pos: [940, 700], name: 'Whispering Grove', kanji: '囁竹林', desc: 'The bamboo says your name. It learned it from someone.' },
  { id: 'bamboo_pavilion', t: 'pavilion', region: 'bamboo', pos: [820, 560], name: 'Moon Pavilion', kanji: '月見亭', desc: 'Built to watch the moon. Used, mostly, for ambushes.' },
  { id: 'bamboo_camp', t: 'camp', region: 'bamboo', pos: [1080, 720], name: 'Spear Encampment', kanji: '槍陣', desc: 'Disciplined. Organised. Do not approach from the front.' },

  // Pass ---------------------------------------------------------------
  { id: 'yuki_gate', t: 'torii', region: 'yuki', pos: [60, -1020], name: 'Snow Gate', kanji: '雪門', desc: 'The last warm thing for a long walk.' },
  { id: 'yuki_hut', t: 'hut', region: 'yuki', pos: [240, -880], name: 'Pass Keeper’s Hut', kanji: '峠番小屋', desc: 'He keeps the road and a very detailed ledger.' },
  { id: 'yuki_statue', t: 'statue', region: 'yuki', pos: [380, -1080], name: 'Jizō in the Snow', kanji: '雪地蔵', desc: 'Someone dresses it in a red bib every winter. Someone.' },
  { id: 'yuki_arena', t: 'arena', region: 'yuki', pos: [120, -1140], name: 'Namahage Ring', kanji: 'なまはげ輪', desc: 'A circle of packed snow with a lot of red in it.', instance: 'trial_snow' },

  // Graves -------------------------------------------------------------
  { id: 'graves_temple', t: 'temple', region: 'graves', pos: [-700, -900], name: 'Haiji — The Abandoned Temple', kanji: '廃寺', desc: 'Roof fallen in. Bell still hanging. Still ringing sometimes.' },
  { id: 'graves_bell', t: 'bell', region: 'graves', pos: [-660, -980], name: 'The Third Bell', kanji: '三つ目の鐘', desc: 'Ring it and something answers. Ring it twice and it comes closer.' },
  { id: 'graves_ossuary', t: 'ossuary', region: 'graves', pos: [-820, -1020], name: 'The Ossuary', kanji: '納骨堂', desc: 'Bones stacked by hand, by someone with a great deal of patience.' },
  { id: 'graves_arena', t: 'arena', region: 'graves', pos: [-560, -1080], name: 'Bone Yard', kanji: '骨庭', desc: 'Where the Uncounted walks on the nights it feels like it.', instance: 'trial_bone' },

  // Ridge --------------------------------------------------------------
  { id: 'ridge_forge', t: 'forge', region: 'ridge', pos: [1040, -320], name: 'Oni Forge', kanji: '鬼鍛冶', desc: 'Still hot. Nobody has fed it in years.' },
  { id: 'ridge_gate', t: 'torii', region: 'ridge', pos: [940, -520], name: 'Black Torii', kanji: '黒鳥居', desc: 'Charred, but it keeps standing back up.' },
  { id: 'ridge_peak', t: 'peak', region: 'ridge', pos: [1220, -560], name: 'Shuten’s Seat', kanji: '酒呑の座', desc: 'A throne of cooled lava, sized for someone much larger than a man.' },
  { id: 'ridge_arena', t: 'arena', region: 'ridge', pos: [1100, -700], name: 'Ash Arena', kanji: '灰の円', desc: 'The ground here is glass. Something made it glass.', instance: 'trial_ash' },

  // Sanctum ------------------------------------------------------------
  { id: 'shrine_main', t: 'shrine', region: 'shrine', pos: [-140, -60], name: 'Inari Sanctum', kanji: '稲荷社', desc: 'Home. Such as it is.' },
  { id: 'shrine_torii_path', t: 'torii_path', region: 'shrine', pos: [-140, 40], name: 'The Thousand Gates', kanji: '千本鳥居', desc: 'Donated by contractors. Every gate is someone’s debt.' },
  { id: 'shrine_pool', t: 'pool', region: 'shrine', pos: [-220, -140], name: 'Mirror Pool', kanji: '鏡池', desc: 'Look in it and you will see the fox, not yourself.' },
  { id: 'shrine_dojo', t: 'dojo', region: 'shrine', pos: [-60, -140], name: 'The Empty Dojo', kanji: '空道場', desc: 'Sweep the floor. Someone will come.' },

  // Capital ------------------------------------------------------------
  { id: 'capital_gate', t: 'gate', region: 'capital', pos: [520, -1180], name: 'South Gate', kanji: '南門', desc: 'Never closes. Nothing needs it to.' },
  { id: 'capital_tower', t: 'pagoda', region: 'capital', pos: [680, -1360], name: 'Nine-Storey Pagoda', kanji: '九重塔', desc: 'Nine bells, nine floors, nine contractors who never left.' },
  { id: 'capital_market', t: 'market', region: 'capital', pos: [560, -1300], name: 'The Quiet Market', kanji: '静市場', desc: 'Trade is conducted in writing. Nobody wants to be heard.' },
  { id: 'capital_arena', t: 'arena', region: 'capital', pos: [760, -1240], name: 'Bell Square', kanji: '鐘広場', desc: 'The largest open space in the city, and the one they avoid.', instance: 'trial_bell' },

  // Wander-marks -----------------------------------------------------------
  { id: 'mark_north', t: 'mark', region: 'yuki', pos: [40, -1360], name: 'North Road Marker', kanji: '北標', desc: 'A stone post with a fox scratched into it, facing away.' },
  { id: 'mark_east', t: 'mark', region: 'ridge', pos: [1400, -80], name: 'East Road Marker', kanji: '東標', desc: 'The scratch here is deeper. Someone did it twice.' },
  { id: 'mark_cross', t: 'crossroads', region: 'wood', pos: [140, 300], name: 'The Nine Crossroads', kanji: '九岐路', desc: 'Nine paths leave. Eight come back.' },
  { id: 'mark_cairn', t: 'cairn', region: 'bamboo', pos: [1180, 420], name: 'Contractor’s Cairn', kanji: '契約者の塚', desc: 'Stones left by people who made the same mistake you did.' },
];

export const POI_BY_ID = Object.fromEntries(POIS.map((p) => [p.id, p]));

export function poisInRegion(regionId) {
  return POIS.filter((p) => p.region === regionId);
}
