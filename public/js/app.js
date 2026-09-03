// Die Oberfläche: vier Reiter mit je eigener Bibliothek, dazu der
// Generator. Alles läuft im Browser – Blätter liegen in der IndexedDB
// des Geräts, der Schlüssel im lokalen Speicher.

import {
  OPERATORS, CLASSES, TARGET_PAGE_OPTIONS, TEXT_SIZES, PLACEMENTS,
  SCHOOL_TYPES, LEVELS, TASK_TYPES,
  emptyWorksheet, emptyTask, emptyTeachingContext,
  infoParagraphs, filledTasks, wordCount, fileName, pageLabel,
  matchOperator, expectedAFB, validateGenerationInput, validateContent,
  teachingPromptFragment
} from './model.js';
import { KINDS, kindById, systemPromptFor, klausurSystemPrompt, isKlausur, topicGroupsFor } from './kinds.js';
import * as store from './store.js';
import * as ai from './ai.js';
import * as pdf from './pdf.js';
import { buildDocx } from './docx.js';
import * as images from './imagesearch.js';
import { hasSolutions, recommendedWordCount } from './layout.js';
import * as km from './klausur-model.js';

const $ = (id) => document.getElementById(id);

const state = {
  kind: kindById(localStorage.getItem('ui.kind') || 'bio'),
  items: [],
  item: null,          // der Eintrag, an dem gearbeitet wird
  sheet: null,
  targetPages: 1,
  targetWords: 200,
  difficulty: 'Mittel',
  selectedTopics: new Set(),
  customTopic: '',
  warnings: [],
  generation: null,
  settings: store.loadJSON('ai.settings', ai.defaultSettings()),
  context: store.loadJSON('teaching.context', emptyTeachingContext()),
  // Klausur – eigener, kleiner Zustand, damit er den Arbeitsblatt-Zustand
  // oben nicht verändert.
  kItem: null,
  klausur: null,
  kWarnings: [],
  kGeneration: null
};

// MARK: - Start

init().catch((error) => showError(error));

async function init() {
  await pdf.loadAssets();
  buildTabs();
  fillStaticSelects();
  wireEvents();
  await refreshLibrary();
}

function buildTabs() {
  const tabs = $('tabs');
  tabs.innerHTML = '';
  for (const kind of KINDS) {
    const button = document.createElement('button');
    button.className = 'tab';
    button.type = 'button';
    button.role = 'tab';
    button.textContent = kind.label;
    button.setAttribute('aria-selected', String(kind.id === state.kind.id));
    button.onclick = async () => {
      state.kind = kind;
      localStorage.setItem('ui.kind', kind.id);
      buildTabs();
      showLibrary();
      await refreshLibrary();
    };
    tabs.appendChild(button);
  }
  $('topbar-title').textContent = state.kind.docLabel === 'Klausur'
    ? `Klausuren · ${state.kind.subject}`
    : `Arbeitsblätter · ${state.kind.subject}`;
  document.body.dataset.subject = state.kind.id;
}

function fillStaticSelects() {
  fillSelect($('f-class'), CLASSES.map((c) => [c, c]));
  fillSelect($('library-class'), [['', 'Alle Klassen'], ...CLASSES.map((c) => [c, c])]);
  fillSelect($('f-textsize'), Object.entries(TEXT_SIZES).map(([k, v]) => [k, v.label]));
  fillSelect($('f-pages'), TARGET_PAGE_OPTIONS.map((p) => [String(p), pageLabel(p)]));
  fillSelect($('f-placement'), Object.entries(PLACEMENTS));
  fillSelect($('s-provider'), Object.entries(ai.PROVIDERS).map(([k, v]) => [k, v.label]));
  fillSelect($('s-effort'), Object.entries(ai.EFFORTS));
  fillSelect($('c-schooltype'), Object.entries(SCHOOL_TYPES));
  fillSelect($('c-level'), Object.entries(LEVELS).map(([k, v]) => [k, v.label]));
  fillSelect($('i-source'), Object.entries(images.SOURCES));
  fillSelect($('k-class'), CLASSES.map((c) => [c, c]));
  fillSelect($('k-textsize'), Object.entries(TEXT_SIZES).map(([k, v]) => [k, v.label]));
}

function fillSelect(select, pairs) {
  select.innerHTML = '';
  for (const [value, label] of pairs) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }
}

// MARK: - Bibliothek

async function refreshLibrary() {
  state.items = await store.itemsOfKind(state.kind.id);
  renderLibrary();
}

