import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Layout } from './Layout';

afterEach(cleanup);

describe('Layout', () => {
  it('has a banner, a main landmark and exactly one h1 that takes focus', () => {
    render(
      <Layout title="Pick your torment">
        <p>Body</p>
      </Layout>,
    );
    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.getByRole('main')).toBeTruthy();
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(document.activeElement).toBe(headings[0]);
    expect(document.title).toBe('Pick your torment | Rattle Reps');
  });

  it('moves focus and title when the screen title changes', () => {
    const { rerender } = render(<Layout title="One">x</Layout>);
    rerender(<Layout title="Two">x</Layout>);
    expect(document.title).toBe('Two | Rattle Reps');
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Two' }));
  });
});
