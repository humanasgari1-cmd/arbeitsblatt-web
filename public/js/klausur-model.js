// Eigenständiges Datenmodell für Klausuren – bewusst getrennt von
// model.js (Worksheet), damit Änderungen hier die Arbeitsblatt-Generatoren
// (Bio/Psychologie/Sport) nicht berühren.
//
// Aufbau angelehnt an die echten Abiturklausuren (WLK Biologie-GuS,
// Vorgaben für die Konstruktion von Aufgaben): eine Aufgabe, gegliedert in
// Teilaufgaben mit je einem Operator und einer Punktzahl, gestützt auf
// benannte Materialabschnitte. Kopf-/Fußzeile der Vorlage bewusst noch
// nicht übernommen.

import { OPERATORS, matchOperator } from './model.js';

export { OPERATORS, matchOperator };

export function emptyTeilaufgabe() {
  return { operator: null, text: '', punkte: 10, solution: '', material: '' };
}

export function emptyMaterial() {
  return { titel: '', text: '' };
}

export function emptyKlausur() {
  return {
    schoolClass: 'HAE Jg. 12 (Bio-LK)',
    term: '1. Halbjahr 2026/27',
    subjectLine: 'Biologie',
    aufgabeTitel: '',
    textSize: 'normal',
    teilaufgaben: [emptyTeilaufgabe(), emptyTeilaufgabe(), emptyTeilaufgabe()],
    material: [emptyMaterial()]
  };
}

export function filledTeilaufgaben(klausur) {
  return (klausur.teilaufgaben || []).filter((t) => t.operator && t.text.trim());
}

export function filledMaterial(klausur) {
  return (klausur.material || []).filter((m) => m.titel.trim() && m.text.trim());
}

export function punkteSumme(klausur) {
  return filledTeilaufgaben(klausur).reduce((sum, t) => sum + (Number(t.punkte) || 0), 0);
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
  return filledTeilaufgaben(klausur).some((t) => t.solution.trim());
}

export function fileName(klausur) {
  const base = klausur.aufgabeTitel || 'Klausur';
  const cleaned = base
    .split('')
    .filter((c) => /[\p{L}\p{N}ÄÖÜäöüß \-_]/u.test(c))
    .join('')
    .trim()
    .replace(/ /g, '_');
  return cleaned || 'Klausur';
}

export function validateGenerationInput(klausur, teilaufgabenCount) {
  const issues = [];
  if (!klausur.aufgabeTitel.trim()) {
    issues.push({ id: 'topic', message: 'Bitte zuerst ein Thema für die Aufgabe eintragen.', severity: 'blocking' });
  }
  if (!klausur.schoolClass.trim()) issues.push({ id: 'class', message: 'Bitte eine Klasse auswählen.', severity: 'blocking' });
  if (teilaufgabenCount < 2 || teilaufgabenCount > 5) {
    issues.push({ id: 'count', message: 'Bitte 2 bis 5 Teilaufgaben auswählen.', severity: 'blocking' });
  }
  return issues;
}

export function validateContent(klausur) {
  const issues = [];
  const add = (id, message, severity = 'blocking') => issues.push({ id, message, severity });

  if (!klausur.aufgabeTitel.trim()) add('topic', 'Der Aufgabentitel fehlt.');
  if (!filledTeilaufgaben(klausur).length) add('teilaufgaben-empty', 'Es gibt keine vollständige Teilaufgabe (Operator und Text).');
  if (!filledMaterial(klausur).length) add('material-empty', 'Es ist kein Material hinterlegt.', 'advisory');

  klausur.teilaufgaben.forEach((t, index) => {
    const nummer = index + 1;
    if (!t.operator && t.text.trim()) add(`teilaufgabe-${nummer}-operator`, `Für Teilaufgabe 1.${nummer} fehlt der Operator.`, 'advisory');
    if (t.operator && !t.text.trim()) add(`teilaufgabe-${nummer}-text`, `Der Text von Teilaufgabe 1.${nummer} fehlt.`, 'advisory');
    if (!t.punkte || t.punkte <= 0) add(`teilaufgabe-${nummer}-punkte`, `Teilaufgabe 1.${nummer} hat keine Punktzahl.`, 'advisory');
  });

  return issues;
}

export function blockingIssues(issues) {
  return issues.filter((i) => i.severity === 'blocking');
}
