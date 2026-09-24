import type { FaqItem } from '~/types';

/**
 * Per-tool FAQ content, kept out of the registry.
 *
 * `src/data/tools.ts` is metadata: slugs, titles, relationships. Prose belongs
 * beside the other prose, and at several hundred tools a registry carrying
 * every answer inline becomes unreadable and conflict-prone to edit.
 *
 * Content is split one module per category so two people (or two agents) can
 * write FAQs for different categories without touching the same file.
 *
 * Rules for an entry here:
 *  - Only add a question people genuinely ask. No invented curiosity.
 *  - Every answer must carry something concrete: a number, a spec reference,
 *    a named failure mode. "It depends on your use case" is not an answer.
 *  - Answers may contain inline HTML (<code>, <em>, <strong>, <a>). The
 *    FAQPage structured data strips tags, and the build fails if a *question*
 *    contains markup, because Google rejects that.
 *  - Do not repeat an answer across tools. Two pages saying the same thing is
 *    duplicate content competing with itself.
 */
import { jsonFaqs } from './json';
import { encodingFaqs } from './encoding';
import { generatorFaqs } from './generators';
import { securityFaqs } from './security';
import { timeFaqs } from './time';
import { textFaqs } from './text';
import { webFaqs } from './web';

export type FaqMap = Record<string, FaqItem[]>;

const ALL: FaqMap = {
  ...jsonFaqs,
  ...encodingFaqs,
  ...generatorFaqs,
  ...securityFaqs,
  ...timeFaqs,
  ...textFaqs,
  ...webFaqs,
};

/** FAQ entries for a tool, or an empty array when it has none. */
export function faqFor(slug: string): FaqItem[] {
  return ALL[slug] ?? [];
}

/** Every slug that has FAQ content — used by the build verifier. */
export function slugsWithFaqs(): string[] {
  return Object.keys(ALL);
}
