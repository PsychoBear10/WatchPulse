import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  buildLivePreviewUrl,
  buildModelUrls,
  sanitizeUsername,
} from '../src/utils/sanitizer';
import { parseImportInput } from '../src/utils/csvImporter';
import { buildTextSummaryByTier, exportModelsToCsv } from '../src/utils/exporter';
import {
  buildFeedPageUrl,
  extractCbexplorerListId,
  extractRoomsFromPayload,
  matchDetectedCandidatesToWatchlist,
} from '../src/utils/liveFeed';
import { getModelReviewStatus } from '../src/utils/review';
import { resolveMediaSrc } from '../src/utils/media';
import {
  sanitizeClientAppData,
  sanitizeClientSettings,
} from '../src/utils/appDataSanitizer';
import {
  buildPresenceHoursFromCbexplorerStreams,
  computeActivitySummary,
  getUsuallyLiveNowMeta,
  recordPresenceTick,
} from '../src/utils/activityStats';
import {
  buildTierOrderMap,
  compareMonitorTierPriority,
} from '../src/utils/liveMonitorSort';
import {
  JsonStorageService,
  createDefaultAppData,
  sanitizeAppData,
} from '../electron/storage';
import { ModelRecord } from '../src/types/models';

test('sanitizeUsername extracts clean handle from URLs, handles, and extensions', () => {
  assert.equal(sanitizeUsername('https://chaturbate.com/seduza_hyun/'), 'seduza_hyun');
  assert.equal(sanitizeUsername('https://chaturbate.com/p/seduza_hyun/?tour=abc'), 'seduza_hyun');
  assert.equal(sanitizeUsername('https://www.cbhours.com/user/seduza_hyun.html'), 'seduza_hyun');
  assert.equal(sanitizeUsername('https://cbexplorer.com/seduza_hyun'), 'seduza_hyun');
  assert.equal(sanitizeUsername('https://archivebate.com/profile/seduza_hyun/videos'), 'seduza_hyun');
  assert.equal(sanitizeUsername('cbhours.com/user/Test_Model_99.html'), 'test_model_99');
  assert.equal(sanitizeUsername('@Seduza_Hyun'), 'seduza_hyun');
  assert.equal(sanitizeUsername('  Seduza Hyun  '), 'seduza_hyun');
  assert.equal(sanitizeUsername('https://chaturbate.com/_bamby_baby_'), '_bamby_baby_');
  assert.equal(sanitizeUsername('https://chaturbate.com/_bamby_baby_/'), '_bamby_baby_');
  assert.equal(sanitizeUsername('@_bamby_baby_'), '_bamby_baby_');
  assert.equal(sanitizeUsername('https://chaturbate.com/yvie_'), 'yvie_');
  assert.equal(sanitizeUsername('https://chaturbate.com/yvie_/'), 'yvie_');
  assert.equal(sanitizeUsername('yvie_'), 'yvie_');
  assert.equal(sanitizeUsername('-star-model-'), '-star-model-');
});

test('buildModelUrls builds CBHours, CBExplorer, and ArchiveBate URLs accurately', () => {
  const urls = buildModelUrls('https://chaturbate.com/seduza_hyun/');
  assert.equal(urls.cbhours, 'https://www.cbhours.com/user/seduza_hyun.html');
  assert.equal(urls.cbexplorer, 'https://cbexplorer.com/seduza_hyun');
  assert.equal(urls.archivebate, 'https://archivebate.com/profile/seduza_hyun');

  const underscoreUrls = buildModelUrls('https://chaturbate.com/_bamby_baby_');
  assert.equal(underscoreUrls.cbhours, 'https://www.cbhours.com/user/_bamby_baby_.html');
  assert.equal(underscoreUrls.cbexplorer, 'https://cbexplorer.com/_bamby_baby_');
  assert.equal(underscoreUrls.archivebate, 'https://archivebate.com/profile/_bamby_baby_');

  const trailingUnderscoreUrls = buildModelUrls('https://chaturbate.com/yvie_');
  assert.equal(trailingUnderscoreUrls.cbhours, 'https://www.cbhours.com/user/yvie_.html');
  assert.equal(trailingUnderscoreUrls.cbexplorer, 'https://cbexplorer.com/yvie_');
  assert.equal(trailingUnderscoreUrls.archivebate, 'https://archivebate.com/profile/yvie_');
});

