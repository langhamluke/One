import { Link } from 'react-router-dom';
import { Page } from '@/components/shell/AppShell';
import { EmptyState } from '@/components/ui';

export function NotFoundPage() {
  return (
    <Page>
      <EmptyState title="Page not found" detail="The address is wrong or you do not have access to it." action={<Link to="/" className="text-sm">Go home</Link>} />
    </Page>
  );
}
