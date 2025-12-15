// scripts/generate-data-access.js
// Usage: node scripts/generate-data-access.js matches

const fs = require("fs");
const path = require("path");

const moduleName = process.argv[2];

if (!moduleName) {
  console.error("❌ Missing module name. Example:");
  console.error("   node scripts/generate-data-access.js matches");
  process.exit(1);
}

const basePath = `src/app/data-access/${moduleName}`;

const files = {
  store: `${moduleName}.store.ts`,
  api: `${moduleName}.api.ts`,
  socket: `${moduleName}.socket.ts`,
  models: `${moduleName}.models.ts`,
  index: `${moduleName}.index.ts`,
};

const content = {
  store: `// ${moduleName}.store.ts\n// Signals Store\nimport { signal } from '@angular/core';\n\nexport const ${moduleName}Store = {\n  data: signal([]),\n};\n`,
  api: `// ${moduleName}.api.ts\n// REST API\nexport class ${capitalize(moduleName)}Api {\n  // fetch(), getById(), update(), ...\n}\n`,
  socket: `// ${moduleName}.socket.ts\n// WebSocket logic\nexport class ${capitalize(moduleName)}Socket {\n  // connect(), listen(), ...\n}\n`,
  models: `// ${moduleName}.models.ts\n// Types & Interfaces\nexport interface ${capitalize(moduleName)} {}\n`,
  index: `// ${moduleName}.index.ts\nexport * from './${moduleName}.store';\nexport * from './${moduleName}.api';\nexport * from './${moduleName}.socket';\nexport * from './${moduleName}.models';\n`,
};

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Create folder
fs.mkdirSync(basePath, { recursive: true });

// Create files
Object.entries(files).forEach(([key, filename]) => {
  const filePath = path.join(basePath, filename);
  fs.writeFileSync(filePath, content[key], "utf8");
  console.log(`📄 Created: ${filePath}`);
});

console.log(`\n✨ Module "${moduleName}" generated successfully!`);
