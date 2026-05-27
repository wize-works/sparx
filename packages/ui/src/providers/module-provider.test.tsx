import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ModuleProvider, useModule, type SparxModule } from './module-provider';

// The CMS color from doc 23 §7 MODULE_COLORS — kept literal so a mismatch surfaces.
const CMS_COLOR = '#14B8A6';

function ModuleEcho() {
  const m = useModule();
  return <span data-testid="module">{m}</span>;
}

describe('ModuleProvider', () => {
  it('exposes the active module via useModule', () => {
    render(
      <ModuleProvider module="cms">
        <ModuleEcho />
      </ModuleProvider>
    );
    expect(screen.getByTestId('module').textContent).toBe('cms');
  });

  it('falls back to "platform" outside any provider', () => {
    render(<ModuleEcho />);
    expect(screen.getByTestId('module').textContent).toBe('platform');
  });

  it('sets --module-active inline so children adopt the module color', () => {
    const { container } = render(
      <ModuleProvider module="cms">
        <div>child</div>
      </ModuleProvider>
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.getPropertyValue('--module-active')).toBe(CMS_COLOR);
    expect(wrapper.dataset.module).toBe('cms');
  });

  it('switches CSS vars when the module prop changes', () => {
    const modules: SparxModule[] = ['cms', 'commerce', 'crm'];
    for (const m of modules) {
      const { container, unmount } = render(
        <ModuleProvider module={m}>
          <div />
        </ModuleProvider>
      );
      const wrapper = container.firstElementChild as HTMLElement;
      expect(wrapper.dataset.module).toBe(m);
      expect(wrapper.style.getPropertyValue('--module-active')).not.toBe('');
      unmount();
    }
  });
});
