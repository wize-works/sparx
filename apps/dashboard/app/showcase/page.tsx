'use client';

import * as React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Avatar,
  Badge,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Calendar,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  Code,
  ColorPicker,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandPalette,
  CommandShortcut,
  Container,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  DataTable,
  DatePicker,
  Divider,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  EmptyState,
  FileUpload,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Grid,
  Heading,
  Input,
  Label,
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTrigger,
  ModuleProvider,
  Pagination,
  Popover,
  PopoverContent,
  PopoverTrigger,
  RadioGroup,
  RadioGroupItem,
  RichTextEditor,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sidebar,
  SidebarHeader,
  SidebarItem,
  SidebarSection,
  SidebarSectionLabel,
  Skeleton,
  Slider,
  Stack,
  Stat,
  Stepper,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tag,
  Text,
  Textarea,
  Timeline,
  TimelineDescription,
  TimelineItem,
  TimelineTime,
  TimelineTitle,
  Toaster,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
  type SparxModule,
} from '@sparx/ui';
import type { ColumnDef } from '@tanstack/react-table';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Bell,
  ChevronDown,
  Copy,
  FileText,
  Inbox,
  Layers,
  LogOut,
  Package,
  Pencil,
  Settings,
  ShoppingCart,
  Trash2,
  User,
  Users,
} from 'lucide-react';

const MODULES: { id: SparxModule; label: string; metric: string }[] = [
  { id: 'commerce', label: 'Commerce', metric: '$12,408' },
  { id: 'cms', label: 'CMS', metric: '42 pages' },
  { id: 'crm', label: 'CRM', metric: '186 contacts' },
  { id: 'email', label: 'Email', metric: '94.2% open' },
];

export default function Showcase() {
  return (
    <>
      <Toaster />
      <Container size="xl">
        <Stack gap={10} className="py-10">
          <Hero />
          <ModuleStats />
          <ButtonsSection />
          <FormPrimitivesSection />
          <FormCompositionSection />
          <PickersSection />
          <OverlaysSection />
          <TabsSection />
          <NavigationSection />
          <DataDisplaySection />
          <LoadingSection />
        </Stack>
      </Container>
    </>
  );
}

// ── Hero ────────────────────────────────────────────────────────
function Hero() {
  return (
    <Stack direction="row" align="center" justify="between">
      <Stack gap={2}>
        <Stack direction="row" align="center" gap={2}>
          <Heading level={1}>@sparx/ui Showcase</Heading>
          <Badge variant="primary">50 components</Badge>
        </Stack>
        <Text variant="muted">
          End-to-end smoke test for <Code>@sparx/ui</Code>. Every component from doc 23 §9 is
          rendered below.
        </Text>
      </Stack>
      <Stack direction="row" align="center" gap={3}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Avatar size="md" alt="Brandon Korous" />
          </TooltipTrigger>
          <TooltipContent>Brandon Korous</TooltipContent>
        </Tooltip>
        <UserMenu />
      </Stack>
    </Stack>
  );
}

function UserMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" rightIcon={<ChevronDown className="h-3.5 w-3.5" />}>
          Account
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Signed in as bkorous</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <User className="h-4 w-4" />
          Profile
          <DropdownMenuShortcut>⌘P</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Settings className="h-4 w-4" />
          Settings
          <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Module stats (existing pattern) ─────────────────────────────
