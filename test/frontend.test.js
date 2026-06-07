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

test('typing into an empty non-title editor keeps the generated chapter title', async () => {
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
        versionToken: 'saved-generated-title-token',
        updatedAt: '2026-06-07T00:00:00.000Z'
      };
      return jsonResponse(project);
    }
    if (requestPath === '/api/project') return jsonResponse(project);
    throw new Error(`Unexpected fetch: ${requestPath}`);
  };

  const moduleUrl = pathToFileURL(path.join(APP_ROOT, 'public/app.js'));
  await import(`${moduleUrl.href}?frontend-test=${Date.now()}`);
  await waitFor(() => dom.byId('save-state').textContent === 'Ready');

  dom.byId('chapterBody').value = '先写正文触发隐式建章。';
  dom.byId('chapterBody').dispatchEvent({ type: 'input' });
  assert.equal(dom.byId('chapterTitle').value, '第1章');

  dom.byId('chapterPlan').value = '再补计划时不能擦掉默认标题。';
  dom.byId('chapterPlan').dispatchEvent({ type: 'input' });
  dom.byId('save-project').click();

  await waitFor(() => savedPayloads.length > 0);

  assert.equal(savedPayloads[0].project.chapters[0].title, '第1章');
  assert.equal(savedPayloads[0].project.chapters[0].body, '先写正文触发隐式建章。');
  assert.equal(savedPayloads[0].project.chapters[0].plan, '再补计划时不能擦掉默认标题。');
});

test('invalid target words are shown locally and not autosaved', async () => {
  const dom = createDomHarness();
  const originalConsoleError = console.error;
  const savedPayloads = [];
  let project = createDefaultProject();

  try {
    console.error = () => {};
    globalThis.document = dom.document;
    globalThis.window = dom.window;
    globalThis.localStorage = createStorage();
    globalThis.fetch = async (requestPath, options = {}) => {
      if (requestPath === '/api/project' && options.method === 'POST') {
        const payload = JSON.parse(options.body);
        savedPayloads.push(payload);
        project = {
          ...payload.project,
          versionToken: `target-saved-${savedPayloads.length}`,
          updatedAt: `2026-06-07T00:01:0${savedPayloads.length}.000Z`
        };
        return jsonResponse(project);
      }
      if (requestPath === '/api/project') return jsonResponse(project);
      throw new Error(`Unexpected fetch: ${requestPath}`);
    };

    const moduleUrl = pathToFileURL(path.join(APP_ROOT, 'public/app.js'));
    await import(`${moduleUrl.href}?frontend-test=${Date.now()}`);
    await waitFor(() => dom.byId('save-state').textContent === 'Ready');

    dom.byId('targetWords').value = '1200.5';
    dom.byId('targetWords').dispatchEvent({ type: 'input' });
    await new Promise((resolve) => setTimeout(resolve, 850));

    assert.equal(savedPayloads.length, 0);
    assert.equal(dom.byId('save-state').textContent, 'Target error');

    dom.byId('save-project').click();
    await waitFor(() => dom.byId('output').value.includes('Target words must be a whole number between 300 and 20000.'));

    assert.equal(savedPayloads.length, 0);

    dom.byId('title').value = 'Title While Target Invalid';
    dom.byId('title').dispatchEvent({ type: 'input' });
    await new Promise((resolve) => setTimeout(resolve, 850));

    assert.equal(savedPayloads.length, 0);
    assert.equal(dom.byId('save-state').textContent, 'Target error');

    dom.byId('targetWords').value = '20000';
    dom.byId('targetWords').dispatchEvent({ type: 'input' });

    await waitFor(() => savedPayloads.length === 1 && dom.byId('save-state').textContent === 'Saved', 2000);
    assert.equal(savedPayloads[0].project.targetWords, 20000);
    assert.equal(savedPayloads[0].project.title, 'Title While Target Invalid');
  } finally {
    console.error = originalConsoleError;
  }
});

