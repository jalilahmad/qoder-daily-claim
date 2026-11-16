#!/usr/bin/env node
/**
 * qoder-claim.js - Automates Qoder's daily free-credit claim (100 Credits/day).
 *
 * Verified flow (Qoder desktop 0.5.12, Windows):
 *   1. Click the profile button in the sidebar footer (aria-label "Open user menu").
 *   2. Click the "Rewards center" menu item.
 *   3. Qoder opens the campaign page as an iframe:
 *      https://openapi.qoder.sh/growth-page/activity-iframe
 *   4. Inside that iframe, click the enabled "Claim" button on the
 *      "Claim 100 Credits Daily" card.
 *   5. Verify the page says "Claimed successfully".
 *
 * Important: opening the campaign through the IPC call `openCampaignSurface()`
 * leaves the page stuck on "Connecting to Qoder Desktop…". Only the real UI path
 * (profile menu -> Rewards center) wires up the host bridge, so that is what we drive.
 *
 * Requires Qoder running with --remote-debugging-port=9222 (run-claim.ps1 handles this).
 *
 * Exit codes: 0 = claimed, or nothing claimable; 1 = error or unconfirmed.
 */
const fs = require("fs");
const path = require("path");
const { connect, attach, evalIn, targets, findRenderer } = require("./cdp");

const LOG = path.join(__dirname, "..", "claim-log.txt");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG, line + "\n", "utf8"); } catch (_) {}
}

async function realClick(send, sid, x, y) {
  for (const type of ["mousePressed", "mouseReleased"]) {
    await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 }, sid);
    await sleep(100);
  }
}

async function pressEscape(send, sid) {
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sid);
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sid);
  await sleep(600);
}

async function waitFor(send, sid, expr, tries = 24, delay = 500) {
  for (let i = 0; i < tries; i++) {
    try {
      const v = JSON.parse(await evalIn(send, sid, expr));
      if (v) return v;
    } catch (_) {}
    await sleep(delay);
  }
  return null;
}

const PROFILE_BTN = `(() => {
  const b = [...document.querySelectorAll("button,[role=button]")]
    .find((x) => (x.getAttribute("aria-label") || "") === "Open user menu"
              && x.getBoundingClientRect().width > 100);
  if (!b) return JSON.stringify(null);
  const r = b.getBoundingClientRect();
  return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
})()`;

const REWARDS_ITEM = `(() => {
  const el = [...document.querySelectorAll("[role=menuitem]")]
    .find((e) => /rewards?\\s*center/i.test(e.innerText || ""));
  if (!el) return JSON.stringify(null);
  const r = el.getBoundingClientRect();
  return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
})()`;

const FRAME_STATE = `(() => JSON.stringify({
  text: document.body ? document.body.innerText.replace(/\\s+/g, " ") : "",
  claimEnabled: [...document.querySelectorAll("button")]
    .some((b) => (b.innerText || "").trim() === "Claim" && !b.disabled)
}))()`;

async function findCampaignFrame(send, tries = 20) {
  for (let i = 0; i < tries; i++) {
    const list = await targets(send);
    const fr = list.find((t) => t.type === "iframe" && (t.url || "").includes("growth-page"));
    if (fr) return fr;
    await sleep(1000);
  }
  return null;
}

async function main() {
  log("--- run start ---");
  const { send, close } = await connect();
  const renderer = await findRenderer(send);
  const rsid = await attach(send, renderer.targetId);

  // Already claimed? The campaign page is the source of truth, but a cheap check
  // first: if Qoder says nothing is claimable, there is nothing to do.
  const status = JSON.parse(await evalIn(send, rsid,
    "(async()=>{try{const s=await window.qoderDesktop.getCampaignStatus();return JSON.stringify(s)}catch(e){return JSON.stringify({err:e.message})}})()"));
  log(`status: claimable=${status.hasClaimableCampaign}`);
  if (status.hasClaimableCampaign === false) {
    log("nothing to claim right now (already claimed for this window, or no active campaign).");
    close();
    process.exit(0);
  }

  // If the campaign window is already open, reuse it instead of reopening.
  let frame = await findCampaignFrame(send, 1);

  if (!frame) {
    await pressEscape(send, rsid);

    // 1) Open the user menu.
    const prof = await waitFor(send, rsid, PROFILE_BTN);
    if (!prof) { log("ERROR: profile button not found"); close(); process.exit(1); }
    await realClick(send, rsid, prof.x, prof.y);
    log(`clicked profile button at ${prof.x},${prof.y}`);

    // 2) Click "Rewards center".
    const item = await waitFor(send, rsid, REWARDS_ITEM);
    if (!item) { log("ERROR: 'Rewards center' menu item not found"); close(); process.exit(1); }
    await realClick(send, rsid, item.x, item.y);
    log(`clicked Rewards center at ${item.x},${item.y}`);

    // 3) Wait for the campaign iframe.
    frame = await findCampaignFrame(send);
    if (!frame) { log("ERROR: campaign iframe never appeared"); close(); process.exit(1); }
  } else {
    log("campaign window already open; reusing it");
  }
  log("campaign iframe: " + frame.url);

  const fsid = await attach(send, frame.targetId);

  // 4) Read the frame; wait for the card to render.
  let state = null;
  for (let i = 0; i < 20; i++) {
    await sleep(1000);
    try {
      state = JSON.parse(await evalIn(send, fsid, FRAME_STATE));
      if (state.text && state.text.length > 80) break;
    } catch (_) {}
  }
  if (!state) { log("ERROR: campaign content unreadable"); close(); process.exit(1); }
  log("content: " + state.text.slice(0, 260));

  if (/Claimed successfully/i.test(state.text)) {
    log("already claimed for this window.");
    close();
    process.exit(0);
  }
  if (!state.claimEnabled) {
    log("no enabled Claim button (card may still be loading, or already claimed).");
    close();
    process.exit(/Claimed/i.test(state.text) ? 0 : 1);
  }

  // 5) Click Claim on the daily card.
  const clickRes = JSON.parse(await evalIn(send, fsid, `(() => {
    const b = [...document.querySelectorAll("button")]
      .find((x) => (x.innerText || "").trim() === "Claim" && !x.disabled);
    if (!b) return JSON.stringify({ clicked: false });
    b.click();
    return JSON.stringify({ clicked: true });
  })()`));
  log("click: " + JSON.stringify(clickRes));
  if (!clickRes.clicked) { log("ERROR: could not click Claim"); close(); process.exit(1); }

  // 6) Verify.
  await sleep(7000);
  let after = null;
  try { after = JSON.parse(await evalIn(send, fsid, FRAME_STATE)); } catch (_) {}
  const afterText = after ? after.text : "";
  log("after: " + afterText.slice(0, 260));

  const ok = /Claimed successfully/i.test(afterText) ||
    (/Claimed/i.test(afterText) && !after.claimEnabled);
  log(ok ? "RESULT: claim succeeded" : "RESULT: claim NOT confirmed - verify in Qoder");
  close();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { log("FATAL: " + (e && e.stack ? e.stack : e)); process.exit(1); });