function ModuleStats() {
  return (
    <Section
      title="Modules"
      description="Each card adopts its module color through ModuleProvider — zero per-card config."
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
                <Badge variant="module">Active</Badge>
              </CardContent>
              <CardFooter>
                <Button variant="module-outline" size="sm">
                  Open
                </Button>
                <Button variant="module" size="sm">
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

// ── Buttons ─────────────────────────────────────────────────────
function ButtonsSection() {
  return (
    <Section title="Buttons" description="Variants × sizes, plus loading state and icons.">
      <Card>
        <Stack gap={4}>
          <Stack direction="row" gap={2} wrap>
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="link">Link</Button>
          </Stack>
          <Stack direction="row" gap={2} align="center">
            <Button size="xs">xs</Button>
            <Button size="sm">sm</Button>
            <Button size="md">md</Button>
            <Button size="lg">lg</Button>
            <Button size="xl">xl</Button>
          </Stack>
          <Stack direction="row" gap={2} align="center">
            <Button loading>Saving…</Button>
            <Button leftIcon={<Settings className="h-4 w-4" />}>Settings</Button>
            <Button disabled>Disabled</Button>
          </Stack>
        </Stack>
      </Card>
    </Section>
  );
}

// ── Form primitives ─────────────────────────────────────────────
function FormPrimitivesSection() {
  const [enabled, setEnabled] = React.useState(true);
  const [agreed, setAgreed] = React.useState(false);
  const [color, setColor] = React.useState('marketing');
  const [opacity, setOpacity] = React.useState<number[]>([42]);

  return (
    <Section title="Form primitives" description="Inputs, toggles, selects, radios, sliders.">
      <Card>
        <Grid cols={1} mdCols={2} gap={6}>
          <Stack gap={2}>
            <Label htmlFor="store-name" required>
              Store name
            </Label>
            <Input id="store-name" placeholder="Gillett Diesel Service" />
          </Stack>

          <Stack gap={2}>
            <Label htmlFor="support-email">Support email</Label>
            <Input id="support-email" variant="error" defaultValue="not-an-email" />
          </Stack>

          <Stack gap={2} className="md:col-span-2">
            <Label htmlFor="about">About</Label>
            <Textarea id="about" placeholder="Tell customers about your business…" />
          </Stack>

          <Stack gap={2}>
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

          <Stack gap={2}>
            <Label>Newsletter list</Label>
            <RadioGroup value={color} onValueChange={setColor}>
              {['marketing', 'transactional', 'announcements'].map((v) => (
                <Stack key={v} direction="row" align="center" gap={2}>
                  <RadioGroupItem value={v} id={`list-${v}`} />
                  <Label htmlFor={`list-${v}`}>{v}</Label>
                </Stack>
              ))}
            </RadioGroup>
          </Stack>

          <Stack gap={2} className="md:col-span-2">
            <Stack direction="row" align="center" justify="between">
              <Label>Brand fade</Label>
              <Text size="xs" variant="muted">
                {opacity[0]}%
              </Text>
            </Stack>
            <Slider value={opacity} onValueChange={setOpacity} max={100} step={1} />
          </Stack>

          <Stack direction="row" align="center" justify="between" gap={3}>
            <Label>Send weekly digest</Label>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </Stack>

          <Stack direction="row" align="center" gap={2}>
            <Checkbox
              id="agree"
              checked={agreed}
              onCheckedChange={(v) => setAgreed(v === true)}
            />
            <Label htmlFor="agree">I agree to the platform terms</Label>
          </Stack>
        </Grid>
      </Card>
    </Section>
  );
}

// ── Form composition (RHF + Zod) ────────────────────────────────
const merchantSchema = z.object({
  name: z.string().min(2, 'At least 2 characters'),
  email: z.string().email('Enter a valid email'),
  notes: z.string().max(280, 'Keep it under 280 chars').optional(),
});
type MerchantValues = z.infer<typeof merchantSchema>;

function FormCompositionSection() {
  const form = useForm<MerchantValues>({
    resolver: zodResolver(merchantSchema),
    defaultValues: { name: '', email: '', notes: '' },
  });

  return (
    <Section
      title="Form composition"
      description="React Hook Form + Zod via Form/FormField. Submit empty to see validation."
    >
      <Card>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => {
              toast.success(`Saved ${v.name}`);
            })}
            noValidate
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Merchant name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormDescription>Shown to customers at checkout.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Email</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Internal notes</FormLabel>
                  <FormControl>
                    <Textarea {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Stack direction="row" justify="end" gap={2}>
              <Button type="button" variant="ghost" onClick={() => form.reset()}>
                Reset
              </Button>
              <Button type="submit">Save merchant</Button>
            </Stack>
          </form>
        </Form>
      </Card>
    </Section>
  );
}

// ── Pickers ─────────────────────────────────────────────────────
function PickersSection() {
  const [date, setDate] = React.useState<Date | undefined>(new Date(2026, 4, 27));
  const [color, setColor] = React.useState('#14B8A6');
  const [body, setBody] = React.useState('<p>Sparx is <strong>live</strong>.</p>');

  return (
    <Section
      title="Pickers & editors"
      description="DatePicker, ColorPicker, FileUpload, Calendar, RichTextEditor."
    >
      <Stack gap={4}>
        <Card>
          <Grid cols={1} mdCols={2} gap={6}>
            <Stack gap={2}>
              <Label>Launch date</Label>
              <DatePicker value={date} onChange={setDate} />
            </Stack>
            <Stack gap={2}>
              <Label>Accent color</Label>
              <ColorPicker value={color} onChange={setColor} />
            </Stack>
            <Stack gap={2} className="md:col-span-2">
              <Label>Logo</Label>
              <FileUpload accept="image/*" maxSize={2 * 1024 * 1024} />
              <Text size="xs" variant="muted">
                Max 2 MB, image files only.
              </Text>
            </Stack>
          </Grid>
        </Card>

        <Card>
          <Stack gap={3}>
            <Stack gap={1}>
              <Heading level={4}>Calendar (standalone)</Heading>
              <Text size="xs" variant="muted">
                Inline use — DatePicker wraps this in a Popover.
              </Text>
            </Stack>
            <Calendar mode="single" selected={date} onSelect={setDate} />
          </Stack>
        </Card>

        <Card>
          <Stack gap={2}>
            <Label>Page body</Label>
            <RichTextEditor value={body} onChange={setBody} />
          </Stack>
        </Card>
      </Stack>
    </Section>
  );
}

// ── Overlays ────────────────────────────────────────────────────
function OverlaysSection() {
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  return (
    <Section
      title="Overlays"
      description="Modal, AlertDialog, Drawer, Popover, Tooltip, ContextMenu, Toast, CommandPalette."
    >
      <Card>
        <Stack direction="row" gap={3} wrap>
          <Modal>
            <ModalTrigger asChild>
              <Button variant="primary">Modal</Button>
            </ModalTrigger>
            <ModalContent size="md">
              <ModalHeader>
                <ModalTitle>Delete tenant?</ModalTitle>
                <ModalDescription>
                  Marks the tenant for deletion. Data retained 30 days.
                </ModalDescription>
              </ModalHeader>
              <ModalFooter>
                <Button variant="ghost">Cancel</Button>
                <Button variant="danger">Delete</Button>
              </ModalFooter>
            </ModalContent>
          </Modal>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="danger">AlertDialog</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Permanently delete all orders?</AlertDialogTitle>
                <AlertDialogDescription>
                  This cannot be undone. This is the destructive-confirm flavor.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction>Delete forever</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Drawer>
            <DrawerTrigger asChild>
              <Button variant="secondary">Drawer</Button>
            </DrawerTrigger>
            <DrawerContent side="right">
              <DrawerHeader>
                <DrawerTitle>Order #1042</DrawerTitle>
                <DrawerDescription>Slide-in panel pattern for detail views.</DrawerDescription>
              </DrawerHeader>
              <DrawerBody>
                <Text variant="muted">
                  Body content fills the available space and scrolls independently.
                </Text>
              </DrawerBody>
              <DrawerFooter>
                <Button variant="primary">Mark fulfilled</Button>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="secondary">Popover</Button>
            </PopoverTrigger>
            <PopoverContent>
              <Stack gap={2}>
                <Text weight="medium">Quick action</Text>
                <Text size="xs" variant="muted">
                  Popovers anchor to their trigger.
                </Text>
              </Stack>
            </PopoverContent>
          </Popover>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost">Tooltip</Button>
            </TooltipTrigger>
            <TooltipContent>This is a tooltip</TooltipContent>
          </Tooltip>

          <ContextMenu>
            <ContextMenuTrigger asChild>
              <Button variant="ghost">Right-click for ContextMenu</Button>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem>
                <Copy className="h-4 w-4" />
                Copy
              </ContextMenuItem>
              <ContextMenuItem>
                <Pencil className="h-4 w-4" />
                Rename
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem>
                <Trash2 className="h-4 w-4" />
                Delete
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>

          <Button
            variant="secondary"
            onClick={() =>
              toast.success('Saved', { description: 'Sonner-powered toast via @sparx/ui.' })
            }
          >
            Fire Toast
          </Button>

          <Button variant="primary" onClick={() => setPaletteOpen(true)}>
            CommandPalette (⌘K)
          </Button>
        </Stack>
      </Card>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen}>
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Pages">
            <CommandItem>
              <Package className="h-4 w-4" />
              Products
              <CommandShortcut>⌘1</CommandShortcut>
            </CommandItem>
            <CommandItem>
              <ShoppingCart className="h-4 w-4" />
              Orders
              <CommandShortcut>⌘2</CommandShortcut>
            </CommandItem>
            <CommandItem>
              <Users className="h-4 w-4" />
              Customers
              <CommandShortcut>⌘3</CommandShortcut>
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Account">
            <CommandItem>
              <Settings className="h-4 w-4" />
              Settings
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandPalette>
    </Section>
  );
}

