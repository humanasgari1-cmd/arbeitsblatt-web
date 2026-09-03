// Layout-Bausteine für Klausuren – eigene Datei, damit die
// Arbeitsblatt-Blöcke in layout.js unverändert bleiben. Nutzt dieselben
// Grundbausteine (Block, layoutRuns, Blocksatz, hängender Einzug), aber
// mit dem schlichten, tabellarischen Aufbau der echten Abiturklausuren:
// "Aufgabe N: Titel" → Tabelle "Aufgabenstellung / Punkte" → benannte
// Materialabschnitte im Blocksatz. Kopf- und Fußzeile der Vorlage sind
// bewusst noch nicht übernommen.

import { Block, PAGE, plainRun, boldRuns, tableBlock, paginate, blockHeight } from './layout.js';
import { filledTeilaufgaben, filledMaterial, materialParagraphs } from './klausur-model.js';

const INK = '#000000';
const GRAU = '#555555';

/** Zeilenhöhe/Größe des Fließtexts – bewusst schlicht, ohne Fachfarben,
 *  wie in der echten Vorlage. */
const BODY_SIZE = { compact: 10.5, normal: 12, large: 14 };

export function klausurBlocksFor(klausur, measure) {
  const bodySize = BODY_SIZE[klausur.textSize] || BODY_SIZE.normal;
  const blocks = [];

  blocks.push(Block.spacer(4));
  blocks.push(Block.text(plainRun(`Aufgabe 1: ${klausur.aufgabeTitel || 'Ohne Titel'}`, 15, { bold: true, color: INK })));
  blocks.push(Block.spacer(10));

  const teilaufgaben = filledTeilaufgaben(klausur);
  if (teilaufgaben.length) {
    const rows = teilaufgaben.map((t, index) => ({
      indexRuns: plainRun(`1.${index + 1}`, bodySize, { bold: true, color: INK }),
      runs: [
        ...plainRun(`${t.operator.name} `, bodySize, { bold: true, color: INK }),
        ...boldRuns(t.text, bodySize)
      ],
      points: t.punkte || 0
    }));
    blocks.push(tableBlock(['Aufgabenstellung', 'Punkte'], rows, [PAGE.contentWidth - 70, 70]));
    blocks.push(Block.spacer(16));
  }

  const material = filledMaterial(klausur);
  material.forEach((m, index) => {
    blocks.push(Block.text(plainRun(m.titel, 12.5, { bold: true, color: INK })));
    blocks.push(Block.spacer(4));
    for (const paragraph of materialParagraphs(m.text)) {
      blocks.push(Block.text(boldRuns(paragraph, bodySize), { justify: true }));
      blocks.push(Block.spacer(5));
    }
    if (index < material.length - 1) blocks.push(Block.spacer(8));
  });

  return blocks;
}

export function klausurPageCount(klausur, measure) {
  return paginate(klausurBlocksFor(klausur, measure), measure).length;
}

/** Das Lösungsblatt – Teilaufgaben mit Musterlösung und Punktzahl,
 *  nur für die Lehrkraft. Kein detaillierter Erwartungshorizont mit
 *  Einzelpunkten wie im echten Abitur, das ist bewusst außen vor. */
export function klausurSolutionBlocksFor(klausur, measure) {
  const bodySize = BODY_SIZE[klausur.textSize] || BODY_SIZE.normal;
  const blocks = [];

  blocks.push(Block.spacer(4));
  blocks.push(Block.text(plainRun('Lösungen', 18, { bold: true, color: INK })));
  blocks.push(Block.spacer(2));
  blocks.push(Block.text(plainRun(`Aufgabe 1: ${klausur.aufgabeTitel || 'Ohne Titel'}`, 12, { italic: true, color: GRAU })));
  blocks.push(Block.spacer(10));
  blocks.push(Block.callout(
    plainRun('NUR FÜR DIE LEHRKRAFT – nicht an die Klasse weitergeben', 10, { bold: true, color: '#8A1C1C' }),
    '#A11C2A', '#FBEAEA'
  ));
  blocks.push(Block.spacer(14));

  const withSolutions = filledTeilaufgaben(klausur)
    .map((t, index) => ({ t, index }))
    .filter(({ t }) => t.solution.trim());

  if (!withSolutions.length) {
    blocks.push(Block.text(plainRun('Für diese Klausur wurden noch keine Lösungen eingetragen.', bodySize, { italic: true, color: GRAU })));
    return blocks;
  }

  const indexIndent = Math.ceil(measure('1.9', { size: bodySize, bold: true })) + 10;
  for (const { t, index } of withSolutions) {
    const indexRuns = plainRun(`1.${index + 1}`, bodySize, { bold: true, color: INK });
    const bodyRuns = [
      ...plainRun(`${t.operator.name} `, bodySize, { bold: true, color: INK }),
      ...boldRuns(t.text, bodySize),
      ...plainRun(`   (${t.punkte} Punkte)`, 10, { italic: true, color: GRAU })
    ];
    blocks.push(Block.indexedText(indexRuns, bodyRuns, indexIndent));
    blocks.push(Block.spacer(4));
    blocks.push(Block.text(boldRuns(t.solution, bodySize, { color: '#1B6B3A' })));
    blocks.push(Block.spacer(12));
  }
  return blocks;
}

export function klausurHasSolutions(klausur) {
  return filledTeilaufgaben(klausur).some((t) => t.solution.trim());
}