function renderLibrary() {
  const klausurMode = isKlausur(state.kind);
  const query = $('library-search').value.trim().toLowerCase();
  const schoolClass = $('library-class').value;
  const list = $('library-list');
  list.innerHTML = '';

  const items = state.items.filter((item) => {
    const searchText = klausurMode
      ? (item.sheet.aufgabeTitel || '')
      : `${item.sheet.topic || ''} ${item.sheet.subtitle || ''} ${item.sheet.infoText || ''}`;
    const matchesQuery = !query || searchText.toLowerCase().includes(query);
    const matchesClass = !schoolClass || item.sheet.schoolClass === schoolClass;
    return matchesQuery && matchesClass;
  });

  $('library-empty').hidden = items.length > 0;
  $('library-empty').textContent = state.items.length
    ? 'Nichts gefunden.'
    : `Noch kein${state.kind.docLabel === 'Klausur' ? 'e Klausur' : ' Arbeitsblatt'} hier. Oben rechts auf „Neu“.`;

  for (const item of items) {
    const card = document.createElement('article');
    card.className = 'sheet-card';

    const title = document.createElement('h3');
    const rawTitle = (klausurMode ? item.sheet.aufgabeTitel : item.sheet.topic) || '';
    title.textContent = rawTitle.trim() || 'Ohne Titel';
    card.appendChild(title);

    const meta = document.createElement('p');
    meta.className = 'meta';
    meta.textContent = `${item.sheet.schoolClass} · ${new Date(item.modifiedAt).toLocaleDateString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    })}`;
    card.appendChild(meta);

    const badges = document.createElement('div');
    badges.className = 'badges';
    if (klausurMode) {
      badges.appendChild(badge(`${km.filledTeilaufgaben(item.sheet).length} Teilaufgaben`));
      badges.appendChild(badge(`${km.punkteSumme(item.sheet)} Punkte`));
      if (km.hasSolutions(item.sheet)) badges.appendChild(badge('mit Lösungen', 'solutions'));
    } else {
      badges.appendChild(badge(`${wordCount(item.sheet)} Wörter`));
      badges.appendChild(badge(`${filledTasks(item.sheet).length} Aufgaben`));
      if (hasSolutions(item.sheet)) badges.appendChild(badge('mit Lösungen', 'solutions'));
    }
    card.appendChild(badges);

    const actions = document.createElement('div');
    actions.className = 'card-actions';
    actions.appendChild(action('Öffnen', () => openItem(item), 'primary'));
    actions.appendChild(action('Duplizieren', async () => {
      await store.duplicateItem(item);
      await refreshLibrary();
    }));
    actions.appendChild(action('Löschen', async () => {
      const label = klausurMode ? item.sheet.aufgabeTitel : item.sheet.topic;
      if (!confirm(`„${label || 'Ohne Titel'}“ wirklich löschen?`)) return;
      await store.deleteItem(item.id);
      await refreshLibrary();
    }, 'danger'));
    card.appendChild(actions);

    list.appendChild(card);
  }
}

function badge(text, extra = '') {
  const span = document.createElement('span');
  span.className = `badge ${extra}`.trim();
  span.textContent = text;
  return span;
}

function action(label, handler, className = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.onclick = handler;
  return button;
}

// MARK: - Ansichten

function showLibrary() {
  $('view-library').hidden = false;
  $('view-editor').hidden = true;
  $('view-editor-klausur').hidden = true;
  $('actionbar').hidden = true;
  $('actionbar-k').hidden = true;
  window.scrollTo(0, 0);
}

function showEditor() {
  $('view-library').hidden = true;
  $('view-editor').hidden = false;
  $('view-editor-klausur').hidden = true;
  $('actionbar').hidden = false;
  $('actionbar-k').hidden = true;
  window.scrollTo(0, 0);
}

function showKlausurEditor() {
  $('view-library').hidden = true;
  $('view-editor').hidden = true;
  $('view-editor-klausur').hidden = false;
  $('actionbar').hidden = true;
  $('actionbar-k').hidden = false;
  window.scrollTo(0, 0);
}

function newItem() {
  if (isKlausur(state.kind)) {
    const klausur = km.emptyKlausur();
    klausur.subjectLine = state.kind.subject;
    return {
      id: crypto.randomUUID(),
      kind: state.kind.id,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      sheet: klausur
    };
  }
  const sheet = emptyWorksheet();
  sheet.subjectLine = state.kind.subject;
  return {
    id: crypto.randomUUID(),
    kind: state.kind.id,
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
    sheet,
    targetPages: 1,
    difficulty: 'Mittel'
  };
}

/** Öffnet den passenden Editor – Klausur oder Arbeitsblatt, je nach Reiter. */
function openItem(item) {
  if (isKlausur(state.kind)) openKlausurEditor(item);
  else openEditor(item);
}

function openEditor(item) {
  state.item = structuredClone(item);
  state.sheet = { ...emptyWorksheet(), ...state.item.sheet };
  state.sheet.subjectLine = state.sheet.subjectLine || state.kind.subject;
  state.targetPages = item.targetPages ?? 1;
  state.difficulty = item.difficulty ?? 'Mittel';
  state.selectedTopics = new Set();
  state.customTopic = '';
  state.warnings = [];

  const clamped = Math.min(Math.max(state.sheet.tasks.length, 3), 5);
  while (state.sheet.tasks.length < clamped) state.sheet.tasks.push(emptyTask());
  state.sheet.tasks = state.sheet.tasks.slice(0, clamped);

  bindEditor();
  showEditor();
}

function bindEditor() {
  const sheet = state.sheet;
  $('f-class').value = sheet.schoolClass;
  $('f-term').value = sheet.term;
  $('f-difficulty').value = state.difficulty;
  $('f-textsize').value = sheet.textSize;
  $('f-topic').value = sheet.topic;
  $('f-subtitle').value = sheet.subtitle;
  $('f-question').value = sheet.guidingQuestion;
  $('f-info').value = sheet.infoText;
  $('f-memo').value = sheet.memo;
  $('f-customtopic').value = state.customTopic;
  $('f-pages').value = String(state.targetPages);
  $('f-caption').value = sheet.imageCaption;
  $('f-placement').value = sheet.imagePlacement;
  $('f-imagewidth').value = String(sheet.imageWidth);
  $('image-width-value').textContent = String(Math.round(sheet.imageWidth));
  $('generate-label').textContent = `${state.kind.docLabel} generieren`;

  renderTopicPicker();
  renderTasks();
  renderImage();
  renderWarnings();
  updateDerived();
}

