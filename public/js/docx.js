// Word-Export (.docx) – Layout, Farben und Maße wie im iPad-Generator.
// Eine .docx ist ein ZIP mit festgelegten XML-Dateien darin; gepackt wird
// unkomprimiert („stored“), das liest Word genauso.

import { infoParagraphs, filledTasks, operatorSuffix, taskContinuation, TEXT_SIZES } from './model.js';

const ROT = 'A11C2A';
const DUNKEL = '1B2B45';
const TUERKIS = '1FB7C9';
const GOLD = 'E8AB1F';
const GRAU = '555555';

const PAGE_WIDTH = 11906;
const PAGE_HEIGHT = 16838;
const SIDE_MARGIN = 1080;
const USABLE_WIDTH = PAGE_WIDTH - 2 * SIDE_MARGIN;
const EMU_PER_PIXEL = 9525;

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

// MARK: - ZIP

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function concat(chunks) {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
  return out;
}

const le16 = (v) => new Uint8Array([v & 0xFF, (v >> 8) & 0xFF]);
const le32 = (v) => new Uint8Array([v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]);

/** Minimaler ZIP-Schreiber ohne Kompression. */
export function writeZip(entries) {
  const body = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.path);
    const data = entry.data;
    const crc = crc32(data);
    const size = data.length;

    const local = concat([
      le32(0x04034b50), le16(20), le16(0), le16(0), le16(0), le16(0),
      le32(crc), le32(size), le32(size), le16(name.length), le16(0), name, data
    ]);
    body.push(local);

    central.push(concat([
      le32(0x02014b50), le16(20), le16(20), le16(0), le16(0), le16(0), le16(0),
      le32(crc), le32(size), le32(size), le16(name.length),
      le16(0), le16(0), le16(0), le16(0), le32(0), le32(offset), name
    ]));
    offset += local.length;
  }

  const centralBytes = concat(central);
  const end = concat([
    le32(0x06054b50), le16(0), le16(0), le16(entries.length), le16(entries.length),
    le32(centralBytes.length), le32(offset), le16(0)
  ]);
  return concat([concat(body), centralBytes, end]);
}

