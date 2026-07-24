import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import { Spinner, IvaoMark } from '../components/ui';
import { apiErrorMessage } from '../api/client';
import { friendlyError } from '../lib/format';

export default function LoginPage() {
  const { config, devLogin, signed } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [vid, setVid] = useState('540001');
  const [admin, setAdmin] = useState(true);
  const [busy, setBusy] = useState(false);

  if (signed) {
    navigate('/', { replace: true });
  }

  const onDev = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await devLogin(vid.trim(), admin);
      toast.success('Signed in.');
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(friendlyError(apiErrorMessage(err)));
    } finally {
      setBusy(false);
    }
  };

  const ivaoSignIn = () => {
    const clientId = import.meta.env.VITE_IVAO_CLIENT_ID || config?.clientId;
    const redirectUri = import.meta.env.VITE_IVAO_REDIRECT_URI || `${window.location.origin}/login/callback`;
    const authEndpoint = config?.openId?.authorizationEndpoint;
    if (!clientId || !authEndpoint) {
      toast.error('IVAO SSO is not configured on this server.');
      return;
    }
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'profile email',
    });
    window.location.href = `${authEndpoint}?${params.toString()}`;
  };

  return (
    <div className="mx-auto max-w-md py-8">
      <div className="card overflow-hidden">
        <div className="bg-gradient-to-br from-atmos-700 to-atmos-900 px-6 py-9 text-center text-white">
          <IvaoMark className="mx-auto h-14 w-14 text-white" />
          <h1 className="mt-3 text-2xl font-extrabold">IVAO Booking</h1>
          <p className="mt-1 text-sm text-atmos-100">Sign in with your IVAO account to book event slots.</p>
        </div>

        <div className="space-y-5 p-6">
          <button className="btn-primary w-full py-3 text-base" onClick={ivaoSignIn}>
            Sign in with IVAO
          </button>

          {config?.devAuth && (
            <>
              <div className="flex items-center gap-3 text-xs font-semibold uppercase text-fuselage-400">
                <span className="h-px flex-1 bg-fuselage-200 dark:bg-fuselage-800" />
                Developer login
                <span className="h-px flex-1 bg-fuselage-200 dark:bg-fuselage-800" />
              </div>
              <form onSubmit={onDev} className="space-y-3">
                <div>
                  <label className="label">IVAO VID</label>
                  <input className="input" value={vid} onChange={(e) => setVid(e.target.value)} placeholder="540001" />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={admin} onChange={(e) => setAdmin(e.target.checked)} />
                  Sign in as division staff (admin)
                </label>
                <button className="btn-secondary w-full" disabled={busy}>
                  {busy ? <Spinner /> : 'Dev sign in'}
                </button>
                <p className="text-center text-xs text-fuselage-400">
                  Seeded staff VID: <b>540001</b> · pilots: 540002, 540003
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
