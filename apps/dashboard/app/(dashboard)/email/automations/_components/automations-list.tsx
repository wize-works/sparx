'use client';

import { useState, useTransition } from 'react';
import { Settings2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Stack,
  Switch,
  Text,
  toast,
} from '@sparx/ui';

import { updateAutomationAction } from '../actions';
import type { AutomationRow } from '../../_lib/types';

const DELAY_OPTIONS = [
  { value: '0', label: 'Immediately' },
  { value: '3600', label: 'After 1 hour' },
  { value: '7200', label: 'After 2 hours' },
  { value: '86400', label: 'After 1 day' },
  { value: '259200', label: 'After 3 days' },
];

const CAP_OPTIONS = [
  { value: 'none', label: 'No cap' },
  { value: '86400', label: 'Once per day' },
  { value: '604800', label: 'Once per week' },
  { value: '2592000', label: 'Once per month' },
];

function humanizeDelay(seconds: number): string {
  if (seconds === 0) return 'Immediately';
  if (seconds % 86400 === 0) return `After ${seconds / 86400}d`;
  if (seconds % 3600 === 0) return `After ${seconds / 3600}h`;
  return `After ${Math.round(seconds / 60)}m`;
}

function humanizeTrigger(event: string): string {
  return event.replace(/^crm\./, '').replace(/[._]/g, ' ');
}

function AutomationCard({ automation }: { automation: AutomationRow }) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [delay, setDelay] = useState(String(automation.delaySeconds));
  const [cap, setCap] = useState(
    automation.frequencyCapSeconds == null ? 'none' : String(automation.frequencyCapSeconds)
  );

  function toggle(next: boolean) {
    startTransition(async () => {
      const result = await updateAutomationAction(automation.id, { enabled: next });
      if (result.ok) toast.success(`${automation.name} ${next ? 'enabled' : 'paused'}.`);
      else toast.error(result.error.message);
    });
  }

  function saveConfig() {
    startTransition(async () => {
      const result = await updateAutomationAction(automation.id, {
        delaySeconds: Number(delay),
        frequencyCapSeconds: cap === 'none' ? null : Number(cap),
      });
      if (result.ok) {
        toast.success('Automation updated.');
        setOpen(false);
      } else toast.error(result.error.message);
    });
  }

  return (
    <Card variant="module">
      <CardHeader>
        <Stack direction="row" align="center" justify="between" gap={3} className="flex-wrap">
          <Stack gap={1}>
            <Stack direction="row" align="center" gap={2}>
              <Text weight="medium">{automation.name}</Text>
              {!automation.canDisable ? <Badge variant="outline">Always on</Badge> : null}
            </Stack>
            <Text size="sm" variant="muted">
              On {humanizeTrigger(automation.triggerEvent)} ·{' '}
              {humanizeDelay(automation.delaySeconds)}
              {automation.frequencyCapSeconds ? ' · capped' : ''}
            </Text>
          </Stack>
          <Stack direction="row" align="center" gap={3}>
            <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
              <Settings2 className="h-3.5 w-3.5" />
              Configure
            </Button>
            <Switch
              checked={automation.enabled}
              onCheckedChange={toggle}
              disabled={pending || !automation.canDisable}
              aria-label={`Toggle ${automation.name}`}
            />
          </Stack>
        </Stack>
      </CardHeader>
      {open ? (
        <CardContent>
          <Stack direction="row" align="end" gap={3} className="flex-wrap">
            <Stack gap={2}>
              <Label>Send delay</Label>
              <Select value={delay} onValueChange={setDelay} disabled={pending}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DELAY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Stack>
            <Stack gap={2}>
              <Label>Frequency cap</Label>
              <Select value={cap} onValueChange={setCap} disabled={pending}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAP_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Stack>
            <Button
              variant="module"
              size="sm"
              onClick={saveConfig}
              loading={pending}
              disabled={pending}
            >
              Save
            </Button>
          </Stack>
        </CardContent>
      ) : null}
    </Card>
  );
}

export function AutomationsList({ automations }: { automations: AutomationRow[] }) {
  return (
    <Stack gap={3}>
      {automations.map((a) => (
        <AutomationCard key={a.id} automation={a} />
      ))}
    </Stack>
  );
}
