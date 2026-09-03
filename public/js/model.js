// Datenmodell des Arbeitsblatts – Operatoren, Vorgaben, Validierung.
// Eins zu eins übernommen aus Model/Worksheet.swift und
// Model/TeachingContext.swift, damit die Blätter gleich aussehen wie
// die aus der iPad-App.

export const OPERATORS = [
  { name: 'Benennen Sie', afb: 'AFB I' },
  { name: 'Fassen Sie zusammen', afb: 'AFB I' },
  { name: 'Beschreiben Sie', afb: 'AFB I/II' },
  { name: 'Erklären Sie', afb: 'AFB I/II' },
  { name: 'Vergleichen Sie', afb: 'AFB I/II' },
  { name: 'Ordnen Sie', afb: 'AFB I/II' },
  { name: 'Zeichnen Sie', afb: 'AFB I/II' },
  { name: 'Berechnen Sie', afb: 'AFB I/II' },
  { name: 'Erläutern Sie', afb: 'AFB II' },
  { name: 'Leiten Sie ab', afb: 'AFB II/III' },
  { name: 'Analysieren Sie', afb: 'AFB II/III' },
  { name: 'Werten Sie aus', afb: 'AFB II/III' },
  { name: 'Begründen Sie', afb: 'AFB II/III' },
  { name: 'Beurteilen Sie', afb: 'AFB II/III' },
  { name: 'Deuten Sie', afb: 'AFB II/III' },
  { name: 'Diskutieren Sie', afb: 'AFB II/III' },
  { name: 'Nehmen Sie Stellung', afb: 'AFB II/III' },
  { name: 'Überprüfen Sie', afb: 'AFB II/III' },
  { name: 'Ermitteln Sie', afb: 'AFB II/III' },
  { name: 'Planen Sie', afb: 'AFB II/III' },
  { name: 'Bewerten Sie', afb: 'AFB III' },
  { name: 'Entwickeln Sie eine Hypothese', afb: 'AFB III' }
];

/** Findet den passenden Operator – tolerant gegenüber Schreibweise. */
export function matchOperator(raw) {
  const needle = (raw || '').trim().toLowerCase();
  if (!needle) return null;
  return (
    OPERATORS.find((o) => o.name.toLowerCase() === needle) ||
    OPERATORS.find((o) => o.name.toLowerCase().startsWith(needle)) ||
    OPERATORS.find((o) => needle.startsWith(o.name.toLowerCase())) ||
    null
  );
}

/** Manche Operatoren gelten in zwei Anforderungsbereichen. */
export function operatorSupports(op, level) {
  const expected = { 1: 'I', 2: 'II', 3: 'III' }[level];
  if (!expected || !op) return false;
  return op.afb
    .replace('AFB', '')
    .split('/')
    .map((s) => s.trim())
    .includes(expected);
}

export function expectedAFB(index, taskCount) {
  if (taskCount <= 3) return Math.min(index + 1, 3);
  if (taskCount === 4) return [1, 2, 2, 3][Math.min(Math.max(index, 0), 3)];
  return [1, 1, 2, 2, 3][Math.min(Math.max(index, 0), 4)];
}

export const CLASSES = [
  'Vorklasse (HVK)',
  'HF-Klassen Jg. 11',
  'HF-Klassen Jg. 12',
  'HAE Jg. 11 (Bio-LK)',
  'HAE Jg. 12 (Bio-LK)',
  'HAE Jg. 13 (Bio-LK)'
];

export const TARGET_PAGE_OPTIONS = [1, 1.5, 2, 3, 4, 5, 6];

export const TEXT_SIZES = {
  compact: { label: 'Kompakt', pdfBodySize: 10.5, wordBodySize: 19 },
  normal: { label: 'Normal', pdfBodySize: 12, wordBodySize: 22 },
  large: { label: 'Groß', pdfBodySize: 14, wordBodySize: 26 }
};

export const PLACEMENTS = {
  right: 'rechts, Text daneben',
  left: 'links, Text daneben',
  center: 'mittig'
};

export function emptyTask() {
  return { operator: null, text: '', solution: '' };
}

