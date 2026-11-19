import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { PRESET_CIRCUITS } from './circuits/presets';
import { WORKOUTS } from './movements/registry';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setCamera(available: boolean) {
  const getUserMedia = vi.fn();
  Object.defineProperty(navigator, 'mediaDevices', {
    value: available ? { getUserMedia } : undefined,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'isSecureContext', { value: available, configurable: true });
  return getUserMedia;
}

describe('picker and mode screens', () => {
  it('lists all five workouts and the preset circuits', () => {
    setCamera(true);
    render(<App />);
    for (const w of WORKOUTS) expect(screen.getByRole('button', { name: new RegExp(`^${w.name}`) })).toBeTruthy();
    expect(WORKOUTS).toHaveLength(5);
    for (const c of PRESET_CIRCUITS) expect(screen.getByRole('button', { name: new RegExp(`^${c.name}`) })).toBeTruthy();
    expect(screen.getByText(/never uploaded/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /history/i })).toBeTruthy();
    expect(screen.getByTestId('streak-badge')).toBeTruthy();
  });

  it('focuses the h1 and sets the title on every screen change', async () => {
    setCamera(true);
    const user = userEvent.setup();
    render(<App />);
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }));
    await user.click(screen.getByRole('button', { name: /^Squat/ }));
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent).toMatch(/Squat/);
    expect(document.activeElement).toBe(h1);
    expect(document.title).toMatch(/Squat/);
  });

  it('opens the mode screen for a workout and for a circuit, and goes back', async () => {
    setCamera(true);
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /^Spooky Starter/ }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Spooky Starter/);
    expect(screen.getByText(/downloads a small pose model/i).textContent).toMatch(/storage\.googleapis\.com/);
    expect(screen.getByText(/not medical advice/i)).toBeTruthy();
    expect(screen.getByRole('heading', { name: /camera placement/i })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Pick your torment');
  });

  it('Demo clip never touches getUserMedia', async () => {
    const gum = setCamera(true);
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /^Plank/ }));
    await user.click(screen.getByRole('button', { name: 'Demo clip' }));
    expect(gum).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { level: 1, name: /how do you want/i })).toBeNull();
  });

  it('disables the camera with an explanation when mediaDevices is missing', async () => {
    setCamera(false);
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /^Lunge/ }));
    const camera = screen.getByRole('button', { name: 'Camera' }) as HTMLButtonElement;
    expect(camera.disabled).toBe(true);
    expect(camera.getAttribute('aria-describedby')).toBe('camera-reason');
    expect(document.getElementById('camera-reason')?.textContent).toMatch(/secure|camera/i);
    expect((screen.getByRole('button', { name: 'Demo clip' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
