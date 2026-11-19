import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './App';

afterEach(cleanup);

describe('Steady app shell', () => {
  it('has a main landmark with the content id and a heading', () => {
    render(<App />);
    const main = screen.getByRole('main');
    expect(main.id).toBe('content');
    expect(screen.getByRole('heading', { level: 1, name: 'Choose a test' })).toBeTruthy();
  });

  it('shows the disclaimer and privacy text in a footer', () => {
    render(<App />);
    const footer = screen.getByRole('contentinfo');
    expect(footer.textContent).toMatch(/not a medical device/i);
    expect(footer.textContent).toMatch(/not .*diagnosis/i);
    expect(footer.textContent).toMatch(/no video is uploaded/i);
  });

  it('makes the skip link the first tab stop and points it at main', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.tab();
    const skip = screen.getByRole('link', { name: /skip to main content/i });
    expect(document.activeElement).toBe(skip);
    expect(skip.getAttribute('href')).toBe('#content');
  });

  it('hides the decorative skeleton mark from assistive technology', () => {
    const { container } = render(<App />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});