export function emptyWorksheet() {
  return {
    schoolClass: 'Vorklasse (HVK)',
    term: '1. Halbjahr 2026/27',
    topic: '',
    subtitle: '',
    guidingQuestion: '',
    textSize: 'normal',
    tasks: [emptyTask(), emptyTask(), emptyTask()],
    infoText: '',
    memo: '',
    // Bild als Data-URL, damit es unverändert in IndexedDB, PDF und .docx passt.
    imageDataURL: null,
    imageIsPNG: true,
    imagePixelWidth: 0,
    imagePixelHeight: 0,
    imageCaption: '',
    imageWidth: 200,
    imagePlacement: 'right'
  };
}

/** Absätze des Informationstexts – Leerzeile trennt. */
export function infoParagraphs(sheet) {
  return (sheet.infoText || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()
    .split('\n\n')
    .map((p) => p.replace(/\n/g, ' ').trim())
    .filter(Boolean);
}

export function filledTasks(sheet) {
  return (sheet.tasks || []).filter((t) => t.operator && t.text.trim());
}

export function wordCount(sheet) {
  const t = (sheet.infoText || '').trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Was zwischen Operator und Fortsetzung gehört. */
export function operatorSuffix(task) {
  const first = (task.text || '').trim().charAt(0);
  if (!first) return '';
  return ',;:.!?'.includes(first) ? '' : ' ';
}

export function taskContinuation(task) {
  return (task.text || '').trim();
}

export function fileName(sheet) {
  const base = sheet.topic || 'Arbeitsblatt';
  const cleaned = base
    .split('')
    .filter((c) => /[\p{L}\p{N}ÄÖÜäöüß \-_]/u.test(c))
    .join('')
    .trim()
    .replace(/ /g, '_');
  return cleaned || 'Arbeitsblatt';
}

export function pageLabel(pages) {
  if (pages === Math.round(pages)) return `${pages} Seite${pages === 1 ? '' : 'n'}`;
  return `${pages.toFixed(1).replace('.', ',')} Seiten`;
}

// MARK: - Lehrplan-Themen

export function topicSuggestions(schoolClass, term) {
  const second = /2\. halbjahr/i.test(term);
  if (schoolClass.includes('HAE')) {
    if (schoolClass.includes('Jg. 11')) {
      return second
        ? ['Enzymatik: Enzyme als Biokatalysatoren', 'Enzymkinetik und Temperatur', 'Zellatmung und Energiestoffwechsel', 'Immunbiologie: Unspezifische Abwehr', 'Spezifische Abwehr und Immunisierung']
        : ['Zytologie: Zellaufbau', 'Biomembranen und Stofftransport', 'Zellorganellen und ihre Funktionen', 'Mikroskopie und Histologie', 'Zellteilung: Mitose'];
    }
    if (schoolClass.includes('Jg. 12')) {
      return second
        ? ['Neurobiologie: Reiz und Reaktion', 'Nervenzelle und Ruhepotenzial', 'Aktionspotenzial und Erregungsleitung', 'Synapse und Erregungsübertragung', 'Gehirn und Verhalten']
        : ['Ökologie: Ökosysteme und Umweltfaktoren', 'Populationsökologie', 'Nahrungsnetze und Energiefluss', 'Stoffkreisläufe', 'Einfluss des Menschen und Nachhaltigkeit'];
    }
    return second
      ? ['Evolution: Darwin und natürliche Selektion', 'Evolutionsbelege und Fossilien', 'Stammbäume und Phylogenese', 'Evolution des Menschen', 'Abiturvorbereitung Evolution']
      : ['Genetik: DNA und Replikation', 'Genexpression und genetischer Code', 'Molekulargenetik', 'Humangenetik und Erbgänge', 'Mutationen und Pränataldiagnostik'];
  }
  if (schoolClass.includes('Vorklasse')) {
    return second
      ? ['DNA als Träger der Erbinformation', 'Transkription: Vom Gen zum Merkmal', 'Translation und genetischer Code', 'Enzyme als Werkzeuge der Zelle', 'Chromosomen und Karyogramm', 'Zellzyklus und Mitose', 'Meiose und Keimzellenbildung', '1. Mendelsche Regel (Uniformität)', '2. Mendelsche Regel (Spaltung)', '3. Mendelsche Regel (Unabhängigkeit)', 'Autosomale Erbgänge und Stammbäume', 'Gonosomale Erbgänge', 'Mutationen und Trisomie 21', 'Pränataldiagnostik', 'Wiederholung Genetik', 'Einstieg Evolution', 'Urknall und Erdzeitalter', 'Fossilien als Evolutionsbelege', 'Stammbäume und Pferdeevolution', 'Darwin und Lamarck']
      : ['Einführung Basisökologie: Aufbau eines Ökosystems', 'Nahrungsbeziehungen im Ökosystem', 'Die ökologische Nische', 'Einführung Ökosystem Gewässer', 'Nahrungsbeziehungen im Gewässer', 'Stoffkreisläufe und Energiefluss', 'Eutrophierung – wenn ein Gewässer kippt', 'Der Mensch verändert die Umwelt', 'Wiederholung Ökologie', 'Vom Reiz zur Reaktion und Bau der Nervenzelle', 'Ruhepotenzial und Aktionspotenzial', 'Erregungsleitung am Axon', 'Die Synapse', 'Aufbau des Nervensystems', 'Das Gehirn', 'Freude, Drogen und Sucht', 'Hormone: Insulin, Glucagon, Diabetes', 'Wiederholung Neurobiologie', 'Klausurvorbereitung Neurobiologie'];
  }
  return second
    ? ['Genetische Grundlagen menschlicher Existenz', 'DNA und Erbinformation', 'Mendelsche Regeln und Erbgänge', 'Immunisierung und Gesundheit', 'Ökologische Grundlagen']
    : ['Nährstoffe: Bausteine unserer Nahrung', 'Verdauungsapparat', 'Enzyme: Werkzeuge der Verdauung', 'Enzyme und Temperatur', 'Die Zelle als Grundbaustein', 'Diffusion und Osmose', 'Ernährung und Gesundheit', 'Wiederholung AS1', 'Immunsystem im Überblick', 'Unspezifische Abwehr', 'Spezifische Abwehr und Impfung', 'Wiederholung AS2'];
}

function secondHalfLabel(year, second) {
  const key = `${year}|${second}`;
  return {
    '11|false': '1. Halbjahr · Zytologie',
    '11|true': '2. Halbjahr · Enzymatik und Immunbiologie',
    '12|false': '1. Halbjahr · Ökologie',
    '12|true': '2. Halbjahr · Neurobiologie',
    '13|false': '1. Halbjahr · Genetik'
  }[key] || '2. Halbjahr · Evolution';
}

export function topicGroups(schoolClass, term) {
  const suggestions = topicSuggestions(schoolClass, term);
  if (schoolClass.includes('HAE')) {
    const year = schoolClass.includes('Jg. 11') ? '11' : schoolClass.includes('Jg. 12') ? '12' : '13';
    const second = /2\. halbjahr/i.test(term);
    return [[`Jahrgang ${year} · ${secondHalfLabel(year, second)}`, suggestions]];
  }
  const split = Math.max(1, Math.ceil(suggestions.length / 4));
  const groups = [];
  for (let start = 0, i = 0; start < suggestions.length; start += split, i++) {
    groups.push([`Q${i + 1}`, suggestions.slice(start, Math.min(start + split, suggestions.length))]);
  }
  return groups;
}

// MARK: - Unterrichts-Kontext

export const SCHOOL_TYPES = {
  unspecified: 'Ohne Angabe',
  gymnasium: 'Gymnasium',
  realschule: 'Realschule',
  gesamtschule: 'Gesamtschule',
  hauptschule: 'Hauptschule',
  berufskolleg: 'Berufskolleg',
  grundschule: 'Grundschule'
};

export const LEVELS = {
  simple: {
    label: 'Einfach',
    instruction: 'Sprich einfach: kurze Sätze, wenig Fachbegriffe, und jeden Fachbegriff, den du brauchst, direkt erklären.'
  },
  standard: {
    label: 'Normal',
    instruction: 'Übliches Niveau für diese Klassenstufe: Fachbegriffe verwenden, aber verständlich bleiben.'
  },
  demanding: {
    label: 'Anspruchsvoll',
    instruction: 'Anspruchsvolles Niveau: Fachsprache selbstverständlich verwenden, Zusammenhänge und Transfer einfordern.'
  }
};

export const TASK_TYPES = {
  openQuestions: 'Offene Fragen',
  multipleChoice: 'Multiple Choice',
  gapText: 'Lückentext',
  matching: 'Zuordnung',
  diagram: 'Diagramm auswerten',
  experiment: 'Experiment planen',
  application: 'Transfer / Anwendung'
};

export function emptyTeachingContext() {
  return { subject: '', gradeLevel: '', schoolType: 'unspecified', level: 'standard', taskTypes: [], notes: '' };
}

const STANDING_PROFILE = `Du unterstützt einen Lehrer am Rheinisch-Westfälischen Berufskolleg Essen (RWB), einer LVR-Förderschule mit Förderschwerpunkt Hören und Kommunikation. Die Schüler*innen sind schwerhörig bis gehörlos – formuliere sprachlich zugänglich (klare, kurze Sätze, jeden Fachbegriff erklären) und halte Layout-Vorschläge klar und aufgeräumt.

Er unterrichtet Biologie, Sport und Psychologie. In Biologie vier Bildungsgänge:
- HAE (Bio-Leistungskurs, Abitur): arbeitet eng am Buch „Biologie heute SII Gesamtband" (ISBN 978-3-14-150785-0), 3 Std./Woche, Klausuren nach den offiziellen KE-Vorgaben (Anforderungsbereich-Gewichtung II > I > III).
- HFH/HFS (Fachoberschule Wirtschaft bzw. Gesundheit/Soziales): 1 Std./Woche, kein Schulbuch, komplett arbeitsblatt-basiert, keine Klausuren.
- Vorklasse (HVK): 2 Std./Woche, kein Buch, bereitet auf HAE/HFH/HFS vor.

Arbeitsblätter und Klausuren folgen der festen RWB-Vorlage (eigenes Logo, feste Struktur: Leitfrage → Aufgaben mit Operatoren nach den Abiturvorgaben → Informationstext → ggf. Abbildung), maximal 2 Seiten. Bilder stammen aus der BiBox (E-Book, eingeloggt) oder frei lizenzierten Quellen wie Wikimedia Commons.`;

export function teachingContextConfigured(ctx) {
  return Boolean(
    ctx.subject.trim() || ctx.gradeLevel.trim() || ctx.schoolType !== 'unspecified' ||
    ctx.taskTypes.length || ctx.notes.trim()
  );
}

export function teachingContextSummary(ctx) {
  const parts = [];
  if (ctx.subject.trim()) parts.push(ctx.subject.trim());
  if (ctx.gradeLevel.trim()) parts.push(`Klasse ${ctx.gradeLevel.trim()}`);
  if (ctx.schoolType !== 'unspecified') parts.push(SCHOOL_TYPES[ctx.schoolType]);
  return parts.length ? parts.join(' · ') : 'Noch nichts eingestellt';
}

export function teachingPromptFragment(ctx) {
  if (!teachingContextConfigured(ctx)) return STANDING_PROFILE;
  const lines = [STANDING_PROFILE, '', 'Rahmen für dieses Projekt:'];
  const who = [];
  if (ctx.gradeLevel.trim()) who.push(`Klasse ${ctx.gradeLevel.trim()}`);
  if (ctx.schoolType !== 'unspecified') who.push(SCHOOL_TYPES[ctx.schoolType]);
  if (who.length) lines.push(`- Zielgruppe: ${who.join(', ')}`);
  if (ctx.subject.trim()) lines.push(`- Fach: ${ctx.subject.trim()}`);
  lines.push(`- Niveau: ${LEVELS[ctx.level].instruction}`);
  if (ctx.taskTypes.length) {
    const names = Object.keys(TASK_TYPES).filter((k) => ctx.taskTypes.includes(k)).map((k) => TASK_TYPES[k]).join(', ');
    lines.push(`- Wenn du Aufgaben formulierst, nutze diese Formate: ${names}.`);
    lines.push('- Beginne jede Aufgabe mit einem Operator (nenne, beschreibe, erkläre, vergleiche, beurteile …), passend zum Anforderungsbereich.');
  }
  if (ctx.notes.trim()) lines.push(`- Außerdem beachten: ${ctx.notes.trim()}`);
  return lines.join('\n');
}

// MARK: - Validierung

const roman = (v) => ({ 1: 'I', 2: 'II' }[v] || 'III');

export function validateGenerationInput(sheet, targetWords, requestedTaskCount) {
  const issues = [];
  if (!sheet.topic.trim()) issues.push({ id: 'topic', message: 'Bitte zuerst mindestens ein Thema auswählen oder eingeben.', severity: 'blocking' });
  if (!sheet.schoolClass.trim()) issues.push({ id: 'class', message: 'Bitte eine Klasse auswählen.', severity: 'blocking' });
  if (!sheet.term.trim()) issues.push({ id: 'term', message: 'Bitte ein Halbjahr auswählen.', severity: 'blocking' });
  if (requestedTaskCount < 3 || requestedTaskCount > 5) issues.push({ id: 'task-count', message: 'Bitte 3 bis 5 Aufgaben auswählen.', severity: 'blocking' });
  if (targetWords < 100 || targetWords > 800) issues.push({ id: 'word-target', message: 'Die Zielwortzahl muss zwischen 100 und 800 liegen.', severity: 'blocking' });
  return issues;
}

/**
 * Prüft den fertigen Inhalt. Nur wirklich Unbrauchbares blockiert – der
 * Rest ist ein Hinweis, den die Lehrkraft selbst bewertet.
 */
export function validateContent(sheet, targetWords = null, requestedTaskCount = null) {
  const issues = [];
  const add = (id, message, severity = 'blocking') => issues.push({ id, message, severity });

  if (!sheet.topic.trim()) add('topic', 'Die Überschrift fehlt.');
  if (!(sheet.infoText || '').trim()) add('info-text', 'Der Informationstext fehlt.');
  if (!filledTasks(sheet).length) add('tasks-empty', 'Das Arbeitsblatt enthält keine vollständige Aufgabe (Operator und Text).');

  if (!sheet.subtitle.trim()) add('subtitle', 'Die Unterzeile fehlt.', 'advisory');
  if (!sheet.guidingQuestion.trim()) add('guiding-question', 'Die Leitfrage fehlt.', 'advisory');

  const expectedCount = requestedTaskCount ?? sheet.tasks.length;
  if (expectedCount >= 3 && expectedCount <= 5 && filledTasks(sheet).length !== expectedCount) {
    add('task-count', `Gewünscht waren ${expectedCount} Aufgaben, vollständig sind ${filledTasks(sheet).length}.`, 'advisory');
  }

  sheet.tasks.forEach((task, index) => {
    const number = index + 1;
    if (!task.operator) {
      if (task.text.trim()) add(`task-${number}-operator`, `Für Aufgabe ${number} fehlt der Operator.`, 'advisory');
      return;
    }
    if (!task.text.trim()) add(`task-${number}-text`, `Der Text von Aufgabe ${number} fehlt.`, 'advisory');
    const level = expectedAFB(index, sheet.tasks.length);
    if (!operatorSupports(task.operator, level)) {
      add(`task-${number}-afb`, `Aufgabe ${number} läge im Aufbau bei AFB ${roman(level)}; „${task.operator.name}“ ist ${task.operator.afb}.`, 'advisory');
    }
  });

  const count = wordCount(sheet);
  if (targetWords) {
    const tolerance = Math.max(40, Math.round(targetWords * 0.35));
    if (count < Math.max(1, targetWords - tolerance) || count > targetWords + tolerance) {
      add('word-count', `Der Informationstext hat ${count} Wörter, angefragt waren ungefähr ${targetWords}.`, 'advisory');
    }
  } else if ((sheet.infoText || '').trim() && count < 50) {
    add('word-count', `Der Informationstext ist mit ${count} Wörtern sehr kurz.`, 'advisory');
  }

  return issues;
}

export function blockingIssues(issues) {
  return issues.filter((i) => i.severity === 'blocking');
}