test('numeric-formatted target words are rejected before autosave', async () => {
  const dom = createDomHarness();
  const originalConsoleError = console.error;
  const savedPayloads = [];
  let project = createDefaultProject();

  try {
    console.error = () => {};
    globalThis.document = dom.document;
    globalThis.window = dom.window;
    globalThis.localStorage = createStorage();
    globalThis.fetch = async (requestPath, options = {}) => {
      if (requestPath === '/api/project' && options.method === 'POST') {
        const payload = JSON.parse(options.body);
        savedPayloads.push(payload);
        project = {
          ...payload.project,
          versionToken: `formatted-target-token-${savedPayloads.length}`,
          updatedAt: `2026-06-07T00:02:0${savedPayloads.length}.000Z`
        };
        return jsonResponse(project);
      }
      if (requestPath === '/api/project') return jsonResponse(project);
      throw new Error(`Unexpected fetch: ${requestPath}`);
    };

    const moduleUrl = pathToFileURL(path.join(APP_ROOT, 'public/app.js'));
    await import(`${moduleUrl.href}?frontend-test=${Date.now()}`);
    await waitFor(() => dom.byId('save-state').textContent === 'Ready');

    for (const value of ['1200.0', '1e3', '0x500']) {
      dom.byId('targetWords').value = value;
      dom.byId('targetWords').dispatchEvent({ type: 'input' });
      await new Promise((resolve) => setTimeout(resolve, 850));

      assert.equal(savedPayloads.length, 0);
      assert.equal(dom.byId('save-state').textContent, 'Target error');
    }

    dom.byId('targetWords').value = '1200';
    dom.byId('targetWords').dispatchEvent({ type: 'input' });

    await waitFor(() => savedPayloads.length === 1 && dom.byId('save-state').textContent === 'Saved', 2000);
    assert.equal(savedPayloads[0].project.targetWords, 1200);
  } finally {
    console.error = originalConsoleError;
  }
});

