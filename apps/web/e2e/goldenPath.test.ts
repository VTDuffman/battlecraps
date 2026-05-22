// =============================================================================
// BATTLECRAPS — GOLDEN PATH E2E TEST SUITE
// apps/web/e2e/goldenPath.test.ts
//
// Six tests that prove the full stack (React UI → API → Socket.io → back to UI)
// works end-to-end using VITE_TEST_MODE to bypass Clerk auth.
//
// Test overview:
//   1. App boots and shows bankroll display
//   2. Natural (7) increases bankroll; roll log shows the result
//   3. Seven-out decrements the shooter count
//   4. Two point cycles push hype to tier 2 (animate-dice-heat visible)
//   5. Four naturals clear marker 0 → MarkerCelebrationPhase appears
//   6. Five seven-outs exhaust shooters → GameOverScreen appears
// =============================================================================

import { test, expect, type APIRequestContext } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_CLERK_ID = 'test_user_e2e';
const API_URL       = 'http://localhost:3001';

const EMPTY_BETS = {
  passLine: 0,
  odds:     0,
  hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 },
};

const PASS_500 = { ...EMPTY_BETS, passLine: 500 };

// ---------------------------------------------------------------------------
// Helper — POST a roll with predetermined dice directly to the API.
// Uses x-test-user-id header to bypass Clerk JWT verification.
// ---------------------------------------------------------------------------

async function rollWithDice(
  request: APIRequestContext,
  runId:   string,
  bets:    typeof EMPTY_BETS,
  d1:      number,
  d2:      number,
) {
  return request.post(`${API_URL}/api/v1/runs/${runId}/roll`, {
    headers: {
      'content-type':    'application/json',
      'x-test-user-id':  TEST_CLERK_ID,
    },
    data: { bets, cheat_dice: [d1, d2] },
  });
}

// ---------------------------------------------------------------------------
// Helper — wait for the app to finish booting and socket to subscribe.
// Returns the run ID exposed on window.__testRunId.
// ---------------------------------------------------------------------------

async function waitForApp(page: import('@playwright/test').Page): Promise<string> {
  await page.goto('/');
  // window.__testRunId is set only after socket successfully subscribes to the
  // run room, so this implicitly waits for both React init and socket handshake.
  await page.waitForFunction(() => typeof window.__testRunId === 'string', {
    timeout: 15_000,
  });
  return page.evaluate(() => window.__testRunId!);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('1: app boots and shows bankroll', async ({ page }) => {
  await waitForApp(page);
  await expect(page.getByTestId('bankroll')).toBeVisible();
  await expect(page.getByTestId('bankroll')).toContainText('$');
});

test('2: natural (7) increases bankroll and appears in roll log', async ({ page, request }) => {
  const runId = await waitForApp(page);

  const bankrollEl = page.getByTestId('bankroll');
  const before = await bankrollEl.innerText();

  // 3+4=7 → NATURAL on come-out
  const res = await rollWithDice(request, runId, PASS_500, 3, 4);
  expect(res.ok()).toBeTruthy();

  // Wait for socket turn:settled → applyPendingSettlement (50 ms) + re-render
  await page.waitForTimeout(300);

  const after = await bankrollEl.innerText();
  expect(after).not.toBe(before);

  // Roll log should contain the natural result
  const rollLog = page.getByTestId('roll-log');
  await expect(rollLog).toContainText(/natural/i);
});

test('3: seven-out decrements shooter count', async ({ page, request }) => {
  const runId = await waitForApp(page);

  // Establish a point: 1+5=6
  const setRes = await rollWithDice(request, runId, PASS_500, 1, 5);
  expect(setRes.ok()).toBeTruthy();
  await page.waitForTimeout(300);

  // Count filled shooter dots before the seven-out
  const shootersEl  = page.getByTestId('shooters');
  const dotsBefore  = await shootersEl.locator('.bg-gold').count();

  // Seven-out: 3+4=7 in POINT_ACTIVE
  const outRes = await rollWithDice(request, runId, PASS_500, 3, 4);
  expect(outRes.ok()).toBeTruthy();
  await page.waitForTimeout(300);

  const dotsAfter = await shootersEl.locator('.bg-gold').count();
  expect(dotsAfter).toBe(dotsBefore - 1);

  // Roll log should record the seven-out
  await expect(page.getByTestId('roll-log')).toContainText(/seven.out/i);
});

test('4: three point cycles push hype to tier 2 (animate-dice-heat)', async ({ page, request }) => {
  const runId = await waitForApp(page);

  // Cycle 1: set point=4, hit it
  await rollWithDice(request, runId, PASS_500, 2, 2); // POINT_SET (4)
  await page.waitForTimeout(300);
  await rollWithDice(request, runId, PASS_500, 2, 2); // POINT_HIT (streak=0: +0.15 → 1.15)
  await page.waitForTimeout(300);

  // Cycle 2: set point=4, hit it again
  await rollWithDice(request, runId, PASS_500, 2, 2); // POINT_SET (4)
  await page.waitForTimeout(300);
  await rollWithDice(request, runId, PASS_500, 2, 2); // POINT_HIT (streak=1: +0.20 → 1.35)
  await page.waitForTimeout(300);

  // Cycle 3: set point=4, hit it again → hype 1.60 → crosses 1.50 (Heating Up)
  await rollWithDice(request, runId, PASS_500, 2, 2); // POINT_SET (4)
  await page.waitForTimeout(300);
  await rollWithDice(request, runId, PASS_500, 2, 2); // POINT_HIT (streak=2: +0.25 → 1.60)
  await page.waitForTimeout(300);

  // Heating Up class applied to the dice container
  await expect(page.locator('.animate-dice-heat').first()).toBeVisible();
});

test('5: four naturals clear marker 0 → marker celebration appears', async ({ page, request }) => {
  const runId = await waitForApp(page);

  // 4 naturals with passLine=500, starting bankroll=3000 → bankroll ~5300 > 5000 target
  for (let i = 0; i < 4; i++) {
    const res = await rollWithDice(request, runId, PASS_500, 3, 4); // 7 = NATURAL
    expect(res.ok()).toBeTruthy();
    await page.waitForTimeout(300);
  }

  // After the marker clears, applyPendingSettlement sets pendingTransition=true.
  // A 3-second safety timeout then sets activeTransition='MARKER_CLEAR' which
  // renders MarkerCelebrationPhase with data-testid="marker-celebration".
  await expect(page.getByTestId('marker-celebration')).toBeVisible({ timeout: 15_000 });
});

test('6: five seven-outs exhaust shooters → game over screen', async ({ page, request }) => {
  const runId = await waitForApp(page);

  // 5 × [point-set → seven-out] drains all 5 shooters → GAME_OVER
  for (let i = 0; i < 5; i++) {
    // Set a point (1+5=6)
    const setRes = await rollWithDice(request, runId, PASS_500, 1, 5);
    expect(setRes.ok()).toBeTruthy();
    await page.waitForTimeout(300);

    // Seven-out (3+4=7) — loses pass line bet; last cycle → status=GAME_OVER
    const outRes = await rollWithDice(request, runId, PASS_500, 3, 4);
    expect(outRes.ok()).toBeTruthy();
    await page.waitForTimeout(300);
  }

  await expect(page.getByTestId('game-over-screen')).toBeVisible({ timeout: 15_000 });
});
