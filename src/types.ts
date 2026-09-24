/** Shared types for the ByteCabin tool registry. */

export type CategoryId =
  | 'json'
  | 'encoding'
  | 'generators'
  | 'security'
  | 'time'
  | 'text'
  | 'web';

export type IconName =
  | 'braces'
  | 'check-circle'
  | 'minimize'
  | 'tree'
  | 'table'
  | 'arrow-right-left'
  | 'file-code'
  | 'binary'
  | 'link'
  | 'code'
  | 'type'
  | 'hash'
  | 'key'
  | 'shield'
  | 'fingerprint'
  | 'dice'
  | 'lock'
  | 'text'
  | 'clock'
  | 'calendar'
  | 'globe'
  | 'timer'
  | 'list'
  | 'sort'
  | 'diff'
  | 'eraser'
  | 'slug'
  | 'regex'
  | 'server'
  | 'monitor'
  | 'palette'
  | 'sparkles'
  | 'search';

export interface Category {
  id: CategoryId;
  /** Top-level path segment, e.g. 'json' → /json */
  slug: string;
  /** Display name, e.g. 'JSON & Data' */
  name: string;
  /** Compact label used in dense UI (nav, breadcrumbs). */
  shortName: string;
  /** One-line summary used on cards and in nav. */
  tagline: string;
  /** Meta description for the category page. */
  seoDescription: string;
  /** SEO title for the category page. */
  seoTitle: string;
  /** Intro paragraph rendered above the tool grid. */
  intro: string;
  icon: IconName;
  order: number;
}

export interface FaqItem {
  q: string;
  a: string;
}

/** One step in a breadcrumb trail. The last item has no href. */
export interface Crumb {
  label: string;
  href?: string;
}

export interface Tool {
  /** URL segment: /tools/<slug> */
  slug: string;
  /** Display name and H1 base. */
  name: string;
  category: CategoryId;
  /** One sentence, used on cards, search results and the tool page subtitle. */
  description: string;
  /** <title> content, without the site suffix. */
  seoTitle: string;
  /** <meta name="description"> content. Must be unique per tool. */
  seoDescription: string;
  /** Topic keywords. Used for internal search relevance, not meta keywords. */
  keywords: string[];
  /** Extra search terms: abbreviations, synonyms, common misspellings. */
  aliases: string[];
  /** Explicit related-tool slugs, most relevant first. */
  related: string[];
  /**
   * Component file name (without extension) inside src/tools/.
   * Resolved automatically by src/pages/tools/[slug].astro.
   */
  component: string;
  icon: IconName;
  /**
   * True only when the tool must send user input to a server.
   * Every launch tool is false — the privacy note depends on this being honest.
   */
  serverProcessing: boolean;
  /** Extra privacy wording shown in addition to the standard local-processing note. */
  privacyNote?: string;
  /** Surfaced on the homepage "Popular" grid. */
  popular?: boolean;
  /** ISO date (YYYY-MM-DD). Drives sitemap lastmod and "recently added". */
  addedAt: string;
  /**
   * FAQ content is NOT stored here. It lives in src/data/faqs/<category>.ts
   * and is looked up with `faqFor(slug)`, so this registry stays metadata
   * rather than prose. See src/data/faqs/index.ts.
   */
}
