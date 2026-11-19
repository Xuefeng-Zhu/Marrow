import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearAll, listRecords, saveRecord, StorageUnavailableError, type HistoryRecord } from '../data/history';
import { buildResult, type RunOutcome } from '../logic/result';
import { TEST_BY_ID, type TestId } from '../tests';
import { ResultCard } from './ResultCard';

vi.mock('../data/history', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/history')>();
  return { ...actual, saveRecord: vi.fn(actual.saveRecord) };
});

const saveMock = vi.mocked(saveRecord);

afterEach(async () => {
  cleanup();
  saveMock.mockClear();
  vi.restoreAllMocks();
  await clearAll();
});

function card(id: TestId, raw: number | null, extra: Partial<RunOutcome> = {}) {
  const model = buildResult({ test: TEST_BY_ID[id], raw, source: 'camera', takenAt: '2026-03-04T10:00:00.000Z', ...extra });
  render(<ResultCard model={model} onTryAgain={() => undefined} onBack={() => undefined} />);
  return model;
}

describe('ResultCard', () => {
  it('shows the value, the source, the disclaimers and the three actions', () => {
    card('knee-flexion-left', 60); // a knee angle of 60 is 120 degrees of flexion
    const text = screen.getByRole('article').textContent ?? '';
    expect(text).toMatch(/120/);
    expect(text).toMatch(/Source: Camera/);
    expect(text).toMatch(/This is not a diagnosis/);
    expect(text).toMatch(/not a medical device/);
    expect(text).toMatch(/No video or landmarks leave your browser/);
    expect(screen.getByRole('button', { name: 'Save result' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to tests' })).toBeTruthy();
  });

  it('does not offer to save "Foot was not lifted"', () => {
    card('single-leg-stance-left', null, { stop: 'timeout' });
    expect(screen.getByText('Foot was not lifted.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save result' })).toBeNull();
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('does not offer to save "No movement detected"', () => {
    card('shoulder-flexion-left', null, { stop: 'timeout' });
    expect(screen.getByText('No movement detected.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save result' })).toBeNull();
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('saves one record and confirms in text', async () => {
    const user = userEvent.setup();
    card('chair-stand', 11, { stop: 'window', source: 'demo' });
    expect(screen.getByRole('article').textContent).toMatch(/Demo clip/);
    await user.click(screen.getByRole('button', { name: 'Save result' }));
    expect((await screen.findByRole('status')).textContent).toMatch(/saved/i);
    const rows = await listRecords();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ testId: 'chair-stand', value: 11, source: 'demo', kind: 'count', stoppedEarly: false });
    expect(screen.queryByRole('button', { name: 'Save result' })).toBeNull();
  });

  it('ignores a second activation while the save is in flight', async () => {
    let release: () => void = () => undefined;
    saveMock.mockImplementationOnce(async (r) => {
      await new Promise<void>((res) => (release = res));
      return (await vi.importActual<typeof import('../data/history')>('../data/history')).saveRecord(r);
    });
    card('chair-stand', 11, { stop: 'window' });
    const button = screen.getByRole('button', { name: 'Save result' }) as HTMLButtonElement;
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button.disabled).toBe(true);
    release();
    await screen.findByRole('status');
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(await listRecords()).toHaveLength(1);
  });

  it('shows the message and keeps the card printable when storage fails (R10.8)', async () => {
    const user = userEvent.setup();
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    saveMock.mockRejectedValueOnce(new StorageUnavailableError());
    card('chair-stand', 9, { stop: 'window' });
    await user.click(screen.getByRole('button', { name: 'Save result' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/cannot be saved on this device/i);
    expect(screen.getByRole('article').textContent).toMatch(/9/);
    await user.click(screen.getByRole('button', { name: 'Print this card' }));
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('says Stopped early for an early stop and saves the flag', async () => {
    const user = userEvent.setup();
    card('chair-stand', 4, { stop: 'user', stoppedEarly: true });
    expect(screen.getByText('Stopped early')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Save result' }));
    await screen.findByRole('status');
    expect((await listRecords())[0]!.stoppedEarly).toBe(true);
  });

  it('shows asymmetry when the other side has a result the same day', async () => {
    const other: HistoryRecord = {
      id: 'r1',
      testId: 'shoulder-flexion-right',
      kind: 'rom-peak',
      side: 'right',
      value: 140,
      unit: 'degrees',
      takenAt: '2026-03-04T10:05:00.000Z',
      source: 'camera',
      stoppedEarly: false,
    };
    await saveRecord(other);
    card('shoulder-flexion-left', 160);
    expect(await screen.findByText(/Left is 12\.5% larger/)).toBeTruthy();
  });

  it('shows no asymmetry for the chair stand', async () => {
    card('chair-stand', 12, { stop: 'window' });
    await screen.findByRole('article');
    expect(screen.queryByText(/larger/)).toBeNull();
  });
});
