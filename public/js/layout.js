// Die Layout-Engine – dieselbe Rolle wie WorksheetPDFExporter auf dem iPad:
// Sie kennt als einzige Stelle das Layout. Seitenzahl-Vorschau,
// Wortzahl-Empfehlung und der fertige PDF-Export laufen alle hier durch,
// deshalb stimmt die angezeigte Seitenzahl mit dem Ergebnis überein.

import { OPERATORS, infoParagraphs, filledTasks, operatorSuffix, taskContinuation, TEXT_SIZES } from './model.js';

export const COLORS = {
  rot: '#A11C2A',
  dunkel: '#1B2B45',
  tuerkis: '#1FB7C9',
  gold: '#E8AB1F',
  grau: '#555555',
  schwarz: '#000000'
};

export const PAGE = {
  width: 595.28,
  height: 841.89,
  sideMargin: 42,
  topMargin: 56,
  bottomMargin: 40,
  headerHeight: 30,
  footerHeight: 22
};
PAGE.contentWidth = PAGE.width - 2 * PAGE.sideMargin;
PAGE.contentTop = PAGE.topMargin + PAGE.headerHeight;
PAGE.contentBottom = PAGE.height - PAGE.bottomMargin - PAGE.footerHeight;
PAGE.contentHeight = PAGE.contentBottom - PAGE.contentTop;

/** 1,3-facher Zeilenabstand wie in der iPad-Vorlage. */
export const LINE_FACTOR = 1.55;
/** Wo die Schriftlinie innerhalb einer Zeile sitzt. */
export const BASELINE_FACTOR = 1.12;

const IMAGE_TEXT_GAP = 12;
const CALLOUT_INSET = 22;

// MARK: - Textläufe

/**
 * Zerlegt Text an `**…**` in fette und normale Läufe – die Sternchen
 * selbst landen nie im Ergebnis, egal in welchem Feld die KI sie gesetzt hat.
 */
export function boldRuns(text, size, base = {}) {
  const runs = [];
  const push = (t, bold) => {
    if (t) runs.push({ text: t, size, bold, italic: !!base.italic, color: base.color || COLORS.schwarz, kern: base.kern || 0 });
  };
  let rest = String(text ?? '');
  while (true) {
    const start = rest.indexOf('**');
    if (start < 0) break;
    push(rest.slice(0, start), false);
    const after = rest.slice(start + 2);
    const end = after.indexOf('**');
    if (end < 0) {
      push(after, false);
      return runs;
    }
    push(after.slice(0, end), true);
    rest = after.slice(end + 2);
  }
  push(rest, false);
  return runs;
}

export function plainRun(text, size, opts = {}) {
  return [{
    text: String(text ?? ''), size,
    bold: !!opts.bold, italic: !!opts.italic,
    color: opts.color || COLORS.schwarz, kern: opts.kern || 0
  }];
}

// MARK: - Zeilenumbruch

/** Zerlegt Läufe in Wörter samt Stil, damit sie einzeln vermessen werden können. */
function tokenize(runs) {
  const tokens = [];
  for (const run of runs) {
    const parts = run.text.split(/(\n|\s+)/);
    for (const part of parts) {
      if (!part) continue;
      if (part === '\n') tokens.push({ ...run, text: '\n', kind: 'break' });
      else if (/^\s+$/.test(part)) tokens.push({ ...run, text: ' ', kind: 'space' });
      else tokens.push({ ...run, text: part, kind: 'word' });
    }
  }
  return tokens;
}

/**
 * Bricht Läufe auf eine Spaltenbreite um. `measure(text, style)` liefert
 * die Breite in Punkt – kommt aus dem PDF-Werkzeug, damit Vorschau,
 * Seitenzahl und Export dieselbe Metrik verwenden.
 */
