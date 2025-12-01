// scripts/create-betverse-structure.js
// Run: node scripts/create-betverse-structure.js

const fs = require("fs");
const path = require("path");

//
// ————————————————————————————————
// Helpers
// ————————————————————————————————
//

function createDir(dir) {
  const full = path.join(process.cwd(), dir);
  if (!fs.existsSync(full)) {
    fs.mkdirSync(full, { recursive: true });
    console.log("📁 Created:", dir);
  }
}

function createFile(file, content = "") {
  const full = path.join(process.cwd(), file);
  if (!fs.existsSync(full)) {
    fs.writeFileSync(full, content, "utf8");
    console.log("📄 Created:", file);
  }
}

//
// ————————————————————————————————
// CORE STRUCTURE
// ————————————————————————————————
//

const coreFolders = [
  "src/app/core/config",
  "src/app/core/layout",
  "src/app/core/guards",
  "src/app/core/interceptors",
  "src/app/core/services",
  "src/app/core/animations",
  "src/app/core/sockets",
  "src/app/core/i18n",
];

//
// ————————————————————————————————
// SHARED STRUCTURE
// ————————————————————————————————
//

const sharedFolders = [
  "src/app/shared/ui",
  "src/app/shared/utils",
  "src/app/shared/pipes",
  "src/app/shared/directives",
  "src/app/shared/models",
  "src/app/shared/validators",
];

//
// ————————————————————————————————
// DATA-ACCESS MODULES
// ————————————————————————————————
//

const dataAccessModules = [
  "auth",
  "matches",
  "bets",
  "wallet",
  "rewards",
  "missions",
  "shop",
  "clans",
  "leaderboard",
  "notifications",
  "settings",
];

function createDataAccessModule(name) {
  const base = `src/app/data-access/${name}`;
  createDir(base);

  createFile(`${base}/${name}.store.ts`, `// Signals store for ${name}`);
  createFile(`${base}/${name}.api.ts`, `// REST API for ${name}`);
  createFile(`${base}/${name}.socket.ts`, `// WebSocket for ${name}`);
  createFile(`${base}/${name}.models.ts`, `// Models for ${name}`);
  createFile(`${base}/${name}.index.ts`,
    `export * from './${name}.store';\nexport * from './${name}.api';\nexport * from './${name}.socket';\nexport * from './${name}.models';`
  );
}

//
// ————————————————————————————————
// FEATURES MODULES + ROUTES + COMPONENTS
// ————————————————————————————————
//

const features = {
  auth: ["login", "signup", "onboarding"],
  home: ["main"],
  bets: ["upcoming", "live", "history", "my-bets", "match"],
  rewards: ["claim", "badges", "levels", "coins"],
  clans: [
    "list",
    "create",
    "clan/members",
    "clan/chat",
    "clan/ranking",
    "clan/events",
  ],
  leaderboard: ["global", "weekly", "clans", "friends"],
  shop: ["skins", "boosters", "items", "cart", "purchases"],
  profile: ["overview", "badges", "history", "stats"],
  settings: ["account", "notifications", "security", "privacy"],
  admin: ["dashboard", "matches", "bets", "users", "rewards", "settings"],
};

function createFeature(name, subfolders) {
  const base = `src/app/features/${name}`;
  createDir(base);

  // routes file
  createFile(`${base}/${name}.routes.ts`, `// Routes for ${name}`);

  // generate pages/components
  subfolders.forEach((sf) => {
    const folder = `${base}/${sf}`;
    createDir(folder);

    const comp = sf.replace("/", "-"); // handles clan/members → clan-members

    createFile(`${folder}/${comp}.component.ts`,
      `import { Component } from '@angular/core';\n\n@Component({ selector: '${name}-${comp}', template: '' })\nexport class ${pascal(comp)}Component {}` 
    );

    createFile(`${folder}/${comp}.component.html`, `<!-- ${comp} -->`);
    createFile(`${folder}/${comp}.component.scss`, ``);
  });
}

function pascal(str) {
  return str
    .split(/[-/]/g)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}

//
// ————————————————————————————————
// GLOBAL UI FOLDER
// ————————————————————————————————
//

const uiFolders = ["src/app/ui", "src/app/ui/modals", "src/app/ui/drawers"];

//
// ————————————————————————————————
// EXECUTION
// ————————————————————————————————
//

// core
coreFolders.forEach(createDir);
createFile("src/app/core/core.module.ts", "// CoreModule");

// shared
sharedFolders.forEach(createDir);
createFile("src/app/shared/shared.module.ts", "// SharedModule");

// data-access
dataAccessModules.forEach(createDataAccessModule);
createFile("src/app/data-access/data-access.module.ts", "// DataAccessModule");

// features
Object.entries(features).forEach(([name, subs]) => {
  createFeature(name, subs);
});

// ui
uiFolders.forEach(createDir);

console.log("\n✨ BetVerse full structure generated successfully!");
