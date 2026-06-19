/* signin.js */
document.addEventListener('DOMContentLoaded', () => {
  // Redirect if already logged in
  if (getToken()) window.location.href = 'index.html';

  const form     = document.getElementById('signin-form');
  const alertEl  = document.getElementById('signin-alert');
  const btn      = document.getElementById('signin-btn');
  const pwInput  = document.getElementById('signin-password');
  const togglePw = document.getElementById('toggle-pw');

  // Password visibility toggle
  togglePw?.addEventListener('click', () => {
    const isText = pwInput.type === 'text';
    pwInput.type = isText ? 'password' : 'text';
    togglePw.textContent = isText ? '👁' : '🙈';
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertEl.style.display = 'none';

    const email    = document.getElementById('signin-email').value.trim();
    const password = pwInput.value;

    if (!email || !password) { showAlert(alertEl, 'Please fill in all fields.'); return; }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Signing in…';

    try {
      const data = await apiFetch('/user/signin', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      // Gateway returns JWT token in data.data
      const token = data.data;
      // Decode payload to get user info (no verification needed client-side)
      const payload = JSON.parse(atob(token.split('.')[1]));
      setAuth(token, { id: payload.id, email: payload.email });

      // Check for redirect param
      const params  = new URLSearchParams(window.location.search);
      const redirect= params.get('redirect');
      window.location.href = redirect || 'flights.html';
    } catch (err) {
      showAlert(alertEl, err.message || 'Invalid email or password.');
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  });
});
