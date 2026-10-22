import * as cheerio from "cheerio";

export interface ParsedPage {
  $: cheerio.CheerioAPI;
  title: string | null;
  metaDescription: string | null;
  lang: string | null;
  generator: string | null;
  /** Successfully-parsed JSON-LD objects (flattened from @graph). */
  jsonLd: JsonLdNode[];
  /** Raw count of <script type="application/ld+json"> blocks found. */
  jsonLdBlockCount: number;
  /** Number of JSON-LD blocks that failed to parse. */
  jsonLdParseErrors: number;
  og: Record<string, string>;
  mailtoLinks: string[];
  bodyText: string;
}

export interface JsonLdNode {
  "@type"?: string | string[];
  [key: string]: unknown;
}

function collectTypes(node: JsonLdNode): string[] {
  const t = node["@type"];
  if (!t) return [];
  return Array.isArray(t) ? t.map(String) : [String(t)];
}

/** Flatten JSON-LD: top-level, arrays, and @graph entries all become nodes. */
function flattenJsonLd(value: unknown, out: JsonLdNode[]): void {
  if (Array.isArray(value)) {
    for (const v of value) flattenJsonLd(v, out);
    return;
  }
  if (value && typeof value === "object") {
    const node = value as JsonLdNode;
    if (Array.isArray(node["@graph"])) {
      flattenJsonLd(node["@graph"], out);
    }
    if (node["@type"]) out.push(node);
  }
}

export function parsePage(html: string): ParsedPage {
  const $ = cheerio.load(html);

  const jsonLd: JsonLdNode[] = [];
  let jsonLdBlockCount = 0;
  let jsonLdParseErrors = 0;
  $('script[type="application/ld+json"]').each((_, el) => {
    jsonLdBlockCount++;
    const raw = $(el).contents().text();
    if (!raw.trim()) {
      jsonLdParseErrors++;
      return;
    }
    try {
      flattenJsonLd(JSON.parse(raw), jsonLd);
    } catch {
      jsonLdParseErrors++;
    }
  });

  const og: Record<string, string> = {};
  $('meta[property^="og:"]').each((_, el) => {
    const prop = $(el).attr("property");
    const content = $(el).attr("content");
    if (prop && content) og[prop] = content;
  });

  const mailtoLinks: string[] = [];
  $('a[href^="mailto:"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href) mailtoLinks.push(href.replace(/^mailto:/i, "").split("?")[0].trim());
  });

  const title = $("head > title").first().text().trim() || null;
  const metaDescription =
    $('meta[name="description"]').attr("content")?.trim() || null;
  const lang = $("html").attr("lang")?.trim() || null;
  const generator =
    $('meta[name="generator"]').attr("content")?.trim() || null;

  return {
    $,
    title,
    metaDescription,
    lang,
    generator,
    jsonLd,
    jsonLdBlockCount,
    jsonLdParseErrors,
    og,
    mailtoLinks,
    bodyText: $("body").text().replace(/\s+/g, " ").trim(),
  };
}

export { collectTypes };