export function layoutRuns(runs, width, measure) {
  const tokens = tokenize(runs);
  const lines = [];
  let current = { pieces: [], width: 0, size: 0 };

  const flush = () => {
    // Nachlaufende Leerzeichen zählen nicht zur Zeilenbreite.
    while (current.pieces.length && current.pieces[current.pieces.length - 1].kind === 'space') {
      current.pieces.pop();
    }
    current.height = Math.max(current.size || 12, 1) * LINE_FACTOR;
    lines.push(current);
    current = { pieces: [], width: 0, size: 0 };
  };

  for (const token of tokens) {
    if (token.kind === 'break') { flush(); continue; }
    let w = measure(token.text, token) + (token.kern || 0) * token.text.length;

    if (token.kind === 'space') {
      if (!current.pieces.length) continue; // keine führenden Leerzeichen
      current.pieces.push({ ...token, w });
      current.width += w;
      current.size = Math.max(current.size, token.size);
      continue;
    }

    // Lange Komposita: notfalls hart trennen, statt über den Rand zu laufen.
    if (w > width && width > 0) {
      let rest = token.text;
      while (rest.length > 1) {
        let cut = rest.length;
        while (cut > 1 && measure(rest.slice(0, cut), token) > width - current.width) cut--;
        if (cut <= 1 && current.pieces.length) { flush(); continue; }
        const piece = rest.slice(0, cut);
        const pw = measure(piece, token);
        current.pieces.push({ ...token, text: piece, w: pw });
        current.width += pw;
        current.size = Math.max(current.size, token.size);
        rest = rest.slice(cut);
        if (rest) flush();
      }
      if (rest) {
        const pw = measure(rest, token);
        current.pieces.push({ ...token, text: rest, w: pw });
        current.width += pw;
        current.size = Math.max(current.size, token.size);
      }
      continue;
    }

    if (current.width + w > width && current.pieces.length) flush();
    current.pieces.push({ ...token, w });
    current.width += w;
    current.size = Math.max(current.size, token.size);
  }
  flush();

  // Eine leere letzte Zeile entsteht bei Text, der auf \n endet.
  while (lines.length > 1 && !lines[lines.length - 1].pieces.length) lines.pop();
  return lines;
}

export function linesHeight(lines) {
  return lines.reduce((sum, line) => sum + line.height, 0);
}

// MARK: - Bausteine

export const Block = {
  text: (runs) => ({ type: 'text', runs }),
  heading: (title, color) => ({ type: 'heading', title, color }),
  callout: (runs, bar, fill) => ({ type: 'callout', runs, bar, fill }),
  image: (image, width, height, align) => ({ type: 'image', image, width, height, align }),
  wrappedImageText: (image, imageWidth, imageHeight, align, runs) =>
    ({ type: 'wrappedImageText', image, imageWidth, imageHeight, align, runs }),
  spacer: (h) => ({ type: 'spacer', height: h })
};

export function wrappedTextWidth(totalWidth, imageWidth) {
  return Math.max(1, totalWidth - imageWidth - IMAGE_TEXT_GAP);
}

export function blockHeight(block, width, measure) {
  switch (block.type) {
    case 'text':
      return Math.ceil(linesHeight(layoutRuns(block.runs, width, measure)));
    case 'heading':
      return 22;
    case 'callout':
      return Math.ceil(linesHeight(layoutRuns(block.runs, width - CALLOUT_INSET, measure))) + CALLOUT_INSET;
    case 'image':
      return block.height;
    case 'wrappedImageText': {
      const textHeight = Math.ceil(linesHeight(
        layoutRuns(block.runs, wrappedTextWidth(width, block.imageWidth), measure)
      ));
      return Math.max(block.imageHeight, textHeight);
    }
    case 'spacer':
      return block.height;
    default:
      return 0;
  }
}

/** Zerlegt einen zu hohen Block an echten Zeilengrenzen. */
function splitBlock(block, width, maxHeight, measure) {
  const splitRuns = (runs, columnWidth, budget) => {
    const lines = layoutRuns(runs, columnWidth, measure);
    let used = 0;
    let taken = 0;
    for (const line of lines) {
      if (used + line.height > budget + 0.25) break;
      used += line.height;
      taken++;
    }
    if (taken <= 0 || taken >= lines.length) return null;
    const headRuns = runsFromLines(lines.slice(0, taken));
    const tailRuns = runsFromLines(lines.slice(taken));
    return { head: headRuns, tail: tailRuns };
  };

  if (block.type === 'text') {
    const parts = splitRuns(block.runs, width, maxHeight);
    return parts ? { head: Block.text(parts.head), tail: Block.text(parts.tail) } : null;
  }
  if (block.type === 'callout') {
    if (maxHeight <= CALLOUT_INSET + 1) return null;
    const parts = splitRuns(block.runs, width - CALLOUT_INSET, maxHeight - CALLOUT_INSET);
    return parts
      ? { head: Block.callout(parts.head, block.bar, block.fill), tail: Block.callout(parts.tail, block.bar, block.fill) }
      : null;
  }
  return null;
}

