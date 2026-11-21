import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  AppData,
  ModelRecord,
  TierDefinition,
  InboxConfig,
  ImportCandidate,
} from '../src/types/models';
import {
  JsonStorageService,
  createDefaultAppData,
  sanitizeAppData,
} from '../electron/storage';
import {
  sanitizeClientAppData,
  sanitizeClientSettings,
} from '../src/utils/appDataSanitizer';
import { parseImportInput } from '../src/utils/csvImporter';
import {
  computeWatchlistScheduleMatrix,
  computeActivitySummary,
  getUsuallyLiveNowMeta,
  recordPresenceTick,
  buildPresenceHoursFromCbexplorerStreams,
  CbexplorerStreamSession,
} from '../src/utils/activityStats';
import {
  computeStratifiedReviewOffsets,
  createModelReviewStatusHelper,
  getModelReviewOffsetDays,
} from '../src/utils/review';
import {
  buildTierOrderMap,
  compareMonitorTierPriority,
} from '../src/utils/liveMonitorSort';
import { sanitizeUsername } from '../src/utils/sanitizer';

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function getMemoryUsage() {
  const mem = process.memoryUsage();
  return {
    rss: mem.rss,
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
  };
}

console.log('=== WATCHPULSE HIGH-VOLUME POWER USER STRESS TEST SUITE ===');
console.log(`Node: ${process.version}, Platform: ${process.platform}, Arch: ${process.arch}`);
console.log(`Initial Heap: ${formatBytes(getMemoryUsage().heapUsed)}`);

