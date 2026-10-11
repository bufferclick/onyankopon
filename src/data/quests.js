/**
 * Quests. Forty-eight of them: the contract's main spine, regional chains,
 * bounties, escorts, trials, deliveries and a handful of things you find by
 * walking into the wrong place.
 *
 * Objective types (see QuestSystem):
 *   kill      { target, count, region? }
 *   collect   { item, count }
 *   reach     { poi, radius? }
 *   talk      { npc }
 *   boss      { target }
 *   survive   { seconds, poi? }
 *   wave      { poi, rounds }
 *   ability   { id, count }
 *   mutation  { stage }
 *   level     { value }
 *   discover  { poi }
 *   deliver   { item, count, npc }
 *   craft     { item }
 *   essence   { count }
 *   parry     { count }
 *   execute   { count }
 */

export const QUESTS = [
  // ══════════════════════════════════════════════════ ACT I — River Village
  {
    id: 'whispers_in_the_reeds', title: 'Whispers in the Reeds', kanji: '葦の囁き', act: 1, region: 'kawa',
    giver: 'haru', chain: 'main', prereq: {},
    blurb: 'Bandits have taken the rice store. Elder Haru wants it back, and wants you to be the one who does it.',
    objectives: [
      { id: 'a', type: 'kill', target: 'bandit', count: 6, region: 'kawa', text: 'Reed bandits put down' },
      { id: 'b', type: 'collect', item: 'rice_ball', count: 3, text: 'Rice recovered' },
      { id: 'c', type: 'talk', npc: 'haru', text: 'Report to Elder Haru' },
    ],
    rewards: { xp: 240, gold: 60, items: [{ id: 'travel_haori', count: 1 }], unlockAbility: null },
    dialogue: {
      offer: 'Six of them. Six. In my father’s time one man walked out with a stick and came back with the store.',
      accept: 'Go on, then. Do it the way the fox wants, not the way I would.',
      progress: 'Are they dead yet? No? Then why are you here?',
      complete: 'You did not enjoy that. Good. That lasts longer than enjoying it.',
    },
  },
  {
    id: 'the_first_bite', title: 'The First Bite', kanji: '初噛み', act: 1, region: 'kawa',
    giver: null, chain: 'main', prereq: { quests: ['whispers_in_the_reeds'] }, autoStart: true,
    blurb: 'The contract wants to be used. Say the word six times and see what happens.',
    objectives: [{ id: 'a', type: 'ability', id2: 'kon', count: 6, ability: 'kon', text: 'Kon used in anger' }],
    rewards: { xp: 300, essence: 2, skillPoint: 1 },
    dialogue: {
      offer: 'The word sits in your throat like a fish bone.',
      complete: 'Your shadow has teeth now. It always did. You simply were not looking.',
    },
  },
  {
    id: 'mios_rice_ball', title: 'Mio’s Rice Ball', kanji: '美緒の御握', act: 1, region: 'kawa',
    giver: 'mio', chain: 'side', prereq: {},
    blurb: 'A child left food by the shrine stones. Something ate it. She wants to know what.',
    objectives: [
      { id: 'a', type: 'reach', poi: 'kawa_well', text: 'Check the well at dusk' },
      { id: 'b', type: 'kill', target: 'kappa', count: 1, text: 'Whatever took it, dealt with' },
      { id: 'c', type: 'talk', npc: 'mio', text: 'Tell Mio the truth' },
    ],
    rewards: { xp: 180, gold: 30, items: [{ id: 'fox_tofu', count: 3 }] },
    dialogue: {
      offer: 'It was gone by morning. The stones were licked clean. Licked.',
      accept: 'You will tell me? Even if it is scary?',
      complete: 'A kappa. …Oh. So I should leave two, then.',
    },
  },
  {
    id: 'the_village_smith', title: 'A Disgrace of a Blade', kanji: '不名誉な刀', act: 1, region: 'kawa',
    giver: 'goro', chain: 'side', prereq: { level: 3 },
    blurb: 'Gorō refuses to let you walk around with that. Bring him iron and pride.',
    objectives: [
      { id: 'a', type: 'collect', item: 'iron_scrap', count: 6, text: 'Iron scrap gathered' },
      { id: 'b', type: 'talk', npc: 'goro', text: 'Take it to the forge' },
    ],
    rewards: { xp: 220, items: [{ id: 'ronin_katana', count: 1 }], gold: 20 },
    dialogue: {
      offer: 'That thing? That is a spoon that gave up. Six scraps and I will make you a knife with ambition.',
      complete: 'There. Sharper than you deserve and heavier than you expect. Do not thank me; sharpen it.',
    },
  },
  {
    id: 'wetstone_tolls', title: 'Wetstone Tolls', kanji: '濡石の駄賃', act: 1, region: 'kawa',
    giver: 'kaede', chain: 'side', prereq: {},
    blurb: 'Kaede pays for bandit ears, and asks no questions about whose they were.',
    objectives: [{ id: 'a', type: 'kill', target: 'bandit', count: 12, region: 'kawa', text: 'Bandits dealt with' }],
    rewards: { xp: 260, gold: 120, items: [{ id: 'charm_merchant', count: 1 }] },
    dialogue: {
      offer: 'Twelve. I will count them. I always count them.',
      complete: 'Good trade. Don’t tell the elder. Actually, tell the elder. It is funnier.',
    },
  },
  {
    id: 'first_blood_parry', title: 'Reading the Blade', kanji: '刃を読む', act: 1, region: 'kawa',
    giver: 'haru', chain: 'tutorial', prereq: { quests: ['the_first_bite'] },
    blurb: 'Guard at the last instant and the world opens up. Practise on the ronin by the bridge.',
    objectives: [
      { id: 'a', type: 'parry', count: 5, text: 'Perfect parries landed' },
      { id: 'b', type: 'execute', count: 2, text: 'Executions finished' },
    ],
    rewards: { xp: 280, skillPoint: 1, gold: 40 },
    dialogue: {
      offer: 'Hit them when they are committed. Not before. Not after. Exactly when they cannot stop.',
      complete: 'You have the timing. Now get the patience. That takes longer.',
    },
  },

  // ══════════════════════════════════════════════════ ACT II — Ashigaru Wood
  {
    id: 'the_hollow_shrine', title: 'The Hollow Shrine', kanji: '空洞社', act: 2, region: 'wood',
    giver: 'shizuka', chain: 'main', prereq: { quests: ['the_first_bite'], level: 6 },
    blurb: 'Something has nested in the shrine’s inner room. Hold the doorway for three waves.',
    objectives: [
      { id: 'a', type: 'reach', poi: 'wood_shrine', text: 'Reach Ashigaru Shrine' },
      { id: 'b', type: 'wave', poi: 'wood_shrine', rounds: 3, text: 'Waves survived' },
      { id: 'c', type: 'talk', npc: 'shizuka', text: 'Speak to Shizuka' },
    ],
    rewards: { xp: 700, gold: 140, essence: 3, items: [{ id: 'omamori_focus', count: 1 }] },
    dialogue: {
      offer: 'Sweep the steps first. Then we will talk about what is in the back room.',
      complete: 'You bled on the steps. I will sweep it. That is the arrangement.',
    },
  },
  {
    id: 'six_bedrolls', title: 'Six Bedrolls, One Pot', kanji: '六つの寝床', act: 2, region: 'wood',
    giver: 'saburo', chain: 'side', prereq: { level: 7 },
    blurb: 'Saburō’s camp is being hunted. Find out by whom, then stop it.',
    objectives: [
      { id: 'a', type: 'reach', poi: 'wood_camp', text: 'Reach the ronin camp' },
      { id: 'b', type: 'kill', target: 'gaki', count: 8, text: 'Hungry ghosts dispersed' },
      { id: 'c', type: 'kill', target: 'archer', count: 4, text: 'Bow hunters silenced' },
      { id: 'd', type: 'talk', npc: 'saburo', text: 'Report to Saburō' },
    ],
    rewards: { xp: 620, gold: 180, items: [{ id: 'ashigaru_naginata', count: 1 }] },
    dialogue: {
      offer: 'Three nights, three men gone. We did not even hear the third one.',
      complete: 'You are welcome to the pot. There is not much in it, but there is a pot.',
    },
  },
  {
    id: 'arrows_and_offerings', title: 'Arrows and Offerings', kanji: '矢と供物', act: 2, region: 'wood',
    giver: 'shizuka', chain: 'side', prereq: { quests: ['the_hollow_shrine'] },
    blurb: 'Ten thousand broken arrows are stacked behind the shrine. Shizuka wants them counted. It is a test.',
    objectives: [
      { id: 'a', type: 'collect', item: 'arrow_bundle', count: 8, text: 'Arrow bundles gathered' },
      { id: 'b', type: 'discover', poi: 'wood_gate', text: 'Find the cedar torii' },
    ],
    rewards: { xp: 480, gold: 90, items: [{ id: 'kitsune_mask', count: 1 }] },
    dialogue: {
      offer: 'Count them. When you are done, tell me the number and I will tell you if you were listening.',
      complete: 'You did not count. Nobody counts. Take the mask anyway — you earned the honesty, not the arithmetic.',
    },
  },
  {
    id: 'the_hollow_cedar', title: 'The Hollow Cedar', kanji: '空洞杉', act: 2, region: 'wood',
    giver: null, chain: 'side', prereq: { level: 10 }, autoStart: true,
    blurb: 'A tree with a door-shaped hole in it. Reasonable people walk past. You are not reasonable.',
    objectives: [
      { id: 'a', type: 'reach', poi: 'wood_cave', text: 'Enter the hollow cedar' },
      { id: 'b', type: 'kill', target: 'gaki', count: 10, text: 'Nest cleared' },
    ],
    rewards: { xp: 540, essence: 4, items: [{ id: 'spectral_dust', count: 6 }] },
    dialogue: {
      offer: 'The hollow is warm. Something in there is breathing, slowly, on purpose.',
      complete: 'It was a person. It was, at some point, several people.',
    },
  },
  {
    id: 'the_watchtower_ledger', title: 'The Watchtower Ledger', kanji: '物見櫓の帳', act: 2, region: 'wood',
    giver: null, chain: 'side', prereq: { level: 9 }, autoStart: true,
    blurb: 'Someone kept records up there. The last entry is unfinished.',
    objectives: [
      { id: 'a', type: 'discover', poi: 'wood_watch', text: 'Climb the old watchtower' },
      { id: 'b', type: 'kill', target: 'naginata_monk', count: 2, text: 'Monks answered for' },
    ],
    rewards: { xp: 460, gold: 110, items: [{ id: 'prayer_beads', count: 1 }] },
    dialogue: { offer: 'The ink is smudged where the writer was interrupted.', complete: 'The last line says: "it came back".' },
  },

  // ══════════════════════════════════════════════════ ACT III — Reed Marches
  {
    id: 'the_drowned_altar', title: 'The Drowned Altar', kanji: '沈んだ祭壇', act: 3, region: 'reeds',
    giver: 'reiko', chain: 'main', prereq: { quests: ['the_hollow_shrine'], level: 12 },
    blurb: 'Offerings keep arriving at a shrine under black water. Reiko wants to know who is delivering them.',
    objectives: [
      { id: 'a', type: 'reach', poi: 'reeds_altar', text: 'Wade to the drowned altar' },
      { id: 'b', type: 'kill', target: 'kappa', count: 5, text: 'Kappa cleared' },
      { id: 'c', type: 'kill', target: 'nure_onna', count: 1, text: 'The deliverer found' },
      { id: 'd', type: 'talk', npc: 'reiko', text: 'Return to Reiko' },
    ],
    rewards: { xp: 1200, gold: 260, essence: 6, items: [{ id: 'kappa_shell', count: 3 }] },
    dialogue: {
      offer: 'Something brings offerings to a shrine nobody can reach. That is devotion or a delivery route.',
      complete: 'She was delivering them herself. For a hundred years. Somebody should have told her it was over.',
    },
  },
  {
    id: 'bitter_medicine', title: 'Bitter Medicine', kanji: '苦い薬', act: 3, region: 'reeds',
    giver: 'reiko', chain: 'side', prereq: { level: 12 },
    blurb: 'Reiko needs ingredients, and every one of them is currently inside something.',
    objectives: [
      { id: 'a', type: 'collect', item: 'venom_gland', count: 3, text: 'Venom glands harvested' },
      { id: 'b', type: 'collect', item: 'kappa_shell', count: 2, text: 'Kappa shells gathered' },
    ],
    rewards: { xp: 560, items: [{ id: 'antidote', count: 6 }, { id: 'bitter_tea', count: 3 }], gold: 90 },
    dialogue: { offer: 'If it bites you on the way back, that is your ingredient now.', complete: 'Drink this. Do not smell it first.' },
  },
  {
    id: 'across_the_marches', title: 'Across the Marches', kanji: '沼渡り', act: 3, region: 'reeds',
    giver: 'chiyo', chain: 'escort', prereq: { level: 14 },
    blurb: 'Chiyo will guide you across — if you keep the things in the reeds off her back.',
    objectives: [
      { id: 'a', type: 'talk', npc: 'chiyo', text: 'Meet Chiyo at the altar' },
      { id: 'b', type: 'reach', poi: 'reeds_pier', text: 'Escort Chiyo to the sunken pier' },
      { id: 'c', type: 'survive', seconds: 90, text: 'Hold the pier for 90 seconds' },
    ],
    rewards: { xp: 900, gold: 200, items: [{ id: 'charm_swift', count: 1 }] },
    dialogue: { offer: 'Keep to the stones. Keep behind me. Keep quiet. In that order.', complete: 'You kept to the stones. Barely. Fine. Barely is a kind of keeping.' },
  },
  {
    id: 'the_sunken_pier', title: 'What the Pier Holds', kanji: '桟橋の荷', act: 3, region: 'reeds',
    giver: null, chain: 'side', prereq: { quests: ['across_the_marches'] }, autoStart: true,
    blurb: 'Half the pier went under with a crate. Crates are always interesting.',
    objectives: [{ id: 'a', type: 'collect', item: 'river_pearl', count: 4, text: 'River pearls recovered' }],
    rewards: { xp: 400, gold: 220, items: [{ id: 'spirit_water', count: 2 }] },
  },

  // ══════════════════════════════════════════════════ ACT IV — Bamboo Sea
  {
    id: 'whispering_grove', title: 'The Whispering Grove', kanji: '囁く竹林', act: 4, region: 'bamboo',
    giver: 'taizo', chain: 'main', prereq: { quests: ['the_drowned_altar'], level: 18 },
    blurb: 'The bamboo says your name. Taizō wants to know how it learned it, and suggests asking loudly.',
    objectives: [
      { id: 'a', type: 'reach', poi: 'bamboo_grove', text: 'Enter the whispering grove' },
      { id: 'b', type: 'kill', target: 'jorogumo', count: 1, text: 'The listener silenced' },
      { id: 'c', type: 'discover', poi: 'bamboo_pavilion', text: 'Find the moon pavilion' },
    ],
    rewards: { xp: 1600, gold: 340, essence: 8, items: [{ id: 'spider_silk', count: 4 }] },
    dialogue: {
      offer: 'It said my name. Then my mother’s. Then something I have not told anybody.',
      complete: 'It was the spider. She listens for a living and sells what she hears. Still does, in a sense.',
    },
  },
  {
    id: 'spear_encampment', title: 'The Spear Encampment', kanji: '槍の陣', act: 4, region: 'bamboo',
    giver: null, chain: 'side', prereq: { level: 20 }, autoStart: true,
    blurb: 'Disciplined soldiers in a bamboo clearing. They have been given an order about you.',
    objectives: [
      { id: 'a', type: 'kill', target: 'ashigaru_spear', count: 8, text: 'Spears broken' },
      { id: 'b', type: 'kill', target: 'archer', count: 5, text: 'Archers answered' },
    ],
    rewards: { xp: 1100, gold: 280, items: [{ id: 'spear_head', count: 5 }] },
  },
  {
    id: 'moon_viewing', title: 'Moon Viewing', kanji: '月見', act: 4, region: 'bamboo',
    giver: 'taizo', chain: 'side', prereq: { quests: ['whispering_grove'] },
    blurb: 'Sit with a retired spearman, drink, and watch the moon come up. Nothing attacks. That is the quest.',
    objectives: [
      { id: 'a', type: 'survive', seconds: 120, text: 'Sat with Taizō until the moon rose' },
      { id: 'b', type: 'talk', npc: 'taizo', text: 'Heard him out' },
    ],
    rewards: { xp: 600, items: [{ id: 'sake', count: 5 }], flag: 'taizo_story' },
    dialogue: {
      offer: 'Sit. The moon will come up whether you deserve it or not. That is what I like about it.',
      complete: 'Nine contractors. Nine bells. I was not one of them. I was the man who carried the bells.',
    },
  },

  // ══════════════════════════════════════════════════ ACT V — Yuki Pass
  {
    id: 'the_pass_keeper', title: 'The Pass Keeper’s Ledger', kanji: '峠番の帳', act: 5, region: 'yuki',
    giver: 'yuki_keeper', chain: 'main', prereq: { quests: ['whispering_grove'], level: 24 },
    blurb: 'Nine people crossed today. Nine people always cross. Gen wants you to check the count.',
    objectives: [
      { id: 'a', type: 'talk', npc: 'yuki_keeper', text: 'Read the ledger' },
      { id: 'b', type: 'kill', target: 'namahage', count: 6, text: 'Namahage turned back' },
      { id: 'c', type: 'discover', poi: 'yuki_statue', text: 'Find the Jizō in the snow' },
      { id: 'd', type: 'talk', npc: 'yuki_keeper', text: 'Report the count' },
    ],
    rewards: { xp: 2400, gold: 520, essence: 14, items: [{ id: 'frost_shard', count: 6 }, { id: 'pass_ledger', count: 1 }] },
    dialogue: {
      offer: 'Nine crossed. Nine always cross. I have written it for thirty years and I do not know why.',
      complete: 'You counted eight. …Eight. In thirty years. Sit down, I am pouring.',
    },
  },
  {
    id: 'the_snow_ring', title: 'The Namahage Ring', kanji: 'なまはげの輪', act: 5, region: 'yuki',
    giver: null, chain: 'trial', prereq: { level: 26 }, autoStart: true,
    blurb: 'A circle of packed snow with a lot of red in it. Stand in the middle and wait.',
    objectives: [{ id: 'a', type: 'wave', poi: 'yuki_arena', rounds: 4, text: 'Rounds survived' }],
    rewards: { xp: 2000, gold: 400, essence: 10, items: [{ id: 'oni_plate', count: 1 }] },
  },
  {
    id: 'the_red_bib', title: 'The Red Bib', kanji: '赤い前掛け', act: 5, region: 'yuki',
    giver: null, chain: 'side', prereq: { quests: ['the_pass_keeper'] }, autoStart: true,
    blurb: 'Someone dresses the snow Jizō in a red bib every winter. Find out who, and whether they are still able.',
    objectives: [
      { id: 'a', type: 'reach', poi: 'yuki_statue', text: 'Examine the Jizō' },
      { id: 'b', type: 'collect', item: 'mourning_cloth', count: 1, text: 'Cloth for a new bib' },
      { id: 'c', type: 'reach', poi: 'yuki_statue', text: 'Tie it on' },
    ],
    rewards: { xp: 900, items: [{ id: 'omamori_health', count: 1 }], flag: 'jizo_bib' },
  },

  // ══════════════════════════════════════════════════ ACT VI — Haiji Graves
  {
    id: 'the_third_bell', title: 'The Third Bell', kanji: '三つ目の鐘', act: 6, region: 'graves',
    giver: 'ossuary_keeper', chain: 'main', prereq: { quests: ['the_pass_keeper'], level: 30 },
    blurb: 'Ring the third bell three times. The Bone-Keeper says do not. He is right, and it must be done.',
    objectives: [
      { id: 'a', type: 'reach', poi: 'graves_bell', text: 'Find the third bell' },
      { id: 'b', type: 'survive', seconds: 150, text: 'Survive what answers' },
      { id: 'c', type: 'boss', target: 'gashadokuro', text: 'The Uncounted put down' },
      { id: 'd', type: 'talk', npc: 'ossuary_keeper', text: 'Report to the Bone-Keeper' },
    ],
    rewards: { xp: 5200, gold: 1100, essence: 30, skillPoint: 2, items: [{ id: 'great_skull', count: 1 }] },
    dialogue: {
      offer: 'Do not ring the third bell. I am telling you anyway because you will.',
      complete: 'You rang it. Of course you rang it. Hand me the skull, I will find it a drawer.',
    },
  },
  {
    id: 'the_last_monk', title: 'The Last Monk of Haiji', kanji: '廃寺の最後の僧', act: 6, region: 'graves',
    giver: 'monk_kaizen', chain: 'side', prereq: { level: 30 },
    blurb: 'Kaizen wants the temple swept, the sutras read, and the dead counted. He will settle for two of three.',
    objectives: [
      { id: 'a', type: 'kill', target: 'hanged_one', count: 6, text: 'Grounds cleared' },
      { id: 'b', type: 'collect', item: 'bone_shard', count: 20, text: 'Bones gathered for counting' },
      { id: 'c', type: 'talk', npc: 'monk_kaizen', text: 'Return to Kaizen' },
    ],
    rewards: { xp: 2200, gold: 480, items: [{ id: 'hannya_mask', count: 1 }] },
    dialogue: {
      offer: 'The roof fell in. I did not. One of us is more stubborn than the other, and it is not the roof.',
      complete: 'Twenty. There are ten thousand. Bring me more tomorrow, or bring me a shovel.',
    },
  },
  {
    id: 'ubume_bundle', title: 'The Bundle', kanji: '抱き荷', act: 6, region: 'graves',
    giver: null, chain: 'side', prereq: { level: 32 }, autoStart: true,
    blurb: 'A woman by the ossuary asks you to hold something. It is warm. It is getting heavier.',
    objectives: [
      { id: 'a', type: 'kill', target: 'ubume', count: 3, text: 'Mothers answered' },
      { id: 'b', type: 'collect', item: 'mourning_cloth', count: 2, text: 'Cloth recovered' },
    ],
    rewards: { xp: 1800, items: [{ id: 'spirit_silk', count: 3 }], flag: 'held_bundle' },
  },
  {
    id: 'bone_yard_trial', title: 'The Bone Yard', kanji: '骨庭', act: 6, region: 'graves',
    giver: null, chain: 'trial', prereq: { level: 34 }, autoStart: true,
    blurb: 'Stand in the yard. Do not leave the yard. That is the whole contract.',
    objectives: [{ id: 'a', type: 'wave', poi: 'graves_arena', rounds: 5, text: 'Rounds survived' }],
    rewards: { xp: 3200, essence: 18, items: [{ id: 'bone_marrow', count: 6 }] },
  },

  // ══════════════════════════════════════════════════ ACT VII — Oni Ridge
  {
    id: 'nine_tails_of_ash', title: 'Nine Tails of Ash', kanji: '灰の九尾', act: 7, region: 'ridge',
    giver: 'tengu_master', chain: 'main', prereq: { quests: ['the_third_bell'], level: 38 },
    blurb: 'Another contractor walks the ridge, and she has been at this longer than you. Kurama thinks you should meet.',
    objectives: [
      { id: 'a', type: 'reach', poi: 'ridge_peak', text: 'Climb to Shuten’s Seat' },
      { id: 'b', type: 'boss', target: 'aka_kitsune', text: 'The Red Rival answered' },
      { id: 'c', type: 'talk', npc: 'tengu_master', text: 'Report to Kurama' },
    ],
    rewards: { xp: 9000, gold: 2000, essence: 60, skillPoint: 2, items: [{ id: 'rival_fang', count: 1 }, { id: 'fox_pelt_red', count: 2 }] },
    dialogue: {
      offer: 'She signed before you. Her fox has seven tails. Yours has what, three? Run.',
      complete: 'You came back down. Most do not. Take the fang — she will want it, and wanting is a kind of company.',
    },
  },
  {
    id: 'shuten_standard', title: 'Shuten’s Standard', kanji: '酒呑の旗', act: 7, region: 'ridge',
    giver: 'tengu_master', chain: 'main', prereq: { quests: ['nine_tails_of_ash'], level: 44 },
    blurb: 'The general drinks, laughs, and takes a province. Kurama would like the schedule disrupted.',
    objectives: [
      { id: 'a', type: 'kill', target: 'oni_brute', count: 12, text: 'Oni vanguard broken' },
      { id: 'b', type: 'boss', target: 'oni_general', text: 'Shuten answered' },
    ],
    rewards: { xp: 14000, gold: 3200, essence: 90, skillPoint: 3, items: [{ id: 'shuten_horn', count: 1 }] },
    dialogue: {
      offer: 'He has taken four provinces and two years. He is not clever. He is simply still standing.',
      complete: 'A province is a big thing to take back. Start with the horn. Then the ledger. Then the story.',
    },
  },
  {
    id: 'the_ash_arena', title: 'The Ash Arena', kanji: '灰の円', act: 7, region: 'ridge',
    giver: null, chain: 'trial', prereq: { level: 40 }, autoStart: true,
    blurb: 'The ground here is glass. Something made it glass. Stand on it and find out what.',
    objectives: [{ id: 'a', type: 'wave', poi: 'ridge_arena', rounds: 6, text: 'Rounds survived' }],
    rewards: { xp: 6000, essence: 30, items: [{ id: 'oni_iron', count: 8 }] },
  },
  {
    id: 'failed_contractors', title: 'Failed Contractors', kanji: '落伍者', act: 7, region: 'ridge',
    giver: null, chain: 'side', prereq: { level: 42 }, autoStart: true,
    blurb: 'They also wanted to be the strongest. Walk among them and learn the price list.',
    objectives: [
      { id: 'a', type: 'kill', target: 'contractor_wraith', count: 10, text: 'Wraiths released' },
      { id: 'b', type: 'collect', item: 'cracked_mask', count: 3, text: 'Masks collected' },
    ],
    rewards: { xp: 5200, essence: 25, items: [{ id: 'charm_ninetail', count: 1 }] },
  },
  {
    id: 'the_forge_that_burns', title: 'The Forge That Never Cooled', kanji: '冷えぬ鍛冶', act: 7, region: 'ridge',
    giver: null, chain: 'side', prereq: { level: 40 }, autoStart: true,
    blurb: 'A forge still hot with no hand to feed it. The metal inside has opinions.',
    objectives: [
      { id: 'a', type: 'collect', item: 'oni_iron', count: 6, text: 'Oni iron recovered' },
      { id: 'b', type: 'craft', item: 'ninetail_cleaver', text: 'Forge something worthy' },
    ],
    rewards: { xp: 4000, gold: 900, items: [{ id: 'oni_iron', count: 4 }] },
  },

  // ══════════════════════════════════════════════════ ACT VIII — The Capital
  {
    id: 'the_god_in_the_rice', title: 'The God in the Rice', kanji: '稲の神', act: 8, region: 'capital',
    giver: 'inari_priestess', chain: 'main', prereq: { quests: ['shuten_standard'], level: 50 },
    blurb: 'Inari wants an offering, and Inari wants it carried through the city without setting it down.',
    objectives: [
      { id: 'a', type: 'talk', npc: 'inari_priestess', text: 'Receive the offering' },
      { id: 'b', type: 'reach', poi: 'capital_tower', text: 'Carry it to the pagoda' },
      { id: 'c', type: 'kill', target: 'yurei', count: 15, text: 'Cleared the way' },
      { id: 'd', type: 'discover', poi: 'capital_market', text: 'Passed the quiet market' },
    ],
    rewards: { xp: 20000, gold: 4000, essence: 120, skillPoint: 3, items: [{ id: 'inari_blessing', count: 1 }] },
    dialogue: {
      offer: 'Carry it. Do not set it down. If they make you set it down, come back and tell me, and we will begin again.',
      complete: 'You did not set it down. Do you know what that makes you? It makes you the sort of thing that carries gods.',
    },
  },
  {
    id: 'the_last_contract', title: 'The Last Contract', kanji: '最後の契約', act: 9, region: 'capital',
    giver: 'nine_mask', chain: 'main', final: true, prereq: { quests: ['the_god_in_the_rice'], level: 60 },
    blurb: 'Nine bells. Nine contractors. She is the only one still answering, and she would like to stop.',
    objectives: [
      { id: 'a', type: 'talk', npc: 'nine_mask', text: 'Meet the Ninth Contractor' },
      { id: 'b', type: 'boss', target: 'nine_bells', text: 'The Ninth Bell silenced' },
      { id: 'c', type: 'mutation', stage: 7, text: 'The contract completed' },
    ],
    rewards: { xp: 40000, gold: 10000, essence: 300, skillPoint: 5, items: [{ id: 'contract_scroll', count: 1 }],
      flag: 'ending', title: 'The Devil’s Contractor' },
    dialogue: {
      offer: 'Nine of us signed. Nine bells, nine names, nine people the fox ate from the inside. I am the last page.',
      complete: 'Then it is yours. All of it. The tails, the bells, the debt. Say the word and see who answers.',
    },
  },
  {
    id: 'bell_square', title: 'Bell Square', kanji: '鐘広場', act: 8, region: 'capital',
    giver: null, chain: 'trial', prereq: { level: 52 }, autoStart: true,
    blurb: 'The largest open space in the city, and the one everybody avoids. Now you know why.',
    objectives: [{ id: 'a', type: 'wave', poi: 'capital_arena', rounds: 7, text: 'Rounds survived' }],
    rewards: { xp: 12000, essence: 60, items: [{ id: 'ninth_bell_fragment', count: 2 }] },
  },
  {
    id: 'quiet_market_trade', title: 'Trade in Writing', kanji: '文商い', act: 8, region: 'capital',
    giver: null, chain: 'side', prereq: { level: 50 }, autoStart: true,
    blurb: 'Nobody in this market speaks above a whisper. Everybody wants something.',
    objectives: [
      { id: 'a', type: 'collect', item: 'spirit_silk', count: 5, text: 'Silk sourced' },
      { id: 'b', type: 'deliver', item: 'spirit_silk', count: 5, npc: 'nine_mask', text: 'Delivered to the Ninth' },
    ],
    rewards: { xp: 8000, gold: 1800, items: [{ id: 'contractor_hood', count: 1 }] },
  },

  // ══════════════════════════════════════════════════ Fox / mutation chain
  {
    id: 'feed_the_fox', title: 'Feed the Fox', kanji: '狐に餌', act: 1, region: 'shrine',
    giver: 'inari_priestess', chain: 'fox', prereq: {},
    blurb: 'A starving familiar is a useless familiar. Bring it tofu and watch what happens.',
    objectives: [
      { id: 'a', type: 'collect', item: 'fox_tofu', count: 3, text: 'Fried tofu gathered' },
      { id: 'b', type: 'reach', poi: 'shrine_main', text: 'Offer it at the sanctum' },
    ],
    rewards: { xp: 300, essence: 3, items: [{ id: 'fox_tofu', count: 5 }] },
    dialogue: {
      offer: 'Fried tofu. Nothing else. Whatever it asks for later, it is lying.',
      complete: 'It ate from your hand. It would also eat your hand. Both can be true at once.',
    },
  },
  {
    id: 'fox_first_mutation', title: 'The First Moult', kanji: '初脱皮', act: 2, region: 'shrine',
    giver: 'inari_priestess', chain: 'fox', prereq: { quests: ['feed_the_fox'], level: 8 },
    blurb: 'Your fox is ready to change. The sanctum can pay for it, if you bring the essence.',
    objectives: [
      { id: 'a', type: 'essence', count: 4, text: 'Contract essence gathered' },
      { id: 'b', type: 'mutation', stage: 1, text: 'Fox mutated to Yako' },
    ],
    rewards: { xp: 900, skillPoint: 1 },
    dialogue: {
      offer: 'It will hurt. Not you. It.',
      complete: 'Look at it. Still yours. For now, look at it.',
    },
  },
  {
    id: 'mirror_pool', title: 'The Mirror Pool', kanji: '鏡池', act: 3, region: 'shrine',
    giver: 'kitsune_child', chain: 'fox', prereq: { level: 16 },
    blurb: 'A child at the pool says look in it. You will not see yourself.',
    objectives: [
      { id: 'a', type: 'reach', poi: 'shrine_pool', text: 'Look into the mirror pool' },
      { id: 'b', type: 'ability', ability: 'kitsunebi', count: 10, text: 'Fox-fire cast' },
    ],
    rewards: { xp: 1100, essence: 8, items: [{ id: 'charm_blood', count: 1 }] },
    dialogue: {
      offer: 'Everyone looks. Nobody likes what they see. You will like it less than most.',
      complete: 'You saw the fox. The fox saw you. It is still deciding.',
    },
  },
  {
    id: 'thousand_gates', title: 'The Thousand Gates', kanji: '千本鳥居', act: 4, region: 'shrine',
    giver: 'inari_priestess', chain: 'fox', prereq: { level: 22 },
    blurb: 'Every gate behind you was paid for by somebody. Now it is your turn to donate.',
    objectives: [
      { id: 'a', type: 'collect', item: 'gold_coin', count: 0, text: '—' },
      { id: 'a2', type: 'essence', count: 20, text: 'Essence tithed' },
      { id: 'b', type: 'discover', poi: 'shrine_torii_path', text: 'Walk the thousand gates' },
    ],
    rewards: { xp: 4000, skillPoint: 2, items: [{ id: 'omamori_focus', count: 1 }] },
    dialogue: {
      offer: 'A gate costs a year of luck or a year of life. Nobody has ever been told which.',
      complete: 'Yours is the nine hundred and first. There is room for more.',
    },
  },
  {
    id: 'the_empty_dojo', title: 'The Empty Dojo', kanji: '空道場', act: 5, region: 'shrine',
    giver: null, chain: 'fox', prereq: { level: 28 }, autoStart: true,
    blurb: 'Sweep the floor. Someone will come. Someone always comes.',
    objectives: [
      { id: 'a', type: 'discover', poi: 'shrine_dojo', text: 'Swept the dojo floor' },
      { id: 'b', type: 'parry', count: 20, text: 'Perfect parries in the dojo' },
      { id: 'c', type: 'execute', count: 10, text: 'Executions in the dojo' },
    ],
    rewards: { xp: 5000, skillPoint: 2, essence: 20, items: [{ id: 'spirit_kiseru', count: 1 }] },
  },

  // ══════════════════════════════════════════════════ Bounties & repeatables
  {
    id: 'bounty_ronin', title: 'Bounty: The Masterless', kanji: '賞金首・浪人', act: 2, region: 'wood',
    giver: 'kaede', chain: 'bounty', repeatable: true, prereq: { level: 6 },
    blurb: 'Kaede has a board. Kaede’s board has your name on the bottom.',
    objectives: [{ id: 'a', type: 'kill', target: 'ronin', count: 10, text: 'Ronin cut down' }],
    rewards: { xp: 700, gold: 240 },
  },
  {
    id: 'bounty_spears', title: 'Bounty: Spear and Bow', kanji: '賞金首・槍弓', act: 4, region: 'bamboo',
    giver: 'kaede', chain: 'bounty', repeatable: true, prereq: { level: 20 },
    blurb: 'The garrison has posted a price on whoever has been thinning it.',
    objectives: [
      { id: 'a', type: 'kill', target: 'ashigaru_spear', count: 10, text: 'Spearmen broken' },
      { id: 'b', type: 'kill', target: 'archer', count: 6, text: 'Archers broken' },
    ],
    rewards: { xp: 2400, gold: 800 },
  },
  {
    id: 'bounty_oni', title: 'Bounty: Horns and Ash', kanji: '賞金首・鬼角', act: 7, region: 'ridge',
    giver: 'yuki_keeper', chain: 'bounty', repeatable: true, prereq: { level: 40 },
    blurb: 'Gen will pay for horns. He will not say what he does with them.',
    objectives: [{ id: 'a', type: 'kill', target: 'oni_brute', count: 8, text: 'Oni culled' }],
    rewards: { xp: 6000, gold: 1800, essence: 20 },
  },
  {
    id: 'bounty_wraiths', title: 'Bounty: What You Will Become', kanji: '賞金首・未来の汝', act: 8, region: 'capital',
    giver: 'nine_mask', chain: 'bounty', repeatable: true, prereq: { level: 52 },
    blurb: 'She sends you to kill the thing you are becoming. It is either mercy or a warning.',
    objectives: [{ id: 'a', type: 'kill', target: 'contractor_wraith', count: 12, text: 'Wraiths released' }],
    rewards: { xp: 12000, gold: 3000, essence: 40 },
  },
  {
    id: 'the_fox_child', title: 'The Fox Child', kanji: '狐の子', act: 3, region: 'shrine',
    giver: 'kitsune_child', chain: 'side', prereq: { level: 18 },
    blurb: 'A child who knows your fox’s name and will not explain how.',
    objectives: [
      { id: 'a', type: 'talk', npc: 'kitsune_child', text: 'Spoke to the fox child' },
      { id: 'b', type: 'ability', ability: 'kon', count: 25, text: 'Kon called' },
      { id: 'c', type: 'talk', npc: 'kitsune_child', text: 'Returned to the pool' },
    ],
    rewards: { xp: 2600, essence: 15, skillPoint: 1, flag: 'fox_child' },
    dialogue: {
      offer: 'Kon? …Sorry. Force of habit.',
      complete: 'You say it the same way she did. The one before you. And the one before her.',
    },
  },
  {
    id: 'collector_of_names', title: 'The Collector of Names', kanji: '名集め', act: 5, region: 'graves',
    giver: 'ossuary_keeper', chain: 'side', prereq: { level: 28 },
    blurb: 'Ten thousand stones, none of them named. The Bone-Keeper wants a start.',
    objectives: [
      { id: 'a', type: 'collect', item: 'bone_shard', count: 30, text: 'Bones gathered' },
      { id: 'b', type: 'kill', target: 'yurei', count: 10, text: 'Names taken from ghosts' },
    ],
    rewards: { xp: 3400, essence: 18, items: [{ id: 'charm_blood', count: 1 }] },
  },
  {
    id: 'the_nine_crossroads', title: 'The Nine Crossroads', kanji: '九岐路', act: 4, region: 'wood',
    giver: null, chain: 'side', prereq: { level: 18 }, autoStart: true,
    blurb: 'Nine paths leave. Eight come back. Walk all nine and count carefully.',
    objectives: [
      { id: 'a', type: 'discover', poi: 'mark_cross', text: 'Stood at the nine crossroads' },
      { id: 'b', type: 'survive', seconds: 180, text: 'Survived the ninth path' },
    ],
    rewards: { xp: 1800, essence: 10, items: [{ id: 'ofuda_bind', count: 3 }] },
  },
  {
    id: 'contractors_cairn', title: 'The Contractor’s Cairn', kanji: '契約者の塚', act: 5, region: 'bamboo',
    giver: null, chain: 'side', prereq: { level: 26 }, autoStart: true,
    blurb: 'Stones left by people who made the same mistake you did. Add yours.',
    objectives: [{ id: 'a', type: 'discover', poi: 'mark_cairn', text: 'Found the cairn' }],
    rewards: { xp: 1200, essence: 6, flag: 'cairn' },
  },
  {
    id: 'north_road_marker', title: 'Facing Away', kanji: '背を向けて', act: 5, region: 'yuki',
    giver: null, chain: 'side', prereq: { level: 24 }, autoStart: true,
    blurb: 'A fox scratched into stone, facing away from the road. Somebody did that on purpose.',
    objectives: [
      { id: 'a', type: 'discover', poi: 'mark_north', text: 'Found the north marker' },
      { id: 'b', type: 'discover', poi: 'mark_east', text: 'Found the east marker' },
    ],
    rewards: { xp: 1600, essence: 8 },
  },
  {
    id: 'the_bell_hammer', title: 'The Bell Hammer', kanji: '撞木', act: 8, region: 'capital',
    giver: 'nine_mask', chain: 'side', prereq: { level: 48 },
    blurb: 'For ringing bells that should probably stay unrung. She insists.',
    objectives: [
      { id: 'a', type: 'collect', item: 'bell_hammer', count: 1, text: 'Bell hammer recovered' },
      { id: 'b', type: 'reach', poi: 'capital_tower', text: 'Take it to the pagoda' },
    ],
    rewards: { xp: 7000, items: [{ id: 'bell_hammer', count: 1 }], flag: 'has_bell_hammer' },
  },
  {
    id: 'salt_and_sandals', title: 'Salt and Sandals', kanji: '塩と草鞋', act: 1, region: 'kawa',
    giver: null, chain: 'side', prereq: {}, autoStart: true,
    blurb: 'Scatter salt at the bridge and see what refuses to cross. Nothing more complicated than that.',
    objectives: [{ id: 'a', type: 'reach', poi: 'kawa_bridge', text: 'Salted the bridge' }],
    rewards: { xp: 200, items: [{ id: 'salt_packet', count: 4 }] },
  },
];