// ── Tabs ────────────────────────────────────────────────────────
function TabsSection() {
  return (
    <Section title="Tabs" description="Default underline + pills variants.">
      <Stack gap={6}>
        <Card>
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="orders">Orders</TabsTrigger>
              <TabsTrigger value="customers">Customers</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <Text>Overview content.</Text>
            </TabsContent>
            <TabsContent value="orders">
              <Text>Orders content.</Text>
            </TabsContent>
            <TabsContent value="customers">
              <Text>Customers content.</Text>
            </TabsContent>
          </Tabs>
        </Card>
        <Card>
          <Tabs defaultValue="day">
            <TabsList variant="pills">
              <TabsTrigger value="day">Day</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="month">Month</TabsTrigger>
            </TabsList>
            <TabsContent value="day">
              <Text>Day view.</Text>
            </TabsContent>
            <TabsContent value="week">
              <Text>Week view.</Text>
            </TabsContent>
            <TabsContent value="month">
              <Text>Month view.</Text>
            </TabsContent>
          </Tabs>
        </Card>
      </Stack>
    </Section>
  );
}

// ── Navigation ──────────────────────────────────────────────────
function NavigationSection() {
  const [page, setPage] = React.useState(3);

  return (
    <Section
      title="Navigation"
      description="Sidebar shell, Breadcrumb, Pagination, Stepper."
    >
      <Stack gap={4}>
        <Card padding="none" className="overflow-hidden">
          <Stack direction="row" gap={0} className="h-72">
            <Sidebar>
              <SidebarHeader>
                <Text weight="medium">Acme Industrial</Text>
                <Text size="xs" variant="muted">
                  Premium plan
                </Text>
              </SidebarHeader>
              <SidebarSection>
                <SidebarSectionLabel>Workspace</SidebarSectionLabel>
                <SidebarItem icon={<Inbox className="h-4 w-4" />} active>
                  Inbox
                </SidebarItem>
                <SidebarItem icon={<Package className="h-4 w-4" />}>Products</SidebarItem>
                <SidebarItem icon={<ShoppingCart className="h-4 w-4" />}>Orders</SidebarItem>
                <SidebarItem icon={<Users className="h-4 w-4" />}>Customers</SidebarItem>
              </SidebarSection>
            </Sidebar>
            <div className="flex-1 p-6">
              <Text size="sm" variant="muted">
                The active item adopts <Code>--module-active-tint</Code>.
              </Text>
            </div>
          </Stack>
        </Card>

        <Card>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">Home</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/orders">Orders</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>#1042</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </Card>

        <Card>
          <Stack direction="row" justify="between" align="center">
            <Text size="sm" variant="muted">
              Currently on page {page}
            </Text>
            <Pagination page={page} pageCount={12} onPageChange={setPage} />
          </Stack>
        </Card>

        <Card>
          <Stepper
            current={1}
            steps={[
              { label: 'Business info' },
              { label: 'Theme' },
              { label: 'First product' },
              { label: 'Domain' },
              { label: 'Payments' },
            ]}
          />
        </Card>
      </Stack>
    </Section>
  );
}