/** Setzt umgebrochene Zeilen wieder zu Läufen zusammen (mit Zeilenwechsel). */
function runsFromLines(lines) {
  const runs = [];
  lines.forEach((line, index) => {
    if (index > 0) {
      const style = line.pieces[0] || { size: 12 };
      runs.push({ text: '\n', size: style.size, bold: false, italic: false, color: style.color });
    }
    for (const piece of line.pieces) {
      const last = runs[runs.length - 1];
      if (last && last.text !== '\n' && last.bold === piece.bold && last.italic === piece.italic &&
          last.size === piece.size && last.color === piece.color) {
        last.text += piece.text;
      } else {
        runs.push({ text: piece.text, size: piece.size, bold: piece.bold, italic: piece.italic, color: piece.color, kern: piece.kern });
      }
    }
  });
  return runs;
}

function fittedImage(block, width, maxHeight) {
  if (block.type !== 'image' || block.height <= maxHeight || block.height <= 0) return block;
  const factor = maxHeight / block.height;
  return Block.image(block.image, Math.min(width, block.width * factor), maxHeight, block.align);
}

export function paginate(blocks, measure, width = PAGE.contentWidth, pageHeight = PAGE.contentHeight) {
  const pages = [];
  let page = [];
  let remaining = pageHeight;

  const finishPage = () => {
    if (!page.length) return;
    pages.push(page);
    page = [];
    remaining = pageHeight;
  };

  for (const original of blocks) {
    let pending = original;
    let guard = 0;
    while (pending && guard++ < 500) {
      if (!page.length && pending.type === 'spacer') { pending = null; continue; }

      const height = blockHeight(pending, width, measure);
      if (height <= remaining + 0.25) {
        page.push(pending);
        remaining -= height;
        pending = null;
        continue;
      }

      const split = splitBlock(pending, width, remaining, measure);
      if (split) {
        if (split.head && blockHeight(split.head, width, measure) > 0.25) page.push(split.head);
        finishPage();
        pending = split.tail;
        continue;
      }

      if (!page.length) {
        page.push(fittedImage(pending, width, pageHeight));
        pending = null;
      } else {
        finishPage();
      }
    }
  }
  finishPage();
  return pages.length ? pages : [[]];
}

// MARK: - Inhalt in Blöcke zerlegt

