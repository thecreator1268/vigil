import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import '../../i18n';
import { useStore } from '../../store';
import { AppLockGate } from './AppLockGate';
import { hashPin, randomSaltHex } from './pin';

afterEach(() => {
  useStore.setState((s) => ({ ui: { ...s.ui, appLockEnabled: false, appLockSalt: null, appLockPinHash: null } }));
});

describe('AppLockGate', () => {
  it('renders children straight through when App Lock is off (the default)', () => {
    render(
      <AppLockGate>
        <p>victim content</p>
      </AppLockGate>,
    );
    expect(screen.getByText('victim content')).toBeInTheDocument();
  });

  it('locks on mount when enabled, and unlocks only with the right PIN', async () => {
    const salt = randomSaltHex();
    const appLockPinHash = await hashPin('1234', salt);
    useStore.setState((s) => ({ ui: { ...s.ui, appLockEnabled: true, appLockSalt: salt, appLockPinHash } }));

    render(
      <AppLockGate>
        <p>victim content</p>
      </AppLockGate>,
    );
    expect(screen.queryByText('victim content')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Locked' })).toBeInTheDocument();

    const pinInput = screen.getByLabelText('PIN');
    await userEvent.type(pinInput, '0000');
    await userEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByText("That's not right. Try again.")).toBeInTheDocument();
    expect(screen.queryByText('victim content')).not.toBeInTheDocument();

    await userEvent.clear(pinInput);
    await userEvent.type(pinInput, '1234');
    await userEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByText('victim content')).toBeInTheDocument();
  });
});
