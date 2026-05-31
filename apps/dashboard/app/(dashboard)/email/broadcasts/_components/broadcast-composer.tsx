'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Stack,
  Text,
  toast,
} from '@sparx/ui';

import { createBroadcastAction } from '../actions';
import type { AuthoredTemplateView, SegmentOption } from '../../_lib/types';

interface ComposerProps {
  segments: SegmentOption[];
  templates: AuthoredTemplateView[];
}

export function BroadcastComposer({ segments, templates }: ComposerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [preheader, setPreheader] = useState('');
  const [segmentId, setSegmentId] = useState('');
  const [templateId, setTemplateId] = useState('');

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim() || !subject.trim()) {
      toast.error('Name and subject are required.');
      return;
    }
    startTransition(async () => {
      const result = await createBroadcastAction({
        name: name.trim(),
        subject: subject.trim(),
        preheader: preheader.trim() || undefined,
        segmentId: segmentId || undefined,
        templateId: templateId || undefined,
      });
      if (result.ok) {
        toast.success('Draft created.');
        router.push(`/email/broadcasts/${result.data.id}`);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <form onSubmit={onSubmit}>
      <Stack gap={5} className="max-w-2xl">
        <Stack gap={2}>
          <Label htmlFor="name">Campaign name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Spring sale"
            disabled={pending}
          />
        </Stack>
        <Stack gap={2}>
          <Label htmlFor="subject">Subject</Label>
          <Input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="20% off this week"
            disabled={pending}
          />
        </Stack>
        <Stack gap={2}>
          <Label htmlFor="preheader">Preheader</Label>
          <Input
            id="preheader"
            value={preheader}
            onChange={(e) => setPreheader(e.target.value)}
            placeholder="Inbox preview line"
            disabled={pending}
          />
        </Stack>

        <Stack gap={2}>
          <Label htmlFor="segment">Audience (CRM segment)</Label>
          {segments.length === 0 ? (
            <Text size="sm" variant="muted">
              No segments found. Create one in the CRM module to target an audience.
            </Text>
          ) : (
            <Select value={segmentId} onValueChange={setSegmentId} disabled={pending}>
              <SelectTrigger id="segment" className="w-full">
                <SelectValue placeholder="Choose a segment" />
              </SelectTrigger>
              <SelectContent>
                {segments.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Stack>

        <Stack gap={2}>
          <Label htmlFor="template">Template</Label>
          {templates.length === 0 ? (
            <Text size="sm" variant="muted">
              No marketing templates yet.{' '}
              <Link href="/email/templates/new" className="underline">
                Create one
              </Link>{' '}
              to use as the body.
            </Text>
          ) : (
            <Select value={templateId} onValueChange={setTemplateId} disabled={pending}>
              <SelectTrigger id="template" className="w-full">
                <SelectValue placeholder="Choose a template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Stack>

        <Stack direction="row" gap={2}>
          <Button type="submit" color="module" loading={pending} disabled={pending}>
            Create draft
          </Button>
        </Stack>
      </Stack>
    </form>
  );
}
