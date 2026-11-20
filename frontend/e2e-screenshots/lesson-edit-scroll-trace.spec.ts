import { test, type Page, type BrowserContext } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Measures the actual cause of lesson-edit-modal scroll jank via a real
 * Chrome DevTools Protocol performance trace - not a code-reading guess.
 * Rob reported scrolling is STILL slow after the Group A blur/query fix
 * (PR #19, main 68c9d57) - this records a scripted scroll inside the
 * modal (and, for comparison, the Lessons page behind it, StudentModal,
 * and SmartBookingForm) while a CDP trace runs, then summarizes dropped
 * frames and category time (Recalculate Style / Layout / Paint / Composite
 * / Scripting) from the raw trace events.
 *
 * Requires both dev servers running (backend :4000, frontend :5173) and a
 * large seeded tenant (~300 students / ~2000 lessons, tagged
 * notes='PERFSEED') already loaded into the primary tenant - see the
 * investigation report for the seed script used.
 *
 * Not a CI test - a one-off measurement tool. Traces are saved to
 * e2e-screenshots/__traces__/*.json (gitignored) for manual inspection in
 * chrome://tracing or DevTools' Performance panel if a deeper look is
 * needed beyond this script's own summary.
 */

const TRACE_DIR = 'e2e-screenshots/__traces__';
fs.mkdirSync(TRACE_DIR, { recursive: true });

// Minimal shape of a Chrome trace event (Tracing.dataCollected payload) -
// only the fields this script actually reads.
interface TraceEvent {
  name: string;
  ph: string;
  dur?: number;
  pid: number;
  tid: number;
  args?: { name?: string };
}

interface PerfWindow extends Window {
  __rafSamples?: number[];
  __rafRunning?: boolean;
  __commitCount?: number;
}

interface TraceSummary {
  label: string;
  totalMs: number;
  categoryMs: Record<string, number>;
  longFrames: number; // frames with a RunTask/composite gap > 16.7ms, counted via rAF deltas instead (see scrollAndMeasure)
  rafDroppedFrames: number;
  rafAvgFrameMs: number;
  rafMaxFrameMs: number;
  renderCount: number | null; // React re-render count during scroll, when measured
}

const results: TraceSummary[] = [];

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

/**
 * Scrolls `selector`'s element by dy in `steps` increments, each followed
 * by a real wheel event (not a direct scrollTop set) so the browser does
 * real scroll-driven compositing work, while sampling requestAnimationFrame
 * deltas client-side to detect dropped frames (any frame >16.7ms at 60fps,
 * or >33.4ms at minimum-acceptable 30fps).
 */
async function scrollAndMeasure(page: Page, selector: string, totalDy: number, steps: number) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`Could not find element for selector: ${selector}`);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await page.evaluate(() => {
    const w = window as PerfWindow;
    w.__rafSamples = [];
    w.__rafRunning = true;
    let last = performance.now();
    function tick() {
      const now = performance.now();
      w.__rafSamples!.push(now - last);
      last = now;
      if (w.__rafRunning) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });

  await page.mouse.move(cx, cy);
  const dyPerStep = totalDy / steps;
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dyPerStep);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(200);

  const samples: number[] = await page.evaluate(() => {
    const w = window as PerfWindow;
    w.__rafRunning = false;
    return w.__rafSamples ?? [];
  });
  // Drop the first sample (startup noise) and any trailing near-zero
  // samples after scrolling stopped.
  const usable = samples.slice(1, steps + 5);
  const avg = usable.reduce((a, b) => a + b, 0) / (usable.length || 1);
  const max = Math.max(...usable, 0);
  const dropped = usable.filter((d) => d > 33.4).length;
  return { avg, max, dropped, count: usable.length };
}

function summarizeTrace(traceEvents: TraceEvent[]): Record<string, number> {
  const categoryMs: Record<string, number> = {
    'Recalculate Style': 0,
    'Layout': 0,
    'Paint': 0,
    'Composite': 0,
    'Scripting (Run Task/Function Call)': 0,
    'Other': 0,
  };
  for (const ev of traceEvents) {
    if (ev.ph !== 'X' || typeof ev.dur !== 'number') continue;
    const ms = ev.dur / 1000;
    const name = ev.name || '';
    if (name === 'UpdateLayoutTree' || name === 'RecalculateStyles') {
      categoryMs['Recalculate Style'] += ms;
    } else if (name === 'Layout' || name === 'UpdateLayoutTree') {
      categoryMs['Layout'] += ms;
    } else if (name === 'Paint' || name === 'PaintImage' || name === 'RasterTask') {
      categoryMs['Paint'] += ms;
    } else if (name === 'CompositeLayers' || name === 'Compositor') {
      categoryMs['Composite'] += ms;
    } else if (name === 'RunTask' || name === 'FunctionCall' || name === 'EvaluateScript' || name === 'V8.Execute') {
      categoryMs['Scripting (Run Task/Function Call)'] += ms;
    } else {
      categoryMs['Other'] += ms;
    }
  }
  return categoryMs;
}

