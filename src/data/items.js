/**
 * Items. Weapons carry their own handling (speed, reach, crit bias); armour and
 * charms feed the same modifier pipeline as skill nodes; materials exist to make
 * the forge worth walking to.
 *
 * rarity: common | fine | rare | relic | mythic
 */

export const RARITY = {
  common: { label: 'Common', color: '#c8c0b0', weight: 60 },
  fine: { label: 'Fine', color: '#8fd18a', weight: 25 },
  rare: { label: 'Rare', color: '#6fb7d8', weight: 11 },
  relic: { label: 'Relic', color: '#d08aff', weight: 3.4 },
  mythic: { label: 'Mythic', color: '#ffb45a', weight: 0.6 },
};

export const ITEMS = [
  // ─────────────────────────────────────────────────────────── weapons
  { id: 'rusty_katana', name: 'Rusty Katana', kanji: '錆刀', type: 'weapon', rarity: 'common', value: 40,
    desc: 'Pitted, blunt, and honest. It has killed before and will again.',
    weapon: { power: 9, speed: 1.0, reach: 2.4, crit: 0.02, poise: 6, type: 'slash' }, icon: 'katana' },
  { id: 'ronin_katana', name: 'Ronin’s Katana', kanji: '浪人刀', type: 'weapon', rarity: 'fine', value: 180,
    desc: 'Balanced for a man who expected to fight every day and did.',
    weapon: { power: 16, speed: 1.05, reach: 2.5, crit: 0.05, poise: 8, type: 'slash' }, icon: 'katana' },
  { id: 'ashigaru_naginata', name: 'Ashigaru Naginata', kanji: '足軽薙刀', type: 'weapon', rarity: 'fine', value: 220,
    desc: 'Reach is a kind of mercy, but only for the one holding it.',
    weapon: { power: 19, speed: 0.88, reach: 3.2, crit: 0.03, poise: 14, type: 'slash' }, icon: 'naginata' },
  { id: 'fox_fang', name: 'Fox-Fang Blade', kanji: '狐牙刀', type: 'weapon', rarity: 'rare', value: 520,
    desc: 'Pulled from a fox that had been a sword for longer than it had been a fox.',
    weapon: { power: 26, speed: 1.12, reach: 2.6, crit: 0.09, poise: 10, type: 'slash',
      onHit: { status: 'bleed', chance: 0.25 } }, icon: 'katana',
    craft: { station: 'forge', materials: { katana_shard: 4, fox_pelt_red: 1, iron_ore: 6 } } },
  { id: 'inari_sheaf', name: 'Inari’s Sheaf', kanji: '稲荷の束', type: 'weapon', rarity: 'relic', value: 1400,
    desc: 'A rice sheaf that cuts. It is heavier than it looks and lighter than it should be.',
    weapon: { power: 38, speed: 1.0, reach: 2.8, crit: 0.12, poise: 18, type: 'slash',
      onHit: { status: 'rend', chance: 0.3 }, spirit: 0.15 }, icon: 'katana',
    craft: { station: 'forge', materials: { inari_blessing: 1, fox_pelt_red: 2, spirit_silk: 3 } } },
  { id: 'ninetail_cleaver', name: 'Nine-Tail Cleaver', kanji: '九尾鉈', type: 'weapon', rarity: 'mythic', value: 4200,
    desc: 'Too big to be a sword and too sharp to be a tool. Both of those are the point.',
    weapon: { power: 62, speed: 0.78, reach: 3.0, crit: 0.08, poise: 40, type: 'slash',
      onHit: { status: 'rend', chance: 0.5 }, spirit: 0.2 }, icon: 'cleaver',
    craft: { station: 'forge', materials: { shuten_horn: 1, oni_iron: 4, rival_fang: 1 } } },
  { id: 'bell_ringer', name: 'The Bell-Ringer', kanji: '鳴鐘', type: 'weapon', rarity: 'mythic', value: 5000,
    desc: 'A naginata with nine rings. Each ring knows a name and says it when you cut.',
    weapon: { power: 55, speed: 0.95, reach: 3.6, crit: 0.18, poise: 22, type: 'slash',
      onHit: { status: 'curse', chance: 0.35 }, spirit: 0.35 }, icon: 'naginata',
    craft: { station: 'forge', materials: { ninth_bell_fragment: 3, contractor_hood: 1, spirit_silk: 6 } } },
  { id: 'spirit_kiseru', name: 'Spirit Kiseru', kanji: '霊煙管', type: 'weapon', rarity: 'rare', value: 480,
    desc: 'A pipe. The smoke bites harder than the metal does.',
    weapon: { power: 18, speed: 1.25, reach: 1.9, crit: 0.14, poise: 4, type: 'pierce', spirit: 0.4 }, icon: 'kiseru' },

  // ──────────────────────────────────────────────────────────── armour
  { id: 'straw_hat', name: 'Straw Hat', kanji: '菅笠', type: 'armor', slot: 'head', rarity: 'common', value: 30,
    desc: 'Keeps the rain off. Keeps your face hidden, which is worth more.',
    mods: { statAdd: { defense: 2 } }, icon: 'hat' },
  { id: 'travel_haori', name: 'Traveller’s Haori', kanji: '旅羽織', type: 'armor', slot: 'body', rarity: 'common', value: 60,
    desc: 'Indigo, patched, and slept in more often than not.',
    mods: { statAdd: { defense: 5, maxStamina: 8 } }, icon: 'haori' },
  { id: 'ashigaru_armor', name: 'Ashigaru Dō', kanji: '足軽胴', type: 'armor', slot: 'body', rarity: 'fine', value: 260,
    desc: 'Lacquered plates, cheap rivets, good coverage.',
    mods: { statAdd: { defense: 14, maxHealth: 20 } }, icon: 'haori' },
  { id: 'kitsune_mask', name: 'Kitsune Mask', kanji: '狐面', type: 'armor', slot: 'head', rarity: 'rare', value: 540,
    desc: 'Worn at the fox dances. After a while you stop taking it off.',
    mods: { statAdd: { spiritPower: 8, defense: 4 }, statMul: { konDamage: 0.12 } }, icon: 'mask' },
  { id: 'hannya_mask', name: 'Hannya Mask', kanji: '般若面', type: 'armor', slot: 'head', rarity: 'relic', value: 1100,
    desc: 'A woman’s face caught halfway into becoming a devil. It is still becoming.',
    mods: { statAdd: { spiritPower: 16, defense: 6 }, statMul: { statusPower: 0.2 } }, icon: 'mask' },
  { id: 'oni_plate', name: 'Oni Plate', kanji: '鬼甲', type: 'armor', slot: 'body', rarity: 'relic', value: 1600,
    desc: 'Made from an oni that made it clear this was not a gift.',
    mods: { statAdd: { defense: 30, maxHealth: 70, poise: 40 }, statMul: { moveSpeed: -0.06 } }, icon: 'haori',
    craft: { station: 'forge', materials: { oni_horn: 3, oni_iron: 4, boar_hide: 2 } } },
  { id: 'contractor_hood', name: 'Contractor’s Hood', kanji: '契約者の頭巾', type: 'armor', slot: 'head', rarity: 'mythic', value: 3200,
    desc: 'Nine of them were made. Yours is the tenth, and the only one still being worn by its owner.',
    mods: { statAdd: { spiritPower: 30, maxFocus: 40 }, statMul: { konDamage: 0.3, cooldownReduction: 0.08 } }, icon: 'hood' },

  // ──────────────────────────────────────────────────────────── charms
  { id: 'omamori_health', name: 'Omamori of Long Life', kanji: '長寿守', type: 'charm', rarity: 'common', value: 90,
    desc: 'A paper charm sewn with a red thread. Do not open it to check.',
    mods: { statAdd: { maxHealth: 30 } }, icon: 'omamori' },
  { id: 'omamori_focus', name: 'Omamori of Clear Water', kanji: '清水守', type: 'charm', rarity: 'fine', value: 160,
    desc: 'For students, swordsmen, and people who talk to foxes.',
    mods: { statAdd: { maxFocus: 24 }, statMul: { focusRegen: 0.15 } }, icon: 'omamori' },
  { id: 'charm_blood', name: 'Bloodstone Charm', kanji: '血石', type: 'charm', rarity: 'rare', value: 620,
    desc: 'Warm to the touch. Warmer when you are winning.',
    mods: { statAdd: { lifesteal: 3 }, statMul: { spiritPower: 0.08 } }, icon: 'charm' },
  { id: 'charm_ninetail', name: 'Nine-Tail Talisman', kanji: '九尾札', type: 'charm', rarity: 'relic', value: 1800,
    desc: 'Nine paper tails. They move when there is no wind.',
    mods: { statMul: { konDamage: 0.25, mutationProgress: 0.2 } }, icon: 'charm',
    craft: { station: 'shrine', materials: { fox_pelt_red: 2, spirit_silk: 4, ninth_bell_fragment: 1 } } },
  { id: 'charm_merchant', name: 'Merchant’s Coin Purse', kanji: '商銭', type: 'charm', rarity: 'fine', value: 240,
    desc: 'Smells of tea and other people’s money.',
    mods: { statAdd: { goldGain: 20 }, statMul: { lootQuality: 0.25 } }, icon: 'charm' },
  { id: 'charm_swift', name: 'Swiftfoot Charm', kanji: '速足守', type: 'charm', rarity: 'fine', value: 200,
    desc: 'For couriers, thieves, and anyone who has met a tengu twice.',
    mods: { statMul: { moveSpeed: 0.08, dodgeIFrames: 0.1 } }, icon: 'charm' },

  // ───────────────────────────────────────────────────────── consumables
  { id: 'rice_ball', name: 'Rice Ball', kanji: '御握', type: 'consumable', rarity: 'common', value: 12, stack: 20,
    desc: 'Salt and rice. Restores 25% health.', use: { healPct: 0.25, castTime: 1.2 }, icon: 'food' },
  { id: 'sake', name: 'Sake', kanji: '酒', type: 'consumable', rarity: 'common', value: 25, stack: 10,
    desc: 'Restores 30% focus and makes you braver than is wise.',
    use: { focusPct: 0.3, buff: { stat: 'physicalPower', pct: 0.1, duration: 30 } }, icon: 'bottle' },
  { id: 'bitter_tea', name: 'Bitter Tea', kanji: '苦茶', type: 'consumable', rarity: 'fine', value: 60, stack: 10,
    desc: 'Restores 60% health and 40% focus. Tastes like a scolding.',
    use: { healPct: 0.6, focusPct: 0.4, castTime: 2.4 }, icon: 'tea' },
  { id: 'fox_tofu', name: 'Fried Tofu', kanji: '油揚げ', type: 'consumable', rarity: 'fine', value: 45, stack: 10,
    desc: 'A fox’s favourite. Heals you and pleases your familiar in equal measure.',
    use: { healPct: 0.2, foxHealPct: 0.5, castTime: 0.8 }, icon: 'food' },
  { id: 'antidote', name: 'Antidote', kanji: '解毒', type: 'consumable', rarity: 'common', value: 35, stack: 10,
    desc: 'Clears poison and bleed. Does nothing whatsoever about regret.',
    use: { cure: ['poison', 'bleed'] }, icon: 'vial' },
  { id: 'salt_packet', name: 'Packet of Salt', kanji: '盛塩', type: 'consumable', rarity: 'common', value: 20, stack: 20,
    desc: 'Scatter it and the unclean will not cross the line for a while.',
    use: { ward: { radius: 6, duration: 20 } }, icon: 'salt' },
  { id: 'ofuda_fire', name: 'Fire Ofuda', kanji: '火札', type: 'consumable', rarity: 'fine', value: 90, stack: 10,
    desc: 'A paper slip that becomes fox-fire when you throw it.',
    use: { throw: { ability: 'kitsunebi', power: 2.0 } }, icon: 'ofuda' },
  { id: 'ofuda_bind', name: 'Binding Ofuda', kanji: '縛札', type: 'consumable', rarity: 'rare', value: 220, stack: 5,
    desc: 'Sticks a yōkai in place for six seconds. It will remember your face.',
    use: { throw: { status: 'bind', duration: 6 } }, icon: 'ofuda' },
  { id: 'spirit_water', name: 'Spirit Water', kanji: '霊水', type: 'consumable', rarity: 'rare', value: 300, stack: 5,
    desc: 'Refills focus completely and cuts every cooldown in half, once.',
    use: { focusPct: 1.0, cooldownCut: 0.5 }, icon: 'vial' },
  { id: 'essence_vial', name: 'Vial of Contract Essence', kanji: '契約の雫', type: 'consumable', rarity: 'relic', value: 900, stack: 5,
    desc: 'Concentrated obligation. Feed it to your fox.', use: { essence: 3 }, icon: 'vial' },

  // ────────────────────────────────────────────────────────── materials
  { id: 'iron_scrap', name: 'Iron Scrap', kanji: '鉄屑', type: 'material', rarity: 'common', value: 8, stack: 99, desc: 'Bits of somebody’s bad day.' },
  { id: 'cloth_scrap', name: 'Cloth Scrap', kanji: '布切', type: 'material', rarity: 'common', value: 5, stack: 99, desc: 'Indigo mostly. Blood mostly.' },
  { id: 'bone_shard', name: 'Bone Shard', kanji: '骨片', type: 'material', rarity: 'common', value: 12, stack: 99, desc: 'Not all of them are human. That is not as comforting as it sounds.' },
  { id: 'katana_shard', name: 'Katana Shard', kanji: '刀欠', type: 'material', rarity: 'fine', value: 40, stack: 99, desc: 'The broken half of someone’s pride.' },
  { id: 'spear_head', name: 'Spear Head', kanji: '穂先', type: 'material', rarity: 'fine', value: 35, stack: 99, desc: 'Still sharp. Still looking for work.' },
  { id: 'iron_ore', name: 'Iron Ore', kanji: '砂鉄', type: 'material', rarity: 'fine', value: 30, stack: 99, desc: 'River sand with ambition.' },
  { id: 'feather', name: 'Crow Feather', kanji: '烏羽', type: 'material', rarity: 'common', value: 6, stack: 99, desc: 'Crows are everywhere because crows are patient.' },
  { id: 'spectral_dust', name: 'Spectral Dust', kanji: '幽塵', type: 'material', rarity: 'fine', value: 55, stack: 99, desc: 'What a ghost leaves on the floor when it stands still too long.' },
  { id: 'kappa_shell', name: 'Kappa Shell', kanji: '河童甲', type: 'material', rarity: 'fine', value: 70, stack: 99, desc: 'Boil it, powder it, drink it. Or don’t.' },
  { id: 'oni_horn', name: 'Oni Horn', kanji: '鬼角', type: 'material', rarity: 'rare', value: 220, stack: 99, desc: 'It keeps growing after you cut it off.' },
  { id: 'oni_iron', name: 'Oni Iron', kanji: '鬼鉄', type: 'material', rarity: 'rare', value: 260, stack: 99, desc: 'Forged in a fire that was, briefly, a person.' },
  { id: 'tengu_feather', name: 'Tengu Feather', kanji: '天狗羽', type: 'material', rarity: 'rare', value: 240, stack: 99, desc: 'Lighter than air and twice as proud.' },
  { id: 'spider_silk', name: 'Spider Silk', kanji: '蜘蛛糸', type: 'material', rarity: 'rare', value: 180, stack: 99, desc: 'Strong as wire, cold as a decision.' },
  { id: 'spirit_silk', name: 'Spirit Silk', kanji: '霊絹', type: 'material', rarity: 'relic', value: 420, stack: 99, desc: 'Woven by something that does not have fingers.' },
  { id: 'frost_shard', name: 'Frost Shard', kanji: '氷片', type: 'material', rarity: 'rare', value: 190, stack: 99, desc: 'Does not melt in your hand. Melts in your pack.' },
  { id: 'fox_pelt_red', name: 'Red Fox Pelt', kanji: '赤狐毛皮', type: 'material', rarity: 'relic', value: 600, stack: 99, desc: 'Another contractor’s familiar. Keep it out of sight of yours.' },
  { id: 'rival_fang', name: 'Rival’s Fang', kanji: '宿敵の牙', type: 'material', rarity: 'mythic', value: 1500, stack: 99, desc: 'She will want this back.' },
  { id: 'shuten_horn', name: 'Shuten’s Horn', kanji: '酒呑角', type: 'material', rarity: 'mythic', value: 2200, stack: 99, desc: 'It still smells of rice wine and provinces.' },
  { id: 'ninth_bell_fragment', name: 'Ninth Bell Fragment', kanji: '九鐘片', type: 'material', rarity: 'mythic', value: 2600, stack: 99, desc: 'It rings when you sleep. Just once. Every time.' },
  { id: 'contract_essence', name: 'Contract Essence', kanji: '契約の精', type: 'material', rarity: 'relic', value: 500, stack: 999, currency: 'essence',
    desc: 'What the fox is owed, made liquid. Feed it or spend it; it is the same thing.' },

  // ── currencies as items (gold is tracked in the purse, but coins can drop) ──
  { id: 'copper_coin', name: 'Copper Mon', kanji: '銅文', type: 'currency', rarity: 'common', value: 1, stack: 9999,
    desc: 'A coin with a square hole, so you can carry a string of your whole life.', icon: 'coin' },
  { id: 'silver_coin', name: 'Silver Mon', kanji: '銀文', type: 'currency', rarity: 'fine', value: 12, stack: 9999,
    desc: 'Twelve coppers of somebody’s bad afternoon.', icon: 'coin' },
  { id: 'gold_coin', name: 'Gold Ryō', kanji: '金両', type: 'currency', rarity: 'rare', value: 140, stack: 9999,
    desc: 'Heavy enough to be a weapon if you are desperate enough to throw it.', icon: 'coin' },
  { id: 'funeral_coin', name: 'Funeral Coin', kanji: '六文銭', type: 'currency', rarity: 'fine', value: 6, stack: 999,
    desc: 'For the ferryman. Do not spend it; you will need the crossing.', icon: 'coin' },

  // ── quest / trade goods ──
  { id: 'arrow_bundle', name: 'Bundle of Arrows', kanji: '矢束', type: 'material', rarity: 'common', value: 16, stack: 20,
    desc: 'Fletched with crow. They fly straight and complain about it.', icon: 'arrow' },
  { id: 'prayer_beads', name: 'Prayer Beads', kanji: '数珠', type: 'material', rarity: 'fine', value: 90, stack: 5,
    desc: 'One hundred and eight beads, each one a thing you meant to stop doing.', icon: 'beads' },
  { id: 'incense', name: 'Mountain Incense', kanji: '山香', type: 'consumable', rarity: 'fine', value: 60, stack: 20,
    desc: 'Burns for an hour. Yōkai find the smell rude and say so.', icon: 'incense',
    use: { effect: 'ward', duration: 60 } },
  { id: 'venom_gland', name: 'Venom Gland', kanji: '毒袋', type: 'material', rarity: 'rare', value: 210, stack: 20,
    desc: 'Handle with silk, never with fingers.', icon: 'gland' },
  { id: 'river_pearl', name: 'River Pearl', kanji: '川真珠', type: 'material', rarity: 'rare', value: 260, stack: 20,
    desc: 'Found where the kappa keep their apologies.', icon: 'pearl' },
  { id: 'mourning_cloth', name: 'Mourning Cloth', kanji: '喪布', type: 'material', rarity: 'fine', value: 130, stack: 10,
    desc: 'White, undyed, and still damp from the last wearing.', icon: 'cloth' },
  { id: 'great_skull', name: 'Great Skull', kanji: '大頭骨', type: 'material', rarity: 'relic', value: 900, stack: 2,
    desc: 'Big as a rice barrel. You have to carry it under one arm like a melon.', icon: 'skull' },
  { id: 'bone_marrow', name: 'Bone Marrow', kanji: '骨髄', type: 'material', rarity: 'rare', value: 240, stack: 20,
    desc: 'The gashadokuro is mostly this and mostly hunger.', icon: 'marrow' },
  { id: 'cucumber', name: 'River Cucumber', kanji: '河胡瓜', type: 'consumable', rarity: 'common', value: 14, stack: 20,
    desc: 'The only polite way to greet a kappa. Also lunch.', icon: 'food',
    use: { effect: 'heal', pct: 0.12 } },
  { id: 'wind_charm', name: 'Wind Charm', kanji: '風札', type: 'material', rarity: 'rare', value: 280, stack: 5,
    desc: 'A folded paper that will not lie flat, ever again.', icon: 'charm' },
  { id: 'straw_bundle', name: 'Straw Bundle', kanji: '藁束', type: 'material', rarity: 'common', value: 10, stack: 40,
    desc: 'Namahage capes, roof thatch, and the floor of every hut in the pass.', icon: 'straw' },
  { id: 'venison', name: 'Venison', kanji: '鹿肉', type: 'consumable', rarity: 'common', value: 22, stack: 20,
    desc: 'Lean, dark, and best eaten before the messenger deer notices.', icon: 'food',
    use: { effect: 'heal', pct: 0.22 } },
  { id: 'antler', name: 'Deer Antler', kanji: '鹿角', type: 'material', rarity: 'fine', value: 95, stack: 20,
    desc: 'Carved into charms, or into the handle of something unkind.', icon: 'antler' },
  { id: 'boar_hide', name: 'Boar Hide', kanji: '猪革', type: 'material', rarity: 'fine', value: 110, stack: 20,
    desc: 'Thick enough to turn a spear. Smells like it did anyway.', icon: 'hide' },
  { id: 'boar_tusk', name: 'Boar Tusk', kanji: '猪牙', type: 'material', rarity: 'rare', value: 190, stack: 20,
    desc: 'Two of them, curved like commas at the end of a bad sentence.', icon: 'tusk' },
  { id: 'tanuki_pelt', name: 'Tanuki Pelt', kanji: '狸毛皮', type: 'material', rarity: 'fine', value: 140, stack: 10,
    desc: 'Warm, theatrical, and faintly resentful of being worn.', icon: 'pelt' },
  { id: 'leaf', name: 'Blessed Leaf', kanji: '福葉', type: 'material', rarity: 'common', value: 9, stack: 99,
    desc: 'A tanuki’s favourite lie. Hold it up and it becomes whatever you need it to be, briefly.', icon: 'leaf' },
  { id: 'rope_coil', name: 'Hemp Rope Coil', kanji: '縄輪', type: 'material', rarity: 'common', value: 18, stack: 20,
    desc: 'Cut down from something that used to swing in the wind.', icon: 'rope' },
  { id: 'serpent_scale', name: 'Serpent Scale', kanji: '蛇鱗', type: 'material', rarity: 'rare', value: 230, stack: 30,
    desc: 'Slick, cold, and it keeps trying to crawl out of your pack.', icon: 'scale' },
  { id: 'wall_clay', name: 'Nurikabe Clay', kanji: '塗壁土', type: 'material', rarity: 'rare', value: 260, stack: 20,
    desc: 'Clay from a wall that walks. It hardens wherever it wants to.', icon: 'clay' },
  { id: 'stone_chunk', name: 'Stone Chunk', kanji: '岩塊', type: 'material', rarity: 'common', value: 11, stack: 40,
    desc: 'Building, throwing, or sitting on. The three great uses of rock.', icon: 'stone' },
  { id: 'cracked_mask', name: 'Cracked Mask', kanji: '割面', type: 'material', rarity: 'rare', value: 320, stack: 5,
    desc: 'A contractor’s face, split down the seam where the fox got in.', icon: 'mask' },

  // ─────────────────────────────────────────────────────────── key items
  { id: 'contract_scroll', name: 'The Contract Scroll', kanji: '契約書', type: 'key', rarity: 'mythic', value: 0,
    desc: 'Your name is the third on it. The first two are scratched out.', icon: 'scroll' },
  { id: 'inari_blessing', name: 'Inari’s Blessing', kanji: '稲荷の加護', type: 'key', rarity: 'mythic', value: 0,
    desc: 'A single grain of rice that will not rot while you are alive.', icon: 'rice' },
  { id: 'pass_ledger', name: 'Pass Keeper’s Ledger', kanji: '峠帳', type: 'key', rarity: 'rare', value: 0,
    desc: 'Everybody who crossed, and what they were carrying. Including you.', icon: 'scroll' },
  { id: 'bell_hammer', name: 'Bell Hammer', kanji: '撞木', type: 'key', rarity: 'rare', value: 0,
    desc: 'For ringing bells that should probably stay unrung.', icon: 'hammer' },
];

