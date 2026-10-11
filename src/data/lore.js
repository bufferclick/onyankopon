/**
 * Codex, loading-screen lore and ambient narration. Everything here is flavour
 * that also teaches the player something (the loading tips double as tutorials).
 */

export const CODEX = [
  {
    id: 'contract', title: 'The Contract', kanji: '契約', group: 'The World',
    text: 'A contract with a devil is not signed; it is agreed to. You gave a name, the fox gave a word — ' +
      'Kon — and the difference between you has been shrinking ever since. Nine people have signed this one. ' +
      'You are the tenth, and the only one still holding the pen.',
  },
  {
    id: 'essence', title: 'Contract Essence', kanji: '契約の精', group: 'Systems',
    text: 'Every life the fox takes on your behalf leaves a residue: cold, faintly blue, and faintly rude. ' +
      'Feed it to the fox and it grows; spend it at the sanctum and it buys you a new shape. It is the only ' +
      'currency that is also a debt.',
  },
  {
    id: 'mutation', title: 'Mutations', kanji: '変異', group: 'Systems',
    text: 'Foxes do not grow in a line. They grow in stages, each one less willing to be called an animal. ' +
      'Kon Kit, Yako, Kuda-gitsune, Genkurō, Tenko, Kyūbi, Inari, and at the end, the thing that signed back.',
  },
  {
    id: 'inari', title: 'Inari Ōkami', kanji: '稲荷大神', group: 'Gods',
    text: 'Carries rice in one hand and a sword in the other, which is a strange thing for a god of harvests ' +
      'until you have met the foxes. Inari does not answer prayers so much as audit them.',
  },
  {
    id: 'bells', title: 'The Nine Bells', kanji: '九つの鐘', group: 'The World',
    text: 'Nine contractors, nine bells, nine people who asked to become the strongest. The bells still ring ' +
      'at dusk in the capital. Nobody rings them. Nobody has to.',
  },
  {
    id: 'kuda', title: 'Kuda-gitsune', kanji: '管狐', group: 'Bestiary',
    text: 'Kept in bamboo tubes, fed fried tofu, sent to do the small cruelties that a familiar of size ' +
      'would find demeaning. Yours rides in your sleeve and has opinions about your friends.',
  },
  {
    id: 'oni', title: 'Oni', kanji: '鬼', group: 'Bestiary',
    text: 'They keep their promises, which is the dangerous part. An oni who says it will eat your village ' +
      'on the third day will be there on the third day, hungry and punctual.',
  },
  {
    id: 'gashadokuro', title: 'Gashadokuro', kanji: '餓者髑髏', group: 'Bestiary',
    text: 'The collected bones of everyone who died uncovered on a mountain. It does not hate you. It is ' +
      'simply very tall and has been hungry for four hundred years.',
  },
  {
    id: 'yurei', title: 'Yūrei', kanji: '幽霊', group: 'Bestiary',
    text: 'Mostly harmless, mostly sad, mostly still wearing the kimono they were buried in. Fire convinces ' +
      'them to leave. So does finishing the sentence they keep starting.',
  },
  {
    id: 'kitsunebi', title: 'Kitsune-bi', kanji: '狐火', group: 'Abilities',
    text: 'Fox-fire. Cold enough to burn without heat, bright enough to read by, and it follows whoever the ' +
      'fox dislikes most, which at the moment is usually whoever is in front of you.',
  },
  {
    id: 'parry', title: 'On Parrying', kanji: '受け流し', group: 'Combat',
    text: 'Guarding absorbs a hit. Parrying answers one. The window is short, the reward is a staggered ' +
      'enemy and a guaranteed critical that costs you nothing. Everything hard in this game is parryable, ' +
      'including the things that look like they should not be.',
  },
  {
    id: 'posture', title: 'Posture', kanji: '体勢', group: 'Combat',
    text: 'Health is how long you last; posture is how long you last standing up. Break an enemy’s posture ' +
      'and their health stops mattering.',
  },
  {
    id: 'nine_cut', title: 'The Nine-Cut', kanji: '九断', group: 'Abilities',
    text: 'The technique the Ninth Contractor is named for: nine strikes, each one faster, each one aimed at ' +
      'somewhere you have already been hurt. It has never been survived. It has been nearly survived once.',
  },
  {
    id: 'provinces', title: 'Kitsune-ga-Oka', kanji: '狐ヶ丘', group: 'The World',
    text: 'Nine regions, one river, and a road that keeps changing which province it belongs to. Rice in the ' +
      'south, ash in the east, and in the middle a mountain nobody climbs twice.',
  },
  {
    id: 'tofu', title: 'On Fried Tofu', kanji: '油揚げ', group: 'The World',
    text: 'Inari-zushi is offered at every fox shrine in the province. Foxes accept it. They also accept ' +
      'fingers, promises, and the names of your enemies, but they prefer the tofu.',
  },
];

