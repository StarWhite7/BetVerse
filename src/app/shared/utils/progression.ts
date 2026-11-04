export function xpForLevel(level: number, base = 500, growth = 250): number {
  const steps = Math.max(1, Math.floor(level)) - 1;
  return Math.floor(steps * base + (steps * (steps - 1) * growth) / 2);
}