async function withCdpTrace<T>(
  context: BrowserContext,
  page: Page,
  label: string,
  action: () => Promise<T>
): Promise<T> {
  const client = await context.newCDPSession(page);
  const events: TraceEvent[] = [];
  client.on('Tracing.dataCollected', (p: { value?: TraceEvent[] }) => {
    if (p.value) events.push(...p.value);
  });
  const tracingComplete = new Promise<void>((resolve) => {
    client.on('Tracing.tracingComplete', () => resolve());
  });

  await client.send('Tracing.start', {
    categories: [
      'disabled-by-default-devtools.timeline',
      'devtools.timeline',
      'blink.user_timing',
      'disabled-by-default-devtools.timeline.frame',
    ].join(','),
    options: 'sampling-frequency=10000',
  });
  // Tracing.start's own response resolving doesn't guarantee the tracing
  // agent is actively recording yet in every Chromium build - a short
  // settle avoids losing the first few frames of the scroll to a race.
  await page.waitForTimeout(100);

  const result = await action();
  await client.send('Tracing.end');
  await tracingComplete;

  const categoryMs = summarizeTrace(events);
  const totalMs = Object.values(categoryMs).reduce((a, b) => a + b, 0);
  fs.writeFileSync(path.join(TRACE_DIR, `${label}.trace.json`), JSON.stringify(events));

  results.push({ label, totalMs, categoryMs, longFrames: 0, rafDroppedFrames: 0, rafAvgFrameMs: 0, rafMaxFrameMs: 0, renderCount: null });
  return result;
}

test('measure: scroll inside the lesson edit modal', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    storageState: 'e2e-screenshots/.auth/admin.json',
  });
  const page = await context.newPage();
  await page.goto('/lessons');
  await setTheme(page, 'light');
  await page.waitForTimeout(1000);

  const editButton = page.getByRole('button', { name: /edit lesson/i }).first();
  await editButton.waitFor({ state: 'visible' });
  await editButton.click();
  await page.waitForTimeout(600);

  const card = page.locator('.overflow-y-auto.rounded-3xl').first();
  await card.waitFor({ state: 'visible' });

  const scrollResult = await withCdpTrace(context, page, 'modal-scroll', () =>
    scrollAndMeasure(page, '.overflow-y-auto.rounded-3xl', 400, 20)
  );

  const last = results[results.length - 1];
  last.rafAvgFrameMs = scrollResult.avg;
  last.rafMaxFrameMs = scrollResult.max;
  last.rafDroppedFrames = scrollResult.dropped;

  await context.close();
});

test('measure: scroll the Lessons page behind the modal (modal closed)', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    storageState: 'e2e-screenshots/.auth/admin.json',
  });
  const page = await context.newPage();
  await page.goto('/lessons');
  await setTheme(page, 'light');
  await page.waitForTimeout(1000);

  const scrollResult = await withCdpTrace(context, page, 'lessons-page-scroll-no-modal', () =>
    scrollAndMeasure(page, 'body', 600, 20)
  );
  const last = results[results.length - 1];
  last.rafAvgFrameMs = scrollResult.avg;
  last.rafMaxFrameMs = scrollResult.max;
  last.rafDroppedFrames = scrollResult.dropped;

  await context.close();
});

test('measure: scroll the Lessons page behind the OPEN modal', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    storageState: 'e2e-screenshots/.auth/admin.json',
  });
  const page = await context.newPage();
  await page.goto('/lessons');
  await setTheme(page, 'light');
  await page.waitForTimeout(1000);

  const editButton = page.getByRole('button', { name: /edit lesson/i }).first();
  await editButton.waitFor({ state: 'visible' });
  await editButton.click();
  await page.waitForTimeout(600);

  // Scroll the page body behind the fixed overlay (if any pointer-events
  // reach it) to isolate whether the backdrop-blur-[2px] over a large
  // table repaints on every frame of a scroll that's actually happening
  // behind it - e.g. driven by a background interval/poll, not the user.
  const scrollResult = await withCdpTrace(context, page, 'lessons-page-scroll-with-modal-open', async () => {
    await page.waitForTimeout(2500); // let any polling interval fire a few times while we "watch"
    return { avg: 0, max: 0, dropped: 0, count: 0 };
  });
  const last = results[results.length - 1];
  last.rafAvgFrameMs = scrollResult.avg;

  await context.close();
});

