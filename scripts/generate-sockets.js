// scripts/generate-sockets.js
// Run: node scripts/generate-sockets.js

const fs = require("fs");
const path = require("path");

function createDir(dir) {
  const full = path.join(process.cwd(), dir);
  if (!fs.existsSync(full)) {
    fs.mkdirSync(full, { recursive: true });
    console.log("📁 Created directory:", dir);
  }
}

function createFile(filePath, content = "") {
  const full = path.join(process.cwd(), filePath);
  if (!fs.existsSync(full)) {
    fs.writeFileSync(full, content, "utf8");
    console.log("📄 Created file:", filePath);
  }
}

// 1️⃣ GLOBAL SOCKET SERVICE
createDir("src/app/core/sockets");

createFile(
  "src/app/core/sockets/socket.service.ts",
  `import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket: WebSocket | null = null;

  connect(url: string) {
    this.socket = new WebSocket(url);
    this.socket.onopen = () => console.log('[WS] Connected to', url);
    this.socket.onclose = () => console.log('[WS] Disconnected');
  }

  send(message: any) {
    this.socket?.send(JSON.stringify(message));
  }

  onMessage(callback: (msg: any) => void) {
    if (!this.socket) return;
    this.socket.onmessage = (e) => callback(JSON.parse(e.data));
  }
}
`
);

// 2️⃣ DOMAIN SOCKETS (AUTO-DETECTION)
const dataAccessPath = "src/app/data-access/";

const domains = fs
  .readdirSync(dataAccessPath)
  .filter((d) =>
    fs.lstatSync(path.join(dataAccessPath, d)).isDirectory()
  );

console.log("\n🔍 Detected domains:", domains.join(", "), "\n");

domains.forEach((domain) => {
  const file = `src/app/data-access/${domain}/${domain}.socket.ts`;

  const className = capitalize(domain) + "Socket";

  createFile(
    file,
    `import { Injectable } from '@angular/core';
import { SocketService } from '../../core/sockets/socket.service';

@Injectable({ providedIn: 'root' })
export class ${className} {
  constructor(private socket: SocketService) {}

  connect() {
    this.socket.connect('ws://localhost:3000/${domain}');
  }

  listen(callback: (msg: any) => void) {
    this.socket.onMessage(callback);
  }

  send(data: any) {
    this.socket.send({ domain: '${domain}', data });
  }
}
`
  );
});

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

console.log("\n✨ WebSockets generated for ALL domains successfully!\n");
