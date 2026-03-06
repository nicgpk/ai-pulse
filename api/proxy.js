// Vercel Edge Function — RSS proxy for production
// Forwards RSS/Atom/YouTube feed requests server-side to avoid CORS.
export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get('url');

  if (!target) {
    return new Response('Missing url parameter', { status: 400 });
  }

  try {
    const upstream = await fetch(target, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AI-Pulse/1.0)' },
      signal: AbortSignal.timeout(8000),
    });

    const body = await upstream.text();
    return new Response(body, {
      status: upstream.ok ? 200 : upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'text/xml; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (err) {
    return new Response('Proxy error: ' + err.message, { status: 502 });
  }
}