// MARK: - Themenauswahl

function renderTopicPicker() {
  const wrap = $('topic-picker-wrap');
  const picker = $('topic-picker');
  const groups = topicGroupsFor(state.kind, state.sheet.schoolClass, state.sheet.term);
  picker.innerHTML = '';
  wrap.hidden = groups.length === 0;
  if (!groups.length) return;

  for (const [title, topics] of groups) {
    const heading = document.createElement('p');
    heading.className = 'hint strong';
    heading.textContent = title;
    heading.style.width = '100%';
    picker.appendChild(heading);
    for (const topic of topics) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = topic;
      chip.setAttribute('aria-pressed', String(state.selectedTopics.has(topic)));
      chip.onclick = () => {
        if (state.selectedTopics.has(topic)) state.selectedTopics.delete(topic);
        else state.selectedTopics.add(topic);
        chip.setAttribute('aria-pressed', String(state.selectedTopics.has(topic)));
        updateTopicField();
      };
      picker.appendChild(chip);
    }
  }
}

/** Lehrplan-Auswahl und eigenes Thema ergeben zusammen die Überschrift. */
function updateTopicField() {
  const groups = topicGroupsFor(state.kind, state.sheet.schoolClass, state.sheet.term);
  const ordered = groups.flatMap(([, topics]) => topics).filter((t) => state.selectedTopics.has(t));
  const custom = state.customTopic.trim();
  const parts = custom ? [...ordered, custom] : ordered;
  if (!parts.length) return;
  state.sheet.topic = parts.join(' + ');
  $('f-topic').value = state.sheet.topic;
  updateDerived();
}

// MARK: - Aufgaben

function renderTasks() {
  const list = $('task-list');
  list.innerHTML = '';
  $('task-count').textContent = String(state.sheet.tasks.length);

  state.sheet.tasks.forEach((task, index) => {
    const box = document.createElement('div');
    box.className = 'task';

    const number = document.createElement('div');
    number.className = 'task-number';
    number.textContent = `Aufgabe ${index + 1} · Aufbau: AFB ${['I', 'II', 'III'][expectedAFB(index, state.sheet.tasks.length) - 1]}`;
    box.appendChild(number);

    const operatorLabel = document.createElement('label');
    operatorLabel.className = 'field';
    operatorLabel.textContent = 'Operator';
    const select = document.createElement('select');
    fillSelect(select, [['', 'Noch nicht gewählt'], ...OPERATORS.map((o) => [o.name, `${o.name} · ${o.afb}`])]);
    select.value = task.operator?.name || '';
    select.onchange = () => {
      task.operator = select.value ? OPERATORS.find((o) => o.name === select.value) : null;
      updateDerived();
    };
    operatorLabel.appendChild(select);
    box.appendChild(operatorLabel);

    box.appendChild(textareaField('weiterer Text der Aufgabe', task.text, 2, (value) => {
      task.text = value;
      updateDerived();
    }));

    const solution = textareaField('Lösung (nur für dich)', task.solution, 2, (value) => {
      task.solution = value;
      updateSolutionButton();
    });
    solution.classList.add('solution');
    box.appendChild(solution);

    list.appendChild(box);
  });
  updateSolutionButton();
}

function textareaField(label, value, rows, onInput) {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  wrap.textContent = label;
  const area = document.createElement('textarea');
  area.rows = rows;
  area.value = value;
  area.oninput = () => onInput(area.value);
  wrap.appendChild(area);
  return wrap;
}

function updateSolutionButton() {
  $('btn-solutions').hidden = !hasSolutions(state.sheet);
}

// MARK: - Bild

function renderImage() {
  const has = Boolean(state.sheet.imageDataURL);
  $('image-settings').hidden = !has;
  if (has) $('image-preview').src = state.sheet.imageDataURL;
}

function applyImage(result, caption) {
  state.sheet.imageDataURL = result.dataURL;
  state.sheet.imagePixelWidth = result.width;
  state.sheet.imagePixelHeight = result.height;
  if (caption !== undefined) {
    state.sheet.imageCaption = caption ? `Quelle: ${caption}` : 'Quelle: Internet';
    state.sheet.imagePlacement = 'right';
    $('f-caption').value = state.sheet.imageCaption;
    $('f-placement').value = 'right';
  }
  renderImage();
  updateDerived();
}

// MARK: - Abgeleitete Anzeigen

let derivedTimer = null;
function updateDerived() {
  clearTimeout(derivedTimer);
  derivedTimer = setTimeout(() => {
    $('word-count').textContent = `${wordCount(state.sheet)} Wörter`;
    try {
      state.targetWords = recommendedWordCount(state.sheet, state.targetPages, pdf.measure);
      const pages = pdf.pageCount(state.sheet);
      const limit = Math.ceil(state.targetPages);
      const estimate = $('page-estimate');
      estimate.textContent = pages === 1 ? '1 PDF-Seite' : `${pages} PDF-Seiten`;
      estimate.className = `status ${pages <= limit ? 'ok' : 'over'}`;
      $('word-target-hint').textContent =
        `Etwa ${state.targetWords} Wörter Informationstext, damit das Blatt bis zur letzten Zeile reicht – die Schriftgröße bleibt unverändert.`;
    } catch (error) {
      console.warn(error);
    }
    $('cost-estimate').textContent = costEstimate();
  }, 250);
}

