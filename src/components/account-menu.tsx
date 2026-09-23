import { User } from 'lucide-react';
import Link from 'next/link';

type Props = {
  href: string;
  label: string;
  initial: string | null;
};

/** Avatar circolare con l'iniziale al posto del link testuale "Account" (D-052). */
export function AccountMenu({ href, label, initial }: Props) {
  return (
    <Link href={href} className="avatar" aria-label={label} title={label}>
      {initial ? initial : <User size={16} aria-hidden="true" />}
    </Link>
  );
}
