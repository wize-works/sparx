import { Sparkles } from 'lucide-react';
import { ModuleStub } from '../../../components/module-stub';

export default function AiPage() {
  return (
    <ModuleStub
      icon={<Sparkles className="h-5 w-5" />}
      title="AI"
      tagline="MCP server, agents, and merchant copilots."
      description="The AI module exposes your storefront and back office to MCP-aware agents — and gives merchants a copilot that can query orders, customers, and inventory in plain English."
      features={[
        { title: 'MCP server', description: 'First-class MCP endpoint with per-tenant scopes.' },
        { title: 'Merchant copilot', description: 'Chat over your store data with safe write actions.' },
        { title: 'Agent webhooks', description: 'Subscribe agents to business events via Pub/Sub.' },
        { title: 'Product enrichment', description: 'Auto-generate descriptions, alt text, SEO tags.' },
        { title: 'Smart segments', description: 'Natural-language CRM segment builder.' },
        { title: 'Audit log', description: 'Every agent call recorded with prompt and outcome.' },
      ]}
    />
  );
}