function costEstimate() {
  const system = systemPromptFor(state.kind) + teachingPromptFragment(state.context);
  const inputTokens = Math.max(550, Math.round(system.length / 4));
  const outputTokens = Math.max(450, Math.round(state.targetWords * 1.55) + state.sheet.tasks.length * 90);
  const cost = ai.estimatedCost(state.settings, inputTokens, outputTokens);
  const tokens = (inputTokens + outputTokens).toLocaleString('de-DE');
  if (cost === null) return `Geschätzt etwa ${tokens} Tokens; Preis für dieses Modell unbekannt.`;
  const price = cost < 0.01 ? 'unter 0,01 $' : `${cost.toFixed(2)} $`;
  return `Geschätzt etwa ${tokens} Tokens · ${price} pro Generierung.`;
}

function renderWarnings() {
  const box = $('warnings');
  const list = $('warning-list');
  list.innerHTML = '';
  box.hidden = state.warnings.length === 0;
  for (const issue of state.warnings) {
    const li = document.createElement('li');
    li.className = 'hint';
    li.textContent = issue.message;
    list.appendChild(li);
  }
}

// MARK: - Generierung

async function generate() {
  const issues = validateGenerationInput(state.sheet, Math.round(state.targetWords), state.sheet.tasks.length);
  if (issues.length) {
    showError(issues.map((i) => i.message).join('\n'));
    return;
  }

  const controller = new AbortController();
  state.generation = controller;
  $('btn-generate').disabled = true;
  $('btn-generate').textContent = `Schreibt ${state.kind.docLabel === 'Klausur' ? 'die Klausur' : 'das Arbeitsblatt'} …`;
  $('btn-cancel').hidden = false;
  showError(null);
  state.warnings = [];
  renderWarnings();

  const settings = {
    ...state.settings,
    systemPrompt: `${systemPromptFor(state.kind)}\n\n${teachingPromptFragment(state.context)}`
  };

  const prompt = [
    `Thema: ${state.sheet.topic}`,
    `Klasse: ${state.sheet.schoolClass}`,
    `Halbjahr: ${state.sheet.term}`,
    `Fach: ${state.kind.subject}`,
    `Schwierigkeit: ${state.difficulty}. Textgröße: ${TEXT_SIZES[state.sheet.textSize].label}. ` +
    `Gewünschte Seitenlänge: ${pageLabel(state.targetPages)}. Informationstext: genau ${Math.round(state.targetWords)} Wörter ` +
    `(feste Vorgabe, damit das Blatt bis zur letzten Zeile gefüllt ist). Erzeuge genau ${state.sheet.tasks.length} Aufgaben, jede mit eigener Musterlösung.`,
    state.sheet.subtitle ? `Unterzeile-Vorgabe: ${state.sheet.subtitle}` : ''
  ].filter(Boolean).join('\n');

  try {
    const raw = await ai.send([{ role: 'user', text: prompt }], settings, controller.signal);
    applyResponse(raw);
    await persist();
    toast('Fertig – alles lässt sich von Hand nachbessern.');
  } catch (error) {
    if (error.name !== 'AbortError') showError(error.message || String(error));
  } finally {
    state.generation = null;
    $('btn-generate').disabled = false;
    $('btn-generate').innerHTML = `✨ <span id="generate-label">${state.kind.docLabel} generieren</span>`;
    $('btn-cancel').hidden = true;
  }
}

/**
 * Nimmt die Antwort entgegen – bewusst nachsichtig. Was formal nicht
 * stimmt, wird als Hinweis angezeigt; ein fertig geschriebenes Blatt
 * wegen einer verfehlten Wortzahl zu verwerfen wäre nur Arbeitsverlust.
 */
function applyResponse(raw) {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('Die Antwort war nicht lesbar.');
  const object = JSON.parse(raw.slice(start, end + 1));

  const sheet = state.sheet;
  if (object.subtitle) sheet.subtitle = object.subtitle;
  if (object.guidingQuestion) sheet.guidingQuestion = object.guidingQuestion;
  const info = object.infoText || object.informationText || object.information_text;
  if (info && info.trim()) sheet.infoText = info;
  if (object.memo) sheet.memo = object.memo;

  const requested = Math.min(Math.max(sheet.tasks.length, 3), 5);
  let rawTasks = [];
  if (Array.isArray(object.tasks)) {
    rawTasks = object.tasks.map((entry) =>
      typeof entry === 'string' ? splitSentenceIntoTask(entry) : entry);
  }

  if (rawTasks.length) {
    const tasks = rawTasks.map((entry, index) => {
      // Nie verwerfen: unbekannte Schreibweisen werden anhand der
      // gewünschten AFB-Reihenfolge auf einen gültigen Operator geführt.
      const level = expectedAFB(index, requested);
      const fallbackName = level === 1 ? 'Benennen Sie' : level === 2 ? 'Erläutern Sie' : 'Bewerten Sie';
      const operator = matchOperator(entry.operator || '') || matchOperator(fallbackName);
      return {
        operator,
        text: entry.text || entry.question || entry.aufgabe || '',
        solution: entry.solution || entry.loesung || entry.answer || ''
      };
    });
    while (tasks.length < requested) tasks.push(emptyTask());
    sheet.tasks = tasks.slice(0, requested);
  }

  state.warnings = validateContent(sheet, Math.round(state.targetWords), requested);
  bindEditor();
}

