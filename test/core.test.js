import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PROJECT,
  analyzeDraftQuality,
  analyzeStyle,
  applySettlement,
  buildContextPacket,
  buildPrompt,
  countTextLength,
  createDefaultProject,
  deriveProjectMetrics,
  exportMarkdown,
  formatSettlement,
  normalizeProject,
  offlineAssist,
  offlineAudit,
  offlineBrainstorm,
  offlineDraft,
  offlinePlan,
  offlineRevise
} from '../lib.js';

test('normalizes partial projects with core writing lists', () => {
  const project = normalizeProject({ title: 'Test Book', targetWords: '1200' });
  assert.equal(project.title, 'Test Book');
  assert.equal(project.targetWords, 1200);
  assert.ok(Array.isArray(project.characters));
  assert.ok(Array.isArray(project.hooks));
  assert.ok(Array.isArray(project.outline));
  assert.ok(Array.isArray(project.timeline));
  assert.ok(Array.isArray(project.resources));
  assert.ok(Array.isArray(project.arcs));
  assert.equal(project.schemaVersion, 2);
});

test('normalization rounds legacy fractional target word counts', () => {
  const project = normalizeProject({ targetWords: '1200.5' });
  assert.equal(project.targetWords, 1201);
});

test('normalization falls back for malformed legacy target word counts', () => {
  for (const targetWords of [null, true, [], {}, '', '   ', '1e3', '0x500']) {
    const project = normalizeProject({ targetWords });
    assert.equal(project.targetWords, 2200);
  }
});

test('normalization preserves timestamps and exported default is immutable', () => {
  const updatedAt = '2024-01-02T03:04:05.000Z';
  const project = normalizeProject({ ...createDefaultProject(), updatedAt });
  assert.equal(project.updatedAt, updatedAt);
  assert.equal(Object.isFrozen(DEFAULT_PROJECT), true);
  assert.equal(Object.isFrozen(DEFAULT_PROJECT.characters), true);
});

test('normalization drops malformed legacy project text fields', () => {
  const project = normalizeProject({
    title: { value: 'Object Title' },
    genre: ['array genre'],
    logline: true,
    protagonist: 123,
    notes: ['note one', 'note two'],
    styleProfile: { text: 'style' },
    versionToken: { value: 'token' },
    updatedAt: ['2026-06-07T00:00:00.000Z'],
    characters: [{
      id: 'malformed-text-character',
      name: { text: '阿宁' },
      role: ['调查员'],
      desire: 42,
      conflict: false
    }],
    timeline: [{
      id: 'malformed-text-timeline',
      chapterId: ['chapter-1'],
      chapter: { title: '第一章' },
      event: true,
      consequence: 7
    }],
    resources: [{
      id: 'malformed-text-resource',
      owner: { name: '阿宁' },
      item: ['旧照片'],
      quantity: 3,
      status: false,
      note: null
    }]
  });

  assert.equal(project.title, DEFAULT_PROJECT.title);
  assert.equal(project.genre, DEFAULT_PROJECT.genre);
  assert.equal(project.logline, DEFAULT_PROJECT.logline);
  assert.equal(project.protagonist, '123');
  assert.equal(project.notes, '');
  assert.equal(project.styleProfile, '');
  assert.equal(project.versionToken, '');
  assert.notEqual(project.updatedAt, '2026-06-07T00:00:00.000Z');
  assert.equal(project.characters[0].name, '');
  assert.equal(project.characters[0].role, '');
  assert.equal(project.characters[0].desire, '42');
  assert.equal(project.characters[0].conflict, '');
  assert.equal(project.timeline[0].chapterId, '');
  assert.equal(project.timeline[0].chapter, '');
  assert.equal(project.timeline[0].event, '');
  assert.equal(project.timeline[0].consequence, '7');
  assert.equal(project.resources[0].owner, '');
  assert.equal(project.resources[0].item, '');
  assert.equal(project.resources[0].quantity, '3');
  assert.equal(project.resources[0].status, '');
  assert.equal(JSON.stringify(project), JSON.stringify(project).replace(/\[object Object\]|array genre|note one,note two|旧照片/g, ''));
});

