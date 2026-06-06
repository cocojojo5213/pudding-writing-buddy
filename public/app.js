const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  project: null,
  selectedChapterId: null,
  saveTimer: null,
  saveInFlight: null,
  revision: 0,
  savedRevision: 0,
  actionLocked: false,
  busy: false,
  ready: false,
  metrics: null
};

const projectFields = [
  'title',
  'genre',
  'protagonist',
  'targetWords',
  'language',
  'logline',
  'authorIntent',
  'currentFocus',
  'storyBible',
  'bookRules',
  'bannedPatterns',
  'notes',
  'styleProfile'
];

const modelFields = ['baseUrl', 'model', 'apiKey', 'temperature', 'maxTokens'];

init();

async function init() {
  bindTabs();
  bindStaticControls();
  loadModelConfig();
  updateInteractionLock();
  try {
    state.project = await api('/api/project');
    state.ready = true;
    state.selectedChapterId = state.project.chapters[0]?.id || null;
    await refreshMetrics(false);
    render();
    setSaveState('Ready', 'ok');
  } catch (error) {
    state.ready = false;
    setSaveState('Load error', 'warn');
    $('#output').value = `Project failed to load.\n\n${error instanceof Error ? error.message : String(error)}\n\nCheck that the local server is running, then reload the page.`;
    showView('export');
    updateInteractionLock();
    console.error(error);
  }
}

function bindTabs() {
  $$('.tab').forEach((button) => {
    button.addEventListener('click', () => showView(button.dataset.view));
  });
}

function bindStaticControls() {
  window.addEventListener('beforeunload', warnBeforeLeavingWithUnsavedChanges);

  $('#save-project').addEventListener('click', () => guardAction(saveProject));
  $('#save-model').addEventListener('click', saveModelConfig);
  $('#refresh-metrics').addEventListener('click', () => guardAction(() => refreshMetrics(true)));
  $('#add-character').addEventListener('click', () => addItem('characters', blankCharacter()));
  $('#add-hook').addEventListener('click', () => addItem('hooks', blankHook()));
  $('#add-outline').addEventListener('click', () => addItem('outline', blankOutline()));
  $('#add-timeline').addEventListener('click', () => addItem('timeline', blankTimeline()));
  $('#add-resource').addEventListener('click', () => addItem('resources', blankResource()));
  $('#add-arc').addEventListener('click', () => addItem('arcs', blankArc()));
  $('#add-chapter').addEventListener('click', addChapter);
  $('#plan').addEventListener('click', () => guardAction(runPlan));
  $('#context').addEventListener('click', () => guardAction(runContext));
  $('#draft').addEventListener('click', () => guardAction(runDraft));
  $('#audit').addEventListener('click', () => guardAction(runAudit));
  $('#revise').addEventListener('click', () => guardAction(runRevise));
  $('#style').addEventListener('click', () => guardAction(runStyle));
  $('#settle').addEventListener('click', () => guardAction(runSettle));
  $('#brainstorm').addEventListener('click', () => guardAction(runBrainstorm));
  $('#snapshot').addEventListener('click', () => guardAction(snapshotProject));
  $('#export-md').addEventListener('click', () => guardAction(exportMarkdown));
  $('#reset-project').addEventListener('click', () => guardAction(resetProject));

  projectFields.forEach((field) => {
    const element = $(`#${field}`);
    bindValueListener(element, () => {
      if (!state.ready) return;
      state.project[field] = field === 'targetWords' ? Number(element.value) : element.value;
      scheduleSave();
      renderMetrics();
    });
  });

  ['chapterTitle', 'chapterPlan', 'chapterBody', 'chapterAudit', 'chapterSummary'].forEach((field) => {
    $(`#${field}`).addEventListener('input', updateSelectedChapterFromEditor);
  });
}

