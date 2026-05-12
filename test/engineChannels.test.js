const request = require('supertest');
const { createTestApp, cleanupTestApp } = require('./helpers');

let app, db, dataDir;

beforeEach(() => {
  ({ app, db, dataDir } = createTestApp());
});

afterEach(() => cleanupTestApp({ db, dataDir }));

describe('GET /engine-channels', () => {
  test('returns the seeded channels', async () => {
    const res = await request(app).get('/v1/engine-channels');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    const channels = res.body.map(r => r.channel);
    expect(channels).toContain('nightly');
    expect(channels).toContain('stable');
  });

  test('each row has channel, docker_tag, version, updated_at', async () => {
    const res = await request(app).get('/v1/engine-channels');
    const nightly = res.body.find(r => r.channel === 'nightly');
    expect(nightly).toMatchObject({
      channel: 'nightly',
      docker_tag: 'edge',
      version: 'edge',
    });
    expect(nightly.updated_at).toBeTruthy();
  });
});

describe('GET /engine-channels/:channel', () => {
  test('returns a single channel row', async () => {
    const res = await request(app).get('/v1/engine-channels/nightly');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      channel: 'nightly',
      docker_tag: 'edge',
      version: 'edge',
    });
  });

  test('returns 404 for unknown channel', async () => {
    const res = await request(app).get('/v1/engine-channels/unknown');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});
