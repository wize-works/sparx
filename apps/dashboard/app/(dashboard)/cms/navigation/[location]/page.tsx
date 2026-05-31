import Link from 'next/link';
import { Button } from '@sparx/ui';
import { ArrowLeft } from 'lucide-react';
import { MenuDetailContent } from '../menu-detail';

export const dynamic = 'force-dynamic';

interface PageParams {
  params: Promise<{ location: string }>;
}

export default async function EditNavigationMenuPage({ params }: PageParams) {
  const { location } = await params;
  return (
    <div className="flex flex-col gap-5">
      <Button variant="link" size="sm" asChild>
        <Link href="/cms/navigation">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to navigation
        </Link>
      </Button>
      <MenuDetailContent id={location} />
    </div>
  );
}
