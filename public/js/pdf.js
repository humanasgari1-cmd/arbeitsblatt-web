// PDF-Ausgabe. Zeichnet die Blöcke aus layout.js in die RWB-Vorlage –
// dieselbe Paginierung wie die Seitenzahl-Vorschau, deshalb stimmt beides
// zwangsläufig überein.

import {
  PAGE, COLORS, BASELINE_FACTOR, blocksFor, solutionBlocksFor, paginate,
  blockHeight, layoutRuns, wrappedTextWidth, tableRowHeights, tableRowIndexWidth
} from './layout.js';

const { jsPDF } = window.jspdf;

let assets = { wordmark: null, logo: null };

/** Lädt die beiden Bildmarken der Kopfzeile einmalig als Data-URL. */
export async function loadAssets() {
  const read = async (path) => {
    const response = await fetch(path);
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  };
  const [wordmark, logo] = await Promise.all([read('assets/wordmark.png'), read('assets/logo.png')]);
  assets = { wordmark, logo };
}

function newDoc() {
  return new jsPDF({ unit: 'pt', format: [PAGE.width, PAGE.height], compress: true });
}

/** Ein Dokument nur zum Vermessen – nie gezeichnet, nie gespeichert. */
let measureDoc = null;
export function measure(text, style) {
  if (!measureDoc) measureDoc = newDoc();
  measureDoc.setFont('helvetica', fontStyle(style));
  measureDoc.setFontSize(style.size);
  return measureDoc.getTextWidth(text);
}

function fontStyle(style) {
  if (style.bold && style.italic) return 'bolditalic';
  if (style.bold) return 'bold';
  if (style.italic) return 'italic';
  return 'normal';
}

// MARK: - Öffentliche Aufrufe

export function pageCount(sheet) {
  return paginate(blocksFor(sheet, measure), measure).length;
}

export function buildPDF(sheet) {
  return render(paginate(blocksFor(sheet, measure), measure), sheet);
}

export function buildSolutionsPDF(sheet) {
  return render(paginate(solutionBlocksFor(sheet, measure), measure), sheet);
}

function render(pages, sheet) {
  const doc = newDoc();
  pages.forEach((blocks, index) => {
    if (index > 0) doc.addPage([PAGE.width, PAGE.height]);
    drawHeader(doc, sheet);
    drawFooter(doc, sheet, index + 1, pages.length);
    let cursorY = PAGE.contentTop;
    for (const block of blocks) {
      drawBlock(doc, block, PAGE.sideMargin, cursorY, PAGE.contentWidth);
      cursorY += blockHeight(block, PAGE.contentWidth, measure);
    }
  });
  return doc;
}

// MARK: - Zeichnen

function drawLines(doc, lines, x, y, align = 'left', width = 0) {
  let cursorY = y;
  lines.forEach((line, index) => {
    // Blocksatz: letzte Zeile eines Absatzes bleibt flatterhaft, wie beim
    // Drucksatz üblich – nur zwischen echten Wortzwischenräumen wird
    // gestreckt, nie innerhalb eines Wortes.
    const isLastLine = index === lines.length - 1;
    const justify = align === 'justify' && !isLastLine;
    const spaceCount = justify ? line.pieces.filter((p) => p.kind === 'space').length : 0;
    const extra = justify && spaceCount > 0 ? Math.max(0, width - line.width) / spaceCount : 0;

    let cursorX = x;
    if (!justify) {
      if (align === 'right') cursorX = x + width - line.width;
      else if (align === 'center') cursorX = x + (width - line.width) / 2;
    }
    const baseline = cursorY + (line.size || 12) * BASELINE_FACTOR;
    for (const piece of line.pieces) {
      if (piece.kind === 'space') {
        cursorX += piece.w + extra;
        continue;
      }
      if (piece.text.trim()) {
        doc.setFont('helvetica', fontStyle(piece));
        doc.setFontSize(piece.size);
        doc.setTextColor(piece.color || COLORS.schwarz);
        doc.text(piece.text, cursorX, baseline, piece.kern ? { charSpace: piece.kern } : undefined);
      }
      cursorX += piece.w;
    }
    cursorY += line.height;
  });
}

