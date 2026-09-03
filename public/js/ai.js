// Anfragen an Claude oder OpenAI – mit deinem eigenen Zugangsschlüssel.
// Der Schlüssel bleibt im Browser; ist der Proxy mitveröffentlicht, geht
// die Anfrage über ihn (der Schlüssel wird dabei nur durchgereicht, nie
// gespeichert), sonst direkt vom Browser zum Dienst.

import { loadKey } from './store.js';

export const PROVIDERS = {
  anthropic: {
    label: 'Claude',
    keyHint: 'Schlüssel von console.anthropic.com',
    defaultModel: 'claude-sonnet-5',
    models: [
      { id: 'claude-haiku-4-5', label: 'Haiku 4.5', hint: 'Am günstigsten und am schnellsten.', input: 1, output: 5 },
      { id: 'claude-sonnet-5', label: 'Sonnet 5', hint: 'Guter Mittelweg – im Alltag die sinnvollste Wahl.', input: 2, output: 10 },
      { id: 'claude-opus-5', label: 'Opus 5', hint: 'Am gründlichsten, für knifflige Fachfragen.', input: 5, output: 25 },
      { id: 'claude-fable-5', label: 'Fable 5', hint: 'Das stärkste Modell – und das teuerste.', input: 10, output: 50 }
    ]
  },
  openai: {
    label: 'OpenAI',
    keyHint: 'Schlüssel von platform.openai.com',
    defaultModel: 'gpt-5.6-luna',
    models: [
      { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', hint: 'Sehr günstig und schnell.', input: 0.2, output: 1.2 }
    ]
  }
};

export const EFFORTS = { low: 'Schnell', medium: 'Mittel', high: 'Gründlich' };

export function defaultSettings() {
  return {
    provider: 'anthropic',
    model: PROVIDERS.anthropic.defaultModel,
    effort: 'low',
    systemPrompt: 'Du hilfst einer Lehrkraft im laufenden Unterricht. Antworte knapp, sachlich richtig und auf Deutsch. Wenn du etwas erklärst, denk an Schülerinnen und Schüler als Publikum. Keine Floskeln. Verwende reinen Text ohne Markdown, Sternchen, Überschriften oder Aufzählungszeichen.'
  };
}

export function modelOption(settings) {
  return PROVIDERS[settings.provider].models.find((m) => m.id === settings.model) || null;
}

export function priceLabel(model) {
  const fmt = (v) => (v === Math.round(v) ? String(v) : v.toFixed(2));
  return `${fmt(model.input)} $ / ${fmt(model.output)} $ je Mio. Token`;
}

export function estimatedCost(settings, inputTokens, outputTokens) {
  const model = modelOption(settings);
  if (!model) return null;
  return (inputTokens / 1e6) * model.input + (outputTokens / 1e6) * model.output;
}

export class AIError extends Error {}

function describeHTTP(status, message) {
  switch (true) {
    case status === 401: return 'Der Schlüssel wurde nicht akzeptiert. Prüf ihn in den Einstellungen.';
    case status === 429: return 'Zu viele Anfragen kurz hintereinander. Kurz warten und noch einmal.';
    case status >= 500: return 'Der Dienst hat gerade ein Problem. Versuch es gleich noch einmal.';
    default: return message ? `Fehler ${status}: ${message}` : `Fehler ${status}.`;
  }
}

/** Schickt eine Anfrage und liefert den reinen Text zurück. */
export async function send(messages, settings, signal) {
  const key = loadKey(settings.provider);
  if (!key) {
    throw new AIError(`Es ist noch kein ${PROVIDERS[settings.provider].label}-Schlüssel hinterlegt. Trag ihn unter „Einstellungen“ ein.`);
  }
  const request = settings.provider === 'anthropic'
    ? anthropicRequest(messages, settings, key)
    : openAIRequest(messages, settings, key);

  let response;
  try {
    response = await fetch(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(request.body), signal });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    // Blockiert der Browser die Direktanfrage, läuft sie über den Proxy.
    response = await fetch('/api/ai', {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: settings.provider, key, payload: request.body })
    });
  }

  const text = await response.text();
  let payload = {};
  try { payload = JSON.parse(text); } catch { /* bleibt leer */ }

  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || '';
    throw new AIError(describeHTTP(response.status, String(message).slice(0, 160)));
  }
  return settings.provider === 'anthropic' ? readAnthropic(payload) : readOpenAI(payload);
}

function anthropicRequest(messages, settings, key) {
  const body = {
    model: settings.model,
    max_tokens: 8000,
    system: settings.systemPrompt,
    messages: messages.map((m) => ({ role: m.role, content: m.text }))
  };
  // Haiku 4.5 hat kein adaptives Denken und lehnt `effort` ab.
  if (!/haiku/i.test(settings.model)) body.output_config = { effort: settings.effort };
  return {
    url: 'https://api.anthropic.com/v1/messages',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body
  };
}

function openAIRequest(messages, settings, key) {
  return {
    url: 'https://api.openai.com/v1/chat/completions',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: {
      model: settings.model,
      messages: [{ role: 'developer', content: settings.systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.text }))],
      reasoning_effort: settings.effort,
      max_completion_tokens: 8000
    }
  };
}

function readAnthropic(payload) {
  if (payload.stop_reason === 'refusal') {
    throw new AIError(`Die Anfrage wurde abgelehnt (${payload.stop_details?.category || ''}).`);
  }
  const text = (payload.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
  if (!text) throw new AIError('Die Antwort war nicht lesbar.');
  return text;
}

function readOpenAI(payload) {
  const message = payload.choices?.[0]?.message;
  if (message?.refusal) throw new AIError(`Die Anfrage wurde abgelehnt (${message.refusal}).`);
  if (!message?.content) throw new AIError('Die Antwort war nicht lesbar.');
  return message.content;
}
