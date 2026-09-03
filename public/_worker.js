// Cloudflare Pages – der ganze Server, den diese Seite braucht.
//
// Zwei Aufgaben:
//  1. /api/ai  – reicht eine KI-Anfrage weiter, falls der Browser die
//     Direktanfrage blockiert. Der Schlüssel kommt aus dem Browser mit und
//     wird nur durchgereicht, nie gespeichert und nirgends protokolliert.
//  2. /api/img – holt ein Bild, das die Quelle nicht direkt herausgibt.
//
// Alles andere sind die statischen Dateien. Jede Antwort bekommt
// „noindex“, damit die Seite in keiner Suchmaschine auftaucht.

const NOINDEX = 'noindex, nofollow, noarchive, noimageindex';

const AI_ENDPOINTS = {
  anthropic: 'https://api.anthropic.com/v1/messages',
  openai: 'https://api.openai.com/v1/chat/completions'
};

// Nur von hier dürfen Bilder geholt werden – ein offener Proxy wäre eine
// Einladung, die Seite als Umleitung für Fremdinhalte zu missbrauchen.
const IMAGE_HOSTS = [
  'upload.wikimedia.org',
  'commons.wikimedia.org',
  'api.openverse.org',
  'openverse-api.org'
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/ai') return handleAI(request);
    if (url.pathname === '/api/img') return handleImage(url);

    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set('X-Robots-Tag', NOINDEX);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'no-referrer');
    return new Response(response.body, { status: response.status, headers });
  }
};

async function handleAI(request) {
  if (request.method !== 'POST') return json({ error: { message: 'Nur POST.' } }, 405);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: { message: 'Anfrage nicht lesbar.' } }, 400);
  }

  const endpoint = AI_ENDPOINTS[body.provider];
  if (!endpoint || !body.key || !body.payload) {
    return json({ error: { message: 'Anbieter, Schlüssel oder Inhalt fehlt.' } }, 400);
  }

  const headers = { 'content-type': 'application/json' };
  if (body.provider === 'anthropic') {
    headers['x-api-key'] = body.key;
    headers['anthropic-version'] = '2023-06-01';
  } else {
    headers.authorization = `Bearer ${body.key}`;
  }

  const upstream = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body.payload)
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'content-type': 'application/json', 'X-Robots-Tag': NOINDEX }
  });
}

async function handleImage(url) {
  const target = url.searchParams.get('url');
  if (!target) return new Response('Kein Bild angegeben.', { status: 400 });

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return new Response('Ungültige Adresse.', { status: 400 });
  }
  if (parsed.protocol !== 'https:' || !IMAGE_HOSTS.includes(parsed.hostname)) {
    return new Response('Diese Quelle ist nicht freigegeben.', { status: 403 });
  }

  const upstream = await fetch(parsed.toString(), {
    headers: { 'user-agent': 'Arbeitsblatt/1.0 (Unterrichtsmaterial)' }
  });
  if (!upstream.ok) return new Response('Das Bild ist nicht erreichbar.', { status: upstream.status });

  const type = upstream.headers.get('content-type') || '';
  if (!type.startsWith('image/')) return new Response('Das ist kein Bild.', { status: 415 });

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': type,
      'cache-control': 'public, max-age=86400',
      'X-Robots-Tag': NOINDEX
    }
  });
}

function json(payload, status) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', 'X-Robots-Tag': NOINDEX }
  });
}
