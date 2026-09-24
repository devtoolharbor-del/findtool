/**
 * Lorem Ipsum generation.
 *
 * Pure and DOM-free so it can be unit-tested in Node. Randomness comes from
 * `randomBelow()` in src/lib/random.ts — which means crypto.getRandomValues(),
 * never Math.random() — although for placeholder text the reason is
 * consistency with the rest of the site rather than security. Tests inject
 * their own deterministic `rng` through the options object.
 */

import { randomBelow } from '~/lib/random';

/**
 * The classic word pool.
 *
 * The first thirty-odd words are the familiar "Lorem ipsum dolor sit amet"
 * passage; the rest come from the same source, Cicero's *De finibus bonorum
 * et malorum* (45 BC), sections 1.10.32–33, as mangled by a 16th-century
 * typesetter. Deliberately all lowercase and free of punctuation — sentence
 * shaping is this module's job, not the pool's.
 */
export const LOREM_WORDS: readonly string[] = [
  'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit', 'sed', 'do',
  'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'et', 'dolore', 'magna', 'aliqua', 'enim',
  'ad', 'minim', 'veniam', 'quis', 'nostrud', 'exercitation', 'ullamco', 'laboris', 'nisi',
  'aliquip', 'ex', 'ea', 'commodo', 'consequat', 'duis', 'aute', 'irure', 'in', 'reprehenderit',
  'voluptate', 'velit', 'esse', 'cillum', 'eu', 'fugiat', 'nulla', 'pariatur', 'excepteur',
  'sint', 'occaecat', 'cupidatat', 'non', 'proident', 'sunt', 'culpa', 'qui', 'officia',
  'deserunt', 'mollit', 'anim', 'id', 'est', 'laborum', 'at', 'vero', 'eos', 'accusamus',
  'iusto', 'odio', 'dignissimos', 'ducimus', 'blanditiis', 'praesentium', 'voluptatum',
  'deleniti', 'atque', 'corrupti', 'quos', 'dolores', 'quas', 'molestias', 'excepturi',
  'occaecati', 'provident', 'similique', 'officiis', 'animi', 'dolorum', 'fuga', 'harum',
  'quidem', 'rerum', 'facilis', 'expedita', 'distinctio', 'nam', 'libero', 'tempore', 'cum',
  'soluta', 'nobis', 'eligendi', 'optio', 'cumque', 'nihil', 'impedit', 'quo', 'minus',
  'maxime', 'placeat', 'facere', 'possimus', 'omnis', 'voluptas', 'assumenda', 'repellendus',
  'temporibus', 'autem', 'quibusdam', 'debitis', 'necessitatibus', 'saepe', 'eveniet',
  'voluptates', 'repudiandae', 'recusandae', 'itaque', 'earum', 'hic', 'tenetur', 'sapiente',
  'delectus', 'reiciendis', 'voluptatibus', 'maiores', 'alias', 'perferendis', 'doloribus',
  'asperiores', 'repellat', 'neque', 'porro', 'quisquam', 'dolorem', 'adipisci', 'numquam',
  'eius', 'modi', 'incidunt', 'magnam', 'quaerat', 'etiam', 'totam', 'aperiam', 'eaque',
  'quae', 'inventore', 'veritatis', 'quasi', 'architecto', 'beatae', 'vitae', 'dicta',
  'explicabo', 'aspernatur', 'aut', 'fugit', 'consequuntur', 'sequi', 'nesciunt', 'porta',
  'ratione', 'sequitur', 'natus', 'error', 'accusantium', 'laudantium', 'rem', 'ipsa',
  'quia', 'consequatur', 'vel', 'illum', 'nemo', 'ipsam', 'voluptatem',
];

/** The opening every reader recognises, used when "start with Lorem ipsum" is on. */
export const LOREM_OPENING_WORDS: readonly string[] = [
  'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit',
];

export type LoremUnit = 'paragraphs' | 'sentences' | 'words' | 'list-items';
export type LoremFormat = 'text' | 'html';
/** The tag each unit is wrapped in when producing HTML. */
export type LoremTag = 'p' | 'li' | 'h2';

/** A source of integers in `[0, bound)`. Tests supply a deterministic one. */
export type Rng = (bound: number) => number;

export interface LoremOptions {
  unit: LoremUnit;
  count: number;
  /** Begin the output with the canonical "Lorem ipsum dolor sit amet…". */
  startWithLorem?: boolean;
  format?: LoremFormat;
  /** Override the wrapping tag. Defaults to `li` for list items, `p` otherwise. */
  tag?: LoremTag;
  rng?: Rng;
}

const defaultRng: Rng = (bound) => randomBelow(bound);

