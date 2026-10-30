import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ShieldAlert, Eye, EyeOff, Lock, Mail, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button, Input } from '../components/ui';

export default function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isRegister, setIsRegister] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const queryMessage = new URLSearchParams(location.search).get('message');
  const [error, setError] = useState(queryMessage || '');
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let user;
      if (isRegister) {
        user = await register(form.name, form.email, form.password);
      } else {
        user = await login(form.email, form.password);
      }
      navigate(user.role === 'citizen' ? '/citizen' : '/admin');
    } catch (err) {
      setError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-brand-icon">
            <ShieldAlert size={20} strokeWidth={2} />
          </div>
          <h1 className="auth-title">
            {isRegister ? 'Create an account' : 'Sign in to platform'}
          </h1>
          <p className="auth-subtitle">
            {isRegister
              ? 'Register to report emergencies and track rescue responses.'
              : 'Emergency coordination and operations management.'}
          </p>
        </div>

        {error && (
          <div
            className="ui-hint"
            role="alert"
            style={{
              padding: '10px 12px',
              backgroundColor: 'var(--danger-bg)',
              color: 'var(--danger-text)',
              border: '1px solid var(--danger-border)',
              borderRadius: 'var(--radius-md)',
              marginBottom: '16px',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {isRegister && (
            <Input
              label="Full name"
              id="name"
              type="text"
              placeholder="Your name"
              value={form.name}
              onChange={set('name')}
              required
              leftIcon={User}
            />
          )}

          <Input
            label="Email address"
            id="email"
            type="email"
            placeholder="name@organization.org"
            value={form.email}
            onChange={set('email')}
            required
            leftIcon={Mail}
          />

          <Input
            label="Password"
            id="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            value={form.password}
            onChange={set('password')}
            required
            minLength={8}
            leftIcon={Lock}
            rightSlot={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? 'Hide password' : 'Show password'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  color: 'var(--text-tertiary)',
                  padding: '4px',
                }}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            }
          />
          {isRegister && (
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: -8, marginBottom: 4 }}>
              Min 8 characters · at least one uppercase letter or digit
            </p>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={loading}
            style={{ width: '100%', marginTop: '8px' }}
          >
            {isRegister ? 'Create account' : 'Sign in'}
          </Button>
        </form>

        <div className="auth-toggle">
          {isRegister ? 'Already have an account? ' : "Don't have an account? "}
          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister);
              setError('');
            }}
            style={{ color: 'var(--accent)', fontWeight: 500 }}
          >
            {isRegister ? 'Sign in' : 'Create an account'}
          </button>
        </div>
      </div>
    </div>
  );
}
