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
    // Eigener Aufbau (Tabelle, Material, Punkte) statt der Arbeitsblatt-Form
    // – deshalb ein eigenes Layout und ein eigener Prompt, siehe unten.
    layout: 'klausur'
  }
];

export function kindById(id) {
  return KINDS.find((k) => k.id === id) || KINDS[0];
}

export function isKlausur(kind) {
  return kind.layout === 'klausur';
}

export function systemPromptFor(kind) {
  return `${baseInstructions(kind.subject, kind.docLabel)}\n${kind.extra}`;
}

/**
 * Eigenständiger Prompt für Klausuren, angelehnt an die echten
 * WLK-Biologie-Abiturklausuren (Aufgabe → Teilaufgaben mit Punkten,
 * gestützt auf benanntes Material). Kopf-/Fußzeile der Vorlage, die
 * Auswahl "3 von 4 Aufgaben" und der volle Erwartungshorizont mit
 * Einzelpunkten sind bewusst noch nicht Teil davon.
 */
export function klausurSystemPrompt(kind) {
  return `Du erstellst eine Klausuraufgabe für den ${kind.subject}unterricht an einem deutschen Berufskolleg (Höhere Berufsfachschule/Fachoberschule, Leistungskurs-Niveau), im Stil der NRW-Abiturklausuren WLK Biologie-GuS.
Antworte ausschließlich mit einem JSON-Objekt, kein Wort davor oder danach, kein Markdown, keine Code-Zäune. Genau diese Felder:
"aufgabeTitel" (String, kurzer Titel der Aufgabe, z. B. "Einfluss des künstlichen Lichtes auf Fledermäuse" – ohne das Wort "Aufgabe" davor, das ergänzt die Vorlage selbst),
"teilaufgaben" (Array aus 2 bis 5 Objekten mit "operator", "text", "punkte" und "solution"),
"material" (Array aus 1 bis 5 Objekten mit "titel" und "text").
Für "operator" ist ausschließlich einer dieser Operatoren erlaubt, wörtlich übernommen: ${OPERATOR_LIST}.
"text" einer Teilaufgabe ist die Fortsetzung des Satzes nach dem Operator, ohne den Operator selbst, und verweist wo passend auf das zugehörige Material (z. B. "anhand von Material 1.1").
"punkte" ist eine ganze Zahl; die Punkte aller Teilaufgaben zusammen ergeben etwa 30.
"solution" ist eine knappe Musterlösung bzw. die zentralen Stichpunkte für genau diese Teilaufgabe – nur für die Lehrkraft.
"material" enthält den Fachtext, auf den sich die Teilaufgaben stützen – realistisch und eigenständig verfasst (kein Lehrbuchzitat), "titel" im Format "Material 1.1: <Kurztitel>" passend zur referenzierenden Teilaufgabe, "text" mit Absätzen getrennt durch eine Leerzeile, zentrale Fachbegriffe mit **Sternchen** hervorgehoben. Mehrere Teilaufgaben dürfen sich dasselbe oder verschiedene Materialien teilen.
Gewichte die Anforderungsbereiche nach den KE-Vorgaben: AFB II am stärksten, AFB I stärker als AFB III (AFB II > AFB I > AFB III) – wähle die Operatoren entsprechend, erste Teilaufgabe meist AFB I, letzte meist AFB III.
Fachlich korrekt, präzise, keine erfundenen Quellen. Sämtliche Aufgaben kurz, verständlich und eindeutig formuliert, ohne Füllwörter oder komplizierte Satzkonstruktionen.`;
}

/** Themenvorschläge – bisher nur für Biologie hinterlegt. */
export function topicGroupsFor(kind, schoolClass, term) {
  return kind.useCurriculum ? topicGroups(schoolClass, term) : [];
}
