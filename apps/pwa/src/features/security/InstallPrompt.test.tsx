import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import '../../i18n';
import { InstallPrompt } from './InstallPrompt';

function fireBeforeInstallPrompt(prompt: () => Promise<void>) {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void> };
  event.prompt = prompt;
  window.dispatchEvent(event);
}

describe('InstallPrompt', () => {
  it('shows nothing until the browser offers to install', () => {
    render(<InstallPrompt />);
    expect(screen.queryByRole('region', { name: 'Installing this app' })).not.toBeInTheDocument();
  });

  it('shows the device-monitoring/cloud-sync warning when the browser offers to install, and "Install" proceeds', async () => {
    const prompt = vi.fn().mockResolvedValue(undefined);
    render(<InstallPrompt />);
    fireBeforeInstallPrompt(prompt);

    const region = await screen.findByRole('region', { name: 'Installing this app' });
    expect(region).toHaveTextContent(/cloud backup/i);

    await userEvent.click(screen.getByRole('button', { name: 'Install' }));
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('region', { name: 'Installing this app' })).not.toBeInTheDocument();
  });

  it('"Not now" dismisses the notice without ever calling prompt()', async () => {
    const prompt = vi.fn().mockResolvedValue(undefined);
    render(<InstallPrompt />);
    fireBeforeInstallPrompt(prompt);

    await userEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    expect(prompt).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: 'Installing this app' })).not.toBeInTheDocument();
  });
});