export function blocksFor(sheet, measure) {
  const blocks = [];
  const bodySize = TEXT_SIZES[sheet.textSize].pdfBodySize;

  blocks.push(Block.spacer(4));
  blocks.push(Block.text(plainRun(sheet.topic || 'Ohne Titel', 20, { bold: true, color: COLORS.dunkel })));
  if (sheet.subtitle) {
    blocks.push(Block.spacer(2));
    blocks.push(Block.text(boldRuns(sheet.subtitle, 12, { italic: true, color: COLORS.grau })));
  }
  blocks.push(Block.spacer(12));

  if (sheet.guidingQuestion) {
    const runs = [
      ...plainRun('LEITFRAGE DIESER STUNDE\n', 11, { bold: true, color: COLORS.tuerkis, kern: 0.8 }),
      ...boldRuns(sheet.guidingQuestion, 13, { italic: true, color: COLORS.dunkel })
    ];
    blocks.push(Block.callout(runs, COLORS.tuerkis, '#EAF8FA'));
    blocks.push(Block.spacer(8));
  }

  const tasks = filledTasks(sheet);
  if (tasks.length) {
    blocks.push(Block.heading('Aufgaben', COLORS.rot));
    tasks.forEach((task, index) => {
      const runs = [
        ...plainRun(`${index + 1}   `, bodySize, { bold: true, color: COLORS.rot }),
        ...plainRun(`${task.operator.name}${operatorSuffix(task)}`, bodySize, { bold: true }),
        ...boldRuns(taskContinuation(task), bodySize),
        ...plainRun(`   (${task.operator.afb})`, 10, { italic: true, color: '#8A8A8A' })
      ];
      blocks.push(Block.text(runs));
      blocks.push(Block.spacer(5));
    });
    blocks.push(Block.spacer(6));
  }

  const paragraphs = infoParagraphs(sheet);
  if (paragraphs.length) blocks.push(Block.heading('Informationstext', COLORS.rot));

  const image = sheet.imageDataURL ? {
    dataURL: sheet.imageDataURL,
    pixelWidth: sheet.imagePixelWidth,
    pixelHeight: sheet.imagePixelHeight
  } : null;

  if (image) {
    const width = Math.min(sheet.imageWidth, PAGE.contentWidth);
    const rawHeight = image.pixelWidth > 0 ? width * image.pixelHeight / image.pixelWidth : width;
    const height = Math.min(rawHeight, PAGE.contentHeight * 0.62);
    const fitWidth = rawHeight > height && rawHeight > 0 ? width * height / rawHeight : width;
    const align = sheet.imagePlacement === 'left' ? 'left' : sheet.imagePlacement === 'right' ? 'right' : 'center';

    if (sheet.imagePlacement !== 'center' && paragraphs.length) {
      const sideWidth = Math.min(fitWidth, PAGE.contentWidth * 0.52);
      const sideHeight = fitWidth > 0 ? height * sideWidth / fitWidth : height;
      const allText = combinedInformationText(paragraphs, bodySize);
      const textWidth = wrappedTextWidth(PAGE.contentWidth, sideWidth);
      const lines = layoutRuns(allText, textWidth, measure);
      let used = 0, taken = 0;
      for (const line of lines) {
        if (used + line.height > sideHeight + 0.25) break;
        used += line.height;
        taken++;
      }
      if (taken > 0 && taken < lines.length) {
        blocks.push(Block.wrappedImageText(image, sideWidth, sideHeight, align, runsFromLines(lines.slice(0, taken))));
        blocks.push(Block.text(runsFromLines(lines.slice(taken))));
        blocks.push(Block.spacer(5));
      } else {
        blocks.push(Block.image(image, sideWidth, sideHeight, align));
        blocks.push(Block.text(allText));
        blocks.push(Block.spacer(5));
      }
    } else {
      blocks.push(Block.image(image, fitWidth, height, align));
      for (const paragraph of paragraphs) {
        blocks.push(Block.text(boldRuns(paragraph, bodySize)));
        blocks.push(Block.spacer(5));
      }
    }
    if (sheet.imageCaption) {
      blocks.push(Block.text(plainRun(sheet.imageCaption, 9, { italic: true, color: '#999999' })));
    }
    blocks.push(Block.spacer(6));
  } else {
    for (const paragraph of paragraphs) {
      blocks.push(Block.text(boldRuns(paragraph, bodySize)));
      blocks.push(Block.spacer(5));
    }
  }

  if (sheet.memo) {
    blocks.push(Block.spacer(6));
    const runs = [
      ...plainRun('MERKE\n', 11, { bold: true, color: '#8A6A05', kern: 0.8 }),
      ...boldRuns(sheet.memo, bodySize)
    ];
    blocks.push(Block.callout(runs, COLORS.gold, '#FDF6E3'));
  }

  return blocks;
}

function combinedInformationText(paragraphs, size) {
  const runs = [];
  paragraphs.forEach((paragraph, index) => {
    if (index > 0) runs.push({ text: '\n', size, bold: false, italic: false, color: COLORS.schwarz });
    runs.push(...boldRuns(paragraph, size));
  });
  return runs;
}