test('normalization gives legacy items stable ids without inventing timestamps', () => {
  const legacy = {
    title: 'Legacy Import',
    characters: [{ name: '阿宁', role: '调查员' }],
    hooks: [{ text: '旧照片背面有一行字' }],
    outline: [{ title: '旧案重启', summary: '主角发现旧线索。' }],
    timeline: [{ chapter: '前史', event: '旧案发生。' }],
    resources: [{ owner: '阿宁', item: '旧照片' }],
    arcs: [{ character: '阿宁', current: '开始怀疑真相' }],
    chapters: [{ title: '第一章', body: '阿宁打开旧照片。' }]
  };
  const first = normalizeProject(legacy);
  const second = normalizeProject(legacy);

  assert.deepEqual(first.characters.map((item) => item.id), second.characters.map((item) => item.id));
  assert.deepEqual(first.hooks.map((item) => item.id), second.hooks.map((item) => item.id));
  assert.deepEqual(first.chapters.map((item) => item.id), second.chapters.map((item) => item.id));
  assert.match(first.characters[0].id, /^character-[a-f0-9]{12}$/);
  assert.equal(first.chapters[0].createdAt, '');

  const explicit = normalizeProject({ chapters: [{ id: 'kept-id', title: '保留' }] });
  assert.equal(explicit.chapters[0].id, 'kept-id');
});

test('normalization repairs duplicate and unsafe legacy collection ids stably', () => {
  const legacy = {
    characters: [
      { id: 'duplicate-id', name: '阿宁', role: '调查员' },
      { id: 'duplicate-id', name: '许闻', role: '引路人' },
      { id: 'bad\u0000id', name: '周眠', role: '记录者' }
    ],
    chapters: [
      { id: 'same-chapter', title: '第一章', body: '第一章正文。' },
      { id: 'same-chapter', title: '第二章', body: '第二章正文。' },
      { id: 'bad\nchapter', title: '第三章', body: '第三章正文。' }
    ]
  };

  const first = normalizeProject(legacy);
  const second = normalizeProject(legacy);

  assert.equal(first.characters[0].id, 'duplicate-id');
  assert.notEqual(first.characters[1].id, 'duplicate-id');
  assert.notEqual(first.characters[2].id, 'bad\u0000id');
  assert.notEqual(first.chapters[1].id, 'same-chapter');
  assert.notEqual(first.chapters[2].id, 'bad\nchapter');
  assert.equal(first.characters.every((item) => !/[\u0000-\u001f\u007f]/.test(item.id)), true);
  assert.equal(first.chapters.every((item) => !/[\u0000-\u001f\u007f]/.test(item.id)), true);
  assert.deepEqual(first.characters.map((item) => item.id), second.characters.map((item) => item.id));
  assert.deepEqual(first.chapters.map((item) => item.id), second.chapters.map((item) => item.id));
});

test('normalization repairs non-string legacy collection ids stably', () => {
  const legacy = {
    characters: [
      { id: { value: 'object-id' }, name: '对象编号' },
      { id: ['array-id'], name: '数组编号' },
      { id: true, name: '布尔编号' },
      { id: 42, name: '数字编号' }
    ],
    chapters: [
      { id: { value: 'chapter-object-id' }, title: '对象章节', body: '对象章节正文。' },
      { id: ['chapter-array-id'], title: '数组章节', body: '数组章节正文。' }
    ]
  };

  const first = normalizeProject(legacy);
  const second = normalizeProject(legacy);

  assert.match(first.characters[0].id, /^character-[a-f0-9]{12}$/);
  assert.match(first.characters[1].id, /^character-[a-f0-9]{12}$/);
  assert.match(first.characters[2].id, /^character-[a-f0-9]{12}$/);
  assert.equal(first.characters[3].id, '42');
  assert.match(first.chapters[0].id, /^chapter-[a-f0-9]{12}$/);
  assert.match(first.chapters[1].id, /^chapter-[a-f0-9]{12}$/);
  assert.deepEqual(first.characters.map((item) => item.id), second.characters.map((item) => item.id));
  assert.deepEqual(first.chapters.map((item) => item.id), second.chapters.map((item) => item.id));
});

test('normalization migrates legacy chapter text without reviving cleared bodies', () => {
  const legacyTextOnly = normalizeProject({
    chapters: [{
      id: 'legacy-text-only',
      title: '旧字段正文',
      text: '旧版正文应迁移。'
    }]
  });
  assert.equal(legacyTextOnly.chapters[0].body, '旧版正文应迁移。');

  const explicitlyCleared = normalizeProject({
    chapters: [{
      id: 'cleared-body',
      title: '已清空正文',
      body: '',
      text: '旧字段正文不应复活。'
    }]
  });
  assert.equal(explicitlyCleared.chapters[0].body, '');
});

test('normalization falls back to legacy chapter text when body shape is malformed', () => {
  const project = normalizeProject({
    chapters: [
      {
        id: 'malformed-body-with-legacy-text',
        title: { text: '坏标题' },
        body: { text: '坏正文形状' },
        text: '旧版正文应保留。',
        plan: ['坏计划'],
        audit: false,
        summary: 9
      },
      {
        id: 'empty-body-still-cleared',
        title: '已清空正文',
        body: '',
        text: '旧版正文不应复活。'
      }
    ]
  });

  assert.equal(project.chapters[0].title, '');
  assert.equal(project.chapters[0].body, '旧版正文应保留。');
  assert.equal(project.chapters[0].plan, '');
  assert.equal(project.chapters[0].audit, '');
  assert.equal(project.chapters[0].summary, '9');
  assert.equal(project.chapters[1].body, '');
});

