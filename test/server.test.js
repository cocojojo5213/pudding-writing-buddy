import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { mkdtemp, readFile, readdir, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const APP_ROOT = path.resolve(import.meta.dirname, '..');

test('api rejects invalid JSON, wrong methods, and unknown assist tasks', async () => {
  const app = await startApp();
  try {
    const invalidJson = await requestJson(app.baseUrl, '/api/project', {
      method: 'POST',
      body: '{bad'
    });
    assert.equal(invalidJson.status, 400);
    assert.match(invalidJson.body.error, /Invalid JSON body/);

    const nonObjectJson = await requestJson(app.baseUrl, '/api/project', {
      method: 'POST',
      body: '"not an object"'
    });
    assert.equal(nonObjectJson.status, 400);
    assert.match(nonObjectJson.body.error, /JSON body must be an object/);

    const wrongMethod = await requestJson(app.baseUrl, '/api/metrics', { method: 'POST' });
    assert.equal(wrongMethod.status, 405);
    assert.match(wrongMethod.body.error, /Method not allowed/);

    const unknownTask = await requestJson(app.baseUrl, '/api/assist', {
      method: 'POST',
      body: JSON.stringify({ task: 'explode' })
    });
    assert.equal(unknownTask.status, 400);
    assert.match(unknownTask.body.error, /Unknown assist task/);
  } finally {
    await app.stop();
  }
});

test('api preserves multibyte JSON split across network chunks', async () => {
  const app = await startApp();
  try {
    const project = (await requestJson(app.baseUrl, '/api/project')).body;
    const title = '中文标题不能被拆包损坏';
    const body = JSON.stringify({
      project: {
        ...project,
        title
      },
      expectedVersionToken: project.versionToken
    });
    const splitAt = Buffer.from(body).indexOf(Buffer.from('文'));
    assert.ok(splitAt > 0);

    const response = await rawRequest(app.baseUrl, '/api/project', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body)
      },
      chunks: [
        Buffer.from(body).subarray(0, splitAt + 1),
        Buffer.from(body).subarray(splitAt + 1)
      ]
    });
    assert.equal(response.status, 200);
    assert.equal(JSON.parse(response.text).title, title);
  } finally {
    await app.stop();
  }
});

test('api rejects blind writes when a project version exists', async () => {
  const app = await startApp();
  try {
    const project = (await requestJson(app.baseUrl, '/api/project')).body;
    const blindProject = { ...project, title: 'Blind Overwrite' };
    delete blindProject.versionToken;
    delete blindProject.updatedAt;

    const save = await requestJson(app.baseUrl, '/api/project', {
      method: 'POST',
      body: JSON.stringify({ project: blindProject })
    });
    assert.equal(save.status, 409);
    assert.match(save.body.error, /version is required/i);

    const settle = await requestJson(app.baseUrl, '/api/settle', {
      method: 'POST',
      body: JSON.stringify({
        chapter: {
          id: 'blind-settle',
          title: '盲写结算',
          body: '林澈看见电梯按钮亮起。'
        }
      })
    });
    assert.equal(settle.status, 409);
    assert.match(settle.body.error, /version is required/i);

    const reset = await requestJson(app.baseUrl, '/api/reset', {
      method: 'POST',
      body: JSON.stringify({})
    });
    assert.equal(reset.status, 409);
    assert.match(reset.body.error, /version is required/i);

    const saved = JSON.parse(await readFile(path.join(app.dataDir, 'project.json'), 'utf8'));
    assert.equal(saved.title, project.title);
  } finally {
    await app.stop();
  }
});

test('api rejects project save metadata without a project payload', async () => {
  const app = await startApp();
  try {
    const project = (await requestJson(app.baseUrl, '/api/project')).body;
    const savedProject = await requestJson(app.baseUrl, '/api/project', {
      method: 'POST',
      body: JSON.stringify({
        project: {
          ...project,
          title: 'Payload Boundary Title'
        },
        expectedVersionToken: project.versionToken
      })
    });
    assert.equal(savedProject.status, 200);

    const missingProject = await requestJson(app.baseUrl, '/api/project', {
      method: 'POST',
      body: JSON.stringify({ expectedVersionToken: savedProject.body.versionToken })
    });
    assert.equal(missingProject.status, 400);
    assert.match(missingProject.body.error, /Project payload is required/);

    const wrongShape = await requestJson(app.baseUrl, '/api/project', {
      method: 'POST',
      body: JSON.stringify({
        project: 'not an object',
        expectedVersionToken: savedProject.body.versionToken
      })
    });
    assert.equal(wrongShape.status, 400);
    assert.match(wrongShape.body.error, /Project payload must be an object/);

    const saved = JSON.parse(await readFile(path.join(app.dataDir, 'project.json'), 'utf8'));
    assert.equal(saved.title, 'Payload Boundary Title');
  } finally {
    await app.stop();
  }
});

