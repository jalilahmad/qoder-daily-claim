#!/usr/bin/env node
/**
 * qoder-claim.js - Automates Qoder's daily free-credit claim (100 Credits/day).
 *
 * Mechanism (verified against Qoder desktop 0.5.12):
 *  - The app exposes campaign state over its own IPC bridge (window.qoderDesktop).
 *  - The claim UI is a web page: https://openapi.qoder.sh/growth-page/activity-iframe
 *    rendered as an Electron WebContentsView, which shows up as a CDP "iframe" target.
 *  - Claiming is a manual click on the daily card. This script performs that click
 *    through the app's own renderer, so it uses the app's real session.
 *
 * Requires Qoder running with --remote-debugging-port=9222 (run-claim.ps1 handles this).
 *
 * Exit codes: 0 = claimed, or nothing claimable (already claimed / no campaign)
 *             1 = error or unconfirmed
 */
const fs = require("fs");
const path = require("path");
const { connect, attach, evalIn, findRenderer, findCampaignFrame } = require("./cdp");

const LOG = path.join(__dirname, "..", "claim-log.txt");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG, line + "\n", "utf8"); } catch (_) {}
}

async function getStatus(send, sid) {
  const raw = await evalIn(send, sid, `(async () => {
    try { const s = await window.qoderDesktop.getCampaignStatus(); return JSON.stringify({ ok: true, status: s }); }
    catch (e) { return JSON.stringify({ ok: false, error: e.message }); }
  })()`);
  return JSON.parse(raw);
}

async function openSurface(send, sid, url) {
  const raw = await evalIn(send, sid, `(async () => {
    try {
      await window.qoderDesktop.openCampaignSurface({
        source: "settings_menu", language: "en-US", theme: "light",
        reopened: false, campaignUrl: ${JSON.stringify(url)}
      });
      return JSON.stringify({ ok: true });
    } catch (e) { return JSON.stringify({ ok: false, error: e.message }); }
  })()`);
  return JSON.parse(raw);
}

const FRAME_PROBE = `(() => {
  const txt = document.body ? document.body.innerText : "";
  return JSON.stringify({ text: txt.slice(0, 1500) });
})()`;

// Click the daily-credit card's own action button. Card-first, generic label second.
const FRAME_CLICK = `(() => {
  const norm = (s) => (s || "").replace(/\\s+/g, " ").trim().toLowerCase();
  const enabled = (b) => !(b.disabled === true || b.getAttribute("aria-disabled") === "true");
  const isClaimWord = (t) => /^(claim|claim now|claim reward|领取|立即领取)$/.test(t);

  // 1) The daily 100-credit card: smallest container mentioning it.
  const cards = [...document.querySelectorAll("div,section,li,article")]
    .filter((c) => /claim 100 credits daily/i.test(c.innerText || ""))
    .sort((a, b) => (a.innerText || "").length - (b.innerText || "").length);

  for (const card of cards) {
    const btns = [...card.querySelectorAll("button,[role=button],a")].filter(enabled);
    const claimBtn = btns.find((b) => isClaimWord(norm(b.innerText || b.textContent)));
    if (claimBtn) {
      claimBtn.click();
      return JSON.stringify({ clicked: true, via: "daily-card", label: norm(claimBtn.innerText || claimBtn.textContent) });
    }
    if (btns.length === 1) {
      btns[0].click();
      return JSON.stringify({ clicked: true, via: "daily-card-single", label: norm(btns[0].innerText || btns[0].textContent) });
    }
  }

  // 2) Any enabled claim-labelled control on the page.
  const generic = [...document.querySelectorAll("button,[role=button],a")]
    .filter(enabled)
    .find((b) => isClaimWord(norm(b.innerText || b.textContent)));
  if (generic) {
    generic.click();
    return JSON.stringify({ clicked: true, via: "generic", label: norm(generic.innerText || generic.textContent) });
  }

  return JSON.stringify({ clicked: false, reason: "no enabled claim control found" });
})()`;

async function waitForFrame(send, tries = 25) {
  for (let i = 0; i < tries; i++) {
    const f = await findCampaignFrame(send);
    if (f) return f;
    await sleep(1000);
  }
  return null;
}

async function readFrame(send, fsid, tries = 15) {
  let last = null;
  for (let i = 0; i < tries; i++) {
    await sleep(1000);
    try {
      last = JSON.parse(await evalIn(send, fsid, FRAME_PROBE));
      if (last.text && last.text.length > 40) return last;
    } catch (_) {}
  }
  return last;
}

async function main() {
  log("--- run start ---");
  const { send, close } = await connect();
  const renderer = await findRenderer(send);
  const rsid = await attach(send, renderer.targetId);

  const st = await getStatus(send, rsid);
  if (!st.ok) { log("ERROR: campaign status unreadable: " + st.error); close(); process.exit(1); }

  const status = st.status;
  log(`status: claimable=${status.hasClaimableCampaign} url=${status.campaignPopupUrl}`);

  if (!status.hasClaimableCampaign) {
    log("nothing to claim right now (already claimed for this window, or no active campaign).");
    close();
    process.exit(0);
  }

  const opened = await openSurface(send, rsid, status.campaignPopupUrl);
  log("open surface: " + JSON.stringify(opened));

  const frame = await waitForFrame(send);
  if (!frame) { log("ERROR: campaign surface never rendered"); close(); process.exit(1); }
  log("campaign frame: " + frame.url);

  const fsid = await attach(send, frame.targetId);
  const probe = await readFrame(send, fsid);
  if (!probe || !probe.text) { log("ERROR: campaign content unreadable"); close(); process.exit(1); }
  log("content: " + probe.text.replace(/\s+/g, " ").slice(0, 320));

  if (/daily[\s\S]{0,120}?claimed/i.test(probe.text) && !/claim now/i.test(probe.text)) {
    log("daily credits already claimed for this window.");
    close();
    process.exit(0);
  }

  const clickRes = JSON.parse(await evalIn(send, fsid, FRAME_CLICK));
  log("click: " + JSON.stringify(clickRes));
  if (!clickRes.clicked) { log("ERROR: claim control not found"); close(); process.exit(1); }

  await sleep(7000);
  let after = null;
  try { after = JSON.parse(await evalIn(send, fsid, FRAME_PROBE)); } catch (_) {}
  const afterText = after ? after.text.replace(/\s+/g, " ") : "";
  log("after: " + afterText.slice(0, 320));

  const st2 = await getStatus(send, rsid);
  const claimableNow = st2.ok ? st2.status.hasClaimableCampaign : null;
  log(`post-status: claimable=${claimableNow}`);

  const ok = claimableNow === false || /claimed/i.test(afterText);
  log(ok ? "RESULT: claim succeeded" : "RESULT: claim NOT confirmed - verify in Qoder");
  close();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { log("FATAL: " + (e && e.stack ? e.stack : e)); process.exit(1); });