test('normalization does not leak default story details into matching user entries', () => {
  const project = normalizeProject({
    characters: [{ name: '林澈' }],
    hooks: [{ text: '妹妹书包里出现一张未来日期的医院缴费单' }],
    resources: [{ item: '未来日期的医院缴费单' }],
    arcs: [{ character: '林澈' }]
  });

  assert.equal(project.characters[0].knowledge, '');
  assert.equal(project.characters[0].lastSeen, '');
  assert.equal(project.hooks[0].payoffBy, '');
  assert.equal(project.hooks[0].note, '');
  assert.equal(project.resources[0].owner, '');
  assert.equal(project.resources[0].status, '');
  assert.equal(project.arcs[0].pressure, '');
  assert.equal(project.arcs[0].target, '');
});

test('builds task-specific prompts with story context', () => {
  const prompt = buildPrompt('plan', DEFAULT_PROJECT, { instruction: 'push the first irreversible choice' });
  assert.match(prompt, /章节策划/);
  assert.match(prompt, /Untitled Novel/);
  assert.match(prompt, /push the first irreversible choice/);
  assert.match(prompt, /Context Packet/);
  assert.match(prompt, /Resources/);
});

test('assistant prompt payload text fields drop malformed object and array values', () => {
  const planPrompt = buildPrompt('plan', DEFAULT_PROJECT, { instruction: { text: 'fake instruction' } });
  const draftPrompt = buildPrompt('draft', DEFAULT_PROJECT, { plan: ['fake plan'] });
  const auditPrompt = buildPrompt('audit', DEFAULT_PROJECT, { plan: { text: 'fake plan' }, text: ['fake draft'] });
  const revisePrompt = buildPrompt('revise', DEFAULT_PROJECT, { audit: { text: 'fake audit' }, text: ['fake source'] });
  const fallbackPrompt = buildPrompt('unknown-task', DEFAULT_PROJECT, { instruction: { text: 'fake task' } });

  for (const prompt of [planPrompt, draftPrompt, auditPrompt, revisePrompt, fallbackPrompt]) {
    assert.doesNotMatch(prompt, /\[object Object\]/);
    assert.doesNotMatch(prompt, /fake instruction|fake plan|fake draft|fake audit|fake source|fake task/);
  }
  assert.match(planPrompt, /额外指令：让主角面对第一个不可逆选择/);
  assert.match(draftPrompt, /章节计划：\n按当前焦点写下一章。/);
  assert.match(auditPrompt, /章节计划：\n未提供/);
  assert.match(revisePrompt, /审校意见：\n+\s*原文：\n$/);
  assert.match(fallbackPrompt, /任务：辅助写作/);
});

test('offline assist sanitizes malformed payload text fields', () => {
  const style = offlineAssist('style', DEFAULT_PROJECT, { text: { value: 'fake style' } });
  const audit = offlineAssist('audit', DEFAULT_PROJECT, { text: ['fake draft'], plan: { value: 'fake plan' } });
  const revision = offlineAssist('revise', DEFAULT_PROJECT, { text: ['fake source'], audit: { value: 'fake audit' } });

  assert.equal(style, '没有文本可分析。');
  assert.match(audit, /正文为空/);
  assert.doesNotMatch(audit, /fake draft|fake plan|\[object Object\]/);
  assert.equal(revision, '原文为空，无法修订。');
});

test('offline planner and draft produce usable chapter text', () => {
  const project = normalizeProject(DEFAULT_PROJECT);
  const plan = offlineAssist('plan', project, {});
  const draft = offlineAssist('draft', project, { plan });
  assert.match(plan, /章节目标/);
  assert.match(draft, /第1章/);
  assert.ok(draft.length > 400);
  assert.match(draft, /未来日期的医院缴费单/);
});

test('offline audit flags empty and short drafts', () => {
  const audit = offlineAudit(normalizeProject(DEFAULT_PROJECT), '');
  assert.match(audit, /正文为空/);
  assert.match(audit, /critical/);
  assert.match(audit, /质量评分/);
});

