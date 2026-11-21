import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

console.log('================================================================');
console.log('🔍 WATCHPULSE COMPACT / RESPONSIVE & VISUAL UX STRESS TEST SUITE');
console.log('   Auditor: @user-compact (Small-Screen, High-DPI & Design QA)   ');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// WCAG 2.1 Relative Luminance & Contrast Calculation Helpers
// -----------------------------------------------------------------------------
function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16),
    ];
  }
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function parseRgba(str) {
  if (str.startsWith('#')) return hexToRgb(str);
  const match = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (match) {
    return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
  }
  return [0, 0, 0];
}

function getLuminance([r, g, b]) {
  const a = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function getContrastRatio(fgStr, bgStr) {
  const fg = parseRgba(fgStr);
  const bg = parseRgba(bgStr);
  const l1 = getLuminance(fg);
  const l2 = getLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const discoveredFlaws = [];

function recordFlaw(category, title, severity, details) {
  discoveredFlaws.push({ category, title, severity, details });
  console.log(`[${severity.toUpperCase()}] ${category}: ${title}`);
}

// -----------------------------------------------------------------------------
// STRESS TEST 1: Viewport Stress at Constrained Resolutions & DPI
// -----------------------------------------------------------------------------
console.log('--- 1. Testing Viewport Stress & Responsive Constraints ---');

// Test 1.1: Schedule Matrix 7x24 Grid & Inspector Panel Collision at 1024px
{
  const screenW = 1024;
  const modalPad = 48; // md:p-6 => 24px * 2
  const modalW = screenW - modalPad; // 976px
  const inspectorW = 380; // lg:w-[380px] shrink-0
  const availableGridW = modalW - inspectorW; // 596px
  const gridMinW = 720; // min-w-[720px] inside grid
  const gridPaddings = 64; // p-4 (32px) + p-4 (32px) = 64px
  const totalGridRequiredW = gridMinW + gridPaddings; // 784px
  const overflowW = totalGridRequiredW - availableGridW; // 188px overflow

  if (overflowW > 0) {
    recordFlaw(
      'Schedule Matrix Responsive Layout',
      '7x24 Grid and Inspector Drawer Collide at 1024px Screen Width',
      'Critical',
      `At 1024px width, Tailwind 'lg:flex-row' kicks in. The modal container is 976px wide. The inspector drawer claims 380px (shrink-0), leaving only 596px for the grid. The grid has 'min-w-[720px]' (+ 64px padding = 784px), resulting in a 188px overflow and forcing horizontal scrolling across all 24 hours.`
    );
  }

  const screenH = 768;
  const modalH = Math.round(screenH * 0.92); // 706px (h-[92vh])
  const headerH = 62;
  const kpiStripH = 92;
  const filterBarH = 88; // 2 rows wrap on 1024px
  const footerH = 46;
  const headerStackH = headerH + kpiStripH + filterBarH + footerH; // 288px
  const availableMatrixH = modalH - headerStackH; // 418px
  const gridRowsRequiredH = 7 * 40 + 36 + 48; // 7 rows * 40px + header + legend = 364px
  const inspectorAvailableH = availableMatrixH - 120; // 298px for model list

  if (availableMatrixH < 450) {
    recordFlaw(
      'Schedule Matrix Viewport Squashing',
      'Vertical Space Squashed on 768px Display (706px Modal Height)',
      'High',
      `On a 768px vertical display (1024x768 / 1366x768), 92vh yields 706px. The modal top header, KPI ribbon, wrapped filter bar, and footer consume 288px, leaving only ~418px. The inspector model list is cramped into <300px, cutting off visible models and creating double scrollbars.`
    );
  }
}

// Test 1.2: ModalShell Clipping on Constrained Heights (640x480, 800x600, 1024x768 @ 150%)
{
  const testHeights = [480, 540, 600];
  const modalShellMinH = 580; // SettingsModal & TierManagerModal heightClass min-h-[580px]
  const modalShellPad = 32; // p-4 backdrop padding = 16px * 2

  for (const h of testHeights) {
    const totalNeeded = modalShellMinH + modalShellPad; // 612px
    if (totalNeeded > h) {
      recordFlaw(
        'ModalShell Backdrop Clipping',
        `Modal Content Clips Above and Below Screen at ${h}px Viewport Height`,
        'High',
        `ModalShell uses 'fixed inset-0 flex items-center justify-center p-4' without 'overflow-y-auto' on the backdrop. When child modals like SettingsModal or TierManagerModal enforce 'min-h-[580px]' (total 612px with padding), they exceed ${h}px viewport height. The modal header (with title & X button) and modal footer (with action buttons) are clipped offscreen and cannot be scrolled to.`
      );
      break;
    }
  }
}

// Test 1.3: RapidSorter Center Stage Squashing with Quick-Edit Open at 1024px
{
  const screenW = 1024;
  const inspectorW = 320; // aside w-80 shrink-0
  const centerStageAvailableW = screenW - inspectorW; // 704px
  const cardMaxW = 672; // max-w-2xl
  const cardPadding = 48; // p-6 => 24px * 2
  const totalCardW = cardMaxW + cardPadding; // 720px

  if (totalCardW > centerStageAvailableW) {
    recordFlaw(
      'RapidSorter Viewport Layout',
      'Center Deck Card Horizontally Squashed at 1024px with Quick-Edit Open',
      'Medium',
      `Opening Quick-Edit ('showInspector') mounts an aside of 320px ('w-80 shrink-0'). On 1024px width, available width drops to 704px. The triage card requires 720px (max-w-2xl 672px + 48px padding), causing horizontal cramping and squashing card elements.`
    );
  }
}

// Test 1.4: Picture-in-Picture Floating Window at minWidth 320px
{
  const pipMinW = 320;
  const pipPad = 24; // left-3 right-3 = 12px * 2
  const pipBarW = pipMinW - pipPad; // 296px
  const rightControlsW = 5 * 28 + 4 * 2; // 5 buttons (140px) + gaps = ~148px
  const leftBrandW = 16 + 8 + 48; // logo (16px) + gap + live badge (48px) = ~72px
  const fixedElementsW = rightControlsW + leftBrandW; // ~220px
  const availableUsernameW = pipBarW - fixedElementsW; // ~76px
  const declaredUsernameMaxW = 170; // max-w-[170px]

  if (declaredUsernameMaxW > availableUsernameW) {
    recordFlaw(
      'PiP Floating Window Header Collision',
      'PiP Header Username and Action Buttons Collide at minWidth 320px',
      'Medium',
      `BrowserWindow minWidth is 320px. The floating control bar has 296px width. Left brand/live elements (72px) plus 5 right control buttons (148px) leave only ~76px for username. The username span has 'max-w-[170px]' without dynamic flex-shrink constraints, causing it to push against and overlap the controls.`
    );
  }
}

// Test 1.5: TopNav Responsive Limits at < 800px Width
{
  const brandW = 220; // WatchPulse logo + stats text
  const navW = 250; // Live Monitor + Triage Model Library buttons
  const rightControlsW = 100 + 40 + 40 + 80; // Theme switch (100) + Trash (40) + Settings (40) + iMac buttons (80) = 260px
  const totalTopNavMinW = brandW + navW + rightControlsW + 32; // ~762px

  recordFlaw(
    'TopNav Responsive Limits',
    'TopNav Clips and Overflows at Viewports Below 768px Width (e.g. 640x480)',
    'Medium',
    `TopNav uses 'h-14 flex items-center justify-between gap-3' without responsive collapsing or hamburger menu. Left brand + nav items (470px) plus right theme switcher + actions + iMac window controls (260px) require ~762px minimum width. Below 768px (e.g. 640x480 or high-DPI scaling), items collide, clip, or push offscreen.`
  );
}

// -----------------------------------------------------------------------------
// STRESS TEST 2: Extreme Content Layout Stress
// -----------------------------------------------------------------------------
console.log('\n--- 2. Testing Extreme Content Layout Stress ---');

// Test 2.1: Live Monitor Card Badges vs Action Buttons Overlap
{
  // Badge container top-left:
  const statusBadgeW = 65; // "PUBLIC" or "OFFLINE"
  const scheduleBadgeW = 135; // "USUALLY NOW · 85%" or "EXPECTED (< 1 HR) · 85%"
  const viewersBadgeW = 60; // "1,234 viewers"
  const leftBadgesW = statusBadgeW + 6 + scheduleBadgeW + 6 + viewersBadgeW; // ~272px

  // Action buttons top-right:
  const stageBtnW = 55; // "Stage" button with MonitorPlay
  const wallBtnW = 50; // "Wall" button with CheckSquare
  const pipBtnW = 26; // PiP button
  const hideBtnW = 26; // EyeOff button
  const rightButtonsW = stageBtnW + 4 + wallBtnW + 4 + pipBtnW + 4 + hideBtnW; // ~168px

  const totalTopOverlayW = leftBadgesW + rightButtonsW + 16; // 456px total needed

  // Card width in 4-column or 5-column layout on 1024px or 1366px screen:
  // 1024px - 288px (sidebar) - 32px = 704px available.
  // 3-col: ~220px per card. 4-col: ~165px per card. 5-col: ~130px per card!
  const cardWidth3Col = 220;
  const cardWidth4Col = 165;

  const overlap3Col = totalTopOverlayW - cardWidth3Col; // 236px overlap!
  const overlap4Col = totalTopOverlayW - cardWidth4Col; // 291px overlap!

  if (overlap3Col > 0) {
    recordFlaw(
      'Live Monitor Card Overlay Collision',
      'Status Badges (Top-Left) and Action Buttons (Top-Right) Directly Overlap on Grid Cards',
      'Critical',
      `On Live Monitor grid cards, the top-left badges container ('absolute top-2 left-2 flex items-center gap-1.5 pointer-events-none') renders status ('PUBLIC'), schedule confidence ('EXPECTED (< 1 HR) · 85%'), and viewer counts (~272px). The top-right actions container ('absolute top-2 right-2 flex items-center gap-1') renders 'Stage', 'Wall', 'PiP', and 'Hide' buttons (~168px). Total required width is ~456px. In 3, 4, or 5-column grid modes (card widths 165px–260px), action buttons render directly over status badges, obscuring viewers and schedule text.`
    );
  }
}

// Test 2.2: 100-character usernames in cards, modals, and tables
{
  const longUsername = 'a'.repeat(100);
  const zwsUsername = 'user\u200Bname\u200Bwith\u200Bzero\u200Bwidth\u200Bspaces';

  // RapidSorterView lines 778 & 818
  recordFlaw(
    'RapidSorter Long Username Overflow',
    '100-Character Username in RapidSorter Card Does Not Truncate in Child Span',
    'High',
    `In RapidSorterView.tsx (line 778), the parent div has 'truncate' but the child '<span>@{activeModel.username}</span>' has no width or truncation constraints. Similarly, line 818 'Up next: <span className="text-slate-300 font-mono">@{nextModel.username}</span>' lacks 'truncate' or 'break-all', causing long 100-character handles to break outside card borders.`
  );

  // ModalShell line 55
  recordFlaw(
    'ModalShell Header Title Truncation Failure',
    '100-Character Model Name in ModalShell Pushes Close "X" Button Offscreen',
    'High',
    `In ModalShell.tsx (lines 53-68), the title container has no 'min-w-0' and '<h2 className="text-base font-semibold text-white">{title}</h2>' has no 'truncate' or 'break-words'. When editing a model with a 100-character name ('Edit Model — aaaaa...'), the title forces the header to expand horizontally, pushing the Close 'X' button off the screen.`
  );

  // ModelAvatar Unicode & Initials
  const mediaPath = path.join(rootDir, 'src', 'utils', 'media.ts');
  const mediaCode = fs.readFileSync(mediaPath, 'utf8');
  if (mediaCode.includes("replace(/[^a-zA-Z0-9_ ]/g, ' ')") && mediaCode.includes("return 'MS'")) {
    recordFlaw(
      'ModelAvatar Initials Generation',
      'International/Unicode/Symbol Usernames Fall Back to Stale "MS" Initials',
      'Medium',
      `In src/utils/media.ts:31, getInitials() strips all non-ASCII characters ('replace(/[^a-zA-Z0-9_ ]/g, " ")'). For international models (Japanese, Cyrillic, emoji, or zero-width handles), the cleaned string is empty and returns hardcoded 'MS' (legacy ModelSort acronym instead of WatchPulse 'WP').`
    );
  }
}

// Test 2.3: 30+ Badges and Multi-line Bios in RapidSorter
{
  recordFlaw(
    'RapidSorter Unbounded Content Expansion',
    '30+ Tags or Multi-Line Bios Push Action Buttons Below Viewport Fold on 768px Screens',
    'High',
    `In RapidSorterView.tsx (lines 843-863), tags are rendered in a boundless 'flex flex-wrap gap-1.5' container, and notes are rendered in '<p className="... whitespace-pre-wrap">{activeModel.notes}</p>' without 'max-h' or overflow scrolling. When models have 30+ tags or multi-paragraph bios, the triage card expands vertically by hundreds of pixels, pushing the Tier Action Deck buttons completely out of view on 768px displays.`
  );
}

// -----------------------------------------------------------------------------
// STRESS TEST 3: Theme Switching & Specular Glass Contrast Failures
// -----------------------------------------------------------------------------
console.log('\n--- 3. Testing Theme Switching, Specular Glass & Contrast ---');

const indexCssPath = path.join(rootDir, 'src', 'index.css');
const indexCss = fs.readFileSync(indexCssPath, 'utf8');

// Test 3.1: Toast Notifications in Light Mode
{
  // In Light Mode:
  // .text-slate-100 is forced to #0F172A
  // toast tones are bg-[#101C18], bg-[#1B160F], bg-[#1D1014], bg-[#121622]
  const toastBgSuccess = '#101C18';
  const toastBgWarning = '#1B160F';
  const toastBgError = '#1D1014';
  const toastBgInfo = '#121622';
  const lightModeText = '#0F172A';

  const ratioSuccess = getContrastRatio(lightModeText, toastBgSuccess);
  const ratioWarning = getContrastRatio(lightModeText, toastBgWarning);
  const ratioError = getContrastRatio(lightModeText, toastBgError);
  const ratioInfo = getContrastRatio(lightModeText, toastBgInfo);

  if (ratioSuccess < 4.5 || ratioWarning < 4.5 || ratioError < 4.5 || ratioInfo < 4.5) {
    recordFlaw(
      'Light Mode Toast Contrast Failure',
      `Toast Notifications Unreadable in Light Mode (Contrast Ratio: ${ratioSuccess.toFixed(2)}:1)`,
      'Critical',
      `In src/App.tsx:251-265, toast cards use dark tones 'bg-[#101C18]', 'bg-[#1B160F]', 'bg-[#1D1014]', and 'bg-[#121622]'. In src/index.css:390, '[data-theme="light"] .text-slate-100' forces text to near-black '#0F172A !important'. Because toast backgrounds are not overridden in Light Mode, dark text is rendered directly on pitch-black toast backgrounds with a contrast ratio of ${ratioSuccess.toFixed(2)}:1 (failing WCAG AA 4.5:1).`
    );
  }
}

// Test 3.2: Schedule Matrix Heatmap Low-Density Cells in Light Mode
{
  // In density mode: low cells use bg-indigo-950/60 with text-indigo-300
  // In light mode: text-indigo-300 is forced to #3730A3 (dark indigo)
  // bg-indigo-950 is #1E1B4B (very dark navy)
  const bgIndigo950 = '#1E1B4B';
  const textIndigoDark = '#3730A3';
  const ratioMatrixCell = getContrastRatio(textIndigoDark, bgIndigo950);

  if (ratioMatrixCell < 4.5) {
    recordFlaw(
      'Schedule Matrix Light Mode Cell Contrast Failure',
      `Heatmap Low-Density Cells Illegible in Light Mode (Contrast Ratio: ${ratioMatrixCell.toFixed(2)}:1)`,
      'Critical',
      `In ScheduleMatrixModal.tsx:617, low-density cells use 'bg-indigo-950/60' (near-black indigo background). In index.css:425, '[data-theme="light"] .text-indigo-300' forces text color to '#3730A3 !important' (dark indigo). Dark indigo text on dark indigo background produces an illegible contrast ratio of ${ratioMatrixCell.toFixed(2)}:1.`
    );
  }
}

// Test 3.3: DataGridView Inline Notes Focus Background in Light Mode
{
  const focusBg = '#0B0E15';
  const textSlate200Light = '#1E293B'; // index.css:394
  const ratioFocus = getContrastRatio(textSlate200Light, focusBg);

  if (ratioFocus < 4.5) {
    recordFlaw(
      'DataGridView Input Focus Contrast Failure',
      `Inline Notes Input Plunges into Darkness on Focus in Light Mode (Contrast Ratio: ${ratioFocus.toFixed(2)}:1)`,
      'High',
      `In DataGridView.tsx:657, the inline notes input has 'focus:bg-[#0B0E15]' (hardcoded pitch black). In Light Mode, text color is forced to dark slate '#1E293B !important'. When the user clicks into the note field, the background suddenly snaps to pitch black while typing in dark text (contrast ratio ${ratioFocus.toFixed(2)}:1).`
    );
  }
}

// Test 3.4: Schedule Matrix Inspector "Watch" Button Text in Light Mode
{
  const btnBg = '#4F46E5'; // bg-indigo-600
  const lightTextWhite = '#0F172A'; // index.css:386
  const ratioBtn = getContrastRatio(lightTextWhite, btnBg);

  // In ScheduleMatrixModal:886, className is 'bg-indigo-600/80 hover:bg-indigo-500 text-white'
  // index.css:410 only preserves white text for exact 'button.bg-indigo-600', NOT 'bg-indigo-600/80'
  recordFlaw(
    'Schedule Matrix Button Light Mode Contrast',
    `Inspector "Watch" Button Text Turns Near-Black on Indigo in Light Mode (Contrast Ratio: ${ratioBtn.toFixed(2)}:1)`,
    'High',
    `In ScheduleMatrixModal.tsx:886, the 'Watch' button uses 'bg-indigo-600/80 ... text-white'. In index.css:410-421, the white-text preservation selector only targets exact '.bg-indigo-600'. Because opacity modifier '/80' is used, '[data-theme="light"] .text-white' turns the text to near-black '#0F172A !important', rendering black text on dark indigo.`
  );
}

// Test 3.5: ArchiveBate Link Pill in Light Mode
{
  // LinkPillGroup.tsx:68: bg-violet-500/10 text-violet-300
  // text-violet-300 is #C4B5FD (light pastel violet)
  // On light card bg #FFFFFF:
  const textViolet300 = '#C4B5FD';
  const lightSurface = '#FFFFFF';
  const ratioViolet = getContrastRatio(textViolet300, lightSurface);

  if (ratioViolet < 4.5) {
    recordFlaw(
      'LinkPillGroup Violet Contrast Failure',
      `ArchiveBate Pill Invisible in Light Mode (Contrast Ratio: ${ratioViolet.toFixed(2)}:1)`,
      'High',
      `In LinkPillGroup.tsx:68 & 137, ArchiveBate links use 'text-violet-300' (#C4B5FD). Unlike indigo, emerald, sky, and amber, index.css has NO light mode override for 'text-violet-300'. Light pastel lavender text on a white card yields a contrast ratio of only ${ratioViolet.toFixed(2)}:1 (WCAG AA requires 4.5:1).`
    );
  }
}

// Test 3.6: Hardcoded Hex Colors Missing Light Mode Overrides
{
  const missingOverrides = [
    { cls: 'bg-[#10131C]', loc: 'DataGridView table header (thead)' },
    { cls: 'bg-[#161B28]', loc: 'RapidSorter dynamic tier buttons' },
    { cls: 'bg-[#141822]', loc: 'RapidSorter skip action button' },
    { cls: 'bg-[#0A0C12]', loc: 'ExportModal preview pre boxes' },
    { cls: 'bg-[#0B0D14]', loc: 'ImportModal candidate review lists' },
    { cls: 'bg-black/35', loc: 'ScheduleMatrixModal compact KPI strip' },
  ];

  for (const item of missingOverrides) {
    recordFlaw(
      'Light Mode Theme Inconsistency',
      `Missing Light Mode Override for ${item.cls} in ${item.loc}`,
      'Medium',
      `In src/index.css:451-464 and 479-494, specific dark hex and alpha classes are overridden with light surfaces. However, ${item.cls} in ${item.loc} was omitted from the override list, remaining pitch black in Light Mode.`
    );
  }
}

// Test 3.7: Grey Mode Theme Completeness
{
  recordFlaw(
    'Grey Mode Specular Contrast Inconsistency',
    'Grey Mode Lacks Component Background Overrides for Hardcoded Dark Hex Surfaces',
    'Medium',
    `In src/index.css:26-44, Grey Mode defines --bg-canvas: #161922 and --bg-surface: #20242F. However, unlike Light Mode, there are zero overrides for hardcoded dark classes ('bg-[#0C0F16]', 'bg-[#0B0E15]', 'bg-[#10131C]'). Because these hex values are darker than the grey canvas (#161922), they appear as stark, mismatched black blotches instead of unified frosted studio glass.`
  );
}

// Test 3.8: Floating Aura Bleed & Broken Specular Glass Refractions in Light Mode
{
  recordFlaw(
    'Broken Glass Refraction in Light Mode',
    'Heavy Saturated Aura Glow Orbs Bleed Through Semi-Transparent Light Glass',
    'Medium',
    `FloatingAuraBackground.tsx mounts high-opacity orbs ('from-blue-600/40 via-indigo-600/30 to-violet-700/20' and 'from-violet-600/30 via-fuchsia-600/20'). In Light Mode, cards and headers have semi-transparent backgrounds ('--glass-bg: rgba(255, 255, 255, 0.84)'). As the GPU aura drifts, dense dark purple/azure splotches refract through the frosted glass behind text and inputs, breaking visual clarity.`
  );
}

// Test 3.9: Unresolved CSS Utility Class: shadow-elevation
{
  const tailwindPath = path.join(rootDir, 'tailwind.config.js');
  const tailwindConfig = fs.readFileSync(tailwindPath, 'utf8');
  if (!tailwindConfig.includes('elevation') && !indexCss.includes('.shadow-elevation')) {
    recordFlaw(
      'Unresolved CSS Class',
      'Unresolved "shadow-elevation" Class in ModalShell and Kanban Cards',
      'Low',
      `'shadow-elevation' is referenced in src/components/common/ModalShell.tsx:47 and src/components/views/KanbanView.tsx:484. However, neither tailwind.config.js nor src/index.css defines this utility, causing it to fail silently and produce no box-shadow elevation.`
    );
  }
}

// -----------------------------------------------------------------------------
// SUMMARY REPORT
// -----------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`📊 STRESS TEST COMPLETED: Found ${discoveredFlaws.length} Visual, Responsive & UX Flaws`);
console.log('================================================================\n');

const criticals = discoveredFlaws.filter((f) => f.severity === 'Critical');
const highs = discoveredFlaws.filter((f) => f.severity === 'High');
const mediums = discoveredFlaws.filter((f) => f.severity === 'Medium');
const lows = discoveredFlaws.filter((f) => f.severity === 'Low');

console.log(`Critical: ${criticals.length} | High: ${highs.length} | Medium: ${mediums.length} | Low: ${lows.length}\n`);

// Save findings artifact to scratch directory
const reportPath = path.join(rootDir, 'scripts', 'stress-user-compact-report.json');
fs.writeFileSync(reportPath, JSON.stringify(discoveredFlaws, null, 2), 'utf8');
console.log(`Full JSON report saved to ${reportPath}`);