test('metrics refresh renders server metrics instead of stale local counts', async () => {
  const dom = createDomHarness();
  const project = createDefaultProject();
  let metricsRequests = 0;

  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.localStorage = createStorage();
  globalThis.fetch = async (requestPath) => {
    if (requestPath === '/api/project') return jsonResponse(project);
    if (requestPath === '/api/metrics') {
      metricsRequests += 1;
      return jsonResponse({
        chapters: 4,
        totalLength: 12345,
        averageLength: 3086,
        openHooks: 7,
        settledChapters: 2,
        timelineEvents: 11,
        resources: 12,
        arcs: 13
      });
    }
    throw new Error(`Unexpected fetch: ${requestPath}`);
  };

  const moduleUrl = pathToFileURL(path.join(APP_ROOT, 'public/app.js'));
  await import(`${moduleUrl.href}?frontend-test=${Date.now()}`);
  await waitFor(() => dom.byId('save-state').textContent === 'Ready');

  assert.match(dom.byId('metrics').innerHTML, /<span>Chapters<\/span><strong>0<\/strong>/);

  dom.byId('refresh-metrics').click();

  await waitFor(() => dom.byId('metrics').innerHTML.includes('<span>Chapters</span><strong>4</strong>'));
  assert.equal(metricsRequests, 1);
  assert.match(dom.byId('metrics').innerHTML, /<span>Length<\/span><strong>12345<\/strong>/);
  assert.match(dom.byId('metrics').innerHTML, /<span>Settled<\/span><strong>2\/4<\/strong>/);
  assert.match(dom.byId('metrics').innerHTML, /<span>Truth<\/span><strong>11\/12\/13<\/strong>/);
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

test('markdown export cancels pending autosave so rescue output is not overwritten', async () => {
  const dom = createDomHarness();
  const originalConsoleError = console.error;
  const project = createDefaultProject();
  let saveAttempts = 0;

  try {
    console.error = () => {};
    globalThis.document = dom.document;
    globalThis.window = dom.window;
    globalThis.localStorage = createStorage();
    globalThis.URL = {
      createObjectURL() {
        return 'blob:pudding-rescue-export';
      },
      revokeObjectURL() {}
    };
    globalThis.fetch = async (requestPath, options = {}) => {
      if (requestPath === '/api/project' && options.method === 'POST') {
        saveAttempts += 1;
        return jsonResponse({ error: 'Delayed autosave should not run after export' }, 500);
      }
      if (requestPath === '/api/project') return jsonResponse(project);
      if (requestPath === '/api/export' && options.method === 'POST') {
        const payload = JSON.parse(options.body);
        assert.equal(payload.project.title, 'Rescue Export Title');
        return jsonResponse({
          filename: 'Rescue.md',
          markdown: '# Rescue Export\n\n未保存修改也应出现在导出里。'
        });
      }
      throw new Error(`Unexpected fetch: ${requestPath}`);
    };

    const moduleUrl = pathToFileURL(path.join(APP_ROOT, 'public/app.js'));
    await import(`${moduleUrl.href}?frontend-test=${Date.now()}`);
    await waitFor(() => dom.byId('save-state').textContent === 'Ready');

    dom.byId('title').value = 'Rescue Export Title';
    dom.byId('title').dispatchEvent({ type: 'input' });
    dom.byId('export-md').click();

    await waitFor(() => dom.byId('output').value.includes('Rescue Export'));
    await new Promise((resolve) => setTimeout(resolve, 850));

    assert.equal(saveAttempts, 0);
    assert.equal(dom.byId('output').value, '# Rescue Export\n\n未保存修改也应出现在导出里。');
    assert.equal(dom.byId('save-state').textContent, 'Changed');
  } finally {
    console.error = originalConsoleError;
  }
});

test('in-flight autosave failures do not overwrite rescue export output', async () => {
  const dom = createDomHarness();
  const originalConsoleError = console.error;
  const project = createDefaultProject();
  let saveAttempts = 0;
  let releaseAutosave;

  try {
    console.error = () => {};
    globalThis.document = dom.document;
    globalThis.window = dom.window;
    globalThis.localStorage = createStorage();
    globalThis.URL = {
      createObjectURL() {
        return 'blob:pudding-inflight-rescue-export';
      },
      revokeObjectURL() {}
    };
    globalThis.fetch = async (requestPath, options = {}) => {
      if (requestPath === '/api/project' && options.method === 'POST') {
        saveAttempts += 1;
        return await new Promise((resolve) => {
          releaseAutosave = () => resolve(jsonResponse({ error: 'In-flight autosave failed after export' }, 500));
        });
      }
      if (requestPath === '/api/project') return jsonResponse(project);
      if (requestPath === '/api/export' && options.method === 'POST') {
        const payload = JSON.parse(options.body);
        assert.equal(payload.project.title, 'In Flight Rescue Title');
        return jsonResponse({
          filename: 'In-Flight-Rescue.md',
          markdown: '# In Flight Rescue\n\n导出结果不应被旧自动保存错误覆盖。'
        });
      }
      throw new Error(`Unexpected fetch: ${requestPath}`);
    };

    const moduleUrl = pathToFileURL(path.join(APP_ROOT, 'public/app.js'));
    await import(`${moduleUrl.href}?frontend-test=${Date.now()}`);
    await waitFor(() => dom.byId('save-state').textContent === 'Ready');

    dom.byId('title').value = 'In Flight Rescue Title';
    dom.byId('title').dispatchEvent({ type: 'input' });
    await waitFor(() => saveAttempts === 1 && releaseAutosave, 2000);

    dom.byId('export-md').click();
    await waitFor(() => dom.byId('output').value.includes('In Flight Rescue'));
    releaseAutosave();
    await waitFor(() => dom.byId('save-state').textContent === 'Save error');

    assert.equal(saveAttempts, 1);
    assert.equal(dom.byId('output').value, '# In Flight Rescue\n\n导出结果不应被旧自动保存错误覆盖。');
  } finally {
    console.error = originalConsoleError;
  }
});

test('snapshot cancels pending autosave so rescue status is not overwritten', async () => {
  const dom = createDomHarness();
  const originalConsoleError = console.error;
  const project = createDefaultProject();
  let saveAttempts = 0;

  try {
    console.error = () => {};
    globalThis.document = dom.document;
    globalThis.window = dom.window;
    globalThis.localStorage = createStorage();
    globalThis.fetch = async (requestPath, options = {}) => {
      if (requestPath === '/api/project' && options.method === 'POST') {
        saveAttempts += 1;
        return jsonResponse({ error: 'Delayed autosave should not run after snapshot' }, 500);
      }
      if (requestPath === '/api/project') return jsonResponse(project);
      if (requestPath === '/api/snapshot' && options.method === 'POST') {
        const payload = JSON.parse(options.body);
        assert.equal(payload.project.title, 'Rescue Snapshot Title');
        return jsonResponse({ filename: 'project-rescue.json' });
      }
      throw new Error(`Unexpected fetch: ${requestPath}`);
    };

    const moduleUrl = pathToFileURL(path.join(APP_ROOT, 'public/app.js'));
    await import(`${moduleUrl.href}?frontend-test=${Date.now()}`);
    await waitFor(() => dom.byId('save-state').textContent === 'Ready');

    dom.byId('title').value = 'Rescue Snapshot Title';
    dom.byId('title').dispatchEvent({ type: 'input' });
    dom.byId('snapshot').click();

    await waitFor(() => dom.byId('output').value.includes('project-rescue.json'));
    await new Promise((resolve) => setTimeout(resolve, 850));

    assert.equal(saveAttempts, 0);
    assert.equal(dom.byId('output').value, 'Snapshot saved: data/snapshots/project-rescue.json');
    assert.equal(dom.byId('save-state').textContent, 'Snapshot; Changed');
  } finally {
    console.error = originalConsoleError;
  }
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

test('settlement output falls back for malformed API-provided fields', async () => {
  const dom = createDomHarness();
  const project = {
    ...createDefaultProject(),
    chapters: [{
      id: 'chapter-with-malformed-settlement-output',
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
          title: { text: 'fake title' },
          summary: ['fake summary'],
          timelineEvent: {
            event: { text: 'fake event' },
            consequence: ['fake consequence']
          },
          characterUpdates: [{ name: ['fake character'], knowledge: { text: 'fake knowledge' } }],
          hookUpdates: { text: 'not an array' },
          resourceUpdates: [{ item: false, note: { text: 'fake resource' } }]
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
  assert.match(dom.byId('output').value, /^Chapter: 未命名章节$/m);
  assert.match(dom.byId('output').value, /^Summary: 未提取到摘要$/m);
  assert.match(dom.byId('output').value, /^- 未生成$/m);
  assert.match(dom.byId('output').value, /^- 未命名: 未记录$/m);
  assert.match(dom.byId('output').value, /^- 未识别到伏笔推进$/m);
  assert.match(dom.byId('output').value, /^- 未命名资源: 未记录$/m);
  assert.doesNotMatch(dom.byId('output').value, /\[object Object\]|fake title|fake summary|fake event|fake character|fake resource/);
});

test('settlement keeps the editor on the returned chapter when ids change', async () => {
  const dom = createDomHarness();
  const project = {
    ...createDefaultProject(),
    chapters: [{
      id: 'client-settle-id',
      title: '第1章 临时编号',
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
            id: 'server-returned-id',
            title: '第1章 服务端编号',
            summary: '服务端沉淀摘要',
            settledAt: '2026-06-07T00:00:00.000Z'
          }]
        },
        settlement: {
          title: '第1章 服务端编号',
          summary: '服务端沉淀摘要',
          timelineEvent: {
            event: '林澈确认缴费单异常。',
            consequence: '需要继续核对来源。'
          },
          characterUpdates: [],
          hookUpdates: [],
          resourceUpdates: []
        }
      });
    }
    throw new Error(`Unexpected fetch: ${requestPath}`);
  };

  const moduleUrl = pathToFileURL(path.join(APP_ROOT, 'public/app.js'));
  await import(`${moduleUrl.href}?frontend-test=${Date.now()}`);
  await waitFor(() => dom.byId('save-state').textContent === 'Ready');

  dom.byId('settle').click();

  await waitFor(() => dom.byId('save-state').textContent === 'Settled');
  assert.equal(dom.byId('chapterTitle').value, '第1章 服务端编号');
  assert.equal(dom.byId('chapterBody').value, project.chapters[0].body);
  assert.equal(dom.byId('chapterSummary').value, '服务端沉淀摘要');
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

test('reset discards dirty revisions after an in-flight autosave failure', async () => {
  const dom = createDomHarness();
  const originalConsoleError = console.error;
  const originalConfirm = globalThis.confirm;
  let project = {
    ...createDefaultProject(),
    title: 'Reset Source',
    versionToken: 'reset-base-token',
    updatedAt: '2026-06-07T00:00:00.000Z'
  };
  const savePayloads = [];
  const resetPayloads = [];
  const events = [];
  let releaseFirstSave;

  try {
    console.error = () => {};
    globalThis.confirm = () => true;
    globalThis.document = dom.document;
    globalThis.window = dom.window;
    globalThis.localStorage = createStorage();
    globalThis.fetch = async (requestPath, options = {}) => {
      if (requestPath === '/api/project' && options.method === 'POST') {
        const payload = JSON.parse(options.body);
        savePayloads.push(payload);
        events.push('save');
        return await new Promise((resolve) => {
          releaseFirstSave = () => resolve(jsonResponse({ error: 'Autosave failed before reset' }, 500));
        });
      }
      if (requestPath === '/api/reset' && options.method === 'POST') {
        const payload = JSON.parse(options.body);
        resetPayloads.push(payload);
        events.push('reset');
        assert.equal(payload.expectedVersionToken, 'reset-base-token');
        assert.equal(payload.expectedUpdatedAt, '2026-06-07T00:00:00.000Z');
        project = {
          ...createDefaultProject(),
          title: 'Untitled Novel',
          chapters: [],
          versionToken: 'reset-new-token',
          updatedAt: '2026-06-07T00:00:01.000Z'
        };
        return jsonResponse(project);
      }
      if (requestPath === '/api/project') return jsonResponse(project);
      throw new Error(`Unexpected fetch: ${requestPath}`);
    };

    const moduleUrl = pathToFileURL(path.join(APP_ROOT, 'public/app.js'));
    await import(`${moduleUrl.href}?frontend-test=${Date.now()}`);
    await waitFor(() => dom.byId('save-state').textContent === 'Ready');

    dom.byId('title').value = 'Dirty Title Before Reset';
    dom.byId('title').dispatchEvent({ type: 'input' });
    await waitFor(() => savePayloads.length === 1 && releaseFirstSave, 2000);

    dom.byId('reset-project').click();
    releaseFirstSave();

    await waitFor(() => resetPayloads.length === 1 && dom.byId('save-state').textContent === 'Reset', 2000);
    assert.deepEqual(events, ['save', 'reset']);
    assert.equal(savePayloads[0].project.title, 'Dirty Title Before Reset');
    assert.equal(dom.byId('title').value, 'Untitled Novel');
  } finally {
    console.error = originalConsoleError;
    if (originalConfirm) globalThis.confirm = originalConfirm;
    else delete globalThis.confirm;
  }
});

test('add actions cannot mutate the project while a guarded action is running', async () => {
  const dom = createDomHarness();
  let project = {
    ...createDefaultProject(),
    chapters: [{
      id: 'guarded-action-chapter',
      title: '第1章',
      body: '',
      plan: '',
      audit: '',
      summary: '',
      status: 'draft',
      createdAt: '',
      settledAt: ''
    }]
  };
  const originalCharacterCount = project.characters.length;
  const savePayloads = [];
  let releaseAssist;

  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.localStorage = createStorage();
  globalThis.fetch = async (requestPath, options = {}) => {
    if (requestPath === '/api/project' && options.method === 'POST') {
      const payload = JSON.parse(options.body);
      savePayloads.push(payload);
      project = {
        ...payload.project,
        versionToken: `guarded-token-${savePayloads.length}`,
        updatedAt: `2026-06-07T00:00:1${savePayloads.length}.000Z`
      };
      return jsonResponse(project);
    }
    if (requestPath === '/api/assist' && options.method === 'POST') {
      const payload = JSON.parse(options.body);
      assert.equal(payload.task, 'plan');
      assert.equal(payload.project.chapters.length, 1);
      return await new Promise((resolve) => {
        releaseAssist = () => resolve(jsonResponse({ output: '# 第1章计划：锁内生成\n\n章节目标：验证按钮写入不会插队。' }));
      });
    }
    if (requestPath === '/api/project') return jsonResponse(project);
    throw new Error(`Unexpected fetch: ${requestPath}`);
  };

  const moduleUrl = pathToFileURL(path.join(APP_ROOT, 'public/app.js'));
  await import(`${moduleUrl.href}?frontend-test=${Date.now()}`);
  await waitFor(() => dom.byId('save-state').textContent === 'Ready');

  dom.byId('plan').click();
  await waitFor(() => Boolean(releaseAssist));
  assert.equal(dom.byId('add-character').disabled, true);
  assert.equal(dom.byId('add-chapter').disabled, true);

  dom.byId('add-character').click();
  dom.byId('add-chapter').click();
  releaseAssist();

  await waitFor(() => savePayloads.length === 1 && dom.byId('save-state').textContent === 'Saved');
  assert.equal(savePayloads[0].project.characters.length, originalCharacterCount);
  assert.equal(savePayloads[0].project.chapters.length, 1);
  assert.equal(savePayloads[0].project.chapters[0].id, 'guarded-action-chapter');
  assert.match(savePayloads[0].project.chapters[0].plan, /锁内生成/);
  assert.equal(dom.byId('save-state').textContent, 'Saved');
});

test('chapter switches cannot retarget generated output while a guarded action is running', async () => {
  const dom = createDomHarness();
  let project = {
    ...createDefaultProject(),
    chapters: [
      {
        id: 'locked-first-chapter',
        title: '第1章',
        body: '',
        plan: '',
        audit: '',
        summary: '',
        status: 'draft',
        createdAt: '',
        settledAt: ''
      },
      {
        id: 'locked-second-chapter',
        title: '第2章',
        body: '',
        plan: '',
        audit: '',
        summary: '',
        status: 'draft',
        createdAt: '',
        settledAt: ''
      }
    ]
  };
  const savePayloads = [];
  let releaseAssist;

  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.localStorage = createStorage();
  globalThis.fetch = async (requestPath, options = {}) => {
    if (requestPath === '/api/project' && options.method === 'POST') {
      const payload = JSON.parse(options.body);
      savePayloads.push(payload);
      project = {
        ...payload.project,
        versionToken: `chapter-lock-token-${savePayloads.length}`,
        updatedAt: `2026-06-07T00:00:2${savePayloads.length}.000Z`
      };
      return jsonResponse(project);
    }
    if (requestPath === '/api/assist' && options.method === 'POST') {
      const payload = JSON.parse(options.body);
      assert.equal(payload.task, 'plan');
      assert.equal(payload.payload.chapterId, 'locked-first-chapter');
      return await new Promise((resolve) => {
        releaseAssist = () => resolve(jsonResponse({ output: '# 第1章计划：锁定章节\n\n章节目标：确认生成结果不会落到第2章。' }));
      });
    }
    if (requestPath === '/api/project') return jsonResponse(project);
    throw new Error(`Unexpected fetch: ${requestPath}`);
  };

  const moduleUrl = pathToFileURL(path.join(APP_ROOT, 'public/app.js'));
  await import(`${moduleUrl.href}?frontend-test=${Date.now()}`);
  await waitFor(() => dom.byId('save-state').textContent === 'Ready');
  await waitFor(() => dom.chapterButtons().length === 2);

  dom.byId('plan').click();
  await waitFor(() => Boolean(releaseAssist));
  assert.equal(dom.chapterButtons()[1].disabled, true);

  dom.chapterButtons()[1].click();
  releaseAssist();

  await waitFor(() => savePayloads.length === 1 && dom.byId('save-state').textContent === 'Saved');
  assert.match(savePayloads[0].project.chapters[0].plan, /锁定章节/);
  assert.equal(savePayloads[0].project.chapters[1].plan, '');
  assert.equal(dom.byId('chapterTitle').value, '第1章计划：锁定章节');
});

test('locked form edits and removes cannot pollute generated saves', async () => {
  const dom = createDomHarness();
  let project = {
    ...createDefaultProject(),
    title: 'Original Locked Title',
    chapters: [{
      id: 'locked-form-chapter',
      title: '第1章',
      body: '原始正文不能被锁内输入覆盖。',
      plan: '',
      audit: '',
      summary: '',
      status: 'draft',
      createdAt: '',
      settledAt: ''
    }]
  };
  const originalCharacterCount = project.characters.length;
  const savePayloads = [];
  let releaseAssist;

  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.localStorage = createStorage();
  globalThis.fetch = async (requestPath, options = {}) => {
    if (requestPath === '/api/project' && options.method === 'POST') {
      const payload = JSON.parse(options.body);
      savePayloads.push(payload);
      project = {
        ...payload.project,
        versionToken: `locked-form-token-${savePayloads.length}`,
        updatedAt: `2026-06-07T00:00:3${savePayloads.length}.000Z`
      };
      return jsonResponse(project);
    }
    if (requestPath === '/api/assist' && options.method === 'POST') {
      const payload = JSON.parse(options.body);
      assert.equal(payload.task, 'plan');
      assert.equal(payload.project.title, 'Original Locked Title');
      assert.equal(payload.project.chapters[0].body, '原始正文不能被锁内输入覆盖。');
      return await new Promise((resolve) => {
        releaseAssist = () => resolve(jsonResponse({ output: '# 第1章计划：锁内表单\n\n章节目标：确认锁内输入不会污染保存。' }));
      });
    }
    if (requestPath === '/api/project') return jsonResponse(project);
    throw new Error(`Unexpected fetch: ${requestPath}`);
  };

  const moduleUrl = pathToFileURL(path.join(APP_ROOT, 'public/app.js'));
  await import(`${moduleUrl.href}?frontend-test=${Date.now()}`);
  await waitFor(() => dom.byId('save-state').textContent === 'Ready');
  await waitFor(() => dom.removeButtons('characters').length === originalCharacterCount);
  await waitFor(() => dom.collectionInputs('characters', 'name').length === originalCharacterCount);

  dom.byId('plan').click();
  await waitFor(() => Boolean(releaseAssist));
  assert.equal(dom.byId('title').disabled, true);
  assert.equal(dom.byId('chapterBody').disabled, true);
  assert.equal(dom.removeButtons('characters')[0].disabled, true);
  assert.equal(dom.collectionInputs('characters', 'name')[0].disabled, true);

  dom.byId('title').value = 'Injected Locked Title';
  dom.byId('title').dispatchEvent({ type: 'input' });
  dom.byId('chapterBody').value = '锁内脚本输入不应进入保存。';
  dom.byId('chapterBody').dispatchEvent({ type: 'input' });
  dom.collectionInputs('characters', 'name')[0].value = '锁内脚本人物名';
  dom.collectionInputs('characters', 'name')[0].dispatchEvent({ type: 'input' });
  dom.removeButtons('characters')[0].click();
  releaseAssist();

  await waitFor(() => savePayloads.length === 1 && dom.byId('save-state').textContent === 'Saved');
  assert.equal(savePayloads[0].project.title, 'Original Locked Title');
  assert.equal(savePayloads[0].project.chapters[0].body, '原始正文不能被锁内输入覆盖。');
  assert.equal(savePayloads[0].project.characters[0].name, '林澈');
  assert.equal(savePayloads[0].project.characters.length, originalCharacterCount);
  assert.match(savePayloads[0].project.chapters[0].plan, /锁内表单/);
});

test('collection field edits are saved with current form values', async () => {
  const dom = createDomHarness();
  const savedPayloads = [];
  let project = {
    ...createDefaultProject(),
    timeline: [{
      id: 'timeline-with-source-links',
      source: 'settlement',
      chapterId: 'chapter-1',
      chapter: '第1章',
      event: '旧事件',
      consequence: '旧后果'
    }]
  };

  globalThis.document = dom.document;
  globalThis.window = dom.window;
  globalThis.localStorage = createStorage();
  globalThis.fetch = async (requestPath, options = {}) => {
    if (requestPath === '/api/project' && options.method === 'POST') {
      const payload = JSON.parse(options.body);
      savedPayloads.push(payload);
      project = {
        ...payload.project,
        versionToken: `collection-save-token-${savedPayloads.length}`,
        updatedAt: `2026-06-07T00:00:4${savedPayloads.length}.000Z`
      };
      return jsonResponse(project);
    }
    if (requestPath === '/api/project') return jsonResponse(project);
    throw new Error(`Unexpected fetch: ${requestPath}`);
  };

  const moduleUrl = pathToFileURL(path.join(APP_ROOT, 'public/app.js'));
  await import(`${moduleUrl.href}?frontend-test=${Date.now()}`);
  await waitFor(() => dom.byId('save-state').textContent === 'Ready');
  await waitFor(() => dom.collectionInputs('characters', 'name').length === 2);

  dom.collectionInputs('characters', 'name')[0].value = '林澈（已校准）';
  dom.collectionInputs('characters', 'name')[0].dispatchEvent({ type: 'input' });
  dom.collectionInputs('characters', 'knowledge')[0].value = '知道缴费单来自未来病历系统。';
  dom.collectionInputs('characters', 'knowledge')[0].dispatchEvent({ type: 'input' });
  dom.collectionInputs('hooks', 'status')[0].value = 'resolved';
  dom.collectionInputs('hooks', 'status')[0].dispatchEvent({ type: 'change' });
  dom.collectionInputs('timeline', 'event')[0].value = '林澈核验缴费单编号。';
  dom.collectionInputs('timeline', 'event')[0].dispatchEvent({ type: 'input' });
  dom.byId('save-project').click();

  await waitFor(() => savedPayloads.length === 1 && dom.byId('save-state').textContent === 'Saved');

  assert.equal(savedPayloads[0].project.characters[0].name, '林澈（已校准）');
  assert.equal(savedPayloads[0].project.characters[0].knowledge, '知道缴费单来自未来病历系统。');
  assert.equal(savedPayloads[0].project.hooks[0].status, 'resolved');
  assert.equal(savedPayloads[0].project.timeline[0].event, '林澈核验缴费单编号。');
  assert.equal(savedPayloads[0].project.timeline[0].source, '');
  assert.equal(savedPayloads[0].project.timeline[0].chapterId, '');
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
  let chapterButtons = [];
  const removeButtonsByContainer = new Map();
  const collectionControlsByContainer = new Map();

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
  const collectionContainerIds = ['characters', 'hooks', 'outline', 'timeline', 'resources', 'arcs'];

  for (const [tagName, ids] of Object.entries(idsByTag)) {
    for (const id of ids) {
      const element = register(new TestElement(tagName, {
        id,
        onInnerHTMLSet: id === 'chapters'
          ? (html) => {
            chapterButtons = parseChapterButtons(html);
          }
          : collectionContainerIds.includes(id)
            ? (html) => {
              removeButtonsByContainer.set(id, parseRemoveButtons(html));
              collectionControlsByContainer.set(id, parseCollectionControls(html));
            }
          : null
      }));
      elements.set(id, element);
    }
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
        return [
          ...allElements.filter((element) => ['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)),
          ...chapterButtons,
          ...dynamicRemoveButtons(),
          ...dynamicCollectionControls()
        ];
      }
      if (selector === '[data-chapter]') return chapterButtons;
      const removeMatch = selector.match(/^\[data-remove="([^"]+)"\]$/);
      if (removeMatch) return dynamicRemoveButtons().filter((button) => button.dataset.remove === removeMatch[1]);
      const collectionMatch = selector.match(/^\[data-type="([^"]+)"\] input, \[data-type="([^"]+)"\] textarea, \[data-type="([^"]+)"\] select$/);
      if (collectionMatch && collectionMatch[1] === collectionMatch[2] && collectionMatch[1] === collectionMatch[3]) {
        return dynamicCollectionControls(collectionMatch[1]);
      }
      if (selector.includes('[data-type=') || selector.includes('[data-remove=')) return [];
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
    },
    chapterButtons() {
      return chapterButtons;
    },
    removeButtons(type) {
      return dynamicRemoveButtons().filter((button) => button.dataset.remove === type);
    },
    collectionInputs(type, field) {
      return dynamicCollectionControls(type).filter((control) => control.dataset.field === field);
    }
  };

  function dynamicRemoveButtons() {
    return [...removeButtonsByContainer.values()].flat();
  }

  function dynamicCollectionControls(type = '') {
    const controls = [...collectionControlsByContainer.values()].flat();
    return type ? controls.filter((control) => control.closest('[data-id]')?.dataset.type === type) : controls;
  }
}

class TestElement {
  constructor(tagName, { id = '', classes = [], dataset = {}, onInnerHTMLSet = null } = {}) {
    this.tagName = tagName;
    this.id = id;
    this.dataset = { ...dataset };
    this.classList = new TestClassList(classes);
    this.listeners = new Map();
    this.value = '';
    this.textContent = '';
    this._innerHTML = '';
    this.onInnerHTMLSet = onInnerHTMLSet;
    this.className = '';
    this.disabled = false;
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.clickHook = null;
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    this._innerHTML = String(value);
    this.onInnerHTMLSet?.(this._innerHTML);
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

  closest(selector) {
    if (selector !== '[data-id]') return null;
    let node = this;
    while (node) {
      if (node.dataset?.id) return node;
      node = node.parentNode;
    }
    return null;
  }

  get isConnected() {
    return this.tagName === 'BODY' || Boolean(this.parentNode?.isConnected);
  }
}

function parseChapterButtons(html) {
  const buttons = [];
  const regex = /<button\b[^>]*data-chapter="([^"]*)"[^>]*>/g;
  let match;
  while ((match = regex.exec(html))) {
    buttons.push(new TestElement('BUTTON', {
      classes: ['chapter-item'],
      dataset: { chapter: decodeHtmlAttribute(match[1]) }
    }));
  }
  return buttons;
}

function parseRemoveButtons(html) {
  const buttons = [];
  const regex = /<button\b([^>]*)>/g;
  let match;
  while ((match = regex.exec(html))) {
    const remove = getHtmlAttribute(match[1], 'data-remove');
    const id = getHtmlAttribute(match[1], 'data-id');
    if (!remove || !id) continue;
    buttons.push(new TestElement('BUTTON', {
      dataset: {
        remove: decodeHtmlAttribute(remove),
        id: decodeHtmlAttribute(id)
      }
    }));
  }
  return buttons;
}

function parseCollectionControls(html) {
  const controls = [];
  const cardRegex = /<div class="row-card"([^>]*)>([\s\S]*?)(?=\n\s*<div class="row-card"|\s*$)/g;
  let cardMatch;
  while ((cardMatch = cardRegex.exec(html))) {
    const id = getHtmlAttribute(cardMatch[1], 'data-id');
    const type = getHtmlAttribute(cardMatch[1], 'data-type');
    if (!id || !type) continue;
    const card = new TestElement('DIV', {
      dataset: {
        id: decodeHtmlAttribute(id),
        type: decodeHtmlAttribute(type)
      }
    });
    for (const control of parseInputControls(cardMatch[2], card)) {
      controls.push(control);
    }
  }
  return controls;
}

function parseInputControls(html, card) {
  return [
    ...parseStandaloneControls(html, 'INPUT', /<input\b([^>]*)>/g, card),
    ...parseTextareas(html, card),
    ...parseSelects(html, card)
  ];
}

function parseStandaloneControls(html, tagName, regex, card) {
  const controls = [];
  let match;
  while ((match = regex.exec(html))) {
    const field = getHtmlAttribute(match[1], 'data-field');
    if (!field) continue;
    controls.push(createCollectionControl(tagName, card, field, decodeHtmlAttribute(getHtmlAttribute(match[1], 'value'))));
  }
  return controls;
}

function parseTextareas(html, card) {
  const controls = [];
  const regex = /<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/g;
  let match;
  while ((match = regex.exec(html))) {
    const field = getHtmlAttribute(match[1], 'data-field');
    if (!field) continue;
    controls.push(createCollectionControl('TEXTAREA', card, field, decodeHtmlAttribute(match[2])));
  }
  return controls;
}

function parseSelects(html, card) {
  const controls = [];
  const regex = /<select\b([^>]*)>([\s\S]*?)<\/select>/g;
  let match;
  while ((match = regex.exec(html))) {
    const field = getHtmlAttribute(match[1], 'data-field');
    if (!field) continue;
    controls.push(createCollectionControl('SELECT', card, field, selectedOptionValue(match[2])));
  }
  return controls;
}

function createCollectionControl(tagName, card, field, value) {
  const control = new TestElement(tagName, {
    dataset: {
      field: decodeHtmlAttribute(field)
    }
  });
  control.value = value;
  card.appendChild(control);
  return control;
}

function selectedOptionValue(html) {
  const options = [];
  const regex = /<option\b([^>]*)>/g;
  let match;
  while ((match = regex.exec(html))) {
    options.push({
      value: decodeHtmlAttribute(getHtmlAttribute(match[1], 'value')),
      selected: /\sselected(?:\s|=|$)/.test(match[1])
    });
  }
  return (options.find((option) => option.selected) || options[0] || { value: '' }).value;
}

function getHtmlAttribute(attributes, name) {
  const match = String(attributes).match(new RegExp(`${name}="([^"]*)"`));
  return match ? match[1] : '';
}

function decodeHtmlAttribute(value) {
  return String(value)
    .replace(/&#10;/g, '\n')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
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
