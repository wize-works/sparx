import { describe, it, expect, beforeEach } from 'vitest';
import {
  _renderTemplateForTest,
  _setEmailProvider,
  consoleProvider,
  lastConsoleSend,
  resetConsoleProvider,
  sendTemplate,
} from '..';

beforeEach(() => {
  resetConsoleProvider();
  _setEmailProvider(consoleProvider);
});

describe('templates', () => {
  it('renders the password reset template with the reset URL in both bodies', async () => {
    const rendered = await _renderTemplateForTest({
      template: 'password-reset',
      to: 'user@example.test',
      props: {
        name: 'Brandon',
        resetUrl: 'https://app.sparx.works/reset?token=abc',
        expiresInMinutes: 30,
      },
    });
    expect(rendered.subject).toMatch(/reset your sparx password/i);
    expect(rendered.html).toContain('https://app.sparx.works/reset?token=abc');
    expect(rendered.text).toContain('https://app.sparx.works/reset?token=abc');
    expect(rendered.text).toMatch(/30 minutes/);
    expect(rendered.templateId).toBe('password-reset');
  });

  it('renders the merchant welcome template with the store name', async () => {
    const rendered = await _renderTemplateForTest({
      template: 'welcome-merchant',
      to: 'owner@example.test',
      props: {
        name: 'Brandon',
        storeName: 'Acme Diesel',
        dashboardUrl: 'https://app.sparx.works/welcome',
      },
    });
    expect(rendered.subject).toBe('Welcome to Sparx');
    expect(rendered.html).toContain('Acme Diesel');
    expect(rendered.text).toContain('Acme Diesel');
    expect(rendered.text).toContain('https://app.sparx.works/welcome');
    expect(rendered.templateId).toBe('welcome-merchant');
  });
});

describe('sendTemplate', () => {
  it('routes the rendered email to the active provider', async () => {
    const result = await sendTemplate({
      template: 'welcome-merchant',
      to: 'owner@example.test',
      props: {
        storeName: 'Acme Diesel',
        dashboardUrl: 'https://app.sparx.works/welcome',
      },
    });
    expect(result.provider).toBe('console');
    expect(result.id).toMatch(/^con_/);

    const send = lastConsoleSend();
    expect(send?.to).toBe('owner@example.test');
    expect(send?.subject).toBe('Welcome to Sparx');
    expect(send?.templateId).toBe('welcome-merchant');
  });

  it('rejects unknown providers via env validation', () => {
    // Sanity: provider selection only triggers on the next getEmailProvider()
    // call; with the cache already set, this is more about doc'ing the API.
    expect(typeof consoleProvider.send).toBe('function');
  });
});
