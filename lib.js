import crypto from 'node:crypto';

export const PROJECT_SCHEMA_VERSION = 2;

export const MIN_TARGET_WORDS = 300;
export const MAX_TARGET_WORDS = 20_000;

export const VALID_HOOK_STATUSES = ['open', 'progressing', 'deferred', 'resolved'];

export const KNOWN_TASKS = new Set([
  'plan',
  'draft',
  'audit',
  'revise',
  'brainstorm',
  'style',
  'context',
  'settle'
]);

export const DEFAULT_PROJECT = deepFreeze(createDefaultProject());

export function createId() {
  return crypto.randomBytes(6).toString('hex');
}

export function createDefaultProject() {
  const protagonistId = createId();
  const mentorId = createId();
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    title: 'Untitled Novel',
    genre: '都市奇幻',
    logline: '一个普通人发现城市暗处存在只对少数人显形的规则，并被迫在真相与日常之间做选择。',
    protagonist: '林澈',
    targetWords: 2200,
    language: 'zh',
    authorIntent: '写一部节奏清楚、人物动机扎实、伏笔有回收的长篇小说。',
    currentFocus: '让主角面对第一个不可逆选择，同时埋下长期敌人的线索。',
    storyBible: '世界表面正常，隐藏规则通过契约、代价和记忆裂缝运作。超自然力量必须付出明确成本。',
    notes: '保持对话自然，避免用总结代替戏剧化场面。',
    bookRules: '力量必须有代价；角色不能知道自己未亲历或未被告知的信息；伏笔至少每三章推进一次。',
    bannedPatterns: '命运的齿轮、无法想象、某种意义上、毋庸置疑、不言而喻、仿佛整个世界、深深地吸了一口气',
    characters: [
      {
        id: protagonistId,
        name: '林澈',
        role: '主角',
        desire: '保住妹妹的普通生活',
        conflict: '越接近真相，越难维持普通身份',
        secret: '童年记忆被人改写过',
        lastSeen: '开篇前',
        knowledge: '只知道现实出现了无法解释的裂缝'
      },
      {
        id: mentorId,
        name: '许闻',
        role: '引路人',
        desire: '找到规则漏洞',
        conflict: '不能完全说出自己知道的事',
        secret: '曾经失败地救过上一任契约者',
        lastSeen: '开篇前',
        knowledge: '知道规则存在，但隐瞒了部分代价'
      }
    ],
    hooks: [
      {
        id: createId(),
        text: '妹妹书包里出现一张未来日期的医院缴费单',
        status: 'open',
        plantedIn: '第1章',
        payoffBy: '第4章',
        note: '与家庭线和代价规则有关'
      },
      {
        id: createId(),
        text: '电梯里第十三层按钮只在午夜后出现',
        status: 'progressing',
        plantedIn: '第1章',
        payoffBy: '第3章',
        note: '作为隐藏空间入口'
      }
    ],
    outline: [
      {
        id: createId(),
        title: '异常入口',
        summary: '主角第一次看到隐藏规则，误以为只是压力导致的幻觉。'
      },
      {
        id: createId(),
        title: '代价确认',
        summary: '一次小胜利带来明确代价，主角意识到规则真实存在。'
      },
      {
        id: createId(),
        title: '第一次交易',
        summary: '主角主动使用规则救人，同时让敌对势力注意到自己。'
      }
    ],
    timeline: [
      {
        id: createId(),
        source: '',
        chapterId: '',
        chapter: '前史',
        event: '林澈的部分童年记忆被改写。',
        consequence: '主角对异常有模糊熟悉感，但无法解释来源。'
      }
    ],
    resources: [
      {
        id: createId(),
        owner: '林澈',
        item: '未来日期的医院缴费单',
        quantity: '1',
        status: '异常物证',
        note: '不得随意丢失，后续应验证来源'
      }
    ],
    arcs: [
      {
        id: createId(),
        character: '林澈',
        start: '只想维持普通生活',
        current: '被迫承认异常正在逼近家人',
        target: '主动理解并利用规则',
        pressure: '保护妹妹与追查真相互相冲突'
      },
      {
        id: createId(),
        character: '许闻',
        start: '隐瞒关键信息的引路人',
        current: '试图阻止林澈过早接触真相',
        target: '承认失败并交出选择权',
        pressure: '愧疚和自保让他说话不完整'
      }
    ],
    chapters: [],
    styleProfile: '',
    versionToken: createId(),
    updatedAt: new Date().toISOString()
  };
}

export function normalizeProject(input = {}) {
  const base = createDefaultProject();
  const merged = { ...base, ...(isPlainObject(input) ? input : {}) };
  merged.schemaVersion = PROJECT_SCHEMA_VERSION;
  merged.title = asString(merged.title, base.title);
  merged.genre = asString(merged.genre, base.genre);
  merged.logline = asString(merged.logline, base.logline);
  merged.protagonist = asString(merged.protagonist, base.protagonist);
  merged.targetWords = clampInteger(merged.targetWords, MIN_TARGET_WORDS, MAX_TARGET_WORDS, base.targetWords);
  merged.language = merged.language === 'en' ? 'en' : 'zh';
  merged.authorIntent = asString(merged.authorIntent, base.authorIntent);
  merged.currentFocus = asString(merged.currentFocus, base.currentFocus);
  merged.storyBible = asString(merged.storyBible, base.storyBible);
  merged.notes = asString(merged.notes, '');
  merged.bookRules = asString(merged.bookRules, base.bookRules);
  merged.bannedPatterns = asString(merged.bannedPatterns, base.bannedPatterns);
  merged.styleProfile = asString(merged.styleProfile, '');
  merged.characters = normalizeList(merged.characters, normalizeCharacter, 'character');
  merged.hooks = normalizeList(merged.hooks, normalizeHook, 'hook');
  merged.outline = normalizeList(merged.outline, normalizeOutlineNode, 'outline');
  merged.timeline = normalizeList(merged.timeline, normalizeTimelineEvent, 'timeline');
  merged.resources = normalizeList(merged.resources, normalizeResource, 'resource');
  merged.arcs = normalizeList(merged.arcs, normalizeArc, 'arc');
  merged.chapters = normalizeList(merged.chapters, normalizeChapter, 'chapter');
  merged.versionToken = asString(isPlainObject(input) ? input.versionToken : '', '');
  merged.updatedAt = asString(merged.updatedAt, base.updatedAt).trim() || base.updatedAt;
  return merged;
}

