import { query } from '../db/pool.js';

/** Best-effort activity log. Never throws into the request path. */
export async function audit(userId, action, entity, entityId = null, meta = null) {
  try {
    await query(
      `INSERT INTO audit_log (userId, action, entity, entityId, meta)
       VALUES (:userId, :action, :entity, :entityId, :meta)`,
      {
        userId: userId ?? null,
        action,
        entity,
        entityId: entityId != null ? String(entityId) : null,
        meta: meta ? JSON.stringify(meta) : null,
      }
    );
  } catch {
    /* logging must not break the request */
  }
}
