#!/usr/bin/env node
/**
 * featureTracker.js
 * VS Code-friendly CLI to manage bot_features.json
 *
 * Commands:
 *   node featureTracker.js list [--filter todo|in_progress|done] [--category "Name"]
 *   node featureTracker.js progress
 *   node featureTracker.js set <categoryIndex> <featureIndex> <todo|in_progress|done>
 *   node featureTracker.js set-by-text "<substring>" <todo|in_progress|done>
 *   node featureTracker.js help
 *
 * Notes:
 * - First run: creates a backup bot_features.backup.json
 * - Normalizes feature items to { title, status } if they are strings
 */

const fs = require("fs");
const path = require("path");

const FILE = path.resolve(process.cwd(), "bot_features.json");
const BACKUP = path.resolve(process.cwd(), "bot_features.backup.json");
const VALID = new Set(["todo", "in_progress", "done"]);

function loadJson() {
  if (!fs.existsSync(FILE)) {
    console.error(`❌ Could not find ${FILE}. Make sure bot_features.json is in your project root.`);
    process.exit(1);
  }
  const raw = fs.readFileSync(FILE, "utf8");
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error("❌ bot_features.json is not valid JSON:", e.message);
    process.exit(1);
  }
  return data;
}

function backupOnce() {
  try {
    // timestamped backup for audit/history
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const stamped = path.resolve(process.cwd(), `bot_features.backup.${ts}.json`);
    fs.copyFileSync(FILE, stamped);
    console.log(`🧷 Timestamped backup created: ${path.basename(stamped)}`);
  } catch (e) {
    // non-fatal: continue
    console.error(`⚠️ Could not create timestamped backup: ${e.message}`);
  }

  // preserve the one-off canonical backup for quick restores (created only once)
  if (!fs.existsSync(BACKUP)) {
    try {
      fs.copyFileSync(FILE, BACKUP);
      console.log(`🧷 Backup created: ${path.basename(BACKUP)}`);
    } catch (e) {
      console.error(`⚠️ Could not create primary backup: ${e.message}`);
    }
  }
}

function normalize(data) {
  let changed = false;
  if (!Array.isArray(data.categories)) {
    console.error("❌ bot_features.json missing 'categories' array.");
    process.exit(1);
  }

  data.categories = data.categories.map(cat => {
    const name = cat.name || "Unnamed Category";
    let feats = cat.features || [];
    feats = feats.map(f => {
      if (typeof f === "string") {
        changed = true;
        return { title: f, status: "todo" };
      }
      // Ensure keys exist & status valid
      let status = f.status || "todo";
      if (!VALID.has(status)) {
        status = "todo";
        changed = true;
      }
      return { title: f.title || "Untitled Feature", status };
    });
    return { name, features: feats };
  });

  if (changed) {
    backupOnce();
    saveJson(data);
    console.log("✨ Normalized bot_features.json (string features -> objects with status).");
  }
  return data;
}

function saveJson(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function listCmd(data, args) {
  const filter = getFlag(args, "--filter");
  const catName = getFlag(args, "--category");
  if (filter && !VALID.has(filter)) {
    console.error(`❌ Invalid --filter. Use one of: ${[...VALID].join(", ")}`);
    process.exit(1);
  }

  const cats = data.categories.filter(c => !catName || c.name.toLowerCase() === catName.toLowerCase());
  if (cats.length === 0) {
    console.log("No categories match that filter.");
    return;
  }

  cats.forEach((c, ci) => {
    console.log(`\n# [${ci}] ${c.name}`);
    c.features.forEach((f, fi) => {
      if (filter && f.status !== filter) return;
      const icon = f.status === "done" ? "✅" : f.status === "in_progress" ? "🟨" : "⬜";
      console.log(`  - (${ci}:${fi}) ${icon} ${f.title}  [${f.status}]`);
    });
  });
  console.log();
}

function progressCmd(data) {
  let total = 0, done = 0, inprog = 0, todo = 0;
  data.categories.forEach(c => {
    c.features.forEach(f => {
      total++;
      if (f.status === "done") done++;
      else if (f.status === "in_progress") inprog++;
      else todo++;
    });
  });
  const pct = total ? Math.round((done / total) * 100) : 0;
  console.log(`\n📊 Progress: ${done}/${total} done (${pct}%)`);
  console.log(`   🟩 done: ${done}    🟨 in_progress: ${inprog}    ⬜ todo: ${todo}\n`);
}

function setCmd(data, args) {
  if (args.length < 4) {
    console.error("Usage: node featureTracker.js set <categoryIndex> <featureIndex> <todo|in_progress|done>");
    process.exit(1);
  }
  const ci = Number(args[1]);
  const fi = Number(args[2]);
  const status = args[3];

  if (!Number.isInteger(ci) || !Number.isInteger(fi)) {
    console.error("❌ categoryIndex and featureIndex must be integers.");
    process.exit(1);
  }
  if (!VALID.has(status)) {
    console.error(`❌ Invalid status. Use one of: ${[...VALID].join(", ")}`);
    process.exit(1);
  }
  const cat = data.categories[ci];
  if (!cat) {
    console.error(`❌ No category at index ${ci}.`);
    process.exit(1);
  }
  const feat = cat.features[fi];
  if (!feat) {
    console.error(`❌ No feature at index ${fi} in category ${ci}.`);
    process.exit(1);
  }

  backupOnce();
  feat.status = status;
  saveJson(data);
  console.log(`✅ Set [${ci}:${fi}] "${feat.title}" -> ${status}`);
}

function setByTextCmd(data, args) {
  if (args.length < 3) {
    console.error('Usage: node featureTracker.js set-by-text "<substring>" <todo|in_progress|done>');
    process.exit(1);
  }
  const substr = args[1].toLowerCase();
  const status = args[2];
  if (!VALID.has(status)) {
    console.error(`❌ Invalid status. Use one of: ${[...VALID].join(", ")}`);
    process.exit(1);
  }

  let matches = [];
  data.categories.forEach((c, ci) => {
    c.features.forEach((f, fi) => {
      if (f.title.toLowerCase().includes(substr)) {
        matches.push({ ci, fi, title: f.title });
      }
    });
  });

  if (matches.length === 0) {
    console.log("No matching features found.");
    return;
  }

  backupOnce();
  matches.forEach(m => {
    data.categories[m.ci].features[m.fi].status = status;
    console.log(`✅ Set [${m.ci}:${m.fi}] "${m.title}" -> ${status}`);
  });
  saveJson(data);
}

function getFlag(args, flag) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return null;
}

function help() {
  console.log(`
Usage:
  node featureTracker.js list [--filter todo|in_progress|done] [--category "Name"]
  node featureTracker.js progress
  node featureTracker.js set <categoryIndex> <featureIndex> <todo|in_progress|done>
  node featureTracker.js set-by-text "<substring>" <todo|in_progress|done>
  node featureTracker.js help

Examples:
  node featureTracker.js list
  node featureTracker.js list --filter in_progress
  node featureTracker.js list --category "Safety & Security"
  node featureTracker.js set 2 4 done
  node featureTracker.js set-by-text "staking" in_progress
  node featureTracker.js progress
`);
}

// --------- main ---------
(async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] || "help";
  let data = loadJson();
  data = normalize(data);

  switch (cmd) {
    case "list":     return listCmd(data, args);
    case "progress": return progressCmd(data);
    case "set":      return setCmd(data, args);
    case "set-by-text": return setByTextCmd(data, args);
    case "help":
    default:         return help();
  }
})();