export const CODEX_GROUPS = ['The World', 'Systems', 'Combat', 'Abilities', 'Bestiary', 'Gods'];

/** Loading screen flavour. Shown under the progress bar while assets stream in. */
export const LOADING_TIPS = [
  'Kon is your signature: the fox devil’s head bites whatever you are looking at. It scales with Blood.',
  'Parry at the moment a blow lands, not before. A perfect parry costs no stamina and opens a critical.',
  'Your fox levels separately from you. Feed it Contract Essence at the Inari Sanctum.',
  'Mutations are gated by quests, not just levels. If a stage will not unlock, something is unfinished.',
  'Heavier armour costs movement speed. Poise lets you finish a swing that would interrupt someone else.',
  'Rend increases all damage a target takes. Stack it before an ultimate.',
  'Executions end fights early and refund cooldowns. Break posture to earn them.',
  'Hold Guard while dodging to roll instead of step — longer i-frames, slower recovery.',
  'Fox-fire burns through anything that resists steel. Gaki and yūrei hate it.',
  'Every ability can be ranked up five times at the sanctum. Rank two is where most of them get good.',
  'Crows are not worth fighting. Everything else in the province is.',
  'Sprinting drains stamina; stamina does not regenerate while you are out of it. Walk it back.',
  'Check the map for red markers: those are bounties, and bounties pay for mutations.',
  'The fox bites what you look at. Look carefully, and quickly.',
  'Salt does not kill anything. It just convinces things to wait outside.',
  'You can rebind every key, including the ones you will never use, in Settings → Controls.',
];

/** Whispered during long travels / entering new regions (subtitle channel). */
export const NARRATION = [
  { text: 'The road is wet and the fox is restless.', region: 'kawa' },
  { text: 'Something in the cedars keeps pace with you, then stops when you do.', region: 'wood' },
  { text: 'Black water, warm as skin. Do not drink, and do not kneel.', region: 'reeds' },
  { text: 'Ten million green spears, and every one of them listening.', region: 'bamboo' },
  { text: 'Snow closes the pass at dusk. It is nearly dusk.', region: 'yuki' },
  { text: 'Ten thousand stones. None of them comfortable. All of them occupied.', region: 'graves' },
  { text: 'Ash falls like slow snow. The ground is warm through your sandals.', region: 'ridge' },
  { text: 'A thousand gates, and you paid for the last one.', region: 'shrine' },
  { text: 'Nine bells at dusk so the dead know the hour.', region: 'capital' },
];

export const DEATH_LINES = [
  'The fox eats first, and argues about the rest later.',
  'You signed. It collected. Those were the terms.',
  'Your shadow stays where it fell, and does not get up.',
  'A contract is a promise with teeth in it.',
  'Kon. …Kon. …Nothing answers. Yet.',
];

/** Title-screen flavour, rotated on each visit to the main menu. */
export const MENU_EPIGRAPHS = [
  '「狐は恩を忘れない。恨みも忘れない。」— A fox forgets neither a kindness nor a grudge.',
  '「強くなりたい。それだけが契約の言葉だ。」— "I want to be stronger." That is the whole contract.',
  '「九つの鐘が鳴る。九人目が答える。」— Nine bells ring. The ninth one answers.',
  '「油揚げは供物。指は付け合わせ。」— Tofu is the offering. Fingers are the side dish.',
  '「影に耳がある。もう戻れない。」— Your shadow has ears now. No going back.',
];

export function tipForIndex(i) {
  return LOADING_TIPS[i % LOADING_TIPS.length];
}

export function narrationFor(regionId) {
  return NARRATION.find((n) => n.region === regionId)?.text || null;
}
