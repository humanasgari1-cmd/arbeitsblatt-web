// Layout-Bausteine für Klausuren – eigene Datei, damit die
// Arbeitsblatt-Blöcke in layout.js unverändert bleiben. Nutzt dieselben
// Grundbausteine (Block, layoutRuns, Blocksatz, hängender Einzug, Tabelle),
// aber mit dem Aufbau der echten WLK-Biologie-Abiturklausuren:
//
//   Aufgabe 1: Titel                    Aufgabe 2: Titel   ... (3×, je 30 P.)
//   ┌─────────────────────┬────────┐
//   │ Aufgabenstellung     │ Punkte │
//   ├─────────────────────┼────────┤   → Tabelle je Aufgabe, Teilaufgaben 1.1–1.3
//   Material 1.1: …                     → Fließtext im Blocksatz
//
//   — eigene Seite —
//   Erwartungshorizont
//   Aufgabe 1                           → je Teilaufgabe eine Tabelle
//   ┌─────────────────────┬────────────┐
//   │ Anforderungen        │ Punkte     │
//   │                       │ maximal    │
//   │                       │ (AFB)      │
//   ├─────────────────────┼────────────┤
//   1.1.1  …                  1 (I)
//                        Summe 1.1        10
//                        Summe Aufgabe 1  30
//   Darstellungsleistung                  10
//   Gesamtpunktzahl                       100
//
// Kopf- und Fußzeile der Vorlage sind bewusst noch nicht übernommen.

import { Block, PAGE, plainRun, boldRuns, tableBlock, paginate, blockHeight } from './layout.js';
import {
  filledTeilaufgaben, filledAufgaben, aufgabeSumme, klausurGesamtpunkte,
  filledMaterial, materialParagraphs, parseEwh
} from './klausur-model.js';

const INK = '#000000';
const GRAU = '#555555';
const BODY_SIZE = { compact: 10.5, normal: 12, large: 14 };

function bodySizeFor(klausur) {
  return BODY_SIZE[klausur.textSize] || BODY_SIZE.normal;
}

// MARK: - Aufgaben-Teil (für die Klasse)

function aufgabenBlocks(klausur, measure) {
  const bodySize = bodySizeFor(klausur);
  const blocks = [];
  const aufgaben = filledAufgaben(klausur);

  aufgaben.forEach((aufgabe, aIndex) => {
    const aNum = aIndex + 1;
    if (aIndex > 0) blocks.push(Block.spacer(18));
    blocks.push(Block.text(plainRun(`Aufgabe ${aNum}: ${aufgabe.titel || 'Ohne Titel'}`, 15, { bold: true, color: INK })));
    blocks.push(Block.spacer(10));

    const teilaufgaben = filledTeilaufgaben(aufgabe);
    const rows = teilaufgaben.map((t, tIndex) => ({
      indexRuns: plainRun(`${aNum}.${tIndex + 1}`, bodySize, { bold: true, color: INK }),
      runs: [
        ...plainRun(`${t.operator.name} `, bodySize, { bold: true, color: INK }),
        ...boldRuns(t.text, bodySize)
      ],
      points: t.punkte || 0
    }));
    blocks.push(tableBlock(['Aufgabenstellung', 'Punkte'], rows, [PAGE.contentWidth - 70, 70]));
    blocks.push(Block.spacer(14));

    const relevantMaterial = filledMaterial(klausur).filter((m) => m.titel.startsWith(`Material ${aNum}.`));
    relevantMaterial.forEach((m, index) => {
      blocks.push(Block.text(plainRun(m.titel, 12.5, { bold: true, color: INK })));
      blocks.push(Block.spacer(4));
      for (const paragraph of materialParagraphs(m.text)) {
        blocks.push(Block.text(boldRuns(paragraph, bodySize), { justify: true }));
        blocks.push(Block.spacer(5));
      }
      if (index < relevantMaterial.length - 1) blocks.push(Block.spacer(8));
    });
  });

  return blocks;
}

// MARK: - Erwartungshorizont

function summeLine(label, punkte, opts = {}) {
  const runs = [
    ...plainRun(label, opts.size || 11, { bold: true, color: INK }),
    ...plainRun(`   ${punkte}`, opts.size || 11, { bold: true, color: INK })
  ];
  return Block.text(runs, { align: 'right' });
}

function ewhBlocks(klausur, measure) {
  const bodySize = bodySizeFor(klausur);
  const blocks = [];
  const aufgaben = filledAufgaben(klausur);

  blocks.push(Block.text(plainRun('Erwartungshorizont', 17, { bold: true, color: INK })));
  blocks.push(Block.spacer(4));
  blocks.push(Block.text(plainRun('Nur für die Lehrkraft – nicht an die Klasse weitergeben', 10.5, { italic: true, color: GRAU })));
  blocks.push(Block.spacer(14));

  aufgaben.forEach((aufgabe, aIndex) => {
    const aNum = aIndex + 1;
    if (aIndex > 0) blocks.push(Block.spacer(14));
    blocks.push(Block.text(plainRun(`Aufgabe ${aNum}: ${aufgabe.titel || 'Ohne Titel'}`, 13, { bold: true, color: INK })));
    blocks.push(Block.spacer(8));

    const teilaufgaben = filledTeilaufgaben(aufgabe);
    teilaufgaben.forEach((t, tIndex) => {
      const nummer = `${aNum}.${tIndex + 1}`;
      const points = parseEwh(t.erwartungshorizont);
      if (!points.length) return;

      const rows = points.map((p, pIndex) => ({
        indexRuns: plainRun(`${nummer}.${pIndex + 1}`, bodySize - 1, { bold: true, color: INK }),
        runs: plainRun(p.text, bodySize - 1, { color: INK }),
        points: p.afb ? `${p.punkte} (${p.afb})` : String(p.punkte)
      }));
      blocks.push(tableBlock(['Anforderungen', 'Punkte (AFB)'], rows, [PAGE.contentWidth - 100, 100]));
      const teilSumme = points.reduce((sum, p) => sum + p.punkte, 0);
      blocks.push(summeLine(`Summe Teilaufgabe ${nummer}`, teilSumme));
      blocks.push(Block.spacer(10));
    });

    blocks.push(summeLine(`Summe Aufgabe ${aNum}`, aufgabeSumme(aufgabe), { size: 12.5 }));
    blocks.push(Block.spacer(4));
  });

  blocks.push(Block.spacer(10));
  blocks.push(summeLine('Darstellungsleistung', klausur.darstellungspunkte || 0));
  blocks.push(Block.spacer(4));
  blocks.push(summeLine('Gesamtpunktzahl', klausurGesamtpunkte(klausur), { size: 13.5 }));

  return blocks;
}

export function klausurBlocksFor(klausur, measure) {
  return aufgabenBlocks(klausur, measure);
}

/** Beide Teile zusammen paginiert – der Erwartungshorizont beginnt immer
 *  auf einer neuen Seite, wie im echten Klausurheft (eigenes Heft). */
export function klausurAllPages(klausur, measure) {
  const aufgabenPages = paginate(aufgabenBlocks(klausur, measure), measure);
  const ewh = ewhBlocks(klausur, measure);
  const ewhPages = ewh.length ? paginate(ewh, measure) : [];
  return { aufgabenPages, ewhPages };
}

export function klausurPageCount(klausur, measure) {
  const { aufgabenPages } = klausurAllPages(klausur, measure);
  return aufgabenPages.length;
}

export function klausurHasSolutions(klausur) {
  return filledAufgaben(klausur).some((a) =>
    filledTeilaufgaben(a).some((t) => parseEwh(t.erwartungshorizont).length > 0));
}
