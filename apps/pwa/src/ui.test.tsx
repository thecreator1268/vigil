import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import en from './i18n/en.json';
import hi from './i18n/hi.json';
import './i18n';
import { SyncStatusIndicator } from './components/SyncStatusIndicator';
import { CrisisBar } from './features/crisis/CrisisBar';
import { CrisisResources } from './features/crisis/CrisisResources';
import { useStore } from './store';
import { estimatePitch, summariseVoice } from './voice/pitch';

function keys(o: object, prefix = ''): string[] {
  return Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
}

describe('crisis resources (ship in every build)', () => {
  it('the always-visible bar dials KIRAN in one tap and links to more help', () => {
    render(<MemoryRouter><CrisisBar /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /KIRAN 1800-599-0019/ })).toHaveAttribute('href', 'tel:18005990019');
    expect(screen.getByRole('link', { name: /More help/ })).toHaveAttribute('href', '/help');
  });

  it('lists KIRAN, iCall and Vandrevala with real contact details, plus 112', () => {
    render(<CrisisResources />);
    expect(screen.getByRole('link', { name: /Call 1800-599-0019/ })).toHaveAttribute('href', 'tel:18005990019');
    expect(screen.getByRole('link', { name: /Call 1860-2662-345/ })).toHaveAttribute('href', 'tel:18602662345');
    expect(screen.getByRole('link', { name: /Visit website/ })).toHaveAttribute('href', 'https://icallhelpline.org');
    expect(screen.getByRole('link', { name: /Call 112/ })).toHaveAttribute('href', 'tel:112');
    expect(screen.getByText(/iCall/)).toBeInTheDocument();
  });
});

describe('sync status indicator', () => {
  it('shows saved-locally, syncing and crisis states with text, not colour alone', async () => {
    useStore.setState((s) => ({ sync: { ...s.sync, pending: 2, syncing: false, crisisPending: 0 } }));
    const { rerender } = render(<SyncStatusIndicator />);
    expect(await screen.findByText('Saved on this device')).toBeInTheDocument();
    useStore.setState((s) => ({ sync: { ...s.sync, syncing: true } }));
    rerender(<SyncStatusIndicator />);
    expect(await screen.findByText('Syncing…')).toBeInTheDocument();
    useStore.setState((s) => ({ sync: { ...s.sync, crisisPending: 1 } }));
    rerender(<SyncStatusIndicator />);
    expect(await screen.findByText(/Sending to your counselor/)).toBeInTheDocument();
  });
});

describe('i18n', () => {
  it('Hindi has every key English has (no untranslated victim copy)', () => {
    expect(keys(hi).sort()).toEqual(keys(en).sort());
  });

  it('never uses clinical/diagnostic labels in victim copy', () => {
    const text = JSON.stringify(en).toLowerCase();
    for (const word of ['depress', 'disorder', 'ptsd', 'symptom', 'patient', 'diagnos', 'score']) expect(text).not.toContain(word);
  });
});

describe('voice features', () => {
  it('estimates the pitch of a voiced frame and ignores silence', () => {
    const sr = 16_000;
    const frame = Float32Array.from({ length: 2048 }, (_, i) => Math.sin((2 * Math.PI * 200 * i) / sr));
    expect(estimatePitch(frame, sr)).toBeCloseTo(200, -1);
    expect(estimatePitch(new Float32Array(2048), sr)).toBeNull();
  });

  it('summarises to two numbers, or nothing when too little was said', () => {
    expect(summariseVoice([{ rms: 0.1, pitch: 200 }])).toBeNull();
    const s = summariseVoice(Array.from({ length: 20 }, (_, i) => ({ rms: 0.05, pitch: i % 2 ? 180 : 220 })));
    expect(s).toEqual({ pitchVar: expect.closeTo(0.1, 3), rms: expect.closeTo(0.05, 6) });
  });
});

describe('check-in skip affordance', () => {
  it('offers a guilt-free skip on every question', async () => {
    const { CheckInFlow } = await import('./features/checkin/CheckInFlow');
    render(<MemoryRouter><CheckInFlow /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(await screen.findByRole('button', { name: 'Skip this one' })).toBeInTheDocument();
    expect(screen.queryByText(/required|must answer/i)).toBeNull();
  });
});
