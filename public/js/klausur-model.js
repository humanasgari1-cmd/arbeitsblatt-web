// Eigenständiges Datenmodell für Klausuren – bewusst getrennt von
// model.js (Worksheet), damit Änderungen hier die Arbeitsblatt-Generatoren
// (Bio/Psychologie/Sport) nicht berühren.
//
// Aufbau exakt nach den echten WLK-Biologie-Abiturklausuren: 3 Aufgaben à
// 30 Punkte, je 3 Teilaufgaben mit Operator, Punktzahl und Anforderungs-
// bereich, gestützt auf benannte Materialabschnitte. Dahinter der
// Erwartungshorizont als Tabelle mit Einzelpunkten je Anforderung, dazu
// 10 Punkte Darstellungsleistung – macht zusammen 100 Punkte, wie in der
// echten Klausur. Kopf-/Fußzeile der Vorlage sind bewusst noch nicht Teil
// davon.

import { OPERATORS, matchOperator } from './model.js';

export { OPERATORS, matchOperator };

export const AFB_OPTIONS = ['I', 'II', 'III', 'I/II', 'II/III'];

export function emptyTeilaufgabe() {
  return {
    operator: null,
    text: '',
    punkte: 10,
    afb: 'I',
    material: '',
    // Ein Punkt des Erwartungshorizonts je Zeile, Format
    // "Text der Erwartung — 2 (II)". Wird für die EWH-Tabelle geparst;
    // Zeilen ohne "— N (AFB)" zählen als 1 Punkt ohne AFB-Angabe.
    erwartungshorizont: ''
  };
}

export function emptyAufgabe() {
  return { titel: '', teilaufgaben: [emptyTeilaufgabe(), emptyTeilaufgabe(), emptyTeilaufgabe()] };
}

export function emptyMaterial() {
  return { titel: '', text: '' };
}

export function emptyKlausur() {
  return {
    schoolClass: 'HAE Jg. 12 (Bio-LK)',
    term: '1. Halbjahr 2026/27',
    subjectLine: 'Biologie',
    thema: '',
    textSize: 'normal',
    aufgaben: [emptyAufgabe(), emptyAufgabe(), emptyAufgabe()],
    material: [emptyMaterial()],
    darstellungspunkte: 10
  };
}

export function filledTeilaufgaben(aufgabe) {
  return (aufgabe.teilaufgaben || []).filter((t) => t.operator && t.text.trim());
}

export function filledAufgaben(klausur) {
  return (klausur.aufgaben || []).filter((a) => a.titel.trim() && filledTeilaufgaben(a).length);
}

export function aufgabeSumme(aufgabe) {
  return filledTeilaufgaben(aufgabe).reduce((sum, t) => sum + (Number(t.punkte) || 0), 0);
}

export function klausurGesamtpunkte(klausur) {
  const inhaltlich = filledAufgaben(klausur).reduce((sum, a) => sum + aufgabeSumme(a), 0);
  return inhaltlich + (Number(klausur.darstellungspunkte) || 0);
}

/** Eine Zeile "Text der Erwartung — 2 (II)" in {text, punkte, afb} zerlegen. */
export function parseEwhLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(.*?)\s*[—-]\s*(\d+)\s*\(([IVX]{1,4})\)\s*$/);
  if (match) return { text: match[1].trim(), punkte: Number(match[2]), afb: match[3] };
  return { text: trimmed, punkte: 1, afb: null };
}

export function parseEwh(text) {
  return (text || '').split('\n').map(parseEwhLine).filter(Boolean);
}

export function ewhSumme(text) {
  return parseEwh(text).reduce((sum, p) => sum + p.punkte, 0);
}

export function filledMaterial(klausur) {
  return (klausur.material || []).filter((m) => m.titel.trim() && m.text.trim());
}

export function materialParagraphs(text) {
  return (text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()
    .split('\n\n')
    .map((p) => p.replace(/\n/g, ' ').trim())
    .filter(Boolean);
}

export function hasSolutions(klausur) {
  // Über filledAufgaben statt klausur.aufgaben direkt – die fängt fehlende
  // oder aus einer älteren Fassung stammende Daten bereits ab.
  return filledAufgaben(klausur).some((a) => filledTeilaufgaben(a).some((t) => t.erwartungshorizont.trim()));
}

export function fileName(klausur) {
  const base = klausur.thema || klausur.aufgaben?.[0]?.titel || 'Klausur';
  const cleaned = base
    .split('')
    .filter((c) => /[\p{L}\p{N}ÄÖÜäöüß \-_]/u.test(c))
    .join('')
    .trim()
    .replace(/ /g, '_');
  return cleaned || 'Klausur';
}

export function validateGenerationInput(klausur) {
  const issues = [];
  if (!klausur.thema.trim()) {
    issues.push({ id: 'topic', message: 'Bitte zuerst ein Thema für die Klausur eintragen.', severity: 'blocking' });
  }
  if (!klausur.schoolClass.trim()) issues.push({ id: 'class', message: 'Bitte eine Klasse auswählen.', severity: 'blocking' });
  return issues;
}

export function validateContent(klausur) {
  const issues = [];
  const add = (id, message, severity = 'blocking') => issues.push({ id, message, severity });

  if (!filledAufgaben(klausur).length) add('aufgaben-empty', 'Es gibt keine vollständige Aufgabe.');
  if (!filledMaterial(klausur).length) add('material-empty', 'Es ist kein Material hinterlegt.', 'advisory');

  klausur.aufgaben.forEach((aufgabe, aIndex) => {
    const aNum = aIndex + 1;
    if (!aufgabe.titel.trim() && filledTeilaufgaben(aufgabe).length) {
      add(`aufgabe-${aNum}-titel`, `Aufgabe ${aNum} hat noch keinen Titel.`, 'advisory');
    }
    const summe = aufgabeSumme(aufgabe);
    if (filledTeilaufgaben(aufgabe).length === 3 && summe !== 30) {
      add(`aufgabe-${aNum}-summe`, `Aufgabe ${aNum} ergibt ${summe} statt 30 Punkte.`, 'advisory');
    }
    aufgabe.teilaufgaben.forEach((t, tIndex) => {
      const nummer = `${aNum}.${tIndex + 1}`;
      if (!t.operator && t.text.trim()) add(`t-${nummer}-operator`, `Für Teilaufgabe ${nummer} fehlt der Operator.`, 'advisory');
      if (t.operator && !t.text.trim()) add(`t-${nummer}-text`, `Der Text von Teilaufgabe ${nummer} fehlt.`, 'advisory');
      if (t.erwartungshorizont.trim()) {
        const ewhSum = ewhSumme(t.erwartungshorizont);
        if (ewhSum !== Number(t.punkte)) {
          add(`t-${nummer}-ewh`, `Erwartungshorizont von ${nummer} ergibt ${ewhSum} statt ${t.punkte} Punkte.`, 'advisory');
        }
      }
    });
  });

  return issues;
}

export function blockingIssues(issues) {
  return issues.filter((i) => i.severity === 'blocking');
}