/** Inclusive on both ends, matching how sentence lengths are described below. */
function between(rng: Rng, min: number, max: number): number {
  return min + rng(max - min + 1);
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * `count` words. With `startWithLorem`, the canonical opening is laid down
 * first and the remainder drawn at random — so asking for three words gives
 * "lorem ipsum dolor", not three unrelated ones.
 */
export function loremWords(count: number, opts: Partial<LoremOptions> = {}): string[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error('The word count must be a whole number of zero or more.');
  }
  const rng = opts.rng ?? defaultRng;
  const out: string[] = [];
  if (opts.startWithLorem) {
    out.push(...LOREM_OPENING_WORDS.slice(0, count));
  }
  while (out.length < count) {
    out.push(LOREM_WORDS[rng(LOREM_WORDS.length)]!);
  }
  return out;
}

/**
 * One sentence, capitalised and full-stopped.
 *
 * Length varies between `min` and `max` words and roughly one sentence in
 * three picks up an interior comma, because a wall of identical eleven-word
 * sentences reads as obviously fake and stops being a useful stand-in for
 * real copy when you are checking line lengths in a design.
 */
export function loremSentence(
  opts: Partial<LoremOptions> & { min?: number; max?: number } = {},
): string {
  const rng = opts.rng ?? defaultRng;
  const min = opts.min ?? 6;
  const max = opts.max ?? 16;
  const length = between(rng, min, max);
  const words = loremWords(length, { rng, startWithLorem: opts.startWithLorem });

  // A comma lands somewhere in the middle third, never next to the full stop.
  if (length >= 8 && rng(3) === 0) {
    const at = between(rng, 2, length - 3);
    words[at] = `${words[at]},`;
  }
  return `${capitalise(words.join(' '))}.`;
}

/**
 * One paragraph of 3–6 sentences. Only the very first sentence can carry the
 * canonical opening, so a five-paragraph block does not repeat it five times.
 */
export function loremParagraph(opts: Partial<LoremOptions> = {}): string {
  const rng = opts.rng ?? defaultRng;
  const sentences = between(rng, 3, 6);
  const out: string[] = [];
  for (let i = 0; i < sentences; i++) {
    out.push(loremSentence({ rng, startWithLorem: i === 0 && opts.startWithLorem }));
  }
  return out.join(' ');
}

/** A short sentence sized for a bullet — list items that run to 16 words look wrong. */
export function loremListItem(opts: Partial<LoremOptions> = {}): string {
  return loremSentence({ ...opts, min: 4, max: 9 });
}

function wrap(blocks: string[], tag: LoremTag): string {
  const inner = blocks.map((b) => `<${tag}>${b}</${tag}>`).join('\n');
  return tag === 'li' ? `<ul>\n${inner.replace(/^/gm, '  ')}\n</ul>` : inner;
}

/**
 * The single entry point the tool uses.
 *
 * Returns plain text (paragraphs separated by a blank line, list items one
 * per line) or HTML with each unit wrapped in a tag. The output contains only
 * ASCII letters, spaces, commas and full stops, so the HTML branch has
 * nothing to escape — but nothing user-supplied ever reaches it either, which
 * is the property that actually matters.
 */
export function generateLorem(opts: LoremOptions): string {
  const { unit, count } = opts;
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('Choose how many to generate — at least one.');
  }
  const max = unit === 'words' ? 5000 : 500;
  if (count > max) {
    throw new Error(
      `${count.toLocaleString()} is over the limit of ${max.toLocaleString()} ${unit.replace('-', ' ')} for one run. Generate it in batches.`,
    );
  }

  const rng = opts.rng ?? defaultRng;
  const format = opts.format ?? 'text';
  const lead = opts.startWithLorem ?? false;

  let blocks: string[];
  switch (unit) {
    case 'paragraphs':
      blocks = Array.from({ length: count }, (_, i) =>
        loremParagraph({ rng, startWithLorem: lead && i === 0 }),
      );
      break;
    case 'sentences':
      blocks = [
        Array.from({ length: count }, (_, i) =>
          loremSentence({ rng, startWithLorem: lead && i === 0 }),
        ).join(' '),
      ];
      break;
    case 'words': {
      const words = loremWords(count, { rng, startWithLorem: lead });
      blocks = [`${capitalise(words.join(' '))}.`];
      break;
    }
    case 'list-items':
      blocks = Array.from({ length: count }, (_, i) =>
        loremListItem({ rng, startWithLorem: lead && i === 0 }),
      );
      break;
    default:
      throw new Error('Choose paragraphs, sentences, words or list items.');
  }

  if (format === 'html') {
    return wrap(blocks, opts.tag ?? (unit === 'list-items' ? 'li' : 'p'));
  }
  return blocks.join(unit === 'list-items' ? '\n' : '\n\n');
}

/** Word, sentence and character counts for the status line under the output. */
export function loremStats(text: string): {
  words: number;
  sentences: number;
  characters: number;
} {
  const stripped = text.replace(/<[^>]+>/g, ' ');
  const words = stripped.trim() ? stripped.trim().split(/\s+/).length : 0;
  const sentences = (stripped.match(/\./g) ?? []).length;
  return { words, sentences, characters: text.length };
}
