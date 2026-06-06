import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createDefaultProject } from '../lib.js';

const APP_ROOT = path.resolve(import.meta.dirname, '..');

test('typing into an empty chapter editor preserves the first edit on save', async () => {
  const dom = createDomHarness();
  const savedPayloads = [];
  let project = createDefaultProject();

  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.localStorage = createStorage();
  globalThis.fetch = async (requestPath, options = {}) => {
    if (requestPath === '/api/project' && options.method === 'POST') {
      const payload = JSON.parse(options.body);
      savedPayloads.push(payload);
      project = {
        ...payload.project,
        versionToken: 'saved-version-token',
        updatedAt: '2026-06-06T00:00:00.000Z'
      };
      return jsonResponse(project);
    }
    if (requestPath === '/api/project') return jsonResponse(project);
    throw new Error(`Unexpected fetch: ${requestPath}`);
  };

  const moduleUrl = pathToFileURL(path.join(APP_ROOT, 'public/app.js'));
  await import(`${moduleUrl.href}?frontend-test=${Date.now()}`);
  await waitFor(() => dom.byId('save-state').textContent === 'Ready');

  dom.byId('chapterBody').value = '第一句不能被创建章节时的重绘抹掉。';
  dom.byId('chapterBody').dispatchEvent({ type: 'input' });
  dom.byId('save-project').click();

  await waitFor(() => savedPayloads.length > 0);

  assert.equal(savedPayloads[0].project.chapters.length, 1);
  assert.equal(savedPayloads[0].project.chapters[0].body, '第一句不能被创建章节时的重绘抹掉。');
});

test('markdown export clicks a mounted link and revokes the object URL after cleanup', async () => {
  const clickedLinks = [];
  const dom = createDomHarness({
    onElementCreated(element) {
      if (element.tagName === 'A') {
        element.clickHook = () => {
          clickedLinks.push({
            href: element.href,
            download: element.download,
            isConnected: element.isConnected,
            display: element.style.display
          });
        };
      }
    }
  });
  const project = createDefaultProject();
  const revokedUrls = [];

  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.localStorage = createStorage();
  globalThis.URL = {
    createObjectURL(blob) {
      assert.equal(blob.type, 'text/markdown;charset=utf-8');
      return 'blob:pudding-export';
    },
    revokeObjectURL(url) {
      revokedUrls.push(url);
    }
  };
  globalThis.fetch = async (requestPath, options = {}) => {
    if (requestPath === '/api/project') return jsonResponse(project);
    if (requestPath === '/api/export' && options.method === 'POST') {
      const payload = JSON.parse(options.body);
      assert.equal(payload.project.title, project.title);
      return jsonResponse({
        filename: 'Pudding.md',
        markdown: '# Pudding\n\n正文'
      });
    }
    throw new Error(`Unexpected fetch: ${requestPath}`);
  };

  const moduleUrl = pathToFileURL(path.join(APP_ROOT, 'public/app.js'));
  await import(`${moduleUrl.href}?frontend-test=${Date.now()}`);
  await waitFor(() => dom.byId('save-state').textContent === 'Ready');

  dom.byId('export-md').click();

  await waitFor(() => clickedLinks.length === 1);
  assert.deepEqual(clickedLinks[0], {
    href: 'blob:pudding-export',
    download: 'Pudding.md',
    isConnected: true,
    display: 'none'
  });
  assert.equal(dom.document.body.children.length, 0);

  await waitFor(() => revokedUrls.includes('blob:pudding-export'));
});

