/**
 * NPCs. Dialogue is data: DialogueSystem evaluates `when` conditions against
 * the quest/player state to choose a node, then offers its choices.
 *
 * role: elder | merchant | smith | priest | child | hunter | contractor | keeper
 */

export const NPCS = [
  {
    id: 'haru', name: 'Elder Haru', kanji: '春翁', role: 'elder', region: 'kawa', poi: 'kawa_village',
    title: 'Village Elder',
    barks: ['Sit. The tea is bad but it is hot.', 'Foxes remember kindness. And slights. Mostly slights.',
      'You have that look. The one everybody gets on the first day of a contract.'],
    services: ['talk', 'quest'],
  },
  {
    id: 'kaede', name: 'Kaede', kanji: '楓', role: 'merchant', region: 'kawa', poi: 'kawa_village',
    title: 'Peddler',
    barks: ['Everything half price. Everything worth half price.', 'I do not ask where the coin comes from.',
      'You want the good rope or the cheap rope?'],
    services: ['shop', 'talk'],
    stock: ['rice_ball', 'sake', 'antidote', 'salt_packet', 'iron_scrap', 'cloth_scrap', 'bitter_tea'],
  },
  {
    id: 'goro', name: 'Gorō the Smith', kanji: '五郎鍛冶', role: 'smith', region: 'kawa', poi: 'kawa_village',
    title: 'Village Smith',
    barks: ['Bring me metal and I will bring it an argument.', 'That blade is a disgrace. Hold still, I will disgrace it more.',
      'Fox-fire in a forge is cheating. It is also faster.'],
    services: ['forge', 'talk', 'quest'],
    stock: ['iron_scrap', 'iron_ore', 'katana_shard', 'spear_head'],
  },
  {
    id: 'mio', name: 'Little Mio', kanji: '小美緒', role: 'child', region: 'kawa', poi: 'kawa_well',
    title: 'Village Child',
    barks: ['Mister, are you the one with the fox?', 'The well sang last night. Papa said it was the wind.',
      'I left a rice ball by the stones. It was gone in the morning.'],
    services: ['talk', 'quest'],
  },
  {
    id: 'saburo', name: 'Saburō', kanji: '三郎', role: 'hunter', region: 'wood', poi: 'wood_camp',
    title: 'Ronin',
    barks: ['Six of us came up this road. You are looking at what is left.', 'I will fight you if you pay me. I will fight with you if you don’t.',
      'The forest moves the path. I stopped being surprised about it.'],
    services: ['talk', 'quest'],
  },
  {
    id: 'shizuka', name: 'Shizuka', kanji: '静', role: 'priest', region: 'wood', poi: 'wood_shrine',
    title: 'Shrine Maiden',
    barks: ['Sweep first. Then pray. The order matters to somebody.', 'The arrows are offerings, not warnings. Mostly.',
      'Your fox is well-mannered for a devil. I notice these things.'],
    services: ['shrine', 'talk', 'quest'],
    stock: ['fox_tofu', 'salt_packet', 'ofuda_fire', 'omamori_health'],
  },
  {
    id: 'yuki_keeper', name: 'Pass Keeper Gen', kanji: '峠番ゲン', role: 'keeper', region: 'yuki', poi: 'yuki_hut',
    title: 'Keeper of the Pass',
    barks: ['Name, business, and what you are carrying. In that order.', 'Nine people crossed today. Nine people always cross.',
      'I write it all down. Nobody ever asks to read it.'],
    services: ['talk', 'quest', 'shop'],
    stock: ['bitter_tea', 'sake', 'frost_shard', 'fox_tofu'],
  },
  {
    id: 'reiko', name: 'Reiko the Bitter', kanji: '苦りょう子', role: 'merchant', region: 'reeds', poi: 'reeds_hut',
    title: 'Herb-Gatherer',
    barks: ['Everything out here is medicine or poison. Usually both.', 'Sit downwind, you smell like a contract.',
      'If it bites, it probably cures something.'],
    services: ['shop', 'talk', 'quest'],
    stock: ['antidote', 'bitter_tea', 'kappa_shell', 'spectral_dust', 'ofuda_bind'],
  },
  {
    id: 'tengu_master', name: 'Kurama the Feathered', kanji: '羽天狗', role: 'contractor', region: 'ridge', poi: 'ridge_peak',
    title: 'Tengu Sword-Master',
    barks: ['I have taught eleven humans. Four are alive. Two are sane.', 'You fight like someone apologising for it.',
      'Show me the fox. No — show me what the fox shows you.'],
    services: ['talk', 'quest', 'train'],
  },
  {
    id: 'ossuary_keeper', name: 'The Bone-Keeper', kanji: '骨守', role: 'keeper', region: 'graves', poi: 'graves_ossuary',
    title: 'Keeper of the Uncounted',
    barks: ['I stack them by year. I ran out of years.', 'Do not ring the third bell. Do not ring the third bell.',
      'You will be counted eventually. Not by me.'],
    services: ['talk', 'quest'],
  },
  {
    id: 'nine_mask', name: 'The Ninth Contractor', kanji: '九人目', role: 'contractor', region: 'capital', poi: 'capital_tower',
    title: 'She Who Rings',
    barks: ['Nine bells, nine contractors. I am the only one still answering.', 'Yours is small. It will not stay small.',
      'Come back when it has nine tails. Then we will talk about mercy.'],
    services: ['talk', 'quest'],
  },
  {
    id: 'inari_priestess', name: 'Uka-no-Mitama', kanji: 'ウカノミタマ', role: 'priest', region: 'shrine', poi: 'shrine_main',
    title: 'Voice of Inari',
    barks: ['The god says: feed it, and it will carry you.', 'The god also says: it is not a pet. Say it again until you believe it.',
      'Every gate behind you was paid for by somebody. Somebody is you, now.'],
    services: ['shrine', 'talk', 'quest', 'mutate'],
    stock: ['fox_tofu', 'essence_vial', 'ofuda_fire', 'omamori_focus', 'charm_ninetail'],
  },
  {
    id: 'taizo', name: 'Taizō the Drunk', kanji: '酔泰蔵', role: 'hunter', region: 'bamboo', poi: 'bamboo_pavilion',
    title: 'Retired Spearman',
    barks: ['I retired because of my knees. My knees were right.', 'The bamboo tells on you. Every time.',
      'One more cup and I will tell you about the nine.'],
    services: ['talk', 'quest'],
  },
  {
    id: 'chiyo', name: 'Chiyo of the Reeds', kanji: '葦千代', role: 'hunter', region: 'reeds', poi: 'reeds_altar',
    title: 'Reed Runner',
    barks: ['Keep to the stones or the water takes your sandals.', 'Something in the reeds walks upright. Do not wait to find out.',
      'I can get you across. I can also get you back. Not always.'],
    services: ['talk', 'quest'],
  },
  {
    id: 'kitsune_child', name: 'The Fox Child', kanji: '狐の子', role: 'child', region: 'shrine', poi: 'shrine_pool',
    title: '???',
    barks: ['You look tired. The fox says you should sleep more.', 'Mirror pools lie. I do not. Often.',
      'Kon? … Sorry. Force of habit.'],
    services: ['talk', 'quest'],
  },
  {
    id: 'monk_kaizen', name: 'Monk Kaizen', kanji: '戒善', role: 'priest', region: 'graves', poi: 'graves_temple',
    title: 'The Last Monk of Haiji',
    barks: ['The temple fell in. I did not.', 'Naginatas cut devils. They also cut monks. Be careful which is standing in front of you.',
      'Prayer works. Slower than you would like.'],
    services: ['talk', 'quest', 'shrine'],
    stock: ['prayer_beads', 'incense', 'ofuda_bind', 'salt_packet'],
  },
];

export const NPC_BY_ID = Object.fromEntries(NPCS.map((n) => [n.id, n]));

export const ROLE_LABELS = {
  elder: 'Elder', merchant: 'Merchant', smith: 'Smith', priest: 'Priest',
  child: 'Child', hunter: 'Hunter', contractor: 'Contractor', keeper: 'Keeper',
};