export function buildPrompt(task, project, payload = {}) {
  payload = isPlainObject(payload) ? payload : {};
  const normalized = normalizeProject(project);
  const context = buildContextPacket(normalized, payload.chapterId || payload.chapterNumber);
  if (task === 'plan') {
    return [
      '你是严谨的长篇小说章节策划助手。请输出下一章计划。',
      '输出结构必须包含：章节目标、读者承诺、开场场面、三段推进、冲突升级、伏笔处理、状态变更、结尾钩子、必须避免。',
      context,
      `额外指令：${payload.instruction || normalized.currentFocus || '按当前焦点推进。'}`
    ].join('\n\n');
  }
  if (task === 'draft') {
    return [
      '你是小说代笔助手。根据章节计划写正文。',
      '要求：场景化、对白自然、动机清楚、不得用设定摘要代替行动、结尾必须留下可承接的具体信息。',
      `目标长度：约 ${normalized.targetWords} ${normalized.language === 'zh' ? '字' : 'words'}`,
      context,
      `章节计划：\n${payload.plan || '按当前焦点写下一章。'}`
    ].join('\n\n');
  }
  if (task === 'audit') {
    return [
      '你是小说连续性和风格审校。请输出质量评分、严重问题、一般问题和可执行修改建议。',
      '重点检查：人物动机、信息边界、资源/道具、伏笔、节奏、AI腔、重复表达、场景锚点、结尾承接。',
      context,
      `章节计划：\n${payload.plan || '未提供'}`,
      `待审稿：\n${payload.text || ''}`
    ].join('\n\n');
  }
  if (task === 'revise') {
    return [
      '你是小说修订助手。请根据审校意见重写正文，只输出修订后的正文，不要输出解释说明。',
      context,
      `审校意见：\n${payload.audit || ''}`,
      `原文：\n${payload.text || ''}`
    ].join('\n\n');
  }
  if (task === 'brainstorm') {
    return [
      '你是小说开发编辑。请基于项目资料给出下一步创作建议，覆盖人物、冲突、伏笔、世界规则和章节节奏。',
      context
    ].join('\n\n');
  }
  if (task === 'settle') {
    return [
      '你是长篇小说状态沉淀助手。请从章节正文提取：章节摘要、时间线事件、人物位置/知识变化、资源变化、伏笔推进。',
      context,
      `章节正文：\n${payload.text || ''}`
    ].join('\n\n');
  }
  return `${context}\n\n任务：${payload.instruction || '辅助写作'}`;
}

export function offlineAssist(task, project, payload = {}) {
  payload = isPlainObject(payload) ? payload : {};
  const normalized = normalizeProject(project);
  if (task === 'plan') return offlinePlan(normalized, payload);
  if (task === 'draft') return offlineDraft(normalized, payload);
  if (task === 'audit') return offlineAudit(normalized, payload.text || '', payload);
  if (task === 'revise') return offlineRevise(payload.text || '', payload.audit || offlineAudit(normalized, payload.text || '', payload));
  if (task === 'brainstorm') return offlineBrainstorm(normalized);
  if (task === 'style') return analyzeStyle(payload.text || '');
  if (task === 'context') return buildContextPacket(normalized, payload.chapterId || payload.chapterNumber);
  if (task === 'settle') return formatSettlement(settleChapterState(normalized, payload.chapter || payload));
  return '没有可用的离线任务。';
}

export function buildContextPacket(project, chapterRef) {
  const normalized = normalizeProject(project);
  const chapterNumber = resolveChapterNumber(normalized, chapterRef);
  const outline = normalized.outline[chapterNumber - 1] || normalized.outline.at(-1) || {};
  const priorChapter = resolvePriorChapter(normalized, chapterNumber);
  const activeHooks = normalized.hooks.filter((hook) => hook.status !== 'resolved').slice(0, 6);
  const activeResources = normalized.resources.filter((resource) => resource.status !== 'spent').slice(0, 8);
  const currentArcs = normalized.arcs.slice(0, 8);
  const recentTimeline = normalized.timeline.slice(-8);
  return [
    '# Context Packet',
    '',
    `Book: ${normalized.title}`,
    `Genre: ${normalized.genre}`,
    `Language: ${normalized.language}`,
    `Target length: ${normalized.targetWords}`,
    `Next chapter: ${chapterNumber}`,
    `Outline beat: ${outline.title || '未设置'} - ${outline.summary || '未设置'}`,
    `Author intent: ${normalized.authorIntent}`,
    `Current focus: ${normalized.currentFocus}`,
    `Book rules: ${normalized.bookRules}`,
    `Banned patterns: ${normalized.bannedPatterns}`,
    `Story bible: ${normalized.storyBible}`,
    `Style profile: ${normalized.styleProfile || '未设置'}`,
    '',
    '## Characters',
    ...(normalized.characters.length ? normalized.characters.map(formatCharacterLine) : ['- 未设置']),
    '',
    '## Open Hooks',
    ...(activeHooks.length ? activeHooks.map(formatHookLine) : ['- 暂无开放伏笔']),
    '',
    '## Resources',
    ...(activeResources.length ? activeResources.map(formatResourceLine) : ['- 暂无资源记录']),
    '',
    '## Emotional Arcs',
    ...(currentArcs.length ? currentArcs.map(formatArcLine) : ['- 暂无情感弧线']),
    '',
    '## Recent Timeline',
    ...(recentTimeline.length ? recentTimeline.map(formatTimelineLine) : ['- 暂无时间线']),
    '',
    '## Prior Chapter',
    priorChapter ? `${priorChapter.title || '未命名'}: ${priorChapter.summary || summarizeText(priorChapter.body, normalized.language)}` : '暂无上一章',
    '',
    '## Working Notes',
    normalized.notes || '无'
  ].join('\n');
}

export function offlinePlan(project, payload = {}) {
  payload = isPlainObject(payload) ? payload : {};
  project = normalizeProject(project);
  const chapterNumber = resolveChapterNumber(project, payload.chapterId || payload.chapterNumber);
  const outline = project.outline[chapterNumber - 1] || project.outline.at(-1) || {};
  const activeHooks = project.hooks.filter((hook) => hook.status !== 'resolved').slice(0, 3);
  const lead = project.characters.find((character) => character.name === project.protagonist) || project.characters[0];
  const pressure = project.arcs.find((arc) => arc.character === project.protagonist)?.pressure || lead?.conflict || project.currentFocus;
  const ally = project.characters.find((character) => character.name !== project.protagonist) || {};
  const prior = project.chapters[chapterNumber - 2];
  return [
    `# 第${chapterNumber}章计划：${outline.title || '新的推进'}`,
    '',
    `章节目标：围绕“${project.currentFocus || outline.summary || project.logline}”推进，让${project.protagonist}在“${pressure}”下做出可追踪选择。`,
    `读者承诺：本章至少兑现一个旧线索的新信息，并制造一个必须在下一章处理的后果。`,
    `承接上一章：${prior?.summary || prior?.title || '这是开篇或新的起点，需要先建立清晰场景和人物压力。'}`,
    '',
    '开场场面：从一个可看见、可听见或可触摸的异常开始，让角色先行动再解释。',
    '',
    '三段推进：',
    `1. ${project.protagonist}带着“${lead?.desire || '明确目标'}”进入场景，${ally.name || '关键配角'}提出不同判断。`,
    `2. 旧伏笔或资源发生变化，迫使主角在安全和真相之间取舍。`,
    `3. 主角做出选择，获得局部答案，但付出一个能写进时间线的代价。`,
    '',
    '伏笔处理：',
    ...(activeHooks.length ? activeHooks.map((hook) => `- ${hook.text}：状态从 ${hook.status} 推进一级，新增一个可验证细节，不直接完全解释。`) : ['- 新增一个可在三章内回收的物件、误会或信息差。']),
    '',
    '状态变更：',
    '- 时间线：记录主角选择和直接后果。',
    '- 人物知识：标记谁亲眼看到、谁只是听说。',
    '- 资源：若使用物证、钱、武器、契约或权限，必须记录数量或状态。',
    '',
    '结尾钩子：用具体动作、物件变化或一句反常信息结束。',
    '',
    '必须避免：不要用大段设定说明替代场景；不要让角色知道自己未亲历的信息；不要用空泛 AI 腔句式收尾。'
  ].join('\n');
}