test('style analysis and export include expected sections', () => {
  const style = analyzeStyle('他说：“我知道。”\n\n门外传来脚步声。');
  assert.match(style, /风格指纹/);
  const project = normalizeProject({
    ...DEFAULT_PROJECT,
    chapters: [{ title: 'Opening', body: '正文', plan: '', audit: '', summary: '', status: 'draft' }]
  });
  const markdown = exportMarkdown(project);
  assert.match(markdown, /## 人物/);
  assert.match(markdown, /## 资源账本/);
  assert.match(markdown, /## 章节工作记录/);
  assert.match(markdown, /### Opening/);
});

test('export keeps ledger fields on one markdown line', () => {
  const project = normalizeProject({
    title: 'Clean Export',
    characters: [{ name: '阿宁\n## Injected', role: '调查员', desire: '查案\n- 伪列表' }],
    hooks: [{ text: '旧照片\n## Hook Break', status: 'open', note: '背面有字\n- 假条目' }],
    resources: [{ owner: '阿宁\n## Owner', item: '旧照片\n## Item', note: '口袋\n- 假条目' }],
    arcs: [{ character: '阿宁\n## Arc', start: '怀疑\n## Start' }],
    timeline: [{ chapter: '前史\n## Time', event: '旧案发生\n## Event' }],
    outline: [{ title: '旧案重启\n## Beat', summary: '发现线索\n- 假列表' }]
  });

  const markdown = exportMarkdown(project);

  assert.doesNotMatch(markdown, /^## Injected/m);
  assert.doesNotMatch(markdown, /^## Hook Break/m);
  assert.doesNotMatch(markdown, /^## Owner/m);
  assert.doesNotMatch(markdown, /^## Arc/m);
  assert.doesNotMatch(markdown, /^## Time/m);
  assert.doesNotMatch(markdown, /^## Beat/m);
  assert.doesNotMatch(markdown, /^- 假条目/m);
  assert.match(markdown, /阿宁 ## Injected/);
  assert.match(markdown, /旧案重启 ## Beat: 发现线索 - 假列表/);
});

test('export keeps scalar metadata on one markdown line', () => {
  const project = normalizeProject({
    title: 'Clean Metadata',
    genre: '都市奇幻\n## Fake Genre Section',
    logline: '一句话简介\n- fake bullet'
  });

  const markdown = exportMarkdown(project);

  assert.doesNotMatch(markdown, /^## Fake Genre Section/m);
  assert.doesNotMatch(markdown, /^- fake bullet/m);
  assert.match(markdown, /^类型：都市奇幻 ## Fake Genre Section$/m);
  assert.match(markdown, /^一句话：一句话简介 - fake bullet$/m);
});

test('export keeps chapter summary on one markdown line', () => {
  const project = normalizeProject({
    ...createDefaultProject(),
    chapters: [{
      id: 'summary-injection',
      title: 'Opening',
      body: '正文保留原样。\n## 正文里的标题允许保留',
      plan: '',
      audit: '',
      summary: '摘要第一句。\n## Injected Summary\n- fake item',
      status: 'draft'
    }]
  });

  const markdown = exportMarkdown(project);

  assert.doesNotMatch(markdown, /^## Injected Summary/m);
  assert.doesNotMatch(markdown, /^- fake item/m);
  assert.match(markdown, /^> 摘要：摘要第一句。 ## Injected Summary - fake item$/m);
  assert.match(markdown, /^## 正文里的标题允许保留$/m);
});

test('context packet includes state ledgers for long-form continuity', () => {
  const project = normalizeProject(createDefaultProject());
  const context = buildContextPacket(project, 1);
  assert.match(context, /Open Hooks/);
  assert.match(context, /Emotional Arcs/);
  assert.match(context, /Recent Timeline/);
  assert.match(context, /未来日期的医院缴费单/);
});

test('context packet does not wrap the first chapter back to the last chapter', () => {
  const project = normalizeProject({
    ...createDefaultProject(),
    chapters: [
      { id: 'chapter-1', title: '第一章', body: '第一章正文。', summary: '第一章摘要。' },
      { id: 'chapter-2', title: '第二章', body: '第二章正文。', summary: '第二章摘要。' }
    ]
  });
  const firstChapterContext = buildContextPacket(project, 'chapter-1');
  const thirdChapterContext = buildContextPacket(project, 3);

  assert.match(firstChapterContext, /## Prior Chapter\n暂无上一章/);
  assert.doesNotMatch(firstChapterContext, /第二章摘要/);
  assert.match(thirdChapterContext, /第二章摘要/);
});

test('numeric-looking chapter ids resolve as ids before chapter numbers', () => {
  const project = normalizeProject({
    ...createDefaultProject(),
    chapters: [
      { id: '2', title: 'Numeric Id First', body: '第一章正文。', summary: '第一章摘要。' },
      { id: 'actual-second', title: 'Actual Second', body: '第二章正文。', summary: '第二章摘要。' }
    ]
  });

  const context = buildContextPacket(project, '2');

  assert.match(context, /Next chapter: 1/);
  assert.match(context, /## Prior Chapter\n暂无上一章/);
  assert.doesNotMatch(context, /第二章摘要/);
});

test('fractional and empty chapter refs fall back to the next chapter', () => {
  const project = normalizeProject({
    ...createDefaultProject(),
    chapters: [
      { id: 'chapter-1', title: '第一章', body: '第一章正文。', summary: '第一章摘要。' },
      { id: 'chapter-2', title: '第二章', body: '第二章正文。', summary: '第二章摘要。' }
    ]
  });

  const fractionalContext = buildContextPacket(project, '1.5');
  const emptyContext = buildContextPacket(project, null);
  const plan = offlineAssist('plan', project, { chapterNumber: '1.5' });

  assert.match(fractionalContext, /Next chapter: 3/);
  assert.doesNotMatch(fractionalContext, /Next chapter: 1\.5/);
  assert.match(fractionalContext, /## Prior Chapter\n第二章: 第二章摘要。/);
  assert.match(emptyContext, /Next chapter: 3/);
  assert.match(plan, /^# 第3章计划/m);
  assert.doesNotMatch(plan, /第1\.5章/);
});

test('malformed chapter refs are not stringified into ids or chapter numbers', () => {
  const project = normalizeProject({
    ...createDefaultProject(),
    chapters: [
      { id: '[object Object]', title: '对象假 ID', body: '对象假 ID 正文。', summary: '对象假 ID 摘要。' },
      { id: 'true', title: '布尔假 ID', body: '布尔假 ID 正文。', summary: '布尔假 ID 摘要。' },
      { id: '1,2', title: '数组假 ID', body: '数组假 ID 正文。', summary: '数组假 ID 摘要。' }
    ]
  });

  for (const malformedRef of [{ id: '[object Object]' }, true, [1, 2]]) {
    const context = buildContextPacket(project, malformedRef);
    assert.match(context, /Next chapter: 4/);
    assert.match(context, /## Prior Chapter\n数组假 ID: 数组假 ID 摘要。/);
    assert.doesNotMatch(context, /Next chapter: 1/);
    assert.doesNotMatch(context, /对象假 ID: 对象假 ID 摘要。/);
  }
});

test('draft quality detects AI phrasing and continuity risk', () => {
  const project = normalizeProject(createDefaultProject());
  const text = '林澈知道命运的齿轮开始转动。林澈知道命运的齿轮开始转动。';
  const metrics = analyzeDraftQuality(project, text, '伏笔处理');
  assert.ok(metrics.score < 80);
  assert.ok(metrics.aiTellHits.includes('命运的齿轮'));
  const audit = offlineAudit(project, text, { plan: '推进妹妹书包里出现一张未来日期的医院缴费单' });
  assert.match(audit, /句子重复|AI 腔/);
});

test('exported offline helpers tolerate sparse projects and non-string text', () => {
  const prompt = buildPrompt('plan', {}, null);
  const assistedPlan = offlineAssist('plan', {}, null);
  const assistedSettlement = offlineAssist('settle', {}, null);
  const plan = offlinePlan({}, null);
  const fractionalPlan = offlinePlan({}, { chapterNumber: '1.5' });
  const zhDraft = offlineDraft({ title: 'Sparse Draft', hooks: null, characters: null }, null);
  const enDraft = offlineDraft({ language: 'en', outline: null, chapters: null }, {});
  const brainstorm = offlineBrainstorm(null);
  const metrics = analyzeDraftQuality({}, 42, ['not a string plan']);
  const audit = offlineAudit({ hooks: null, characters: null }, 42, null);
  const style = analyzeStyle(42);
  const revision = offlineRevise(42, '结尾不完整');

  assert.match(prompt, /章节策划/);
  assert.match(assistedPlan, /章节目标/);
  assert.match(assistedSettlement, /Chapter Settlement/);
  assert.match(plan, /章节目标/);
  assert.doesNotMatch(fractionalPlan, /第1\.5章/);
  assert.match(zhDraft, /第1章/);
  assert.match(enDraft, /Chapter 1/);
  assert.match(brainstorm, /创作建议/);
  assert.equal(metrics.length, 1);
  assert.match(audit, /质量评分/);
  assert.match(style, /风格指纹/);
  assert.equal(revision, '42。');
  assert.throws(() => applySettlement({}, null), /without body text/);
});

test('exported text helpers reject malformed direct text inputs', () => {
  const project = normalizeProject(createDefaultProject());
  const malformedValues = [{ text: '命运的齿轮' }, ['林澈', '许闻'], true, false];

  for (const value of malformedValues) {
    assert.equal(countTextLength(value, 'zh'), 0);
    assert.equal(analyzeDraftQuality(project, value, value).length, 0);
    assert.equal(analyzeDraftQuality(project, '林澈推开门。', value).planKeywords.length, 0);
    assert.equal(analyzeStyle(value), '没有文本可分析。');
    assert.equal(offlineRevise(value, '结尾不完整'), '原文为空，无法修订。');
  }

  const audit = offlineAudit(project, ['命运的齿轮开始转动。'], null);
  assert.match(audit, /正文为空/);
  assert.doesNotMatch(audit, /AI 腔/);
  assert.equal(offlineRevise('门开了', ['结尾不完整']), '门开了');
});

test('settlement report tolerates missing or malformed generated fields', () => {
  const emptyReport = formatSettlement(undefined);
  assert.match(emptyReport, /^Chapter: 未命名章节$/m);
  assert.match(emptyReport, /^- 未生成$/m);

  const malformedReport = formatSettlement({
    title: { nested: 'bad title' },
    summary: ['bad summary'],
    timelineEvent: {
      event: { nested: 'bad event' },
      consequence: ['bad consequence']
    },
    characterUpdates: [{ name: ['bad character'], knowledge: { nested: 'bad knowledge' } }],
    hookUpdates: [{ text: { nested: 'bad hook' }, from: true, to: ['bad status'] }],
    resourceUpdates: [{ item: false, note: { nested: 'bad resource' } }]
  });

  assert.match(malformedReport, /^Chapter: 未命名章节$/m);
  assert.match(malformedReport, /^Summary: 未提取到摘要$/m);
  assert.match(malformedReport, /^- 未生成$/m);
  assert.match(malformedReport, /^- 未命名: 未记录$/m);
  assert.match(malformedReport, /^- 未命名伏笔: 未知 -> 未知$/m);
  assert.match(malformedReport, /^- 未命名资源: 未记录$/m);
  assert.doesNotMatch(malformedReport, /\[object Object\]|bad title|bad summary|bad event|bad character|bad hook|bad resource/);
});

test('settlement applies chapter summary and truth-file updates', () => {
  const project = normalizeProject({
    ...createDefaultProject(),
    chapters: [{
      id: 'chapter-1',
      title: '第1章 异常入口',
      body: '林澈把未来日期的医院缴费单放到灯下。许闻说：“别碰。”手机忽然亮了。',
      plan: '',
      audit: '',
      summary: '',
      status: 'draft'
    }]
  });
  const { project: settled, settlement } = applySettlement(project, project.chapters[0]);
  assert.equal(settled.chapters[0].settledAt.length > 0, true);
  assert.ok(settled.timeline.length > project.timeline.length);
  assert.ok(settlement.hookUpdates.length >= 1);
  assert.equal(settled.hooks[0].status, 'progressing');
});

test('settlement inserts the chapter when it was not already in the project', () => {
  const project = normalizeProject(createDefaultProject());
  const incoming = {
    id: 'external-chapter',
    title: '第1章 外部写入',
    body: '林澈把未来日期的医院缴费单压在桌上。许闻看见以后说：“这不是第一次。”',
    plan: '推进医院缴费单伏笔',
    audit: '',
    summary: '',
    status: 'draft'
  };
  const { project: settled, settlement } = applySettlement(project, incoming);
  assert.equal(settled.chapters.length, 1);
  assert.equal(settled.chapters[0].id, incoming.id);
  assert.equal(settled.chapters[0].body, incoming.body);
  assert.ok(settled.chapters[0].settledAt);
  assert.match(settled.characters[0].knowledge, /林澈把未来日期的医院缴费单/);
  assert.ok(settlement.hookUpdates.length >= 1);
});

test('settlement rejects empty chapters instead of creating blank settled records', () => {
  const project = normalizeProject(createDefaultProject());
  assert.throws(
    () => applySettlement(project, { id: 'empty-chapter', title: '空白章节', body: '   ' }),
    /without body text/
  );
});

test('settlement uses existing chapter text when the incoming payload is partial', () => {
  const project = normalizeProject({
    ...createDefaultProject(),
    chapters: [{
      id: 'partial-settle-chapter',
      title: '第1章 局部沉淀',
      body: '林澈把未来日期的医院缴费单夹进笔记本。许闻压低声音说：“这张单子会回来。”',
      plan: '保留已有计划',
      audit: '保留已有审校',
      summary: '',
      status: 'draft'
    }]
  });
  const { project: settled, settlement } = applySettlement(project, { id: 'partial-settle-chapter' });
  assert.equal(settled.chapters[0].body, project.chapters[0].body);
  assert.equal(settled.chapters[0].plan, '保留已有计划');
  assert.equal(settled.chapters[0].audit, '保留已有审校');
  assert.match(settled.chapters[0].summary, /医院缴费单/);
  assert.ok(settlement.hookUpdates.length >= 1);
});

test('settlement uses saved body when incoming body is blank', () => {
  const project = normalizeProject({
    ...createDefaultProject(),
    chapters: [{
      id: 'blank-incoming-body',
      title: '第1章 空白传入',
      body: '林澈把未来日期的医院缴费单压在桌角。许闻低声说：“先别让任何人看见。”',
      plan: '保留计划',
      audit: '',
      summary: '',
      status: 'draft'
    }]
  });
  const { project: settled } = applySettlement(project, { id: 'blank-incoming-body', body: '   ' });

  assert.equal(settled.chapters[0].body, project.chapters[0].body);
  assert.match(settled.chapters[0].summary, /医院缴费单/);
});

test('settlement preserves saved chapter metadata when incoming fields are blank', () => {
  const project = normalizeProject({
    ...createDefaultProject(),
    chapters: [{
      id: 'blank-incoming-metadata',
      title: '第1章 已保存标题',
      body: '林澈把未来日期的医院缴费单夹进笔记本。许闻说：“这张单子会回来。”',
      plan: '已有计划不能被空白传入覆盖',
      audit: '已有审校不能被空白传入覆盖',
      summary: '',
      status: 'revised',
      createdAt: '2026-06-01T00:00:00.000Z',
      settledAt: ''
    }]
  });
  const { project: settled } = applySettlement(project, {
    id: 'blank-incoming-metadata',
    title: '   ',
    body: '   ',
    plan: '   ',
    audit: '   ',
    status: '   ',
    createdAt: '   '
  });

  assert.equal(settled.chapters[0].title, '第1章 已保存标题');
  assert.equal(settled.chapters[0].body, project.chapters[0].body);
  assert.equal(settled.chapters[0].plan, '已有计划不能被空白传入覆盖');
  assert.equal(settled.chapters[0].audit, '已有审校不能被空白传入覆盖');
  assert.equal(settled.chapters[0].status, 'revised');
  assert.equal(settled.chapters[0].createdAt, '2026-06-01T00:00:00.000Z');
  assert.match(settled.timeline.at(-1).chapter, /已保存标题/);
  assert.match(settled.chapters[0].summary, /医院缴费单/);
});

test('settlement refreshes stale summaries from the current body', () => {
  const project = normalizeProject({
    ...createDefaultProject(),
    chapters: [{
      id: 'refresh-summary',
      title: '第1章 摘要刷新',
      body: '旧正文。',
      plan: '',
      audit: '',
      summary: '旧摘要不应保留',
      status: 'draft',
      settledAt: '2026-01-01T00:00:00.000Z'
    }]
  });
  const { project: settled } = applySettlement(project, {
    id: 'refresh-summary',
    body: '林澈在电梯里看到第十三层按钮亮起。未来日期的医院缴费单从口袋里变热。'
  });

  assert.match(settled.chapters[0].summary, /第十三层按钮/);
  assert.doesNotMatch(settled.chapters[0].summary, /旧摘要/);
});

test('settlement refreshes its prior timeline event instead of appending stale summaries', () => {
  const project = normalizeProject({
    ...createDefaultProject(),
    timeline: [
      {
        id: 'manual-timeline',
        chapter: '第1章 时间线刷新',
        event: '人工记录：林澈先把缴费单藏起来。',
        consequence: '这条人工时间线不应被自动沉淀覆盖。'
      },
      {
        id: 'old-settlement-timeline',
        source: 'settlement',
        chapterId: 'refresh-timeline',
        chapter: '第1章 时间线刷新',
        event: '旧正文。',
        consequence: '需要人工补充直接后果。'
      }
    ],
    chapters: [{
      id: 'refresh-timeline',
      title: '第1章 时间线刷新',
      body: '旧正文。',
      plan: '',
      audit: '',
      summary: '旧正文。',
      status: 'draft',
      settledAt: '2026-01-01T00:00:00.000Z'
    }]
  });

  const { project: settled } = applySettlement(project, {
    id: 'refresh-timeline',
    body: '林澈在电梯里看到第十三层按钮亮起。未来日期的医院缴费单从口袋里变热。'
  });

  assert.equal(settled.timeline.length, 2);
  assert.equal(settled.timeline[0].id, 'manual-timeline');
  assert.match(settled.timeline[0].event, /人工记录/);
  assert.equal(settled.timeline[1].id, 'old-settlement-timeline');
  assert.equal(settled.timeline[1].source, 'settlement');
  assert.equal(settled.timeline[1].chapterId, 'refresh-timeline');
  assert.match(settled.timeline[1].event, /第十三层按钮/);
  assert.doesNotMatch(settled.timeline.map((event) => event.event).join('\n'), /旧正文/);
});

test('settlement keeps same-title chapter timeline entries separate', () => {
  const project = normalizeProject({
    ...createDefaultProject(),
    timeline: [],
    chapters: [
      {
        id: 'same-title-first',
        title: '同名章节',
        body: '林澈把未来日期的医院缴费单放在桌上。',
        plan: '',
        audit: '',
        summary: '',
        status: 'draft',
        settledAt: ''
      },
      {
        id: 'same-title-second',
        title: '同名章节',
        body: '许闻在电梯里看见第十三层按钮亮起。',
        plan: '',
        audit: '',
        summary: '',
        status: 'draft',
        settledAt: ''
      }
    ]
  });

  const first = applySettlement(project, project.chapters[0]).project;
  const second = applySettlement(first, first.chapters[1]).project;

  const automaticTimeline = second.timeline.filter((event) => event.source === 'settlement');
  assert.equal(automaticTimeline.length, 2);
  assert.deepEqual(automaticTimeline.map((event) => event.chapterId), ['same-title-first', 'same-title-second']);
  assert.match(automaticTimeline[0].event, /缴费单/);
  assert.match(automaticTimeline[1].event, /第十三层按钮/);
});

test('settlement preserves manually revised timeline entries', () => {
  const project = normalizeProject({
    ...createDefaultProject(),
    timeline: [{
      id: 'manual-revised-settlement',
      source: 'settlement',
      chapterId: 'manual-revised-timeline',
      chapter: '第1章 人工修订',
      event: '人工改写：缴费单不是第一次出现。',
      consequence: '人工确认：这条因果链必须保留。'
    }],
    chapters: [{
      id: 'manual-revised-timeline',
      title: '第1章 人工修订',
      body: '旧正文。',
      plan: '',
      audit: '',
      summary: '旧正文。',
      status: 'draft',
      settledAt: '2026-01-01T00:00:00.000Z'
    }]
  });

  const { project: settled } = applySettlement(project, {
    id: 'manual-revised-timeline',
    body: '林澈在电梯里看到第十三层按钮亮起。未来日期的医院缴费单从口袋里变热。'
  });

  assert.equal(settled.timeline.length, 2);
  assert.equal(settled.timeline[0].id, 'manual-revised-settlement');
  assert.match(settled.timeline[0].event, /人工改写/);
  assert.match(settled.timeline[0].consequence, /人工确认/);
  assert.notEqual(settled.timeline[1].id, 'manual-revised-settlement');
  assert.equal(settled.timeline[1].source, 'settlement');
  assert.equal(settled.timeline[1].chapterId, 'manual-revised-timeline');
  assert.match(settled.timeline[1].event, /第十三层按钮/);
});

test('settlement appends truth ledger notes instead of overwriting old state', () => {
  const project = normalizeProject(createDefaultProject());
  project.characters[0].knowledge = '旧知识：林澈只知道电梯异常。';
  project.hooks[0].note = '旧伏笔备注：缴费单来自上一章。';
  project.resources[0].note = '旧资源备注：缴费单原件在林澈口袋。';
  project.chapters = [{
    id: 'append-ledger-state',
    title: '第2章 状态追加',
    body: '林澈把未来日期的医院缴费单贴在窗上。许闻说：“电梯第十三层按钮亮了。”',
    plan: '',
    audit: '',
    summary: '',
    status: 'draft'
  }];

  const { project: settled } = applySettlement(project, project.chapters[0]);

  assert.match(settled.characters[0].knowledge, /旧知识：林澈只知道电梯异常。/);
  assert.match(settled.characters[0].knowledge, /第2章 状态追加/);
  assert.match(settled.hooks[0].note, /旧伏笔备注：缴费单来自上一章。/);
  assert.match(settled.hooks[0].note, /已在第2章 状态追加触碰/);
  assert.match(settled.resources[0].note, /旧资源备注：缴费单原件在林澈口袋。/);
  assert.match(settled.resources[0].note, /在第2章 状态追加出现或被使用/);
});

test('settlement report keeps generated fields on one markdown line', () => {
  const report = formatSettlement({
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
  });

  assert.doesNotMatch(report, /^## Fake/m);
  assert.doesNotMatch(report, /^- fake/m);
  assert.match(report, /^Chapter: 第1章 ## Fake Chapter$/m);
  assert.match(report, /^- 林澈 ## Fake Character: 知道缴费单 - fake knowledge$/m);
});

test('project metrics and mixed-language length counting are stable', () => {
  const project = normalizeProject({
    ...createDefaultProject(),
    chapters: [
      { title: 'A', body: '林澈 saw 2 doors.', plan: '', audit: '', summary: '', status: 'draft', settledAt: 'now' },
      { title: 'B', body: '许闻 opened one door.', plan: '', audit: '', summary: '', status: 'draft' }
    ]
  });
  const metrics = deriveProjectMetrics(project);
  assert.equal(metrics.chapters, 2);
  assert.equal(metrics.settledChapters, 1);
  assert.ok(countTextLength('林澈 saw 2 doors.', 'zh') >= 4);
});
