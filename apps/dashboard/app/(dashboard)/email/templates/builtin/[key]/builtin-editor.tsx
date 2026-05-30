'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Input, Label, Stack, Text, Textarea, toast } from '@sparx/ui';

import { saveBuiltinOverrideAction } from '../../actions';
import type { BuiltinTemplateView } from '../../../_lib/types';

export function BuiltinEditor({ view }: { view: BuiltinTemplateView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [subject, setSubject] = useState(view.subject);
  const [intro, setIntro] = useState(view.intro ?? '');
  const [outro, setOutro] = useState(view.outro ?? '');

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveBuiltinOverrideAction(view.key, {
        subject: subject.trim(),
        intro: intro.trim(),
        outro: outro.trim(),
      });
      if (result.ok) {
        toast.success('Template saved.');
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <form onSubmit={onSubmit}>
      <Stack gap={5}>
        <Stack gap={2}>
          <Label htmlFor="subject">Subject</Label>
          <Input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={pending}
          />
        </Stack>

        {view.supportsSlots ? (
          <>
            <Stack gap={2}>
              <Label htmlFor="intro">Intro message</Label>
              <Textarea
                id="intro"
                value={intro}
                onChange={(e) => setIntro(e.target.value)}
                placeholder="Optional line shown near the top of the email."
                rows={2}
                disabled={pending}
              />
            </Stack>
            <Stack gap={2}>
              <Label htmlFor="outro">Outro message</Label>
              <Textarea
                id="outro"
                value={outro}
                onChange={(e) => setOutro(e.target.value)}
                placeholder="Optional closing line."
                rows={2}
                disabled={pending}
              />
            </Stack>
          </>
        ) : null}

        <Stack gap={2}>
          <Label>Available variables</Label>
          <Stack direction="row" gap={1} className="flex-wrap">
            {view.variables.map((v) => (
              <Badge key={v} variant="outline">{`{{${v}}}`}</Badge>
            ))}
          </Stack>
          <Text size="sm" variant="muted">
            Structure and content come from the platform; you control the subject, intro/outro, and
            branding (set in Settings &amp; Sending domains).
          </Text>
        </Stack>

        <Stack direction="row" gap={2}>
          <Button type="submit" variant="module" loading={pending} disabled={pending}>
            Save template
          </Button>
        </Stack>
      </Stack>
    </form>
  );
}
