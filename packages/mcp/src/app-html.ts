/**
 * The in-session MCP App (SEP-1865). A single self-contained HTML document the
 * host renders in a sandboxed iframe. It speaks the MCP Apps postMessage/JSON-RPC
 * bridge back to the host: `ui/initialize` handshake, then `tools/call` against
 * THIS server's own tools (`get_project`, `get_diagnostics`,
 * `plan_upgrade_dependencies`, `apply_change`) so the user can browse and apply
 * config changes themselves — every write still previewed as a diff and confirmed.
 *
 * Constraints: no external assets (strict iframe sandbox), no build step (tsc
 * only). The embedded script deliberately avoids template literals so this outer
 * template literal needs no escaping.
 */
export const APP_RESOURCE_URI = 'ui://visual-config/app';
export const APP_MIME = 'text/html;profile=mcp-app';

export const APP_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>visual-config</title>
<style>
  :root {
    --bg: #ffffff; --fg: #1a1a1a; --muted: #6b7280; --line: #e5e7eb;
    --accent: #2563eb; --accent-fg: #ffffff; --card: #f9fafb;
    --warn: #b45309; --danger: #b91c1c; --ok: #047857;
    --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    --sans: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  }
  [data-theme="dark"] {
    --bg: #0b0d12; --fg: #e6e8ec; --muted: #9aa4b2; --line: #232833;
    --accent: #3b82f6; --accent-fg: #ffffff; --card: #12151c;
    --warn: #d99a2b; --danger: #f26d6d; --ok: #34d399;
  }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: var(--sans); background: var(--bg); color: var(--fg); font-size: 14px; }
  .wrap { padding: 16px; max-width: 720px; margin: 0 auto; }
  h1 { font-size: 16px; margin: 0 0 2px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 20px 0 8px; }
  .sub { color: var(--muted); margin: 0 0 4px; }
  .row { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--card); margin-bottom: 6px; }
  .row .name { font-family: var(--mono); font-weight: 600; }
  .row .range { font-family: var(--mono); color: var(--muted); }
  .row .spacer { flex: 1; }
  .tag { font-size: 11px; padding: 1px 6px; border-radius: 999px; border: 1px solid var(--line); color: var(--muted); }
  .tag.out { color: var(--warn); border-color: var(--warn); }
  button { font: inherit; cursor: pointer; border: 1px solid var(--accent); background: var(--accent); color: var(--accent-fg); border-radius: 7px; padding: 4px 10px; }
  button.ghost { background: transparent; color: var(--fg); border-color: var(--line); }
  button:disabled { opacity: .5; cursor: default; }
  pre { font-family: var(--mono); font-size: 12px; background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 10px; overflow-x: auto; white-space: pre; }
  .diffline.add { color: var(--ok); }
  .diffline.del { color: var(--danger); }
  .sheet { margin-top: 10px; border: 1px solid var(--accent); border-radius: 10px; padding: 12px; }
  .sheet .actions { display: flex; gap: 8px; margin-top: 10px; }
  .err { color: var(--danger); }
  .empty { color: var(--muted); font-style: italic; }
  .muted { color: var(--muted); }
  code { font-family: var(--mono); }