test('STRESS 1: 5,000+ Models, 50+ Custom Tiers & 100,000 Presence Slots', async (t) => {
  const initialMem = getMemoryUsage();
  const startTime = Date.now();

  // 1. Generate 50 custom tiers
  const tiers: TierDefinition[] = [];
  const tierIds: string[] = [];
  for (let i = 0; i < 50; i++) {
    const id = `tier_custom_${i + 1}`;
    tierIds.push(id);
    tiers.push({
      id,
      name: `Custom Tier ${i + 1}`,
      color: `#${((i * 1234567) % 0xffffff).toString(16).padStart(6, '0')}`,
      hotkey: i < 35 ? (i < 10 ? String(i) : String.fromCharCode(65 + i - 10)) : '',
      order: i,
      description: `Stress tier ${i + 1} for high-volume categorization`,
      reviewCadenceDays: (i % 4 + 1) * 7,
      reviewSpreadDays: 7,
    });
  }

  // 2. Generate 5,000 models distributed across the 50 tiers + inbox
  const allTierTargets = ['inbox', ...tierIds];
  const models: ModelRecord[] = [];
  const now = new Date();
  const nowIso = now.toISOString();

  // We need 100,000 total presence slots.
  // Let's give the first 100 models 1,000 presence slots each = 100,000 presence slots!
  // And across all models, realistic activity.
  let totalPresenceSlots = 0;
  const presenceHourKeys: string[] = [];
  // Generate 1,000 distinct hourly buckets over the past 45 days
  for (let d = 0; d < 45; d++) {
    for (let h = 0; h < 24; h++) {
      if (presenceHourKeys.length < 1000) {
        const dt = new Date(now.getTime() - d * 24 * 3600 * 1000 + h * 3600 * 1000);
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const day = String(dt.getDate()).padStart(2, '0');
        const hr = String(dt.getHours()).padStart(2, '0');
        presenceHourKeys.push(`${y}-${m}-${day}T${hr}`);
      }
    }
  }

  for (let i = 0; i < 5000; i++) {
    const assignedTier = allTierTargets[i % allTierTargets.length];
    let presenceHours: Record<string, number> | undefined;

    // First 100 models get 1,000 presence slots each -> 100,000 slots total!
    if (i < 100) {
      presenceHours = {};
      for (let s = 0; s < 1000; s++) {
        presenceHours[presenceHourKeys[s]] = 15 + (s % 45);
        totalPresenceSlots++;
      }
    } else if (i < 500) {
      // Next 400 models get 20 slots each
      presenceHours = {};
      for (let s = 0; s < 20; s++) {
        presenceHours[presenceHourKeys[s % presenceHourKeys.length]] = 30;
      }
    }

    models.push({
      id: `model_stress_${i}`,
      username: `power_model_${i}`,
      displayName: `Power Model ${i} - Star`,
      originalLink: `https://chaturbate.com/power_model_${i}/`,
      tierId: assignedTier,
      order: i,
      cbexplorerAdded: i % 3 === 0,
      thumbnail: i % 2 === 0 ? `local-media://thumb/power_model_${i}.jpg` : '',
      notes: `Triage notes for model ${i}: Highly active performer, VIP regular, schedule alerts enabled.`,
      tags: [`tag_${i % 25}`, `style_${i % 10}`, '4k', 'interactive'],
      customLinks: [
        {
          id: `link_${i}_0`,
          label: 'Archive Show',
          url: `https://archivebate.com/recording_${i}`,
        },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
      lastReviewedAt: i % 2 === 0 ? new Date(now.getTime() - (i % 30) * 86400000).toISOString() : undefined,
      lastSeenLiveAt: i % 4 === 0 ? new Date(now.getTime() - (i % 10) * 3600000).toISOString() : undefined,
      presenceHours,
      activitySyncedAt: presenceHours ? nowIso : undefined,
    });
  }

  const generationTime = Date.now() - startTime;
  console.log(`[STRESS 1] Generated 5,000 models, 50 tiers, and ${totalPresenceSlots} presence slots in ${generationTime}ms`);
  assert.equal(models.length, 5000);
  assert.equal(tiers.length, 50);
  assert.equal(totalPresenceSlots, 100000);

  // Measure sanitizeAppData on this huge dataset
  const sanitizeStart = Date.now();
  const rawAppData: AppData = {
    version: 2,
    inbox: { id: 'inbox', name: 'Unsorted / Inbox', color: '#94A3B8', hotkey: '0' },
    tiers,
    models,
    trashedModels: [],
    settings: createDefaultAppData().settings,
  };

  const sanitized = sanitizeAppData(rawAppData);
  const sanitizeTime = Date.now() - sanitizeStart;
  const memAfterSanitize = getMemoryUsage();

  console.log(`[STRESS 1] sanitizeAppData (Backend) took ${sanitizeTime}ms. Heap used: ${formatBytes(memAfterSanitize.heapUsed)}`);
  assert.equal(sanitized.models.length, 5000);
  assert.equal(sanitized.tiers.length, 50);

  // Verify client sanitizer
  const clientSanitizeStart = Date.now();
  const clientSanitized = sanitizeClientAppData(rawAppData);
  const clientSanitizeTime = Date.now() - clientSanitizeStart;
  console.log(`[STRESS 1] sanitizeClientAppData (Frontend) took ${clientSanitizeTime}ms`);
  assert.equal(clientSanitized.models.length, 5000);

  // Benchmark computeStratifiedReviewOffsets with 5,000 models across 50 tiers
  const offsetsStart = Date.now();
  const offsets = computeStratifiedReviewOffsets(sanitized.models, 7);
  const offsetsTime = Date.now() - offsetsStart;
  console.log(`[STRESS 1] computeStratifiedReviewOffsets for 5,000 models took ${offsetsTime}ms. Offset entries: ${offsets.size}`);
  assert.equal(offsets.size > 0, true);

  // Benchmark createModelReviewStatusHelper across all 5,000 models
  const helperStart = Date.now();
  const helper = createModelReviewStatusHelper(
    sanitized.models,
    sanitized.tiers,
    14,
    30,
    Date.now(),
    7
  );
  let dueCount = 0;
  for (const m of sanitized.models) {
    if (helper.getStatus(m).isDueForReview) dueCount++;
  }
  const helperTime = Date.now() - helperStart;
  console.log(`[STRESS 1] Review status evaluation for all 5,000 models took ${helperTime}ms. Due models: ${dueCount}`);

  // Benchmark getUsuallyLiveNowMeta across all 5,000 models
  const usuallyStart = Date.now();
  let usuallyCount = 0;
  for (const m of sanitized.models) {
    if (getUsuallyLiveNowMeta(m, now).isUsuallyLiveNow) usuallyCount++;
  }
  const usuallyTime = Date.now() - usuallyStart;
  console.log(`[STRESS 1] getUsuallyLiveNowMeta across all 5,000 models (100k slots) took ${usuallyTime}ms. Usually live now: ${usuallyCount}`);

  // Benchmark computeWatchlistScheduleMatrix with 5,000 models & 100,000 slots
  const matrixStart = Date.now();
  const matrix = computeWatchlistScheduleMatrix(sanitized.models);
  const matrixTime = Date.now() - matrixStart;
  console.log(`[STRESS 1] computeWatchlistScheduleMatrix (100k slots) took ${matrixTime}ms. Peak window: ${matrix.peakWindow.label}, models: ${matrix.peakWindow.modelCount}`);
  assert.equal(matrix.matrix.length, 7);
  assert.equal(matrix.matrix[0].length, 24);

  // Benchmark compareMonitorTierPriority over 5,000 models
  const tierOrderMap = buildTierOrderMap(sanitized.tiers);
  const monitorItems = sanitized.models.map((m, idx) => ({
    model: m,
    live: idx % 3 === 0 ? {
      username: m.username,
      numUsers: idx * 5,
      currentShow: idx % 6 === 0 ? 'private' : 'public',
      isHd: true,
      chatRoomUrl: '',
      hlsSource: '',
      fetchedAt: nowIso,
    } : undefined,
    usuallyNowScore: idx % 2 === 0 ? idx % 100 : 0,
  }));
  const sortStart = Date.now();
  const sortedForMonitor = [...monitorItems].sort((a, b) =>
    compareMonitorTierPriority(a, b, tierOrderMap, { prioritizeUsuallyNowScore: true })
  );
  const sortTime = Date.now() - sortStart;
  console.log(`[STRESS 1] Monitor tier sorting (5,000 models) took ${sortTime}ms`);
  assert.equal(sortedForMonitor.length, 5000);

  // Test Disk Persistence Performance: JsonStorageService
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'watchpulse-stress-'));
  try {
    const storage = new JsonStorageService(tempDir);
    const saveStart = Date.now();
    await storage.save(sanitized);
    const saveTime = Date.now() - saveStart;

    const dataFileStat = await fs.stat(storage.getDataFilePath());
    console.log(`[STRESS 1] JsonStorageService.save wrote ${formatBytes(dataFileStat.size)} in ${saveTime}ms`);

    const loadStart = Date.now();
    const loaded = await storage.load();
    const loadTime = Date.now() - loadStart;
    console.log(`[STRESS 1] JsonStorageService.load parsed ${loaded.models.length} models in ${loadTime}ms`);
    assert.equal(loaded.models.length, 5000);
    assert.equal(loaded.tiers.length, 50);

    // Verify backup rotation
    const save2Start = Date.now();
    await storage.save(loaded);
    const save2Time = Date.now() - save2Start;
    const backupFile = path.join(tempDir, 'watchpulse-data.bak.json');
    const backupStat = await fs.stat(backupFile);
    console.log(`[STRESS 1] Second save & backup rotation took ${save2Time}ms. Backup size: ${formatBytes(backupStat.size)}`);
    assert.equal(backupStat.size > 0, true);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
});