export function offlineDraft(project, payload = {}) {
  payload = isPlainObject(payload) ? payload : {};
  project = normalizeProject(project);
  if (project.language === 'en') return offlineDraftEn(project, payload);
  return offlineDraftZh(project, payload);
}

export function offlineDraftZh(project, payload = {}) {
  payload = isPlainObject(payload) ? payload : {};
  project = normalizeProject(project);
  const chapterNumber = resolveChapterNumber(project, payload.chapterId || payload.chapterNumber);
  const plan = payload.plan || offlinePlan(project, payload);
  const outline = project.outline[chapterNumber - 1] || project.outline.at(-1) || {};
  const protagonist = project.protagonist || project.characters[0]?.name || '主角';
  const counterpart = project.characters.find((character) => character.name !== protagonist) || { name: '同伴', role: '同伴', conflict: '不愿冒险' };
  const hook = project.hooks.find((item) => item.status !== 'resolved');
  const resource = project.resources[0];
  const sceneObject = resource?.item || hook?.text || '那件没有解释的异常物';
  const pressure = project.arcs.find((arc) => arc.character === protagonist)?.pressure || project.currentFocus;
  const setting = pickSetting(project.genre, hook?.text);
  const consequence = hook?.payoffBy ? `最迟到${hook.payoffBy}必须给出更明确答案` : '后续必须验证来源';
  return [
    `# 第${chapterNumber}章 ${outline.title || '新的推进'}`,
    '',
    `${setting}的声音先变了。`,
    '',
    `${protagonist}站在原地，没有马上去碰${sceneObject}。他已经学会一件事：这个城市里最危险的东西往往不急着伤人，它们只是安静地等你承认自己看见了。`,
    '',
    `“别再往前。”${counterpart.name}压低声音说。`,
    '',
    `${protagonist}回头看了${counterpart.role || '对方'}一眼。“你每次都让我停下，可你从来不告诉我停下以后会发生什么。”`,
    '',
    `${counterpart.name}的表情僵了一下。这个停顿比任何解释都清楚。${protagonist}知道自己猜对了：对方不是不知道答案，而是不敢把答案放到明面上。`,
    '',
    `他把${sceneObject}放到灯下。表面没有血，也没有烧焦的痕迹，只有一处细小到几乎看不见的折痕。折痕的位置和${project.storyBible.slice(0, 28)}有关，像有人故意留给他一把不能直接使用的钥匙。`,
    '',
    `“如果我现在查下去，”${protagonist}说，“代价会落到谁身上？”`,
    '',
    `${counterpart.name}没有回答。`,
    '',
    `沉默把答案推到了两个人中间。${pressure}这件事不再是一个抽象的担忧，而是变成了下一分钟就要被确认的选择。${protagonist}忽然明白，所谓规则从来不靠恐吓运行，它只负责把每个人最舍不得的东西摆到秤上。`,
    '',
    `他伸手按住${sceneObject}。`,
    '',
    '灯光短促地闪了一下。远处传来玻璃裂开的声音，像某个被藏起来的房间终于被打开。与此同时，手机收到一条没有号码的短信：',
    '',
    `“你已经替${counterpart.name}还了一次债。”`,
    '',
    `${protagonist}抬起头。${counterpart.name}的脸色在那一刻彻底变了。`,
    '',
    `本章没有给出完整答案，只确认了两件事：${sceneObject}不是偶然出现的；以及${consequence}。`
  ].join('\n');
}

export function offlineDraftEn(project, payload = {}) {
  payload = isPlainObject(payload) ? payload : {};
  project = normalizeProject(project);
  const chapterNumber = resolveChapterNumber(project, payload.chapterId || payload.chapterNumber);
  const outline = project.outline[chapterNumber - 1] || project.outline.at(-1) || {};
  const protagonist = project.protagonist || project.characters[0]?.name || 'the protagonist';
  const counterpart = project.characters.find((character) => character.name !== protagonist) || { name: 'the guide', role: 'guide' };
  const hook = project.hooks.find((item) => item.status !== 'resolved');
  const object = project.resources[0]?.item || hook?.text || 'the unexplained object';
  return [
    `# Chapter ${chapterNumber}: ${outline.title || 'The Next Pressure'}`,
    '',
    `The first warning was not a sound. It was the way everyone else in the room stopped noticing ${object}.`,
    '',
    `${protagonist} kept one hand in his pocket and watched ${counterpart.name} watch the door. The guide had the look of someone counting exits and finding one missing.`,
    '',
    `"Tell me the cost before I touch it," ${protagonist} said.`,
    '',
    `${counterpart.name} did not answer quickly enough.`,
    '',
    `That delay did more damage than a lie. It told ${protagonist} that the rules were already moving, and that someone had decided he would learn them one bruise at a time.`,
    '',
    `He set ${object} under the light. A mark appeared across its surface, too deliberate to be damage and too fresh to be old. Somewhere beyond the wall, glass cracked.`,
    '',
    `A message arrived without a sender: "You just paid one of ${counterpart.name}'s debts."`,
    '',
    `${counterpart.name}'s face changed, and the next question became impossible to postpone.`
  ].join('\n');
}

