// Customer activity timeline — server component.
//
// Renders the append-only event log for the supplied customer/deal. The
// upstream caller (the customer detail page) does the activityService.list
// call; this component is concerned only with presentation.
//
// Each activity type maps to a short title and an icon. Unknown types fall
// back to a generic dot — the timeline never crashes on a new event type
// added downstream.

import type { CrmActivity } from '@sparx/db';
import {
  Badge,
  Stack,
  Text,
  Timeline,
  TimelineDescription,
  TimelineItem,
  TimelineTime,
  TimelineTitle,
} from '@sparx/ui';
import {
  CheckCircle2,
  CircleDot,
  CreditCard,
  FileText,
  Mail,
  MessageSquare,
  Package,
  Phone,
  Pencil,
  ShieldAlert,
  Truck,
  Users,
} from 'lucide-react';

interface Props {
  activities: CrmActivity[];
}

interface ActivityRender {
  title: string;
  icon: React.ReactNode;
}

const ICON_CLASS = 'h-3.5 w-3.5';

function renderForType(activity: CrmActivity): ActivityRender {
  switch (activity.type) {
    case 'order.placed':
      return { title: 'Order placed', icon: <Package className={ICON_CLASS} /> };
    case 'order.shipped':
      return { title: 'Order shipped', icon: <Truck className={ICON_CLASS} /> };
    case 'order.delivered':
      return { title: 'Order delivered', icon: <CheckCircle2 className={ICON_CLASS} /> };
    case 'order.cancelled':
      return { title: 'Order cancelled', icon: <ShieldAlert className={ICON_CLASS} /> };
    case 'order.refunded':
      return { title: 'Order refunded', icon: <CreditCard className={ICON_CLASS} /> };
    case 'email.sent':
      return { title: 'Email sent', icon: <Mail className={ICON_CLASS} /> };
    case 'email.opened':
      return { title: 'Email opened', icon: <Mail className={ICON_CLASS} /> };
    case 'email.clicked':
      return { title: 'Email link clicked', icon: <Mail className={ICON_CLASS} /> };
    case 'email.bounced':
      return { title: 'Email bounced', icon: <Mail className={ICON_CLASS} /> };
    case 'email.unsubscribed':
      return { title: 'Unsubscribed from email', icon: <Mail className={ICON_CLASS} /> };
    case 'quote.submitted':
      return { title: 'Quote submitted', icon: <FileText className={ICON_CLASS} /> };
    case 'quote.accepted':
      return { title: 'Quote accepted', icon: <CheckCircle2 className={ICON_CLASS} /> };
    case 'quote.declined':
      return { title: 'Quote declined', icon: <ShieldAlert className={ICON_CLASS} /> };
    case 'quote.expired':
      return { title: 'Quote expired', icon: <FileText className={ICON_CLASS} /> };
    case 'invoice.sent':
      return { title: 'Invoice sent', icon: <FileText className={ICON_CLASS} /> };
    case 'invoice.paid':
      return { title: 'Invoice paid', icon: <CheckCircle2 className={ICON_CLASS} /> };
    case 'invoice.overdue':
      return { title: 'Invoice overdue', icon: <ShieldAlert className={ICON_CLASS} /> };
    case 'login':
      return { title: 'Logged in', icon: <Users className={ICON_CLASS} /> };
    case 'password.reset':
      return { title: 'Password reset', icon: <ShieldAlert className={ICON_CLASS} /> };
    case 'account.created':
      return { title: 'Account created', icon: <Users className={ICON_CLASS} /> };
    case 'note':
      return { title: 'Note', icon: <MessageSquare className={ICON_CLASS} /> };
    case 'call':
      return { title: 'Call logged', icon: <Phone className={ICON_CLASS} /> };
    case 'meeting':
      return { title: 'Meeting logged', icon: <Users className={ICON_CLASS} /> };
    case 'task.created':
      return { title: 'Task created', icon: <CheckCircle2 className={ICON_CLASS} /> };
    case 'task.completed':
      return { title: 'Task completed', icon: <CheckCircle2 className={ICON_CLASS} /> };
    case 'deal.created':
      return { title: 'Deal created', icon: <FileText className={ICON_CLASS} /> };
    case 'deal.stage.changed':
      return { title: 'Deal moved to new stage', icon: <FileText className={ICON_CLASS} /> };
    case 'deal.closed':
      return { title: 'Deal closed', icon: <CheckCircle2 className={ICON_CLASS} /> };
    case 'customer.merged':
      return { title: 'Customer merged', icon: <Users className={ICON_CLASS} /> };
    case 'customer.assigned':
      return { title: 'Reassigned', icon: <Users className={ICON_CLASS} /> };
    default:
      return { title: activity.type, icon: <CircleDot className={ICON_CLASS} /> };
  }
}

export function ActivityTimeline({ activities }: Props) {
  if (activities.length === 0) {
    return (
      <Text variant="muted" size="sm">
        No activity yet.
      </Text>
    );
  }

  return (
    <Stack gap={3}>
      <Text variant="muted" size="xs">
        Activities are append-only — corrections appear as new entries marked Edited.
      </Text>
      <Timeline>
        {activities.map((a, idx) => {
        const meta = renderForType(a);
        const isCorrection = a.correctsActivityId != null;
        return (
          <TimelineItem
            key={a.id}
            showConnector={idx < activities.length - 1}
            marker={
              <span
                aria-hidden
                className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--module-active)] text-white"
              >
                {meta.icon}
              </span>
            }
          >
            <Stack gap={1}>
              <Stack direction="row" align="center" gap={2}>
                <TimelineTitle>{meta.title}</TimelineTitle>
                {isCorrection && (
                  <Badge variant="outline">
                    <Pencil className="h-3 w-3" /> Edited
                  </Badge>
                )}
                <Badge variant="outline">{a.actorType}</Badge>
              </Stack>
              {a.description && <TimelineDescription>{a.description}</TimelineDescription>}
              <TimelineTime dateTime={a.occurredAt.toISOString()}>
                {a.occurredAt.toLocaleString()}
              </TimelineTime>
            </Stack>
          </TimelineItem>
        );
      })}
      </Timeline>
    </Stack>
  );
}