test('STRESS 2: Rapid Mutation Stress - Rapid Tier Re-sorting, Batch Reassignments, Keyboard Shortcuts & Concurrent Saves', async (t) => {
  console.log('\n--- Starting STRESS 2: Rapid Mutation Stress ---');

  // Prepare a baseline workspace with 2,000 models and 20 tiers
  const tiers: TierDefinition[] = Array.from({ length: 20 }, (_, i) => ({
    id: `tier_${i}`,
    name: `Tier ${i}`,
    color: '#3B82F6',
    hotkey: i < 10 ? String(i) : '',
    order: i,
  }));
  const models: ModelRecord[] = Array.from({ length: 2000 }, (_, i) => ({
    id: `m_${i}`,
    username: `model_${i}`,
    displayName: `Model ${i}`,
    originalLink: `https://chaturbate.com/model_${i}/`,
    tierId: tiers[i % tiers.length].id,
    order: Math.floor(i / tiers.length),
    cbexplorerAdded: false,
    thumbnail: '',
    notes: '',
    tags: [],
    customLinks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));

  let currentAppData: AppData = {
    version: 2,
    inbox: { id: 'inbox', name: 'Inbox', color: '#94A3B8', hotkey: '0' },
    tiers,
    models,
    trashedModels: [],
    settings: createDefaultAppData().settings,
  };

  // 1. Rapid Tier Re-ordering (Simulating user rapidly dragging and reordering tiers 300 times)
  const tierReorderStart = Date.now();
  for (let round = 0; round < 300; round++) {
    const shuffledIds = [...currentAppData.tiers.map((t) => t.id)].sort(() => Math.random() - 0.5);
    const byId = new Map(currentAppData.tiers.map((t) => [t.id, t]));
    const reordered: TierDefinition[] = [];
    shuffledIds.forEach((id, idx) => {
      const item = byId.get(id);
      if (item) {
        reordered.push({ ...item, order: idx });
        byId.delete(id);
      }
    });
    for (const leftover of byId.values()) {
      reordered.push({ ...leftover, order: reordered.length });
    }
    currentAppData = { ...currentAppData, tiers: reordered };
  }
  const tierReorderTime = Date.now() - tierReorderStart;
  console.log(`[STRESS 2] 300 rapid tier reorders executed in ${tierReorderTime}ms`);
  assert.equal(currentAppData.tiers.length, 20);
  // Verify order sequences are continuous 0..19 without gaps or duplicates
  const orders = currentAppData.tiers.map((t) => t.order).sort((a, b) => a - b);
  for (let i = 0; i < 20; i++) {
    assert.equal(orders[i], i);
  }

  // 2. Batch Tier Reassignments (Simulating multi-select batch moving 500 models at a time, 10 rounds)
  const batchStart = Date.now();
  for (let round = 0; round < 10; round++) {
    const targetTierId = tiers[round % tiers.length].id;
    // Select 500 models
    const selectedIds = new Set(
      Array.from({ length: 500 }, (_, idx) => `m_${(round * 137 + idx) % 2000}`)
    );
    const now = new Date().toISOString();
    let nextOrder = currentAppData.models.reduce((acc, m) => Math.max(acc, m.order), -1);

    const nextModels = currentAppData.models.map((m) => {
      if (!selectedIds.has(m.id)) return m;
      nextOrder += 1;
      return {
        ...m,
        tierId: targetTierId,
        order: nextOrder,
        updatedAt: now,
        lastReviewedAt: now,
      };
    });
    currentAppData = { ...currentAppData, models: nextModels };
  }
  const batchTime = Date.now() - batchStart;
  console.log(`[STRESS 2] 10 rounds of 500-model batch reassignments took ${batchTime}ms`);
  assert.equal(currentAppData.models.length, 2000);

  // 3. Fast Keyboard Shortcut Rapid-Fire Simulation (Simulating Rapid Sorter deck sorting 1,000 operations)
  // In RapidSorterView: keys 1..9, Space (skip), Z / Backspace (undo)
  const triageStart = Date.now();
  let deck = [...currentAppData.models];
  const deckHistory: Array<{
    action: 'sort' | 'skip';
    modelId: string;
    previousTierId: string;
    previousOrder: number;
    previousReviewedAt?: string;
  }> = [];
  const skippedIds: string[] = [];
  const sessionSortedIds: string[] = [];
  const bypassedIds: string[] = [];

  let sortCount = 0;
  let skipCount = 0;
  let undoCount = 0;

  for (let step = 0; step < 1000; step++) {
    // Current active model:
    const sortedSet = new Set(sessionSortedIds);
    const bypassedSet = new Set(bypassedIds);
    const eligible = deck.filter((m) => !sortedSet.has(m.id) && !bypassedSet.has(m.id));
    if (eligible.length === 0) {
      // Deck finished or reset
      break;
    }

    const activeModel = eligible[0];
    const op = step % 7; // Mix of sort, skip, and undo

    if (op === 5 && deckHistory.length > 0) {
      // Undo
      const last = deckHistory.pop()!;
      if (last.action === 'sort') {
        const idx = sessionSortedIds.indexOf(last.modelId);
        if (idx !== -1) sessionSortedIds.splice(idx, 1);
        deck = deck.map((m) =>
          m.id === last.modelId
            ? { ...m, tierId: last.previousTierId, order: last.previousOrder, lastReviewedAt: last.previousReviewedAt }
            : m
        );
      } else {
        const sIdx = skippedIds.indexOf(last.modelId);
        if (sIdx !== -1) skippedIds.splice(sIdx, 1);
        const bIdx = bypassedIds.indexOf(last.modelId);
        if (bIdx !== -1) bypassedIds.splice(bIdx, 1);
      }
      undoCount++;
    } else if (op === 3) {
      // Skip
      deckHistory.push({
        action: 'skip',
        modelId: activeModel.id,
        previousTierId: activeModel.tierId,
        previousOrder: activeModel.order,
        previousReviewedAt: activeModel.lastReviewedAt,
      });
      if (skippedIds.includes(activeModel.id)) {
        skippedIds.splice(skippedIds.indexOf(activeModel.id), 1);
        bypassedIds.push(activeModel.id);
      } else {
        skippedIds.push(activeModel.id);
      }
      skipCount++;
    } else {
      // Sort to tier
      const targetTierId = tiers[step % tiers.length].id;
      deckHistory.push({
        action: 'sort',
        modelId: activeModel.id,
        previousTierId: activeModel.tierId,
        previousOrder: activeModel.order,
        previousReviewedAt: activeModel.lastReviewedAt,
      });
      sessionSortedIds.push(activeModel.id);
      deck = deck.map((m) =>
        m.id === activeModel.id
          ? { ...m, tierId: targetTierId, lastReviewedAt: new Date().toISOString() }
          : m
      );
      sortCount++;
    }
  }

  const triageTime = Date.now() - triageStart;
  console.log(`[STRESS 2] 1,000 rapid triage actions executed in ${triageTime}ms (${sortCount} sorts, ${skipCount} skips, ${undoCount} undos)`);
  assert.equal(deck.length, 2000);

  // 4. Concurrent `persistData` Saves Hammering:
  // Fire 50 concurrent saves into JsonStorageService simultaneously
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'watchpulse-concurrent-'));
  try {
    const storage = new JsonStorageService(tempDir);
    const concurrentStart = Date.now();
    const savePromises: Promise<AppData>[] = [];

    for (let c = 0; c < 50; c++) {
      const mutatedData: AppData = {
        ...currentAppData,
        settings: {
          ...currentAppData.settings,
          defaultReviewCadenceDays: 10 + (c % 20),
        },
      };
      savePromises.push(storage.save(mutatedData));
    }

    const results = await Promise.all(savePromises);
    const concurrentTime = Date.now() - concurrentStart;
    console.log(`[STRESS 2] 50 concurrent JsonStorageService.save calls resolved in ${concurrentTime}ms`);
    assert.equal(results.length, 50);

    // Verify disk content is valid JSON and not corrupt
    const fileContent = await fs.readFile(storage.getDataFilePath(), 'utf-8');
    const parsedFromDisk = JSON.parse(fileContent);
    assert.equal(parsedFromDisk.models.length, 2000);

    // Test saveSync during active asynchronous writes
    const syncStart = Date.now();
    const syncData: AppData = {
      ...currentAppData,
      inbox: { ...currentAppData.inbox, name: 'Inbox Sync Updated' },
    };
    storage.saveSync(syncData);
    const syncTime = Date.now() - syncStart;
    console.log(`[STRESS 2] JsonStorageService.saveSync took ${syncTime}ms`);

    const loadedAfterSync = await storage.load();
    assert.equal(loadedAfterSync.inbox.name, 'Inbox Sync Updated');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
});

