import { Send } from 'lucide-react';
import { EmailShell } from '../_components/email-shell';
import { EmailComingSoon } from '../_components/coming-soon';

export default function BroadcastsPage() {
  return (
    <EmailShell
      current="broadcasts"
      icon={<Send className="h-5 w-5" />}
      title="Broadcasts"
      description="Segment-targeted marketing campaigns with preview and scheduling."
    >
      <EmailComingSoon
        title="Broadcasts are coming online"
        description="Compose a campaign, pick a CRM segment, preview it, and schedule or send through Mailgun. This surface lands in an upcoming release."
      />
    </EmailShell>
  );
}