export function offlineAudit(project, text = '', payload = {}) {
  payload = isPlainObject(payload) ? payload : {};
  project = normalizeProject(project);
  const normalized = asString(text, '').trim();
  const findings = [];
  const metrics = analyzeDraftQuality(project, normalized, payload.plan || '');
  if (!normalized) {
    findings.push(makeFinding('critical', '正文为空', '先生成或粘贴章节正文，再进行审校。'));
  }
  if (metrics.lengthRatio < 0.45) {
    findings.push(makeFinding('major', '篇幅明显偏短', `当前约 ${metrics.length}，低于目标 ${metrics.target} 的 45%。建议增加一场行动阻力和一段选择后果。`));
  }
  if (metrics.lengthRatio > 1.8) {
    findings.push(makeFinding('major', '篇幅明显偏长', `当前约 ${metrics.length}，超过目标 ${metrics.target} 的 180%。建议拆章或压缩解释段落。`));
  }
  if (metrics.aiTellHits.length) {
    findings.push(makeFinding('minor', '存在常见 AI 腔表达', `替换或场景化这些表达：${metrics.aiTellHits.join('、')}。`));
  }
  if (metrics.usedCharacters < Math.min(2, project.characters.length)) {
    findings.push(makeFinding('minor', '人物互动不足', '本章出现的核心人物较少，若不是独角戏章节，建议加入一个能制造立场冲突的角色。'));
  }
  if (metrics.activeHooks > 0 && metrics.touchedHooks === 0) {
    findings.push(makeFinding('major', '未触碰开放伏笔', `当前仍有 ${metrics.activeHooks} 个未解决伏笔。建议至少推进其中一个，哪怕只新增一个可验证细节。`));
  }
  if (metrics.dialogueTurns < 2) {
    findings.push(makeFinding('minor', '对白偏少', '建议加入带目标冲突的对白，让信息通过角色博弈出现。'));
  }
  if (metrics.sceneAnchors < 2) {
    findings.push(makeFinding('minor', '场景锚点不足', '建议加入可视、可听、可触的具体场景信息，避免漂浮叙述。'));
  }
  if (metrics.expositionRatio > 0.42) {
    findings.push(makeFinding('major', '解释比例偏高', '抽象解释和心理总结偏多。建议把至少一段解释改成动作、物件变化或对白冲突。'));
  }
  if (metrics.repeatedSentences.length) {
    findings.push(makeFinding('minor', '句子重复', `这些句子重复出现：${metrics.repeatedSentences.slice(0, 3).join(' / ')}。`));
  }
  if (!metrics.hasCompleteEnding) {
    findings.push(makeFinding('minor', '结尾不完整', '章节末尾最好落在完整句，并带一个可承接的动作、信息或选择。'));
  }
  if (!findings.length) {
    findings.push(makeFinding('info', '未发现明显结构问题', '可重点人工检查语言质感、人物声音差异和下一章承接点。'));
  }
  return formatAudit(metrics, findings);
}

