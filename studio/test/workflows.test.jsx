// @vitest-environment jsdom
// Major Studio workflows, rendered in jsdom and driven through the simulator.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Studio from '../app/page.jsx';

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  URL.createObjectURL = vi.fn(() => 'blob:test');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const tab = (name) => fireEvent.click(screen.getByRole('tab', { name }));

async function startSimulator() {
  render(<Studio />);
  fireEvent.click(screen.getAllByRole('button', { name: 'Use simulator' })[0]);
  // CFG arrives after the simulated boot and Studio's own cfg/info requests.
  await screen.findByText(/fw 0\.2\.0-sim/, {}, { timeout: 3000 });
}

describe('Studio workflows (simulator)', () => {
  it('without a board, Web Serial is explained and the simulator is offered', () => {
    render(<Studio />);
    expect(screen.getByText(/cannot talk to USB devices/)).toBeTruthy();
    for (const b of screen.getAllByRole('button', { name: 'Connect board' })) expect(b.disabled).toBe(true);
    expect(screen.getAllByRole('button', { name: 'Use simulator' })[0].disabled).toBe(false);
  });

  it('connects to the simulator and labels it as simulated', async () => {
    await startSimulator();
    expect(screen.getAllByText('SIMULATOR').length).toBeGreaterThan(0);
    expect(screen.getByRole('status').textContent).toBe('Simulator connected.');
    expect(await screen.findByText('simulated')).toBeTruthy(); // capability chip from INFO
  });

  it('pressing a core key on the preview logs a simulated selection in History', async () => {
    await startSimulator();
    tab('Board');
    fireEvent.click(screen.getByRole('button', { name: /^Key 3: help/ }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Board said help/));
    tab('History');
    const table = screen.getByRole('table', { name: /Communication events/ });
    expect(within(table).getByText('help')).toBeTruthy();
    expect(within(table).getByText('simulator')).toBeTruthy();
    expect(screen.getByText(/not from a real board/)).toBeTruthy();
  });

  it('listening simulation lights vocabulary keys but never the core row, and selects nothing', async () => {
    await startSimulator();
    tab('Listening');
    expect(screen.getByText(/SIMULATED\./)).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Clear speech' })[0]); // "Khana ya paani?"
    await screen.findByText(/Lit now: water, food|Lit now: food, water/, {}, { timeout: 3000 });
    tab('Board');
    const keys = screen.getAllByRole('button', { name: /^Key \d/ });
    const lit = keys.filter((k) => /suggested by listening/.test(k.getAttribute('aria-label')));
    expect(lit.map((k) => k.getAttribute('aria-label').match(/^Key (\d)/)[1]).sort()).toEqual(['5', '6']);
    for (const k of keys.slice(0, 4)) expect(k.getAttribute('aria-label')).toMatch(/core key, always available/);
    for (const k of keys.slice(0, 4)) expect(k.disabled).toBe(false);
    tab('History');
    expect(screen.queryAllByText('select')).toHaveLength(0); // highlights only
  });

  it('profile validation blocks sending, and the board reply is shown', async () => {
    await startSimulator();
    tab('Profiles');
    const child = screen.getByLabelText('Child code');
    fireEvent.change(child, { target: { value: 'C,1' } });
    expect(screen.getByText(/Use 1-7 letters/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send to board' }).disabled).toBe(true);
    fireEvent.change(child, { target: { value: 'C09' } });
    fireEvent.change(screen.getByLabelText('Voice language'), { target: { value: 'ta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to board' }));
    await screen.findByText('The board confirmed these settings.');
    fireEvent.click(screen.getByRole('button', { name: 'Save on this laptop' }));
    expect(JSON.parse(localStorage.getItem('vaani.profiles')).C09.lang).toBe('ta');
    tab('Home');
    expect(screen.getByText('C09')).toBeTruthy();
  });

  it('switch scanning: the access-switch button selects the key under the cursor', async () => {
    await startSimulator();
    tab('Profiles');
    fireEvent.change(screen.getByLabelText('Access method'), { target: { value: 'scan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to board' }));
    tab('Board');
    await screen.findByText(/Scan cursor on/, {}, { timeout: 3000 });
    fireEvent.click(screen.getByRole('button', { name: 'Press access switch' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Board said/));
  });

  it('a simulated USB unplug is reported, keeps the history, and Reconnect works', async () => {
    await startSimulator();
    tab('Board');
    fireEvent.click(screen.getByRole('button', { name: /^Key 1: yes/ }));
    tab('Diagnostics');
    fireEvent.click(screen.getByRole('button', { name: 'Simulate USB unplug' }));
    expect(await screen.findByText('Connection lost')).toBeTruthy();
    tab('History');
    expect(screen.getAllByText('yes').length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: 'Reconnect' })[0]);
    await screen.findByText(/fw 0\.2\.0-sim/, {}, { timeout: 3000 });
  });

  it('demo events load labelled as demo data', () => {
    render(<Studio />);
    tab('History');
    fireEvent.click(screen.getByRole('button', { name: 'Load fictional demo session' }));
    expect(within(screen.getByRole('table', { name: /Communication events/ })).getAllByText('demo')).toHaveLength(13);
    expect(screen.getByText(/8 words spoken/)).toBeTruthy();
  });

  it('tabs work from the keyboard', () => {
    render(<Studio />);
    const home = screen.getByRole('tab', { name: 'Home' });
    home.focus();
    fireEvent.keyDown(home, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Board' }).getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Board' }));
    fireEvent.keyDown(document.activeElement, { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Diagnostics' }).getAttribute('aria-selected')).toBe('true');
  });

  it('display settings apply and persist', async () => {
    render(<Studio />);
    await act(async () => fireEvent.click(screen.getByLabelText('High contrast')));
    expect(document.documentElement.dataset.contrast).toBe('high');
    expect(JSON.parse(localStorage.getItem('vaani.settings')).contrast).toBe(true);
  });

  it('vocabulary: editing a copy validates live (non-ASCII LCD label refused) and saves locally', () => {
    render(<Studio />);
    tab('Vocabulary');
    fireEvent.click(screen.getByRole('button', { name: 'Edit a copy' }));
    fireEvent.change(screen.getByLabelText('water transliteration'), { target: { value: 'पानी' } });
    expect(screen.getByText(/plain ASCII/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save on this laptop' }).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('water transliteration'), { target: { value: 'PAANEE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save on this laptop' }));
    expect(JSON.parse(localStorage.getItem('vaani.packs'))[0].keys[4].transliteration).toBe('PAANEE');
    expect(screen.getByText(/Hindi \(hi\) · edited/)).toBeTruthy();
  });
});
