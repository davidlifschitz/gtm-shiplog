const MAX = 400 * 1024;

const GENERIC = [
  /^bug fixes?( and performance improvements?)?$/i,
  /^performance improvements?$/i,
  /^misc(ellaneous)?( fixes?)?$/i,
  /^various fixes$/i,
  /^minor (fixes|improvements|changes)$/i,
  /^internal (changes|improvements)$/i,
  /^chore:?/i,
  /^wip$/i,
  /^update(d)? (deps|dependencies|lockfile)$/i,
];

const SKIP_PREFIX = /^(merge|revert|bump|chore\b|ci\b|test\b|build\b|style\b|docs: (typo|readme))/i;

const TYPE_MAP = {
  feat: "Added",
  feature: "Added",
  add: "Added",
  added: "Added",
  fix: "Fixed",
  bugfix: "Fixed",
  bug: "Fixed",
  fixed: "Fixed",
  perf: "Improved",
  improve: "Improved",
  improved: "Improved",
  refactor: "Changed",
  change: "Changed",
  changed: "Changed",
  breaking: "Changed",
  docs: "Docs",
  doc: "Docs",
  remove: "Removed",
  removed: "Removed",
  delete: "Removed",
  revert: "Removed",
  security: "Security",
};

const KEEP = /^(added|changed|deprecated|removed|fixed|security)$/i;

function $(id) {
  return document.getElementById(id);
}

function stripHash(line) {
  return line.replace(/^[0-9a-f]{7,40}\s+/i, "").trim();
}