function drawBlock(doc, block, x, y, width) {
  switch (block.type) {
    case 'text':
      drawLines(doc, layoutRuns(block.runs, width, measure), x, y, block.justify ? 'justify' : 'left', width);
      break;

    case 'heading':
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(block.color);
      doc.text(block.title, x, y + 4 + 14 * BASELINE_FACTOR - 4);
      break;

    case 'callout': {
      const height = blockHeight(block, width, measure);
      doc.setFillColor(block.fill);
      doc.rect(x, y, width, height, 'F');
      doc.setFillColor(block.bar);
      doc.rect(x, y, 3, height, 'F');
      drawLines(doc, layoutRuns(block.runs, width - 22, measure), x + 12, y + 10);
      break;
    }

    case 'image': {
      const imageX = block.align === 'left' ? x
        : block.align === 'right' ? x + width - block.width
        : x + (width - block.width) / 2;
      addImage(doc, block.image, imageX, y, block.width, block.height);
      break;
    }

    case 'wrappedImageText': {
      const imageX = block.align === 'left' ? x : x + width - block.imageWidth;
      addImage(doc, block.image, imageX, y, block.imageWidth, block.imageHeight);
      const textX = block.align === 'left' ? x + block.imageWidth + 12 : x;
      const textWidth = wrappedTextWidth(width, block.imageWidth);
      drawLines(doc, layoutRuns(block.runs, textWidth, measure), textX, y, block.justify ? 'justify' : 'left', textWidth);
      break;
    }

    case 'indexedText': {
      // Nummer in der linken Spalte, Text daneben – bleibt auch in
      // Folgezeilen unter dem Text stehen, nie unter der Nummer.
      const bodyWidth = Math.max(1, width - block.indent);
      if (block.indexRuns && block.indexRuns.length) {
        drawLines(doc, layoutRuns(block.indexRuns, block.indent, measure), x, y, 'left', block.indent);
      }
      drawLines(doc, layoutRuns(block.bodyRuns, bodyWidth, measure), x + block.indent, y,
        block.justify ? 'justify' : 'left', bodyWidth);
      break;
    }

    case 'table':
      drawTable(doc, block, x, y, width);
      break;

    case 'spacer':
    default:
      break;
  }
}

function drawTable(doc, block, x, y, width) {
  const { headerHeight, rowHeights } = tableRowHeights(block, measure);
  const [col1Width, col2Width] = block.colWidths;

  doc.setDrawColor('#000000');
  doc.setLineWidth(0.8);

  doc.rect(x, y, width, headerHeight);
  doc.line(x + col1Width, y, x + col1Width, y + headerHeight);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(COLORS.schwarz);
  doc.text(block.header[0], x + 8, y + headerHeight / 2 + 3.5);
  const col2Label = block.header[1];
  const col2LabelWidth = doc.getTextWidth(col2Label);
  doc.text(col2Label, x + col1Width + (col2Width - col2LabelWidth) / 2, y + headerHeight / 2 + 3.5);

  let rowY = y + headerHeight;
  block.rows.forEach((row, index) => {
    const rowHeight = rowHeights[index];
    doc.rect(x, rowY, width, rowHeight);
    doc.line(x + col1Width, rowY, x + col1Width, rowY + rowHeight);

    const indexWidth = tableRowIndexWidth(row, measure);
    if (indexWidth) {
      drawLines(doc, layoutRuns(row.indexRuns, indexWidth, measure), x + 8, rowY + 8, 'left', indexWidth);
    }
    const textWidth = col1Width - 16 - indexWidth;
    drawLines(doc, layoutRuns(row.runs, textWidth, measure), x + 8 + indexWidth, rowY + 8, 'left', textWidth);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(COLORS.schwarz);
    const ptText = String(row.points);
    const ptWidth = doc.getTextWidth(ptText);
    doc.text(ptText, x + col1Width + (col2Width - ptWidth) / 2, rowY + rowHeight / 2 + 4);

    rowY += rowHeight;
  });
}

function addImage(doc, image, x, y, width, height) {
  try {
    const format = /^data:image\/jpe?g/i.test(image.dataURL) ? 'JPEG' : 'PNG';
    doc.addImage(image.dataURL, format, x, y, width, height);
  } catch (error) {
    console.warn('Bild konnte nicht ins PDF übernommen werden', error);
  }
}

function drawHeader(doc, sheet) {
  if (assets.wordmark) {
    try { doc.addImage(assets.wordmark, 'PNG', PAGE.sideMargin, 18, 55, 24); } catch (e) { /* egal */ }
  }
  if (assets.logo) {
    try { doc.addImage(assets.logo, 'PNG', PAGE.width - PAGE.sideMargin - 30, 18, 30, 33); } catch (e) { /* egal */ }
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(COLORS.grau);
  doc.text(`${sheet.subjectLine || 'Biologie'}  ·  ${sheet.schoolClass}  ·  ${sheet.term}`,
    PAGE.sideMargin, 52 + 9 * 0.95);

  const ruleY = PAGE.topMargin + PAGE.headerHeight - 6;
  doc.setDrawColor(COLORS.tuerkis);
  doc.setLineWidth(1.2);
  doc.line(PAGE.sideMargin, ruleY, PAGE.width - PAGE.sideMargin, ruleY);
}

function drawFooter(doc, sheet, page, total) {
  const label = sheet.topic || 'Arbeitsblatt';
  const text = `${label}   ·   Seite ${page} von ${total}`;
  const y = PAGE.height - PAGE.bottomMargin - PAGE.footerHeight + 10;

  doc.setDrawColor('#DDDDDD');
  doc.setLineWidth(0.8);
  doc.line(PAGE.sideMargin, y - 6, PAGE.width - PAGE.sideMargin, y - 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor('#999999');
  const width = doc.getTextWidth(text);
  doc.text(text, PAGE.width - PAGE.sideMargin - width, y + 7);
}
