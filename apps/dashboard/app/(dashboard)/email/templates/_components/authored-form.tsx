'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Label, Stack, Text, toast } from '@sparx/ui';
import { ContentBlockEditor, type CmsDoc } from '@sparx/cms-editor';

import { archiveAuthoredAction, createAuthoredAction, updateAuthoredAction } from '../actions';

const EMPTY_DOC: CmsDoc = { type: 'doc', content: [] };

interface AuthoredFormProps {
  initial?: {
    id: string;
    name: string;
    subject: string;
    preheader: string | null;
    body: CmsDoc;
  };
}

export function AuthoredForm({ initial }: AuthoredFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(initial?.name ?? '');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [preheader, setPreheader] = useState(initial?.preheader ?? '');
  const [doc, setDoc] = useState<CmsDoc>(initial?.body ?? EMPTY_DOC);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim() || !subject.trim()) {
      toast.error('Name and subject are required.');
      return;
    }
    const payload = {
      name: name.trim(),
      subject: subject.trim(),
      preheader: preheader.trim() || null,
      body: doc,
    };

    startTransition(async () => {
      if (initial) {
        const result = await updateAuthoredAction(initial.id, payload);
        if (result.ok) {
          toast.success('Template saved.');
          router.refresh();
        } else toast.error(result.error.message);
      } else {
        const result = await createAuthoredAction({
          ...payload,
          preheader: payload.preheader ?? undefined,
        });
        if (result.ok) {
          toast.success('Template created.');
          router.push(`/email/templates/${result.data.id}`);
          router.refresh();
        } else toast.error(result.error.message);
      }
    });
  }

  function archive() {
    if (!initial) return;
    startTransition(async () => {
      const result = await archiveAuthoredAction(initial.id);
      if (result.ok) {
        toast.success('Template archived.');
        router.push('/email/templates');
        router.refresh();
      } else toast.error(result.error.message);
    });
  }

  return (
    <form onSubmit={onSubmit}>
      <Stack gap={5}>
        <Stack gap={2}>
          <Label htmlFor="name">Template name</Label>
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
            placeholder="20% off this week only"
            disabled={pending}
          />
        </Stack>
        <Stack gap={2}>
          <Label htmlFor="preheader">Preheader</Label>
          <Input
            id="preheader"
            value={preheader}
            onChange={(e) => setPreheader(e.target.value)}
            placeholder="The inbox preview line shown after the subject."
            disabled={pending}
          />
        </Stack>
        <Stack gap={2}>
          <Label>Body</Label>
          <ContentBlockEditor value={doc} onChange={setDoc} placeholder="Write your email…" />
          <Text size="sm" variant="muted">
            Rich text renders inside your branded email frame. Reorderable section blocks arrive
            with the Site Builder.
          </Text>
        </Stack>

        <Stack direction="row" gap={2}>
          <Button type="submit" variant="module" loading={pending} disabled={pending}>
            {initial ? 'Save template' : 'Create template'}
          </Button>
          {initial ? (
            <Button type="button" variant="ghost" onClick={archive} disabled={pending}>
              Archive
            </Button>
          ) : null}
        </Stack>
      </Stack>
    </form>
  );
}
