import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../../api/client';
import type { User } from '../../api/types';
import { PageLoader, EmptyState, Pagination } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../auth/AuthContext';
import { friendlyError, describeError } from '../../lib/format';
import { pilotRating, atcRating } from '../../lib/ratings';

export default function UsersPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', page, search],
    queryFn: () => api.users({ page, perPage: 15, ...(search ? { search } : {}) }),
  });

  const toggle = useMutation({
    mutationFn: ({ user, suspended }: { user: User; suspended: boolean }) => api.setSuspended(user.id, suspended),
    onSuccess: (u) => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success(u.suspended ? 'Pilot suspended.' : 'Pilot reinstated.');
    },
    onError: (e) => toast.error(describeError(e)),
  });

  return (
    <div>
      <div className="mb-4">
        <input
          className="input max-w-xs"
          placeholder="Search VID or name…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
      </div>
      {isLoading ? <PageLoader /> : !data || data.data.length === 0 ? (
        <EmptyState title="No pilots found" />
      ) : (
        <>
          <div className="space-y-2">
            {data.data.map((u) => (
              <div key={u.id} className="card flex flex-wrap items-center gap-3 p-4">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-atmos-100 font-bold text-atmos-700 dark:bg-atmos-900/40 dark:text-atmos-300">
                  {u.firstName?.[0] || '?'}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold">
                    {u.firstName} {u.lastName}
                    {u.isAdmin && <span className="ml-2 badge bg-atmos-100 text-atmos-700 dark:bg-atmos-900/40 dark:text-atmos-300">Staff</span>}
                    {u.suspended && <span className="ml-2 badge bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">Suspended</span>}
                  </div>
                  <div className="text-xs text-fuselage-500">
                    VID {u.vid} · {u.division} ·{' '}
                    <span title={pilotRating(u.pilotRating).full} className="cursor-help font-semibold">
                      {pilotRating(u.pilotRating).short}
                    </span>
                    {' / '}
                    <span title={atcRating(u.atcRating).full} className="cursor-help font-semibold">
                      {atcRating(u.atcRating).short}
                    </span>
                  </div>
                </div>
                <div className="ml-auto">
                  {me?.id === u.id ? (
                    <span className="text-xs text-fuselage-400">You</span>
                  ) : u.isAdmin ? (
                    <span className="text-xs text-fuselage-400">Staff</span>
                  ) : u.suspended ? (
                    <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => toggle.mutate({ user: u, suspended: false })}>
                      Reinstate
                    </button>
                  ) : (
                    <button className="btn-danger px-3 py-1.5 text-xs" onClick={() => toggle.mutate({ user: u, suspended: true })}>
                      Suspend
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}
    </div>
  );
}
