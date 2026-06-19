/**
 * payment.js — Payment processing page
 *
 * Flow:
 *  1. Read bookingId + email from URL params
 *  2. Load booking from localStorage
 *  3. Start 3-second visual countdown (orbit + progress ring)
 *  4. Simultaneously fire the API call
 *  5. After BOTH 3s AND API resolve → navigate to payment-confirm.html
 *  6. Abort button: stop the countdown, call cancel API, go back to my-bookings
 *  7. If API fails: show error view (idempotency key preserved for safe retry)
 */

document.addEventListener('DOMContentLoaded', () => {
  requireAuth();

  const params     = new URLSearchParams(window.location.search);
  const bookingId  = params.get('bookingId');
  const email      = params.get('email') || '';

  if (!bookingId) { window.location.href = 'my-bookings.html'; return; }

  /* ── Load booking from localStorage ── */
  let booking;
  try {
    booking = JSON.parse(localStorage.getItem(`booking_data_${bookingId}`));
  } catch { booking = null; }

  if (!booking) { window.location.href = 'my-bookings.html'; return; }

  const flight = booking._flight || {};
  const dep    = flight.departureAirport?.code || flight.departureAirportId || '---';
  const arr    = flight.arrivalAirport?.code   || flight.arrivalAirportId   || '---';

  /* ── Populate summary card ── */
  document.getElementById('ps-route').textContent  = `${dep} → ${arr}`;
  document.getElementById('ps-id').textContent     = `#${booking.id}`;
  document.getElementById('ps-seats').textContent  = booking.noOfSeats;
  document.getElementById('ps-total').textContent  = `₹${Number(booking.totalCost).toLocaleString('en-IN')}`;

  /* ── Idempotency ── */
  const existingKey = localStorage.getItem(`payment_${bookingId}`);
  const idempotencyKey = existingKey || (() => {
    const k = `payment_${bookingId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem(`payment_${bookingId}`, k);
    return k;
  })();
  document.getElementById('idem-key-display').textContent = idempotencyKey;

  /* ── Progress ring setup ── */
  const DURATION_MS    = 3000;
  const ring           = document.getElementById('progress-ring');
  const circumference  = 2 * Math.PI * 74; // r=74
  ring.style.strokeDasharray  = circumference;
  ring.style.strokeDashoffset = circumference;

  const statusMsgs = [
    { at: 0,    status: 'Securing your booking',      sub: 'Encrypting payment details…' },
    { at: 900,  status: 'Verifying seat availability', sub: 'Checking real-time inventory…' },
    { at: 1800, status: 'Processing payment',          sub: 'Almost there…' },
  ];

  const statusEl    = document.getElementById('pay-status');
  const statusSubEl = document.getElementById('pay-status-sub');
  const countdownEl = document.getElementById('countdown-num');

  /* ── Countdown + animation ── */
  let aborted       = false;
  let animFrame;
  let msgIndex      = 0;
  const startTime   = Date.now();

  function animate() {
    if (aborted) return;
    const elapsed  = Date.now() - startTime;
    const progress = Math.min(elapsed / DURATION_MS, 1);

    // Progress ring
    ring.style.strokeDashoffset = circumference * (1 - progress);

    // Countdown number
    const remaining = Math.max(0, Math.ceil((DURATION_MS - elapsed) / 1000));
    countdownEl.textContent = remaining;

    // Status messages
    for (let i = statusMsgs.length - 1; i >= 0; i--) {
      if (elapsed >= statusMsgs[i].at && msgIndex <= i) {
        statusEl.textContent    = statusMsgs[i].status;
        statusSubEl.textContent = statusMsgs[i].sub;
        msgIndex = i + 1;
        break;
      }
    }

    if (progress < 1) {
      animFrame = requestAnimationFrame(animate);
    }
  }
  animFrame = requestAnimationFrame(animate);

  /* ── API call (fires immediately, concurrent with animation) ── */
  const user = getUser();
  const apiPromise = fetch(`${API_BASE}/bookings/payment`, {
    method: 'POST',
    headers: {
      'Content-Type':       'application/json',
      'x-access-token':     getToken(),
      'x-idempotency-key':  idempotencyKey,
    },
    body: JSON.stringify({
      bookingId: parseInt(bookingId),
      userId:    user.id,
      totalCost: booking.totalCost,
      email,
    }),
  }).then(r => r.json());

  /* ── Timer promise (minimum 3s visual) ── */
  const timerPromise = new Promise(resolve => setTimeout(resolve, DURATION_MS + 100));

  /* ── Wait for BOTH ── */
  Promise.all([apiPromise, timerPromise])
    .then(([result]) => {
      if (aborted) return;

      if (result.success === false) {
        throw new Error(result.message || 'Payment failed');
      }

      // ── Success ──────────────────────────────────────────────────────────
      // Clear idempotency key (confirmed — next attempt is a new payment)
      localStorage.removeItem(`payment_${bookingId}`);

      // Update booking status in localStorage
      try {
        const stored = JSON.parse(localStorage.getItem(`booking_data_${bookingId}`));
        if (stored) {
          stored.status = 'CONFIRM';
          localStorage.setItem(`booking_data_${bookingId}`, JSON.stringify(stored));
        }
      } catch { /* ignore */ }

      // Pass confirmation data to confirm page via sessionStorage
      sessionStorage.setItem('last_confirmed_booking', JSON.stringify({
        bookingId,
        email,
        route:    `${dep} → ${arr}`,
        flightId: booking.flightId,
        flightNumber: flight.flightNumber || '',
        noOfSeats: booking.noOfSeats,
        totalCost: booking.totalCost,
      }));

      window.location.href = 'payment-confirm.html';
    })
    .catch(err => {
      if (aborted) return;
      cancelAnimationFrame(animFrame);
      showError(err.message || 'Payment could not be processed.');
    });

  /* ── Abort button ── */
  const abortBtn = document.getElementById('abort-btn');
  abortBtn.addEventListener('click', async () => {
    if (aborted) return;
    aborted = true;
    cancelAnimationFrame(animFrame);
    abortBtn.disabled = true;
    abortBtn.textContent = 'Aborting…';

    // Note: we do NOT cancel the booking here — only the user's navigation
    // is aborted. The booking stays INITIATED (will auto-expire in 5 min).
    // If you want to cancel immediately, uncomment the block below:
    /*
    try {
      await fetch(`${API_BASE}/bookings/cancel`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'x-access-token': getToken() },
        body: JSON.stringify({ bookingId: parseInt(bookingId) }),
      });
    } catch { }
    */

    window.location.href = 'my-bookings.html';
  });

  /* ── Error view ── */
  function showError(msg) {
    document.getElementById('processing-view').style.display = 'none';
    const errView = document.getElementById('error-view');
    errView.classList.add('show');
    document.getElementById('error-msg').textContent = msg;
  }
});
