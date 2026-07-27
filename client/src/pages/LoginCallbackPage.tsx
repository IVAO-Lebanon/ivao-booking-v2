import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, apiErrorMessage } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { friendlyError, describeError } from '../lib/format';
import { Spinner } from '../components/ui';

export default function LoginCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { loginWithJwt } = useAuth();
  const [error, setError] = useState('');
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const code = params.get('code');
    if (!code) {
      setError('Missing authorization code.');
      return;
    }
    const redirectUri = import.meta.env.VITE_IVAO_REDIRECT_URI || `${window.location.origin}/login/callback`;
    api
      .ivaoLogin(code, redirectUri)
      .then(({ jwt }) => {
        loginWithJwt(jwt);
        navigate('/', { replace: true });
      })
      .catch((err) => setError(describeError(err)));
  }, [params, loginWithJwt, navigate]);

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      {error ? (
        <>
          <p className="text-lg font-semibold text-red-600">Sign-in failed</p>
          <p className="text-sm text-fuselage-500">{error}</p>
          <button className="btn-primary mt-2" onClick={() => navigate('/login?manual=1')}>
            Back to sign in
          </button>
        </>
      ) : (
        <>
          <Spinner className="h-8 w-8 text-atmos-600" />
          <p className="text-sm text-fuselage-500">Completing sign-in…</p>
        </>
      )}
    </div>
  );
}