test('settlement output keeps API-provided fields on one markdown line', async () => {
  const dom = createDomHarness();
  const project = {
    ...createDefaultProject(),
    chapters: [{
      id: 'chapter-with-settlement-output',
      title: '第1章',
      body: '林澈把未来日期的医院缴费单放在桌上。',
      plan: '',
      audit: '',
      summary: '',
      status: 'draft',
      createdAt: '',
      settledAt: ''
    }]
  };

  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.localStorage = createStorage();
  globalThis.fetch = async (requestPath, options = {}) => {
    if (requestPath === '/api/project') return jsonResponse(project);
    if (requestPath === '/api/settle' && options.method === 'POST') {
      return jsonResponse({
        project: {
          ...project,
          chapters: [{
            ...project.chapters[0],
            summary: '摘要',
            settledAt: '2026-06-07T00:00:00.000Z'
          }]
        },
        settlement: {
          title: '第1章\n## Fake Chapter',
          summary: '摘要\n- fake summary item',
          timelineEvent: {
            event: '事件\n## Fake Timeline',
            consequence: '后果\n- fake consequence'
          },
          characterUpdates: [{
            name: '林澈\n## Fake Character',
            knowledge: '知道缴费单\n- fake knowledge'
          }],
          hookUpdates: [{
            text: '缴费单\n## Fake Hook',
            from: 'open\n## Fake From',
            to: 'progressing\n## Fake To'
          }],
          resourceUpdates: [{
            item: '缴费单\n## Fake Resource',
            note: '在桌上\n- fake resource'
          }]
        }
      });
    }
    throw new Error(`Unexpected fetch: ${requestPath}`);
  };

  const moduleUrl = pathToFileURL(path.join(APP_ROOT, 'public/app.js'));
  await import(`${moduleUrl.href}?frontend-test=${Date.now()}`);
  await waitFor(() => dom.byId('save-state').textContent === 'Ready');

  dom.byId('settle').click();

  await waitFor(() => dom.byId('output').value.includes('Chapter Settlement'));
  assert.doesNotMatch(dom.byId('output').value, /^## Fake/m);
  assert.doesNotMatch(dom.byId('output').value, /^- fake/m);
  assert.match(dom.byId('output').value, /^Chapter: 第1章 ## Fake Chapter$/m);
  assert.match(dom.byId('output').value, /^- 林澈 ## Fake Character: 知道缴费单 - fake knowledge$/m);
});

test('flushSave retries dirty revisions after an in-flight autosave failure', async () => {
  const dom = createDomHarness();
  const originalConsoleError = console.error;
  let project = {
    ...createDefaultProject(),
    chapters: [{
      id: 'autosave-retry-chapter',
      title: '第1章',
      body: '旧正文。',
      plan: '',
      audit: '',
      summary: '',
      status: 'draft',
      createdAt: '',
      settledAt: ''
    }]
  };
  const savePayloads = [];
  const events = [];
  let releaseFirstSave;

  try {
    console.error = () => {};
    globalThis.document = dom.document;
    globalThis.window = dom.window;
    globalThis.localStorage = createStorage();
    globalThis.fetch = async (requestPath, options = {}) => {
      if (requestPath === '/api/project' && options.method === 'POST') {
        const payload = JSON.parse(options.body);
        savePayloads.push(payload);
        events.push(`save-${savePayloads.length}`);
        if (savePayloads.length === 1) {
          return await new Promise((resolve) => {
            releaseFirstSave = () => resolve(jsonResponse({ error: 'Autosave failed once' }, 500));
          });
        }
        project = {
          ...payload.project,
          versionToken: `saved-token-${savePayloads.length}`,
          updatedAt: `2026-06-07T00:00:0${savePayloads.length}.000Z`
        };
        return jsonResponse(project);
      }
      if (requestPath === '/api/assist' && options.method === 'POST') {
        const payload = JSON.parse(options.body);
        events.push('assist');
        assert.equal(payload.task, 'plan');
        assert.equal(payload.project.chapters[0].body, '自动保存失败后仍要保住这一版正文。');
        return jsonResponse({
          output: '# 第1章计划：重试保存后继续\n\n章节目标：确认保存重试后再生成。'
        });
      }
      if (requestPath === '/api/project') return jsonResponse(project);
      throw new Error(`Unexpected fetch: ${requestPath}`);
    };

    const moduleUrl = pathToFileURL(path.join(APP_ROOT, 'public/app.js'));
    await import(`${moduleUrl.href}?frontend-test=${Date.now()}`);
    await waitFor(() => dom.byId('save-state').textContent === 'Ready');

    dom.byId('chapterBody').value = '自动保存失败后仍要保住这一版正文。';
    dom.byId('chapterBody').dispatchEvent({ type: 'input' });
    await waitFor(() => savePayloads.length === 1 && releaseFirstSave, 2000);

    dom.byId('plan').click();
    releaseFirstSave();

    await waitFor(() => events.includes('assist') && savePayloads.length >= 3, 2000);
    assert.deepEqual(events, ['save-1', 'save-2', 'assist', 'save-3']);
    assert.equal(savePayloads[1].project.chapters[0].body, '自动保存失败后仍要保住这一版正文。');
    assert.match(savePayloads[2].project.chapters[0].plan, /重试保存后继续/);
    assert.equal(dom.byId('save-state').textContent, 'Saved');
  } finally {
    console.error = originalConsoleError;
  }
});

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    }
  };
}

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

