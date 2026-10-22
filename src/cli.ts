#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { audit, auditHtml, formatReport } from './index.js';
import type { Format } from './reporters.js';
async function main() {
  const { values: v, positionals } = parseArgs({ allowPositionals: true, options: {
    help: { type: 'boolean' }, html: { type: 'string' }, format: { type: 'string', default: 'txt' },
    output: { type: 'string' }, artifacts: { type: 'string' }, 'min-score': { type: 'string' }, 'fail-on': { type: 'string' }
  } });
  if (v.help) { console.log('seo-geo-audit <url> | --html file.html [--format json|yaml|txt|sarif] [--output file] [--artifacts dir] [--min-score 0..100] [--fail-on fail|warn]\nExit: 0 completed/passed, 1 gate failed, 2 input/network error.'); return; }
  if ((!!v.html && positionals.length) || (!v.html && positionals.length !== 1)) throw new Error('Provide exactly one URL or --html file.');
  if (!['json','yaml','txt','sarif'].includes(v.format!)) throw new Error('Unsupported output format.');
  const min = v['min-score'] === undefined ? undefined : Number(v['min-score']);
  if (min !== undefined && (!Number.isFinite(min) || min < 0 || min > 100)) throw new Error('--min-score must be between 0 and 100.');
  if (v['fail-on'] && !['fail','warn'].includes(v['fail-on'])) throw new Error('--fail-on must be fail or warn.');
  const report = v.html ? auditHtml(await readFile(v.html, 'utf8')) : await audit(positionals[0]);
  const rendered = formatReport(report, v.format as Format);
  if (v.output) await writeFile(v.output, rendered); else process.stdout.write(rendered);
  if (v.artifacts) {
    await mkdir(v.artifacts, { recursive: true });
    for (const format of ['json','yaml','txt','sarif'] as Format[]) await writeFile(join(v.artifacts, `audit.${format}`), formatReport(report, format));
  }
  if (!report.reachable) { process.exitCode = 2; return; }
  if ((min !== undefined && (report.scores.overall === null || report.scores.overall < min)) || (v['fail-on'] && report.checks.some(c => c.status === 'fail' || (v['fail-on'] === 'warn' && c.status === 'warn')))) process.exitCode = 1;
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 2; });
