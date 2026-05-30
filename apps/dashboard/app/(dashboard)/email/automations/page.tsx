import { Workflow } from 'lucide-react';
import { EmailShell } from '../_components/email-shell';
import { EmailComingSoon } from '../_components/coming-soon';

export default function AutomationsPage() {
  return (
    <EmailShell
      current="automations"
      icon={<Workflow className="h-5 w-5" />}
      title="Automations"
      description="Event-triggered flows — order, cart-abandon, win-back, and B2B."
    >
      <EmailComingSoon
        title="Automations are coming online"
        description="Default automations (order confirmed, shipped, cart abandoned, win-back, B2B) activate the moment the module turns on, with per-flow enable/disable and frequency caps. This surface lands in an upcoming release."
      />
    </EmailShell>
  );
}