test('static server handles malformed paths, methods, HEAD, and Host safely', async () => {
  const app = await startApp();
  try {
    const response = await rawRequest(app.baseUrl, '/%E0%A4%A', { method: 'GET' });
    assert.equal(response.status, 400);
    assert.match(response.headers['content-type'], /text\/plain/);
    assert.equal(response.text, 'Bad request');

    const controlCharPath = await rawRequest(app.baseUrl, '/%00', { method: 'GET' });
    assert.equal(controlCharPath.status, 400);
    assert.equal(controlCharPath.text, 'Bad request');

    const wrongMethod = await rawRequest(app.baseUrl, '/', { method: 'POST' });
    assert.equal(wrongMethod.status, 405);
    assert.equal(wrongMethod.headers.allow, 'GET, HEAD');
    assert.equal(wrongMethod.text, 'Method not allowed');

    const head = await rawRequest(app.baseUrl, '/', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.match(head.headers['content-type'], /text\/html/);
    assert.equal(head.text, '');

    const badHost = await rawRequest(app.baseUrl, '/', {
      method: 'GET',
      headers: { Host: 'bad host name' }
    });
    assert.equal(badHost.status, 200);
    assert.match(badHost.text, /写作助手布丁/);
  } finally {
    await app.stop();
  }
});

test('api settles a chapter that is not already saved in the project', async () => {
  const app = await startApp();
  try {
    const projectResponse = await requestJson(app.baseUrl, '/api/project');
    const project = projectResponse.body;
    project.chapters = [];
    const chapter = {
      id: 'chapter-from-client',
      title: '第1章 客户端章节',
      body: '林澈把未来日期的医院缴费单放在桌上。许闻说：“它在催你做选择。”',
      plan: '',
      audit: '',
      summary: '',
      status: 'draft'
    };

    const settled = await requestJson(app.baseUrl, '/api/settle', {
      method: 'POST',
      body: JSON.stringify({ project, chapter })
    });
    assert.equal(settled.status, 200);
    assert.equal(settled.body.project.chapters.length, 1);
    assert.equal(settled.body.project.chapters[0].id, chapter.id);
    assert.ok(settled.body.project.chapters[0].settledAt);

    const saved = JSON.parse(await readFile(path.join(app.dataDir, 'project.json'), 'utf8'));
    assert.equal(saved.chapters[0].id, chapter.id);
  } finally {
    await app.stop();
  }
});

test('api rejects empty chapter settlement without writing a blank chapter', async () => {
  const app = await startApp();
  try {
    const project = (await requestJson(app.baseUrl, '/api/project')).body;
    const response = await requestJson(app.baseUrl, '/api/settle', {
      method: 'POST',
      body: JSON.stringify({
        project,
        expectedVersionToken: project.versionToken,
        chapter: {
          id: 'empty-settle',
          title: '空白沉淀',
          body: '   '
        }
      })
    });

    assert.equal(response.status, 400);
    assert.match(response.body.error, /without body text/);

    const saved = JSON.parse(await readFile(path.join(app.dataDir, 'project.json'), 'utf8'));
    assert.equal(saved.chapters.length, 0);
  } finally {
    await app.stop();
  }
});

test('api settlement uses saved chapter text when client sends only a chapter id', async () => {
  const app = await startApp();
  try {
    const project = (await requestJson(app.baseUrl, '/api/project')).body;
    project.chapters = [{
      id: 'saved-partial-settle',
      title: '第1章 已保存正文',
      body: '林澈把未来日期的医院缴费单放进口袋。许闻说：“别让它离开你。”',
      plan: '已有计划',
      audit: '已有审校',
      summary: '',
      status: 'draft'
    }];
    const savedProject = await requestJson(app.baseUrl, '/api/project', {
      method: 'POST',
      body: JSON.stringify({
        project,
        expectedVersionToken: project.versionToken
      })
    });
    assert.equal(savedProject.status, 200);

    const settled = await requestJson(app.baseUrl, '/api/settle', {
      method: 'POST',
      body: JSON.stringify({
        project: savedProject.body,
        expectedVersionToken: savedProject.body.versionToken,
        chapter: { id: 'saved-partial-settle' }
      })
    });
    assert.equal(settled.status, 200);
    assert.equal(settled.body.project.chapters[0].body, project.chapters[0].body);
    assert.equal(settled.body.project.chapters[0].plan, '已有计划');
    assert.equal(settled.body.project.chapters[0].audit, '已有审校');
    assert.match(settled.body.project.chapters[0].summary, /医院缴费单/);
    assert.ok(settled.body.settlement.hookUpdates.length >= 1);
  } finally {
    await app.stop();
  }
});

test('api settlement uses the current disk project as its write base', async () => {
  const app = await startApp();
  try {
    const project = (await requestJson(app.baseUrl, '/api/project')).body;
    project.title = 'Current Disk Title';
    project.notes = 'current disk notes';
    project.chapters = [{
      id: 'settle-disk-base',
      title: '第1章 当前磁盘正文',
      body: '林澈把未来日期的医院缴费单放进口袋。许闻说：“别让它离开你。”',
      plan: 'current saved plan',
      audit: 'current saved audit',
      summary: '',
      status: 'revised'
    }];
    const savedProject = await requestJson(app.baseUrl, '/api/project', {
      method: 'POST',
      body: JSON.stringify({
        project,
        expectedVersionToken: project.versionToken
      })
    });
    assert.equal(savedProject.status, 200);

    const staleProject = JSON.parse(JSON.stringify(savedProject.body));
    staleProject.title = 'Stale Client Title';
    staleProject.notes = 'stale client notes';
    staleProject.chapters[0] = {
      ...staleProject.chapters[0],
      title: '旧客户端章节标题',
      body: '旧客户端正文不应覆盖当前磁盘正文。',
      plan: 'stale client plan',
      audit: 'stale client audit',
      summary: 'stale client summary',
      status: 'draft'
    };

    const settled = await requestJson(app.baseUrl, '/api/settle', {
      method: 'POST',
      body: JSON.stringify({
        project: staleProject,
        expectedVersionToken: savedProject.body.versionToken,
        chapter: staleProject.chapters[0]
      })
    });

    assert.equal(settled.status, 200);
    assert.equal(settled.body.project.title, 'Current Disk Title');
    assert.equal(settled.body.project.notes, 'current disk notes');
    assert.equal(settled.body.project.chapters[0].title, '第1章 当前磁盘正文');
    assert.equal(settled.body.project.chapters[0].body, project.chapters[0].body);
    assert.equal(settled.body.project.chapters[0].plan, 'current saved plan');
    assert.equal(settled.body.project.chapters[0].audit, 'current saved audit');
    assert.equal(settled.body.project.chapters[0].status, 'revised');
    assert.match(settled.body.project.chapters[0].summary, /医院缴费单/);
    assert.doesNotMatch(settled.body.project.chapters[0].summary, /stale client/);

    const saved = JSON.parse(await readFile(path.join(app.dataDir, 'project.json'), 'utf8'));
    assert.equal(saved.title, 'Current Disk Title');
    assert.equal(saved.notes, 'current disk notes');
    assert.equal(saved.chapters[0].plan, 'current saved plan');
  } finally {
    await app.stop();
  }
});

test('api backs up corrupt project files before resetting to defaults', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'novel-copilot-data-'));
  await writeFile(path.join(dataDir, 'project.json'), '{"broken"', 'utf8');
  const app = await startApp({ dataDir });
  try {
    const response = await requestJson(app.baseUrl, '/api/project');
    assert.equal(response.status, 200);
    assert.equal(response.body.schemaVersion, 2);
    await writeFile(path.join(dataDir, 'project.json'), '{"broken-again"', 'utf8');
    const secondResponse = await requestJson(app.baseUrl, '/api/project');
    assert.equal(secondResponse.status, 200);

    const files = await readdir(dataDir);
    const backups = files.filter((file) => /^project\.corrupt-/.test(file)).sort();
    assert.equal(backups.length, 2);
    assert.ok(backups.every((file) => /^project\.corrupt-\d{4}-\d{2}-\d{2}T.+-[a-f0-9]{12}\.json$/.test(file)));
    assert.notEqual(backups[0], backups[1]);
  } finally {
    await app.stop();
  }
});