function splitSentenceIntoTask(sentence) {
  const trimmed = sentence.trim();
  for (const op of OPERATORS) {
    if (trimmed.toLowerCase().startsWith(op.name.toLowerCase())) {
      return { operator: op.name, text: trimmed.slice(op.name.length).trim() };
    }
  }
  return { operator: '', text: trimmed };
}

// MARK: - Klausur

function openKlausurEditor(item) {
  state.kItem = structuredClone(item);
  state.klausur = { ...km.emptyKlausur(), ...state.kItem.sheet };
  state.klausur.subjectLine = state.klausur.subjectLine || state.kind.subject;
  state.kWarnings = [];

  const clamped = Math.min(Math.max(state.klausur.teilaufgaben.length, 2), 5);
  while (state.klausur.teilaufgaben.length < clamped) state.klausur.teilaufgaben.push(km.emptyTeilaufgabe());
  state.klausur.teilaufgaben = state.klausur.teilaufgaben.slice(0, clamped);
  if (!state.klausur.material.length) state.klausur.material.push(km.emptyMaterial());

  bindKlausurEditor();
  showKlausurEditor();
}

function bindKlausurEditor() {
  const k = state.klausur;
  $('k-class').value = k.schoolClass;
  $('k-term').value = k.term;
  $('k-textsize').value = k.textSize;
  $('k-topic').value = k.aufgabeTitel;

  renderKTasks();
  renderKMaterial();
  renderKWarnings();
  updateKDerived();
}

function renderKTasks() {
  const list = $('k-task-list');
  list.innerHTML = '';
  $('k-count').textContent = String(state.klausur.teilaufgaben.length);

  state.klausur.teilaufgaben.forEach((t, index) => {
    const box = document.createElement('div');
    box.className = 'task';

    const number = document.createElement('div');
    number.className = 'task-number';
    number.textContent = `Teilaufgabe 1.${index + 1}`;
    box.appendChild(number);

    const operatorLabel = document.createElement('label');
    operatorLabel.className = 'field';
    operatorLabel.textContent = 'Operator';
    const select = document.createElement('select');
    fillSelect(select, [['', 'Noch nicht gewählt'], ...OPERATORS.map((o) => [o.name, `${o.name} · ${o.afb}`])]);
    select.value = t.operator?.name || '';
    select.onchange = () => {
      t.operator = select.value ? OPERATORS.find((o) => o.name === select.value) : null;
      updateKDerived();
    };
    operatorLabel.appendChild(select);
    box.appendChild(operatorLabel);

    box.appendChild(textareaField('Aufgabentext (nach dem Operator)', t.text, 2, (value) => {
      t.text = value;
      updateKDerived();
    }));

    const pointsLabel = document.createElement('label');
    pointsLabel.className = 'field';
    pointsLabel.textContent = 'Punkte';
    const pointsInput = document.createElement('input');
    pointsInput.type = 'text';
    pointsInput.inputMode = 'numeric';
    pointsInput.value = String(t.punkte);
    pointsInput.oninput = () => {
      t.punkte = Number(pointsInput.value.replace(/[^0-9]/g, '')) || 0;
      updateKDerived();
    };
    pointsLabel.appendChild(pointsInput);
    box.appendChild(pointsLabel);

    const solution = textareaField('Lösung (nur für dich)', t.solution, 2, (value) => {
      t.solution = value;
      updateKSolutionButton();
    });
    solution.classList.add('solution');
    box.appendChild(solution);

    list.appendChild(box);
  });
  updateKSolutionButton();
}

function renderKMaterial() {
  const list = $('k-material-list');
  list.innerHTML = '';

  state.klausur.material.forEach((m, index) => {
    const box = document.createElement('div');
    box.className = 'task';

    const number = document.createElement('div');
    number.className = 'task-number';
    number.textContent = `Material ${index + 1}`;
    box.appendChild(number);

    box.appendChild(textareaField('Titel (z. B. "Material 1.1: …")', m.titel, 1, (value) => {
      m.titel = value;
    }));
    box.appendChild(textareaField('Text', m.text, 4, (value) => {
      m.text = value;
      updateKDerived();
    }));

    if (state.klausur.material.length > 1) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'danger';
      remove.textContent = 'Material entfernen';
      remove.onclick = () => {
        state.klausur.material.splice(index, 1);
        renderKMaterial();
        updateKDerived();
      };
      box.appendChild(remove);
    }

    list.appendChild(box);
  });
}

function updateKSolutionButton() {
  $('k-btn-solutions').hidden = !km.hasSolutions(state.klausur);
}

let kDerivedTimer = null;
function updateKDerived() {
  clearTimeout(kDerivedTimer);
  kDerivedTimer = setTimeout(() => {
    const summe = km.punkteSumme(state.klausur);
    $('k-punkte-summe').textContent = `${summe} Punkte insgesamt`;
    try {
      const pages = pdf.klausurPageCount(state.klausur);
      $('k-page-estimate').textContent = pages === 1 ? '1 PDF-Seite' : `${pages} PDF-Seiten`;
    } catch (error) {
      console.warn(error);
    }
    $('k-cost-estimate').textContent = kCostEstimate();
  }, 250);
}

function kCostEstimate() {
  const system = klausurSystemPrompt(state.kind);
  const inputTokens = Math.max(550, Math.round(system.length / 4));
  const outputTokens = Math.max(500, state.klausur.teilaufgaben.length * 220);
  const cost = ai.estimatedCost(state.settings, inputTokens, outputTokens);
  const tokens = (inputTokens + outputTokens).toLocaleString('de-DE');
  if (cost === null) return `Geschätzt etwa ${tokens} Tokens; Preis für dieses Modell unbekannt.`;
  const price = cost < 0.01 ? 'unter 0,01 $' : `${cost.toFixed(2)} $`;
  return `Geschätzt etwa ${tokens} Tokens · ${price} pro Generierung.`;
}

