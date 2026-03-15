const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
        .prepare('SELECT uuid, records_json, updated_at FROM user_records WHERE uuid = ?1')
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
    };
}

async function createEmptyRecord(db, uuid) {
    const now = new Date().toISOString();
    await db
        .prepare('INSERT INTO user_records (uuid, records_json, updated_at) VALUES (?1, ?2, ?3)')
        .bind(uuid, '[]', now)
        .run();
}

export default {
    async fetch(request, env) {
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
                    return json({ uuid: found.uuid, records: found.records, created: false }, 200, corsOrigin);
                }
                await createEmptyRecord(env.DB, requestedUuid);
                return json({ uuid: requestedUuid, records: [], created: true }, 200, corsOrigin);
            }

            const uuid = crypto.randomUUID();
            await createEmptyRecord(env.DB, uuid);
            return json({ uuid, records: [], created: true }, 200, corsOrigin);
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

            const now = new Date().toISOString();
            await env.DB
                .prepare(`
                    INSERT INTO user_records (uuid, records_json, updated_at)
                    VALUES (?1, ?2, ?3)
                    ON CONFLICT(uuid)
                    DO UPDATE SET
                        records_json = excluded.records_json,
                        updated_at = excluded.updated_at
                `)
                .bind(uuid, JSON.stringify(body.records), now)
                .run();

            return json({ ok: true, updatedAt: now }, 200, corsOrigin);
        }

        return json({ error: 'method not allowed' }, 405, corsOrigin);
    },
};
