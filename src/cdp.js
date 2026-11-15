// cdp.js - shared CDP helper for Qoder automation
const http = require("http");
const PORT = Number(process.env.QODER_CDP_PORT || 9222);

function httpGet(path) {
  return new Promise((res, rej) => {
    const req = http.get({ host: "127.0.0.1", port: PORT, path, timeout: 5000 }, (r) => {
      let d = "";
      r.on("data", (c) => (d += c));
      r.on("end", () => {
        try { res(JSON.parse(d)); } catch (e) { rej(new Error("bad json from " + path)); }
      });
    });
    req.on("error", rej);
    req.on("timeout", () => req.destroy(new Error("timeout " + path)));
  });
}

async function connect() {
  const ver = await httpGet("/json/version");
  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error("ws connect failed")); });
  const send = (method, params = {}, sessionId) =>
    new Promise((r) => {
      const i = ++id;
      pending.set(i, r);
      ws.send(JSON.stringify({ id: i, method, params, sessionId }));
    });
  return { ws, send, close: () => ws.close() };
}

async function targets(send) {
  const t = await send("Target.getTargets", {});
  return (t.result && t.result.targetInfos) || [];
}

async function attach(send, targetId) {
  const a = await send("Target.attachToTarget", { targetId, flatten: true });
  if (!a.result) throw new Error("attach failed: " + JSON.stringify(a.error));
  return a.result.sessionId;
}

async function evalIn(send, sessionId, expression) {
  const r = await send("Runtime.evaluate", {
    expression, returnByValue: true, awaitPromise: true, userGesture: true,
  }, sessionId);
  if (!r.result) throw new Error("eval failed: " + JSON.stringify(r.error));
  if (r.result.exceptionDetails) {
    const d = r.result.exceptionDetails;
    throw new Error("eval exception: " + (d.exception && d.exception.description ? d.exception.description : d.text));
  }
  return r.result.result ? r.result.result.value : undefined;
}

async function findRenderer(send) {
  const list = await targets(send);
  const t = list.find((x) => x.type === "page" && (x.url || "").includes("renderer"));
  if (!t) throw new Error("Qoder renderer page not found (is Qoder running with --remote-debugging-port?)");
  return t;
}

async function findCampaignFrame(send) {
  const list = await targets(send);
  return list.find((x) => x.type === "iframe" && (x.url || "").includes("growth-page")) || null;
}

module.exports = { connect, targets, attach, evalIn, findRenderer, findCampaignFrame, PORT };
