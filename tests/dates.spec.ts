import { test, expect } from '@playwright/test';
const api = process.env.API_BASE_URL || 'http://localhost:8080/api';
test('task date validation, inclusive ranges, partial edits, persistence and clearing', async ({ playwright }) => {
  const client = await playwright.request.newContext();
  await client.post(`${api}/auth/register`, { data: { name: 'Date QA', email: `dates-${Date.now()}-${Math.random()}@example.com`, password: 'StrongPass123!' } });
  const { board } = await (await client.post(`${api}/boards`, { data: { name: 'Date checks' } })).json();
  const path = `${api}/boards/${board.id}/tasks`;
  try {
    for (const data of [
      { startDate: '2026-02-29', endDate: '2026-03-01' },
      { startDate: '2026-10-10' },
      { endDate: '2026-10-10' },
      { startDate: '2026-02-30', endDate: '2026-03-01' },
      { startDate: '10/01/2026', endDate: '2026-10-04' },
      { startDate: '2026-10-05', endDate: '2026-10-04' },
    ]) {
      expect((await client.post(path, { data: { title: 'Invalid dates', ...data } })).status()).toBe(400);
    }
    const leap = await client.post(path, { data: { title: 'Leap day', startDate: '2028-02-29', endDate: '2028-03-01' } });
    expect(leap.status()).toBe(201);
    expect((await leap.json()).task).toMatchObject({ startDate: '2028-02-29', endDate: '2028-03-01' });
    const created = await client.post(path, { data: { title: 'Dated task', startDate: '2026-10-10', endDate: '2026-10-12' } });
    expect(created.status()).toBe(201);
    const { task } = await created.json();
    expect(task).toMatchObject({ startDate: '2026-10-10', endDate: '2026-10-12' });
    expect((await (await client.get(path)).json()).tasks).toEqual(expect.arrayContaining([expect.objectContaining({ id: task.id, startDate: '2026-10-10', endDate: '2026-10-12' })]));
    expect((await client.patch(`${api}/tasks/${task.id}`, { data: { startDate: '2026-10-13' } })).status()).toBe(400);
    expect((await client.patch(`${api}/tasks/${task.id}`, { data: { endDate: '2026-10-09' } })).status()).toBe(400);
    expect((await client.patch(`${api}/tasks/${task.id}`, { data: { title: 'Keep dates', startDate: null, endDate: null } })).ok()).toBeTruthy();
    expect((await (await client.get(path)).json()).tasks).toEqual(expect.arrayContaining([expect.objectContaining({ id: task.id, startDate: '2026-10-10', endDate: '2026-10-12' })]));
    expect((await client.patch(`${api}/tasks/${task.id}`, { data: { startDate: '2026-10-12', endDate: '2026-10-12' } })).ok()).toBeTruthy();
    expect((await client.patch(`${api}/tasks/${task.id}`, { data: { startDate: '' } })).status()).toBe(400);
    const clear = await client.patch(`${api}/tasks/${task.id}`, { data: { startDate: '', endDate: '' } });
    expect(clear.ok()).toBeTruthy();
    expect((await clear.json()).task).toMatchObject({ startDate: '', endDate: '' });
    expect((await (await client.get(path)).json()).tasks).toEqual(expect.arrayContaining([expect.objectContaining({ id: task.id, startDate: '', endDate: '' })]));
  } finally {
    await client.delete(`${api}/boards/${board.id}`);
    await client.dispose();
  }
});
