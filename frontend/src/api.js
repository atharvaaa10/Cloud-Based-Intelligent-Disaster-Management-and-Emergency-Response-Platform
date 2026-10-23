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

  const data = await res.json();
  if (!res.ok) {
    const msg = data.detail || JSON.stringify(data);
    throw new Error(msg);
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
