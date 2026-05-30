import { LayoutTemplate } from 'lucide-react';
import { EmailShell } from '../_components/email-shell';
import { EmailComingSoon } from '../_components/coming-soon';

export default function TemplatesPage() {
  return (
    <EmailShell
      current="templates"
      icon={<LayoutTemplate className="h-5 w-5" />}
      title="Templates"
      description="Branded transactional + marketing templates with live preview."
    >
      <EmailComingSoon
        title="Templates are coming online"
        description="Manage built-in transactional templates (logo, color, subject, sender, intro/outro slots) and author marketing templates with live preview and test send. This surface lands in an upcoming release."
      />
    </EmailShell>
  );
}