export const QUEST_BY_ID = Object.fromEntries(QUESTS.map((q) => [q.id, q]));
export const MAIN_QUESTS = QUESTS.filter((q) => q.chain === 'main');
export const BOUNTIES = QUESTS.filter((q) => q.chain === 'bounty');

export const CHAIN_LABELS = {
  main: 'Contract', side: 'Side', bounty: 'Bounty', fox: 'Fox', trial: 'Trial', escort: 'Escort', tutorial: 'Teaching',
};

/** True when every prerequisite is satisfied. */
export function questAvailable(quest, state) {
  const p = quest.prereq || {};
  if (p.level && (state.level || 1) < p.level) return false;
  if (p.mutation && (state.mutationStage || 0) < p.mutation) return false;
  for (const q of p.quests || []) if (!state.completedQuests?.includes(q)) return false;
  return true;
}

/** Human-readable objective progress, e.g. "Bandits dealt with 4/10". */
export function objectiveText(obj, progress) {
  const goal = obj.count ?? obj.rounds ?? obj.stage ?? 1;
  const have = Math.min(progress || 0, goal);
  const need = obj.count ?? obj.rounds ?? obj.stage ?? 1;
  const base = obj.text || obj.type;
  if (obj.type === 'reach' || obj.type === 'talk' || obj.type === 'discover' || obj.type === 'craft' || obj.type === 'boss') {
    return `${base}`;
  }
  if (obj.type === 'survive') return `${base} (${Math.floor(have)}s / ${need}s)`;
  if (obj.type === 'mutation') return `${base}`;
  return `${base} ${have}/${need}`;
}