export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
export const ITEMS_BY_TYPE = ITEMS.reduce((acc, i) => {
  (acc[i.type] ||= []).push(i);
  return acc;
}, {});

/** Everything the forge and shrine can make. */
export const RECIPES = ITEMS.filter((i) => i.craft).map((i) => ({
  id: i.id, station: i.craft.station, materials: i.craft.materials,
}));

export function recipesFor(station) {
  return RECIPES.filter((r) => r.station === station);
}

/** Roll a loot drop for an enemy def scaled to level. */
export function rollLoot(def, level, rng, lootQuality = 0) {
  const out = [];
  for (const d of def.drops || []) {
    const chance = Math.min(0.98, d.chance * (1 + lootQuality / 220));
    if (!rng.chance(chance)) continue;
    const count = d.count ? rng.int(d.count[0], d.count[1]) : 1;
    out.push({ item: d.item, count });
  }
  // bonus roll for high-level foes
  if (level >= 20 && rng.chance(0.12 + lootQuality / 400)) {
    const pool = ['iron_ore', 'spirit_silk', 'oni_iron', 'frost_shard', 'spectral_dust'];
    out.push({ item: rng.pick(pool), count: rng.int(1, 2) });
  }
  return out;
}

export const CURRENCY = {
  copper_coin: { name: 'Copper Mon', kanji: '銅文', value: 1 },
  silver_coin: { name: 'Silver Mon', kanji: '銀文', value: 12 },
  gold_coin: { name: 'Gold Ryō', kanji: '金両', value: 140 },
};
