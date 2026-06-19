/* landing.js — Landing page interactivity */

document.addEventListener('DOMContentLoaded', () => {

  /* ── Quick Search swap button ── */
  const fromEl   = document.getElementById('qs-from');
  const toEl     = document.getElementById('qs-to');
  const swapBtn  = document.getElementById('qs-swap-btn');

  if (swapBtn) {
    swapBtn.addEventListener('click', () => {
      const tmp = fromEl.value;
      fromEl.value = toEl.value;
      toEl.value = tmp;
      swapBtn.style.transform = swapBtn.style.transform === 'rotate(180deg)' ? '' : 'rotate(180deg)';
    });
  }

  /* ── Quick Search submit → flights.html with query params ── */
  const searchBtn = document.getElementById('qs-search-btn');
  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      const from = fromEl?.value.trim();
      const to   = toEl?.value.trim();
      const date = document.getElementById('qs-date')?.value;
      const pax  = document.getElementById('qs-pax')?.value || 1;

      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to)   params.set('to',   to);
      if (date) params.set('date', date);
      params.set('pax', pax);
      window.location.href = `flights.html?${params.toString()}`;
    });
  }

  /* ── Set today's date as default ── */
  const dateEl = document.getElementById('qs-date');
  if (dateEl) {
    dateEl.value = new Date().toISOString().split('T')[0];
  }

  /* ── Feature cards intersection observer (re-trigger animation) ── */
  const cards = document.querySelectorAll('.feature-card');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.style.animationPlayState = 'running';
        }
      });
    }, { threshold: 0.15 });
    cards.forEach(c => {
      c.style.animationPlayState = 'paused';
      io.observe(c);
    });
  }
});