function showView(name) {
  $$('.tab').forEach((item) => item.classList.remove('active'));
  $$('.view').forEach((item) => item.classList.remove('active'));
  $(`.tab[data-view="${name}"]`)?.classList.add('active');
  $(`#${name}-view`)?.classList.add('active');
}

function render() {
  renderProjectFields();
  renderCharacters();
  renderHooks();
  renderOutline();
  renderTimeline();
  renderResources();
  renderArcs();
  renderChapters();
  renderEditor();
  renderMetrics();
  updateInteractionLock();
}

function renderProjectFields() {
  for (const field of projectFields) {
    const element = $(`#${field}`);
    if (!element) continue;
    element.value = state.project[field] ?? '';
  }
}

function renderMetrics() {
  const metrics = deriveLocalMetrics();
  $('#metrics').innerHTML = [
    metric('Chapters', metrics.chapters),
    metric('Length', metrics.totalLength),
    metric('Avg', metrics.averageLength),
    metric('Open Hooks', metrics.openHooks),
    metric('Settled', `${metrics.settledChapters}/${metrics.chapters}`),
    metric('Truth', `${metrics.timelineEvents}/${metrics.resources}/${metrics.arcs}`)
  ].join('');

  const chapter = selectedChapter();
  $('#chapter-metrics').innerHTML = [
    metric('Body', countLength(chapter?.body || '')),
    metric('Plan', chapter?.plan ? 'yes' : 'no'),
    metric('Audit', parseAuditScore(chapter?.audit || '') || 'none'),
    metric('Settled', chapter?.settledAt ? 'yes' : 'no')
  ].join('');
}

function renderCharacters() {
  $('#characters').innerHTML = state.project.characters.map((character) => `
    <div class="row-card" data-id="${escapeHtml(character.id)}" data-type="characters">
      <div class="row-top">
        <strong>${escapeHtml(character.name || 'Unnamed')}</strong>
        <button class="danger" data-remove="characters" data-id="${escapeHtml(character.id)}" type="button">Remove</button>
      </div>
      <div class="mini-grid">
        <label>Name<input data-field="name" value="${escapeAttr(character.name)}"></label>
        <label>Role<input data-field="role" value="${escapeAttr(character.role)}"></label>
        <label>Desire<input data-field="desire" value="${escapeAttr(character.desire)}"></label>
        <label>Conflict<input data-field="conflict" value="${escapeAttr(character.conflict)}"></label>
      </div>
      <label>Secret<input data-field="secret" value="${escapeAttr(character.secret)}"></label>
      <label>Last Seen<input data-field="lastSeen" value="${escapeAttr(character.lastSeen)}"></label>
      <label>Knowledge<textarea data-field="knowledge">${escapeHtml(character.knowledge || '')}</textarea></label>
    </div>
  `).join('');
  bindCollectionInputs('characters');
}

function renderHooks() {
  $('#hooks').innerHTML = state.project.hooks.map((hook) => `
    <div class="row-card" data-id="${escapeHtml(hook.id)}" data-type="hooks">
      <div class="row-top">
        <strong>${escapeHtml(hook.status || 'open')}</strong>
        <button class="danger" data-remove="hooks" data-id="${escapeHtml(hook.id)}" type="button">Remove</button>
      </div>
      <label>Text<input data-field="text" value="${escapeAttr(hook.text)}"></label>
      <div class="mini-grid">
        <label>Status
          <select data-field="status">
            ${['open', 'progressing', 'deferred', 'resolved'].map((value) => `<option value="${value}" ${hook.status === value ? 'selected' : ''}>${value}</option>`).join('')}
          </select>
        </label>
        <label>Planted In<input data-field="plantedIn" value="${escapeAttr(hook.plantedIn)}"></label>
        <label>Payoff By<input data-field="payoffBy" value="${escapeAttr(hook.payoffBy)}"></label>
        <label>Note<input data-field="note" value="${escapeAttr(hook.note)}"></label>
      </div>
    </div>
  `).join('');
  bindCollectionInputs('hooks');
}

