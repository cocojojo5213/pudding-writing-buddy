import { lookup as lookupDns } from 'node:dns/promises';
import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { copyFile, mkdir, readFile, readdir, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  KNOWN_TASKS,
  MAX_TARGET_WORDS,
  MIN_TARGET_WORDS,
  VALID_HOOK_STATUSES,
  applySettlement,
  buildPrompt,
  createDefaultProject,
  createId,
  deriveProjectMetrics,
  exportMarkdown,
  normalizeProject,
  offlineAssist
} from './lib.js';
import { parseIntegerSetting } from './server-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = parseIntegerSetting(process.env.PORT, { defaultValue: 5179, min: 1, max: 65535 });
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const SNAPSHOT_DIR = path.join(DATA_DIR, 'snapshots');
const PROJECT_FILE = path.join(DATA_DIR, 'project.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const REQUEST_BASE_URL = 'http://127.0.0.1';
const MAX_BODY_BYTES = 5_000_000;
const MODEL_TIMEOUT_MS = 120_000;
const MAX_MODEL_RESPONSE_BYTES = 5_000_000;
const MODEL_DNS_ERROR_MESSAGE = 'Model base URL must not resolve to private, link-local, multicast, metadata, or non-localhost loopback addresses.';
const MODEL_RESPONSE_TOO_LARGE_MESSAGE = `Model response body too large; limit is ${MAX_MODEL_RESPONSE_BYTES} bytes.`;
const ALLOW_PRIVATE_MODEL_BASE_URLS = process.env.ALLOW_PRIVATE_MODEL_BASE_URLS === '1';
const DEFAULT_MODEL_TEMPERATURE = 0.75;
const MIN_MODEL_TEMPERATURE = 0;
const MAX_MODEL_TEMPERATURE = 2;
const DEFAULT_MODEL_MAX_TOKENS = 3500;
const MIN_MODEL_MAX_TOKENS = 500;
const MAX_MODEL_MAX_TOKENS = 20_000;
const STALE_TEMP_MS = parseIntegerSetting(process.env.STALE_TEMP_MS, { defaultValue: 24 * 60 * 60 * 1000, min: 1000 });
const PROJECT_SCALAR_FIELDS = [
  'title',
  'genre',
  'logline',
  'protagonist',
  'targetWords',
  'language',
  'authorIntent',
  'currentFocus',
  'storyBible',
  'notes',
  'bookRules',
  'bannedPatterns',
  'styleProfile'
];
const PROJECT_TEXT_FIELDS = PROJECT_SCALAR_FIELDS.filter((field) => field !== 'targetWords');
const PROJECT_COLLECTION_FIELDS = ['characters', 'hooks', 'outline', 'timeline', 'resources', 'arcs', 'chapters'];
const PROJECT_COLLECTION_ITEM_FIELDS = {
  characters: ['id', 'name', 'role', 'desire', 'conflict', 'secret', 'lastSeen', 'knowledge'],
  hooks: ['id', 'text', 'status', 'plantedIn', 'payoffBy', 'note'],
  outline: ['id', 'title', 'summary'],
  timeline: ['id', 'source', 'chapterId', 'chapter', 'event', 'consequence'],
  resources: ['id', 'owner', 'item', 'quantity', 'status', 'note'],
  arcs: ['id', 'character', 'start', 'current', 'target', 'pressure'],
  chapters: ['id', 'title', 'body', 'plan', 'audit', 'summary', 'status', 'createdAt', 'settledAt']
};
const PROJECT_ENUM_FIELDS = {
  language: ['zh', 'en']
};
const PROJECT_COLLECTION_ENUM_FIELDS = {
  hooks: {
    status: VALID_HOOK_STATUSES
  }
};
let projectWriteQueue = Promise.resolve();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png'
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const server = createServer(async (request, response) => {
  try {
    if (request.url?.startsWith('/api/')) {
      await handleApi(request, response);
      return;
    }
    await serveStatic(request, response);
  } catch (error) {
    const status = Number(error?.status) || 500;
    sendJson(response, status, {
      error: error instanceof Error ? error.message : 'Unknown server error'
    });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Pudding Writing Buddy running at http://127.0.0.1:${PORT}`);
});

async function handleApi(request, response) {
  const url = new URL(request.url || '/', REQUEST_BASE_URL);
  const allowedMethods = allowedApiMethods(url.pathname);
  if (allowedMethods && !allowedMethods.includes(request.method || '')) {
    response.writeHead(405, {
      Allow: allowedMethods.join(', '),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    response.end(JSON.stringify({ error: `Method not allowed. Use ${allowedMethods.join(' or ')}.` }));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/health') {
    const project = await loadProject();
    sendJson(response, 200, {
      ok: true,
      app: 'pudding-writing-buddy',
      port: PORT,
      schemaVersion: project.schemaVersion,
      metrics: deriveProjectMetrics(project)
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/project') {
    sendJson(response, 200, await loadProject());
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/metrics') {
    const project = await loadProject();
    sendJson(response, 200, deriveProjectMetrics(project));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/project') {
    const body = await readJson(request);
    const projectInput = readProjectSavePayload(body);
    const saved = await saveProjectIfVersion(projectInput, {
      expectedVersionToken: body.expectedVersionToken ?? projectInput.versionToken,
      expectedUpdatedAt: body.expectedUpdatedAt ?? projectInput.updatedAt
    });
    sendJson(response, 200, saved);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/assist') {
    const body = await readJson(request);
    const project = normalizeProject(await readOptionalProjectPayload(body));
    const payload = readAssistPayload(body);
    const task = String(body.task || 'brainstorm');
    if (!KNOWN_TASKS.has(task)) throw new HttpError(400, `Unknown assist task: ${task}`);
    const modelConfig = readModelConfigPayload(body);
    const output = task === 'style' || task === 'context' || task === 'settle' || !isUsableModelConfig(modelConfig)
      ? offlineAssist(task, project, payload)
      : await callModel(task, project, payload, modelConfig);
    sendJson(response, 200, { output });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/settle') {
    const body = await readJson(request);
    const explicitProject = readCompleteExplicitProjectPayload(body);
    const chapter = readChapterSettlementPayload(body);
    const result = await settleProjectIfVersion(explicitProject || await loadProject(), chapter, {
      expectedVersionToken: body.expectedVersionToken ?? explicitProject?.versionToken,
      expectedUpdatedAt: body.expectedUpdatedAt ?? explicitProject?.updatedAt
    });
    sendJson(response, 200, result);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/export') {
    const body = await readJson(request);
    const project = normalizeProject(await readOptionalProjectPayload(body));
    sendJson(response, 200, {
      filename: safeFilename(project.title || 'novel') + '.md',
      markdown: exportMarkdown(project)
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/snapshot') {
    const body = await readJson(request);
    const project = normalizeProject(await readOptionalProjectPayload(body));
    const filename = await writeSnapshot(project);
    sendJson(response, 200, { filename });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/reset') {
    const body = await readJson(request);
    const saved = await saveProjectIfVersion(createDefaultProject(), {
      expectedVersionToken: body.expectedVersionToken,
      expectedUpdatedAt: body.expectedUpdatedAt
    });
    sendJson(response, 200, saved);
    return;
  }

  sendJson(response, 404, { error: 'API route not found' });
}

async function serveStatic(request, response) {
  const method = request.method || 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    sendPlainText(response, 405, 'Method not allowed', method, { Allow: 'GET, HEAD' });
    return;
  }
  const url = new URL(request.url || '/', REQUEST_BASE_URL);
  const pathname = decodeStaticPathname(url.pathname);
  if (!pathname) {
    sendPlainText(response, 400, 'Bad request', method);
    return;
  }
  const resolved = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (resolved !== PUBLIC_DIR && !resolved.startsWith(PUBLIC_DIR + path.sep)) {
    sendPlainText(response, 403, 'Forbidden', method);
    return;
  }
  try {
    const realResolved = await realpath(resolved);
    if (realResolved !== PUBLIC_DIR && !realResolved.startsWith(PUBLIC_DIR + path.sep)) {
      sendPlainText(response, 403, 'Forbidden', method);
      return;
    }
    const fileStat = await stat(realResolved);
    if (!fileStat.isFile()) throw new Error('Not a file');
    const ext = path.extname(realResolved);
    const content = await readFile(realResolved);
    response.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    response.end(method === 'HEAD' ? undefined : content);
  } catch {
    sendPlainText(response, 404, 'Not found', method);
  }
}

async function loadProject() {
  try {
    return normalizeProject(JSON.parse(await readFile(PROJECT_FILE, 'utf8')));
  } catch (error) {
    if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) {
      throw new HttpError(500, `Unable to load project: ${error.message || 'unknown read error'}`);
    }
    if (error instanceof SyntaxError) {
      await backupCorruptProjectFile();
    }
    const project = createDefaultProject();
    return await saveProject(project);
  }
}

async function saveProject(project) {
  return await withProjectWriteLock(() => saveProjectUnlocked(project));
}

async function saveProjectIfVersion(project, expectedVersion) {
  return await withProjectWriteLock(async () => {
    await assertProjectVersion(expectedVersion);
    return await saveProjectUnlocked(project);
  });
}

async function settleProjectIfVersion(projectInput, chapter, expectedVersion) {
  return await withProjectWriteLock(async () => {
    const currentProject = await assertProjectVersion(expectedVersion);
    const project = currentProject || normalizeProject(projectInput);
    const result = applySettlement(project, chapterInputForSettlement(project, chapter));
    result.project = await saveProjectUnlocked(result.project);
    return result;
  });
}

async function saveProjectUnlocked(project) {
  await mkdir(DATA_DIR, { recursive: true });
  await cleanupStaleTempFiles();
  const normalized = normalizeProject({
    ...project,
    versionToken: createId(),
    updatedAt: new Date().toISOString()
  });
  const tempFile = `${PROJECT_FILE}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  await writeFile(tempFile, JSON.stringify(normalized, null, 2), 'utf8');
  await rename(tempFile, PROJECT_FILE);
  return normalized;
}

async function withProjectWriteLock(operation) {
  const run = projectWriteQueue.catch(() => {}).then(operation);
  projectWriteQueue = run.catch(() => {});
  return await run;
}

async function assertProjectVersion({ expectedVersionToken, expectedUpdatedAt } = {}) {
  assertProjectVersionMetadataShape({ expectedVersionToken, expectedUpdatedAt });
  const hasExpectedToken = expectedVersionToken !== undefined && expectedVersionToken !== null;
  const current = await readProjectIfPresent();
  if (!current) return null;
  if (!hasExpectedToken && !expectedUpdatedAt) {
    throw new HttpError(409, 'Project version is required before writing. Reload before saving to avoid overwriting newer work.');
  }
  if (hasExpectedToken && current.versionToken !== expectedVersionToken) {
    throw new HttpError(409, 'Project changed on disk. Reload before saving to avoid overwriting newer work.');
  }
  if (!hasExpectedToken && current.updatedAt !== expectedUpdatedAt) {
    throw new HttpError(409, 'Project changed on disk. Reload before saving to avoid overwriting newer work.');
  }
  return current;
}

function assertProjectVersionMetadataShape({ expectedVersionToken, expectedUpdatedAt } = {}) {
  if (expectedVersionToken !== undefined && expectedVersionToken !== null && typeof expectedVersionToken !== 'string') {
    throw new HttpError(400, 'Project version token must be a string.');
  }
  if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== null && typeof expectedUpdatedAt !== 'string') {
    throw new HttpError(400, 'Project updated timestamp must be a string.');
  }
}

function chapterInputForSettlement(project, chapterInput) {
  const incoming = isPlainObject(chapterInput) ? chapterInput : {};
  const chapterId = toTrimmedString(incoming.id);
  if (!chapterId) return chapterInput;
  const savedChapter = project.chapters.find((chapter) => chapter.id === chapterId);
  if (!savedChapter) return chapterInput;
  return {
    ...incoming,
    id: savedChapter.id,
    title: firstNonBlankText(savedChapter.title, incoming.title),
    body: firstNonBlankText(savedChapter.body, incoming.body, incoming.text),
    plan: firstNonBlankText(savedChapter.plan, incoming.plan),
    audit: firstNonBlankText(savedChapter.audit, incoming.audit),
    summary: firstNonBlankText(savedChapter.summary, incoming.summary),
    status: firstNonBlankText(savedChapter.status, incoming.status, 'draft'),
    createdAt: firstNonBlankText(savedChapter.createdAt, incoming.createdAt),
    settledAt: firstNonBlankText(savedChapter.settledAt, incoming.settledAt)
  };
}

function readProjectSavePayload(body) {
  let project;
  if (Object.hasOwn(body, 'project')) {
    project = readExplicitProjectPayload(body);
  } else if (Object.hasOwn(body, 'expectedVersionToken') || Object.hasOwn(body, 'expectedUpdatedAt')) {
    throw new HttpError(400, 'Project payload is required when sending version metadata.');
  } else {
    project = body;
  }
  assertCompleteProjectPayload(project);
  return project;
}

async function readOptionalProjectPayload(body) {
  return readCompleteExplicitProjectPayload(body) || await loadProject();
}

function readExplicitProjectPayload(body) {
  if (!Object.hasOwn(body, 'project')) return null;
  if (!isPlainObject(body.project)) {
    throw new HttpError(400, 'Project payload must be an object.');
  }
  return body.project;
}

function readCompleteExplicitProjectPayload(body) {
  const project = readExplicitProjectPayload(body);
  if (project) assertCompleteProjectPayload(project);
  return project;
}

function readChapterSettlementPayload(body) {
  if (!Object.hasOwn(body, 'chapter')) return {};
  if (!isPlainObject(body.chapter)) {
    throw new HttpError(400, 'Chapter payload must be an object.');
  }
  return body.chapter;
}

function readAssistPayload(body) {
  if (!Object.hasOwn(body, 'payload')) return {};
  if (!isPlainObject(body.payload)) {
    throw new HttpError(400, 'Assist payload must be an object.');
  }
  return body.payload;
}

function readModelConfigPayload(body) {
  if (!Object.hasOwn(body, 'modelConfig')) return {};
  if (!isPlainObject(body.modelConfig)) {
    throw new HttpError(400, 'Model config must be an object.');
  }
  return body.modelConfig;
}

function assertCompleteProjectPayload(project) {
  const missingFields = PROJECT_SCALAR_FIELDS.filter((field) => !Object.hasOwn(project, field));
  const malformedFields = PROJECT_TEXT_FIELDS.filter((field) => Object.hasOwn(project, field) && typeof project[field] !== 'string');
  if (Object.hasOwn(project, 'targetWords') && !isTargetWordsValue(project.targetWords)) malformedFields.push('targetWords');
  for (const [field, allowedValues] of Object.entries(PROJECT_ENUM_FIELDS)) {
    if (Object.hasOwn(project, field) && typeof project[field] === 'string' && !allowedValues.includes(project[field])) {
      malformedFields.push(field);
    }
  }
  const missing = PROJECT_COLLECTION_FIELDS.filter((field) => !Array.isArray(project[field]));
  const malformedCollectionItems = [];
  const missingCollectionItemFields = [];
  const malformedCollectionItemFields = [];
  const duplicateCollectionItemIds = [];
  for (const field of PROJECT_COLLECTION_FIELDS) {
    if (!Array.isArray(project[field])) continue;
    const itemFields = PROJECT_COLLECTION_ITEM_FIELDS[field] || [];
    const enumFields = PROJECT_COLLECTION_ENUM_FIELDS[field] || {};
    const seenIds = new Set();
    project[field].forEach((item, index) => {
      if (!isPlainObject(item)) {
        malformedCollectionItems.push(`${field}[${index}]`);
        return;
      }
      for (const itemField of itemFields) {
        const fieldPath = `${field}[${index}].${itemField}`;
        if (!Object.hasOwn(item, itemField)) {
          missingCollectionItemFields.push(fieldPath);
        } else if (typeof item[itemField] !== 'string') {
          malformedCollectionItemFields.push(fieldPath);
        }
      }
      if (typeof item.id === 'string') {
        const id = item.id.trim();
        const idPath = `${field}[${index}].id`;
        if (!id || id !== item.id || hasControlCharacters(id)) {
          malformedCollectionItemFields.push(idPath);
        } else if (seenIds.has(id)) {
          duplicateCollectionItemIds.push(idPath);
        } else {
          seenIds.add(id);
        }
      }
      for (const [itemField, allowedValues] of Object.entries(enumFields)) {
        if (typeof item[itemField] === 'string' && !allowedValues.includes(item[itemField])) {
          malformedCollectionItemFields.push(`${field}[${index}].${itemField}`);
        }
      }
    });
  }
  if (
    missingFields.length
    || malformedFields.length
    || missing.length
    || malformedCollectionItems.length
    || missingCollectionItemFields.length
    || malformedCollectionItemFields.length
    || duplicateCollectionItemIds.length
  ) {
    const details = [];
    if (missingFields.length) details.push(`Missing fields: ${missingFields.join(', ')}`);
    if (malformedFields.length) details.push(`Malformed fields: ${malformedFields.join(', ')}`);
    if (missing.length) details.push(`Missing collections: ${missing.join(', ')}`);
    if (malformedCollectionItems.length) details.push(`Malformed collection items: ${malformedCollectionItems.join(', ')}`);
    if (missingCollectionItemFields.length) details.push(`Missing collection item fields: ${missingCollectionItemFields.join(', ')}`);
    if (malformedCollectionItemFields.length) details.push(`Malformed collection item fields: ${malformedCollectionItemFields.join(', ')}`);
    if (duplicateCollectionItemIds.length) details.push(`Duplicate collection item ids: ${duplicateCollectionItemIds.join(', ')}`);
    throw new HttpError(400, `Project payload must include complete project data. ${details.join('. ')}.`);
  }
}

function isTargetWordsValue(value) {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= MIN_TARGET_WORDS && value <= MAX_TARGET_WORDS;
  }
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (!/^[+-]?\d+$/.test(text)) return false;
  const number = Number(text);
  return Number.isInteger(number) && number >= MIN_TARGET_WORDS && number <= MAX_TARGET_WORDS;
}

function hasControlCharacters(value) {
  return /[\u0000-\u001f\u007f]/.test(value);
}

async function readProjectIfPresent() {
  try {
    return normalizeProject(JSON.parse(await readFile(PROJECT_FILE, 'utf8')));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) {
      await backupCorruptProjectFile();
      throw new HttpError(409, 'Project file was invalid JSON and has been backed up. Reload before saving.');
    }
    throw new HttpError(500, `Unable to inspect current project: ${error.message || 'unknown read error'}`);
  }
}

async function cleanupStaleTempFiles() {
  let entries = [];
  try {
    entries = await readdir(DATA_DIR, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  const now = Date.now();
  await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.startsWith('project.json.') && entry.name.endsWith('.tmp'))
    .map(async (entry) => {
      const fullPath = path.join(DATA_DIR, entry.name);
      try {
        const fileStat = await stat(fullPath);
        if (now - fileStat.mtimeMs >= STALE_TEMP_MS) await unlink(fullPath);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }));
}

async function backupCorruptProjectFile() {
  await mkdir(DATA_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(DATA_DIR, `project.corrupt-${stamp}-${createId()}.json`);
  await copyFile(PROJECT_FILE, backupFile);
  console.warn(`Project file was invalid JSON. Backed up corrupt file to ${backupFile}`);
}

async function writeSnapshot(project) {
  await mkdir(SNAPSHOT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `project-${stamp}-${createId()}.json`;
  const fullPath = path.join(SNAPSHOT_DIR, filename);
  await writeFile(fullPath, JSON.stringify(normalizeProject(project), null, 2), 'utf8');
  return filename;
}

async function readJson(request) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > MAX_BODY_BYTES) throw new HttpError(413, 'Request body too large');
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  const data = Buffer.concat(chunks, totalBytes).toString('utf8');
  try {
    const parsed = JSON.parse(data);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new HttpError(400, 'JSON body must be an object');
    }
    return parsed;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'Invalid JSON body');
  }
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(body));
}

function sendPlainText(response, status, text, method = 'GET', headers = {}) {
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    ...headers
  });
  response.end(method === 'HEAD' ? undefined : text);
}

function isUsableModelConfig(config) {
  return Boolean(
    toTrimmedString(config?.baseUrl)
    && toTrimmedString(config?.apiKey)
    && toTrimmedString(config?.model)
  );
}

async function callModel(task, project, payload, config) {
  const modelConfig = normalizeModelConfig(config);
  const prompt = buildPrompt(task, project, payload);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
  try {
    const result = await requestModelEndpoint(modelConfig.endpoint, {
      model: modelConfig.model,
      messages: [
        {
          role: 'system',
          content: 'You are a careful novel writing assistant. Reply in the project language. Keep output practical and directly usable.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: modelConfig.temperature,
      max_tokens: modelConfig.maxTokens
    }, {
      Authorization: `Bearer ${modelConfig.apiKey}`
    }, controller.signal);
    const text = await result.text();
    const json = parseModelJson(text, result.ok);
    if (!result.ok) {
      const detail = modelErrorDetail(json, result.statusText, result.status);
      throw new Error(`Model request failed: ${detail}`);
    }
    const content = extractModelText(json);
    if (!content) throw new Error('Model returned no text content');
    return content;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Model request timed out');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function requestModelEndpoint(endpoint, payload, headers = {}, signal) {
  const url = new URL(endpoint);
  const resolvedAddresses = await resolveModelAddresses(url);
  const body = JSON.stringify(payload);
  const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
  return await new Promise((resolve, reject) => {
    let settled = false;
    const finishResolve = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const finishReject = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const clientRequest = request(url, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...headers
      },
      lookup: resolvedAddresses ? createCheckedModelLookup(resolvedAddresses) : undefined
    }, (modelResponse) => {
      const chunks = [];
      let totalBytes = 0;
      modelResponse.on('data', (chunk) => {
        if (settled) return;
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalBytes += buffer.length;
        if (totalBytes > MAX_MODEL_RESPONSE_BYTES) {
          const error = new Error(MODEL_RESPONSE_TOO_LARGE_MESSAGE);
          modelResponse.destroy(error);
          clientRequest.destroy(error);
          finishReject(error);
          return;
        }
        chunks.push(buffer);
      });
      modelResponse.on('error', finishReject);
      modelResponse.on('end', () => {
        if (settled) return;
        const text = Buffer.concat(chunks, totalBytes).toString('utf8');
        const status = modelResponse.statusCode || 0;
        finishResolve({
          ok: status >= 200 && status < 300,
          status,
          statusText: modelResponse.statusMessage || '',
          text: async () => text
        });
      });
    });
    clientRequest.on('error', finishReject);
    clientRequest.end(body);
  });
}

function normalizeModelConfig(config) {
  return {
    endpoint: buildModelEndpoint(toTrimmedString(config?.baseUrl)),
    apiKey: toTrimmedString(config?.apiKey),
    model: toTrimmedString(config?.model),
    temperature: boundedNumber(config?.temperature, {
      defaultValue: DEFAULT_MODEL_TEMPERATURE,
      min: MIN_MODEL_TEMPERATURE,
      max: MAX_MODEL_TEMPERATURE
    }),
    maxTokens: boundedInteger(config?.maxTokens, {
      defaultValue: DEFAULT_MODEL_MAX_TOKENS,
      min: MIN_MODEL_MAX_TOKENS,
      max: MAX_MODEL_MAX_TOKENS
    })
  };
}

function buildModelEndpoint(baseUrlValue) {
  let url;
  try {
    url = new URL(baseUrlValue);
  } catch {
    throw new HttpError(400, 'Model base URL must be a valid http(s) URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new HttpError(400, 'Model base URL must use http or https.');
  }
  if (url.search || url.hash) {
    throw new HttpError(400, 'Model base URL must not include query strings or fragments.');
  }
  if (!ALLOW_PRIVATE_MODEL_BASE_URLS && isPrivateModelTarget(url.hostname)) {
    throw new HttpError(400, 'Model base URL must not target private, link-local, multicast, or metadata addresses. Use localhost/127.0.0.1 for local gateways, or set ALLOW_PRIVATE_MODEL_BASE_URLS=1 to opt in.');
  }
  const pathname = url.pathname.replace(/\/+$/, '');
  url.pathname = pathname.endsWith('/chat/completions') ? pathname : `${pathname}/chat/completions`;
  return url.toString();
}

async function resolveModelAddresses(url) {
  if (ALLOW_PRIVATE_MODEL_BASE_URLS) return null;
  const hostname = normalizeHostname(url.hostname);
  if (!hostname || isIP(hostname)) return null;
  let addresses;
  try {
    addresses = await lookupDns(hostname, { all: true });
  } catch (error) {
    throw new Error(`Unable to resolve model base URL host: ${error.message || 'DNS lookup failed'}`);
  }
  if (!addresses.length) throw new Error('Unable to resolve model base URL host.');
  const blockedAddress = addresses.find((entry) => isBlockedResolvedModelAddress(hostname, entry.address));
  if (blockedAddress) {
    throw new HttpError(400, MODEL_DNS_ERROR_MESSAGE);
  }
  return addresses.map((entry) => ({
    address: entry.address,
    family: entry.family
  }));
}

function createCheckedModelLookup(addresses) {
  return (_hostname, options, callback) => {
    if (options?.all) {
      callback(null, addresses);
      return;
    }
    callback(null, addresses[0].address, addresses[0].family);
  };
}

function isBlockedResolvedModelAddress(hostname, address) {
  const normalizedAddress = normalizeHostname(address);
  if (isLoopbackModelAddress(normalizedAddress)) return hostname !== 'localhost';
  return isPrivateModelTarget(normalizedAddress);
}

function isPrivateModelTarget(hostname) {
  const normalized = normalizeHostname(hostname);
  if (!normalized || normalized === 'localhost') return false;
  const ipVersion = isIP(normalized);
  if (ipVersion === 4) return isPrivateIpv4Target(normalized);
  if (ipVersion === 6) return isPrivateIpv6Target(normalized);
  return false;
}

function isLoopbackModelAddress(address) {
  const normalized = normalizeHostname(address);
  const ipVersion = isIP(normalized);
  if (ipVersion === 4) return isLoopbackIpv4Address(normalized);
  if (ipVersion !== 6) return false;
  const parts = expandIpv6(normalized);
  if (!parts) return false;
  const mappedIpv4 = ipv4FromMappedIpv6(parts);
  if (mappedIpv4) return isLoopbackModelAddress(mappedIpv4);
  return isLoopbackIpv6Address(parts);
}

function normalizeHostname(hostname) {
  return String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\]$/, '$1')
    .replace(/\.$/, '');
}

function isPrivateIpv4Target(address) {
  const octets = address.split('.').map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = octets;
  if (a === 127) return false;
  return a === 0
    || a === 10
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224;
}

function isPrivateIpv6Target(address) {
  const parts = expandIpv6(address);
  if (!parts) return true;
  if (parts.every((part) => part === 0)) return true;
  if (isLoopbackIpv6Address(parts)) return false;
  const mappedIpv4 = ipv4FromMappedIpv6(parts);
  if (mappedIpv4) return isPrivateIpv4Target(mappedIpv4);
  const transitionIpv4 = ipv4FromTransitionIpv6(parts);
  if (transitionIpv4) return isPrivateIpv4Target(transitionIpv4) || isLoopbackIpv4Address(transitionIpv4);
  const first = parts[0];
  return (first & 0xff00) === 0xff00
    || (first & 0xfe00) === 0xfc00
    || (first & 0xffc0) === 0xfe80;
}

function isLoopbackIpv4Address(address) {
  return address.split('.')[0] === '127';
}

function isLoopbackIpv6Address(parts) {
  return parts.slice(0, 7).every((part) => part === 0) && parts[7] === 1;
}

function expandIpv6(address) {
  const sections = address.split('::');
  if (sections.length > 2) return null;
  const head = sections[0] ? sections[0].split(':') : [];
  const tail = sections.length === 2 && sections[1] ? sections[1].split(':') : [];
  const missing = sections.length === 2 ? 8 - head.length - tail.length : 0;
  const parts = sections.length === 2 ? [...head, ...Array(missing).fill('0'), ...tail] : head;
  if (missing < 0 || parts.length !== 8) return null;
  const numbers = parts.map((part) => /^[0-9a-f]{1,4}$/i.test(part) ? parseInt(part, 16) : Number.NaN);
  return numbers.some((part) => !Number.isInteger(part) || part < 0 || part > 0xffff) ? null : numbers;
}

function ipv4FromMappedIpv6(parts) {
  const mapped = parts.slice(0, 5).every((part) => part === 0) && parts[5] === 0xffff;
  if (!mapped) return '';
  return ipv4FromIpv6Words(parts[6], parts[7]);
}

function ipv4FromTransitionIpv6(parts) {
  const compatible = parts.slice(0, 6).every((part) => part === 0);
  if (compatible) return ipv4FromIpv6Words(parts[6], parts[7]);
  const nat64WellKnown = parts[0] === 0x0064
    && parts[1] === 0xff9b
    && parts.slice(2, 6).every((part) => part === 0);
  if (nat64WellKnown) return ipv4FromIpv6Words(parts[6], parts[7]);
  if (parts[0] === 0x2002) return ipv4FromIpv6Words(parts[1], parts[2]);
  if (parts[0] === 0x2001 && parts[1] === 0x0000) {
    return ipv4FromIpv6Words((~parts[6]) & 0xffff, (~parts[7]) & 0xffff);
  }
  return '';
}

function ipv4FromIpv6Words(high, low) {
  return [
    high >> 8,
    high & 0xff,
    low >> 8,
    low & 0xff
  ].join('.');
}

function toTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

function firstNonBlankText(...values) {
  for (const value of values) {
    const text = typeof value === 'string' ? value : String(value ?? '');
    if (text.trim()) return text;
  }
  return '';
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function boundedNumber(value, { defaultValue, min, max }) {
  const raw = toTrimmedString(value);
  if (!raw) return defaultValue;
  const number = Number(raw);
  if (!Number.isFinite(number)) return defaultValue;
  return Math.min(Math.max(number, min), max);
}

function boundedInteger(value, bounds) {
  return Math.round(boundedNumber(value, bounds));
}

function extractModelText(json) {
  if (typeof json.output_text === 'string') return json.output_text;
  if (typeof json.text === 'string') return json.text;
  if (typeof json.choices?.[0]?.text === 'string') return json.choices[0].text;
  const messageContent = json.choices?.[0]?.message?.content;
  const messageText = extractContentText(messageContent);
  if (messageText) return messageText;
  const outputText = Array.isArray(json.output)
    ? json.output.map((item) => extractContentText(item?.content) || extractContentText(item)).filter(Boolean).join('\n')
    : extractContentText(json.output);
  if (outputText) return outputText;
  const contentText = extractContentText(json.content);
  if (contentText) return contentText;
  return '';
}

function extractContentText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(extractContentText).filter(Boolean).join('\n');
  }
  if (!content || typeof content !== 'object') return '';
  if (typeof content.text === 'string') return content.text;
  if (typeof content.content === 'string') return content.content;
  if (typeof content.output_text === 'string') return content.output_text;
  if (typeof content.text?.value === 'string') return content.text.value;
  return '';
}

function parseModelJson(text, requestOk) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    if (requestOk) {
      throw new Error('Model response was not valid JSON');
    }
    return { message: text.slice(0, 500) };
  }
}

function modelErrorDetail(json, statusText, status) {
  if (typeof json === 'string' && json.trim()) return json;
  if (typeof json === 'number' || typeof json === 'boolean') return String(json);
  if (Array.isArray(json)) {
    const detail = json.map((item) => modelErrorDetail(item, '', status)).filter(Boolean).join('; ');
    if (detail) return detail;
  }
  if (typeof json.error?.message === 'string' && json.error.message.trim()) return json.error.message;
  if (typeof json.error === 'string' && json.error.trim()) return json.error;
  if (typeof json.message === 'string' && json.message.trim()) return json.message;
  return statusText || `HTTP ${status}`;
}

function allowedApiMethods(pathname) {
  const routes = {
    '/api/health': ['GET'],
    '/api/project': ['GET', 'POST'],
    '/api/metrics': ['GET'],
    '/api/assist': ['POST'],
    '/api/settle': ['POST'],
    '/api/export': ['POST'],
    '/api/snapshot': ['POST'],
    '/api/reset': ['POST']
  };
  return routes[pathname] || null;
}

function decodeStaticPathname(pathname) {
  try {
    const decoded = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
    return /[\u0000-\u001f\u007f]/.test(decoded) ? '' : decoded;
  } catch {
    return '';
  }
}

function safeFilename(value) {
  return String(value)
    .replace(/[\u0000-\u001f\u007f]+/g, '-')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'novel';
}