test('api export returns sanitized markdown filenames', async () => {
  const app = await startApp();
  try {
    const project = (await requestJson(app.baseUrl, '/api/project')).body;
    const response = await requestJson(app.baseUrl, '/api/export', {
      method: 'POST',
      body: JSON.stringify({
        project: {
          ...project,
          title: '  Bad\\/:*?"<>|\n\r\tName  '
        }
      })
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.filename, 'Bad-Name.md');
    assert.match(response.body.markdown, /# Bad/);
  } finally {
    await app.stop();
  }
});

test('api reports non-json successful model responses clearly', async () => {
  const model = await startMockModel((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('plain text, not json');
  });
  const app = await startApp();
  try {
    const response = await requestJson(app.baseUrl, '/api/assist', {
      method: 'POST',
      body: JSON.stringify({
        task: 'plan',
        modelConfig: {
          baseUrl: model.baseUrl,
          apiKey: 'test-key',
          model: 'test-model'
        }
      })
    });
    assert.equal(response.status, 500);
    assert.match(response.body.error, /not valid JSON/);
  } finally {
    await app.stop();
    await model.stop();
  }
});

test('api normalizes model config before proxying requests', async () => {
  const proxiedRequests = [];
  const model = await startMockModel(async (request, response) => {
    proxiedRequests.push({
      url: request.url,
      authorization: request.headers.authorization,
      body: await readRequestJson(request)
    });
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({
      choices: [{ message: { content: 'normalized model request' } }]
    }));
  });
  const app = await startApp();
  try {
    const response = await requestJson(app.baseUrl, '/api/assist', {
      method: 'POST',
      body: JSON.stringify({
        task: 'plan',
        modelConfig: {
          baseUrl: `  ${model.baseUrl}/v1/  `,
          apiKey: '  test-key  ',
          model: '  test-model  ',
          temperature: '9',
          maxTokens: '250000'
        }
      })
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.output, 'normalized model request');
    assert.equal(proxiedRequests[0].url, '/v1/chat/completions');
    assert.equal(proxiedRequests[0].authorization, 'Bearer test-key');
    assert.equal(proxiedRequests[0].body.model, 'test-model');
    assert.equal(proxiedRequests[0].body.temperature, 2);
    assert.equal(proxiedRequests[0].body.max_tokens, 20000);

    const lowResponse = await requestJson(app.baseUrl, '/api/assist', {
      method: 'POST',
      body: JSON.stringify({
        task: 'plan',
        modelConfig: {
          baseUrl: model.baseUrl,
          apiKey: 'test-key',
          model: 'test-model',
          temperature: '-4',
          maxTokens: '-200'
        }
      })
    });

    assert.equal(lowResponse.status, 200);
    assert.equal(proxiedRequests[1].body.temperature, 0);
    assert.equal(proxiedRequests[1].body.max_tokens, 500);

    const defaultResponse = await requestJson(app.baseUrl, '/api/assist', {
      method: 'POST',
      body: JSON.stringify({
        task: 'plan',
        modelConfig: {
          baseUrl: model.baseUrl,
          apiKey: 'test-key',
          model: 'test-model',
          temperature: 'not-a-number',
          maxTokens: 'Infinity'
        }
      })
    });

    assert.equal(defaultResponse.status, 200);
    assert.equal(proxiedRequests[2].body.temperature, 0.75);
    assert.equal(proxiedRequests[2].body.max_tokens, 3500);
  } finally {
    await app.stop();
    await model.stop();
  }
});

test('api rejects unsafe model base URLs before proxying', async () => {
  const app = await startApp();
  try {
    for (const baseUrl of ['ftp://example.test/v1', 'https://example.test/v1?key=value']) {
      const response = await requestJson(app.baseUrl, '/api/assist', {
        method: 'POST',
        body: JSON.stringify({
          task: 'plan',
          modelConfig: {
            baseUrl,
            apiKey: 'test-key',
            model: 'test-model'
          }
        })
      });

      assert.equal(response.status, 400);
      assert.match(response.body.error, /Model base URL/);
    }
  } finally {
    await app.stop();
  }
});

test('api extracts text from common OpenAI-compatible model response shapes', async () => {
  const model = await startMockModel(async (request, response) => {
    const body = await readRequestJson(request);
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    if (body.model === 'legacy-completion') {
      response.end(JSON.stringify({ choices: [{ text: 'legacy completion text' }] }));
      return;
    }
    if (body.model === 'responses-array') {
      response.end(JSON.stringify({
        output: [{
          content: [{ type: 'output_text', text: 'responses api text' }]
        }]
      }));
      return;
    }
    response.end(JSON.stringify({
      choices: [{
        message: {
          content: [{ type: 'text', text: { value: 'message content value text' } }]
        }
      }]
    }));
  });
  const app = await startApp();
  try {
    for (const [modelName, expected] of [
      ['legacy-completion', 'legacy completion text'],
      ['responses-array', 'responses api text'],
      ['message-content-value', 'message content value text']
    ]) {
      const response = await requestJson(app.baseUrl, '/api/assist', {
        method: 'POST',
        body: JSON.stringify({
          task: 'plan',
          modelConfig: {
            baseUrl: model.baseUrl,
            apiKey: 'test-key',
            model: modelName
          }
        })
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.output, expected);
    }
  } finally {
    await app.stop();
    await model.stop();
  }
});

test('api writes unique snapshot files for repeated snapshot requests', async () => {
  const app = await startApp();
  try {
    const project = (await requestJson(app.baseUrl, '/api/project')).body;
    const first = await requestJson(app.baseUrl, '/api/snapshot', {
      method: 'POST',
      body: JSON.stringify({ project: { ...project, title: 'Snapshot A' } })
    });
    const second = await requestJson(app.baseUrl, '/api/snapshot', {
      method: 'POST',
      body: JSON.stringify({ project: { ...project, title: 'Snapshot B' } })
    });

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.notEqual(first.body.filename, second.body.filename);
    assert.match(first.body.filename, /^project-\d{4}-\d{2}-\d{2}T.+-[a-f0-9]{12}\.json$/);
    assert.equal((await stat(path.join(app.dataDir, 'snapshots', first.body.filename))).isFile(), true);
    assert.equal((await stat(path.join(app.dataDir, 'snapshots', second.body.filename))).isFile(), true);
    const firstSaved = JSON.parse(await readFile(path.join(app.dataDir, 'snapshots', first.body.filename), 'utf8'));
    const secondSaved = JSON.parse(await readFile(path.join(app.dataDir, 'snapshots', second.body.filename), 'utf8'));
    assert.equal(firstSaved.title, 'Snapshot A');
    assert.equal(secondSaved.title, 'Snapshot B');
  } finally {
    await app.stop();
  }
});

test('api rejects stale project, settle, and reset writes without overwriting newer work', async () => {
  const app = await startApp();
  try {
    const stale = (await requestJson(app.baseUrl, '/api/project')).body;
    const newer = {
      ...stale,
      title: 'Newer Disk Version',
      notes: 'saved by another browser'
    };
    const savedNewer = await requestJson(app.baseUrl, '/api/project', {
      method: 'POST',
      body: JSON.stringify({
        project: newer,
        expectedVersionToken: newer.versionToken
      })
    });
    assert.equal(savedNewer.status, 200);
    assert.notEqual(savedNewer.body.versionToken, stale.versionToken);

    const staleSave = await requestJson(app.baseUrl, '/api/project', {
      method: 'POST',
      body: JSON.stringify({
        project: { ...stale, title: 'Stale Overwrite Attempt' },
        expectedVersionToken: stale.versionToken
      })
    });
    assert.equal(staleSave.status, 409);

    const staleSettle = await requestJson(app.baseUrl, '/api/settle', {
      method: 'POST',
      body: JSON.stringify({
        project: stale,
        expectedVersionToken: stale.versionToken,
        chapter: {
          id: 'stale-chapter',
          title: '旧标签页章节',
          body: '林澈把未来日期的医院缴费单放在桌上。',
          status: 'draft'
        }
      })
    });
    assert.equal(staleSettle.status, 409);

    const staleReset = await requestJson(app.baseUrl, '/api/reset', {
      method: 'POST',
      body: JSON.stringify({ expectedVersionToken: stale.versionToken })
    });
    assert.equal(staleReset.status, 409);

    const saved = JSON.parse(await readFile(path.join(app.dataDir, 'project.json'), 'utf8'));
    assert.equal(saved.title, 'Newer Disk Version');
    assert.equal(saved.notes, 'saved by another browser');
    assert.equal(saved.chapters.length, 0);
  } finally {
    await app.stop();
  }
});

test('api serializes concurrent same-version saves so stale writes cannot pass the check', async () => {
  const app = await startApp();
  try {
    const baseProject = (await requestJson(app.baseUrl, '/api/project')).body;
    const firstAttempt = {
      ...baseProject,
      title: 'Concurrent Save A',
      notes: 'first concurrent writer'
    };
    const secondAttempt = {
      ...baseProject,
      title: 'Concurrent Save B',
      notes: 'second concurrent writer'
    };

    const results = await Promise.all([
      requestJson(app.baseUrl, '/api/project', {
        method: 'POST',
        body: JSON.stringify({
          project: firstAttempt,
          expectedVersionToken: baseProject.versionToken
        })
      }),
      requestJson(app.baseUrl, '/api/project', {
        method: 'POST',
        body: JSON.stringify({
          project: secondAttempt,
          expectedVersionToken: baseProject.versionToken
        })
      })
    ]);

    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
    const accepted = results.find((result) => result.status === 200).body;
    const rejected = results.find((result) => result.status === 409).body;
    assert.match(rejected.error, /Project changed on disk/);

    const saved = JSON.parse(await readFile(path.join(app.dataDir, 'project.json'), 'utf8'));
    assert.equal(saved.title, accepted.title);
    assert.equal(saved.notes, accepted.notes);
    assert.notEqual(saved.versionToken, baseProject.versionToken);
  } finally {
    await app.stop();
  }
});

test('api cleans stale atomic-save temp files while preserving fresh temp files', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'novel-copilot-data-'));
  const staleTemp = path.join(dataDir, 'project.json.111.old.tmp');
  const freshTemp = path.join(dataDir, 'project.json.222.fresh.tmp');
  await writeFile(staleTemp, 'old', 'utf8');
  await writeFile(freshTemp, 'fresh', 'utf8');
  const oldTime = new Date(Date.now() - 10_000);
  await utimes(staleTemp, oldTime, oldTime);

  const app = await startApp({
    dataDir,
    env: { STALE_TEMP_MS: '5000' }
  });
  try {
    const project = (await requestJson(app.baseUrl, '/api/project')).body;
    const saved = await requestJson(app.baseUrl, '/api/project', {
      method: 'POST',
      body: JSON.stringify({
        project: { ...project, title: 'Temp Cleanup Proof' },
        expectedVersionToken: project.versionToken
      })
    });
    assert.equal(saved.status, 200);
    const files = await readdir(dataDir);
    assert.equal(files.includes(path.basename(staleTemp)), false);
    assert.equal(files.includes(path.basename(freshTemp)), true);
    assert.equal((await stat(freshTemp)).isFile(), true);
  } finally {
    await app.stop();
  }
});

