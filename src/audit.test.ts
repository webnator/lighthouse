import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { audit, auditHtml, score, formatReport } from './index.js';
import { fetchDocument } from './network.js';
import { parse } from 'yaml';
const good = `<!doctype html><html lang="en"><head><title>Example guide</title><meta name="description" content="A useful guide"><link rel="canonical" href="https://example.com/guide"><script type="application/ld+json">{"@type":"Article","author":{"name":"Example"}}</script></head><body><main><h1>A guide</h1><p>${'Useful information about the subject. '.repeat(8)}</p></main></body></html>`;
test('well-described HTML and optional discovery do not create false penalties', () => {
  const report = auditHtml(good);
  assert.equal(report.scores.overall, 100);
  assert.equal(report.checks.find(c => c.id === 'geo.llms-txt')?.status, 'skip');
  assert.equal(auditHtml(good, { llmsTxt: '' }).scores.overall, 100);
  assert.equal(score([]), null);
});
test('bad structured data, noindex and script-only text are visible findings', () => {
  const r = auditHtml('<html><head><meta name="robots" content="noindex"><script type="application/ld+json">broken</script></head><body><script>'+ 'content'.repeat(100) +'</script></body></html>');
  assert.equal(r.checks.find(c => c.id === 'seo.indexability')?.status, 'fail');
  assert.equal(r.checks.find(c => c.id === 'geo.extractable-text')?.status, 'warn');
  assert.equal(r.checks.find(c => c.id === 'geo.structured-data')?.status, 'warn');
});
test('JSON and YAML round trip; SARIF has standard version', () => {
  const r = auditHtml(good, { fetchedAt: '2026-01-01T00:00:00Z' });
  assert.deepEqual(JSON.parse(formatReport(r,'json')),r);
  assert.deepEqual(parse(formatReport(r,'yaml')),r);
  assert.equal(JSON.parse(formatReport(r,'sarif')).version,'2.1.0');
  assert.match(formatReport(r,'txt'), /overall=100/);
});
test('network redirects, failures and byte limits', async () => {
  const server = createServer((req,res) => {
    if (req.url === '/redirect') { res.writeHead(302, { location: '/' }); res.end(); }
    else if (req.url === '/') { res.setHeader('content-type','text/html'); res.end(good); }
    else { res.writeHead(404); res.end('missing'); }
  });
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  try {
    assert.equal((await audit(url+'/redirect')).scores.overall,100);
    const failed = await audit(url+'/missing'); assert.equal(failed.reachable,false); assert.equal(failed.scores.overall,null);
    assert.equal((await fetchDocument(url,{maxBytes:2})).ok,false);
    assert.equal((await fetchDocument(url+'/redirect',{maxRedirects:0})).ok,false);
    assert.equal((await fetchDocument('file:///etc/passwd')).ok,false);
    assert.equal((await fetchDocument('https://user:password@example.com')).ok,false);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve())); }
});
