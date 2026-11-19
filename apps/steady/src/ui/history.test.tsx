import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAll, listRecords, saveRecord, type HistoryRecord } from '../data/history';
import { aggregateByDay } from '../logic/trend';
import { History } from './History';
import { latestPair, Report } from './Report';
import { summarize } from '../logic/trend';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let n = 0;
function rec(over: Partial<HistoryRecord>): HistoryRecord {
  n += 1;
  return {
    id: `r${n}`,
    testId: 'knee-flexion-left',
    kind: 'rom-peak',
    side: 'left',
    value: 100,
    unit: 'degrees',
    takenAt: '2025-03-01T12:00:00',
    source: 'camera',
    stoppedEarly: false,
    ...over,
  };
}

beforeEach(async () => {
  await clearAll();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const noop = () => undefined;

describe('History', () => {
  it('shows the empty state', async () => {
    render(<History onBack={noop} onReport={noop} />);
    expect(await screen.findByText(/No results yet\. To take your first test/)).toBeTruthy();
  });

  it('lists results newest first, with chart points and table equal to aggregateByDay', async () => {
    const records = [
      rec({ value: 90, takenAt: '2025-03-01T10:00:00' }),
      rec({ value: 110, takenAt: '2025-03-03T10:00:00' }),
      rec({ value: 100, takenAt: '2025-03-03T18:00:00' }),
      rec({ value: 95, takenAt: '2025-03-02T10:00:00' }),
    ];
    for (const r of records) await saveRecord(r);
    const { container } = render(<History onBack={noop} onReport={noop} />);
    const list = await screen.findByRole('list', { name: /Knee flexion, left leg results, newest first/ });
    const values = within(list)
      .getAllByRole('listitem')
      .map((li) => li.querySelector('strong')!.textContent);
    expect(values).toEqual(['100 degrees', '110 degrees', '95 degrees', '90 degrees']);

    const expected = aggregateByDay(records);
    const marks = Array.from(container.querySelectorAll('svg [data-point]')).map((m) => ({
      day: m.getAttribute('data-day'),
      value: Number(m.getAttribute('data-value')),
    }));
    expect(marks).toEqual(expected);
    const rows = Array.from(container.querySelectorAll('table tbody tr')).map((tr) => ({
      day: tr.querySelector('th')!.textContent,
      value: Number(tr.querySelector('td')!.textContent),
    }));
    expect(rows).toEqual(expected);
    expect(container.querySelector('svg title')).toBeTruthy();
    expect(container.querySelector('svg desc')).toBeTruthy();
  });

  it('asks for confirmation before deleting one result or all history', async () => {
    const user = userEvent.setup();
    await saveRecord(rec({ id: 'keep', takenAt: '2025-03-01T10:00:00' }));
    await saveRecord(rec({ id: 'drop', takenAt: '2025-03-02T10:00:00', value: 120 }));
    render(<History onBack={noop} onReport={noop} />);
    await user.click(await screen.findByRole('button', { name: /^Delete one result: 120 degrees/ }));
    expect(await listRecords()).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(await listRecords()).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: /^Delete one result: 120 degrees/ }));
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }));
    await waitFor(async () => expect((await listRecords()).map((r) => r.id)).toEqual(['keep']));

    await user.click(await screen.findByRole('button', { name: 'Delete all history' }));
    expect(await listRecords()).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Yes, delete all' }));
    await waitFor(async () => expect(await listRecords()).toHaveLength(0));
    expect(await screen.findByText(/No results yet/)).toBeTruthy();
  });

  it('filters demo records with the toggle and labels demo rows', async () => {
    const user = userEvent.setup();
    await saveRecord(rec({ value: 80, source: 'camera', takenAt: '2025-03-01T10:00:00' }));
    await saveRecord(rec({ value: 130, source: 'demo', takenAt: '2025-03-02T10:00:00' }));
    render(<History onBack={noop} onReport={noop} />);
    const list = await screen.findByRole('list', { name: /results, newest first/ });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getAllByText('Demo')).toHaveLength(1);
    await user.click(screen.getByRole('checkbox', { name: 'Include demo clips' }));
    const after = screen.getByRole('list', { name: /results, newest first/ });
    expect(within(after).getAllByRole('listitem')).toHaveLength(1);
    expect(within(after).queryByText('Demo')).toBeNull();
  });
});

