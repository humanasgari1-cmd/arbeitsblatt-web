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
 * WLK-Biologie-Abiturklausuren: 3 Aufgaben à 30 Punkte, je 3 Teilaufgaben
 * (AFB I, II, III – auch überschneidend), gestützt auf benanntes Material,
 * dahinter ein Erwartungshorizont mit Einzelpunkten je Anforderung.
 * Kopf-/Fußzeile der Vorlage und die Auswahl "3 von 4 Aufgaben" sind
 * bewusst noch nicht Teil davon.
 */
export function klausurSystemPrompt(kind) {
  return `Du erstellst eine vollständige Klausur für den ${kind.subject}unterricht an einem deutschen Berufskolleg (Höhere Berufsfachschule, Leistungskurs-Niveau), exakt im Stil der NRW-Abiturklausuren WLK Biologie-GuS – gleicher Aufbau, gleiche Bezeichnungen, gleiche Formulierungsweise.
Antworte ausschließlich mit einem JSON-Objekt, kein Wort davor oder danach, kein Markdown, keine Code-Zäune. Genau diese Felder:

"aufgaben" (Array aus genau 3 Objekten, je mit "titel" und "teilaufgaben"):
  "titel" ist der Aufgabentitel (String, z. B. "Einfluss des künstlichen Lichtes auf Fledermäuse" – ohne das Wort "Aufgabe" davor, das ergänzt die Vorlage). Alle 3 Aufgaben behandeln verschiedene, in sich abgeschlossene Aspekte desselben übergeordneten Themas.
  "teilaufgaben" ist ein Array aus genau 3 Objekten mit "operator", "text", "punkte", "afb", "material" und "erwartungshorizont".
    "operator": genau einer dieser Operatoren, wörtlich übernommen: ${OPERATOR_LIST}.
    "text": Fortsetzung des Satzes nach dem Operator, ohne den Operator selbst, verweist wo passend auf das Material (z. B. "anhand von Material 1.1").
    "punkte": ganze Zahl; die drei Teilaufgaben einer Aufgabe ergeben zusammen genau 30 Punkte (z. B. 10/13/7 oder 8/14/8).
    "afb": Anforderungsbereich als String "I", "II", "III" oder überschneidend "I/II" bzw. "II/III". Erste Teilaufgabe meist "I", zweite meist "II", dritte meist "II" oder "III" – insgesamt über alle 3 Aufgaben hinweg gilt AFB II am stärksten gewichtet, AFB I stärker als AFB III (AFB II > AFB I > AFB III), wie in den KE-Vorgaben.
    "material": welches Material referenziert wird, z. B. "1.1".
    "erwartungshorizont": String mit den einzelnen erwarteten Antwortpunkten, EINER JE ZEILE, jede Zeile im Format "<knapper Erwartungspunkt> — <Punkte> (<AFB>)", z. B. "Abiotische Faktoren sind alle Faktoren der unbelebten Umwelt, die Einfluss auf ein Ökosystem haben. — 1 (I)". Die Punkte aller Zeilen einer Teilaufgabe ergeben zusammen genau die "punkte" dieser Teilaufgabe. Jede Zeile ist ein einzelner, eigenständig bepunkteter Gedanke – lieber mehr kurze Zeilen als wenige lange.

"material" (Array aus 3 bis 9 Objekten mit "titel" und "text"): der Fachtext, auf den sich die Teilaufgaben stützen – realistisch und eigenständig verfasst (kein Lehrbuchzitat), "titel" im Format "Material 1.1: <Kurztitel>" passend zur referenzierenden Aufgabe.Teilaufgabe-Nummer, "text" mit Absätzen getrennt durch eine Leerzeile, zentrale Fachbegriffe mit **Sternchen** hervorgehoben.

Fachlich korrekt, präzise, keine erfundenen Quellen. Sämtliche Aufgaben und Erwartungspunkte kurz, verständlich und eindeutig formuliert, ohne Füllwörter oder komplizierte Satzkonstruktionen – wie in einer echten Prüfungsaufgabe, nicht wie in einem Lehrbuch.`;
}

/** Themenvorschläge – bisher nur für Biologie hinterlegt. */
export function topicGroupsFor(kind, schoolClass, term) {
  return kind.useCurriculum ? topicGroups(schoolClass, term) : [];
}
