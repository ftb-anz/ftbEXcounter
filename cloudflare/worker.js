const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let schemaReadyPromise = null;

function json(data, status = 200, corsOrigin = '*') {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': corsOrigin,
            'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Vary': 'Origin',
        },
    });
}

function getCorsOrigin(request, allowedOrigins) {
    const origin = request.headers.get('Origin') || '';
    if (!origin) return '';

    const allowList = (allowedOrigins || '')
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);

    if (allowList.includes(origin)) return origin;
    return '';
}

async function getRecordsByUuid(db, uuid) {
    const row = await db
        .prepare('SELECT uuid, records_json, updated_at, revision FROM user_records WHERE uuid = ?1')
        .bind(uuid)
        .first();

    if (!row) return null;

    let records = [];
    try {
        const parsed = JSON.parse(row.records_json);
        if (Array.isArray(parsed)) records = parsed;
    } catch {
        records = [];
    }

    return {
        uuid: row.uuid,
        records,
        updatedAt: row.updated_at,
        revision: Number.isFinite(row.revision) ? row.revision : 0,
    };
}

async function createEmptyRecord(db, uuid) {
    const now = new Date().toISOString();
    await db
        .prepare('INSERT INTO user_records (uuid, records_json, updated_at, revision) VALUES (?1, ?2, ?3, ?4)')
        .bind(uuid, '[]', now, 0)
        .run();
}

async function ensureSchema(db) {
    if (!schemaReadyPromise) {
        schemaReadyPromise = db
            .prepare(`
                CREATE TABLE IF NOT EXISTS user_records (
                    uuid TEXT PRIMARY KEY,
                    records_json TEXT NOT NULL DEFAULT '[]',
                    updated_at TEXT NOT NULL,
                    revision INTEGER NOT NULL DEFAULT 0
                )
            `)
            .run()
            .then(() =>
                db.prepare('ALTER TABLE user_records ADD COLUMN revision INTEGER NOT NULL DEFAULT 0').run()
                    .catch(() => {})
            )
            .catch((e) => {
                schemaReadyPromise = null;
                throw e;
            });
    }
    await schemaReadyPromise;
}

export default {
    async fetch(request, env) {
        if (!env.DB) {
            return json({ error: 'database binding is not configured' }, 500, 'null');
        }

        await ensureSchema(env.DB);

        const url = new URL(request.url);
        const corsOrigin = getCorsOrigin(request, env.ALLOWED_ORIGINS);
        const requestOrigin = request.headers.get('Origin') || '';

        if (requestOrigin && !corsOrigin) {
            return json({ error: 'forbidden origin' }, 403, 'null');
        }

        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: {
                    'Access-Control-Allow-Origin': corsOrigin,
                    'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Vary': 'Origin',
                },
            });
        }

        if (!url.pathname.startsWith('/api/')) {
            return json({ error: 'not found' }, 404, corsOrigin);
        }

        if (url.pathname === '/api/session' && request.method === 'GET') {
            const requestedUuid = (url.searchParams.get('uuid') || '').trim();
            if (requestedUuid && !UUID_RE.test(requestedUuid)) {
                return json({ error: 'invalid uuid' }, 400, corsOrigin);
            }

            if (requestedUuid) {
                const found = await getRecordsByUuid(env.DB, requestedUuid);
                if (found) {
                    return json({ uuid: found.uuid, records: found.records, revision: found.revision, created: false }, 200, corsOrigin);
                }
                await createEmptyRecord(env.DB, requestedUuid);
                return json({ uuid: requestedUuid, records: [], revision: 0, created: true }, 200, corsOrigin);
            }

            const uuid = crypto.randomUUID();
            await createEmptyRecord(env.DB, uuid);
            return json({ uuid, records: [], revision: 0, created: true }, 200, corsOrigin);
        }

        const match = url.pathname.match(/^\/api\/records\/([0-9a-fA-F-]+)$/);
        if (!match) {
            return json({ error: 'not found' }, 404, corsOrigin);
        }

        const uuid = match[1];
        if (!UUID_RE.test(uuid)) {
            return json({ error: 'invalid uuid' }, 400, corsOrigin);
        }

        if (request.method === 'GET') {
            const found = await getRecordsByUuid(env.DB, uuid);
            if (!found) {
                return json({ error: 'not found' }, 404, corsOrigin);
            }
            return json(found, 200, corsOrigin);
        }

        if (request.method === 'PUT') {
            let body;
            try {
                body = await request.json();
            } catch {
                return json({ error: 'invalid json body' }, 400, corsOrigin);
            }

            if (!Array.isArray(body?.records)) {
                return json({ error: 'records must be an array' }, 400, corsOrigin);
            }

            const clientRevision = Number.isFinite(body?.clientRevision) ? body.clientRevision : null;
            const force = body?.force === true;

            const current = await getRecordsByUuid(env.DB, uuid);
            if (current && !force && clientRevision !== null && clientRevision !== current.revision) {
                return json({
                    error: 'revision conflict',
                    serverData: current,
                }, 409, corsOrigin);
            }

            const now = new Date().toISOString();
            const nextRevision = current ? (current.revision + 1) : 1;

            if (current) {
                await env.DB
                    .prepare('UPDATE user_records SET records_json = ?1, updated_at = ?2, revision = ?3 WHERE uuid = ?4')
                    .bind(JSON.stringify(body.records), now, nextRevision, uuid)
                    .run();
            } else {
                await env.DB
                    .prepare('INSERT INTO user_records (uuid, records_json, updated_at, revision) VALUES (?1, ?2, ?3, ?4)')
                    .bind(uuid, JSON.stringify(body.records), now, nextRevision)
                    .run();
            }

            return json({ ok: true, updatedAt: now, revision: nextRevision }, 200, corsOrigin);
        }

        return json({ error: 'method not allowed' }, 405, corsOrigin);
    },
};
