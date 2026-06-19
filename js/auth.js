/**
 * auth.js — Auth state management, token storage, nav hydration
 * All pages include this as their first script.
 */

const API_BASE = 'http://localhost:4005/api/v1';

/* ── Token helpers ── */
const getToken  = ()        => localStorage.getItem('am_token');
const getUser   = ()        => { try { return JSON.parse(localStorage.getItem('am_user')); } catch { return null; } };
const setAuth   = (token, user) => { localStorage.setItem('am_token', token); localStorage.setItem('am_user', JSON.stringify(user)); };
const clearAuth = ()        => { localStorage.removeItem('am_token'); localStorage.removeItem('am_user'); };

/* ── Nav hydration — run after DOM ready ── */
function hydrateNav() {
  const token    = getToken();
  const signinEl = document.getElementById('nav-signin');
  const signupEl = document.getElementById('nav-signup');
  const signoutEl= document.getElementById('nav-signout');
  const bookEl   = document.getElementById('nav-bookings');

  if (token) {
    if (signinEl) signinEl.style.display = 'none';
    if (signupEl) signupEl.style.display = 'none';
    if (signoutEl)signoutEl.style.display = '';
    if (bookEl)   bookEl.style.display   = '';
  } else {
    if (signinEl) signinEl.style.display = '';
    if (signupEl) signupEl.style.display = '';
    if (signoutEl)signoutEl.style.display = 'none';
    if (bookEl)   bookEl.style.display   = 'none';
  }
}

function signOut() {
  clearAuth();
  window.location.href = 'index.html';
}

/* ── Scroll-aware nav ── */
function initNav() {
  const nav = document.getElementById('main-nav');
  if (!nav) return;
  const check = () => nav.classList.toggle('scrolled', window.scrollY > 20);
  window.addEventListener('scroll', check, { passive: true });
  check();
}

/* ── Auth guard: redirect to signin if not logged in ── */
function requireAuth() {
  if (!getToken()) {
    window.location.href = 'signin.html?redirect=' + encodeURIComponent(window.location.href);
  }
}

/* ── Fetch wrapper with auth header ── */
async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['x-access-token'] = token;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, message: data.message || 'Request failed', data };
  return data;
}

/* ── Show/hide alert helper ── */
function showAlert(el, msg, type = 'error') {
  if (!el) return;
  el.className = `alert alert-${type} show`;
  el.textContent = msg;
  el.style.display = 'flex';
  if (type === 'success') setTimeout(() => { el.style.display = 'none'; }, 5000);
}

document.addEventListener('DOMContentLoaded', () => {
  hydrateNav();
  initNav();
});
