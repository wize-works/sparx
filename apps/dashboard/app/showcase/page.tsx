'use client';

import * as React from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  ALL_COLOR_KEYS,
  Alert,
  Avatar,
  Badge,
  Button,
  ButtonGroup,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Code,
  COLOR_KEYS,
  Container,
  Divider,
  Grid,
  Heading,
  Input,
  Kbd,
  Label,
  MODULE_COLOR_KEYS,
  ModuleProvider,
  Progress,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider,
  Stack,
  StatusDot,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tag,
  Text,
  Textarea,
  Toaster,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
  type ColorKey,
  type SparxModule,
} from '@sparx/ui';
import { Check, ChevronDown, Info, Plus, Settings, Trash2, TriangleAlert } from 'lucide-react';

const TREATMENTS = ['solid', 'soft', 'outline', 'dashed', 'ghost', 'link'] as const;
const CHIP_TREATMENTS = ['solid', 'soft', 'outline', 'dashed'] as const;
const SIZES = ['xs', 'sm', 'md', 'lg', 'xl'] as const;
const SHAPES = ['default', 'wide', 'block', 'square', 'circle'] as const;

export default function Showcase() {
  return (
    <>
      <Toaster />
      <Container size="xl">
        <Stack gap={10} className="py-10">
          <Hero />
          <PaletteSection />
          <ButtonMatrixSection />
          <ButtonSizeShapeSection />
          <ButtonGroupSection />
          <ChipMatrixSection />
          <AlertSection />
          <FeedbackSection />
          <ModuleColorSection />
          <ControlsSection />
          <InputsSection />
          <TabsSection />
          <AccordionSection />
        </Stack>
      </Container>
    </>
  );
}

// ── Hero ────────────────────────────────────────────────────────
function Hero() {
  return (
    <Stack direction="row" align="center" justify="between" wrap gap={4}>
      <Stack gap={2}>
        <Stack direction="row" align="center" gap={2}>
          <Heading level={1}>@sparx/ui Variant System</Heading>
          <Badge color="primary">v2</Badge>
        </Stack>
        <Text variant="muted">
          The multi-axis API from <Code>docs/35</Code>: <Code>color × variant × size × shape</Code>.
          Every cell below is a real component — if one is missing it&rsquo;s a gap.
        </Text>
      </Stack>
      <Stack direction="row" align="center" gap={3}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Avatar size="md" alt="Brandon Korous" />
          </TooltipTrigger>
          <TooltipContent>Brandon Korous</TooltipContent>
        </Tooltip>
      </Stack>
    </Stack>
  );
}

// ── Palette ─────────────────────────────────────────────────────
function Swatch({ color }: { color: ColorKey }) {
  return (
    <Stack gap={1} align="center">
      <span className={`sx-c-${color} h-12 w-full rounded-md bg-[var(--c-bg)]`} />
      <Text size="xs" variant="muted">
        {color}
      </Text>
    </Stack>
  );
}

function PaletteSection() {
  return (
    <Section
      title="Palette"
      description="Semantic slots + per-module brand colors. Each is a role-var class backing the color axis; custom theme colors override the same vars."
    >
      <Stack gap={4}>
        <Card>
          <Stack gap={2}>
            <Text size="sm" weight="medium">
              Semantic
            </Text>
            <Grid cols={3} mdCols={5} lgCols={9} gap={3}>
              {COLOR_KEYS.map((c) => (
                <Swatch key={c} color={c} />
              ))}
            </Grid>
          </Stack>
        </Card>
        <Card>
          <Stack gap={2}>
            <Text size="sm" weight="medium">
              Module
            </Text>
            <Grid cols={2} mdCols={4} lgCols={8} gap={3}>
              {MODULE_COLOR_KEYS.map((c) => (
                <Swatch key={c} color={c} />
              ))}
            </Grid>
          </Stack>
        </Card>
      </Stack>
    </Section>
  );
}