function renderKWarnings() {
  const box = $('k-warnings');
  const list = $('k-warning-list');
  list.innerHTML = '';
  box.hidden = state.kWarnings.length === 0;
  for (const issue of state.kWarnings) {
    const li = document.createElement('li');
    li.className = 'hint';
    li.textContent = issue.message;
    list.appendChild(li);
  }
}

async function generateKlausur() {
  const issues = km.validateGenerationInput(state.klausur, state.klausur.teilaufgaben.length);
  if (issues.length) {
    showKError(issues.map((i) => i.message).join('\n'));
    return;
  }

  const controller = new AbortController();
  state.kGeneration = controller;
  $('k-btn-generate').disabled = true;
  $('k-btn-generate').textContent = 'Schreibt die Klausur …';
  $('k-btn-cancel').hidden = false;
  showKError(null);
  state.kWarnings = [];
  renderKWarnings();

  const settings = { ...state.settings, systemPrompt: klausurSystemPrompt(state.kind) };
  const prompt = [
    `Thema: ${state.klausur.aufgabeTitel}`,
    `Klasse: ${state.klausur.schoolClass}`,
    `Halbjahr: ${state.klausur.term}`,
    `Fach: ${state.kind.subject}`,
    `Erzeuge genau ${state.klausur.teilaufgaben.length} Teilaufgaben, jede mit Operator, Punktzahl und Musterlösung, gestützt auf passendes Material.`
  ].join('\n');

  try {
    const raw = await ai.send([{ role: 'user', text: prompt }], settings, controller.signal);
    applyKlausurResponse(raw);
    await persistKlausur();
    toast('Fertig – alles lässt sich von Hand nachbessern.');
  } catch (error) {
    if (error.name !== 'AbortError') showKError(error.message || String(error));
  } finally {
    state.kGeneration = null;
    $('k-btn-generate').disabled = false;
    $('k-btn-generate').textContent = '✨ Klausur generieren';
    $('k-btn-cancel').hidden = true;
  }
}

function applyKlausurResponse(raw) {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('Die Antwort war nicht lesbar.');
  const object = JSON.parse(raw.slice(start, end + 1));

  const k = state.klausur;
  if (object.aufgabeTitel) k.aufgabeTitel = object.aufgabeTitel;

  const requested = Math.min(Math.max(k.teilaufgaben.length, 2), 5);
  if (Array.isArray(object.teilaufgaben)) {
    const teilaufgaben = object.teilaufgaben.map((entry) => ({
      operator: matchOperator(entry.operator || '') || matchOperator('Erläutern Sie'),
      text: entry.text || '',
      punkte: Number(entry.punkte) || 10,
      solution: entry.solution || '',
      material: entry.material || ''
    }));
    while (teilaufgaben.length < requested) teilaufgaben.push(km.emptyTeilaufgabe());
    k.teilaufgaben = teilaufgaben.slice(0, requested);
  }

  if (Array.isArray(object.material) && object.material.length) {
    k.material = object.material.map((entry) => ({ titel: entry.titel || '', text: entry.text || '' }));
  }

  state.kWarnings = km.validateContent(k);
  bindKlausurEditor();
}

async function persistKlausur() {
  state.kItem.sheet = state.klausur;
  state.kItem.kind = state.kind.id;
  state.kItem = await store.saveItem(state.kItem);
  await refreshLibrary();
}

function requireKlausurExportable() {
  const blocking = km.blockingIssues(km.validateContent(state.klausur));
  if (blocking.length) {
    showKError(blocking.map((i) => i.message).join(' '));
    return false;
  }
  return true;
}

function showKError(message) {
  const box = $('k-error-text');
  box.hidden = !message;
  box.textContent = message ? String(message.message || message) : '';
}

// MARK: - Sichern und Export

