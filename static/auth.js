/* CardForge SDD — Shared Authentication Utilities */

function getToken() { return localStorage.getItem('cf_token'); }
function getUser() {
  const raw = localStorage.getItem('cf_user');
  return raw ? JSON.parse(raw) : null;
}

async function checkAuth() {
  const token = getToken();
  if (!token) return null;
  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) {
      localStorage.removeItem('cf_token');
      localStorage.removeItem('cf_user');
      return null;
    }
    const user = await res.json();
    localStorage.setItem('cf_user', JSON.stringify(user));
    return user;
  } catch {
    return null;
  }
}

function authHeaders() {
  return { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
}

function redirectByRole(user) {
  if (!user) { window.location.href = '/login.html'; return; }
  if (user.role === 'admin') window.location.href = '/';
  else window.location.href = '/play.html';
}

async function logout() {
  const token = getToken();
  if (token) {
    await fetch('/api/auth/logout', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } }).catch(() => {});
  }
  localStorage.clear();
  window.location.href = '/login.html';
}