function stripTicket(s) {
  return s
    .replace(/^\((?:closes|fixes|refs?)[:\s]*[#A-Z0-9/-]+\)\s*/i, "")
    .replace(/^(?:closes|fixes|refs?)[:\s]+[#A-Z0-9/-]+\s*[:\-–]?\s*/i, "")
    .replace(/^\[?#?[A-Z]{2,10}-\d+\]?\s*[:\-–]?\s*/i, "")
    .replace(/^#\d+\s*[:\-–]?\s*/, "")
    .trim();
}

function parseConventional(raw) {
  const m = raw.match(/^([a-z]+)(?:\(([a-z0-9._/-]+)\))?(!)?:\s*(.+)$/i);
  if (!m) return null;
  return { type: m[1].toLowerCase(), scope: m[2] || "", bang: Boolean(m[3]), rest: m[4].trim() };
}

const FIX_REF = /^\(?(?:fix(?:es|ed)?|close[sd]?)[:\s]+[#A-Z0-9/-]+\)?/i;

function classify(line) {
  const stripped = stripHash(line.replace(/^[-*+]\s+/, "").replace(/^#{1,6}\s+/, ""));
  const raw = stripTicket(stripped);
  if (!raw) return null;
  const brk = raw.match(/^BREAKING[ -]CHANGES?:\s*(.+)$/i);
  if (brk) return { group: "Breaking", text: sentence(brk[1]), raw };
  // "Fixes #12: crash on save" loses its verb to stripTicket; keep the signal.
  if (FIX_REF.test(stripped) && !parseConventional(raw) && !SKIP_PREFIX.test(raw)) {
    return { group: "Fixed", text: sentence(raw.replace(/^fix(es|ed)?\s*/i, "")), raw };
  }
  if (/^merge /i.test(raw) || SKIP_PREFIX.test(raw)) return { skip: true, reason: "noise", raw };
  if (GENERIC.some((re) => re.test(raw.replace(/\.$/, "")))) {
    return { skip: true, reason: "generic", raw };
  }
  const conv = parseConventional(raw);
  if (conv) {
    if (SKIP_PREFIX.test(conv.type + ":" + conv.rest) && conv.type !== "fix" && conv.type !== "feat") {
      return { skip: true, reason: "noise", raw };
    }
    if (GENERIC.some((re) => re.test(conv.rest.replace(/\.$/, "")))) {
      return { skip: true, reason: "generic", raw };
    }
    const group = conv.bang ? "Breaking" : TYPE_MAP[conv.type] || "Changed";
    const scope = conv.scope ? `${conv.scope}: ` : "";
    return { group, text: sentence(scope + conv.rest), raw };
  }
  const keep = raw.match(/^(Added|Changed|Deprecated|Removed|Fixed|Security):\s*(.+)$/i);
  if (keep) return { group: title(keep[1]), text: sentence(keep[2]), raw };
  if (/^fix(es|ed)?\b/i.test(raw)) return { group: "Fixed", text: sentence(raw.replace(/^fix(es|ed)?\s*/i, "")), raw };
  if (/^(add(ed)?|implement(ed)?|introduce(d)?)\b/i.test(raw)) {
    return { group: "Added", text: sentence(raw.replace(/^(add(ed)?|implement(ed)?|introduce(d)?)\s*/i, "")), raw };
  }
  if (/^(remove(d)?|drop(ped)?|delete(d)?)\b/i.test(raw)) {
    return { group: "Removed", text: sentence(raw.replace(/^(remove(d)?|drop(ped)?|delete(d)?)\s*/i, "")), raw };
  }
  return { group: "Changed", text: sentence(raw), raw };
}

function title(s) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function sentence(s) {
  let t = s.replace(/\s+/g, " ").replace(/\.+$/, "").trim();
  if (!t) return t;
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (!/[.!?]$/.test(t)) t += ".";
  return t;
}

function splitEntries(text) {
  const chunks = text.replace(/\r/g, "").split(/\n(?=commit [0-9a-f]{7,}|---+$)/);
  if (chunks.length > 1) {
    return chunks.map((c) => {
      const lines = c.split("\n").map((l) => l.trim()).filter(Boolean);
      const subj = lines.find((l) => !/^commit |^Author:|^Date:|^Merge:|^---+$/.test(l)) || "";
      return subj;
    });
  }
  const out = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (/^#\s+(Added|Changed|Deprecated|Removed|Fixed|Security)\b/i.test(t) && KEEP.test(t.replace(/^#\s+/, "").split(/\s/)[0])) {
      continue;
    }
    if (/^# /.test(t) && /changelog|unreleased|\[\d/i.test(t)) continue;
    if (/^[=-]{3,}$/.test(t)) continue;
    out.push(t);
  }
  return out;
}

function uniqueKey(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function buildNotes(text, version) {
  const items = [];
  const skipped = { generic: [], noise: [] };
  const seen = new Set();
  for (const line of splitEntries(text)) {
    const item = classify(line);
    if (!item) continue;
    if (item.skip) {
      skipped[item.reason].push(item.raw);
      continue;
    }
    const key = uniqueKey(item.group + item.text);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }
  const order = ["Breaking", "Added", "Changed", "Fixed", "Removed", "Security", "Docs", "Improved"];
  const groups = {};
  for (const it of items) {
    (groups[it.group] ||= []).push(it.text);
  }
  const heading = version ? `## ${version}` : "## Unreleased";
  const parts = [heading, ""];
  let any = false;
  for (const g of order) {
    if (!groups[g] || !groups[g].length) continue;
    any = true;
    parts.push(`### ${g}`, "");
    for (const b of groups[g]) parts.push(`- ${b}`);
    parts.push("");
  }
  for (const g of Object.keys(groups)) {
    if (order.includes(g)) continue;
    any = true;
    parts.push(`### ${g}`, "");
    for (const b of groups[g]) parts.push(`- ${b}`);
    parts.push("");
  }
  if (!any) parts.push("_Nothing specific enough to ship. The log was empty, merge-only, or generic filler._", "");
  if (skipped.generic.length) {
    parts.push("### Skipped as generic", "");
    for (const g of skipped.generic.slice(0, 12)) parts.push(`- ${g}`);
    parts.push("");
  }
  return {
    markdown: parts.join("\n").trim() + "\n",
    kept: items.length,
    generic: skipped.generic.length,
    noise: skipped.noise.length,
  };
}

function setError(msg) {
  const el = $("error");
  if (!msg) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = msg;
}

function run() {
  const src = $("src").value;
  setError("");
  if (!src.trim()) {
    $("status").textContent = "Waiting for a log.";
    $("out").hidden = true;
    return;
  }
  if (new Blob([src]).size > MAX) {
    setError("400 KB cap. Trim the log to the tag range.");
    return;
  }
  const res = buildNotes(src, $("ver").value.trim());
  $("out").hidden = false;
  $("out").textContent = res.markdown;
  $("status").textContent = `${res.kept} specific bullets · ${res.generic} generic skipped · ${res.noise} merge/chore skipped`;
}

async function loadFile(file) {
  if (!file) return;
  if (file.size > MAX) {
    setError("400 KB cap.");
    return;
  }
  $("src").value = await file.text();
  run();
}

$("go").addEventListener("click", run);
$("src").addEventListener("input", () => {
  if ($("src").value.trim()) $("status").textContent = "Ready. Group when the log looks complete.";
});
$("copy").addEventListener("click", async () => {
  run();
  const md = $("out").textContent;
  if (!md) return;
  await navigator.clipboard.writeText(md);
  $("status").textContent = "Copied markdown.";
});
$("pick").addEventListener("click", () => $("file").click());
$("file").addEventListener("change", (e) => loadFile(e.target.files[0]));
const drop = $("drop");
drop.addEventListener("dragover", (e) => {
  e.preventDefault();
  drop.classList.add("over");
});
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  loadFile(e.dataTransfer.files[0]);
});
