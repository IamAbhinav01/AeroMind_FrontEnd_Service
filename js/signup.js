/* signup.js */
document.addEventListener('DOMContentLoaded', () => {
  if (getToken()) window.location.href = 'index.html';

  const form     = document.getElementById('signup-form');
  const alertEl  = document.getElementById('signup-alert');
  const btn      = document.getElementById('signup-btn');
  const pwInput  = document.getElementById('signup-password');
  const togglePw = document.getElementById('toggle-pw');
  const strengthBar  = document.getElementById('pw-strength-bar');
  const strengthFill = document.getElementById('pw-strength-fill');

  // Password visibility
  togglePw?.addEventListener('click', () => {
    const isText = pwInput.type === 'text';
    pwInput.type = isText ? 'password' : 'text';
    togglePw.textContent = isText ? '👁' : '🙈';
  });

  // Password strength meter
  pwInput?.addEventListener('input', () => {
    const val = pwInput.value;
    if (!val) { strengthBar.style.display = 'none'; return; }
    strengthBar.style.display = '';
    let score = 0;
    if (val.length >= 8)           score++;
    if (/[A-Z]/.test(val))         score++;
    if (/[0-9]/.test(val))         score++;
    if (/[^A-Za-z0-9]/.test(val))  score++;
    const pct = (score / 4) * 100;
    const colors = ['#ef4444','#f59e0b','#22c55e','#22c55e'];
    strengthFill.style.width      = pct + '%';
    strengthFill.style.background = colors[score - 1] || '#ef4444';
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertEl.style.display = 'none';

    const name     = document.getElementById('signup-name').value.trim();
    const email    = document.getElementById('signup-email').value.trim();
    const password = pwInput.value;

    if (!name || !email || !password) { showAlert(alertEl, 'Please fill in all fields.'); return; }
    if (password.length < 8) { showAlert(alertEl, 'Password must be at least 8 characters.'); return; }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Creating account…';

    try {
      await apiFetch('/user/signup', {
        method: 'POST',
        body: JSON.stringify({ name, email, password }),
      });

      showAlert(alertEl, '✅ Account created! Signing you in…', 'success');

      // Auto sign-in
      const signInData = await apiFetch('/user/signin', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      const token = signInData.data;
      const payload = JSON.parse(atob(token.split('.')[1]));
      setAuth(token, { id: payload.id, email: payload.email });

      setTimeout(() => { window.location.href = 'flights.html'; }, 1200);
    } catch (err) {
      showAlert(alertEl, err.message || 'Could not create account. Email may already be in use.');
      btn.disabled = false;
      btn.textContent = 'Create Account';
    }
  });
});