function createDomHarness(options = {}) {
  const elements = new Map();
  const allElements = [];

  const register = (element) => {
    allElements.push(element);
    if (element.id) elements.set(element.id, element);
    return element;
  };

  const idsByTag = {
    INPUT: [
      'title',
      'genre',
      'protagonist',
      'targetWords',
      'baseUrl',
      'model',
      'apiKey',
      'temperature',
      'maxTokens',
      'chapterTitle',
      'chapterSummary'
    ],
    TEXTAREA: [
      'logline',
      'authorIntent',
      'currentFocus',
      'storyBible',
      'bookRules',
      'bannedPatterns',
      'notes',
      'styleProfile',
      'chapterPlan',
      'chapterBody',
      'chapterAudit',
      'output'
    ],
    SELECT: ['language'],
    BUTTON: [
      'save-project',
      'save-model',
      'refresh-metrics',
      'add-character',
      'add-hook',
      'add-outline',
      'add-timeline',
      'add-resource',
      'add-arc',
      'add-chapter',
      'plan',
      'context',
      'draft',
      'audit',
      'revise',
      'style',
      'settle',
      'brainstorm',
      'snapshot',
      'export-md',
      'reset-project'
    ],
    DIV: ['metrics', 'chapter-metrics', 'characters', 'hooks', 'outline', 'timeline', 'resources', 'arcs', 'chapters', 'save-state'],
    SECTION: ['brief-view', 'board-view', 'state-view', 'write-view', 'export-view']
  };

  for (const [tagName, ids] of Object.entries(idsByTag)) {
    for (const id of ids) register(new TestElement(tagName, { id }));
  }

  const tabs = ['brief', 'board', 'state', 'write', 'export'].map((view) => {
    const element = register(new TestElement('BUTTON', { classes: ['tab'], dataset: { view } }));
    return element;
  });
  for (const view of ['brief', 'board', 'state', 'write', 'export']) {
    elements.get(`${view}-view`).classList.add('view');
  }

  const body = register(new TestElement('BODY'));
  const document = {
    body,
    querySelector(selector) {
      if (selector.startsWith('#')) return elements.get(selector.slice(1)) || null;
      const tabMatch = selector.match(/^\.tab\[data-view="([^"]+)"\]$/);
      if (tabMatch) return tabs.find((tab) => tab.dataset.view === tabMatch[1]) || null;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '.tab') return tabs;
      if (selector === '.view') return allElements.filter((element) => element.classList.contains('view'));
      if (selector === 'button, input, textarea, select') {
        return allElements.filter((element) => ['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName));
      }
      if (selector.includes('[data-type=') || selector.includes('[data-remove=') || selector === '[data-chapter]') return [];
      return [];
    },
    createElement(tagName) {
      const element = new TestElement(tagName.toUpperCase());
      options.onElementCreated?.(element);
      return element;
    }
  };

  return {
    document,
    window: {
      addEventListener() {}
    },
    byId(id) {
      return elements.get(id);
    }
  };
}

class TestElement {
  constructor(tagName, { id = '', classes = [], dataset = {} } = {}) {
    this.tagName = tagName;
    this.id = id;
    this.dataset = { ...dataset };
    this.classList = new TestClassList(classes);
    this.listeners = new Map();
    this.value = '';
    this.textContent = '';
    this.innerHTML = '';
    this.className = '';
    this.disabled = false;
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.clickHook = null;
  }

  addEventListener(type, handler) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(handler);
    this.listeners.set(type, listeners);
  }

  dispatchEvent(event) {
    for (const handler of this.listeners.get(event.type) || []) handler(event);
    return true;
  }

  click() {
    this.clickHook?.(this);
    this.dispatchEvent({ type: 'click' });
  }

  appendChild(child) {
    if (child.parentNode) child.remove();
    this.children.push(child);
    child.parentNode = this;
    return child;
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }

  get isConnected() {
    return this.tagName === 'BODY' || Boolean(this.parentNode?.isConnected);
  }
}

class TestClassList {
  constructor(classes = []) {
    this.classes = new Set(classes);
  }

  add(...classes) {
    for (const className of classes) this.classes.add(className);
  }

  remove(...classes) {
    for (const className of classes) this.classes.delete(className);
  }

  toggle(className, force) {
    const shouldAdd = force === undefined ? !this.classes.has(className) : Boolean(force);
    if (shouldAdd) this.classes.add(className);
    else this.classes.delete(className);
    return shouldAdd;
  }

  contains(className) {
    return this.classes.has(className);
  }
}

async function waitFor(predicate, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail('Timed out waiting for frontend condition');
}