</style>
</head>
<body>
<div class="wrap" id="app"><p class="sub">Connecting…</p></div>
<script>
(function () {
  "use strict";
  var parentWin = window.parent;
  var nextId = 1;
  var pending = {};

  function post(msg) { parentWin.postMessage(msg, "*"); }
  function rpc(method, params) {
    var id = nextId++;
    return new Promise(function (resolve, reject) {
      pending[id] = { resolve: resolve, reject: reject };
      post({ jsonrpc: "2.0", id: id, method: method, params: params || {} });
    });
  }
  function notify(method, params) { post({ jsonrpc: "2.0", method: method, params: params || {} }); }

  window.addEventListener("message", function (event) {
    var msg = event.data;
    if (!msg || msg.jsonrpc !== "2.0") return;
    if (msg.id != null && pending[msg.id]) {
      var p = pending[msg.id];
      delete pending[msg.id];
      if (msg.error) p.reject(new Error(msg.error.message || "RPC error"));
      else p.resolve(msg.result);
      return;
    }
    if (msg.method === "ui/notifications/tool-result") { /* host-initiated; refresh */ load(); }
  });

  // Parse our server's CallToolResult (content[].text is JSON) into an object.
  function parseResult(res) {
    if (!res) return null;
    if (res.isError) {
      var em = res.content && res.content[0] && res.content[0].text ? res.content[0].text : "tool error";
      throw new Error(em);
    }
    if (res.structuredContent) return res.structuredContent;
    var textPart = (res.content || []).filter(function (c) { return c.type === "text"; })[0];
    if (!textPart) return null;
    try { return JSON.parse(textPart.text); } catch (e) { return textPart.text; }
  }
  function callTool(name, args) {
    return rpc("tools/call", { name: name, arguments: args || {} }).then(parseResult);
  }

  var el = document.getElementById("app");
  function h(tag, attrs, kids) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "class") node.className = attrs[k];
      else if (k === "text") node.textContent = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  var project = null;
  var outdated = {}; // name -> { current, latest, diff }

  function reportSize() {
    try { notify("ui/notifications/size-changed", { width: document.body.scrollWidth, height: document.body.scrollHeight }); } catch (e) {}
  }

  function render() {
    el.innerHTML = "";
    if (!project) { el.appendChild(h("p", { class: "sub", text: "Loading project…" })); return; }

    el.appendChild(h("h1", { text: project.name || "(unnamed project)" }));
    var meta = [project.version ? "v" + project.version : null, project.packageManager].filter(Boolean).join("  ·  ");
    el.appendChild(h("p", { class: "sub", text: meta }));
    if (project.description) el.appendChild(h("p", { class: "muted", text: project.description }));

    // Dependencies
    el.appendChild(h("h2", { text: "Dependencies" }));
    var deps = (project.dependencies || []).filter(function (d) { return d.type === "prod" || d.type === "dev"; });
    if (!deps.length) el.appendChild(h("p", { class: "empty", text: "No dependencies." }));
    deps.forEach(function (d) {
      var row = h("div", { class: "row" });
      row.appendChild(h("span", { class: "name", text: d.name }));
      row.appendChild(h("span", { class: "range", text: d.range }));
      if (d.type === "dev") row.appendChild(h("span", { class: "tag", text: "dev" }));
      row.appendChild(h("span", { class: "spacer" }));
      var info = outdated[d.name];
      if (info) {
        row.appendChild(h("span", { class: "tag out", text: info.current + " → " + info.latest }));
        var btn = h("button", { text: "Upgrade" });
        btn.addEventListener("click", function () { startUpgrade(d.name, info.latest); });
        row.appendChild(btn);
      } else {
        row.appendChild(h("span", { class: "tag", text: "up to date" }));
      }
      el.appendChild(row);
    });

    // Scripts (read-only)
    el.appendChild(h("h2", { text: "Scripts" }));
    var scripts = project.scripts || [];
    if (!scripts.length) el.appendChild(h("p", { class: "empty", text: "No scripts." }));
    scripts.forEach(function (s) {
      var row = h("div", { class: "row" });
      row.appendChild(h("span", { class: "name", text: s.name }));
      row.appendChild(h("span", { class: "range", text: s.command }));
      el.appendChild(row);
    });

    reportSize();
  }

  function renderDiff(container, diffText) {
    var pre = h("pre");
    (diffText || "").split("\\n").forEach(function (line) {
      var cls = "diffline";
      if (line[0] === "+" && line.slice(0, 3) !== "+++") cls += " add";
      else if (line[0] === "-" && line.slice(0, 3) !== "---") cls += " del";
      pre.appendChild(h("span", { class: cls, text: line + "\\n" }));
    });
    container.appendChild(pre);
  }

  function startUpgrade(name, latest) {
    var range = "^" + latest;
    callTool("plan_upgrade_dependencies", { upgrades: [{ name: name, range: range }] }).then(function (change) {
      showSheet(name, latest, change);
    }).catch(showError);
  }

  function showSheet(name, latest, change) {
    render();
    var sheet = h("div", { class: "sheet" });
    sheet.appendChild(h("p", { text: "Upgrade " + name + " → " + latest + " (risk: " + (change.risk || "review") + ")" }));
    (change.edits || []).forEach(function (edit) {
      sheet.appendChild(h("p", { class: "muted", text: edit.path }));
      renderDiff(sheet, edit.diff);
    });
    if (change.commands && change.commands.length) {
      sheet.appendChild(h("p", { class: "muted", text: "Then runs: " + change.commands.map(function (c) { return c.run || (c.argv || []).join(" "); }).join("; ") }));
    }
    var actions = h("div", { class: "actions" });
    var apply = h("button", { text: "Apply" });
    apply.addEventListener("click", function () {
      apply.disabled = true; apply.textContent = "Applying…";
      callTool("apply_change", { changeId: change.id }).then(function () {
        notify("ui/message", { role: "user", content: { type: "text", text: "Applied: " + name + " → " + latest } });
        return load();
      }).catch(showError);
    });
    var cancel = h("button", { class: "ghost", text: "Cancel" });
    cancel.addEventListener("click", function () { render(); });
    actions.appendChild(apply); actions.appendChild(cancel);
    sheet.appendChild(actions);
    el.appendChild(sheet);
    reportSize();
  }

  function showError(err) {
    var p = h("p", { class: "err", text: "Error: " + (err && err.message ? err.message : String(err)) });
    el.appendChild(p);
    reportSize();
  }

  function load() {
    return callTool("get_project").then(function (proj) {
      project = proj;
      render();
      // Diagnostics are best-effort (network); never block the view on them.
      return callTool("get_diagnostics").then(function (diag) {
        outdated = {};
        ((diag && diag.items) || []).forEach(function (item) {
          if (item.kind === "outdated" && item.data) outdated[item.target] = { current: item.data.current, latest: item.data.latest, diff: item.data.diff };
        });
        render();
      }).catch(function () { /* leave deps unmarked */ });
    }).catch(showError);
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
  }

  // Handshake, then load.
  rpc("ui/initialize", {
    appInfo: { name: "visual-config", version: "0.1.0" },
    appCapabilities: { availableDisplayModes: ["inline", "fullscreen"] }
  }).then(function (result) {
    notify("ui/notifications/initialized", {});
    if (result && result.hostContext) applyTheme(result.hostContext.theme);
    return load();
  }).catch(function (err) {
    // No host bridge (e.g. opened directly) — still show a helpful message.
    el.innerHTML = "";
    el.appendChild(h("p", { class: "sub", text: "This panel runs inside an MCP host. " + (err && err.message ? err.message : "") }));
  });

  window.addEventListener("resize", reportSize);
})();
</script>
</body>
</html>
`;
