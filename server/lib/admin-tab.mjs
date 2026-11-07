import { digest } from './security.mjs';

export function adminTabProof(req) {
  const proof = req.get('X-Admin-Tab');
  return typeof proof === 'string' && /^[a-f0-9]{64}$/.test(proof) ? proof : null;
}

export function hasAdminTabGrant(db, req) {
  const proof = adminTabProof(req);
  return Boolean(
    proof &&
    db
      .prepare('SELECT 1 FROM admin_tab_grants WHERE tokenHash=? AND proofHash=?')
      .get(req.session.tokenHash, digest(proof)),
  );
}
