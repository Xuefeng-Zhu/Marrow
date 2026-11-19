import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

const ctx = {
  canvas: { width: 640, height: 480 },
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
};

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Rattle Reps hello skeleton', () => {
  it('renders a canvas with an accessible name', () => {
    render(<App />);
    expect(screen.getByRole('img', { name: /skeleton overlay/i })).toBeInstanceOf(HTMLCanvasElement);
  });

  it('defaults to demo clip mode', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'Demo clip' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Camera' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('states that processing is on-device and nothing is uploaded', () => {
    render(<App />);
    expect(screen.getByText(/runs on your device/i).textContent).toMatch(/no video is uploaded/i);
  });

  it('mode toggle and play control work from the keyboard', async () => {
    const user = userEvent.setup();
    render(<App />);
    const camera = screen.getByRole('button', { name: 'Camera' });
    const demo = screen.getByRole('button', { name: 'Demo clip' });
    // No camera exists here, so selecting it reports an error instead of prompting.
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    await user.tab();
    expect(document.activeElement).toBe(demo);
    await user.tab();
    expect(document.activeElement).toBe(camera);
    await user.tab();
    const playPause = screen.getByRole('button', { name: 'Pause' });
    expect(document.activeElement).toBe(playPause);
    await user.keyboard(' ');
    expect(playPause.textContent).toBe('Play');

    await user.tab({ shift: true });
    expect(document.activeElement).toBe(camera);
    await user.keyboard('{Enter}');
    expect(camera.getAttribute('aria-pressed')).toBe('true');
    expect(demo.getAttribute('aria-pressed')).toBe('false');
  });
});
