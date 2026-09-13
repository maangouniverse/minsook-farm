const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { createVisitorAnalytics, koreanDate } = require('../internal/visitor-analytics.cjs');

(async () => {
  const db = new sqlite3.Database(':memory:');
  let clock = new Date('2026-09-12T15:00:00.000Z'); // 2026-09-13 00:00 KST
  const analytics = createVisitorAnalytics(db, { now: () => clock });

  assert.equal(koreanDate(new Date('2026-09-12T14:59:59.000Z')), '2026-09-12');
  assert.equal(koreanDate(clock), '2026-09-13');

  assert.deepEqual(await analytics.record('visitor_aaaaaaaaaaaaaaaaaaaa'), { counted: true, date: '2026-09-13' });
  assert.deepEqual(await analytics.record('visitor_aaaaaaaaaaaaaaaaaaaa'), { counted: false, date: '2026-09-13' });
  assert.deepEqual(await analytics.record('visitor_bbbbbbbbbbbbbbbbbbbb'), { counted: true, date: '2026-09-13' });
  assert.deepEqual(await analytics.stats(), { today: 2, total: 2, date: '2026-09-13' });

  clock = new Date('2026-09-13T15:00:00.000Z');
  await analytics.record('visitor_aaaaaaaaaaaaaaaaaaaa');
  assert.deepEqual(await analytics.stats(), { today: 1, total: 2, date: '2026-09-14' });

  await assert.rejects(analytics.record('short'), { status: 400 });
  const row = await new Promise((resolve, reject) => db.get('SELECT visitor_hash FROM visitor_days LIMIT 1', (error, value) => error ? reject(error) : resolve(value)));
  assert.equal(row.visitor_hash.length, 64);
  assert.equal(row.visitor_hash.includes('visitor_'), false);

  await new Promise(resolve => db.close(resolve));
  console.log('PASS: KST daily unique visitors, all-time unique visitors, duplicate suppression, and hashed identifiers.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