function bytesFromDataURL(dataURL) {
  const base64 = dataURL.split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const utf8 = (text) => new TextEncoder().encode(text);

// MARK: - Dokument

export async function buildDocx(sheet, assetPaths = { wordmark: 'assets/wordmark.png', logo: 'assets/logo.png' }) {
  const hasImage = Boolean(sheet.imageDataURL);
  const entries = [];

  entries.push({ path: '[Content_Types].xml', data: utf8(contentTypes(hasImage)) });
  entries.push({ path: '_rels/.rels', data: utf8(ROOT_RELS) });
  entries.push({ path: 'word/document.xml', data: utf8(documentXML(sheet)) });
  entries.push({ path: 'word/_rels/document.xml.rels', data: utf8(documentRels(sheet)) });
  entries.push({ path: 'word/header1.xml', data: utf8(headerXML(sheet)) });
  entries.push({ path: 'word/_rels/header1.xml.rels', data: utf8(HEADER_RELS) });
  entries.push({ path: 'word/footer1.xml', data: utf8(footerXML(sheet)) });

  const fetchBytes = async (path) => new Uint8Array(await (await fetch(path)).arrayBuffer());
  entries.push({ path: 'word/media/wordmark.png', data: await fetchBytes(assetPaths.wordmark) });
  entries.push({ path: 'word/media/logo.png', data: await fetchBytes(assetPaths.logo) });

  if (hasImage) {
    const isPNG = !/^data:image\/jpe?g/i.test(sheet.imageDataURL);
    entries.push({
      path: isPNG ? 'word/media/bild.png' : 'word/media/bild.jpg',
      data: bytesFromDataURL(sheet.imageDataURL)
    });
  }

  return writeZip(entries);
}

function contentTypes(hasImage) {
  let defaults = '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Default Extension="png" ContentType="image/png"/>';
  if (hasImage) defaults += '<Default Extension="jpg" ContentType="image/jpeg"/>';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${defaults}` +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' +
    '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' +
    '</Types>';
}

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

const HEADER_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/wordmark.png"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.png"/></Relationships>`;

function documentRels(sheet) {
  let rels = '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>';
  if (sheet.imageDataURL) {
    const name = /^data:image\/jpe?g/i.test(sheet.imageDataURL) ? 'bild.jpg' : 'bild.png';
    rels += `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${name}"/>`;
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`;
}

function headerXML(sheet) {
  const logoCellWidth = 900;
  const markCellWidth = USABLE_WIDTH - logoCellWidth;
  const noBorders = '<w:tblBorders><w:top w:val="none"/><w:bottom w:val="none"/><w:left w:val="none"/><w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/></w:tblBorders>';
  const noMargins = '<w:tcMar><w:top w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tcMar>';

  const table = `<w:tbl><w:tblPr><w:tblW w:w="${USABLE_WIDTH}" w:type="dxa"/>${noBorders}</w:tblPr>` +
    `<w:tblGrid><w:gridCol w:w="${markCellWidth}"/><w:gridCol w:w="${logoCellWidth}"/></w:tblGrid><w:tr>` +
    `<w:tc><w:tcPr><w:tcW w:w="${markCellWidth}" w:type="dxa"/><w:vAlign w:val="center"/>${noMargins}</w:tcPr>` +
    `<w:p><w:pPr><w:spacing w:after="0"/></w:pPr>${inlineImage(101, 'rId1', 'wordmark', 55, 24)}</w:p></w:tc>` +
    `<w:tc><w:tcPr><w:tcW w:w="${logoCellWidth}" w:type="dxa"/><w:vAlign w:val="center"/>${noMargins}</w:tcPr>` +
    `<w:p><w:pPr><w:jc w:val="right"/><w:spacing w:after="0"/></w:pPr>${inlineImage(102, 'rId2', 'logo', 38, 42)}</w:p></w:tc>` +
    '</w:tr></w:tbl>';

  const line = `${sheet.subjectLine || 'Biologie'}  ·  ${sheet.schoolClass}  ·  ${sheet.term}`;
  const subject = `<w:p><w:pPr><w:spacing w:before="40" w:after="0"/></w:pPr><w:r><w:rPr><w:sz w:val="18"/><w:color w:val="${GRAU}"/></w:rPr><w:t xml:space="preserve">${escapeXML(line)}</w:t></w:r></w:p>`;
  const rule = `<w:p><w:pPr><w:spacing w:before="60" w:after="200"/><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="0" w:color="${TUERKIS}"/></w:pBdr></w:pPr><w:r><w:rPr><w:sz w:val="2"/></w:rPr><w:t></w:t></w:r></w:p>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr ${NS}>${table}${subject}${rule}</w:hdr>`;
}

function footerXML(sheet) {
  const label = sheet.topic || 'Arbeitsblatt';
  const grey = '<w:sz w:val="15"/><w:color w:val="999999"/>';
  const field = (instruction) =>
    `<w:r><w:rPr>${grey}</w:rPr><w:fldChar w:fldCharType="begin"/></w:r>` +
    `<w:r><w:rPr>${grey}</w:rPr><w:instrText xml:space="preserve"> ${instruction} </w:instrText></w:r>` +
    `<w:r><w:rPr>${grey}</w:rPr><w:fldChar w:fldCharType="end"/></w:r>`;

  const body = `<w:r><w:rPr>${grey}</w:rPr><w:t xml:space="preserve">${escapeXML(label)}   ·   Seite </w:t></w:r>` +
    field('PAGE') + `<w:r><w:rPr>${grey}</w:rPr><w:t xml:space="preserve"> von </w:t></w:r>` + field('NUMPAGES');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr ${NS}><w:p><w:pPr><w:jc w:val="right"/><w:spacing w:before="120"/><w:pBdr><w:top w:val="single" w:sz="4" w:space="0" w:color="DDDDDD"/></w:pBdr></w:pPr>${body}</w:p></w:ftr>`;
}

function documentXML(sheet) {
  let body = '';
  const bodySize = TEXT_SIZES[sheet.textSize].wordBodySize;
  const lineHeight = Math.round(240 * 1.3);

  const titleSpacing = sheet.subtitle ? 40 : 160;
  body += `<w:p><w:pPr><w:spacing w:after="${titleSpacing}"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="${DUNKEL}"/><w:sz w:val="32"/></w:rPr><w:t xml:space="preserve">${escapeXML(sheet.topic || 'Ohne Titel')}</w:t></w:r></w:p>`;
  if (sheet.subtitle) {
    body += `<w:p><w:pPr><w:spacing w:after="200"/></w:pPr>${boldRunsXML(sheet.subtitle, 20, true, GRAU)}</w:p>`;
  }

  if (sheet.guidingQuestion) {
    const label = `<w:p><w:pPr><w:spacing w:after="60"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="17"/><w:color w:val="${TUERKIS}"/><w:spacing w:val="30"/></w:rPr><w:t>LEITFRAGE DIESER STUNDE</w:t></w:r></w:p>`;
    const text = `<w:p><w:pPr><w:spacing w:after="0" w:line="${lineHeight}" w:lineRule="auto"/></w:pPr>${boldRunsXML(sheet.guidingQuestion, bodySize, true, DUNKEL)}</w:p>`;
    body += calloutBox('EAF8FA', TUERKIS, label + text);
  }

  const tasks = filledTasks(sheet);
  if (tasks.length) {
    body += sectionHeading('Aufgaben');
    tasks.forEach((task, index) => {
      body += `<w:p><w:pPr><w:spacing w:after="120" w:line="${lineHeight}" w:lineRule="auto"/></w:pPr>` +
        `<w:r><w:rPr><w:b/><w:sz w:val="${bodySize}"/><w:color w:val="${ROT}"/></w:rPr><w:t xml:space="preserve">${index + 1}   </w:t></w:r>` +
        `<w:r><w:rPr><w:b/><w:sz w:val="${bodySize}"/></w:rPr><w:t xml:space="preserve">${escapeXML(task.operator.name)}${operatorSuffix(task)}</w:t></w:r>` +
        boldRunsXML(taskContinuation(task), bodySize) +
        `<w:r><w:rPr><w:i/><w:sz w:val="17"/><w:color w:val="8A8A8A"/></w:rPr><w:t xml:space="preserve">   (${escapeXML(task.operator.afb)})</w:t></w:r></w:p>`;
    });
  }

  const paragraphs = infoParagraphs(sheet);
  if (paragraphs.length) body += sectionHeading('Informationstext');

  const floats = Boolean(sheet.imageDataURL) && sheet.imagePlacement !== 'center';
  paragraphs.forEach((paragraph, index) => {
    const anchor = index === 0 && floats ? floatingImage(sheet) : '';
    body += `<w:p><w:pPr><w:spacing w:after="100" w:line="${lineHeight}" w:lineRule="auto"/></w:pPr>${anchor}${boldRunsXML(paragraph, bodySize)}</w:p>`;
  });

  if (sheet.imageDataURL && sheet.imagePlacement === 'center') {
    body += '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="60"/></w:pPr>' +
      inlineImage(201, 'rId3', 'bild', Math.round(sheet.imageWidth), scaledImageHeight(sheet)) + '</w:p>';
  }

  if (sheet.imageCaption) {
    const alignment = sheet.imagePlacement === 'center' ? 'center' : 'left';
    body += `<w:p><w:pPr><w:jc w:val="${alignment}"/><w:spacing w:before="40" w:after="140"/></w:pPr><w:r><w:rPr><w:i/><w:sz w:val="16"/><w:color w:val="999999"/></w:rPr><w:t xml:space="preserve">${escapeXML(sheet.imageCaption)}</w:t></w:r></w:p>`;
  }

  if (sheet.memo) {
    const label = '<w:p><w:pPr><w:spacing w:after="70"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="17"/>' +
      `<w:color w:val="8A6A05"/><w:spacing w:val="30"/></w:rPr><w:t>MERKE</w:t></w:r></w:p>`;
    const text = `<w:p><w:pPr><w:spacing w:after="0" w:line="${lineHeight}" w:lineRule="auto"/></w:pPr>${boldRunsXML(sheet.memo, bodySize)}</w:p>`;
    body += calloutBox('FDF6E3', GOLD, label + text);
  }

  const section = '<w:sectPr><w:headerReference w:type="default" r:id="rId1"/><w:footerReference w:type="default" r:id="rId2"/>' +
    `<w:pgSz w:w="${PAGE_WIDTH}" w:h="${PAGE_HEIGHT}"/>` +
    `<w:pgMar w:top="1500" w:right="${SIDE_MARGIN}" w:bottom="900" w:left="${SIDE_MARGIN}" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${NS}><w:body>${body}${section}</w:body></w:document>`;
}

function sectionHeading(title) {
  return `<w:p><w:pPr><w:spacing w:before="200" w:after="100"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="${ROT}"/><w:sz w:val="25"/></w:rPr><w:t xml:space="preserve">${escapeXML(title)}</w:t></w:r></w:p>`;
}

function calloutBox(fill, barColor, content) {
  return `<w:tbl><w:tblPr><w:tblW w:w="${USABLE_WIDTH}" w:type="dxa"/><w:tblBorders><w:top w:val="none"/><w:bottom w:val="none"/>` +
    `<w:left w:val="single" w:sz="24" w:space="0" w:color="${barColor}"/><w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/></w:tblBorders></w:tblPr>` +
    `<w:tblGrid><w:gridCol w:w="${USABLE_WIDTH}"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="${USABLE_WIDTH}" w:type="dxa"/>` +
    `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/><w:tcBorders><w:top w:val="none"/><w:bottom w:val="none"/>` +
    `<w:left w:val="single" w:sz="24" w:space="0" w:color="${barColor}"/><w:right w:val="none"/></w:tcBorders>` +
    '<w:tcMar><w:top w:w="140" w:type="dxa"/><w:bottom w:w="140" w:type="dxa"/><w:left w:w="220" w:type="dxa"/><w:right w:w="200" w:type="dxa"/></w:tcMar></w:tcPr>' +
    `${content}</w:tc></w:tr></w:tbl>`;
}

/** `**…**` wird zu fetten Läufen – die Sternchen landen nie im Dokument. */
function boldRunsXML(text, bodySize, italic = false, color = null) {
  let result = '';
  let rest = String(text ?? '');
  while (true) {
    const start = rest.indexOf('**');
    if (start < 0) break;
    if (start > 0) result += runXML(rest.slice(0, start), false, bodySize, italic, color);
    const after = rest.slice(start + 2);
    const end = after.indexOf('**');
    if (end < 0) return result + runXML(after, false, bodySize, italic, color);
    if (end > 0) result += runXML(after.slice(0, end), true, bodySize, italic, color);
    rest = after.slice(end + 2);
  }
  if (rest) result += runXML(rest, false, bodySize, italic, color);
  return result;
}

function runXML(text, bold, bodySize, italic, color) {
  const weight = bold ? '<w:b/>' : '';
  const style = italic ? '<w:i/>' : '';
  const colorTag = color ? `<w:color w:val="${color}"/>` : '';
  return `<w:r><w:rPr>${weight}${style}${colorTag}<w:sz w:val="${bodySize}"/></w:rPr><w:t xml:space="preserve">${escapeXML(text)}</w:t></w:r>`;
}

function scaledImageHeight(sheet) {
  if (!sheet.imagePixelWidth) return Math.round(sheet.imageWidth);
  const ratio = sheet.imagePixelHeight / sheet.imagePixelWidth;
  return Math.max(1, Math.round(sheet.imageWidth * ratio));
}

function inlineImage(id, relID, name, widthPx, heightPx) {
  const cx = widthPx * EMU_PER_PIXEL;
  const cy = heightPx * EMU_PER_PIXEL;
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:docPr id="${id}" name="${name}"/>${graphic(id, name, relID, cx, cy)}</wp:inline></w:drawing></w:r>`;
}

function floatingImage(sheet) {
  const widthPx = Math.round(sheet.imageWidth);
  const heightPx = scaledImageHeight(sheet);
  const cx = widthPx * EMU_PER_PIXEL;
  const cy = heightPx * EMU_PER_PIXEL;
  const onRight = sheet.imagePlacement === 'right';

  return '<w:r><w:drawing><wp:anchor distT="45720" distB="91440" ' +
    `distL="${onRight ? 137160 : 0}" distR="${onRight ? 0 : 137160}" ` +
    'simplePos="0" relativeHeight="1" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">' +
    '<wp:simplePos x="0" y="0"/>' +
    `<wp:positionH relativeFrom="margin"><wp:align>${onRight ? 'right' : 'left'}</wp:align></wp:positionH>` +
    '<wp:positionV relativeFrom="paragraph"><wp:posOffset>45000</wp:posOffset></wp:positionV>' +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:wrapSquare wrapText="${onRight ? 'left' : 'right'}"/>` +
    `<wp:docPr id="201" name="bild"/>${graphic(201, 'bild', 'rId3', cx, cy)}</wp:anchor></w:drawing></w:r>`;
}

function graphic(id, name, relID, cx, cy) {
  return '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr>' +
    `<pic:cNvPr id="${id}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relID}"/>` +
    '<a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/>' +
    `<a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>`;
}

/** XML 1.0 verträgt keine Steuerzeichen – die kommen aus KI-Antworten und
 *  ließen Word sonst das ganze Dokument als leer verwerfen. */
function escapeXML(text) {
  return String(text ?? '')
    .split('')
    .filter((c) => {
      const code = c.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || code >= 32;
    })
    .join('')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