test('STRESS 3: CSV & JSON Bulk Imports - Dirty 1,000-Row CSVs and Raw JSON Payloads', async (t) => {
  console.log('\n--- Starting STRESS 3: CSV & JSON Bulk Imports ---');

  // 1. Build a 1,000-row extremely dirty CSV
  // Dirty edge cases:
  // - Jagged rows (1 column, 2 columns, 10 columns)
  // - Embedded newlines inside quotes
  // - Unescaped quotes and semicolons/tabs
  // - Giant notes field (5KB of text in a cell)
  // - Mixed casing, leading @ signs, spaces, URLs with anchors, query params
  // - Cyrillic/Unicode characters and emojis
  // - Empty rows, rows with only whitespace
  // - Intra-batch duplicates (same handle appearing 5 times)
  // - 200 handles colliding with existing models
  const existingModels: ModelRecord[] = Array.from({ length: 500 }, (_, i) => ({
    id: `exist_${i}`,
    username: `existing_model_${i}`,
    displayName: `Existing Model ${i}`,
    originalLink: `https://chaturbate.com/existing_model_${i}/`,
    tierId: 'inbox',
    order: i,
    cbexplorerAdded: false,
    thumbnail: '',
    notes: 'Initial notes',
    tags: ['initial'],
    customLinks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));

  const csvRows: string[] = [];
  csvRows.push('Model Name,Original Link,Tier,Notes,Tags,Thumbnail,CBExplorer Watchlist');

  // Add 200 colliding rows
  for (let i = 0; i < 200; i++) {
    csvRows.push(
      `"  @EXISTING_MODEL_${i}  ","https://chaturbate.com/existing_model_${i}/?source=stress","Priority 1","Updated note via CSV with ""quotes"" and symbols <>&","tag1;tag2;duplicate_tag",,"yes"`
    );
  }

  // Add 500 fresh rows with varied formatting
  for (let i = 0; i < 500; i++) {
    if (i % 5 === 0) {
      // Plain URL only in first column
      csvRows.push(`"https://chaturbate.com/fresh_model_${i}/"`);
    } else if (i % 5 === 1) {
      // Model name only, handle with underscores and numbers
      csvRows.push(`"_fresh_model_${i}_",,"Watchlist"`);
    } else if (i % 5 === 2) {
      // Heavy notes with multiline and special unicode
      csvRows.push(
        `"fresh_model_${i}","https://www.cbhours.com/user/fresh_model_${i}.html","Backlog","Multiline note\nLine 2 with UTF-8 🌟🔥\nLine 3","vr;audio;1080p","https://img.test/thumb_${i}.jpg","1"`
      );
    } else if (i % 5 === 3) {
      // Tab separated inside row or extra columns
      csvRows.push(
        `"fresh_model_${i}","https://chaturbate.com/fresh_model_${i}/","Inactive","Quick note","chill",,,,"extra_col_1","extra_col_2"`
      );
    } else {
      // Large note (1KB text)
      const bigNote = `Note ${i}: ` + 'X'.repeat(1000);
      csvRows.push(
        `"fresh_model_${i}","https://chaturbate.com/fresh_model_${i}/","Priority 2","${bigNote}","latina;bilingual;verified",,"true"`
      );
    }
  }

  // Add 150 duplicate rows (intra-batch duplicates)
  for (let i = 0; i < 150; i++) {
    csvRows.push(`"fresh_model_${i}","https://chaturbate.com/fresh_model_${i}/","Watchlist"`);
  }

  // Add 150 malformed/empty/garbage rows
  for (let i = 0; i < 150; i++) {
    if (i % 3 === 0) {
      csvRows.push('    '); // Empty spaces
    } else if (i % 3 === 1) {
      csvRows.push(',,,,'); // Empty cells
    } else {
      csvRows.push('https://example.com/not-a-chaturbate-profile/12345'); // Non-model URL
    }
  }

  const rawCsvText = csvRows.join('\r\n');
  console.log(`[STRESS 3] Built 1,000-row dirty CSV (${(rawCsvText.length / 1024).toFixed(1)} KB)`);

  const csvParseStart = Date.now();
  const importResult = parseImportInput(rawCsvText, existingModels);
  const csvParseTime = Date.now() - csvParseStart;

  console.log(
    `[STRESS 3] parseImportInput parsed ${importResult.candidates.length} unique candidates in ${csvParseTime}ms (Warnings: ${importResult.warnings.length})`
  );
  assert.equal(importResult.candidates.length > 0, true);

  // Check duplicate detection in import
  const duplicates = importResult.candidates.filter((c) => c.isDuplicate);
  console.log(`[STRESS 3] Duplicate candidates matched against 500 existing models: ${duplicates.length}`);
  assert.equal(duplicates.length, 200);

  // 2. Stress Test Raw JSON Payloads & Corruptions
  console.log('[STRESS 3] Testing Malformed and Dirty JSON Payloads');

  // Payload A: Completely invalid / corrupt JSON string
  const malformedJsonString = '{"version": 2, "models": [{"id": "m1", "username": "corrupt"'; // missing closing braces
  let failedAsExpected = false;
  try {
    JSON.parse(malformedJsonString);
  } catch {
    failedAsExpected = true;
  }
  assert.equal(failedAsExpected, true);

  // Payload B: Highly dirty JSON structure passed into sanitizeAppData & sanitizeClientAppData
  const dirtyJsonPayload: any = {
    version: 'two', // invalid type
    inbox: {
      name: '   ', // whitespace only
      color: 'blue', // invalid hex
      hotkey: '00', // too long
    },
    tiers: [
      { id: 't1', name: 'Valid Tier', color: '#123456', order: 0, hotkey: '1' },
      { id: 't1', name: 'Duplicate ID Tier', color: 'invalid', order: 1, hotkey: '1' }, // Duplicate ID & duplicate hotkey
      { id: '', name: '', order: 'not_a_number', reviewCadenceDays: -5 }, // Empty id, invalid order, negative cadence
      null, // null tier entry
      12345, // primitive tier entry
      { id: 't_huge', name: 'Z'.repeat(1000), color: '#FFFFFF', order: 999 },
    ],
    models: [
      null,
      {},
      { id: 'm1', username: 'valid_user_1', tierId: 't1', order: 0 },
      { id: 'm1', username: 'valid_user_1', tierId: 't1', order: 1 }, // Duplicate model ID and duplicate username
      { id: 'm2', username: 'VALID_USER_1', tierId: 't1' }, // Case-insensitive duplicate
      { id: 'm3', username: '   ', tierId: 'non_existent_tier' }, // Whitespace username
      { id: 'm4', username: 'normal_user', tags: ['good', 123, null, 'tag2'], customLinks: [{ label: 'test' }, null, { url: 'https://test.com', label: 'ok' }] },
      {
        id: 'm5',
        username: 'presence_tester',
        presenceHours: {
          'invalid-bucket-key': 50,
          '2026-02-30T10': 30, // Feb 30th does not exist!
          '2026-11-21T25': 20, // Hour 25 does not exist!
          '2026-11-21T12': 45, // Valid!
          '2026-11-21T13': 999, // Overflow minutes > 60!
          '2026-11-21T14': -10, // Negative minutes!
        },
      },
    ],
    trashedModels: [
      { id: 'tr1', username: 'valid_user_1', deletedAt: '2020-01-01T00:00:00Z' }, // Already exists in active models + expired
      { id: 'tr2', username: 'trashed_user_2', deletedAt: '2026-11-20T00:00:00Z' }, // Valid fresh trashed model
    ],
    settings: {
      trashRetentionDays: -10,
      defaultReviewCadenceDays: 'fourteen',
      themeMode: 'ultra-neon-green', // Invalid theme mode
      urlTemplates: {
        cbhours: 'not-a-valid-template',
      },
      liveFeed: {
        endpointTemplate: 'https://cbexplorer.com/cbexplorer_users_online_v3.json', // Legacy deprecated feed template
        refreshIntervalSec: 2, // Less than minimum 10s
        maxPages: 100, // Greater than maximum 25
      },
    },
  };

  const cleanBackend = sanitizeAppData(dirtyJsonPayload);
  console.log(`[STRESS 3] sanitizeAppData hardened dirty payload:`);
  console.log(` - Inbox name defaulted: "${cleanBackend.inbox.name}", color: "${cleanBackend.inbox.color}"`);
  console.log(` - Tiers sanitized: ${cleanBackend.tiers.length} valid tiers`);
  console.log(` - Models sanitized: ${cleanBackend.models.length} valid models (duplicates eliminated)`);
  console.log(` - Trashed models: ${cleanBackend.trashedModels.length}`);
  console.log(` - Preserved valid presence bucket minutes: ${JSON.stringify(cleanBackend.models.find(m => m.username === 'presence_tester')?.presenceHours)}`);
  console.log(` - Settings themeMode: "${cleanBackend.settings.themeMode}", refreshInterval: ${cleanBackend.settings.liveFeed.refreshIntervalSec}s, maxPages: ${cleanBackend.settings.liveFeed.maxPages}`);

  assert.equal(cleanBackend.settings.themeMode, 'dark');
  assert.equal(cleanBackend.settings.liveFeed.refreshIntervalSec >= 10, true);
  assert.equal(cleanBackend.settings.liveFeed.maxPages <= 25, true);
  // February 30th and hour 25 must be rejected
  const presenceTester = cleanBackend.models.find((m) => m.username === 'presence_tester');
  assert.equal(presenceTester !== undefined, true);
  assert.equal(presenceTester?.presenceHours?.['2026-02-30T10'], undefined);
  assert.equal(presenceTester?.presenceHours?.['2026-11-21T25'], undefined);
  assert.equal(presenceTester?.presenceHours?.['2026-11-21T12'], 45);
  // 999 must be capped at 60
  assert.equal(presenceTester?.presenceHours?.['2026-11-21T13'], 60);

  // Prototype Pollution Safety Check
  const evilPayload = JSON.parse('{"__proto__": {"polluted": true}, "models": []}');
  const cleanEvil = sanitizeAppData(evilPayload);
  assert.equal((({} as any).polluted), undefined);
});

test('STRESS 4: Memory Bloat, Race Conditions, Dropped Mutations & Infinite Loops', async (t) => {
  console.log('\n--- Starting STRESS 4: Memory Bloat, Race Conditions & Edge Cases ---');

  // 1. Memory Bloat Check: 50 Iterations of Heavy Matrix Calculations & Sanitization
  const memBeforeLoop = getMemoryUsage();
  console.log(`[STRESS 4] Memory before 50-round stress loop: Heap ${formatBytes(memBeforeLoop.heapUsed)}`);

  // Generate 2,000 models with activity data
  const heavyModels: ModelRecord[] = Array.from({ length: 2000 }, (_, i) => {
    const presence: Record<string, number> = {};
    for (let h = 0; h < 50; h++) {
      const d = 10 + (h % 20);
      const hr = String(h % 24).padStart(2, '0');
      presence[`2026-11-${d}T${hr}`] = 30 + (h % 30);
    }
    return {
      id: `m_${i}`,
      username: `model_${i}`,
      displayName: `Model ${i}`,
      originalLink: `https://chaturbate.com/model_${i}/`,
      tierId: `tier_${i % 10}`,
      order: i,
      cbexplorerAdded: false,
      thumbnail: '',
      notes: 'Notes',
      tags: ['tag1'],
      customLinks: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      presenceHours: presence,
    };
  });

  const heavyData: AppData = {
    version: 2,
    inbox: { id: 'inbox', name: 'Inbox', color: '#94A3B8', hotkey: '0' },
    tiers: Array.from({ length: 10 }, (_, i) => ({
      id: `tier_${i}`,
      name: `Tier ${i}`,
      color: '#000000',
      hotkey: '',
      order: i,
    })),
    models: heavyModels,
    trashedModels: [],
    settings: createDefaultAppData().settings,
  };

  const loopStart = Date.now();
  for (let round = 0; round < 50; round++) {
    // Sanitize
    const s = sanitizeAppData(heavyData);
    // Review helper
    const helper = createModelReviewStatusHelper(s.models, s.tiers, 14, 30, Date.now(), 7);
    // Stratified offsets
    computeStratifiedReviewOffsets(s.models, 7);
    // Schedule matrix
    computeWatchlistScheduleMatrix(s.models);
  }
  const loopTime = Date.now() - loopStart;
  const memAfterLoop = getMemoryUsage();
  console.log(`[STRESS 4] 50 stress iterations completed in ${loopTime}ms (~${(loopTime / 50).toFixed(1)}ms/iter)`);
  console.log(`[STRESS 4] Memory after loop: Heap ${formatBytes(memAfterLoop.heapUsed)} (Delta: ${formatBytes(memAfterLoop.heapUsed - memBeforeLoop.heapUsed)})`);

  // 2. ReDoS / Regex Catastrophic Backtracking Stress
  const reDosStart = Date.now();
  const giantInput = 'https://chaturbate.com/' + 'a'.repeat(200000) + '///???###';
  const sanitizedHuge = sanitizeUsername(giantInput);
  const reDosTime = Date.now() - reDosStart;
  console.log(`[STRESS 4] sanitizeUsername on 200,000 char URL took ${reDosTime}ms (Result length: ${sanitizedHuge.length})`);
  assert.equal(reDosTime < 500, true); // Must execute under 500ms

  // Test extractRoomsFromPayload with huge payload
  const hugePayload = {
    results: Array.from({ length: 5000 }, (_, i) => ({
      username: `streamer_${i}`,
      num_users: i * 10,
      current_show: 'public',
      is_hd: true,
    })),
  };
  const { extractRoomsFromPayload } = await import('../src/utils/liveFeed');
  const feedExtractStart = Date.now();
  const extracted = extractRoomsFromPayload(hugePayload);
  const feedExtractTime = Date.now() - feedExtractStart;
  console.log(`[STRESS 4] extractRoomsFromPayload on 5,000 rooms took ${feedExtractTime}ms. Extracted: ${extracted.rooms.length}`);
  assert.equal(extracted.rooms.length, 5000);

  // 3. Race Condition Audit: Client persistData Debounce vs Async In-Flight Save vs Window Unload
  console.log('[STRESS 4] Testing Client persistData Debounce vs In-Flight Save Race Condition');

  // We will simulate the exact logic found in src/store/useAppStore.tsx:
  // lines 351-390:
  //
  // let saveTimer: any = null;
  // let hasPendingSave = false;
  // let latestData = initial;
  //
  // function persistData(nextData) {
  //   if (saveTimer) clearTimeout(saveTimer);
  //   hasPendingSave = true;
  //   saveTimer = setTimeout(() => {
  //     saveTimer = null;
  //     bridge.saveData(nextData).then(() => {
  //       hasPendingSave = false; // <-- POTENTIAL RACE CONDITION!
  //     });
  //   }, 180);
  // }
  //
  // function handleBeforeUnload() {
  //   if (!hasPendingSave) return; // <-- IF FALSE, DATA IS DROPPED!
  //   bridge.saveDataSync(latestData);
  // }

  let simulatedHasPendingSave = false;
  let simulatedSaveTimer: NodeJS.Timeout | null = null;
  let persistedOnDisk: AppData | null = null;
  let latestData = { ...heavyData, models: [{ ...heavyModels[0], displayName: 'Original' }] };

  const mockBridge = {
    async saveData(data: AppData): Promise<AppData> {
      // Simulate 100ms disk I/O latency for saving large workspace
      await new Promise((r) => setTimeout(r, 100));
      persistedOnDisk = data;
      return data;
    },
    saveDataSync(data: AppData) {
      persistedOnDisk = data;
    },
  };

  function simulatePersistData(nextData: AppData) {
    if (simulatedSaveTimer) clearTimeout(simulatedSaveTimer);
    simulatedHasPendingSave = true;
    latestData = nextData;
    simulatedSaveTimer = setTimeout(() => {
      simulatedSaveTimer = null;
      mockBridge.saveData(nextData).then(() => {
        // This is the buggy line from useAppStore.tsx line 365:
        simulatedHasPendingSave = false;
      });
    }, 180);
  }

  function simulateBeforeUnload() {
    if (!simulatedHasPendingSave) return;
    if (simulatedSaveTimer) {
      clearTimeout(simulatedSaveTimer);
      simulatedSaveTimer = null;
    }
    mockBridge.saveDataSync(latestData);
    simulatedHasPendingSave = false;
  }

  // Sequence of events:
  // t=0: Mutation 1 occurs
  const mutation1Data = { ...latestData, models: [{ ...heavyModels[0], displayName: 'Mutation 1' }] };
  simulatePersistData(mutation1Data);

  // t=180: Timer fires and mockBridge.saveData(mutation1Data) starts (takes 100ms, will resolve at t=280)
  await new Promise((r) => setTimeout(r, 190));

  // t=200: Mutation 2 occurs while Mutation 1 save is in-flight!
  const mutation2Data = { ...latestData, models: [{ ...heavyModels[0], displayName: 'Mutation 2 (CRITICAL EDITS)' }] };
  simulatePersistData(mutation2Data);
  assert.equal(simulatedHasPendingSave, true);

  // t=290: Mutation 1's mockBridge.saveData has finished, executing `.then(() => { simulatedHasPendingSave = false; })`
  await new Promise((r) => setTimeout(r, 110));

  console.log(`[STRESS 4] After Mutation 1 resolves while Mutation 2 timer is ticking:`);
  console.log(` - simulatedHasPendingSave is: ${simulatedHasPendingSave} (EXPECTED: true, ACTUAL in current code: false!)`);
  console.log(` - simulatedSaveTimer active: ${simulatedSaveTimer !== null}`);

  // t=300: User closes the tab/app right now before the 180ms debounce of Mutation 2 has fired!
  simulateBeforeUnload();

  console.log(` - Data currently on disk: "${persistedOnDisk?.models[0].displayName}"`);
  const dataLossDetected = persistedOnDisk?.models[0].displayName !== 'Mutation 2 (CRITICAL EDITS)';
  console.log(` - DATA LOSS DETECTED: ${dataLossDetected}`);

  if (dataLossDetected) {
    console.log(`[BUG DETECTED] Race condition in useAppStore.tsx persistData:`);
    console.log(`When an in-flight saveData() resolves, it unconditionally sets hasPendingSaveRef.current = false.`);
    console.log(`If another mutation occurred while the previous save was in flight, hasPendingSaveRef was prematurely reset to false.`);
    console.log(`When the user exits before the next debounce timer fires, handleBeforeUnload sees hasPendingSaveRef === false and skips saving!`);
  }

  // 4. Test 100,000 Presence Slots Memory Retention & Trimming
  console.log('[STRESS 4] Testing 100,000 Presence Slots Pruning & Memory Footprint');
  const nowMs = Date.now();
  let presenceAccumulator: Record<string, number> = {};
  for (let i = 0; i < 2000; i++) {
    // Generate dates spanning 180 days (some older than 90d retention limit)
    const dt = new Date(nowMs - i * 2 * 3600 * 1000);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    const hr = String(dt.getHours()).padStart(2, '0');
    presenceAccumulator[`${y}-${m}-${day}T${hr}`] = 45;
  }
  assert.equal(Object.keys(presenceAccumulator).length, 2000);

  const pruneStart = Date.now();
  const pruned = recordPresenceTick(presenceAccumulator, 15);
  const pruneTime = Date.now() - pruneStart;
  const prunedKeys = Object.keys(pruned);
  console.log(`[STRESS 4] recordPresenceTick pruned 2,000 slots down to ${prunedKeys.length} in ${pruneTime}ms (Retention: 90 days)`);
  assert.equal(prunedKeys.length < 2000, true);
  assert.equal(prunedKeys.length > 0, true);
});