async function startApp(options = {}) {
  const dataDir = options.dataDir || await mkdtemp(path.join(tmpdir(), 'novel-copilot-data-'));
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: APP_ROOT,
    env: {
      ...process.env,
      ...(options.env || {}),
      PORT: String(port),
      DATA_DIR: dataDir
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });
  await waitFor(() => output.includes(`http://127.0.0.1:${port}`), 5000, () => {
    if (child.exitCode !== null) throw new Error(`server exited early: ${output}`);
  });
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    dataDir,
    stop: () => stopChild(child)
  };
}

async function startMockModel(handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    stop: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    })
  };
}

async function requestJson(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : {}
  };
}

async function readRequestJson(request) {
  let data = '';
  for await (const chunk of request) data += chunk;
  return data ? JSON.parse(data) : {};
}

async function rawRequest(baseUrl, pathname, options = {}) {
  const url = new URL(pathname, baseUrl);
  const chunks = options.chunks || (options.body ? [options.body] : []);
  return await new Promise((resolve, reject) => {
    const request = httpRequest(url, {
      method: options.method || 'GET',
      headers: options.headers || {}
    }, (response) => {
      const body = [];
      response.on('data', (chunk) => body.push(chunk));
      response.on('end', () => {
        resolve({
          status: response.statusCode,
          headers: response.headers,
          text: Buffer.concat(body).toString('utf8')
        });
      });
    });
    request.on('error', reject);
    for (const chunk of chunks) request.write(chunk);
    request.end();
  });
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  return port;
}

async function waitFor(predicate, timeoutMs, tick = () => {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    tick();
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for condition');
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    child.once('exit', resolve);
    setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
    }, 1000);
  });
}