// ── Data display ────────────────────────────────────────────────
interface ProductRow {
  id: string;
  name: string;
  sku: string;
  stock: number;
  price: number;
}

const PRODUCTS: ProductRow[] = [
  { id: '1', name: 'Fuel filter', sku: 'FF-2003', stock: 124, price: 22.5 },
  { id: '2', name: 'Gasket set', sku: 'GS-110', stock: 38, price: 47.99 },
  { id: '3', name: 'Hydraulic hose', sku: 'HH-5C', stock: 7, price: 89.0 },
  { id: '4', name: 'Air intake', sku: 'AI-22', stock: 0, price: 154.5 },
];

const COLUMNS: ColumnDef<ProductRow>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'sku', header: 'SKU' },
  { accessorKey: 'stock', header: 'Stock' },
  {
    accessorKey: 'price',
    header: 'Price',
    cell: ({ row }) => `$${row.original.price.toFixed(2)}`,
  },
];

function DataDisplaySection() {
  const [tags, setTags] = React.useState(['active', 'wholesale', 'gillett-diesel']);

  return (
    <Section
      title="Data display"
      description="Stat, Tag, Timeline, EmptyState, Table, DataTable, ScrollArea."
    >
      <Stack gap={4}>
        <Grid cols={1} mdCols={4} gap={4}>
          <Stat
            label="Revenue"
            value="$12,408"
            delta={{ value: '+12.4%', trend: 'up' }}
            icon={<ShoppingCart className="h-4 w-4" />}
          />
          <Stat
            label="Orders"
            value="184"
            delta={{ value: '+8 today', trend: 'up' }}
            icon={<Package className="h-4 w-4" />}
          />
          <Stat
            label="Refunds"
            value="3"
            delta={{ value: '-1', trend: 'down' }}
            icon={<Bell className="h-4 w-4" />}
          />
          <Stat
            label="Storage"
            value="48 GB"
            delta={{ value: 'of 100', trend: 'neutral' }}
            icon={<Layers className="h-4 w-4" />}
          />
        </Grid>

        <Card>
          <Stack gap={3}>
            <Heading level={4}>Filters</Heading>
            <Stack direction="row" gap={2} wrap>
              {tags.map((t) => (
                <Tag key={t} variant="primary" onRemove={() => setTags((xs) => xs.filter((x) => x !== t))}>
                  {t}
                </Tag>
              ))}
              {tags.length === 0 && (
                <Text size="xs" variant="muted">
                  All filters cleared.
                </Text>
              )}
            </Stack>
          </Stack>
        </Card>

        <Grid cols={1} mdCols={2} gap={4}>
          <Card>
            <Stack gap={3}>
              <Heading level={4}>Recent activity</Heading>
              <Timeline>
                <TimelineItem>
                  <TimelineTitle>Order #1042 placed</TimelineTitle>
                  <TimelineDescription>3 items, $148.20</TimelineDescription>
                  <TimelineTime dateTime="2026-05-27T10:00:00Z">just now</TimelineTime>
                </TimelineItem>
                <TimelineItem>
                  <TimelineTitle>Payment received</TimelineTitle>
                  <TimelineDescription>Stripe payment_intent #pi_3O…</TimelineDescription>
                  <TimelineTime dateTime="2026-05-27T09:55:00Z">5 minutes ago</TimelineTime>
                </TimelineItem>
                <TimelineItem showConnector={false}>
                  <TimelineTitle>Customer created</TimelineTitle>
                  <TimelineDescription>acme@example.com</TimelineDescription>
                  <TimelineTime dateTime="2026-05-27T09:40:00Z">20 minutes ago</TimelineTime>
                </TimelineItem>
              </Timeline>
            </Stack>
          </Card>

          <Card>
            <EmptyState
              icon={<FileText className="h-5 w-5" />}
              title="No drafts yet"
              description="Drafts you save will appear here before they're published."
              action={
                <Button variant="primary" size="sm" leftIcon={<Pencil className="h-3.5 w-3.5" />}>
                  Write a draft
                </Button>
              }
            />
          </Card>
        </Grid>

        <Card padding="none" className="overflow-hidden">
          <Stack gap={2} className="p-4">
            <Heading level={4}>DataTable (sortable, paginated)</Heading>
            <Text size="xs" variant="muted">
              Click a header to sort. Uses TanStack Table under the hood.
            </Text>
          </Stack>
          <Divider />
          <div className="p-4">
            <DataTable columns={COLUMNS} data={PRODUCTS} pageSize={10} />
          </div>
        </Card>

        <Card>
          <Stack gap={2}>
            <Heading level={4}>ScrollArea</Heading>
            <ScrollArea className="h-32 rounded-md border border-[var(--color-border-default)]">
              <Stack gap={1} className="p-3">
                {Array.from({ length: 40 }).map((_, i) => (
                  <Text key={i} size="sm">
                    Row {i + 1}
                  </Text>
                ))}
              </Stack>
            </ScrollArea>
          </Stack>
        </Card>
      </Stack>
    </Section>
  );
}

// ── Loading ─────────────────────────────────────────────────────
function LoadingSection() {
  return (
    <Section title="Loading states" description="Skeleton + Spinner placeholders.">
      <Card>
        <Stack gap={3}>
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Divider />
          <Skeleton className="h-20 w-full" />
        </Stack>
      </Card>
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