function renderOutline() {
  $('#outline').innerHTML = state.project.outline.map((node, index) => `
    <div class="row-card" data-id="${escapeHtml(node.id)}" data-type="outline">
      <div class="row-top">
        <strong>${index + 1}. ${escapeHtml(node.title || 'Untitled beat')}</strong>
        <button class="danger" data-remove="outline" data-id="${escapeHtml(node.id)}" type="button">Remove</button>
      </div>
      <label>Title<input data-field="title" value="${escapeAttr(node.title)}"></label>
      <label>Summary<textarea data-field="summary">${escapeHtml(node.summary || '')}</textarea></label>
    </div>
  `).join('');
  bindCollectionInputs('outline');
}

function renderTimeline() {
  $('#timeline').innerHTML = state.project.timeline.map((event) => `
    <div class="row-card" data-id="${escapeHtml(event.id)}" data-type="timeline">
      <div class="row-top">
        <strong>${escapeHtml(event.chapter || 'Unplaced')}</strong>
        <button class="danger" data-remove="timeline" data-id="${escapeHtml(event.id)}" type="button">Remove</button>
      </div>
      <label>Chapter<input data-field="chapter" value="${escapeAttr(event.chapter)}"></label>
      <label>Event<textarea data-field="event">${escapeHtml(event.event || '')}</textarea></label>
      <label>Consequence<textarea data-field="consequence">${escapeHtml(event.consequence || '')}</textarea></label>
    </div>
  `).join('');
  bindCollectionInputs('timeline');
}

function renderResources() {
  $('#resources').innerHTML = state.project.resources.map((resource) => `
    <div class="row-card" data-id="${escapeHtml(resource.id)}" data-type="resources">
      <div class="row-top">
        <strong>${escapeHtml(resource.item || 'Resource')}</strong>
        <button class="danger" data-remove="resources" data-id="${escapeHtml(resource.id)}" type="button">Remove</button>
      </div>
      <div class="mini-grid">
        <label>Owner<input data-field="owner" value="${escapeAttr(resource.owner)}"></label>
        <label>Item<input data-field="item" value="${escapeAttr(resource.item)}"></label>
        <label>Quantity<input data-field="quantity" value="${escapeAttr(resource.quantity)}"></label>
        <label>Status<input data-field="status" value="${escapeAttr(resource.status)}"></label>
      </div>
      <label>Note<textarea data-field="note">${escapeHtml(resource.note || '')}</textarea></label>
    </div>
  `).join('');
  bindCollectionInputs('resources');
}

function renderArcs() {
  $('#arcs').innerHTML = state.project.arcs.map((arc) => `
    <div class="row-card" data-id="${escapeHtml(arc.id)}" data-type="arcs">
      <div class="row-top">
        <strong>${escapeHtml(arc.character || 'Character')}</strong>
        <button class="danger" data-remove="arcs" data-id="${escapeHtml(arc.id)}" type="button">Remove</button>
      </div>
      <label>Character<input data-field="character" value="${escapeAttr(arc.character)}"></label>
      <label>Start<textarea data-field="start">${escapeHtml(arc.start || '')}</textarea></label>
      <label>Current<textarea data-field="current">${escapeHtml(arc.current || '')}</textarea></label>
      <label>Target<textarea data-field="target">${escapeHtml(arc.target || '')}</textarea></label>
      <label>Pressure<textarea data-field="pressure">${escapeHtml(arc.pressure || '')}</textarea></label>
    </div>
  `).join('');
  bindCollectionInputs('arcs');
}

