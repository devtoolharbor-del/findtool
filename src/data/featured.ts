/**
 * The tools shown first to someone who has not chosen anything yet.
 *
 * Two places need this exact list and must not disagree: the shortcut row
 * under the homepage search box, and the empty state of the search dialog.
 * They were maintained separately, so the dialog drifted into listing popular
 * tools alphabetically — opening with Base64 Decoder and Color Converter,
 * which is a ranking by spelling rather than by usefulness.
 *
 * Chosen for search volume and for spanning different categories: a stranger
 * should be able to tell from six items that the site covers more than one
 * kind of problem.
 *
 * Labels are shortened deliberately ("Base64", not "Base64 Encoder") so the
 * row fits on one line at desktop width. The search dialog uses each tool's
 * full registry name instead, because it has the space and the extra words
 * help when scanning results.
 *
 * Slugs are validated by `npm run verify`, which fails on any internal link
 * that does not resolve.
 */
export interface FeaturedTool {
  slug: string;
  /** Short label for the homepage shortcut row. */
  label: string;
}

export const FEATURED: FeaturedTool[] = [
  { slug: 'what-is-my-ip', label: 'My IP' },
  { slug: 'json-formatter', label: 'JSON Formatter' },
  { slug: 'base64-encoder', label: 'Base64' },
  { slug: 'unix-timestamp-converter', label: 'Timestamp' },
  { slug: 'jwt-decoder', label: 'JWT Decoder' },
  { slug: 'uuid-generator', label: 'UUID' },
  { slug: 'regex-tester', label: 'Regex' },
];

/** Position in the featured list, or Infinity when a tool is not featured. */
export function featuredRank(slug: string): number {
  const i = FEATURED.findIndex((f) => f.slug === slug);
  return i === -1 ? Number.POSITIVE_INFINITY : i;
}
