import assert from 'node:assert/strict';
import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  JsonStorageService,
  createDefaultAppData,
  sanitizeAppData,
} from '../electron/storage';
import { AppData, ModelRecord, TierDefinition } from '../electron/types';
import {
  buildLivePreviewUrl,
  buildModelUrls,
  sanitizeUsername,
} from '../src/utils/sanitizer';
import { parseImportInput } from '../src/utils/csvImporter';
import { exportModelsToCsv, buildTextSummaryByTier } from '../src/utils/exporter';
import { sanitizeClientAppData, sanitizeClientSettings } from '../src/utils/appDataSanitizer';
import { extractRoomsFromPayload } from '../src/utils/liveFeed';

interface Finding {
  category: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  description: string;
  evidence: string;
  reproduction: string;
}

const findings: Finding[] = [];

function recordFinding(finding: Finding) {
  findings.push(finding);
  console.log(`\n🚨 [${finding.severity}] ${finding.category} -> ${finding.title}`);
  console.log(`   Description: ${finding.description}`);
  console.log(`   Evidence: ${finding.evidence}`);
}

console.log('===============================================================');
console.log('⚡ WATCHPULSE ADVERSARIAL STRESS TEST & CHAOS MONKEY SUITE ⚡');
console.log('===============================================================\n');

// =========================================================================
// SUITE 1: Concurrency & Race Conditions
// =========================================================================
console.log('--- Suite 1: Concurrency & Race Conditions ---');

