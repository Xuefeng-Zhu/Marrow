import 'fake-indexeddb/auto';
import fc from 'fast-check';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearAll,
  deleteRecord,
  isHistoryRecord,
  listRecords,
  saveRecord,
  type HistoryRecord,
} from './history';

const RUNS = { numRuns: 100 };

const rec = (id: string, over: Partial<HistoryRecord> = {}): HistoryRecord => ({
  id,
  testId: 'shoulder-flexion-left',
  kind: 'rom-peak',
  side: 'left',
  value: 150,
  unit: 'degrees',
  takenAt: '2024-03-05T10:00:00.000Z',
  source: 'demo',
  stoppedEarly: false,
  ...over,
});

const recordArb: fc.Arbitrary<HistoryRecord> = fc
  .record(
    {
      id: fc.uuid(),
      testId: fc.constantFrom(
        'shoulder-flexion-left',
        'shoulder-flexion-right',
        'knee-flexion-left',
        'knee-flexion-right',
        'chair-stand',
        'single-leg-stance-left',
        'single-leg-stance-right',
      ),
      kind: fc.constantFrom('rom-peak', 'count', 'seconds'),
      side: fc.constantFrom('left', 'right'),
      value: fc.double({ noNaN: true, noDefaultInfinity: true }),
      unit: fc.string(),
      takenAt: fc.date({ min: new Date('2000-01-01'), max: new Date('2100-01-01'), noInvalidDate: true }).map((d) => d.toISOString()),
      source: fc.constantFrom('camera', 'demo'),
      stoppedEarly: fc.boolean(),
    },
    { requiredKeys: ['id', 'testId', 'kind', 'value', 'unit', 'takenAt', 'source', 'stoppedEarly'] },
  )
  .map((r) => r as HistoryRecord);

beforeEach(async () => {
  await clearAll();
});

describe('history store', () => {
  it('round trips a record', async () => {
    await saveRecord(rec('a'));
    expect(await listRecords()).toEqual([rec('a')]);
  });

  it('overwrites a record with the same id', async () => {
    await saveRecord(rec('a'));
    await saveRecord(rec('a', { value: 160 }));
    expect(await listRecords()).toEqual([rec('a', { value: 160 })]);
  });

  it('deletes one record', async () => {
    await saveRecord(rec('a'));
    await saveRecord(rec('b'));
    await deleteRecord('a');
    expect((await listRecords()).map((r) => r.id)).toEqual(['b']);
  });

  it('clears all records', async () => {
    await saveRecord(rec('a'));
    await saveRecord(rec('b'));
    await clearAll();
    expect(await listRecords()).toEqual([]);
  });

  it('skips corrupt entries without throwing', async () => {
    const { set, createStore } = await import('idb-keyval');
    const s = createStore('steady', 'history');
    await saveRecord(rec('good'));
    await set('rec:bad1', { id: 'bad1' }, s);
    await set('rec:bad2', 'nonsense', s);
    await set('rec:bad3', { ...rec('bad3'), value: Number.NaN }, s);
    await set('other', rec('other'), s);
    expect((await listRecords()).map((r) => r.id)).toEqual(['good']);
  });
});

describe('history guard', () => {
  it('rejects non-objects and bad fields', () => {
    for (const v of [null, undefined, 1, 'x', [], {}]) expect(isHistoryRecord(v)).toBe(false);
    expect(isHistoryRecord(rec('a', { takenAt: 'yesterday' }))).toBe(false);
    expect(isHistoryRecord(rec('a', { source: 'web' as never }))).toBe(false);
    expect(isHistoryRecord(rec('a', { side: 'up' as never }))).toBe(false);
    expect(isHistoryRecord(rec('a', { id: '' }))).toBe(false);
    expect(isHistoryRecord(rec('a', { value: Infinity }))).toBe(false);
    expect(isHistoryRecord(rec('a', { side: undefined }))).toBe(true);
  });
});

describe('P21 history validation', () => {
  it('a valid record is written then read back equal', async () => {
    await fc.assert(
      fc.asyncProperty(recordArb, async (r) => {
        expect(isHistoryRecord(r)).toBe(true);
        await clearAll();
        await saveRecord(r);
        expect(await listRecords()).toEqual([r]);
      }),
      RUNS,
    );
  });

  it('an invalid value is skipped by the guard and never throws', async () => {
    const { set, createStore } = await import('idb-keyval');
    const s = createStore('steady', 'history');
    const corrupt = fc.oneof(
      fc.anything(),
      recordArb.chain((r) =>
        fc.constantFrom<unknown>(
          { ...r, value: Number.NaN },
          { ...r, value: 'x' },
          { ...r, takenAt: 'not a date' },
          { ...r, testId: 'nope' },
          { ...r, source: 'x' },
          { ...r, stoppedEarly: 1 },
          { ...r, id: 5 },
        ),
      ),
    );
    await fc.assert(
      fc.asyncProperty(corrupt, async (v) => {
        fc.pre(!isHistoryRecord(v));
        await clearAll();
        await set('rec:x', v, s);
        expect(await listRecords()).toEqual([]);
      }),
      RUNS,
    );
  });
});

describe('storage failure', () => {
  it('maps IndexedDB errors to StorageUnavailableError', async () => {
    vi.resetModules();
    vi.stubGlobal('indexedDB', undefined);
    try {
      const fresh = await import('./history');
      await expect(fresh.listRecords()).rejects.toMatchObject({ name: 'StorageUnavailableError' });
      await expect(fresh.saveRecord(rec('a'))).rejects.toThrow(/cannot be saved/);
      await expect(fresh.deleteRecord('a')).rejects.toMatchObject({ name: 'StorageUnavailableError' });
      await expect(fresh.clearAll()).rejects.toBeDefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