test('measure: React re-renders during modal scroll (React DevTools profiler hook)', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    storageState: 'e2e-screenshots/.auth/admin.json',
  });
  const page = await context.newPage();

  // Inject a minimal React DevTools global hook BEFORE the app loads so
  // React's profiling onCommitFiberRoot calls are observable - counts
  // commits (renders) rather than full component names, which is enough
  // to answer "does anything re-render on scroll."
  await page.addInitScript(() => {
    const w = window as PerfWindow & { __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown };
    w.__commitCount = 0;
    w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      isDisabled: false,
      supportsFiber: true,
      renderers: new Map(),
      inject() { return 1; },
      onCommitFiberRoot() { w.__commitCount!++; },
      onCommitFiberUnmount() {},
      onScheduleFiberRoot() {},
      checkDCE() {},
    };
  });

  await page.goto('/lessons');
  await setTheme(page, 'light');
  await page.waitForTimeout(1000);

  const editButton = page.getByRole('button', { name: /edit lesson/i }).first();
  await editButton.waitFor({ state: 'visible' });
  await editButton.click();
  await page.waitForTimeout(600);

  await page.evaluate(() => { (window as PerfWindow).__commitCount = 0; });

  const box = await page.locator('.overflow-y-auto.rounded-3xl').first().boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 20; i++) {
      await page.mouse.wheel(0, 20);
      await page.waitForTimeout(16);
    }
  }
  await page.waitForTimeout(200);

  const commitCount = await page.evaluate(() => (window as PerfWindow).__commitCount);
  results.push({
    label: 'react-commits-during-modal-scroll',
    totalMs: 0,
    categoryMs: {},
    longFrames: 0,
    rafDroppedFrames: 0,
    rafAvgFrameMs: 0,
    rafMaxFrameMs: 0,
    renderCount: commitCount,
  });

  await context.close();
});

test('measure: StudentModal scroll (comparison)', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    storageState: 'e2e-screenshots/.auth/admin.json',
  });
  const page = await context.newPage();
  await page.goto('/students');
  await setTheme(page, 'light');
  await page.waitForTimeout(1000);

  await page.getByRole('button', { name: /add student/i }).click();
  await page.waitForTimeout(600);

  const card = page.locator('.overflow-y-auto.rounded-3xl').first();
  await card.waitFor({ state: 'visible' });

  const scrollResult = await withCdpTrace(context, page, 'studentmodal-scroll', () =>
    scrollAndMeasure(page, '.overflow-y-auto.rounded-3xl', 500, 20)
  );
  const last = results[results.length - 1];
  last.rafAvgFrameMs = scrollResult.avg;
  last.rafMaxFrameMs = scrollResult.max;
  last.rafDroppedFrames = scrollResult.dropped;

  await context.close();
});

test('measure: SmartBookingForm scroll (comparison)', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    storageState: 'e2e-screenshots/.auth/admin.json',
  });
  const page = await context.newPage();
  await page.goto('/lessons');
  await setTheme(page, 'light');
  await page.waitForTimeout(1000);

  await page.getByRole('button', { name: /book new lesson/i }).click();
  await page.waitForTimeout(600);

  const card = page.locator('.overflow-y-auto.rounded-3xl').first();
  await card.waitFor({ state: 'visible' });

  const scrollResult = await withCdpTrace(context, page, 'smartbookingform-scroll', () =>
    scrollAndMeasure(page, '.overflow-y-auto.rounded-3xl', 400, 20)
  );
  const last = results[results.length - 1];
  last.rafAvgFrameMs = scrollResult.avg;
  last.rafMaxFrameMs = scrollResult.max;
  last.rafDroppedFrames = scrollResult.dropped;

  await context.close();

  // Final step of the whole suite - print the summary table.
  console.log('\n=== TRACE SUMMARY ===');
  for (const r of results) {
    console.log(`\n--- ${r.label} ---`);
    if (r.renderCount !== null) {
      console.log(`  React commits during scroll: ${r.renderCount}`);
    } else {
      console.log(`  rAF avg frame: ${r.rafAvgFrameMs.toFixed(2)}ms, max: ${r.rafMaxFrameMs.toFixed(2)}ms, dropped(>33.4ms): ${r.rafDroppedFrames}`);
      console.log(`  Trace total: ${r.totalMs.toFixed(2)}ms`);
      for (const [cat, ms] of Object.entries(r.categoryMs)) {
        if (ms > 0.01) console.log(`    ${cat}: ${ms.toFixed(2)}ms`);
      }
    }
  }
  fs.writeFileSync(path.join(TRACE_DIR, 'summary.json'), JSON.stringify(results, null, 2));
});
