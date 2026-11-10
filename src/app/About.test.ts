// @vitest-environment jsdom
// WS8: the About panel states the ODbL licence of the OpenStreetMap-derived nearby data.
import { cleanup, render, screen, within } from '@testing-library/react';
import { createElement as h } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { About } from './About';
import { DEFAULT_ATTRIBUTION } from './attributionData';

afterEach(cleanup);

describe('About', () => {
  it('says the nearby places are © OpenStreetMap contributors under the ODbL, with a link', () => {
    render(
      h(About, { open: false, onClose: () => {}, attribution: DEFAULT_ATTRIBUTION, nation: null }),
    );
    const p = screen.getByTestId('about-odbl');
    expect(p.textContent).toMatch(/© OpenStreetMap contributors/);
    const link = within(p).getByRole('link', { hidden: true });
    expect(link.textContent).toBe('Open Database License (ODbL)');
    expect(link.getAttribute('href')).toBe('https://opendatacommons.org/licenses/odbl/1-0/');
  });
});
