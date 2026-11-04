import { xpForLevel } from './progression';
describe('XP progression', () => {
  it('keeps level thresholds increasing and uses separate agency thresholds', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(500);
    expect(xpForLevel(3)).toBe(1250);
    expect(xpForLevel(2, 600, 320)).toBe(600);
    for (let level = 2; level < 100; level++)
      expect(xpForLevel(level)).toBeGreaterThan(xpForLevel(level - 1));
  });
});
