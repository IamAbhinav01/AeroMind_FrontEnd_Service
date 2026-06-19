/* payment-confirm.js — Confirmation page */
document.addEventListener('DOMContentLoaded', () => {

  /* ── Load confirmed booking from sessionStorage ── */
  let data;
  try {
    data = JSON.parse(sessionStorage.getItem('last_confirmed_booking'));
  } catch { data = null; }

  if (!data) {
    // No confirmation data — user landed here directly; redirect
    window.location.href = 'my-bookings.html';
    return;
  }

  /* ── Populate details ── */
  document.getElementById('conf-route').textContent  = data.route  || '—';
  document.getElementById('conf-id').textContent     = `#${data.bookingId}`;
  document.getElementById('conf-flight').textContent = data.flightId + (data.flightNumber ? ' · ' + data.flightNumber : '');
  document.getElementById('conf-seats').textContent  = data.noOfSeats;
  document.getElementById('conf-total').textContent  = `₹${Number(data.totalCost).toLocaleString('en-IN')}`;

  if (data.email) {
    document.getElementById('conf-email-note').textContent =
      `📧 A detailed confirmation has been sent to ${data.email} via our notification service.`;
  }

  /* ── Confetti burst ── */
  const colors = ['#e8a020','#f5c050','#22c55e','#ffffff','#a78bfa'];
  for (let i = 0; i < 55; i++) {
    setTimeout(() => spawnDot(colors), i * 40);
  }

  function spawnDot(colors) {
    const dot = document.createElement('div');
    dot.className = 'confetti-dot';
    dot.style.cssText = `
      left: ${Math.random() * 100}vw;
      top: -10px;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      width: ${4 + Math.random() * 8}px;
      height: ${4 + Math.random() * 8}px;
      border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
      animation-duration: ${1.5 + Math.random() * 2}s;
      animation-delay: 0s;
      opacity: ${0.6 + Math.random() * 0.4};
    `;
    document.body.appendChild(dot);
    setTimeout(() => dot.remove(), 4000);
  }

  /* ── Clear sessionStorage so refreshing redirects to bookings ── */
  sessionStorage.removeItem('last_confirmed_booking');
});