// ── Button matrix: color × variant ──────────────────────────────
function ButtonMatrixSection() {
  return (
    <Section
      title="Buttons — color × variant"
      description="Every semantic + module color across all six treatments. solid · soft · outline · dashed · ghost · link."
    >
      <Card padding="none" className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="p-3 text-left text-xs font-medium text-[var(--color-text-tertiary)]">
                color
              </th>
              {TREATMENTS.map((t) => (
                <th
                  key={t}
                  className="p-3 text-left text-xs font-medium text-[var(--color-text-tertiary)]"
                >
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ALL_COLOR_KEYS.map((color) => (
              <tr key={color} className="border-t border-[var(--color-border-default)]">
                <td className="p-3 text-xs text-[var(--color-text-secondary)]">{color}</td>
                {TREATMENTS.map((variant) => (
                  <td key={variant} className="p-2">
                    <Button color={color} variant={variant} size="sm">
                      {color}
                    </Button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </Section>
  );
}

// ── Button sizes / shapes / states ──────────────────────────────
function ButtonSizeShapeSection() {
  return (
    <Section
      title="Buttons — size, shape & state"
      description="Sizes xs–xl, geometry shapes (wide/block/square/circle), plus loading and icons."
    >
      <Card>
        <Stack gap={5}>
          <Stack direction="row" gap={2} align="center" wrap>
            {SIZES.map((size) => (
              <Button key={size} size={size}>
                {size}
              </Button>
            ))}
          </Stack>
          <Divider />
          <Stack direction="row" gap={3} align="center" wrap>
            {SHAPES.filter((s) => s !== 'block').map((shape) => (
              <Button key={shape} shape={shape} color="primary">
                {shape === 'square' || shape === 'circle' ? (
                  <Settings className="h-4 w-4" />
                ) : (
                  shape
                )}
              </Button>
            ))}
            <span className="w-48">
              <Button shape="block" color="primary">
                block
              </Button>
            </span>
          </Stack>
          <Divider />
          <Stack direction="row" gap={2} align="center" wrap>
            <Button loading>Saving…</Button>
            <Button leftIcon={<Plus className="h-4 w-4" />}>New</Button>
            <Button
              rightIcon={<ChevronDown className="h-4 w-4" />}
              variant="outline"
              color="neutral"
            >
              Menu
            </Button>
            <Button color="danger" leftIcon={<Trash2 className="h-4 w-4" />} variant="soft">
              Delete
            </Button>
            <Button disabled>Disabled</Button>
          </Stack>
        </Stack>
      </Card>
    </Section>
  );
}

function ButtonGroupSection() {
  const [active, setActive] = React.useState('day');
  return (
    <Section
      title="ButtonGroup"
      description="Joined / segmented buttons. Children collapse their shared inner radii and borders."
    >
      <Card>
        <Stack gap={4}>
          <ButtonGroup>
            {['day', 'week', 'month'].map((v) => (
              <Button
                key={v}
                color={active === v ? 'primary' : 'neutral'}
                variant={active === v ? 'solid' : 'outline'}
                size="sm"
                onClick={() => setActive(v)}
              >
                {v}
              </Button>
            ))}
          </ButtonGroup>
          <ButtonGroup orientation="vertical" className="w-40">
            <Button variant="outline" color="neutral" size="sm">
              Top
            </Button>
            <Button variant="outline" color="neutral" size="sm">
              Middle
            </Button>
            <Button variant="outline" color="neutral" size="sm">
              Bottom
            </Button>
          </ButtonGroup>
        </Stack>
      </Card>
    </Section>
  );
}

// ── Badge + Tag matrices ────────────────────────────────────────
function ChipMatrixSection() {
  const [tags, setTags] = React.useState<ColorKey[]>(['primary', 'success', 'warning', 'danger']);
  return (
    <Section
      title="Badges & Tags — color × variant"
      description="Chip treatments: solid · soft · outline · dashed. Tags add an inline remove button."
    >
      <Stack gap={4}>
        <Card padding="none" className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="p-3 text-left text-xs font-medium text-[var(--color-text-tertiary)]">
                  color
                </th>
                {CHIP_TREATMENTS.map((t) => (
                  <th
                    key={t}
                    className="p-3 text-left text-xs font-medium text-[var(--color-text-tertiary)]"
                  >
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COLOR_KEYS.map((color) => (
                <tr key={color} className="border-t border-[var(--color-border-default)]">
                  <td className="p-3 text-xs text-[var(--color-text-secondary)]">{color}</td>
                  {CHIP_TREATMENTS.map((variant) => (
                    <td key={variant} className="p-2">
                      <Badge color={color} variant={variant}>
                        {color}
                      </Badge>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <Stack gap={3}>
            <Text size="sm" weight="medium">
              Tags (removable)
            </Text>
            <Stack direction="row" gap={2} wrap>
              {tags.map((t) => (
                <Tag key={t} color={t} onRemove={() => setTags((xs) => xs.filter((x) => x !== t))}>
                  {t}
                </Tag>
              ))}
              {tags.length === 0 && (
                <Text size="xs" variant="muted">
                  All tags cleared.
                </Text>
              )}
            </Stack>
          </Stack>
        </Card>
      </Stack>
    </Section>
  );
}

// ── Alerts ──────────────────────────────────────────────────────
const ALERT_ICON: Partial<Record<ColorKey, React.ReactNode>> = {
  info: <Info className="h-4 w-4" />,
  success: <Check className="h-4 w-4" />,
  warning: <TriangleAlert className="h-4 w-4" />,
  danger: <TriangleAlert className="h-4 w-4" />,
};

function AlertSection() {
  return (
    <Section
      title="Alerts"
      description="Inline status banners. soft · solid · outline treatments, color-bearing, dismissible."
    >
      <Stack gap={3}>
        {(['info', 'success', 'warning', 'danger'] as const).map((color) => (
          <Alert
            key={color}
            color={color}
            icon={ALERT_ICON[color]}
            title={`${color.charAt(0).toUpperCase()}${color.slice(1)} alert`}
            onDismiss={() => toast(`Dismissed ${color}`)}
          >
            This is a {color} alert backed by the <Code>{`--c-*`}</Code> role vars.
          </Alert>
        ))}
        <Stack direction="row" gap={3} wrap>
          <Alert color="info" variant="outline" className="flex-1">
            Outline treatment.
          </Alert>
          <Alert color="success" variant="solid" className="flex-1">
            Solid treatment.
          </Alert>
        </Stack>
      </Stack>
    </Section>
  );
}

// ── Progress + StatusDot + Kbd ──────────────────────────────────
function FeedbackSection() {
  const [pct, setPct] = React.useState(42);
  return (
    <Section
      title="Progress, status & keys"
      description="Determinate + indeterminate progress, status dots, and Kbd hints."
    >
      <Card>
        <Stack gap={5}>
          <Stack gap={3}>
            {(['primary', 'success', 'warning', 'danger'] as const).map((c) => (
              <Progress key={c} color={c} value={pct} label={`${c} progress`} />
            ))}
            <Progress color="info" value={null} label="indeterminate" />
            <Stack direction="row" gap={2} align="center">
              <Button
                size="xs"
                variant="outline"
                color="neutral"
                onClick={() => setPct((p) => Math.max(0, p - 10))}
              >
                −10
              </Button>
              <Button
                size="xs"
                variant="outline"
                color="neutral"
                onClick={() => setPct((p) => Math.min(100, p + 10))}
              >
                +10
              </Button>
              <Text size="xs" variant="muted">
                {pct}%
              </Text>
            </Stack>
          </Stack>
          <Divider />
          <Stack direction="row" gap={5} align="center" wrap>
            <Stack direction="row" gap={2} align="center">
              <StatusDot color="success" pulse label="online" />
              <Text size="sm">Online</Text>
            </Stack>
            <Stack direction="row" gap={2} align="center">
              <StatusDot color="warning" label="idle" />
              <Text size="sm">Idle</Text>
            </Stack>
            <Stack direction="row" gap={2} align="center">
              <StatusDot color="neutral" label="offline" />
              <Text size="sm">Offline</Text>
            </Stack>
            <Stack direction="row" gap={1} align="center">
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
              <Text size="sm" variant="muted">
                open palette
              </Text>
            </Stack>
          </Stack>
        </Stack>
      </Card>
    </Section>
  );
}

// ── Module color context ────────────────────────────────────────
const MODULES: { id: SparxModule; label: string; metric: string }[] = [
  { id: 'commerce', label: 'Commerce', metric: '$12,408' },
  { id: 'cms', label: 'CMS', metric: '42 pages' },
  { id: 'crm', label: 'CRM', metric: '186 contacts' },
  { id: 'email', label: 'Email', metric: '94.2% open' },
];

function ModuleColorSection() {
  return (
    <Section
      title="Module color context"
      description={
        'color="module" tracks the wrapping ModuleProvider; the named module colors (color="commerce") are addressable directly.'
      }
    >
      <Grid cols={1} mdCols={2} lgCols={4} gap={4}>
        {MODULES.map((m) => (
          <ModuleProvider key={m.id} module={m.id}>
            <Card variant="module">
              <CardHeader>
                <CardDescription>{m.label}</CardDescription>
                <CardTitle>{m.metric}</CardTitle>
              </CardHeader>
              <CardContent>
                <Badge color="module">Active</Badge>
              </CardContent>
              <CardFooter>
                <Button color="module" variant="outline" size="sm">
                  Open
                </Button>
                <Button color="module" size="sm">
                  Configure
                </Button>
              </CardFooter>
            </Card>
          </ModuleProvider>
        ))}
      </Grid>
    </Section>
  );
}

// ── Form controls ───────────────────────────────────────────────
function ControlsSection() {
  const [checks, setChecks] = React.useState<Record<string, boolean>>({});
  const [on, setOn] = React.useState(true);
  const [radio, setRadio] = React.useState('primary');
  const [val, setVal] = React.useState<number[]>([50]);
  const colors = ['primary', 'success', 'warning', 'danger', 'commerce'] as const;

  return (
    <Section
      title="Controls — color on state"
      description="Checkbox, Switch, Radio and Slider take a color for their active state."
    >
      <Card>
        <Grid cols={1} mdCols={2} gap={6}>
          <Stack gap={3}>
            <Text size="sm" weight="medium">
              Checkbox
            </Text>
            <Stack direction="row" gap={4} wrap>
              {colors.map((c) => (
                <Stack key={c} direction="row" align="center" gap={2}>
                  <Checkbox
                    color={c}
                    checked={checks[c] ?? true}
                    onCheckedChange={(v) => setChecks((s) => ({ ...s, [c]: v === true }))}
                  />
                  <Label>{c}</Label>
                </Stack>
              ))}
            </Stack>
          </Stack>
          <Stack gap={3}>
            <Text size="sm" weight="medium">
              Switch
            </Text>
            <Stack direction="row" gap={4} wrap align="center">
              {colors.map((c) => (
                <Switch key={c} color={c} checked={on} onCheckedChange={setOn} />
              ))}
            </Stack>
          </Stack>
          <Stack gap={3}>
            <Text size="sm" weight="medium">
              Radio
            </Text>
            <RadioGroup value={radio} onValueChange={setRadio}>
              {colors.map((c) => (
                <Stack key={c} direction="row" align="center" gap={2}>
                  <RadioGroupItem value={c} id={`r-${c}`} color={c} />
                  <Label htmlFor={`r-${c}`}>{c}</Label>
                </Stack>
              ))}
            </RadioGroup>
          </Stack>
          <Stack gap={3}>
            <Text size="sm" weight="medium">
              Slider
            </Text>
            <Slider color="commerce" value={val} onValueChange={setVal} max={100} step={1} />
            <Text size="xs" variant="muted">
              {val[0]}%
            </Text>
          </Stack>
        </Grid>
      </Card>
    </Section>
  );
}

// ── Inputs ──────────────────────────────────────────────────────
function InputsSection() {
  return (
    <Section
      title="Inputs — size & state"
      description="Sizes sm/md/lg, plus default / error / success validation states."
    >
      <Card>
        <Grid cols={1} mdCols={2} gap={6}>
          <Stack gap={2}>
            <Label htmlFor="i-sm">Small</Label>
            <Input id="i-sm" size="sm" placeholder="sm" />
          </Stack>
          <Stack gap={2}>
            <Label htmlFor="i-lg">Large</Label>
            <Input id="i-lg" size="lg" placeholder="lg" />
          </Stack>
          <Stack gap={2}>
            <Label htmlFor="i-err">Error</Label>
            <Input id="i-err" variant="error" defaultValue="not-an-email" />
          </Stack>
          <Stack gap={2}>
            <Label htmlFor="i-ok">Success</Label>
            <Input id="i-ok" variant="success" defaultValue="looks good" />
          </Stack>
          <Stack gap={2} className="md:col-span-2">
            <Label>Theme</Label>
            <Select>
              <SelectTrigger>
                <SelectValue placeholder="Pick a theme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="industrial">Industrial</SelectItem>
                <SelectItem value="minimal">Minimal</SelectItem>
                <SelectItem value="bold">Bold</SelectItem>
              </SelectContent>
            </Select>
          </Stack>
          <Stack gap={2} className="md:col-span-2">
            <Label htmlFor="ta">Notes</Label>
            <Textarea id="ta" placeholder="Tell customers about your business…" />
          </Stack>
        </Grid>
      </Card>
    </Section>
  );
}

// ── Tabs (sizes) ────────────────────────────────────────────────
function TabsSection() {
  return (
    <Section
      title="Tabs — variant × size"
      description="Underline + pills, now with sm/md/lg sizes."
    >
      <Stack gap={6}>
        <Card>
          <Tabs defaultValue="a">
            <TabsList size="lg">
              <TabsTrigger value="a">Overview</TabsTrigger>
              <TabsTrigger value="b">Orders</TabsTrigger>
              <TabsTrigger value="c">Customers</TabsTrigger>
            </TabsList>
            <TabsContent value="a">
              <Text>Underline, large.</Text>
            </TabsContent>
            <TabsContent value="b">
              <Text>Orders.</Text>
            </TabsContent>
            <TabsContent value="c">
              <Text>Customers.</Text>
            </TabsContent>
          </Tabs>
        </Card>
        <Card>
          <Tabs defaultValue="day">
            <TabsList variant="pills" size="sm">
              <TabsTrigger value="day">Day</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="month">Month</TabsTrigger>
            </TabsList>
            <TabsContent value="day">
              <Text>Pills, small.</Text>
            </TabsContent>
            <TabsContent value="week">
              <Text>Week.</Text>
            </TabsContent>
            <TabsContent value="month">
              <Text>Month.</Text>
            </TabsContent>
          </Tabs>
        </Card>
      </Stack>
    </Section>
  );
}

// ── Accordion ───────────────────────────────────────────────────
function AccordionSection() {
  return (
    <Section title="Accordion" description="Collapsible sections — bordered & separated variants.">
      <Grid cols={1} mdCols={2} gap={4}>
        <Accordion type="single" defaultValue={['a']} variant="bordered">
          {['a', 'b', 'c'].map((v) => (
            <AccordionItem key={v} value={v}>
              <AccordionTrigger>Section {v.toUpperCase()}</AccordionTrigger>
              <AccordionContent>
                Bordered accordion content for section {v.toUpperCase()}.
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        <Accordion type="multiple" defaultValue={['x']} variant="separated">
          {['x', 'y', 'z'].map((v) => (
            <AccordionItem key={v} value={v}>
              <AccordionTrigger>Panel {v.toUpperCase()}</AccordionTrigger>
              <AccordionContent>Separated panel content for {v.toUpperCase()}.</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Grid>
    </Section>
  );
}

// ── Section helper ──────────────────────────────────────────────
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Stack gap={3}>
      <Stack gap={1}>
        <Heading level={3}>{title}</Heading>
        <Text variant="muted">{description}</Text>
      </Stack>
      {children}
    </Stack>
  );
}