function renderChapters() {
  const chapters = state.project.chapters;
  $('#chapters').innerHTML = chapters.length ? chapters.map((chapter, index) => `
    <button class="chapter-item ${chapter.id === state.selectedChapterId ? 'active' : ''}" data-chapter="${escapeHtml(chapter.id)}" type="button">
      <span>${index + 1}. ${escapeHtml(chapter.title || 'Untitled')}</span>
      <small>${countLength(chapter.body)} chars ${chapter.settledAt ? '| settled' : ''}</small>
    </button>
  `).join('') : '<p class="status-warn">No chapters yet.</p>';

  $$('[data-chapter]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedChapterId = button.dataset.chapter;
      renderChapters();
      renderEditor();
      renderMetrics();
    });
  });
}

function renderEditor() {
  const chapter = selectedChapter();
  $('#chapterTitle').value = chapter?.title || '';
  $('#chapterPlan').value = chapter?.plan || '';
  $('#chapterBody').value = chapter?.body || '';
  $('#chapterAudit').value = chapter?.audit || '';
  $('#chapterSummary').value = chapter?.summary || '';
}

function bindCollectionInputs(type) {
  $$(`[data-type="${type}"] input, [data-type="${type}"] textarea, [data-type="${type}"] select`).forEach((input) => {
    bindValueListener(input, () => {
      const card = input.closest('[data-id]');
      const item = state.project[type].find((entry) => entry.id === card.dataset.id);
      if (!item) return;
      item[input.dataset.field] = input.value;
      if (type === 'timeline') {
        item.source = '';
        item.chapterId = '';
      }
      scheduleSave();
      renderMetrics();
    });
  });

  $$(`[data-remove="${type}"]`).forEach((button) => {
    button.addEventListener('click', () => {
      state.project[type] = state.project[type].filter((item) => item.id !== button.dataset.id);
      scheduleSave();
      render();
    });
  });
}

function bindValueListener(element, handler) {
  element.addEventListener(element.tagName === 'SELECT' ? 'change' : 'input', handler);
}

function addItem(type, item) {
  state.project[type].push(item);
  scheduleSave();
  render();
}

function addChapter() {
  const chapter = createChapter();
  scheduleSave();
  render();
  return chapter;
}

function createChapter() {
  const chapter = {
    id: createId(),
    title: `第${state.project.chapters.length + 1}章`,
    plan: '',
    body: '',
    audit: '',
    summary: '',
    status: 'draft',
    createdAt: new Date().toISOString(),
    settledAt: ''
  };
  state.project.chapters.push(chapter);
  state.selectedChapterId = chapter.id;
  return chapter;
}

function updateSelectedChapterFromEditor() {
  let chapter = selectedChapter();
  const createdFromEditor = !chapter;
  if (!chapter) {
    chapter = createChapter();
  }
  chapter.title = $('#chapterTitle').value || (createdFromEditor ? chapter.title : '');
  chapter.plan = $('#chapterPlan').value;
  chapter.body = $('#chapterBody').value;
  chapter.audit = $('#chapterAudit').value;
  chapter.summary = $('#chapterSummary').value;
  scheduleSave();
  renderChapters();
  renderMetrics();
}

