import { parsePage } from './parse.js';
import { fetchDocument, type FetchOptions } from './network.js';
export { formatReport } from './reporters.js';

export interface Check {
  id: string; category: 'seo' | 'geo'; status: 'pass' | 'warn' | 'fail' | 'skip';
  weight: number; detail: string;
}
export interface AuditReport {
  schemaVersion: 1; url: string; fetchedAt: string; reachable: boolean;
  scores: { overall: number | null; seo: number | null; geo: number | null };
  checks: Check[]; notes: string[];
}
export interface HtmlOptions {
  url?: string; robots?: string; sitemap?: string; llmsTxt?: string;
  headers?: Record<string, string>; fetchedAt?: string;
}
/** A transparent weighted checklist, not a predicted ranking or citation rate. */
export function score(checks: Check[]): number | null {
  const eligible = checks.filter(c => c.status !== 'skip' && c.weight > 0);
  const total = eligible.reduce((n, c) => n + c.weight, 0);
  return total ? Math.round(100 * eligible.reduce((n, c) => n + c.weight * (c.status === 'pass' ? 1 : c.status === 'warn' ? .5 : 0), 0) / total) : null;
}

export function auditHtml(html: string, opts: HtmlOptions = {}): AuditReport {
  const page = parsePage(html), $ = page.$;
  const checks: Check[] = [];
  const add = (id: string, category: Check['category'], condition: boolean, detail: string, weight = 1, absent: Check['status'] = 'fail') => checks.push({ id, category, status: condition ? 'pass' : absent, weight, detail });
  add('seo.title', 'seo', !!page.title, page.title ? `Title: ${page.title}` : 'Add a descriptive title.', 2);
  add('seo.description', 'seo', !!page.metaDescription, page.metaDescription ? 'Meta description present.' : 'Meta description missing.', 1, 'warn');
  const h1 = $('h1').length;
  add('seo.h1', 'seo', h1 === 1, `Found ${h1} H1 headings. One clear page heading is the convention used by this checklist.`, 1, 'warn');
  add('seo.language', 'seo', !!page.lang, page.lang ? `Language: ${page.lang}` : 'Declare the document language.', 1, 'warn');
  const canonical = $('link[rel="canonical"]').attr('href');
  let canonicalValid = false;
  try { canonicalValid = !!canonical && ['http:', 'https:'].includes(new URL(canonical!, opts.url ?? 'https://example.com').protocol); } catch {}
  add('seo.canonical', 'seo', canonicalValid, canonicalValid ? 'Canonical URL present.' : 'Canonical URL missing or invalid; check whether this page needs one.', 1, 'warn');
  const robotsMeta = ($('meta[name="robots"]').attr('content') ?? '') + ',' + (opts.headers?.['x-robots-tag'] ?? '');
  add('seo.indexability', 'seo', !/\b(noindex|none)\b/i.test(robotsMeta), /\b(noindex|none)\b/i.test(robotsMeta) ? 'Page declares noindex. This may be intentional for private or staging content.' : 'No noindex directive in inspected metadata or headers.', 2);
  const missingAlt = $('img:not([alt])').length;
  add('seo.image-alt', 'seo', missingAlt === 0, `${missingAlt} images have no alt attribute. Empty alt is appropriate for decorative images.`, 1, 'warn');
  const types = page.jsonLd.flatMap(n => Array.isArray(n['@type']) ? n['@type'] : n['@type'] ? [n['@type']] : []);
  add('geo.structured-data', 'geo', types.length > 0 && page.jsonLdParseErrors === 0, `${types.length} typed JSON-LD entities; ${page.jsonLdParseErrors} invalid blocks. Presence is not schema validation.`, 2, 'warn');
  // Exclude scripts and styling from content evidence.
  $('script,style,noscript,template').remove();
  const text = $('body').text().replace(/\s+/g, ' ').trim();
  add('geo.extractable-text', 'geo', text.length >= 100, `${text.length} characters of text in fetched HTML. Client-rendered content is not executed.`, 2, 'warn');
  add('geo.semantic-structure', 'geo', $('main,article').length > 0 && $('h1,h2,h3').length > 0, 'Check for main/article landmarks and headings that help extraction.', 1, 'warn');
  add('geo.attribution', 'geo', !!$('meta[name="author"], [rel="author"], time[datetime]').length || page.jsonLd.some(n => n.author || n.dateModified || n.publisher), 'Look for author, publisher or dated content metadata. Not every page needs all three.', 1, 'warn');
  for (const [id, value, valid] of [
    ['seo.robots-file', opts.robots, opts.robots !== undefined && !/^\s*</.test(opts.robots) && /user-agent\s*:/i.test(opts.robots)],
    ['seo.sitemap', opts.sitemap, /<(urlset|sitemapindex)\b/i.test(opts.sitemap ?? '')],
    ['geo.llms-txt', opts.llmsTxt, !!opts.llmsTxt?.trim() && !/^\s*</.test(opts.llmsTxt ?? '')]
  ] as const) {
    checks.push({ id, category: id.startsWith('seo') ? 'seo' : 'geo', status: value === undefined ? 'skip' : valid ? 'pass' : 'warn', weight: 0,
      detail: id === 'geo.llms-txt' ? 'Optional llms.txt discovery only; excluded from scores. No assumption that models consume it.' : 'Root discovery only; excluded from scores. This does not establish crawler access or validate the full document.' });
  }
  return { schemaVersion: 1, url: opts.url ?? 'local-html', fetchedAt: opts.fetchedAt ?? new Date().toISOString(), reachable: true,
    scores: { overall: score(checks), seo: score(checks.filter(c => c.category === 'seo')), geo: score(checks.filter(c => c.category === 'geo')) }, checks,
    notes: ['Heuristic readiness checklist, not Google Lighthouse, a search ranking prediction, an AI citation guarantee or a full accessibility audit.'] };
}

export async function audit(url: string, opts: FetchOptions = {}): Promise<AuditReport> {
  const main = await fetchDocument(url, opts);
  if (!main.ok) return { schemaVersion: 1, url, fetchedAt: new Date().toISOString(), reachable: false,
    scores: { overall: null, seo: null, geo: null }, checks: [], notes: [main.error ?? `HTTP ${main.status}`] };
  const origin = new URL(main.url).origin;
  const docs = await Promise.all(['/robots.txt', '/sitemap.xml', '/llms.txt'].map(path => fetchDocument(origin + path, opts)));
  const report = auditHtml(main.body, { url: main.url, headers: main.headers,
    robots: docs[0].ok ? docs[0].body : undefined, sitemap: docs[1].ok ? docs[1].body : undefined, llmsTxt: docs[2].ok ? docs[2].body : undefined });
  docs.forEach((doc, i) => { if (!doc.ok) report.notes.push(`${['robots.txt','sitemap.xml','llms.txt'][i]} not assessed: ${doc.error ?? `HTTP ${doc.status}`}`); });
  return report;
}
