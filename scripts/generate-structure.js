// scripts/generate-structure.js
// Run: node scripts/generate-structure.js

const fs = require("fs");
const path = require("path");

const create = (p) => {
  const full = path.join(process.cwd(), p);
  if (!fs.existsSync(full)) {
    fs.mkdirSync(full, { recursive: true });
    console.log("📁 Created:", p);
  }
};

const dirs = [
  "src/app/core/config",
  "src/app/core/layout",
  "src/app/core/guards",
  "src/app/core/interceptors",
  "src/app/core/services",
  "src/app/core/animations",
  "src/app/core/sockets",
  "src/app/core/i18n",

  "src/app/shared/ui",
  "src/app/shared/utils",
  "src/app/shared/pipes",
  "src/app/shared/directives",
  "src/app/shared/models",
  "src/app/shared/validators",

  "src/app/data-access/auth",
  "src/app/data-access/matches",
  "src/app/data-access/bets",
  "src/app/data-access/wallet",
  "src/app/data-access/rewards",
  "src/app/data-access/missions",
  "src/app/data-access/shop",
  "src/app/data-access/clans",
  "src/app/data-access/leaderboard",
  "src/app/data-access/notifications",
  "src/app/data-access/settings",

  "src/app/features/auth/login",
  "src/app/features/auth/signup",
  "src/app/features/auth/onboarding",

  "src/app/features/home",

  "src/app/features/bets/upcoming",
  "src/app/features/bets/live",
  "src/app/features/bets/history",
  "src/app/features/bets/my-bets",
  "src/app/features/bets/match",

  "src/app/features/rewards/claim",
  "src/app/features/rewards/badges",
  "src/app/features/rewards/levels",
  "src/app/features/rewards/coins",

  "src/app/features/clans/list",
  "src/app/features/clans/create",
  "src/app/features/clans/clan/members",
  "src/app/features/clans/clan/chat",
  "src/app/features/clans/clan/ranking",
  "src/app/features/clans/clan/events",

  "src/app/features/leaderboard/global",
  "src/app/features/leaderboard/weekly",
  "src/app/features/leaderboard/clans",
  "src/app/features/leaderboard/friends",

  "src/app/features/shop/skins",
  "src/app/features/shop/boosters",
  "src/app/features/shop/items",
  "src/app/features/shop/cart",
  "src/app/features/shop/purchases",

  "src/app/features/profile/overview",
  "src/app/features/profile/badges",
  "src/app/features/profile/history",
  "src/app/features/profile/stats",

  "src/app/features/settings/account",
  "src/app/features/settings/notifications",
  "src/app/features/settings/security",
  "src/app/features/settings/privacy",

  "src/app/features/admin/dashboard",
  "src/app/features/admin/matches",
  "src/app/features/admin/bets",
  "src/app/features/admin/users",
  "src/app/features/admin/rewards",
  "src/app/features/admin/settings",

  "src/app/ui",
];

dirs.forEach(create);

console.log("\n✨ Structure BetVerse generated successfully!");