async function persist() {
  state.item.sheet = state.sheet;
  state.item.targetPages = state.targetPages;
  state.item.difficulty = state.difficulty;
  state.item.kind = state.kind.id;
  state.item = await store.saveItem(state.item);
  await refreshLibrary();
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function requireExportable() {
  const blocking = validateContent(state.sheet).filter((i) => i.severity === 'blocking');
  if (blocking.length) {
    showError(blocking.map((i) => i.message).join(' '));
    return false;
  }
  return true;
}

// MARK: - Ereignisse

function wireEvents() {
  $('btn-new').onclick = () => openItem(newItem());
  $('btn-back').onclick = async () => { await persist(); showLibrary(); };
  $('library-search').oninput = renderLibrary;
  $('library-class').onchange = renderLibrary;

  bindField('f-class', (v) => { state.sheet.schoolClass = v; state.selectedTopics.clear(); renderTopicPicker(); }, 'change');
  bindField('f-term', (v) => { state.sheet.term = v; state.selectedTopics.clear(); renderTopicPicker(); }, 'change');
  bindField('f-difficulty', (v) => { state.difficulty = v; }, 'change');
  bindField('f-textsize', (v) => { state.sheet.textSize = v; }, 'change');
  bindField('f-pages', (v) => { state.targetPages = Number(v); }, 'change');
  bindField('f-topic', (v) => { state.sheet.topic = v; });
  bindField('f-subtitle', (v) => { state.sheet.subtitle = v; });
  bindField('f-question', (v) => { state.sheet.guidingQuestion = v; });
  bindField('f-info', (v) => { state.sheet.infoText = v; });
  bindField('f-memo', (v) => { state.sheet.memo = v; });
  bindField('f-caption', (v) => { state.sheet.imageCaption = v; });
  bindField('f-placement', (v) => { state.sheet.imagePlacement = v; }, 'change');
  bindField('f-imagewidth', (v) => {
    state.sheet.imageWidth = Number(v);
    $('image-width-value').textContent = v;
  });
  $('f-customtopic').oninput = () => {
    state.customTopic = $('f-customtopic').value;
    updateTopicField();
  };

  $('btn-task-plus').onclick = () => {
    if (state.sheet.tasks.length >= 5) return;
    state.sheet.tasks.push(emptyTask());
    renderTasks();
    updateDerived();
  };
  $('btn-task-minus').onclick = () => {
    if (state.sheet.tasks.length <= 3) return;
    state.sheet.tasks.pop();
    renderTasks();
    updateDerived();
  };

  $('btn-generate').onclick = generate;
  $('btn-cancel').onclick = () => state.generation?.abort();

  $('btn-save').onclick = async () => { await persist(); toast('Gesichert.'); };

  $('btn-preview').onclick = () => {
    if (!requireExportable()) return;
    const blob = pdf.buildPDF(state.sheet).output('blob');
    $('preview-frame').src = URL.createObjectURL(blob);
    $('dlg-preview').showModal();
  };
  $('preview-close').onclick = () => $('dlg-preview').close();

  $('btn-pdf').onclick = async () => {
    if (!requireExportable()) return;
    download(pdf.buildPDF(state.sheet).output('blob'), `${fileName(state.sheet)}.pdf`);
    await persist();
  };

  $('btn-solutions').onclick = () => {
    download(pdf.buildSolutionsPDF(state.sheet).output('blob'), `${fileName(state.sheet)}_Loesungen.pdf`);
  };

  $('btn-word').onclick = async () => {
    if (!requireExportable()) return;
    try {
      const bytes = await buildDocx(state.sheet);
      download(new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      }), `${fileName(state.sheet)}.docx`);
      await persist();
    } catch (error) {
      showError(error.message || String(error));
    }
  };

  // Bild
  $('f-imagefile').onchange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      applyImage(await images.readFile(file));
    } catch (error) {
      showError(error.message);
    }
    event.target.value = '';
  };
  $('btn-image-remove').onclick = () => {
    state.sheet.imageDataURL = null;
    state.sheet.imageCaption = '';
    $('f-caption').value = '';
    renderImage();
    updateDerived();
  };
  $('btn-imagesearch').onclick = () => {
    $('i-query').value = state.sheet.topic;
    $('dlg-image').showModal();
  };
  $('i-close').onclick = () => $('dlg-image').close();
  $('i-search').onclick = runImageSearch;
  $('i-query').onkeydown = (event) => { if (event.key === 'Enter') runImageSearch(); };

  // Hell/Dunkel — dunkel ist der Grundzustand, die Wahl bleibt gemerkt.
  $('btn-theme').onclick = () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('ui.theme', next);
    applyThemeIcon();
  };
  applyThemeIcon();
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (!document.documentElement.getAttribute('data-theme')) applyThemeIcon();
  });

  // Einstellungen
  $('btn-settings').onclick = openSettings;
  $('s-provider').onchange = () => {
    state.settings.provider = $('s-provider').value;
    state.settings.model = ai.PROVIDERS[state.settings.provider].defaultModel;
    fillModelSelect();
    $('s-key').value = store.loadKey(state.settings.provider);
    $('s-key-hint').textContent = ai.PROVIDERS[state.settings.provider].keyHint;
  };
  $('s-model').onchange = () => { state.settings.model = $('s-model').value; showModelHint(); };
  $('s-effort').onchange = () => { state.settings.effort = $('s-effort').value; };
  $('s-key').oninput = () => store.saveKey(state.settings.provider, $('s-key').value.trim());
  $('dlg-settings').addEventListener('close', () => {
    store.saveJSON('ai.settings', state.settings);
    if (state.sheet) updateDerived();
  });

  // Unterrichts-Kontext
  $('btn-context').onclick = openContext;
  $('dlg-context').addEventListener('close', () => {
    state.context = {
      subject: $('c-subject').value,
      gradeLevel: $('c-grade').value,
      schoolType: $('c-schooltype').value,
      level: $('c-level').value,
      taskTypes: [...document.querySelectorAll('#c-tasktypes .chip[aria-pressed="true"]')].map((c) => c.dataset.key),
      notes: $('c-notes').value
    };
    store.saveJSON('teaching.context', state.context);
  });

  // Nichts verlieren, wenn der Reiter geschlossen wird.
  window.addEventListener('beforeunload', () => {
    if (state.item && state.sheet) {
      state.item.sheet = state.sheet;
      store.saveItem(state.item);
    }
    if (state.kItem && state.klausur) {
      state.kItem.sheet = state.klausur;
      store.saveItem(state.kItem);
    }
  });

  wireKlausurEvents();
}

