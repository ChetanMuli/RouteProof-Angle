import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Camera, MapPin, ShieldCheck } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useLang } from '../i18n.jsx';
import { LangSwitch, Logo, useToast } from '../ui.jsx';

const DEMO = [
  ['admin', 'admin123', 'Admin'],
  ['priya', 'priya123', 'Sub-admin'],
  ['ravi', 'driver123', 'Driver'],
];

export default function Login() {
  const { user, login } = useAuth();
  const { t } = useLang();
  const toast = useToast();
  const nav = useNavigate();

  const [mode, setMode] = useState('password'); // 'password' | 'otp'
  const [f, setF] = useState({ username: '', password: '' });
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={user.role === 'driver' ? '/driver' : '/admin'} replace />;

  const submitPassword = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const u = await login(f.username, f.password);
      nav(u.role === 'driver' ? '/driver' : '/admin', { replace: true });
    } catch (e2) {
      setErr(t(e2.message));
      setBusy(false);
    }
  };

  const sendOtp = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const r = await api('/auth/otp/request', { method: 'POST', body: { mobile } });
      setOtpSent(true);
      if (r.demo_otp) {
        setOtp(r.demo_otp);
        toast(`Demo OTP: ${r.demo_otp}`);
      }
    } catch (e2) {
      setErr(t(e2.message));
    }
    setBusy(false);
  };

  const verifyOtp = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const r = await api('/auth/otp/verify', { method: 'POST', body: { mobile, code: otp } });
      localStorage.setItem('token', r.token);
      window.location.href = r.user.role === 'driver' ? '/driver' : '/admin';
    } catch (e2) {
      setErr(t(e2.message));
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-art">
        <div className="brand"><Logo size={34} /> RouteProof</div>
        <div>
          <h1>{t('See every advertising vehicle where it should be.')}</h1>
          <p>{t('Drivers photograph the vehicle at each stop. GPS, time and address are printed on the photo, and your team reviews them here.')}</p>
          <div className="login-feats">
            <div className="login-feat"><Camera size={17} color="#F59E0B" /> Live camera only with burned-in GPS &amp; timestamp</div>
            <div className="login-feat"><MapPin size={17} color="#10B981" /> Route import, stop splitting &amp; radius checks</div>
            <div className="login-feat"><ShieldCheck size={17} color="#38BDF8" /> Audit log, offline photo queue &amp; PDF/Excel reports</div>
          </div>
        </div>
        <div className="road" aria-hidden="true" />
        <div className="small" style={{ color: '#64748B' }}>RouteProof v2.0 &bull; {t('Demo project')}</div>
      </div>

      <div className="login-form">
        <div className="login-card">
          <div className="row spread">
            <h2>{t('Log in')}</h2>
            <LangSwitch light />
          </div>

          <div className="seg" style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            <button type="button" className={mode === 'password' ? 'on' : ''} onClick={() => { setMode('password'); setErr(''); }}>
              {t('Password login')}
            </button>
            <button type="button" className={mode === 'otp' ? 'on' : ''} onClick={() => { setMode('otp'); setErr(''); }}>
              {t('Mobile OTP')}
            </button>
          </div>

          {mode === 'password' ? (
            <form className="stack" onSubmit={submitPassword}>
              <label className="field">
                <span>{t('Username or mobile number')}</span>
                <input className="input" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} autoCapitalize="none" autoComplete="username" autoFocus />
              </label>
              <label className="field">
                <span>{t('Password')}</span>
                <input className="input" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" />
              </label>
              {err && <p className="error-text" role="alert">{err}</p>}
              <button className="btn primary lg" disabled={busy || !f.username || !f.password}>{t('Log in')}</button>
              <div className="demo-accounts">
                {t('Demo logins')}: {DEMO.map(([u, p, r], i) => (
                  <span key={u}>
                    {i ? ', ' : ''}
                    <button type="button" onClick={() => setF({ username: u, password: p })}>{t(r)}</button>
                  </span>
                ))}
              </div>
            </form>
          ) : (
            <form className="stack" onSubmit={otpSent ? verifyOtp : sendOtp}>
              <label className="field">
                <span>{t('Mobile number')}</span>
                <input className="input" inputMode="tel" placeholder="9000000011" value={mobile} onChange={(e) => setMobile(e.target.value)} disabled={otpSent} />
              </label>
              {otpSent && (
                <label className="field">
                  <span>{t('Enter 6-digit OTP')}</span>
                  <input className="input mono" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value)} autoFocus />
                </label>
              )}
              {err && <p className="error-text" role="alert">{err}</p>}
              <button className="btn primary lg" disabled={busy || mobile.length < 8 || (otpSent && otp.length < 4)}>
                {otpSent ? t('Verify & log in') : t('Send OTP')}
              </button>
              {otpSent && (
                <button type="button" className="btn sm" onClick={() => { setOtpSent(false); setOtp(''); }}>
                  {t('Back')}
                </button>
              )}
              <div className="demo-accounts">
                Demo driver mobile: <button type="button" onClick={() => { setMobile('9000000011'); setOtpSent(false); }}>9000000011 (Ravi)</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
