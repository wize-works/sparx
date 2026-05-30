import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Settings2 } from 'lucide-react';

import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Heading,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@sparx/ui';

import { api, type ApiRestError } from '@/lib/api-rest-client';

import { TemplateStatusBar } from './_components/template-status-bar';
import { TemplateJsonEditor } from './_components/template-json-editor';

interface ConfigurationChoice {
  key: string;
  label: string;
  variantId?: string;
  addOnVariantId?: string;
  priceDeltaCents?: number;
  metadataPayload?: Record<string, unknown>;
  swatchHex?: string;
  imageMediaId?: string;
  position: number;
}

interface ConfigurationOption {
  key: string;
  label: string;
  helpText?: string;
  type: 'single_choice' | 'multi_choice' | 'toggle' | 'text' | 'number';
  required: boolean;
  minSelections?: number;
  maxSelections?: number;
  defaultChoiceKeys: string[];
  groupHeader?: string;
  position: number;
  choices: ConfigurationChoice[];
}

interface ConfigurationRuleCondition {
  optionKey: string;
  op: 'in' | 'not_in' | 'gt' | 'lt' | 'eq';
  value: string | number | string[];
}

type ConfigurationRuleAction =
  | { kind: 'require'; optionKey: string }
  | { kind: 'hide'; optionKey: string }
  | { kind: 'show_only_choices'; optionKey: string; choiceKeys: string[] }
  | { kind: 'price_adjust'; deltaCents: number; label?: string }
  | { kind: 'add_addon'; variantId: string; quantity: number }
  | { kind: 'error'; message: string };

interface ConfigurationRule {
  name: string;
  match: 'all' | 'any';
  conditions: ConfigurationRuleCondition[];
  actions: ConfigurationRuleAction[];
  priority: number;
}

interface ConfigurationAddOn {
  variantId: string;
  defaultIncluded: boolean;
  priceOverrideCents?: number;
}

interface ConfigurationTemplateDetail {
  id: string;
  productId: string;
  productTitle: string;
  name: string;
  description: string | null;
  status: string;
  optionCount: number;
  ruleCount: number;
  addOnCount: number;
  updatedAt: string;
  layout: unknown;
  options: ConfigurationOption[];
  rules: ConfigurationRule[];
  addOns: ConfigurationAddOn[];
}

export const dynamic = 'force-dynamic';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'outline'> = {
  active: 'success',
  draft: 'outline',
  archived: 'warning',
};

interface Props {
  id: string;
}

export async function ConfiguratorTemplateDetailContent({ id }: Props) {
  let template: ConfigurationTemplateDetail;
  try {
    template = await api.get<ConfigurationTemplateDetail>(
      `/v1/commerce/configurator-templates/${id}`
    );
  } catch (err) {
    if ((err as ApiRestError).code === 'NOT_FOUND') notFound();
    throw err;
  }

  return (
    <Stack gap={6}>
      <Stack direction="row" align="end" justify="between" wrap gap={4}>
        <Stack gap={1}>
          <Stack direction="row" align="center" gap={3} wrap>
            <Settings2 className="h-5 w-5" />
            <Heading level={1}>{template.name}</Heading>
            <Badge variant={STATUS_VARIANT[template.status] ?? 'outline'}>{template.status}</Badge>
          </Stack>
          <Text size="sm" variant="muted">
            Product:{' '}
            <Link
              href={`/commerce/products/${template.productId}`}
              className="underline hover:text-[var(--module-active)]"
            >
              {template.productTitle}
            </Link>
            {template.description ? ` · ${template.description}` : ''}
          </Text>
        </Stack>
        <TemplateStatusBar templateId={template.id} status={template.status} />
      </Stack>

      <Card>
        <CardHeader>
          <Stack gap={1}>
            <Heading level={3}>Options</Heading>
            <CardDescription>
              {template.options.length} option{template.options.length === 1 ? '' : 's'} that the
              customer picks from.
            </CardDescription>
          </Stack>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Required</TableHead>
                <TableHead>Choices</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {template.options.map((o) => (
                <TableRow key={o.key}>
                  <TableCell>
                    <span className="font-mono text-xs">{o.key}</span>
                  </TableCell>
                  <TableCell>{o.label}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{o.type}</Badge>
                  </TableCell>
                  <TableCell>{o.required ? 'yes' : 'no'}</TableCell>
                  <TableCell>{o.choices.length}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Stack gap={1}>
            <Heading level={3}>Rules</Heading>
            <CardDescription>
              {template.rules.length} rule{template.rules.length === 1 ? '' : 's'} that hide/require
              options or adjust price as selections change.
            </CardDescription>
          </Stack>
        </CardHeader>
        <CardContent>
          {template.rules.length === 0 ? (
            <Text size="sm" variant="muted">
              No rules — every option is independent.
            </Text>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead>Conditions</TableHead>
                  <TableHead>Actions</TableHead>
                  <TableHead>Priority</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {template.rules.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.match}</Badge>
                    </TableCell>
                    <TableCell>{r.conditions.length}</TableCell>
                    <TableCell>{r.actions.length}</TableCell>
                    <TableCell>{r.priority}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Stack gap={1}>
            <Heading level={3}>Add-ons</Heading>
            <CardDescription>
              Optional variants that ride along with the resolved selection — e.g. installation
              kits, gift wrap.
            </CardDescription>
          </Stack>
        </CardHeader>
        <CardContent>
          {template.addOns.length === 0 ? (
            <Text size="sm" variant="muted">
              No add-ons.
            </Text>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Variant id</TableHead>
                  <TableHead>Default included</TableHead>
                  <TableHead>Price override</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {template.addOns.map((a) => (
                  <TableRow key={a.variantId}>
                    <TableCell>
                      <span className="font-mono text-xs">{a.variantId.slice(0, 8)}…</span>
                    </TableCell>
                    <TableCell>{a.defaultIncluded ? 'yes' : 'no'}</TableCell>
                    <TableCell>
                      {a.priceOverrideCents != null
                        ? `$${(a.priceOverrideCents / 100).toFixed(2)}`
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Stack gap={1}>
            <Heading level={3}>Edit definition</Heading>
            <CardDescription>
              JSON editor — paste in an updated template payload. The visual rule editor is on the
              roadmap; until then, this is the source of truth.
            </CardDescription>
          </Stack>
        </CardHeader>
        <CardContent>
          <TemplateJsonEditor
            templateId={template.id}
            initial={{
              name: template.name,
              description: template.description ?? undefined,
              layout: template.layout,
              options: template.options,
              rules: template.rules,
              addOns: template.addOns,
            }}
          />
        </CardContent>
      </Card>
    </Stack>
  );
}
