import { stringify } from 'yaml';
import type { AuditReport } from './index.js';
export type Format = 'json' | 'yaml' | 'txt' | 'sarif';
export function formatReport(report: AuditReport, format: Format): string {
  if (format === 'json') return JSON.stringify(report, null, 2) + '\n';
  if (format === 'yaml') return stringify(report);
  if (format === 'txt') return [`SEO/GEO audit: ${report.url}`, `Reachable: ${report.reachable}`, `Scores: overall=${report.scores.overall ?? 'n/a'}, seo=${report.scores.seo ?? 'n/a'}, geo=${report.scores.geo ?? 'n/a'}`, ...report.checks.map(c => `[${c.status}] ${c.id}: ${c.detail}`), ...report.notes.map(n => `Note: ${n}`)].join('\n') + '\n';
  if (format === 'sarif') return JSON.stringify({ version: '2.1.0', $schema: 'https://json.schemastore.org/sarif-2.1.0.json', runs: [{ tool: { driver: { name: 'seo-geo-audit', rules: report.checks.map(c => ({ id: c.id, shortDescription: { text: c.id } })) } }, invocations: [{ executionSuccessful: report.reachable }], results: report.checks.filter(c => c.status === 'fail' || c.status === 'warn').map(c => ({ ruleId: c.id, level: c.status === 'fail' ? 'error' : 'warning', message: { text: c.detail } })) }] }, null, 2) + '\n';
  throw new Error(`Unknown format: ${format}`);
}
