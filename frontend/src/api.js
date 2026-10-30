/**
 * API helper — all backend calls go through here.
 * Base URL is empty because Vite proxies /auth, /incidents, etc.
 */

const BASE = import.meta.env.VITE_API_URL || '';

function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(method, path, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, opts);
  if (res.status === 204) return null;

  // Shared 401 response interceptor
  if (res.status === 401) {
    localStorage.removeItem('token');
    // If not already on /login, redirect with session expired message
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      const msg = encodeURIComponent('Session expired, please sign in again');
      window.location.href = `/login?message=${msg}`;
    }
    const error = new Error('Session expired, please sign in again');
    error.status = 401;
    throw error;
  }

  const data = await res.json();
  if (!res.ok) {
    // FastAPI 422 validation errors: detail is an array of {loc, msg, type} objects.
    // Other errors: detail is a plain string, or the body is something else entirely.
    const detail = data.detail;
    let msg;
    if (Array.isArray(detail)) {
      // Each item: { loc: ["body", "field_name"], msg: "...", type: "..." }
      msg = detail
        .map((err) => {
          const field = Array.isArray(err.loc) && err.loc.length > 1
            ? err.loc[err.loc.length - 1]   // e.g. "description"
            : null;
          const label = field
            ? String(field).replace(/_/g, ' ')  // snake_case → words
            : null;
          return label ? `${label}: ${err.msg}` : err.msg;
        })
        .join('\n');
    } else if (typeof detail === 'string') {
      msg = detail;
    } else {
      msg = JSON.stringify(data);
    }
    const error = new Error(msg);
    error.status = res.status;
    error.validationErrors = Array.isArray(detail) ? detail : null;
    throw error;
  }
  return data;
}

export const api = {
  get:    (path) => request('GET', path),
  post:   (path, body) => request('POST', path, body),
  patch:  (path, body) => request('PATCH', path, body),
  put:    (path, body) => request('PUT', path, body),
  delete: (path) => request('DELETE', path),
};

export default api;
