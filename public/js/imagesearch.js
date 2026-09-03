// Bildersuche in Wikimedia Commons und Openverse. Beide Dienste erlauben
// Anfragen direkt aus dem Browser; die Bilddaten holt bei Bedarf der Proxy,
// damit sie sich auch dann ins PDF legen lassen, wenn die Quelle das
// Einbetten sonst untersagt.

export const SOURCES = {
  commons: 'Wikimedia Commons',
  openverse: 'Openverse'
};

function stripHTML(text) {
  const div = document.createElement('div');
  div.innerHTML = text || '';
  return (div.textContent || '').trim();
}

export async function search(query, source, animatedOnly = false) {
  if (!query.trim()) return [];
  return source === 'openverse'
    ? await searchOpenverse(query, animatedOnly)
    : await searchCommons(query, animatedOnly);
}

async function searchCommons(query, animatedOnly) {
  // `filemime` ist der Filter, den die Commons-Suche wirklich versteht.
  const term = animatedOnly ? `${query} filemime:image/gif` : query;
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', origin: '*',
    generator: 'search', gsrsearch: term, gsrnamespace: '6', gsrlimit: '40',
    prop: 'imageinfo', iiprop: 'url|mime|extmetadata', iiurlwidth: '400'
  }).toString();

  const payload = await (await fetch(url)).json();
  return (payload.query?.pages || []).map((page) => {
    const info = page.imageinfo?.[0];
    if (!info?.thumburl || !info?.url) return null;
    const animated = (info.mime || '').includes('gif');
    const artist = stripHTML(info.extmetadata?.Artist?.value);
    const license = stripHTML(info.extmetadata?.LicenseShortName?.value);
    const credit = [artist, license].filter(Boolean).join(' · ') || 'Wikimedia Commons';
    return {
      id: `commons-${page.pageid}`,
      thumbnailURL: info.thumburl,
      // Animierte Bilder brauchen das Original, sonst steht das Bild still.
      downloadURL: animated ? info.url : info.thumburl,
      title: (page.title || '').replace('File:', ''),
      credit: credit.slice(0, 90),
      pageURL: info.descriptionurl || '',
      source: 'commons'
    };
  }).filter(Boolean);
}

async function searchOpenverse(query, animatedOnly) {
  const url = new URL('https://api.openverse.org/v1/images/');
  const params = { q: query, page_size: '40' };
  if (animatedOnly) params.extension = 'gif';
  url.search = new URLSearchParams(params).toString();

  const payload = await (await fetch(url)).json();
  return (payload.results || []).map((result) => {
    if (!result.url) return null;
    const credit = [result.creator || '', (result.license || '').toUpperCase()]
      .filter(Boolean).join(' · ') || 'Openverse';
    return {
      id: `openverse-${result.id}`,
      thumbnailURL: result.thumbnail || result.url,
      downloadURL: result.url,
      title: result.title || 'Bild',
      credit: credit.slice(0, 90),
      pageURL: result.foreign_landing_url || '',
      source: 'openverse'
    };
  }).filter(Boolean);
}

/** Holt ein Bild und liefert es als Data-URL samt Maßen zurück. */
export async function download(item) {
  const attempts = [item.downloadURL, `/api/img?url=${encodeURIComponent(item.downloadURL)}`];
  let lastError = null;

  for (const url of attempts) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      return await toDataURL(blob);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Das Bild konnte nicht geladen werden. ${lastError?.message || ''}`);
}

/** Bilder aus der Fotomediathek oder vom Rechner. */
export function readFile(file) {
  return toDataURL(file);
}

async function toDataURL(blob) {
  const dataURL = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  const { width, height, normalized } = await measureImage(dataURL);
  return { dataURL: normalized, width, height };
}

/**
 * Misst das Bild aus und wandelt alles außer PNG/JPEG in PNG um – SVG und
 * WebP kann das PDF sonst nicht aufnehmen.
 */
function measureImage(dataURL) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const supported = /^data:image\/(png|jpe?g)/i.test(dataURL);
      if (supported) {
        resolve({ width: image.naturalWidth, height: image.naturalHeight, normalized: dataURL });
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth || 800;
      canvas.height = image.naturalHeight || 600;
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve({ width: canvas.width, height: canvas.height, normalized: canvas.toDataURL('image/png') });
    };
    image.onerror = () => reject(new Error('Die Datei ist kein unterstütztes Bild.'));
    image.src = dataURL;
  });
}