describe('Report', () => {
  it('summaries match summarize and the count', async () => {
    const records = [
      rec({ value: 90, takenAt: '2025-03-01T10:00:00' }),
      rec({ value: 120, takenAt: '2025-03-02T10:00:00' }),
      rec({ value: 105, takenAt: '2025-03-03T10:00:00' }),
    ];
    for (const r of records) await saveRecord(r);
    render(<Report onBack={noop} />);
    const section = (await screen.findByRole('heading', { name: 'Knee flexion, left leg' })).closest('section')!;
    const s = summarize(aggregateByDay(records))!;
    const text = section.querySelector('dl')!.textContent!;
    expect(text).toContain(`Latest${s.latest} degrees`);
    expect(text).toContain(`Best${s.best} degrees`);
    expect(text).toContain(`Change since first+${s.change} degrees`);
    expect(text).toContain('Number of results3');
  });

  it('shows asymmetry only for same-day left and right pairs', async () => {
    await saveRecord(rec({ testId: 'knee-flexion-left', side: 'left', value: 100, takenAt: '2025-03-01T10:00:00' }));
    await saveRecord(rec({ testId: 'knee-flexion-right', side: 'right', value: 80, takenAt: '2025-03-02T10:00:00' }));
    const { unmount } = render(<Report onBack={noop} />);
    await screen.findByRole('heading', { name: 'Knee flexion, right leg' });
    expect(screen.queryByRole('heading', { name: 'Left and right compared' })).toBeNull();
    unmount();

    await saveRecord(rec({ testId: 'knee-flexion-right', side: 'right', value: 80, takenAt: '2025-03-01T15:00:00' }));
    render(<Report onBack={noop} />);
    expect(await screen.findByRole('heading', { name: 'Left and right compared' })).toBeTruthy();
    expect(screen.getByText(/left 100, right 80 degrees\. Left is 20% larger\./)).toBeTruthy();
  });

  it('latestPair finds the latest shared day', () => {
    const l = [{ day: '2025-01-01', value: 1 }, { day: '2025-01-03', value: 3 }];
    const r = [{ day: '2025-01-01', value: 2 }, { day: '2025-01-02', value: 5 }];
    expect(latestPair(l, r)).toEqual({ day: '2025-01-01', left: 1, right: 2 });
    expect(latestPair(l, [])).toBeNull();
  });

  it('says there are no records and keeps print available', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const user = userEvent.setup();
    render(<Report onBack={noop} />);
    expect(await screen.findByText(/No results in this date range/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Print or save as PDF' }));
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('includes the disclaimer, privacy note and sources', async () => {
    await saveRecord(rec({ testId: 'chair-stand', side: undefined, kind: 'count', value: 12, unit: 'stands in 30 seconds' }));
    render(<Report onBack={noop} />);
    await screen.findByRole('heading', { name: '30-second chair stand' });
    expect(screen.getByText(/Steady is not a medical device\. It does not diagnose or treat any condition\./)).toBeTruthy();
    expect(screen.getByText(/No video or landmarks leave your browser/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Sources for reference context' })).toBeTruthy();
  });
});

describe('print.css', () => {
  const css = readFileSync(resolve(__dirname, '../print.css'), 'utf8');
  it('hides chrome, avoids breaks inside sections and prints black on white', () => {
    expect(css).toMatch(/@media print/);
    expect(css).toMatch(/\.no-print[\s\S]*display:\s*none/);
    expect(css).toMatch(/\.report-section\s*{[^}]*break-inside:\s*avoid/);
    expect(css).toMatch(/background:\s*#fff/);
    expect(css).toMatch(/color:\s*#000/);
  });
});
