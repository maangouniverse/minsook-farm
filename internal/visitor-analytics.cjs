const { createHash } = require('node:crypto');

const VISITOR_ID_PATTERN = /^[a-zA-Z0-9_-]{20,100}$/;

function koreanDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(value);
  const part = type => parts.find(item => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function sql(db) {
  return {
    run(query, params = []) {
      return new Promise((resolve, reject) => {
        db.run(query, params, function(error) {
          if (error) reject(error);
          else resolve({ changes: this.changes || 0 });
        });
      });
    },
    get(query, params = []) {
      return new Promise((resolve, reject) => {
        db.get(query, params, (error, row) => error ? reject(error) : resolve(row));
      });
    }
  };
}

function createVisitorAnalytics(db, { now = () => new Date() } = {}) {
  const connection = sql(db);
  let schemaReady;

  function ensureSchema() {
    if (!schemaReady) {
      schemaReady = (async () => {
        await connection.run(`CREATE TABLE IF NOT EXISTS visitor_days (
          visitor_hash TEXT NOT NULL,
          visit_date TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (visitor_hash, visit_date)
        )`);
        await connection.run('CREATE INDEX IF NOT EXISTS idx_visitor_days_date ON visitor_days(visit_date)');
      })().catch(error => {
        schemaReady = null;
        throw error;
      });
    }
    return schemaReady;
  }

  async function record(visitorId) {
    const normalized = typeof visitorId === 'string' ? visitorId.trim() : '';
    if (!VISITOR_ID_PATTERN.test(normalized)) {
      const error = new Error('방문자 식별값 형식이 올바르지 않습니다.');
      error.status = 400;
      throw error;
    }

    await ensureSchema();
    const visitDate = koreanDate(now());
    const visitorHash = createHash('sha256').update(normalized).digest('hex');
    const result = await connection.run(
      'INSERT INTO visitor_days (visitor_hash, visit_date) VALUES (?, ?) ON CONFLICT (visitor_hash, visit_date) DO NOTHING',
      [visitorHash, visitDate]
    );
    return { counted: result.changes > 0, date: visitDate };
  }

  async function stats() {
    await ensureSchema();
    const date = koreanDate(now());
    const row = await connection.get(`
      SELECT
        COUNT(DISTINCT visitor_hash) AS total,
        COUNT(DISTINCT CASE WHEN visit_date = ? THEN visitor_hash END) AS today
      FROM visitor_days
    `, [date]);
    return { today: Number(row?.today || 0), total: Number(row?.total || 0), date };
  }

  return { ensureSchema, record, stats };
}

module.exports = { createVisitorAnalytics, koreanDate, VISITOR_ID_PATTERN };