/** Das separate Lösungsblatt – nur für die Lehrkraft. */
export function solutionBlocksFor(sheet) {
  const blocks = [];
  const bodySize = TEXT_SIZES[sheet.textSize].pdfBodySize;

  blocks.push(Block.spacer(4));
  blocks.push(Block.text(plainRun('Lösungen', 20, { bold: true, color: COLORS.dunkel })));
  blocks.push(Block.spacer(2));
  blocks.push(Block.text(plainRun(sheet.topic || 'Ohne Titel', 12, { italic: true, color: COLORS.grau })));
  blocks.push(Block.spacer(10));
  blocks.push(Block.callout(
    plainRun('NUR FÜR DIE LEHRKRAFT – nicht an die Klasse weitergeben', 10, { bold: true, color: '#8A1C1C' }),
    COLORS.rot, '#FBEAEA'
  ));
  blocks.push(Block.spacer(14));

  const withSolutions = filledTasks(sheet)
    .map((task, index) => ({ task, index }))
    .filter(({ task }) => task.solution.trim());

  if (!withSolutions.length) {
    blocks.push(Block.text(plainRun('Für dieses Arbeitsblatt wurden noch keine Lösungen eingetragen.', bodySize, { italic: true, color: COLORS.grau })));
    return blocks;
  }

  for (const { task, index } of withSolutions) {
    const runs = [
      ...plainRun(`${index + 1}   `, bodySize, { bold: true, color: COLORS.rot }),
      ...plainRun(`${task.operator.name}${operatorSuffix(task)}`, bodySize, { bold: true }),
      ...boldRuns(taskContinuation(task), bodySize)
    ];
    blocks.push(Block.text(runs));
    blocks.push(Block.spacer(4));
    blocks.push(Block.text(boldRuns(task.solution, bodySize, { color: '#1B6B3A' })));
    blocks.push(Block.spacer(12));
  }
  return blocks;
}

export function hasSolutions(sheet) {
  return filledTasks(sheet).some((t) => t.solution.trim());
}

// MARK: - Wortzahl-Empfehlung

const SAMPLE_PARAGRAPH = 'Die ökologische Nische beschreibt die Gesamtheit aller Umweltbedingungen und Wechselwirkungen, unter denen eine Art dauerhaft überleben und sich fortpflanzen kann. Dazu zählen abiotische Faktoren wie Temperatur, Feuchtigkeit und Lichteinfall ebenso wie biotische Faktoren wie Nahrungskonkurrenz, Fressfeinde und Symbiosepartner. Treffen zwei Arten mit sehr ähnlichen Ansprüchen im selben Lebensraum aufeinander, entsteht nach dem Konkurrenzausschlussprinzip ein Verdrängungsdruck, dem viele Populationen durch eine allmähliche Einnischung und Spezialisierung auf unterschiedliche Ressourcen ausweichen.';

/**
 * Wie viele Wörter der Informationstext braucht, damit das Blatt bis zur
 * letzten Zeile der gewünschten Seitenzahl reicht – ohne die Schriftgröße
 * zu verbiegen. Rechnet mit der echten Layout-Engine statt zu schätzen.
 */
export function recommendedWordCount(sheet, targetPages, measure) {
  const probe = { ...sheet, infoText: '' };
  const fixedHeight = blocksFor(probe, measure)
    .reduce((sum, block) => sum + blockHeight(block, PAGE.contentWidth, measure), 0);
  const headingHeight = 22; // Überschrift „Informationstext“, die erst mit Absätzen erscheint
  const available = PAGE.contentHeight * targetPages - fixedHeight - headingHeight;
  if (available <= 20) return 40;

  const bodySize = TEXT_SIZES[sheet.textSize].pdfBodySize;
  const sample = (SAMPLE_PARAGRAPH + ' ').repeat(3);
  const sampleHeight = linesHeight(layoutRuns(boldRuns(sample, bodySize), PAGE.contentWidth, measure));
  if (sampleHeight <= 0) return 200;

  const wordsPerPoint = sample.trim().split(/\s+/).length / sampleHeight;
  // Kleiner Sicherheitsabschlag – lieber ein paar Wörter zu knapp als
  // eine ungewollte zusätzliche Seite.
  return Math.max(40, Math.round(available * wordsPerPoint * 0.94));
}

export const OPERATOR_NAMES = OPERATORS.map((o) => o.name);