function wireKlausurEvents() {
  $('btn-back-k').onclick = async () => { await persistKlausur(); showLibrary(); };

  bindKField('k-class', (v) => { state.klausur.schoolClass = v; }, 'change');
  bindKField('k-term', (v) => { state.klausur.term = v; }, 'change');
  bindKField('k-textsize', (v) => { state.klausur.textSize = v; }, 'change');
  bindKField('k-topic', (v) => { state.klausur.aufgabeTitel = v; });

  $('k-btn-plus').onclick = () => {
    if (state.klausur.teilaufgaben.length >= 5) return;
    state.klausur.teilaufgaben.push(km.emptyTeilaufgabe());
    renderKTasks();
    updateKDerived();
  };
  $('k-btn-minus').onclick = () => {
    if (state.klausur.teilaufgaben.length <= 2) return;
    state.klausur.teilaufgaben.pop();
    renderKTasks();
    updateKDerived();
  };
  $('k-btn-material-add').onclick = () => {
    state.klausur.material.push(km.emptyMaterial());
    renderKMaterial();
  };

  $('k-btn-generate').onclick = generateKlausur;
  $('k-btn-cancel').onclick = () => state.kGeneration?.abort();

  $('k-btn-save').onclick = async () => { await persistKlausur(); toast('Gesichert.'); };

  $('k-btn-preview').onclick = () => {
    if (!requireKlausurExportable()) return;
    const blob = pdf.buildKlausurPDF(state.klausur).output('blob');
    $('preview-frame').src = URL.createObjectURL(blob);
    $('dlg-preview').showModal();
  };

  $('k-btn-pdf').onclick = async () => {
    if (!requireKlausurExportable()) return;
    download(pdf.buildKlausurPDF(state.klausur).output('blob'), `${km.fileName(state.klausur)}.pdf`);
    await persistKlausur();
  };

  $('k-btn-solutions').onclick = () => {
    download(pdf.buildKlausurSolutionsPDF(state.klausur).output('blob'), `${km.fileName(state.klausur)}_Loesungen.pdf`);
  };
}

function bindKField(id, apply, event = 'input') {
  const element = $(id);
  element.addEventListener(event, () => {
    apply(element.value);
    updateKDerived();
  });
}

function currentTheme() {
  const explicit = document.documentElement.getAttribute('data-theme');
  if (explicit) return explicit;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyThemeIcon() {
  const dark = currentTheme() === 'dark';
  const btn = $('btn-theme');
  btn.textContent = dark ? '☀️' : '🌙';
  btn.title = dark ? 'Zu Hell wechseln' : 'Zu Dunkel wechseln';
  btn.setAttribute('aria-pressed', String(dark));
}

function bindField(id, apply, event = 'input') {
  const element = $(id);
  element.addEventListener(event, () => {
    apply(element.value);
    updateDerived();
  });
}

function openSettings() {
  $('s-provider').value = state.settings.provider;
  fillModelSelect();
  $('s-effort').value = state.settings.effort;
  $('s-key').value = store.loadKey(state.settings.provider);
  $('s-key-hint').textContent = ai.PROVIDERS[state.settings.provider].keyHint;
  $('dlg-settings').showModal();
}

function fillModelSelect() {
  const models = ai.PROVIDERS[state.settings.provider].models;
  fillSelect($('s-model'), models.map((m) => [m.id, `${m.label} · ${ai.priceLabel(m)}`]));
  $('s-model').value = state.settings.model;
  showModelHint();
}

function showModelHint() {
  const model = ai.modelOption(state.settings);
  $('s-model-hint').textContent = model ? model.hint : '';
}

function openContext() {
  $('c-subject').value = state.context.subject;
  $('c-grade').value = state.context.gradeLevel;
  $('c-schooltype').value = state.context.schoolType;
  $('c-level').value = state.context.level;
  $('c-notes').value = state.context.notes;

  const box = $('c-tasktypes');
  box.innerHTML = '';
  for (const [key, label] of Object.entries(TASK_TYPES)) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.dataset.key = key;
    chip.textContent = label;
    chip.setAttribute('aria-pressed', String(state.context.taskTypes.includes(key)));
    chip.onclick = () => chip.setAttribute('aria-pressed',
      chip.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
    box.appendChild(chip);
  }
  $('dlg-context').showModal();
}

async function runImageSearch() {
  const query = $('i-query').value.trim();
  const source = $('i-source').value;
  const results = $('i-results');
  const status = $('i-status');
  results.innerHTML = '';
  status.textContent = 'Sucht …';

  try {
    const found = await images.search(query, source);
    status.textContent = found.length ? `${found.length} Treffer – zum Übernehmen antippen.` : 'Nichts gefunden.';
    for (const item of found) {
      const figure = document.createElement('figure');
      const img = document.createElement('img');
      img.src = item.thumbnailURL;
      img.alt = item.title;
      img.loading = 'lazy';
      const caption = document.createElement('figcaption');
      caption.textContent = item.credit;
      figure.append(img, caption);
      figure.onclick = async () => {
        status.textContent = 'Lädt das Bild …';
        try {
          applyImage(await images.download(item), item.credit);
          $('dlg-image').close();
        } catch (error) {
          status.textContent = error.message;
        }
      };
      results.appendChild(figure);
    }
  } catch (error) {
    status.textContent = `Die Suche hat nicht geklappt. ${error.message}`;
  }
}

// MARK: - Kleinkram

function showError(message) {
  const box = $('error-text');
  box.hidden = !message;
  box.textContent = message ? String(message.message || message) : '';
}

let toastTimer = null;
function toast(text) {
  const box = $('toast');
  box.textContent = text;
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; }, 2600);
}
