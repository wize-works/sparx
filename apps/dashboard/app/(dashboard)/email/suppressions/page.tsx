import { ShieldOff } from 'lucide-react';
import { EmailShell } from '../_components/email-shell';
import { EmailComingSoon } from '../_components/coming-soon';

export default function SuppressionsPage() {
  return (
    <EmailShell
      current="suppressions"
      icon={<ShieldOff className="h-5 w-5" />}
      title="Suppressions"
      description="Unsubscribes, bounces, and complaints — kept in sync with Mailgun."
    >
      <EmailComingSoon
        title="Suppressions are coming online"
        description="The suppression list mirrors Mailgun bounces, complaints, and unsubscribes, plus manual entries — so a suppressed address is never emailed again. This surface lands in an upcoming release."
      />
    </EmailShell>
  );
}