test('parseImportInput parses headered CSVs, plain lists, and detects duplicates', () => {
  const existing: ModelRecord[] = [
    {
      id: 'm1',
      username: 'seduza_hyun',
      displayName: 'Seduza Hyun',
      originalLink: 'https://chaturbate.com/seduza_hyun/',
      tierId: 'inbox',
      order: 0,
      cbexplorerAdded: false,
      thumbnail: '',
      notes: '',
      tags: [],
      customLinks: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  const csv = [
    'Model Name,Original Link',
    'Seduza Hyun,https://chaturbate.com/seduza_hyun/',
    'Luna Vibe,https://chaturbate.com/luna_vibe/',
    'https://www.cbhours.com/user/neon_kairo.html,',
  ].join('\n');

  const res = parseImportInput(csv, existing);
  assert.equal(res.candidates.length, 3);
  assert.equal(res.candidates[0].username, 'seduza_hyun');
  assert.equal(res.candidates[0].isDuplicate, true);
  assert.equal(res.candidates[1].username, 'luna_vibe');
  assert.equal(res.candidates[1].displayName, 'Luna Vibe');
  assert.equal(res.candidates[1].isDuplicate, false);
  assert.equal(res.candidates[2].username, 'neon_kairo');

  const plainList = ['@alpha_model', 'https://archivebate.com/profile/beta_model'].join('\n');
  const plainRes = parseImportInput(plainList, existing);
  assert.deepEqual(
    plainRes.candidates.map((c) => c.username),
    ['alpha_model', 'beta_model']
  );
});

test('exporter generates enriched CSV and grouped text summary', () => {
  const defaults = createDefaultAppData();
  const sampleModels: ModelRecord[] = [
    {
      id: 'm1',
      username: 'seduza_hyun',
      displayName: 'Seduza Hyun',
      originalLink: 'https://chaturbate.com/seduza_hyun/',
      tierId: defaults.tiers[0].id,
      order: 0,
      cbexplorerAdded: true,
      thumbnail: '',
      notes: '1080p late night',
      tags: ['HD', 'Night'],
      customLinks: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  const csvOut = exportModelsToCsv(sampleModels, defaults.tiers, defaults.inbox);
  assert.match(csvOut, /https:\/\/www\.cbhours\.com\/user\/seduza_hyun\.html/);
  assert.match(csvOut, /https:\/\/cbexplorer\.com\/seduza_hyun/);
  assert.match(csvOut, /https:\/\/archivebate\.com\/profile\/seduza_hyun/);
  assert.match(csvOut, /Priority 1/);

  const txtOut = buildTextSummaryByTier(sampleModels, defaults.tiers, defaults.inbox, {
    includeLinks: true,
    includeNotes: true,
    includeTags: true,
    includeCbexplorerStatus: true,
    includeEmptyTiers: false,
  });
  assert.match(txtOut, /=== Priority 1 \(1\) ===/);
  assert.match(txtOut, /Seduza Hyun \(@seduza_hyun\) \[CBExplorer: Added\]/);
});

test('JsonStorageService persists, reloads, and recovers from backup on corruption', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'modelsort-test-'));
  try {
    const store = new JsonStorageService(tmpDir);
    const initial = await store.load();
    assert.equal(initial.inbox.name, 'Unsorted / Inbox');
    assert.ok(initial.tiers.length > 0);

    const updated = {
      ...initial,
      inbox: { ...initial.inbox, name: 'Triage Queue' },
      models: [
        {
          id: 'm_test',
          username: 'seduza_hyun',
          displayName: 'Seduza',
          originalLink: 'https://chaturbate.com/seduza_hyun/',
          tierId: initial.tiers[0].id,
          order: 0,
          cbexplorerAdded: true,
          thumbnail: '',
          notes: 'Test note',
          tags: ['HD'],
          customLinks: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    };

    await store.save(updated);
    // Second save creates .bak.json of first save
    await store.save({
      ...updated,
      models: updated.models,
    });

    const reloaded = await store.load();
    assert.equal(reloaded.inbox.name, 'Triage Queue');
    assert.equal(reloaded.models.length, 1);
    assert.equal(reloaded.models[0].username, 'seduza_hyun');

    // Corrupt primary JSON file and confirm automatic recovery from backup
    await fs.writeFile(store.getDataFilePath(), '{corrupted json', 'utf-8');
    const recovered = await store.load();
    assert.equal(recovered.inbox.name, 'Triage Queue');
    assert.equal(recovered.models[0].username, 'seduza_hyun');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('custom URL templates, live feed parser, and periodic re-sort cadence work cleanly', () => {
  const custom = buildModelUrls('_bamby_baby_', {
    cbexplorer: 'https://mirror.example.com/u/{username}',
  });
  assert.equal(custom.cbexplorer, 'https://mirror.example.com/u/_bamby_baby_');
  assert.equal(
    buildLivePreviewUrl('yvie_', 'https://embed.example.com/{username}?mute=1'),
    'https://embed.example.com/yvie_?mute=1'
  );

  const feedUrl = buildFeedPageUrl(
    {
      enabled: true,
      endpointTemplate: 'https://example.com/api?wm={wm}&limit={limit}&offset={offset}',
      affiliateWm: 'abc123',
      refreshIntervalSec: 30,
      maxPages: 2,
      autoRefreshSnapshots: true,
    },
    1,
    500
  );
  assert.equal(feedUrl, 'https://example.com/api?wm=abc123&limit=500&offset=500');

  const parsed = extractRoomsFromPayload({
    count: 1,
    results: [
      {
        username: '_Bamby_Baby_',
        current_show: 'public',
        num_users: 420,
        room_subject: 'Chill night stream',
        is_hd: true,
        image_url_360x270: 'https://img.example.com/live.jpg',
        tags: ['hd', 'chill'],
      },
    ],
  });
  assert.equal(parsed.rooms.length, 1);
  assert.equal(parsed.rooms[0].username, '_bamby_baby_');
  assert.equal(parsed.rooms[0].numUsers, 420);
  assert.equal(parsed.rooms[0].isHd, true);

  const now = Date.parse('2026-11-11T12:00:00.000Z');
  const twentyDaysAgo = new Date(now - 20 * 24 * 60 * 60 * 1000).toISOString();
  const model: ModelRecord = {
    id: 'm_due',
    username: 'yvie_',
    displayName: '',
    originalLink: '',
    tierId: 'tier_priority_1',
    order: 0,
    cbexplorerAdded: false,
    thumbnail: '',
    notes: '',
    tags: [],
    customLinks: [],
    createdAt: twentyDaysAgo,
    updatedAt: twentyDaysAgo,
    lastReviewedAt: twentyDaysAgo,
    lastSeenLiveAt: twentyDaysAgo,
  };

  const status = getModelReviewStatus(
    model,
    { id: 'tier_priority_1', name: 'P1', color: '#fff', hotkey: '1', order: 0, reviewCadenceDays: 7 },
    14,
    15,
    now
  );
  assert.equal(status.daysSinceReview, 20);
  assert.equal(status.isDueForReview, true);
  assert.equal(status.isStaleOffline, true);
});

test('45-day Recycling Bin auto-purge and local activity heatmap behave accurately', () => {
  const defaults = createDefaultAppData();
  const nowMs = Date.now();
  const daysAgoIso = (days: number) =>
    new Date(nowMs - days * 24 * 60 * 60 * 1000).toISOString();

  const sanitized = sanitizeAppData({
    ...defaults,
    settings: { ...defaults.settings, trashRetentionDays: 45 },
    trashedModels: [
      {
        id: 'recent_trash',
        username: 'keep_me',
        displayName: '',
        originalLink: '',
        tierId: 'inbox',
        order: 0,
        cbexplorerAdded: false,
        thumbnail: '',
        notes: '',
        tags: [],
        customLinks: [],
        createdAt: daysAgoIso(50),
        updatedAt: daysAgoIso(10),
        deletedAt: daysAgoIso(10),
        deletedFromTierId: 'tier_priority_1',
      },
      {
        id: 'expired_trash',
        username: 'purge_me',
        displayName: '',
        originalLink: '',
        tierId: 'inbox',
        order: 1,
        cbexplorerAdded: false,
        thumbnail: '',
        notes: '',
        tags: [],
        customLinks: [],
        createdAt: daysAgoIso(90),
        updatedAt: daysAgoIso(46),
        deletedAt: daysAgoIso(46),
        deletedFromTierId: 'tier_priority_2',
      },
    ],
  });

  assert.equal(sanitized.trashedModels?.length, 1);
  assert.equal(sanitized.trashedModels?.[0].username, 'keep_me');

  // Activity presence ticks + 7x24 summary
  const sampleTime = new Date(2026, 10, 11, 22, 15, 0);
  let presence = recordPresenceTick(undefined, 30, sampleTime);
  presence = recordPresenceTick(presence, 45, sampleTime); // clamped at 60 min/hour

  const trackedModel: ModelRecord = {
    id: 'm_act',
    username: 'seduza_hyun',
    displayName: '',
    originalLink: '',
    tierId: 'inbox',
    order: 0,
    cbexplorerAdded: false,
    thumbnail: '',
    notes: '',
    tags: [],
    customLinks: [],
    createdAt: sampleTime.toISOString(),
    updatedAt: sampleTime.toISOString(),
    presenceHours: presence,
  };

  const summary = computeActivitySummary(trackedModel, sampleTime);
  assert.equal(summary.tracked30DayHours, 1);
  assert.equal(summary.activeDaysLast30, 1);
  assert.equal(summary.maxCellMinutes, 60);
});

test('JsonStorageService migrates legacy modelsort-data.json and thumbnails into WatchPulse seamlessly', async () => {
  const legacyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'modelsort-legacy-'));
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'watchpulse-target-'));
  try {
    await fs.mkdir(path.join(legacyDir, 'thumbnails'), { recursive: true });
    await fs.writeFile(path.join(legacyDir, 'thumbnails', 'avatar1.png'), 'fake-png');
    await fs.writeFile(
      path.join(legacyDir, 'modelsort-data.json'),
      JSON.stringify({
        version: 1,
        inbox: { id: 'inbox', name: 'Legacy Inbox', color: '#94A3B8', hotkey: '0' },
        tiers: [{ id: 't1', name: 'VIP', color: '#F43F5E', hotkey: '1', order: 0 }],
        models: [
          {
            id: 'm1',
            username: '_bamby_baby_',
            displayName: '',
            originalLink: 'https://chaturbate.com/_bamby_baby_',
            tierId: 't1',
            order: 0,
            cbexplorerAdded: true,
            thumbnail: 'local-media://thumb/avatar1.png',
            notes: 'Keep me',
            tags: ['HD'],
            customLinks: [],
            createdAt: '2026-11-10T00:00:00.000Z',
            updatedAt: '2026-11-10T00:00:00.000Z',
          },
        ],
      }),
      'utf-8'
    );

    const store = new JsonStorageService(targetDir, [legacyDir]);
    const loaded = await store.load();
    assert.equal(loaded.inbox.name, 'Legacy Inbox');
    assert.equal(loaded.models.length, 1);
    assert.equal(loaded.models[0].username, '_bamby_baby_');
    assert.equal(loaded.models[0].notes, 'Keep me');

    const copiedThumb = await fs.readFile(
      path.join(targetDir, 'thumbnails', 'avatar1.png'),
      'utf-8'
    );
    assert.equal(copiedThumb, 'fake-png');
  } finally {
    await fs.rm(legacyDir, { recursive: true, force: true });
    await fs.rm(targetDir, { recursive: true, force: true });
  }
});

test('matchDetectedCandidatesToWatchlist filters strictly to saved models and sanitizeAppData upgrades legacy onlinerooms template', () => {
  const watchlist: ModelRecord[] = [
    {
      id: 'm1',
      username: 'seduza_hyun',
      displayName: 'Seduza',
      originalLink: 'https://chaturbate.com/seduza_hyun/',
      tierId: 'tier_priority_1',
      order: 0,
      cbexplorerAdded: false,
      thumbnail: '',
      notes: '',
      tags: [],
      customLinks: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'm2',
      username: 'luna_vibe',
      displayName: 'Luna',
      originalLink: 'https://chaturbate.com/luna_vibe/',
      tierId: 'tier_priority_2',
      order: 1,
      cbexplorerAdded: false,
      thumbnail: '',
      notes: '',
      tags: [],
      customLinks: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  const matched = matchDetectedCandidatesToWatchlist(
    [
      { hrefOrSlug: 'https://chaturbate.com/random_stranger/', viewers: 9999, subject: 'Ignore me' },
      { hrefOrSlug: 'https://cbexplorer.com/Seduza_Hyun', viewers: 420, subject: 'Chill stream' },
      { hrefOrSlug: '/luna_vibe/', viewers: 150, show: 'ticket' },
      { hrefOrSlug: 'https://chaturbate.com/seduza_hyun/', viewers: 455 },
    ],
    watchlist,
    '2026-11-11T12:00:00.000Z'
  );

  assert.equal(matched.length, 2);
  const seduza = matched.find((r) => r.username === 'seduza_hyun');
  const luna = matched.find((r) => r.username === 'luna_vibe');
  assert.ok(seduza);
  assert.ok(luna);
  assert.equal(seduza.numUsers, 455);
  assert.equal(seduza.roomSubject, 'Chill stream');
  assert.equal(luna.currentShow, 'ticket');

  const defaults = createDefaultAppData();
  const upgradedZeroConfig = sanitizeAppData({
    ...defaults,
    settings: {
      ...defaults.settings,
      liveFeed: {
        ...defaults.settings.liveFeed,
        affiliateWm: '',
        endpointTemplate:
          'https://chaturbate.com/api/public/affiliates/onlinerooms/?wm={wm}&format=json&limit={limit}&offset={offset}',
      },
    },
  });
  assert.match(
    upgradedZeroConfig.settings.liveFeed.endpointTemplate,
    /cbexplorer_users_online_v3\.json/
  );

  const upgradedWithWm = sanitizeAppData({
    ...defaults,
    settings: {
      ...defaults.settings,
      liveFeed: {
        ...defaults.settings.liveFeed,
        affiliateWm: 'my_wm_code',
        endpointTemplate:
          'https://chaturbate.com/api/public/affiliates/onlinerooms/?wm={wm}&format=json&limit={limit}&offset={offset}',
      },
    },
  });
  assert.match(upgradedWithWm.settings.liveFeed.endpointTemplate, /client_ip=request_ip/);

  const customUrl = 'https://statbate.example/api/live?token={wm}&offset={offset}&limit={limit}';
  const preservedCustom = sanitizeAppData({
    ...defaults,
    settings: {
      ...defaults.settings,
      liveFeed: {
        ...defaults.settings.liveFeed,
        endpointTemplate: customUrl,
      },
    },
  });
  assert.equal(preservedCustom.settings.liveFeed.endpointTemplate, customUrl);

  const cbVideoOnlyUrl = buildLivePreviewUrl('yvie_', undefined, true);
  assert.match(cbVideoOnlyUrl, /embed_video_only=1/);
  assert.match(cbVideoOnlyUrl, /hide_logo=1/);
  const cbFullEmbedUrl = buildLivePreviewUrl(
    'yvie_',
    'https://chaturbate.com/embed/{username}/?embed_video_only=1&disable_sound=1&hide_logo=1&bgcolor=black',
    false
  );
  assert.doesNotMatch(cbFullEmbedUrl, /embed_video_only/);

  const upgradedPreview = sanitizeAppData({
    ...defaults,
    settings: {
      ...defaults.settings,
      urlTemplates: {
        ...defaults.settings.urlTemplates,
        livePreview:
          'https://chaturbate.com/embed/{username}/?disable_sound=1&bgcolor=black',
      },
    },
  });
  assert.match(upgradedPreview.settings.urlTemplates.livePreview, /embed_video_only=1/);
  assert.match(upgradedPreview.settings.urlTemplates.livePreview, /hide_logo=1/);

  // CBExplorer columnar payload (cbexplorer_users_online_v3.json) + list URL parser
  assert.equal(
    extractCbexplorerListId(
      'https://cbexplorer.com/lists/ArchiveBate-LWER9b1ayk6BGTpTLThpIA'
    ),
    'LWER9b1ayk6BGTpTLThpIA'
  );
  assert.equal(extractCbexplorerListId('https://cbexplorer.com/yvie_'), null);

  const v3Parsed = extractRoomsFromPayload({
    id: 1,
    data: {
      h: ['is_new', 'tags', 'username', 'current_show', 'gender', 'age', 'num_users', 'room_subject'],
      t: ['asian', 'lovense'],
      d: [
        [0, [0, 1], 'yvie_', '', 'f', 20, 1520, 'Chill Friday'],
        [0, [1], '_bamby_baby_', 'private', 'f', 22, 85, 'Exclusive'],
      ],
    },
  });
  assert.equal(v3Parsed.rooms.length, 2);
  assert.equal(v3Parsed.rooms[0].username, 'yvie_');
  assert.equal(v3Parsed.rooms[0].currentShow, 'public');
  assert.equal(v3Parsed.rooms[0].numUsers, 1520);
  assert.deepEqual(v3Parsed.rooms[0].tags, ['asian', 'lovense']);
  assert.match(v3Parsed.rooms[0].imageUrl, /thumb\.live\.mmcdn\.com\/ri\/yvie_\.jpg/);
  assert.equal(v3Parsed.rooms[1].currentShow, 'private');

  const bucketParsed = extractRoomsFromPayload({
    public: ['alpha_cam'],
    away: ['beta_cam'],
  });
  assert.equal(bucketParsed.rooms.length, 2);
  assert.equal(bucketParsed.rooms[0].currentShow, 'public');
  assert.equal(bucketParsed.rooms[1].currentShow, 'away');
});

test('v2.05 sanitizer, importer, exporter, and media path edge cases', () => {
  // Embed / fullvideo / room query URL extraction
  assert.equal(
    sanitizeUsername('https://chaturbate.com/embed/yvie_/?disable_sound=1&hide_logo=1'),
    'yvie_'
  );
  assert.equal(
    sanitizeUsername('https://chaturbate.com/embed/'),
    ''
  );
  assert.equal(
    sanitizeUsername('https://chaturbate.com/fullvideo/?b=luna_ray'),
    'luna_ray'
  );
  assert.equal(
    sanitizeUsername('https://chaturbate.com/fullvideo/'),
    ''
  );
  assert.equal(
    sanitizeUsername('https://chaturbate.com/fullvideo/luna_ray/'),
    'luna_ray'
  );
  assert.equal(
    sanitizeUsername('https://chaturbate.com/in/?tour=abc&room=nova_star'),
    'nova_star'
  );

  // Single-row CSV header keyword should still import, and comma-separated plain handles keep every handle
  const keywordOnly = parseImportInput('username', []);
  assert.equal(keywordOnly.candidates.length, 1);
  assert.equal(keywordOnly.candidates[0].username, 'username');

  const multiHandleCsv = parseImportInput('alpha_cam, beta_cam, gamma_cam', []);
  assert.deepEqual(
    multiHandleCsv.candidates.map((r) => r.username),
    ['alpha_cam', 'beta_cam', 'gamma_cam']
  );

  // Stage audio vs muted embed URL toggle
  const mutedPreviewUrl = buildLivePreviewUrl('yvie_', undefined, true, true);
  assert.match(mutedPreviewUrl, /disable_sound=1/);
  const stageAudioUrl = buildLivePreviewUrl('yvie_', undefined, true, false);
  assert.doesNotMatch(stageAudioUrl, /disable_sound=/);

  // Regular CSV with header row + multiple rows still treats row 0 as header
  const titledCsv = parseImportInput(
    'username,tier,notes\nalpha_cam,Priority 1,Note one\nbeta_cam,Watchlist,Note two',
    []
  );
  assert.equal(titledCsv.candidates.length, 2);
  assert.equal(titledCsv.candidates[0].username, 'alpha_cam');
  assert.equal(titledCsv.candidates[1].tierHint, 'Watchlist');

  // CSV formula neutralization
  const defaults = createDefaultAppData();
  const csv = exportModelsToCsv(
    [
      {
        id: 'm_csv_1',
        username: 'safe_user',
        displayName: '=HYPERLINK("https://evil.test","Click")',
        originalLink: 'https://chaturbate.com/safe_user/',
        cbhoursUrl: 'https://www.cbhours.com/user/safe_user.html',
        cbexplorerUrl: 'https://cbexplorer.com/safe_user',
        tierId: 'inbox',
        cbexplorerAdded: false,
        thumbnail: '',
        notes: '+1+2',
        tags: ['@vip'],
        customLinks: [],
        order: 0,
        createdAt: '2026-11-01T00:00:00.000Z',
        updatedAt: '2026-11-01T00:00:00.000Z',
      },
    ],
    defaults.tiers,
    defaults.inbox.name
  );
  assert.match(csv, /"'=HYPERLINK/);
  assert.match(csv, /,'\+1\+2,/);
  assert.match(csv, /,'@vip,/);

  // POSIX vs Windows file:// media URIs
  const posixMedia = resolveMediaSrc('file:///home/tester/thumbs/a.jpg');
  assert.equal(
    decodeURIComponent(posixMedia.replace('local-media://local?path=', '')),
    '/home/tester/thumbs/a.jpg'
  );
  const winMedia = resolveMediaSrc('file:///C:/Users/tester/thumbs/a.jpg');
  assert.equal(
    decodeURIComponent(winMedia.replace('local-media://local?path=', '')),
    'C:/Users/tester/thumbs/a.jpg'
  );
});

test('v2.05 storage writeQueue error recovery, backup preservation, and saveSync', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'watchpulse-v205-'));
  try {
    const storage = new JsonStorageService(tmpDir, []);
    const primaryPath = path.join(tmpDir, 'watchpulse-data.json');
    const backupPath = path.join(tmpDir, 'watchpulse-data.bak.json');

    // Initial save + second save creates healthy backup
    const first = createDefaultAppData();
    first.models.push({
      id: 'm_1',
      username: 'first_cam',
      displayName: 'first_cam',
      originalLink: 'https://chaturbate.com/first_cam/',
      cbhoursUrl: '',
      cbexplorerUrl: '',
      tierId: 'inbox',
      cbexplorerAdded: false,
      thumbnail: '',
      notes: 'backup anchor',
      tags: [],
      customLinks: [],
      order: 0,
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    });
    await storage.save(first);
    const second = structuredClone(first);
    second.models[0].notes = 'primary latest';
    await storage.save(second);

    // Corrupt primary and ensure load() repairs from healthy backup WITHOUT overwriting .bak.json
    await fs.writeFile(primaryPath, '{corrupted json', 'utf-8');
    const recovered = await storage.load();
    assert.equal(recovered.models.length, 1);
    assert.equal(recovered.models[0].notes, 'backup anchor');
    const backupTextAfterLoad = await fs.readFile(backupPath, 'utf-8');
    assert.match(backupTextAfterLoad, /"backup anchor"/);

    // Force a write failure on rename (primaryPath temporarily replaced by a directory), verify next save recovers!
    await fs.rm(primaryPath, { force: true });
    await fs.mkdir(primaryPath);
    await assert.rejects(() => storage.save(second));
    await fs.rmdir(primaryPath);

    await storage.save(second);
    const reloaded = await storage.load();
    assert.equal(reloaded.models[0].notes, 'primary latest');

    // Corrupt BOTH primary and backup -> creates .corrupt-*.bak preservation copy before resetting
    await fs.writeFile(primaryPath, '{bad primary', 'utf-8');
    await fs.writeFile(backupPath, '{bad backup', 'utf-8');
    const resetData = await storage.load();
    assert.equal(resetData.models.length, 0);
    const files = await fs.readdir(tmpDir);
    assert.ok(files.some((f) => f.includes('.corrupt-') && f.endsWith('.bak')));

    // saveSync persists immediately and rotates previous valid primary to backup
    const syncData = createDefaultAppData();
    syncData.models.push({ ...first.models[0], notes: 'sync persisted' });
    storage.saveSync(syncData);
    const syncedRaw = await fs.readFile(primaryPath, 'utf-8');
    assert.match(syncedRaw, /"sync persisted"/);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('v2.05 sanitizeAppData & sanitizeClientAppData harden malformed inputs', () => {
  const malformedInput = {
    inbox: { name: '   ', hotkey: 'Z' },
    tiers: [
      { id: 't1', name: 'Tier One', hotkey: '1', order: 0 },
      { id: 't1', name: 'Dup ID Same Key', hotkey: '1', order: 1 },
      { id: 't_space', name: 'Reserved Key', hotkey: 'Space', order: 2 },
    ],
    models: [
      {
        id: 'm_dup',
        username: '  alpha_cam  ',
        tierId: 'nonexistent_tier',
        createdAt: 'not-a-date',
        updatedAt: '2026-11-10T10:00:00.000Z',
        presenceHours: {
          '2026-11-10T10': 2,
          '2026-02-30T10': 5,
          'bad-bucket': 3,
        },
      },
      {
        id: 'm_dup',
        username: 'ALPHA_CAM',
        tierId: 't1',
      },
      {
        id: 'm_dup',
        username: 'beta_cam',
        tierId: 't1',
      },
    ],
    trashedModels: [
      {
        id: 'm_dup',
        username: 'beta_cam',
        deletedAt: new Date().toISOString(),
      },
      {
        id: 'm_trash_ok',
        username: 'gamma_cam',
        deletedAt: new Date().toISOString(),
      },
    ],
    settings: {
      defaultReviewCadenceDays: -5,
      trashRetentionDays: 0,
      liveFeed: { refreshIntervalSec: 2, maxPages: 999 },
    },
  };

  for (const cleaned of [
    sanitizeAppData(malformedInput),
    sanitizeClientAppData(malformedInput),
  ]) {
    assert.equal(cleaned.inbox.name, 'Unsorted / Inbox');
    assert.equal(cleaned.inbox.hotkey, '');
    assert.equal(cleaned.tiers.length, 3);
    assert.notEqual(cleaned.tiers[0].id, cleaned.tiers[1].id);
    assert.equal(cleaned.tiers[1].hotkey, '');
    assert.equal(cleaned.tiers[2].hotkey, '');

    assert.equal(cleaned.models.length, 2);
    assert.equal(cleaned.models[0].username, 'alpha_cam');
    assert.equal(cleaned.models[0].tierId, 'inbox');
    assert.notEqual(cleaned.models[0].createdAt, 'not-a-date');
    assert.deepEqual(cleaned.models[0].presenceHours, { '2026-11-10T10': 2 });
    assert.notEqual(cleaned.models[0].id, cleaned.models[1].id);

    // Duplicate username across models and trashedModels is dropped, valid trash survives
    assert.equal(cleaned.trashedModels.length, 1);
    assert.equal(cleaned.trashedModels[0].username, 'gamma_cam');

    assert.equal(cleaned.settings.defaultReviewCadenceDays, 14);
    assert.equal(cleaned.settings.trashRetentionDays, 45);
    assert.equal(
      cleaned.settings.liveFeed.refreshIntervalSec,
      createDefaultAppData().settings.liveFeed.refreshIntervalSec
    );
    assert.equal(cleaned.settings.liveFeed.maxPages, 25);
  }

  const partialSettings = sanitizeClientSettings(null);
  assert.equal(partialSettings.confirmDelete, true);
  assert.ok(partialSettings.urlTemplates.livePreview.includes('{username}'));
  assert.equal(sanitizeAppData({ inbox: {} }).inbox.hotkey, '0');
  assert.equal(sanitizeClientAppData({ inbox: {} }).inbox.hotkey, '0');
});

test('v2.06 CBExplorer stream session history converts accurately without double counting', () => {
  const refNow = new Date('2026-11-11T15:00:00.000Z');
  const existingDayBefore = new Date(refNow.getTime() - 24 * 60 * 60 * 1000);
  const existingKey = `${existingDayBefore.getFullYear()}-${String(
    existingDayBefore.getMonth() + 1
  ).padStart(2, '0')}-${String(existingDayBefore.getDate()).padStart(2, '0')}T02`;

  const staleDate = new Date(refNow.getTime() - 120 * 24 * 60 * 60 * 1000);
  const s1Start = new Date(refNow.getTime() - 5 * 60 * 60 * 1000).toISOString();
  const s1End = new Date(refNow.getTime() - 2 * 60 * 60 * 1000 - 30 * 60 * 1000).toISOString(); // 2.5h session

  const streams = [
    // Old (>90d) stream should count as valid session metadata only? Wait: excluded from heatmap buckets
    {
      streamId: 1,
      startTime: staleDate.toISOString(),
      endTime: new Date(staleDate.getTime() + 60 * 60 * 1000).toISOString(),
    },
    // Recent 2.5 hour session across local hour boundaries
    {
      streamId: 2,
      startTime: s1Start,
      endTime: s1End,
    },
    // Invalid / inverted interval should be skipped safely
    {
      streamId: 3,
      startTime: s1End,
      endTime: s1Start,
    },
  ];

  const firstMerge = buildPresenceHoursFromCbexplorerStreams(
    streams,
    { [existingKey]: 15 },
    refNow
  );
  assert.equal(firstMerge.streamsCount, 2);
  assert.equal(firstMerge.latestStreamEndAt, s1End);
  assert.equal(firstMerge.presenceHours[existingKey], 15);

  const summary = computeActivitySummary(
    {
      id: 'm_act',
      username: 'yvie_',
      displayName: 'yvie_',
      originalLink: '',
      tierId: 'inbox',
      order: 0,
      cbexplorerAdded: false,
      thumbnail: '',
      notes: '',
      tags: [],
      customLinks: [],
      createdAt: refNow.toISOString(),
      updatedAt: refNow.toISOString(),
      presenceHours: firstMerge.presenceHours,
    },
    refNow
  );
  // 2.5h from CBExplorer + 0.25h existing = 2.75h -> rounded to 2.8h
  assert.equal(summary.tracked30DayHours, 2.8);

  // Idempotent re-sync must NOT double-count existing hours
  const secondMerge = buildPresenceHoursFromCbexplorerStreams(
    streams,
    firstMerge.presenceHours,
    refNow
  );
  assert.deepEqual(secondMerge.presenceHours, firstMerge.presenceHours);
});

test('v2.07 getUsuallyLiveNowMeta enforces high-precision schedule alignment, rejects logoff tails & rare blips', () => {
  const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const keyFor = (base: Date, daysAgo: number, hour: number) => {
    const dt = new Date(
      base.getFullYear(),
      base.getMonth(),
      base.getDate() - daysAgo,
      hour,
      0,
      0,
      0
    );
    return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(
      dt.getDate()
    )}T${pad2(dt.getHours())}`;
  };

  // Current local clock = Wed Nov 11 2026 23:15 -> window covers 22:00 (prev), 23:00 (cur), and 00:00 (next)
  const localNight = new Date(2026, 10, 11, 23, 15, 0, 0);
  const makeModel = (presenceHours: Record<string, number>): ModelRecord => ({
    id: 'm_sched',
    username: 'sched_cam',
    displayName: 'sched_cam',
    originalLink: '',
    tierId: 'inbox',
    order: 0,
    cbexplorerAdded: false,
    thumbnail: '',
    notes: '',
    tags: [],
    customLinks: [],
    createdAt: localNight.toISOString(),
    updatedAt: localNight.toISOString(),
    presenceHours,
  });

  // 1) Consistent midnight-wrapping streamer: active 4 of 5 recent days around 23:00-00:00
  const regularNight = getUsuallyLiveNowMeta(
    makeModel({
      [keyFor(localNight, 1, 23)]: 50,
      [keyFor(localNight, 2, 23)]: 35,
      [keyFor(localNight, 1, 0)]: 45, // overnight continuation of 2 days ago (Nov 9 23:00 -> Nov 10 00:00)
      [keyFor(localNight, 4, 23)]: 40,
      [keyFor(localNight, 5, 0)]: 55, // overnight slot for 6 days ago (Nov 5 23:00 -> Nov 6 00:00)
      [keyFor(localNight, 9, 14)]: 60,
    }),
    localNight
  );
  assert.equal(regularNight.isUsuallyLiveNow, true);
  assert.equal(regularNight.matchingDaysCount, 4);
  assert.ok(regularNight.confidencePct >= 50);
  assert.match(regularNight.label, /\d+% match/);

  // 2) Trailing logoff spillover (runs 20:00-22:10 every day; never streams at 23:00/00:00) -> REJECTED
  const logoffSpillover = getUsuallyLiveNowMeta(
    makeModel({
      [keyFor(localNight, 1, 21)]: 60,
      [keyFor(localNight, 1, 22)]: 45,
      [keyFor(localNight, 2, 21)]: 60,
      [keyFor(localNight, 2, 22)]: 40,
      [keyFor(localNight, 3, 21)]: 60,
      [keyFor(localNight, 3, 22)]: 35,
      [keyFor(localNight, 4, 21)]: 60,
      [keyFor(localNight, 4, 22)]: 50,
    }),
    localNight
  );
  assert.equal(logoffSpillover.isUsuallyLiveNow, false);

  // 3) Daily midday streamer with 2 random isolated nights out of 16 active days -> REJECTED
  const rareNightMap: Record<string, number> = {};
  for (let d = 1; d <= 16; d++) {
    rareNightMap[keyFor(localNight, d, 13)] = 60;
  }
  rareNightMap[keyFor(localNight, 5, 23)] = 35;
  rareNightMap[keyFor(localNight, 18, 23)] = 40;
  const rareBlips = getUsuallyLiveNowMeta(makeModel(rareNightMap), localNight);
  assert.equal(rareBlips.isUsuallyLiveNow, false);

  // 4) Specific Wednesday-night streamer (3 of 3 Wednesdays at 23:00; other days morning) -> TRUE on Wed, FALSE on Tue
  const wedRoutine = makeModel({
    [keyFor(localNight, 7, 23)]: 55,
    [keyFor(localNight, 14, 23)]: 60,
    [keyFor(localNight, 21, 23)]: 50,
    [keyFor(localNight, 2, 11)]: 60,
    [keyFor(localNight, 9, 11)]: 60,
    [keyFor(localNight, 16, 11)]: 60,
  });
  const onWed = getUsuallyLiveNowMeta(wedRoutine, localNight);
  assert.equal(onWed.isUsuallyLiveNow, true);
  assert.match(onWed.label, /Wed/);
  const onTue = getUsuallyLiveNowMeta(
    wedRoutine,
    new Date(2026, 10, 10, 23, 15, 0, 0)
  );
  assert.equal(onTue.isUsuallyLiveNow, false);

  // 5) Single active day / brief ping -> REJECTED
  const singlePing = getUsuallyLiveNowMeta(
    makeModel({
      [keyFor(localNight, 4, 23)]: 15,
    }),
    localNight
  );
  assert.equal(singlePing.isUsuallyLiveNow, false);
});

test('v2.07 Watchlist Grid & Watch Wall prioritize higher playlist tiers over viewer counts', () => {
  const tiers = [
    { id: 't1', name: 'Priority 1', color: '#10B981', order: 0, hotkey: '1' },
    { id: 't2', name: 'Priority 2', color: '#F59E0B', order: 1, hotkey: '2' },
    { id: 't3', name: 'Watchlist', color: '#3B82F6', order: 2, hotkey: '3' },
  ];
  const tierOrderById = buildTierOrderMap(tiers);

  const makeModel = (id: string, tierId: string | null, order: number): ModelRecord => ({
    id,
    username: id,
    displayName: id,
    originalLink: '',
    tierId,
    order,
    cbexplorerAdded: false,
    thumbnail: '',
    notes: '',
    tags: [],
    customLinks: [],
    createdAt: '2026-11-12T00:00:00.000Z',
    updatedAt: '2026-11-12T00:00:00.000Z',
  });

  const makeLive = (username: string, numUsers: number, currentShow = 'public') => ({
    username,
    isOnline: true,
    currentShow,
    numUsers,
    roomSubject: '',
    imageUrl: '',
    iframeEmbedUrl: '',
    chatRoomUrl: '',
    hlsSource: '',
    isHd: true,
    fetchedAt: '2026-11-12T00:00:00.000Z',
  });

  const sorted = [
    { model: makeModel('inbox_huge', 'inbox', 0), live: makeLive('inbox_huge', 9500) },
    { model: makeModel('watch_mid', 't3', 0), live: makeLive('watch_mid', 4200) },
    { model: makeModel('p2_high', 't2', 0), live: makeLive('p2_high', 1800) },
    { model: makeModel('p1_low', 't1', 1), live: makeLive('p1_low', 45) },
    { model: makeModel('p1_high', 't1', 0), live: makeLive('p1_high', 310) },
    { model: makeModel('p1_private', 't1', 2), live: makeLive('p1_private', 500, 'private') },
    { model: makeModel('p1_offline', 't1', 3) },
  ].sort((a, b) => compareMonitorTierPriority(a, b, tierOrderById));

  assert.deepEqual(
    sorted.map((x) => x.model.id),
    [
      'p1_high',
      'p1_low',
      'p2_high',
      'watch_mid',
      'inbox_huge',
      'p1_private',
      'p1_offline',
    ]
  );
});
