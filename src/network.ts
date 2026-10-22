export interface FetchOptions { timeoutMs?: number; maxBytes?: number; maxRedirects?: number }
export async function fetchDocument(input: string, opts: FetchOptions = {}) {
  let url = input;
  const headers: Record<string, string> = {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15000);
  try {
    for (let redirects = 0; redirects <= (opts.maxRedirects ?? 5); redirects++) {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Only HTTP(S) URLs without embedded credentials are accepted.');
      const res = await fetch(url, { redirect: 'manual', signal: controller.signal, headers: { 'user-agent': 'seo-geo-audit/0.1' } });
      if ([301,302,303,307,308].includes(res.status) && res.headers.has('location')) {
        await res.body?.cancel(); url = new URL(res.headers.get('location')!, url).href; continue;
      }
      res.headers.forEach((v,k) => { headers[k] = v; });
      const chunks: Uint8Array[] = []; let bytes = 0;
      if (res.body) for await (const chunk of res.body) {
        bytes += chunk.length;
        if (bytes > (opts.maxBytes ?? 2_000_000)) throw new Error('Response exceeds byte limit.');
        chunks.push(chunk);
      }
      return { ok: res.ok, status: res.status, url, body: Buffer.concat(chunks).toString('utf8'), headers, error: undefined };
    }
    throw new Error('Too many redirects.');
  } catch (error) {
    return { ok: false, status: 0, url, body: '', headers, error: error instanceof Error ? error.message : String(error) };
  } finally { clearTimeout(timer); }
}
