import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { PageLoader, EmptyState } from '../../components/ui';
import { EmailPanel } from '../../components/EmailPanel';
import { fmtDateUtc, fmtTimeUtc } from '../../lib/format';

/** Per-event email centre (reminders + NOTAMs to participants). Separate from slot management. */
export default function AdminEmailPage() {
  const { eventId: idParam } = useParams();
  const eventId = Number(idParam);
  const eventQ = useQuery({ queryKey: ['event', eventId], queryFn: () => api.event(eventId), enabled: !!eventId });
  const event = eventQ.data;

  if (eventQ.isLoading) return <PageLoader />;
  if (eventQ.isError || !event) return <EmptyState title="Event not found" hint="It may have been removed." />;

  return (
    <div>
      <Link to="/admin/events" className="mb-3 inline-flex items-center gap-1.5 text-sm text-fuselage-500 hover:text-atmos-600">
        <ArrowLeft size={15} /> All events
      </Link>

      <div className="mb-5">
        <div className="eyebrow">Email</div>
        <h2 className="mt-1 text-xl font-extrabold sm:text-2xl">{event.eventName}</h2>
        <p className="mt-1 font-mono text-xs uppercase tracking-wider text-fuselage-400">
          {event.typeName || event.type} · {fmtDateUtc(event.dateStart)} · {fmtTimeUtc(event.dateStart)}–{fmtTimeUtc(event.dateEnd)}
        </p>
      </div>

      <EmailPanel event={event} />
    </div>
  );
}
