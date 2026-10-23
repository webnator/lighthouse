# SEO GEO Audit

A small TypeScript library and CLI for repeatable SEO and content-extraction checks. Audit fetched HTML or a local HTML file, export JSON/YAML/text/SARIF, and fail a CI job when a checklist score falls below your threshold.

This project started as a private tool named Lighthouse. It is independent of **Google Lighthouse** and does not measure browser performance or Core Web Vitals.

## Install

Requires Node.js 22 or newer.

```sh
npm install @webnator/seo-geo-audit
npx @webnator/seo-geo-audit https://example.com --format json
```

## Install from source

Requires Node.js 22 or newer.

```sh
git clone https://github.com/webnator/lighthouse.git
cd lighthouse
npm ci
npm test
npm run build
node dist/cli.js --help
```

Package: `@webnator/seo-geo-audit`. The CLI command after installation is `seo-geo-audit`.

## CLI

```sh
node dist/cli.js https://example.com --format json
node dist/cli.js --html ./public/index.html --format yaml --output audit.yaml
node dist/cli.js https://example.com --artifacts ./artifacts --min-score 75
node dist/cli.js --html ./public/index.html --fail-on fail
```

- `--format`: `json`, `yaml`, `txt` (default), or `sarif`.
- `--output`: write the selected report to a file instead of stdout.
- `--artifacts`: create a directory containing all four report formats.
- `--min-score`: fail below an overall score from 0 to 100.
- `--fail-on fail`: fail on any failed check. `--fail-on warn` also fails on warnings.
- Exit **0**: audit completed and gates passed. **1**: a requested gate failed. **2**: invalid input, unreachable page or an output error.

Scores alone do not change the exit status unless you request a gate. Artifacts are written before evaluating gates. A failed fetch produces null scores rather than a misleading zero-quality score.

## Library

With the npm package installed:

```js
import { audit, auditHtml, formatReport } from '@webnator/seo-geo-audit';

const report = await audit('https://example.com', {
  timeoutMs: 10_000,
  maxBytes: 2_000_000,
  maxRedirects: 5,
});
console.log(report.scores);
console.log(formatReport(report, 'yaml'));

const local = auditHtml('<html lang="en"><head><title>Guide</title></head><body><main><h1>Guide</h1></main></body></html>', {
  url: 'https://example.com/guide',
  fetchedAt: '2026-01-01T00:00:00Z', // optional, useful for reproducible fixtures
});
```

`auditHtml` performs no network calls. You can supply `robots`, `sitemap`, `llmsTxt` and lowercase response `headers` when your own crawler already fetched them. `audit` requests the page and the root `/robots.txt`, `/sitemap.xml`, `/llms.txt` paths; it does not crawl the whole site or execute JavaScript.

## What the scores mean

SEO checks cover title, description, heading convention, language, canonical URL, noindex directives and missing image alt attributes. GEO checks cover typed JSON-LD, extractable HTML text, semantic structure and attribution metadata.

Each check exposes its stable ID, status, weight and explanation. The score is the weighted percentage with **pass = 1**, **warn = 0.5**, **fail = 0**. Skipped and zero-weight checks are excluded. Overall combines eligible checks; category scores use their own checks. An empty denominator returns null. Report schema version is `1`.

GEO here means a transparent content-readiness checklist. It does not measure whether a model will cite you. `llms.txt`, root robots discovery and root sitemap discovery are informational, zero-weight checks. Missing FAQ or Organization schema does not automatically fail a non-business page. JSON-LD presence is not full schema validation. A noindex finding can be correct for a staging page.

Search providers do not publish a universal GEO score. Google's guidance says its AI features use the same SEO foundations, without additional special requirements: https://developers.google.com/search/docs/appearance/ai-features

## CI

Run against your generated HTML after the site's build step. With a checkout of this tool available:

```sh
node /path/to/lighthouse/dist/cli.js --html dist/index.html --artifacts audit-artifacts --min-score 75
```

Example GitHub Actions artifact step (after running the audit):

```yaml
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: seo-geo-audit
    path: audit-artifacts/
```

Choose a threshold that fits your pages, inspect findings and track changes. A higher checklist score is not proof of better ranking. SARIF output has rule IDs and messages, but no invented source line locations.

## Network boundaries

Use URL mode for destinations you trust and are authorized to audit. Localhost URLs are supported for development. **Do not expose `audit(userSuppliedUrl)` as an unrestricted public service**: it can reach networks available to its process, including through redirects. A hosted wrapper needs destination validation, DNS/egress controls and resource limits of its own. Use `auditHtml` when accepting untrusted inputs from other users. URLs with embedded credentials and non-HTTP protocols are rejected. Responses are bounded and time-limited; HTML is decoded as UTF-8.

Reports may include page titles and URLs. Review artifacts before publishing them if auditing private sites.

## Extend

`src/index.ts` owns the checks and score calculation; `parse.ts` parses HTML; `network.ts` handles bounded fetching; `reporters.ts` contains pure serializers; `cli.ts` maps arguments and exit codes. Add a stable check ID, category, explicit weight and a fixture test. Keep recommendations distinct from facts observed in the page. Avoid introducing LLM calls into deterministic checks.

```sh
npm test
npm run typecheck
npm pack --dry-run
npm pack
# Install the resulting tarball in a separate project to test its public API.
```

Maintainers: authenticate with npm, confirm control of the package scope, then `npm publish --access public`. Inspect the tarball first. Never commit an npm token. MIT licensed.