export function analyzeDraftQuality(project, text = '', plan = '') {
  project = normalizeProject(project);
  const draftText = asString(text, '');
  const length = countTextLength(draftText, project.language);
  const target = Number(project.targetWords) || 2200;
  const banned = parseBannedPatterns(project.bannedPatterns);
  const aiTellWords = [...new Set([...banned, '命运的齿轮', '无法想象', '某种意义上', '毋庸置疑', '不言而喻', '仿佛整个世界', '深深地吸了一口气'])];
  const aiTellHits = aiTellWords.filter((word) => word && draftText.includes(word));
  const usedCharacters = project.characters.filter((character) => character.name && draftText.includes(character.name)).length;
  const activeHooksList = project.hooks.filter((hook) => hook.status !== 'resolved');
  const touchedHooks = activeHooksList.filter((hook) => hookTouched(draftText, hook.text)).length;
  const dialogueTurns = (draftText.match(/[“"][^”"\n]{2,}[”"]/g) || []).length;
  const sceneAnchors = countSceneAnchors(draftText);
  const sentences = splitSentences(draftText);
  const repeatedSentences = findRepeated(sentences);
  const expositionRatio = estimateExpositionRatio(sentences);
  const planKeywords = extractKeywords(plan).slice(0, 12);
  const planHits = planKeywords.filter((keyword) => draftText.includes(keyword)).length;
  const hasCompleteEnding = !draftText || /[。！？.!?]\s*$/.test(draftText.trim());
  const score = clampNumber(
    100
      - aiTellHits.length * 4
      - Math.max(0, 2 - dialogueTurns) * 6
      - Math.max(0, 2 - sceneAnchors) * 5
      - repeatedSentences.length * 5
      - (activeHooksList.length && !touchedHooks ? 10 : 0)
      - (expositionRatio > 0.42 ? 10 : 0)
      - (!hasCompleteEnding ? 4 : 0)
      - lengthPenalty(length, target),
    0,
    100,
    70
  );
  return {
    score,
    length,
    target,
    lengthRatio: target ? length / target : 1,
    aiTellHits,
    usedCharacters,
    activeHooks: activeHooksList.length,
    touchedHooks,
    dialogueTurns,
    sceneAnchors,
    repeatedSentences,
    expositionRatio,
    planKeywords,
    planHits,
    hasCompleteEnding
  };
}

export function offlineRevise(text = '', audit = '') {
  if (!asString(text, '').trim()) return '原文为空，无法修订。';
  const replacements = [
    ['命运的齿轮开始转动', '门后的脚步声越来越近'],
    ['命运的齿轮', '正在逼近的后果'],
    ['无法想象', '一时找不到合适的解释'],
    ['某种意义上', '换句话说'],
    ['毋庸置疑', '这件事已经很难否认'],
    ['不言而喻', '没人把这句话说出口'],
    ['仿佛整个世界', '眼前的灯光和墙面'],
    ['深深地吸了一口气', '把呼吸压慢']
  ];
  let revised = asString(text, '').trim();
  for (const [from, to] of replacements) revised = revised.split(from).join(to);
  if (/对白偏少|人物互动不足/.test(audit) && !/[“"][^”"\n]{2,}[”"]/.test(revised)) {
    revised += '\n\n“你到底隐瞒了什么？”\n\n对方没有立刻回答，这个停顿让新的问题变得更具体。';
  }
  if (/结尾不完整/.test(audit) && !/[。！？.!?]\s*$/.test(revised)) {
    revised += '。';
  }
  if (/未触碰开放伏笔/.test(audit)) {
    revised += '\n\n临走前，那个旧线索再次出现，只是这一次多了一个足以改变判断的细节。';
  }
  return revised;
}

export function offlineBrainstorm(project) {
  project = normalizeProject(project);
  const unresolved = project.hooks.filter((hook) => hook.status !== 'resolved');
  const character = project.characters[0] || { name: project.protagonist, conflict: '内部矛盾' };
  const resource = project.resources[0]?.item || '关键物证';
  return [
    '# 创作建议',
    '',
    `1. 让${character.name}在下一章同时面对外部压力和“${character.conflict || '自身矛盾'}”，避免单纯解谜。`,
    `2. 把“${project.currentFocus || project.logline}”转成一个必须当场选择的行动，不只停留在想法。`,
    `3. 本章至少推进一个开放伏笔：${unresolved[0]?.text || '新增一个三章内能回收的小伏笔'}。`,
    `4. 让${resource}发生可记录的状态变化，写入资源账本。`,
    '5. 让配角提出一个合理但危险的方案，逼主角表态。',
    '6. 场景信息按“看到的异常 -> 角色误判 -> 代价显现 -> 修正行动”展开。',
    '7. 结尾不要解释答案，给出更精确的问题。',
    '8. 审稿时重点检查角色是否知道了不该知道的信息。',
    '9. 如果节奏变慢，删掉抽象心理总结，改成外部动作和对白。',
    '10. 写完后执行 Settle，把时间线、人物知识、资源和伏笔状态沉淀下来。'
  ].join('\n');
}

export function analyzeStyle(text = '') {
  const trimmed = asString(text, '').trim();
  if (!trimmed) return '没有文本可分析。';
  const sentences = splitSentences(trimmed);
  const lengths = sentences.map((sentence) => countTextLength(sentence, hasCjk(sentence) ? 'zh' : 'en'));
  const avg = lengths.length ? Math.round(lengths.reduce((sum, value) => sum + value, 0) / lengths.length) : 0;
  const dialogueTurns = (trimmed.match(/[“"][^”"\n]{2,}[”"]/g) || []).length;
  const paragraphCount = trimmed.split(/\n\s*\n/).filter(Boolean).length;
  const buckets = {
    short: lengths.filter((value) => value <= 12).length,
    medium: lengths.filter((value) => value > 12 && value <= 32).length,
    long: lengths.filter((value) => value > 32).length
  };
  const topTerms = frequentTerms(trimmed).slice(0, 10).join('、') || '样本不足';
  const actionRatio = estimateActionRatio(sentences);
  return [
    '# 风格指纹',
    '',
    `句子数：${sentences.length}`,
    `平均句长：${avg}`,
    `短/中/长句：${buckets.short}/${buckets.medium}/${buckets.long}`,
    `段落数：${paragraphCount}`,
    `对白轮次：${dialogueTurns}`,
    `动作句比例：${Math.round(actionRatio * 100)}%`,
    `高频词：${topTerms}`,
    '',
    '建议：后续生成时保持相近句长分布；对白密度不要突然变化；避免连续三段都是解释或心理总结。'
  ].join('\n');
}

export function settleChapterState(project, chapterInput = {}) {
  const normalized = normalizeProject(project);
  const chapter = normalizeChapter(isPlainObject(chapterInput) ? chapterInput : {});
  const body = chapter.body || chapter.text || '';
  const chapterNumber = resolveChapterNumber(normalized, chapter.id || chapter.number);
  const title = chapter.title || `第${chapterNumber}章`;
  const summary = summarizeText(body, normalized.language) || chapter.summary;
  const touchedHooks = normalized.hooks.filter((hook) => hook.status !== 'resolved' && hookTouched(body, hook.text));
  const usedCharacters = normalized.characters.filter((character) => character.name && body.includes(character.name));
  const resourceHits = normalized.resources.filter((resource) => resource.item && body.includes(resource.item));
  const settlement = {
    chapterNumber,
    title,
    summary,
    timelineEvent: {
      id: createId(),
      source: 'settlement',
      chapterId: chapter.id,
      chapter: title,
      event: summary || `${title} 已完成但缺少摘要。`,
      consequence: touchedHooks.length ? `推进伏笔：${touchedHooks.map((hook) => hook.text).join('；')}` : '需要人工补充直接后果。'
    },
    characterUpdates: usedCharacters.map((character) => ({
      id: character.id,
      name: character.name,
      lastSeen: title,
      knowledge: summarizeCharacterKnowledge(body, character.name, title)
    })),
    hookUpdates: touchedHooks.map((hook) => ({
      id: hook.id,
      text: hook.text,
      from: hook.status,
      to: hook.status === 'open' ? 'progressing' : hook.status,
      note: `已在${title}触碰，建议记录新增证据。`
    })),
    resourceUpdates: resourceHits.map((resource) => ({
      id: resource.id,
      item: resource.item,
      status: resource.status,
      note: `在${title}出现或被使用，请核对数量/状态。`
    }))
  };
  return settlement;
}

export function applySettlement(project, chapterInput = {}) {
  const normalized = normalizeProject(project);
  const incomingChapter = normalizeChapter(isPlainObject(chapterInput) ? chapterInput : {});
  const chapterIndex = normalized.chapters.findIndex((chapter) => chapter.id === incomingChapter.id);
  const existingChapter = chapterIndex >= 0 ? normalized.chapters[chapterIndex] : {};
  const chapterForSettlement = {
    ...existingChapter,
    id: incomingChapter.id || existingChapter.id,
    title: incomingChapter.title || existingChapter.title,
    body: firstNonBlank(incomingChapter.body, existingChapter.body, ''),
    plan: incomingChapter.plan || existingChapter.plan || '',
    audit: incomingChapter.audit || existingChapter.audit || '',
    summary: incomingChapter.summary || existingChapter.summary || '',
    status: incomingChapter.status || existingChapter.status || 'draft',
    createdAt: incomingChapter.createdAt || existingChapter.createdAt,
    settledAt: incomingChapter.settledAt || existingChapter.settledAt
  };
  if (!String(chapterForSettlement.body || '').trim()) {
    const error = new Error('Cannot settle a chapter without body text.');
    error.status = 400;
    throw error;
  }
  const settlement = settleChapterState(normalized, chapterForSettlement);
  const settledAt = new Date().toISOString();
  const settledChapter = {
    id: chapterForSettlement.id || createId(),
    title: chapterForSettlement.title || settlement.title,
    body: chapterForSettlement.body || '',
    plan: chapterForSettlement.plan || '',
    audit: chapterForSettlement.audit || '',
    summary: settlement.summary,
    status: chapterForSettlement.status || 'draft',
    createdAt: chapterForSettlement.createdAt || settledAt,
    settledAt
  };
  if (chapterIndex >= 0) {
    normalized.chapters[chapterIndex] = settledChapter;
  } else {
    normalized.chapters.push(settledChapter);
  }
  upsertSettlementTimelineEvent(normalized, settlement, existingChapter, settledChapter);
  for (const update of settlement.characterUpdates) {
    const character = normalized.characters.find((item) => item.id === update.id);
    if (character) {
      character.lastSeen = update.lastSeen;
      character.knowledge = mergeLedgerText(character.knowledge, update.knowledge);
    }
  }
  for (const update of settlement.hookUpdates) {
    const hook = normalized.hooks.find((item) => item.id === update.id);
    if (hook) {
      hook.status = update.to;
      hook.note = mergeLedgerText(hook.note, update.note);
    }
  }
  for (const update of settlement.resourceUpdates) {
    const resource = normalized.resources.find((item) => item.id === update.id);
    if (resource) resource.note = mergeLedgerText(resource.note, update.note);
  }
  normalized.updatedAt = new Date().toISOString();
  return { project: normalized, settlement };
}

export function formatSettlement(settlement) {
  return [
    '# Chapter Settlement',
    '',
    `Chapter: ${formatInlineText(settlement.title, '未命名章节')}`,
    `Summary: ${formatInlineText(settlement.summary, '未提取到摘要')}`,
    '',
    '## Timeline',
    `- ${formatInlineText(settlement.timelineEvent?.event, '未生成')}`,
    `  Consequence: ${formatInlineText(settlement.timelineEvent?.consequence, '未生成')}`,
    '',
    '## Character Updates',
    ...(settlement.characterUpdates?.length
      ? settlement.characterUpdates.map((item) => `- ${formatInlineText(item.name, '未命名')}: ${formatInlineText(item.knowledge, '未记录')}`)
      : ['- 未识别到人物变化']),
    '',
    '## Hook Updates',
    ...(settlement.hookUpdates?.length
      ? settlement.hookUpdates.map((item) => `- ${formatInlineText(item.text, '未命名伏笔')}: ${formatInlineText(item.from, '未知')} -> ${formatInlineText(item.to, '未知')}`)
      : ['- 未识别到伏笔推进']),
    '',
    '## Resource Updates',
    ...(settlement.resourceUpdates?.length
      ? settlement.resourceUpdates.map((item) => `- ${formatInlineText(item.item, '未命名资源')}: ${formatInlineText(item.note, '未记录')}`)
      : ['- 未识别到资源变化'])
  ].join('\n');
}

export function deriveProjectMetrics(project) {
  const normalized = normalizeProject(project);
  const chapterLengths = normalized.chapters.map((chapter) => countTextLength(chapter.body, normalized.language));
  const totalLength = chapterLengths.reduce((sum, value) => sum + value, 0);
  const openHooks = normalized.hooks.filter((hook) => hook.status !== 'resolved').length;
  const settledChapters = normalized.chapters.filter((chapter) => chapter.settledAt).length;
  return {
    chapters: normalized.chapters.length,
    totalLength,
    averageLength: chapterLengths.length ? Math.round(totalLength / chapterLengths.length) : 0,
    targetWords: normalized.targetWords,
    openHooks,
    resolvedHooks: normalized.hooks.length - openHooks,
    characters: normalized.characters.length,
    timelineEvents: normalized.timeline.length,
    resources: normalized.resources.length,
    arcs: normalized.arcs.length,
    settledChapters,
    unsettledChapters: normalized.chapters.length - settledChapters
  };
}

export function exportMarkdown(project) {
  const normalized = normalizeProject(project);
  const metrics = deriveProjectMetrics(normalized);
  const parts = [
    `# ${formatMarkdownHeading(normalized.title, 'Untitled Novel')}`,
    '',
    `类型：${formatInlineText(normalized.genre, '未设定')}`,
    `一句话：${formatInlineText(normalized.logline, '未设定')}`,
    `目标长度：${normalized.targetWords}`,
    '',
    '## 创作意图',
    '',
    normalized.authorIntent || '',
    '',
    '## 当前焦点',
    '',
    normalized.currentFocus || '',
    '',
    '## 故事圣经',
    '',
    normalized.storyBible || '',
    '',
    '## 规则',
    '',
    normalized.bookRules || '',
    '',
    '## 指标',
    '',
    `- 章节数：${metrics.chapters}`,
    `- 总长度：${metrics.totalLength}`,
    `- 平均章节长度：${metrics.averageLength}`,
    `- 开放伏笔：${metrics.openHooks}`,
    `- 已沉淀章节：${metrics.settledChapters}`,
    '',
    '## 人物',
    '',
    ...normalized.characters.map(formatCharacterLine),
    '',
    '## 伏笔',
    '',
    ...normalized.hooks.map(formatHookLine),
    '',
    '## 资源账本',
    '',
    ...normalized.resources.map(formatResourceLine),
    '',
    '## 情感弧线',
    '',
    ...normalized.arcs.map(formatArcLine),
    '',
    '## 时间线',
    '',
    ...normalized.timeline.map(formatTimelineLine),
    '',
    '## 大纲',
    '',
    ...normalized.outline.map((node, index) => `${index + 1}. ${formatInlineText(node.title, '未命名节点')}: ${formatInlineText(node.summary, '未记录')}`),
    '',
    '## 正文',
    ''
  ];
  for (const [index, chapter] of normalized.chapters.entries()) {
    parts.push(`### ${formatMarkdownHeading(chapter.title, `第${index + 1}章`)}`, '');
    if (chapter.summary) parts.push(`> 摘要：${formatInlineText(chapter.summary, '')}`, '');
    parts.push(chapter.body || '', '');
  }
  parts.push('## 章节工作记录', '');
  for (const [index, chapter] of normalized.chapters.entries()) {
    parts.push(`### ${formatMarkdownHeading(chapter.title, `第${index + 1}章`)}`, '');
    if (chapter.plan) parts.push('#### Plan', '', chapter.plan, '');
    if (chapter.audit) parts.push('#### Audit', '', chapter.audit, '');
  }
  return parts.join('\n');
}

export function countTextLength(text = '', language = 'zh') {
  const value = String(text || '').trim();
  if (!value) return 0;
  const cjk = (value.match(/[\u4e00-\u9fff]/g) || []).length;
  const latinWords = (value.replace(/[\u4e00-\u9fff]/g, ' ').match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g) || []).length;
  if (language === 'zh') return cjk + latinWords;
  return latinWords + cjk;
}

function formatAudit(metrics, findings) {
  return [
    '# 审校结果',
    '',
    `质量评分：${Math.round(metrics.score)}/100`,
    `长度：${metrics.length}/${metrics.target}（${Math.round(metrics.lengthRatio * 100)}%）`,
    `对白轮次：${metrics.dialogueTurns}`,
    `场景锚点：${metrics.sceneAnchors}`,
    `开放伏笔触碰：${metrics.touchedHooks}/${metrics.activeHooks}`,
    `解释比例估计：${Math.round(metrics.expositionRatio * 100)}%`,
    '',
    '## 问题',
    '',
    ...findings.map((finding, index) => `${index + 1}. [${finding.severity}] ${finding.title}\n   建议：${finding.suggestion}`)
  ].join('\n');
}

function normalizeList(value, normalizer, idPrefix) {
  if (!Array.isArray(value)) return [];
  const usedIds = new Set();
  return value.map((item, index) => {
    const plain = isPlainObject(item) ? item : {};
    const normalized = normalizer(plain, deterministicId(idPrefix, plain, index));
    if (!normalized.id || usedIds.has(normalized.id)) {
      normalized.id = uniqueDeterministicId(idPrefix, plain, index, usedIds);
    }
    usedIds.add(normalized.id);
    return normalized;
  });
}

function normalizeCharacter(item = {}, fallbackId = deterministicId('character', item, 0)) {
  return {
    id: asId(item.id, fallbackId),
    name: asString(item.name, ''),
    role: asString(item.role, ''),
    desire: asString(item.desire, ''),
    conflict: asString(item.conflict, ''),
    secret: asString(item.secret, ''),
    lastSeen: asString(item.lastSeen, ''),
    knowledge: asString(item.knowledge, '')
  };
}

function normalizeHook(item = {}, fallbackId = deterministicId('hook', item, 0)) {
  const status = VALID_HOOK_STATUSES.includes(item.status) ? item.status : 'open';
  return {
    id: asId(item.id, fallbackId),
    text: asString(item.text, ''),
    status,
    plantedIn: asString(item.plantedIn, ''),
    payoffBy: asString(item.payoffBy, ''),
    note: asString(item.note, '')
  };
}

function normalizeOutlineNode(item = {}, fallbackId = deterministicId('outline', item, 0)) {
  return {
    id: asId(item.id, fallbackId),
    title: asString(item.title, ''),
    summary: asString(item.summary, '')
  };
}

function normalizeTimelineEvent(item = {}, fallbackId = deterministicId('timeline', item, 0)) {
  return {
    id: asId(item.id, fallbackId),
    source: asString(item.source, ''),
    chapterId: asString(item.chapterId, ''),
    chapter: asString(item.chapter, ''),
    event: asString(item.event, ''),
    consequence: asString(item.consequence, '')
  };
}

function normalizeResource(item = {}, fallbackId = deterministicId('resource', item, 0)) {
  return {
    id: asId(item.id, fallbackId),
    owner: asString(item.owner, ''),
    item: asString(item.item, ''),
    quantity: asString(item.quantity, ''),
    status: asString(item.status, ''),
    note: asString(item.note, '')
  };
}

function normalizeArc(item = {}, fallbackId = deterministicId('arc', item, 0)) {
  return {
    id: asId(item.id, fallbackId),
    character: asString(item.character, ''),
    start: asString(item.start, ''),
    current: asString(item.current, ''),
    target: asString(item.target, ''),
    pressure: asString(item.pressure, '')
  };
}

function normalizeChapter(item = {}, fallbackId = deterministicId('chapter', item, 0)) {
  return {
    id: asId(item.id, fallbackId),
    title: asString(item.title, ''),
    body: Object.hasOwn(item, 'body') ? asString(item.body, '') : asString(item.text, ''),
    plan: asString(item.plan, ''),
    audit: asString(item.audit, ''),
    summary: asString(item.summary, ''),
    status: asString(item.status, 'draft'),
    createdAt: asString(item.createdAt, ''),
    settledAt: asString(item.settledAt, '')
  };
}

function formatCharacterLine(character) {
  return `- ${formatInlineText(character.name, '未命名')} / ${formatInlineText(character.role, '角色')}: 目标=${formatInlineText(character.desire, '未设定')}; 冲突=${formatInlineText(character.conflict, '未设定')}; 秘密=${formatInlineText(character.secret, '未设定')}; 最近=${formatInlineText(character.lastSeen, '未记录')}; 知识=${formatInlineText(character.knowledge, '未记录')}`;
}

function formatHookLine(hook) {
  return `- [${formatInlineText(hook.status, 'open')}] ${formatInlineText(hook.text, '未命名伏笔')}（种下：${formatInlineText(hook.plantedIn, '未记录')}；回收：${formatInlineText(hook.payoffBy, '未设定')}；备注：${formatInlineText(hook.note, '无')}）`;
}

function formatResourceLine(resource) {
  return `- ${formatInlineText(resource.owner, '未知持有者')} / ${formatInlineText(resource.item, '未命名资源')} x${formatInlineText(resource.quantity, '?')}: ${formatInlineText(resource.status, '未记录')}；${formatInlineText(resource.note, '无备注')}`;
}

function formatArcLine(arc) {
  return `- ${formatInlineText(arc.character, '未命名')}: ${formatInlineText(arc.start, '起点未设定')} -> ${formatInlineText(arc.current, '当前未设定')} -> ${formatInlineText(arc.target, '目标未设定')}；压力=${formatInlineText(arc.pressure, '未设定')}`;
}

function formatTimelineLine(event) {
  return `- ${formatInlineText(event.chapter, '未记录章节')}: ${formatInlineText(event.event, '未记录事件')}；后果=${formatInlineText(event.consequence, '未记录')}`;
}

function upsertSettlementTimelineEvent(project, settlement, existingChapter = {}, settledChapter = {}) {
  const timelineEvent = {
    ...settlement.timelineEvent,
    source: 'settlement',
    chapterId: settledChapter.id || settlement.timelineEvent.chapterId || existingChapter.id || ''
  };
  const existingIndex = project.timeline.findIndex((event) => isSameSettlementTimelineEvent(event, {
    chapterId: timelineEvent.chapterId,
    priorTitle: existingChapter.title || settlement.title,
    currentTitle: settlement.title,
    priorSummary: existingChapter.summary,
    currentSummary: settlement.timelineEvent.event
  }));
  if (existingIndex >= 0) {
    project.timeline[existingIndex] = {
      ...timelineEvent,
      id: project.timeline[existingIndex].id || timelineEvent.id
    };
    return;
  }
  if (!project.timeline.some((event) => isDuplicateTimelineEvent(event, timelineEvent))) {
    project.timeline.push(timelineEvent);
  }
}

function isSameSettlementTimelineEvent(event, { chapterId, priorTitle, currentTitle, priorSummary, currentSummary }) {
  if (event.source !== 'settlement') return false;
  const eventChapterId = asString(event.chapterId, '').trim();
  if (chapterId && eventChapterId && eventChapterId !== chapterId) return false;
  if (chapterId && eventChapterId === chapterId && isGeneratedSettlementConsequence(event.consequence)) return true;
  if ((event.chapter === priorTitle || event.chapter === currentTitle) && isGeneratedSettlementConsequence(event.consequence)) return true;
  if (priorSummary && event.chapter === priorTitle && event.event === priorSummary && isGeneratedSettlementConsequence(event.consequence)) return true;
  return event.chapter === currentTitle && event.event === currentSummary;
}

function isDuplicateTimelineEvent(event, timelineEvent) {
  const eventChapterId = asString(event.chapterId, '').trim();
  const timelineChapterId = asString(timelineEvent.chapterId, '').trim();
  if (eventChapterId && timelineChapterId && eventChapterId !== timelineChapterId) return false;
  return event.chapter === timelineEvent.chapter && event.event === timelineEvent.event;
}

function isGeneratedSettlementConsequence(value) {
  const text = asString(value, '');
  return text === '需要人工补充直接后果。' || text.startsWith('推进伏笔：');
}

function formatMarkdownHeading(value, fallback) {
  return formatInlineText(value, fallback);
}

function formatInlineText(value, fallback = '') {
  return asString(value, fallback).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim() || fallback;
}

function makeFinding(severity, title, suggestion) {
  return { severity, title, suggestion };
}

function resolveChapterNumber(project, chapterRef) {
  if (chapterRef) {
    const index = project.chapters.findIndex((chapter) => chapter.id === String(chapterRef));
    if (index >= 0) return index + 1;
  }
  const text = String(chapterRef ?? '').trim();
  if (!text) return project.chapters.length + 1;
  const number = Number(text);
  if (Number.isInteger(number)) return Math.max(1, number);
  return project.chapters.length + 1;
}

function resolvePriorChapter(project, chapterNumber) {
  if (chapterNumber <= 1) return null;
  return project.chapters[chapterNumber - 2] || project.chapters.at(-1) || null;
}

function summarizeText(text = '', language = 'zh') {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  const pattern = language === 'zh'
    ? /[^。！？!?]+[。！？!?]["”’]?/g
    : /[^.!?]+[.!?]["”’]?/g;
  const matches = normalized.match(pattern) || [];
  const picked = (matches.length ? matches.slice(0, 2).join('') : normalized).trim();
  return picked.slice(0, 180);
}

function summarizeCharacterKnowledge(body = '', characterName = '', title = '') {
  const sentence = splitSentences(body).find((item) => item.includes(characterName));
  if (!sentence) return `在${title}中被提及，需要人工确认信息边界。`;
  const evidence = summarizeText(sentence, hasCjk(sentence) ? 'zh' : 'en');
  return `在${title}中出现：${evidence}`;
}

function hookTouched(text, hookText = '') {
  if (!text || !hookText) return false;
  if (text.includes(hookText)) return true;
  const keywords = extractKeywords(hookText).filter((word) => countTextLength(word, hasCjk(word) ? 'zh' : 'en') >= 2);
  return keywords.some((keyword) => text.includes(keyword));
}

function splitSentences(text = '') {
  return String(text || '')
    .replace(/([。！？.!?]["”’]?)/g, '$1\n')
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractKeywords(text = '') {
  const value = String(text || '');
  if (hasCjk(value)) {
    const cjk = value.match(/[\u4e00-\u9fff]{2,}/g) || [];
    const chunks = [];
    for (const token of cjk) {
      if (token.length <= 4) chunks.push(token);
      for (let index = 0; index < token.length - 1; index += 2) {
        chunks.push(token.slice(index, Math.min(index + 4, token.length)));
      }
    }
    return [...new Set(chunks)];
  }
  return (value.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g) || []).filter((word) => word.length > 2);
}

function frequentTerms(text) {
  const words = extractKeywords(text).filter((word) => word.length >= 2 && !/^\d+$/.test(word));
  const counts = new Map();
  for (const word of words) counts.set(word, (counts.get(word) || 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(([word]) => word);
}

function findRepeated(sentences) {
  const counts = new Map();
  for (const sentence of sentences) {
    if (sentence.length < 8) continue;
    counts.set(sentence, (counts.get(sentence) || 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([sentence]) => sentence);
}

function countSceneAnchors(text) {
  const anchors = ['灯', '门', '窗', '雨', '风', '声音', '脚步', '手机', '纸', '血', '玻璃', '墙', '桌', 'chair', 'door', 'rain', 'light', 'phone', 'footsteps'];
  return anchors.filter((anchor) => text.includes(anchor)).length;
}

function estimateExpositionRatio(sentences) {
  if (!sentences.length) return 0;
  const expositionMarkers = ['因为', '所以', '其实', '所谓', '意味着', '他知道', '她知道', '规则', '设定', '过去', 'remembered', 'because', 'therefore', 'meant'];
  const exposition = sentences.filter((sentence) => expositionMarkers.some((marker) => sentence.includes(marker))).length;
  return exposition / sentences.length;
}

function estimateActionRatio(sentences) {
  if (!sentences.length) return 0;
  const actionMarkers = ['走', '看', '伸手', '按', '推', '拿', '跑', '停', '回头', '抬起', '落下', 'said', 'looked', 'moved', 'touched', 'opened'];
  return sentences.filter((sentence) => actionMarkers.some((marker) => sentence.includes(marker))).length / sentences.length;
}

function lengthPenalty(length, target) {
  if (!target || !length) return 8;
  const ratio = length / target;
  if (ratio >= 0.75 && ratio <= 1.35) return 0;
  if (ratio < 0.45 || ratio > 1.8) return 14;
  return 6;
}

function pickSetting(genre = '', hookText = '') {
  if (/玄幻|仙侠|cultivation/i.test(genre)) return '殿外的风';
  if (/科幻|sci/i.test(genre)) return '舱室里的循环风';
  if (/悬疑|horror|惊悚/i.test(genre)) return '楼道深处';
  if (/校园/i.test(genre)) return '教学楼走廊';
  if (hookText.includes('电梯')) return '电梯井里';
  return '城市夜色里';
}

function parseBannedPatterns(text = '') {
  return String(text || '')
    .split(/[、,，\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function hasCjk(text = '') {
  return /[\u4e00-\u9fff]/.test(text);
}

function asString(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return String(value);
}

function asId(value, fallback) {
  if (typeof value !== 'string' && (typeof value !== 'number' || !Number.isFinite(value))) return fallback;
  const id = String(value).trim();
  return id && !hasControlCharacters(id) ? id : fallback;
}

function hasControlCharacters(value) {
  return /[\u0000-\u001f\u007f]/.test(value);
}

function firstNonBlank(...values) {
  for (const value of values) {
    const text = asString(value, '');
    if (text.trim()) return text;
  }
  return '';
}

function mergeLedgerText(existing = '', incoming = '') {
  const entries = [];
  for (const value of [existing, incoming]) {
    for (const entry of asString(value, '').split(/\n+/).map((item) => item.trim()).filter(Boolean)) {
      if (!entries.includes(entry)) entries.push(entry);
    }
  }
  return entries.slice(-8).join('\n');
}

function deterministicId(prefix, item, index) {
  const hash = crypto
    .createHash('sha256')
    .update(`${prefix}:${index}:${stableJson(stripId(item))}`)
    .digest('hex')
    .slice(0, 12);
  return `${prefix}-${hash}`;
}

function uniqueDeterministicId(prefix, item, index, usedIds) {
  const first = deterministicId(prefix, item, index);
  if (!usedIds.has(first)) return first;
  for (let attempt = 1; ; attempt += 1) {
    const hash = crypto
      .createHash('sha256')
      .update(`${prefix}:duplicate:${index}:${attempt}:${stableJson(stripId(item))}`)
      .digest('hex')
      .slice(0, 12);
    const id = `${prefix}-${hash}`;
    if (!usedIds.has(id)) return id;
  }
}

function stripId(value) {
  if (!isPlainObject(value)) return value;
  const clean = {};
  for (const key of Object.keys(value).sort()) {
    if (key === 'id') continue;
    clean[key] = value[key];
  }
  return clean;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function clampInteger(value, min, max, fallback) {
  const number = clampNumber(value, min, max, fallback);
  return Math.round(number);
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value)) deepFreeze(item);
  return value;
}
