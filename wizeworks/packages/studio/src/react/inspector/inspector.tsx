'use client';

// The Inspector rail.
//
// Its header IS the tab strip. A fixed "Properties" title above the tabs would
// duplicate the first tab's name and then contradict the second — the open tab is
// the only honest answer to "what is this panel".
//
// Nothing selected is a real state with a real answer, not a blank rail: it says
// what to do next, because the one thing an author who has just opened the editor
// does not know is that they are supposed to click the page first.

import { useState } from 'react';
import { TabsList, TabsTab } from '@wizeworks/silicaui-react';
import { useSelectedNode, useSymbolNames } from '../context';
import type { CanvasDevice } from '../canvas/canvas';
import { rowLabel } from '../navigator/layer-tree';
import { FillTabs, FillTabsPanel } from '../fill-tabs';
import { DesignTab } from './design-tab';
import { NodeActions } from './node-actions';
import { SettingsTab } from './settings-tab';

export function Inspector({ device }: { device: CanvasDevice }) {
  const node = useSelectedNode();
  const symbolNames = useSymbolNames();
  const [tab, setTab] = useState('design');

  if (!node) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-base-content text-sm">
          Click anything on your page to change how it looks.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-base-300 flex items-center gap-2 border-b px-3 py-2">
        <p className="text-base-content min-w-0 flex-1 truncate text-sm font-medium">
          {rowLabel(node, node.instanceOf ? symbolNames[node.instanceOf] : undefined)}
        </p>
        <NodeActions node={node} />
      </div>
      {/* Pills: a filled shape says "you are here" before the label is read. */}
      <FillTabs value={tab} onValueChange={setTab}>
        <TabsList className="px-3 pt-2">
          <TabsTab value="design">Design</TabsTab>
          <TabsTab value="settings">Settings</TabsTab>
        </TabsList>
        <FillTabsPanel value="design" scrolls>
          <DesignTab node={node} device={device} />
        </FillTabsPanel>
        <FillTabsPanel value="settings" scrolls>
          <SettingsTab node={node} />
        </FillTabsPanel>
      </FillTabs>
    </div>
  );
}
