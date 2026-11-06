export class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export function ensure(condition, status, message) {
  if (!condition) throw new AppError(status, message);
}
const depths = new WeakMap();
export function transaction(db, action) {
  const depth = depths.get(db) || 0;
  const savepoint = `betverse_${depth}`;
  db.exec(depth ? `SAVEPOINT ${savepoint}` : 'BEGIN IMMEDIATE');
  depths.set(db, depth + 1);
  try {
    const result = action();
    if (result && typeof result.then === 'function')
      throw new Error('Une transaction doit être synchrone.');
    db.exec(depth ? `RELEASE ${savepoint}` : 'COMMIT');
    return result;
  } catch (error) {
    db.exec(depth ? `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}` : 'ROLLBACK');
    throw error;
  } finally {
    depths.set(db, depth);
  }
}
