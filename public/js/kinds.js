// Die vier Reiter. Struktur steht – die inhaltlichen Feinheiten
// (Themenlisten für Psychologie und Sport, Aufbau der Klausur) sind
// bewusst an einer Stelle gebündelt, damit sie sich später ändern lassen,
// ohne den Rest anzufassen.

import { OPERATORS, topicGroups } from './model.js';

const OPERATOR_LIST = OPERATORS.map((o) => o.name).join(', ');

/** Der gemeinsame Kern: Antwortformat und Operatoren. Gilt für alle Reiter. */
function baseInstructions(subject, docLabel) {
  return `Du schreibst ${docLabel === 'Klausur' ? 'eine Klausur' : 'ein Arbeitsblatt'} für den ${subject}unterricht an einem deutschen Berufskolleg. \
Antworte ausschließlich mit einem JSON-Objekt, kein Wort davor oder danach, kein Markdown, keine Code-Zäune. Genau diese Felder:
"subtitle" (String, kurze Unterzeile, z. B. "${docLabel} 3 · ${subject}"),
"guidingQuestion" (String, eine einzelne Leitfrage${docLabel === 'Klausur' ? ' bzw. der Rahmen der Klausur' : ' für die Stunde'}),
"tasks" (Array aus 3 bis 5 Objekten mit "operator", "text" und "solution"),
"infoText" (String, Fachtext in genau der angeforderten Wortzahl – nicht deutlich kürzer, das Blatt soll bis zur letzten Zeile der gewünschten Seiten gefüllt sein –, Absätze durch eine Leerzeile getrennt, zentrale Fachbegriffe mit **Sternchen** hervorgehoben),
"memo" (String, ein bis zwei Sätze zum Merken).
Du wählst für jede Aufgabe eigenständig den passendsten Operator zum Thema aus – niemand gibt dir das vor. Für "operator" ist ausschließlich einer dieser Operatoren erlaubt, wörtlich übernommen: ${OPERATOR_LIST}.
"text" ist die Fortsetzung des Aufgabensatzes nach dem Operator, ohne den Operator selbst.
"solution" ist eine knappe Musterlösung bzw. die zentralen Stichpunkte für genau diese Aufgabe – nur für die Lehrkraft, erscheint nie auf dem Blatt für die Klasse.
Fachlich korrekt, altersgerecht, keine erfundenen Quellen. Kein Lückentext. Die Wortzahl des Informationstexts ist eine feste Vorgabe für die Seitenlänge, nicht nur eine grobe Richtung – schreib entsprechend ausführlich, wenn eine hohe Zahl verlangt wird.`;
}

const PROGRESSION_SHEET = `Steigere die Aufgaben im Anforderungsniveau: erst Reproduktion (AFB I), dann Anwendung (AFB II), dann Bewertung/Transfer (AFB III) – wähle die Operatoren entsprechend aus der erlaubten Liste.`;

// Vorläufig: Gewichtung nach den KE-Vorgaben. Der genaue Klausuraufbau
// wird noch besprochen.
const PROGRESSION_EXAM = `Es ist eine Klausur, kein Übungsblatt: die Aufgaben sind bewertbar formuliert, jede mit eigener Musterlösung. Gewichte die Anforderungsbereiche nach den KE-Vorgaben (AFB II vor AFB I vor AFB III) und vergib am Ende jeder Aufgabe keine Punktzahlen im Text – die trägt die Lehrkraft selbst ein.`;

export const KINDS = [
  {
    id: 'bio',
    label: 'Biologie',
    subject: 'Biologie',
    docLabel: 'Arbeitsblatt',
    useCurriculum: true,
    extra: PROGRESSION_SHEET
  },
  {
    id: 'psychologie',
    label: 'Psychologie',
    subject: 'Psychologie',
    docLabel: 'Arbeitsblatt',
    useCurriculum: false,
    extra: PROGRESSION_SHEET
  },
  {
    id: 'sport',
    label: 'Sport',
    subject: 'Sport',
    docLabel: 'Arbeitsblatt',
    useCurriculum: false,
    extra: PROGRESSION_SHEET
  },
  {
    id: 'klausur',
    label: 'Klausuren Bio',
    subject: 'Biologie',
    docLabel: 'Klausur',
    useCurriculum: true,
    extra: PROGRESSION_EXAM
  }
];

export function kindById(id) {
  return KINDS.find((k) => k.id === id) || KINDS[0];
}

export function systemPromptFor(kind) {
  return `${baseInstructions(kind.subject, kind.docLabel)}\n${kind.extra}`;
}

/** Themenvorschläge – bisher nur für Biologie hinterlegt. */
export function topicGroupsFor(kind, schoolClass, term) {
  return kind.useCurriculum ? topicGroups(schoolClass, term) : [];
}