async function runPlan() {
  const chapterId = ensureChapter().id;
  const output = await assist('plan', { instruction: state.project.currentFocus, chapterId });
  const chapter = selectedChapter();
  if (!chapter) throw new Error('Selected chapter disappeared after planning');
  chapter.plan = output;
  if (!chapter.title || /^第\d+章$/.test(chapter.title)) {
    const firstLine = output.split('\n').find((line) => line.includes('：') || line.includes(':'));
    chapter.title = firstLine?.replace(/^#+\s*/, '').slice(0, 42) || chapter.title;
  }
  markDirty();
  renderEditor();
  renderChapters();
  await saveProject();
}

async function runContext() {
  const chapterId = requireChapter('Create or select a chapter before building context.').id;
  $('#output').value = await assist('context', { chapterId });
  showView('export');
}

async function runDraft() {
  const chapterId = ensureChapter().id;
  const plan = selectedChapter()?.plan || '';
  const output = await assist('draft', { plan, chapterId });
  const chapter = selectedChapter();
  if (!chapter) throw new Error('Selected chapter disappeared after drafting');
  chapter.body = output;
  markDirty();
  renderEditor();
  renderChapters();
  renderMetrics();
  await saveProject();
}

async function runAudit() {
  const chapterId = requireChapter('Create or select a chapter before auditing.').id;
  const chapterBefore = selectedChapter();
  const output = await assist('audit', { text: chapterBefore?.body || '', plan: chapterBefore?.plan || '', chapterId });
  const chapter = selectedChapter();
  if (!chapter) throw new Error('Selected chapter disappeared after auditing');
  chapter.audit = output;
  markDirty();
  renderEditor();
  renderMetrics();
  await saveProject();
}

async function runRevise() {
  const chapterId = requireChapterBody('Write or draft chapter text before revising.').id;
  const chapterBefore = selectedChapter();
  const output = await assist('revise', { text: chapterBefore?.body || '', audit: chapterBefore?.audit || '', chapterId });
  const chapter = selectedChapter();
  if (!chapter) throw new Error('Selected chapter disappeared after revision');
  chapter.body = output;
  markDirty();
  renderEditor();
  renderChapters();
  renderMetrics();
  await saveProject();
}

async function runStyle() {
  const chapter = requireChapterBody('Write or draft chapter text before analyzing style.');
  const output = await assist('style', { text: chapter.body || '' });
  state.project.styleProfile = output;
  $('#styleProfile').value = output;
  $('#output').value = output;
  markDirty();
  showView('export');
  await saveProject();
}

async function runSettle() {
  requireChapterBody('Write or draft chapter text before settling.');
  collectProjectInputs();
  await flushSave();
  const chapter = selectedChapter();
  if (!chapter) throw new Error('No chapter selected to settle');
  setBusy(true, 'settle running');
  try {
    const result = await api('/api/settle', {
      method: 'POST',
      body: JSON.stringify({
        project: state.project,
        chapter,
        expectedVersionToken: state.project.versionToken,
        expectedUpdatedAt: state.project.updatedAt
      })
    });
    state.project = result.project;
    state.selectedChapterId = chapter.id;
    state.savedRevision = state.revision;
    $('#output').value = formatSettlement(result.settlement);
    await refreshMetrics(false);
    render();
    showView('export');
    setSaveState('Settled', 'ok');
  } finally {
    setBusy(false);
  }
}

async function runBrainstorm() {
  $('#output').value = await assist('brainstorm', {});
}

async function snapshotProject() {
  collectProjectInputs();
  const result = await api('/api/snapshot', {
    method: 'POST',
    body: JSON.stringify({ project: state.project })
  });
  $('#output').value = `Snapshot saved: data/snapshots/${result.filename}`;
  setNeutralActionState('Snapshot');
}

async function exportMarkdown() {
  collectProjectInputs();
  const result = await api('/api/export', {
    method: 'POST',
    body: JSON.stringify({ project: state.project })
  });
  $('#output').value = result.markdown;
  const blob = new Blob([result.markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = result.filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

async function resetProject() {
  if (!confirm('Reset the local project?')) return;
  cancelPendingSave();
  await waitForSave();
  state.project = await api('/api/reset', {
    method: 'POST',
    body: JSON.stringify({
      expectedVersionToken: state.project?.versionToken,
      expectedUpdatedAt: state.project?.updatedAt
    })
  });
  state.selectedChapterId = state.project.chapters[0]?.id || null;
  state.revision = 0;
  state.savedRevision = 0;
  await refreshMetrics(false);
  render();
  setSaveState('Reset', 'warn');
}

async function assist(task, payload) {
  collectProjectInputs();
  await flushSave();
  setBusy(true, `${task} running`);
  try {
    const response = await api('/api/assist', {
      method: 'POST',
      body: JSON.stringify({
        task,
        project: state.project,
        payload,
        modelConfig: getModelConfig()
      })
    });
    setSaveState('Ready', 'ok');
    return response.output;
  } catch (error) {
    setSaveState('Assist error', 'warn');
    $('#output').value = error.message;
    showView('export');
    throw error;
  } finally {
    setBusy(false);
  }
}

function collectProjectInputs() {
  for (const field of projectFields) {
    const element = $(`#${field}`);
    state.project[field] = field === 'targetWords' ? Number(element.value) : element.value;
  }
}

async function saveProject() {
  cancelPendingSave();
  const previous = state.saveInFlight || Promise.resolve();
  const queued = previous.catch(() => {}).then(async () => {
    collectProjectInputs();
    const saveRevision = state.revision;
    const snapshot = cloneProject(state.project);
    setSaveState('Saving', 'warn');
    const savedProject = await api('/api/project', {
      method: 'POST',
      body: JSON.stringify({
        project: snapshot,
        expectedVersionToken: snapshot.versionToken,
        expectedUpdatedAt: snapshot.updatedAt
      })
    });
    if (state.revision === saveRevision) {
      state.project = savedProject;
      state.savedRevision = saveRevision;
      if (!selectedChapter() && state.project.chapters[0]) {
        state.selectedChapterId = state.project.chapters[0].id;
      }
      renderProjectFields();
    } else if (savedProject.versionToken || savedProject.updatedAt) {
      state.project.versionToken = savedProject.versionToken || state.project.versionToken;
      state.project.updatedAt = savedProject.updatedAt;
    }
    state.metrics = deriveLocalMetrics();
    renderMetrics();
    const isSaved = state.revision === state.savedRevision;
    setSaveState(isSaved ? 'Saved' : 'Changed', isSaved ? 'ok' : 'warn');
    return state.project;
  });
  state.saveInFlight = queued;
  try {
    return await queued;
  } finally {
    if (state.saveInFlight === queued) state.saveInFlight = null;
  }
}

function scheduleSave() {
  markDirty();
  cancelPendingSave();
  state.saveTimer = setTimeout(() => {
    state.saveTimer = null;
    saveProject().catch((error) => showActionError(error, 'Save error'));
  }, 700);
}

function markDirty() {
  state.revision += 1;
  state.metrics = deriveLocalMetrics();
  setSaveState('Changed', 'warn');
}

async function refreshMetrics(showStatus) {
  if (showStatus) setSaveState('Metrics', 'warn');
  try {
    if (showStatus) {
      await flushSave();
      state.metrics = await api('/api/metrics');
    } else {
      state.metrics = deriveLocalMetrics();
    }
    renderMetrics();
    if (showStatus) setSaveState('Ready', 'ok');
  } catch (error) {
    state.metrics = deriveLocalMetrics();
    renderMetrics();
    if (showStatus) throw error;
  }
}

function selectedChapter() {
  return state.project.chapters.find((chapter) => chapter.id === state.selectedChapterId) || null;
}

function ensureChapter() {
  if (!selectedChapter()) addChapter();
  return selectedChapter();
}

function requireChapter(message) {
  const chapter = selectedChapter();
  if (!chapter) throw new Error(message);
  return chapter;
}

function requireChapterBody(message) {
  const chapter = requireChapter(message);
  if (!String(chapter.body || '').trim()) throw new Error(message);
  return chapter;
}

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
  } catch (error) {
    throw new Error(`Network error: ${error.message || 'request failed'}`);
  }
  const text = await response.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { error: text || `Request failed: ${response.status}` };
  }
  if (!response.ok) {
    const error = new Error(json.error || `Request failed: ${response.status}`);
    error.status = response.status;
    error.details = json;
    throw error;
  }
  return json;
}

function setBusy(value, label = '') {
  state.busy = value;
  updateInteractionLock();
  if (value) setSaveState(label, 'warn');
}

async function guardAction(action) {
  if (state.busy || state.actionLocked) return;
  if (!state.ready) {
    showActionError(new Error('Project is not loaded. Check the local server and reload the page.'));
    return;
  }
  state.actionLocked = true;
  updateInteractionLock();
  try {
    await action();
  } catch (error) {
    showActionError(error);
  } finally {
    state.actionLocked = false;
    updateInteractionLock();
  }
}

function updateInteractionLock() {
  const locked = state.busy || state.actionLocked;
  const projectUnavailable = !state.ready;
  document.body.classList.toggle('busy', locked);
  $$('button, input, textarea, select').forEach((element) => {
    element.disabled = locked || (projectUnavailable && !canUseBeforeProjectLoad(element));
  });
}

function canUseBeforeProjectLoad(element) {
  return element.classList.contains('tab')
    || element.id === 'save-model'
    || element.id === 'output'
    || modelFields.includes(element.id);
}

function showActionError(error, label = 'Error') {
  const conflict = error?.status === 409;
  setSaveState(conflict ? 'Conflict' : label, 'warn');
  $('#output').value = conflict
    ? `${error.message}\n\n当前浏览器里的项目版本已经落后。请先刷新页面或打开 Export 复制本地未保存内容，再决定如何合并。`
    : error instanceof Error ? error.message : String(error);
  showView('export');
  console.error(error);
}

async function flushSave() {
  const hadPendingTimer = Boolean(state.saveTimer);
  cancelPendingSave();
  await waitForSave();
  if (hadPendingTimer || state.revision !== state.savedRevision) {
    await saveProject();
  }
}

async function waitForSave() {
  if (state.saveInFlight) await state.saveInFlight;
}

function cancelPendingSave() {
  if (!state.saveTimer) return;
  clearTimeout(state.saveTimer);
  state.saveTimer = null;
}

function hasPendingProjectSave() {
  return state.ready && (Boolean(state.saveTimer) || Boolean(state.saveInFlight) || state.revision !== state.savedRevision);
}

function warnBeforeLeavingWithUnsavedChanges(event) {
  if (!hasPendingProjectSave()) return;
  event.preventDefault();
  event.returnValue = '';
}

function setSaveState(text, tone = 'ok') {
  const element = $('#save-state');
  element.textContent = text;
  element.className = tone === 'warn' ? 'status-warn' : 'status-ok';
}

function setNeutralActionState(text) {
  const dirty = state.ready && state.revision !== state.savedRevision;
  setSaveState(dirty ? `${text}; Changed` : text, dirty ? 'warn' : 'ok');
}

function saveModelConfig() {
  try {
    localStorage.setItem('novel-copilot-model', JSON.stringify(getModelConfig()));
    setNeutralActionState('Model saved');
  } catch (error) {
    setSaveState('Model save error', 'warn');
    $('#output').value = error instanceof Error ? error.message : String(error);
    showView('export');
  }
}

function loadModelConfig() {
  let config = {};
  try {
    const stored = JSON.parse(localStorage.getItem('novel-copilot-model') || '{}');
    if (isPlainObject(stored)) {
      config = stored;
    } else {
      clearStoredModelConfig();
    }
  } catch {
    clearStoredModelConfig();
  }
  for (const field of modelFields) {
    $(`#${field}`).value = modelConfigValue(config, field);
  }
}

function clearStoredModelConfig() {
  try {
    localStorage.removeItem('novel-copilot-model');
  } catch {
    // Browser storage can be unavailable; defaults still keep the app usable.
  }
}

function modelConfigValue(config, field) {
  const value = config[field];
  if (value === undefined || value === null || typeof value === 'object') return defaultModelValue(field);
  return String(value) || defaultModelValue(field);
}

function getModelConfig() {
  return Object.fromEntries(modelFields.map((field) => [field, $(`#${field}`).value.trim()]));
}

function defaultModelValue(field) {
  if (field === 'temperature') return '0.75';
  if (field === 'maxTokens') return '3500';
  return '';
}

function blankCharacter() {
  return { id: createId(), name: '', role: '', desire: '', conflict: '', secret: '', lastSeen: '', knowledge: '' };
}

function blankHook() {
  return { id: createId(), text: '', status: 'open', plantedIn: '', payoffBy: '', note: '' };
}

function blankOutline() {
  return { id: createId(), title: '', summary: '' };
}

function blankTimeline() {
  return { id: createId(), source: '', chapterId: '', chapter: '', event: '', consequence: '' };
}

function blankResource() {
  return { id: createId(), owner: '', item: '', quantity: '', status: '', note: '' };
}

function blankArc() {
  return { id: createId(), character: '', start: '', current: '', target: '', pressure: '' };
}

function deriveLocalMetrics() {
  const chapters = state.project?.chapters || [];
  const totalLength = chapters.reduce((sum, chapter) => sum + countLength(chapter.body), 0);
  const openHooks = (state.project?.hooks || []).filter((hook) => hook.status !== 'resolved').length;
  const settledChapters = chapters.filter((chapter) => chapter.settledAt).length;
  return {
    chapters: chapters.length,
    totalLength,
    averageLength: chapters.length ? Math.round(totalLength / chapters.length) : 0,
    targetWords: Number(state.project?.targetWords) || 0,
    openHooks,
    resolvedHooks: (state.project?.hooks || []).length - openHooks,
    characters: (state.project?.characters || []).length,
    timelineEvents: (state.project?.timeline || []).length,
    resources: (state.project?.resources || []).length,
    arcs: (state.project?.arcs || []).length,
    settledChapters,
    unsettledChapters: chapters.length - settledChapters
  };
}

function metric(label, value) {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value ?? 0)}</strong></div>`;
}

function parseAuditScore(audit) {
  const match = audit.match(/质量评分：(\d+)/);
  return match ? `${match[1]}/100` : '';
}

function formatSettlement(settlement) {
  return [
    '# Chapter Settlement',
    '',
    `Chapter: ${formatReportLine(settlement.title, '未命名章节')}`,
    `Summary: ${formatReportLine(settlement.summary, '未提取到摘要')}`,
    '',
    '## Timeline',
    `- ${formatReportLine(settlement.timelineEvent?.event, '未生成')}`,
    `  Consequence: ${formatReportLine(settlement.timelineEvent?.consequence, '未生成')}`,
    '',
    '## Character Updates',
    ...(settlement.characterUpdates?.length
      ? settlement.characterUpdates.map((item) => `- ${formatReportLine(item.name, '未命名')}: ${formatReportLine(item.knowledge, '未记录')}`)
      : ['- 未识别到人物变化']),
    '',
    '## Hook Updates',
    ...(settlement.hookUpdates?.length
      ? settlement.hookUpdates.map((item) => `- ${formatReportLine(item.text, '未命名伏笔')}: ${formatReportLine(item.from, '未知')} -> ${formatReportLine(item.to, '未知')}`)
      : ['- 未识别到伏笔推进']),
    '',
    '## Resource Updates',
    ...(settlement.resourceUpdates?.length
      ? settlement.resourceUpdates.map((item) => `- ${formatReportLine(item.item, '未命名资源')}: ${formatReportLine(item.note, '未记录')}`)
      : ['- 未识别到资源变化'])
  ].join('\n');
}

function formatReportLine(value, fallback = '') {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || fallback;
}

function createId() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function cloneProject(project) {
  return JSON.parse(JSON.stringify(project));
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function countLength(text = '') {
  const value = String(text || '');
  const cjk = (value.match(/[\u4e00-\u9fff]/g) || []).length;
  const latin = (value.replace(/[\u4e00-\u9fff]/g, ' ').match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g) || []).length;
  return cjk + latin;
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value = '') {
  return escapeHtml(value).replaceAll('\n', '&#10;');
}
