// @sparx/ui — public barrel.
//
// New components are added below as they're built.
// See docs/23-frontend-component-architecture.md §9 for the full inventory.

// ── Utilities ──────────────────────────────────────────────
export { cn } from './utils/cn';
export { cva, type VariantProps } from './utils/cva';

// ── Variant system (docs/35) ───────────────────────────────
export {
  COLOR_KEYS,
  MODULE_COLOR_KEYS,
  ALL_COLOR_KEYS,
  colorVariants,
  colorClass,
  treatmentVariants,
  chipTreatmentVariants,
  type ColorKey,
  type SemanticColorKey,
  type ModuleColorKey,
  type TreatmentKey,
} from './components/_recipes/variants';

// ── Providers / context ───────────────────────────────────
export { ModuleProvider, useModule, type SparxModule } from './providers/module-provider';

// ── Hooks ─────────────────────────────────────────────────
export { useTheme, THEME_INIT_SCRIPT, type Theme } from './hooks/use-theme';
export { useMediaQuery } from './hooks/use-media-query';

// ── Brand ────────────────────────────────────────────────
export { Wordmark, type WordmarkProps } from './components/brand/wordmark';
export { SparxMark, type SparxMarkProps } from './components/brand/sparx-mark';

// ── Primitives ────────────────────────────────────────────
export { Spinner, type SpinnerProps } from './components/primitives/spinner';
export { Button, buttonVariants, type ButtonProps } from './components/primitives/button';
export {
  ButtonGroup,
  buttonGroupVariants,
  type ButtonGroupProps,
} from './components/primitives/button-group';
export { Badge, badgeVariants, type BadgeProps } from './components/primitives/badge';
export { Avatar, avatarVariants, type AvatarProps } from './components/primitives/avatar';
export { Skeleton, type SkeletonProps } from './components/primitives/skeleton';
export { Switch, type SwitchProps } from './components/primitives/switch';
export { Checkbox, type CheckboxProps } from './components/primitives/checkbox';
export { Heading, headingVariants, type HeadingProps } from './components/primitives/heading';
export { Text, textVariants, type TextProps } from './components/primitives/text';
export { Label } from './components/primitives/label';

// ── Layout ────────────────────────────────────────────────
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  cardVariants,
  type CardProps,
} from './components/layout/card';
export {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  type AccordionProps,
  type AccordionItemProps,
} from './components/layout/accordion';
export { Divider, type DividerProps } from './components/layout/divider';
export { Stack, type StackProps } from './components/layout/stack';
export { Grid, type GridProps } from './components/layout/grid';
export { Container, containerVariants, type ContainerProps } from './components/layout/container';
export { PageHeader, type PageHeaderProps } from './components/layout/page-header';
export { ScrollArea, ScrollBar } from './components/layout/scroll-area';
export {
  SidebarAppShell,
  useRailExpanded,
  type SidebarAppShellProps,
} from './components/layout/sidebar-app-shell';

// ── Form ──────────────────────────────────────────────────
export { Input, inputVariants, type InputProps } from './components/form/input';
export {
  NativeSelect,
  nativeSelectVariants,
  type NativeSelectProps,
} from './components/form/native-select';
export { FormActionBar, type FormActionBarProps } from './components/form/form-action-bar';
export { Textarea, textareaVariants, type TextareaProps } from './components/form/textarea';
export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  selectTriggerVariants,
  type SelectTriggerProps,
} from './components/form/select';
export {
  RadioGroup,
  RadioGroupItem,
  type RadioGroupItemProps,
} from './components/form/radio-group';
export { Slider, type SliderProps } from './components/form/slider';
export {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  useFormField,
} from './components/form/form';
export { Calendar, type CalendarProps } from './components/form/calendar';
export { DatePicker, type DatePickerProps } from './components/form/date-picker';
export { FileUpload, type FileUploadProps } from './components/form/file-upload';
export { ColorPicker, type ColorPickerProps } from './components/form/color-picker';
export { RichTextEditor, type RichTextEditorProps } from './components/form/rich-text-editor';

// ── Overlay ───────────────────────────────────────────────
export {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from './components/overlay/tooltip';
export {
  Modal,
  ModalTrigger,
  ModalClose,
  ModalPortal,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalTitle,
  ModalDescription,
  modalContentVariants,
  type ModalContentProps,
} from './components/overlay/modal';
export {
  Drawer,
  DrawerTrigger,
  DrawerClose,
  DrawerPortal,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
  drawerContentVariants,
  type DrawerContentProps,
} from './components/overlay/drawer';
export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogPortal,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from './components/overlay/alert-dialog';
export {
  ConfirmProvider,
  useConfirm,
  type ConfirmOptions,
  type ConfirmFn,
} from './components/overlay/confirm-provider';
export {
  ProductTour,
  useProductTour,
  type ProductTourStep,
  type ProductTourOptions,
  type ProductTourProps,
} from './components/overlay/product-tour';
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
} from './components/overlay/dropdown-menu';
export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuGroup,
  ContextMenuPortal,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuRadioGroup,
} from './components/overlay/context-menu';
export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor,
  PopoverClose,
} from './components/overlay/popover';
export { Toaster, toast } from './components/overlay/toast';
export {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
  CommandPalette,
  CommandPalettePortal,
  type CommandPaletteProps,
} from './components/overlay/command-palette';

// ── Navigation ────────────────────────────────────────────
export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  tabsListVariants,
  type TabsListProps,
} from './components/navigation/tabs';
export {
  Sidebar,
  SidebarHeader,
  SidebarNav,
  SidebarSection,
  SidebarSectionLabel,
  SidebarFooter,
  SidebarItem,
  sidebarItemVariants,
  type SidebarItemProps,
  type SidebarNavProps,
} from './components/navigation/sidebar';
export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
  type BreadcrumbLinkProps,
} from './components/navigation/breadcrumb';
export { Pagination, type PaginationProps } from './components/navigation/pagination';
export { Stepper, type StepperProps, type StepperStep } from './components/navigation/stepper';

// ── Data display ──────────────────────────────────────────
export { Code, codeVariants, type CodeProps } from './components/data/code';
export { Kbd, kbdVariants, type KbdProps } from './components/data/kbd';
export { Alert, alertVariants, type AlertProps } from './components/data/alert';
export { Progress, progressVariants, type ProgressProps } from './components/data/progress';
export { StatusDot, dotVariants, type StatusDotProps } from './components/data/status-dot';
export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from './components/data/table';
export { DataTable, type DataTableProps } from './components/data/data-table';
export { Stat, type StatProps, type StatDelta } from './components/data/stat';
export { EmptyState, type EmptyStateProps } from './components/data/empty-state';
export { FilterBar, type FilterBarProps } from './components/data/filter-bar';
export { Tag, tagVariants, type TagProps } from './components/data/tag';
export {
  Timeline,
  TimelineItem,
  TimelineTitle,
  TimelineDescription,
  TimelineTime,
  type TimelineItemProps,
} from './components/data/timeline';
export {
  LineChart,
  BarChart,
  AreaChart,
  Sparkline,
  type ChartSeries,
  type BaseChartProps,
  type LineChartProps,
  type BarChartProps,
  type AreaChartProps,
  type SparklineProps,
} from './components/data/chart';