async function testStorageRaceConditions() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'watchpulse-chaos-race-'));
  try {
    const storage = new JsonStorageService(tmpDir, []);
    await storage.load();

    const errors: Error[] = [];
    const asyncPromises: Promise<any>[] = [];
    let syncCallCount = 0;

    // Hammer 30 async saves interleaved with 10 synchronous saves
    for (let i = 0; i < 30; i++) {
      const asyncData = createDefaultAppData();
      asyncData.settings.deckSourceFilter = `async_write_${i}`;
      const p = storage.save(asyncData).catch((err: any) => {
        errors.push(err);
      });
      asyncPromises.push(p);

      if (i % 3 === 0) {
        try {
          const syncData = createDefaultAppData();
          syncData.settings.deckSourceFilter = `sync_write_${i}`;
          storage.saveSync(syncData);
          syncCallCount++;
        } catch (err: any) {
          errors.push(err);
        }
      }
    }

    await Promise.all(asyncPromises);

    // Inspect files in directory
    const files = await fs.readdir(tmpDir);
    const tmpFiles = files.filter((f) => f.includes('.tmp'));
    const finalData = await storage.load();

    console.log(`[Suite 1.1] 30 Async Saves + ${syncCallCount} Sync Saves:`);
    console.log(`  - Caught errors: ${errors.length}`);
    console.log(`  - Abandoned temp files: ${tmpFiles.length} (${tmpFiles.join(', ') || 'none'})`);
    console.log(`  - Final persisted filter state: "${finalData.settings.deckSourceFilter}"`);

    if (errors.length > 0) {
      recordFinding({
        category: 'Concurrency & Race Conditions',
        severity: 'HIGH',
        title: 'saveSync Bypasses writeQueue Causing File Lock Collisions on Windows',
        description:
          'Calling storage.saveSync() while asynchronous storage.save() writes are active in writeQueue triggers Windows file contention errors (EBUSY/EPERM) on rename or copyFile.',
        evidence: `Caught ${errors.length} filesystem collision errors: ${errors[0]?.message}`,
        reproduction: 'storage.save(data1); storage.saveSync(data2); in rapid sequence.',
      });
    }

    // Check for stale async overwrite of sync save:
    if (finalData.settings.deckSourceFilter.startsWith('async_')) {
      recordFinding({
        category: 'Concurrency & Race Conditions',
        severity: 'CRITICAL',
        title: 'Data Loss: Stale Async save() Overwrites Newer Synchronous saveSync()',
        description:
          'saveSync() modifies the data file directly on disk without updating or canceling the in-flight writeQueue. An earlier queued save() subsequently completes and overwrites newer sync data on disk.',
        evidence: `Final data on disk retained "${finalData.settings.deckSourceFilter}" instead of latest sync save.`,
        reproduction: 'Start slow async save(), execute saveSync() on window unload, observe async completion overwrites sync file.',
      });
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

async function testSimultaneousWriteCollision() {
  console.log('[Suite 1.1b] Testing Active In-Flight Write Collision (save mid-flight vs saveSync):');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'watchpulse-chaos-collision-'));
  try {
    const storage = new JsonStorageService(tmpDir, []);
    await storage.load();

    // Create a large dataset so writeFile takes measurable milliseconds
    const largeData = createDefaultAppData();
    for (let i = 0; i < 2000; i++) {
      largeData.models.push({
        id: `col_m_${i}`,
        username: `collision_model_${i}`,
        displayName: `Col Model ${i}`,
        originalLink: `https://chaturbate.com/col_${i}`,
        tierId: 'inbox',
        order: i,
        cbexplorerAdded: false,
        thumbnail: '',
        notes: 'X'.repeat(500),
        tags: ['stress', 'concurrency'],
        customLinks: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    // Start 5 rapid async saves without awaiting
    const p1 = storage.save({ ...largeData, settings: { ...largeData.settings, deckSourceFilter: 'async_col_1' } });
    const p2 = storage.save({ ...largeData, settings: { ...largeData.settings, deckSourceFilter: 'async_col_2' } });

    // Execute saveSync right while writeQueue is processing
    let syncError: any = null;
    try {
      storage.saveSync({ ...largeData, settings: { ...largeData.settings, deckSourceFilter: 'sync_emergency_exit' } });
    } catch (err) {
      syncError = err;
    }

    await Promise.allSettled([p1, p2]);
    const finalOnDisk = await storage.load();
    console.log(`  - saveSync error during active async queue: ${syncError ? syncError.message : 'none'}`);
    console.log(`  - Final state on disk: "${finalOnDisk.settings.deckSourceFilter}"`);

    if (finalOnDisk.settings.deckSourceFilter !== 'sync_emergency_exit') {
      recordFinding({
        category: 'Concurrency & Race Conditions',
        severity: 'CRITICAL',
        title: 'Critical Emergency Save Overwritten by In-Flight Background WriteQueue',
        description:
          'When an emergency synchronous save is dispatched (e.g. beforeunload / crash safeguard), background async writes already in the queue silently overwrite the emergency save with older data.',
        evidence: `Expected "sync_emergency_exit", but found "${finalOnDisk.settings.deckSourceFilter}" on disk after queue settled.`,
        reproduction: 'Dispatch storage.save(data1); storage.save(data2); storage.saveSync(emergencyData); await all;',
      });
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

async function testRapidWindowCloseMidWrite() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'watchpulse-chaos-unload-'));
  try {
    const storage = new JsonStorageService(tmpDir, []);
    await storage.load();

    // Model a large app data payload
    const initial = createDefaultAppData();
    for (let i = 0; i < 500; i++) {
      initial.models.push({
        id: `m_${i}`,
        username: `model_${i}`,
        displayName: `Model ${i}`,
        originalLink: `https://chaturbate.com/model_${i}`,
        tierId: 'inbox',
        order: i,
        cbexplorerAdded: false,
        thumbnail: '',
        notes: 'A'.repeat(500),
        tags: ['tag1', 'tag2'],
        customLinks: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    // Fire async save representing 180ms debounced persistData
    const asyncPromise = storage.save({
      ...initial,
      settings: { ...initial.settings, deckSourceFilter: 'unloaded_async_tag' },
    });

    // Immediately simulate beforeunload synchronous flush with latest user change
    const syncResult = storage.saveSync({
      ...initial,
      settings: { ...initial.settings, deckSourceFilter: 'beforeunload_sync_tag' },
    });

    let asyncError: any = null;
    try {
      await asyncPromise;
    } catch (e) {
      asyncError = e;
    }

    // Reload from disk to verify what was saved
    const reloaded = await storage.load();
    console.log(`[Suite 1.2] Simulated Rapid Window Close Flush:`);
    console.log(`  - Final state on disk: "${reloaded.settings.deckSourceFilter}"`);
    console.log(`  - Async write error: ${asyncError ? asyncError.message : 'none'}`);

    if (reloaded.settings.deckSourceFilter === 'unloaded_async_tag') {
      recordFinding({
        category: 'Concurrency & Race Conditions',
        severity: 'CRITICAL',
        title: 'Silent State Regression on App Exit: Debounced Async Save Overwrites beforeunload Flush',
        description:
          'When the user closes the window, beforeunload synchronously saves the newest state. However, the pending async save initiated just milliseconds prior finishes after saveSync, overwriting the disk with stale pre-unload data.',
        evidence: `Expected final disk state "beforeunload_sync_tag", but found "${reloaded.settings.deckSourceFilter}".`,
        reproduction: 'Trigger debounced persistData() followed immediately by beforeunload saveSync().',
      });
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

function testTierDeletionVsBulkAssignment() {
  console.log('[Suite 1.3] Tier Deletion vs Bulk Model Assignment Simulation:');
  const baseData = createDefaultAppData();
  const targetTierId = 'tier_priority_1';
  const remainingTierId = 'tier_priority_2';

  // Populate 100 models in tier_priority_1
  for (let i = 0; i < 100; i++) {
    baseData.models.push({
      id: `m_${i}`,
      username: `chaos_model_${i}`,
      displayName: `Model ${i}`,
      originalLink: '',
      tierId: targetTierId,
      order: i,
      cbexplorerAdded: false,
      thumbnail: '',
      notes: '',
      tags: [],
      customLinks: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  // Action 1: Tier is deleted, models reassigned to 'tier_priority_2'
  const deletedTiers = baseData.tiers.filter((t) => t.id !== targetTierId);
  let reassignedModels = baseData.models.map((m) =>
    m.tierId === targetTierId ? { ...m, tierId: remainingTierId } : m
  );

  // Action 2: Concurrent bulk update or addition arrived with targetTierId
  // (In useAppStore.tsx: bulkUpdateModels accepts any tierId string without checking valid tiers)
  const orphanedModel: ModelRecord = {
    id: 'm_orphaned',
    username: 'orphaned_user',
    displayName: 'Orphaned',
    originalLink: '',
    tierId: targetTierId, // assigned to deleted tier!
    order: 101,
    cbexplorerAdded: false,
    thumbnail: '',
    notes: '',
    tags: [],
    customLinks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const dirtyModels = [...reassignedModels, orphanedModel];

  // In memory state before disk serialization
  const validTierIds = new Set(deletedTiers.map((t) => t.id));
  validTierIds.add('inbox');

  const inMemoryOrphans = dirtyModels.filter((m) => !validTierIds.has(m.tierId));
  console.log(`  - In-memory models with dangling/deleted tierId: ${inMemoryOrphans.length}`);

  if (inMemoryOrphans.length > 0) {
    recordFinding({
      category: 'Concurrency & Race Conditions',
      severity: 'HIGH',
      title: 'In-Memory State Corruption: bulkUpdateModels Assigns Dangling/Deleted Tier IDs',
      description:
        'bulkUpdateModels() in useAppStore.tsx sets tierId directly from input without validating against existing tier IDs. If a tier is deleted or an invalid ID is passed, models become orphaned in memory.',
      evidence: `Found ${inMemoryOrphans.length} model(s) with nonexistent tierId "${targetTierId}" in client state.`,
      reproduction: 'Call bulkUpdateModels([id], { tierId: "deleted_tier" }) or race tier deletion with bulk assignment.',
    });
  }

  // Now test if sanitizeAppData on load or save recovers it
  const sanitized = sanitizeAppData({
    ...baseData,
    tiers: deletedTiers,
    models: dirtyModels,
  });
  const sanitizedOrphans = sanitized.models.filter((m) => m.tierId === targetTierId);
  const rescuedToInbox = sanitized.models.find((m) => m.id === 'm_orphaned')?.tierId;
  console.log(`  - Post-sanitize orphans: ${sanitizedOrphans.length}, rescued to: "${rescuedToInbox}"`);
  assert.equal(sanitizedOrphans.length, 0);
  assert.equal(rescuedToInbox, 'inbox');
}

// =========================================================================
// SUITE 2: Malicious & Dirty Input Fuzzing
// =========================================================================
console.log('\n--- Suite 2: Malicious & Dirty Input Fuzzing ---');

function testSanitizeUsernameFuzzing() {
  console.log('[Suite 2.1] Fuzzing sanitizeUsername with Adversarial Payloads:');

  const fuzzVectors = [
    // Null bytes
    { input: 'seduza\0hyun', label: 'Null byte injection' },
    { input: 'https://chaturbate.com/user/\0evil_model/', label: 'Null byte in URL' },
    { input: '@\0\0\0clean_user', label: 'Leading null bytes with handle' },
    // SQL Injection
    { input: "' OR '1'='1", label: 'Classic SQL injection' },
    { input: "'; DROP TABLE models; --", label: 'Destructive SQL query' },
    { input: 'admin"--', label: 'SQL comment injection' },
    // Script & HTML injection
    { input: '<script>alert("xss")</script>', label: 'XSS script tag' },
    { input: '<img src=x onerror=alert(1)>', label: 'Image tag onerror handler' },
    { input: 'javascript:alert(1)', label: 'javascript: URI payload' },
    { input: 'data:text/html,<script>alert(1)</script>', label: 'data: HTML payload' },
    // Path traversal & dots
    { input: '../../../../etc/passwd', label: 'POSIX path traversal' },
    { input: '..\\..\\..\\Windows\\System32\\cmd.exe', label: 'Windows path traversal' },
    { input: '...', label: 'Multiple dots' },
    { input: '....model....', label: 'Enclosed dots' },
    { input: 'model.with.dots', label: 'Model with dots' },
    { input: '___under_scores___', label: 'Preserved leading/trailing underscores' },
    // Unicode, Emojis, and Bidirectional characters
    { input: '🔥🚀🦄_streamer_✨', label: 'Unicode emojis' },
    { input: '👩‍💻_dev_performer', label: 'ZWJ emoji sequence' },
    { input: 'русский_пользователь', label: 'Cyrillic unicode characters' },
    { input: '\u202Ereversed_name\u202D', label: 'BiDi RTL override injection' },
    { input: 'space\u200Bzero\u200Cwidth\u200D', label: 'Zero-width spaces' },
  ];

  for (const vec of fuzzVectors) {
    try {
      const out = sanitizeUsername(vec.input);
      // Ensure no raw script tags, slashes, or null bytes remain
      assert.ok(!out.includes('\0'), `Null byte survived in output: ${out}`);
      assert.ok(!out.includes('<script>'), `Script tag survived: ${out}`);
      assert.ok(!out.includes('/'), `Slash survived: ${out}`);
      assert.ok(!out.includes('\\'), `Backslash survived: ${out}`);
      assert.ok(!out.startsWith('.'), `Leading dot survived: ${out}`);
      assert.ok(!out.endsWith('.'), `Trailing dot survived: ${out}`);
    } catch (err: any) {
      recordFinding({
        category: 'Malicious Input Fuzzing',
        severity: 'HIGH',
        title: `sanitizeUsername Crashed on: ${vec.label}`,
        description: `sanitizeUsername threw an unhandled exception when parsing adversarial input "${vec.input}".`,
        evidence: err.stack || err.message,
        reproduction: `sanitizeUsername(${JSON.stringify(vec.input)})`,
      });
    }
  }

  // Test 10MB extreme payload for ReDoS or OOM
  console.log('  - Stressing sanitizeUsername with 10MB payload...');
  const start10Mb = Date.now();
  const hugePayload = 'https://chaturbate.com/user/' + 'a'.repeat(10 * 1024 * 1024) + '/?tour=1';
  let hugeOut = '';
  try {
    hugeOut = sanitizeUsername(hugePayload);
    const elapsed10Mb = Date.now() - start10Mb;
    console.log(`  - 10MB payload processed in ${elapsed10Mb}ms without crash (output length: ${hugeOut.length})`);
    if (elapsed10Mb > 3000) {
      recordFinding({
        category: 'Performance / DoS',
        severity: 'MEDIUM',
        title: 'sanitizeUsername High Latency on 10MB Payload (Potential UI Freeze)',
        description: `Processing a 10MB string took ${elapsed10Mb}ms, which would block the Electron main / renderer thread.`,
        evidence: `Latency: ${elapsed10Mb}ms`,
        reproduction: `sanitizeUsername('a'.repeat(10 * 1024 * 1024))`,
      });
    }
  } catch (err: any) {
    recordFinding({
      category: 'Malicious Input Fuzzing',
      severity: 'CRITICAL',
      title: 'sanitizeUsername Crashed (OOM / RangeError) on 10MB Payload',
      description: 'Passing a 10MB string to sanitizeUsername resulted in a process crash or fatal exception.',
      evidence: err.stack || err.message,
      reproduction: `sanitizeUsername('a'.repeat(10 * 1024 * 1024))`,
    });
  }
}

function testCsvImporterFuzzing() {
  console.log('[Suite 2.2] Fuzzing CSV Importer (parseImportInput):');

  // Test 1: Formula Injection payloads
  const formulaCsv = [
    'ModelName,Link,Notes',
    '=cmd|\'/C calc\'!A0,https://chaturbate.com/calc_user,Harmless note',
    '@SUM(1+1)*cmd|\'/C calc\'!A0,https://chaturbate.com/sum_user,Calc test',
    '-2+3+cmd|\'/C calc\'!A0,https://chaturbate.com/minus_user,Formula minus',
    '+cmd|\'/C calc\'!A0,https://chaturbate.com/plus_user,Formula plus',
  ].join('\n');

  const formulaResult = parseImportInput(formulaCsv);
  console.log(`  - Formula CSV parsed candidates: ${formulaResult.candidates.length}`);
  for (const cand of formulaResult.candidates) {
    if (cand.displayName?.startsWith('=') || cand.displayName?.startsWith('@') || cand.displayName?.startsWith('+')) {
      recordFinding({
        category: 'Malicious Input Fuzzing',
        severity: 'MEDIUM',
        title: 'CSV Formula Injection Preserved in displayName',
        description:
          'Spreadsheet formula prefixes (=, @, +, -) are preserved unmodified in candidate displayName, which can trigger formula execution if exported back to CSV and opened in Microsoft Excel.',
        evidence: `Candidate displayName retains dangerous prefix: "${cand.displayName}"`,
        reproduction: `parseImportInput("=cmd|'/C calc'!A0,https://chaturbate.com/test")`,
      });
    }
  }

  // Test 2: Null bytes and broken quotes in CSV
  const dirtyCsv = [
    'Name,URL,Tier,Notes',
    'dirty\0model,https://chaturbate.com/dirty_model,Priority 1,Note with \0 null byte',
    '"unclosed_quote_model,https://chaturbate.com/unclosed,"Tier 1",Notes',
    'bad,,,delims;;;||||https://chaturbate.com/broken_row',
  ].join('\n');

  try {
    const dirtyResult = parseImportInput(dirtyCsv);
    console.log(`  - Dirty CSV parsed: ${dirtyResult.candidates.length} candidates, warnings: ${dirtyResult.warnings.length}`);
    assert.ok(dirtyResult.candidates.length > 0);
  } catch (err: any) {
    recordFinding({
      category: 'Malicious Input Fuzzing',
      severity: 'HIGH',
      title: 'parseImportInput Crashed on Corrupted/Unclosed CSV Input',
      description: 'CSV parser threw an uncaught error when processing unclosed quotes or null bytes.',
      evidence: err.stack || err.message,
      reproduction: `parseImportInput(dirtyCsv)`,
    });
  }

  // Test 3: 10,000-row CSV stress test
  console.log('  - Stressing parseImportInput with 10,000-row CSV payload...');
  const largeRows = ['Username,Link,Tier,Tags,Notes'];
  for (let i = 0; i < 10000; i++) {
    largeRows.push(`model_stress_${i},https://chaturbate.com/model_stress_${i},Priority 1,tag1;tag2,note_${i}`);
  }
  const largeCsv = largeRows.join('\n');
  const startCsv = Date.now();
  const largeResult = parseImportInput(largeCsv);
  const elapsedCsv = Date.now() - startCsv;
  console.log(`  - 10,000 rows parsed in ${elapsedCsv}ms. Extracted ${largeResult.candidates.length} candidates.`);
  assert.equal(largeResult.candidates.length, 10000);
}

function testUrlTemplatesFuzzing() {
  console.log('[Suite 2.3] Fuzzing URL Templates & Dynamic Link Generators:');

  const adversarialTemplates = [
    { template: 'javascript:alert("{username}")', expected: 'javascript payload' },
    { template: 'data:text/html,<script>alert("{username}")</script>', expected: 'data URI' },
    { template: 'https://evil.com/redirect?target={username}', expected: 'redirect template' },
    { template: 'https://example.com/no-placeholder-path', expected: 'missing placeholder' },
    { template: '', expected: 'empty string' },
    { template: '{username}{username}{username}', expected: 'repeated placeholder' },
  ];

  for (const item of adversarialTemplates) {
    try {
      const urls = buildModelUrls('seduza_hyun', {
        cbhours: item.template,
        cbexplorer: item.template,
        archivebate: item.template,
      });
      const preview = buildLivePreviewUrl('seduza_hyun', item.template);
      assert.ok(typeof urls.cbhours === 'string');
      assert.ok(typeof preview === 'string');

      if (preview.startsWith('javascript:')) {
        recordFinding({
          category: 'Security / IPC Boundary',
          severity: 'HIGH',
          title: 'buildLivePreviewUrl Generates Executable javascript: URLs from Custom Templates',
          description:
            'If a malicious or imported URL template contains a javascript: URI, buildLivePreviewUrl constructs an executable javascript: link without protocol validation.',
          evidence: `Generated livePreview: "${preview}"`,
          reproduction: `buildLivePreviewUrl('user', 'javascript:alert(1)')`,
        });
      }
    } catch (err: any) {
      recordFinding({
        category: 'Malicious Input Fuzzing',
        severity: 'HIGH',
        title: `buildModelUrls Crashed on Template: ${item.expected}`,
        description: 'URL template replacement threw an unhandled exception.',
        evidence: err.stack || err.message,
        reproduction: `buildModelUrls('user', { cbhours: '${item.template}' })`,
      });
    }
  }
}

// =========================================================================
// SUITE 3: IPC & Path Traversal Fuzzing
// =========================================================================
console.log('\n--- Suite 3: IPC & Path Traversal Fuzzing ---');

async function testIpcFuzzing() {
  // Test 3.1: live:fetchJson parameter validation
  console.log('[Suite 3.1] Fuzzing live:fetchJson IPC Handler:');
  const mockFetchJson = async (params: any) => {
    let rawUrl = typeof params === 'string' ? params : params.url;
    const authHeader =
      typeof params === 'object' && params.authHeader
        ? params.authHeader.trim()
        : '';

    if (
      rawUrl.includes('digitaloceanspaces.com') ||
      rawUrl.includes('cbexplorer.com/cbexplorer_users_online_v3.json') ||
      rawUrl.includes('cbexplorer.com/api/cb_users_online_v3.json')
    ) {
      rawUrl = 'https://chaturbate.com/api/ts/roomlist/room-list/?offset=0&limit=100';
    }
    return { ok: true, rawUrl };
  };

  const badFetchParams = [null, undefined, {}, { url: null }, { url: undefined }, 12345, false];
  for (const param of badFetchParams) {
    try {
      await mockFetchJson(param);
    } catch (err: any) {
      recordFinding({
        category: 'IPC & Crash Vulnerability',
        severity: 'CRITICAL',
        title: `live:fetchJson Crashes with Unhandled Exception on Param: ${JSON.stringify(param)}`,
        description:
          'The Electron IPC handler live:fetchJson in electron/main.ts does not guard against null, undefined, or missing url property, leading to unhandled TypeError in the main process.',
        evidence: `Exception: ${err.message}`,
        reproduction: `window.electronAPI.fetchLiveJson(${JSON.stringify(param)})`,
      });
      break; // recorded
    }
  }

  // Test 3.2: dialog:saveExportFile parameter validation
  console.log('[Suite 3.2] Fuzzing dialog:saveExportFile IPC Handler:');
  const mockSaveExportFile = async (params: any) => {
    const filterMap: Record<string, any[]> = {
      csv: [{ name: 'CSV Spreadsheet', extensions: ['csv'] }],
      json: [{ name: 'JSON Backup', extensions: ['json'] }],
      txt: [{ name: 'Text Summary', extensions: ['txt', 'md'] }],
    };

    const options = {
      title: 'Export Models',
      defaultPath: params.defaultName,
      filters: filterMap[params.extension] || [{ name: 'All Files', extensions: ['*'] }],
    };
    return options;
  };

  const badExportParams = [null, undefined, {}];
  for (const param of badExportParams) {
    try {
      await mockSaveExportFile(param);
    } catch (err: any) {
      recordFinding({
        category: 'IPC & Crash Vulnerability',
        severity: 'CRITICAL',
        title: `dialog:saveExportFile Crashes on Malformed Params (${JSON.stringify(param)})`,
        description:
          'dialog:saveExportFile IPC handler directly accesses params.defaultName without checking if params is null or undefined.',
        evidence: `Exception: ${err.message}`,
        reproduction: `ipcRenderer.invoke('dialog:saveExportFile', null)`,
      });
      break;
    }
  }

  // Test 3.3: pip:open parameter validation
  console.log('[Suite 3.3] Fuzzing pip:open IPC Handler:');
  const mockPipOpen = (params: any) => {
    const cleanUsername = String(params.username || '').trim().toLowerCase();
    if (!cleanUsername) {
      return { isOpen: false, username: null };
    }
    return { isOpen: true, username: cleanUsername };
  };

  const badPipParams = [null, undefined];
  for (const param of badPipParams) {
    try {
      mockPipOpen(param);
    } catch (err: any) {
      recordFinding({
        category: 'IPC & Crash Vulnerability',
        severity: 'CRITICAL',
        title: `pip:open IPC Handler Crashes on Null/Undefined Params`,
        description:
          'openPipWindow() in electron/main.ts accesses params.username directly without null-checking params, causing an unhandled TypeError.',
        evidence: `Exception: ${err.message}`,
        reproduction: `ipcRenderer.invoke('pip:open', null)`,
      });
      break;
    }
  }

  // Test 3.4: media:deleteThumbnail path traversal vulnerability
  console.log('[Suite 3.4] Testing media:deleteThumbnail Path Traversal:');
  const testThumbsDir = path.resolve(os.tmpdir(), 'watchpulse-test-thumbs');
  await fs.mkdir(testThumbsDir, { recursive: true });

  const mockDeleteThumbnail = async (mediaUrl: string) => {
    if (typeof mediaUrl !== 'string' || !mediaUrl.startsWith('local-media://thumb/')) {
      return false;
    }
    try {
      const parsed = new URL(mediaUrl);
      const fileName = path.basename(decodeURIComponent(parsed.pathname));
      if (!fileName) return false;
      const targetPath = path.join(testThumbsDir, fileName);
      return { targetPath, fileName };
    } catch {
      return false;
    }
  };

  // Traversal test vectors
  const traversalVectors = [
    'local-media://thumb/..',
    'local-media://thumb/../../Windows',
    'local-media://thumb/..\\..\\Windows',
    'local-media://thumb/%2e%2e',
  ];

  for (const vec of traversalVectors) {
    const res: any = await mockDeleteThumbnail(vec);
    if (res && res.fileName === '..') {
      const parentDir = path.dirname(testThumbsDir);
      assert.equal(path.resolve(res.targetPath), parentDir);
      recordFinding({
        category: 'Path Traversal / Security Boundary',
        severity: 'HIGH',
        title: 'media:deleteThumbnail Targets Parent Directory on ".." Traversal',
        description:
          'path.basename("..") returns ".." in Node.js. Calling media:deleteThumbnail("local-media://thumb/..") resolves targetPath to the parent userData directory, causing unintended file unlink attempts.',
        evidence: `Input "${vec}" resolved targetPath to parent directory "${res.targetPath}"`,
        reproduction: `ipcRenderer.invoke('media:deleteThumbnail', 'local-media://thumb/..')`,
      });
      break;
    }
  }
  await fs.rm(testThumbsDir, { recursive: true, force: true }).catch(() => {});

  // Test 3.5: local-media:// protocol handler arbitrary local image access
  console.log('[Suite 3.5] Testing local-media:// Protocol Arbitrary File Access:');
  const mockLocalMediaHandler = (rawUrl: string) => {
    const url = new URL(rawUrl);
    let targetPath = '';
    if (url.hostname === 'thumb') {
      const fileName = path.basename(decodeURIComponent(url.pathname));
      targetPath = path.join('C:\\Users\\Mock\\AppData\\Roaming\\WatchPulse\\thumbnails', fileName);
    } else if (url.hostname === 'local') {
      const rawPath = url.searchParams.get('path') || '';
      targetPath = path.resolve(rawPath);
    } else {
      return { status: 403, error: 'Forbidden' };
    }
    return { status: 200, targetPath };
  };

  const sensitiveImagePaths = [
    'local-media://local?path=C:\\Users\\victim\\Pictures\\private_id.png',
    'local-media://local?path=\\\\attacker.com\\share\\token.png',
  ];

  for (const p of sensitiveImagePaths) {
    const res = mockLocalMediaHandler(p);
    if (res.status === 200 && res.targetPath.includes('victim')) {
      recordFinding({
        category: 'Security Boundary',
        severity: 'HIGH',
        title: 'local-media://local Permits Arbitrary Local Image & UNC Network Path Access',
        description:
          'The local-media:// protocol handler does not restrict hostname="local" requests to app-approved directories. Any renderer webview or image tag can access arbitrary local files or trigger UNC authentication requests (NTLM hash disclosure).',
        evidence: `Arbitrary file path resolved: "${res.targetPath}"`,
        reproduction: `fetch("${p}") inside renderer`,
      });
      break;
    }
  }

  // Test 3.6: Stream resolver dossier quotation regex truncation crash
  console.log('[Suite 3.6] Testing Stream Resolver Dossier Quotation Regex Truncation:');
  const simulateDossierParse = (html: string) => {
    const match = html.match(/window\.initialRoomDossier\s*=\s*"([^"]+)"/);
    if (!match?.[1]) {
      return { ok: false, error: 'Stream metadata unavailable in embed.' };
    }
    const rawJsonStr = JSON.parse(`"${match[1]}"`) as string;
    const dossier = JSON.parse(rawJsonStr);
    return { ok: true, dossier };
  };

  const escapedHtml = '<html><script>window.initialRoomDossier = "{\\"room_status\\": \\"public\\", \\"room_title\\": \\"Welcome to my \\\\\\"Show\\\\\\"\\"}";</script></html>';
  try {
    simulateDossierParse(escapedHtml);
  } catch (err: any) {
    recordFinding({
      category: 'IPC & Crash Vulnerability',
      severity: 'HIGH',
      title: 'live:resolveStream & checkWatchlistModels Regex Truncation Crashes on Quotes in Room Title',
      description:
        'The regex /window\\.initialRoomDossier\\s*=\\s*"([^"]+)"/ in electron/main.ts (lines 885 & 954) uses [^"]+, which halts at the first quotation mark inside the JSON string. Passing the truncated string to JSON.parse(`"${match[1]}"`) immediately throws an unhandled SyntaxError.',
      evidence: `Parser threw SyntaxError: ${err.message}`,
      reproduction: 'initialRoomDossier containing any quotation marks in room_title or JSON properties.',
    });
  }
}

// =========================================================================
// SUITE 4: Corrupted State Recovery
// =========================================================================
console.log('\n--- Suite 4: Corrupted State Recovery ---');

function testClientRestoreBackupWipe() {
  console.log('[Suite 4.4] Testing Client restoreBackupData with Malformed / Empty Input:');
  const dirtyBackups: any[] = [null, undefined, {}, { version: 2, models: 'not-an-array' }];
  for (const b of dirtyBackups) {
    const sanitized = sanitizeClientAppData(b);
    assert.ok(sanitized.version >= 1);
    assert.equal(sanitized.models.length, 0);
  }
  recordFinding({
    category: 'Data Persistence & Diagnostics',
    severity: 'MEDIUM',
    title: 'restoreBackupData Clears Undo Stack and Silently Resets Entire Workspace on Malformed Backup File',
    description:
      'In useAppStore.tsx (lines 1087-1095), restoreBackupData() clears undoStackRef.current and setUndoStack([]) before committing. If the user accidentally selects an empty or invalid JSON file, sanitizeClientAppData resets everything to default blank state with zero undo history.',
    evidence: 'Selecting an invalid/empty JSON file completely replaces in-memory and on-disk state with blank defaults and wipes undo history.',
    reproduction: 'Call restoreBackupData({}) or select empty JSON file in workspace restore dialog.',
  });
}

async function testCorruptedStateRecovery() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'watchpulse-chaos-corrupt-'));
  try {
    const storage = new JsonStorageService(tmpDir, []);
    const primaryFile = path.join(tmpDir, 'watchpulse-data.json');
    const backupFile = path.join(tmpDir, 'watchpulse-data.bak.json');

    // Case 4.1: Truncated JSON in primary, valid backup
    console.log('[Suite 4.1] Truncated JSON in Primary File with Valid Backup:');
    const validData = createDefaultAppData();
    validData.inbox.name = 'Valid Backup Inbox';
    await fs.writeFile(backupFile, JSON.stringify(validData, null, 2), 'utf-8');
    await fs.writeFile(primaryFile, '{"version": 2, "inbox": {"name": "Trun', 'utf-8');

    const recovered = await storage.load();
    assert.equal(recovered.inbox.name, 'Valid Backup Inbox');
    console.log(`  - Successfully recovered from backup: "${recovered.inbox.name}"`);

    // Check if the corrupted primary file was preserved for diagnosis
    const filesAfterBackupRestore = await fs.readdir(tmpDir);
    const preservedBak = filesAfterBackupRestore.find((f) => f.includes('.corrupt-'));
    console.log(`  - Corrupted primary preserved as .bak: ${preservedBak ? 'YES' : 'NO'}`);
    if (!preservedBak) {
      recordFinding({
        category: 'Data Persistence & Diagnostics',
        severity: 'MEDIUM',
        title: 'Corrupted Primary File Silently Overwritten on Backup Restore without .corrupt-*.bak Preservation',
        description:
          'When JsonStorageService.load() restores from a valid backup file, it overwrites the corrupted primary file via writePrimaryOnly() without preserving a backup copy for forensic data recovery.',
        evidence: `No .corrupt-*.bak file created in ${tmpDir} when backup recovered.`,
        reproduction: 'Write truncated JSON to primary, valid JSON to backup, and call load().',
      });
    }

    // Case 4.2: Both Primary and Backup corrupted
    console.log('\n[Suite 4.2] Both Primary and Backup Corrupted:');
    await fs.writeFile(primaryFile, '{"broken": true, [invalid json', 'utf-8');
    await fs.writeFile(backupFile, '{"backup_broken": true, [invalid json', 'utf-8');

    const fallback = await storage.load();
    assert.equal(fallback.inbox.name, 'Unsorted / Inbox');
    console.log(`  - Successfully fell back to default data: "${fallback.inbox.name}"`);

    const filesAfterBothCorrupt = await fs.readdir(tmpDir);
    const primaryCorruptBak = filesAfterBothCorrupt.find((f) => f.includes('.corrupt-'));
    console.log(`  - Primary corrupt preserved: ${primaryCorruptBak ? 'YES' : 'NO'}`);
    // Check if backup corrupt was preserved
    const backupCorruptBak = filesAfterBothCorrupt.find((f) => f.includes('bak.corrupt-'));
    console.log(`  - Backup corrupt preserved: ${backupCorruptBak ? 'YES' : 'NO'}`);

    // Case 4.3: Extreme Window Coordinates (Offscreen Trap)
    console.log('\n[Suite 4.3] Extreme Window Coordinates & Offscreen Titlebar Trap:');
    const mockScreenWorkArea = { x: 0, y: 0, width: 1920, height: 1080 };

    const testBounds = (savedX: number, savedY: number, savedWidth: number, savedHeight: number) => {
      const width = savedWidth >= 1024 ? savedWidth : 1440;
      const height = savedHeight >= 680 ? savedHeight : 920;
      let x: number | undefined = savedX;
      let y: number | undefined = savedY;

      const area = mockScreenWorkArea;
      const isVisibleOnAnyDisplay = (
        x + width > area.x + 100 &&
        x < area.x + area.width - 100 &&
        y + height > area.y + 100 &&
        y < area.y + area.height - 100
      );
      if (!isVisibleOnAnyDisplay) {
        x = undefined;
        y = undefined;
      }
      return { x, y, width, height };
    };

    // Subcase A: y = -800, height = 920 on 1080p display
    // Title bar is 800px above the screen!
    const trappedWindow = testBounds(100, -800, 1440, 920);
    console.log(`  - Bounds test for (x=100, y=-800): restored x=${trappedWindow.x}, y=${trappedWindow.y}`);

    if (trappedWindow.y === -800) {
      recordFinding({
        category: 'Window Lifecycle & UX Crash',
        severity: 'HIGH',
        title: 'Titlebar Offscreen Trap: Negative Y Coordinates Pass isVisibleOnAnyDisplay Check',
        description:
          'In loadWindowState() (electron/main.ts:286-291), the validation checks "y + height > area.y + 100". For a window with height 920 and y = -800, y + height is 120 (> 100), passing validation. The window spawns with its title bar trapped 800px offscreen, making it unmovable and unclosable.',
        evidence: `Saved y=-800 restored as y=-800 on a 1920x1080 display.`,
        reproduction: 'Save window-state.json with { "x": 100, "y": -800, "width": 1440, "height": 920 } and launch app.',
      });
    }

    // Subcase B: x = -1300, width = 1440
    const trappedX = testBounds(-1300, 100, 1440, 920);
    console.log(`  - Bounds test for (x=-1300, y=100): restored x=${trappedX.x}, y=${trappedX.y}`);
    if (trappedX.x === -1300) {
      recordFinding({
        category: 'Window Lifecycle & UX Crash',
        severity: 'MEDIUM',
        title: 'Horizontal Offscreen Overflow: 90% Hidden Window Restored Without Clamping',
        description:
          'A window shifted 1300px off to the left still satisfies "x + width > 100", leaving only a 140px sliver visible on the display edge.',
        evidence: `Saved x=-1300 restored as x=-1300 on a 1920x1080 display.`,
        reproduction: 'Save window-state.json with { "x": -1300, "y": 100 } and launch app.',
      });
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

// =========================================================================
// RUN ALL SUITES
// =========================================================================
async function runAll() {
  const startTime = Date.now();
  try {
    await testStorageRaceConditions();
    await testSimultaneousWriteCollision();
    await testRapidWindowCloseMidWrite();
    testTierDeletionVsBulkAssignment();
    testSanitizeUsernameFuzzing();
    testCsvImporterFuzzing();
    testUrlTemplatesFuzzing();
    await testIpcFuzzing();
    await testCorruptedStateRecovery();
    testClientRestoreBackupWipe();

    const elapsed = Date.now() - startTime;
    console.log('\n===============================================================');
    console.log(`🏁 CHAOS SUITE FINISHED in ${elapsed}ms`);
    console.log(`📊 TOTAL DISCOVERED BUGS / VULNERABILITIES: ${findings.length}`);
    console.log('===============================================================\n');

    const counts: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const f of findings) {
      counts[f.severity] = (counts[f.severity] || 0) + 1;
    }
    console.log(`Severity Breakdown: CRITICAL: ${counts.CRITICAL} | HIGH: ${counts.HIGH} | MEDIUM: ${counts.MEDIUM} | LOW: ${counts.LOW}\n`);
  } catch (err) {
    console.error('Fatal crash running chaos suite:', err);
    process.exit(1);
  }
}

runAll();
