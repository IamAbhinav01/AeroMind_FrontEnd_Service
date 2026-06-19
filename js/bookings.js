/**
 * bookings.js — My Bookings page
 *
 * Idempotency Strategy (Production-Ready):
 * ─────────────────────────────────────────
 * Every payment attempt generates a unique key: `payment_<bookingId>_<timestamp>_<random>`
 * and stores it in localStorage keyed by `payment_<bookingId>`.
 *
 * On retry (network failure, user clicks again), the SAME key is retrieved from
 * localStorage — so the backend receives an identical idempotency key and can
 * return the cached result without charging twice.
 *
 * This matches how Stripe, PayPal, and Square handle client-side idempotency.
 */

/* ── Idempotency helpers ── */
const getIdempotencyKey = (bookingId) => {
  const stored = localStorage.getItem(`payment_${bookingId}`);
  if (stored) return stored; // Retry — reuse same key
  const newKey = `payment_${bookingId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  localStorage.setItem(`payment_${bookingId}`, newKey);
  return newKey;
};

const clearIdempotencyKey = (bookingId) => localStorage.removeItem(`payment_${bookingId}`);

document.addEventListener('DOMContentLoaded', () => {
  requireAuth();

  let myBookings = [];
  let payingBooking = null;

  /* ── Load bookings ── */
  async function loadBookings() {
    const grid   = document.getElementById('bookings-grid');
    const user   = getUser();
    grid.innerHTML = `<div class="state-box" style="grid-column:1/-1"><div class="state-icon">⏳</div><h3>Loading your bookings…</h3></div>`;

    try {
      // Note: Backend does not have a get-by-user endpoint yet,
      // so we load the stored booking IDs from localStorage
      const ids = getStoredBookingIds();
      if (!ids.length) { grid.innerHTML = emptyState(); return; }

      // Fetch each booking in parallel
      const results = await Promise.allSettled(
        ids.map(id => apiFetch(`/bookings/${id}`, { method: 'GET' }))
      );

      myBookings = results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value.data);

      renderBookings(myBookings);
    } catch (err) {
      grid.innerHTML = `<div class="state-box" style="grid-column:1/-1"><div class="state-icon">⚠️</div><h3>Could not load bookings</h3><p>${err.message}</p></div>`;
    }
  }

  function getStoredBookingIds() {
    try { return JSON.parse(localStorage.getItem('am_booking_ids') || '[]'); } catch { return []; }
  }

  function addStoredBookingId(id) {
    const ids = getStoredBookingIds();
    if (!ids.includes(id)) { ids.push(id); localStorage.setItem('am_booking_ids', JSON.stringify(ids)); }
  }

  function renderBookings(bookings) {
    const grid = document.getElementById('bookings-grid');
    if (!bookings.length) { grid.innerHTML = emptyState(); return; }
    grid.innerHTML = bookings.map(b => bookingCard(b)).join('');

    // Wire pay buttons
    grid.querySelectorAll('.btn-pay').forEach(btn => {
      btn.addEventListener('click', () => {
        const b = myBookings.find(x => String(x.id) === btn.dataset.bookingId);
        if (b) openPayModal(b);
      });
    });

    // Wire cancel buttons
    grid.querySelectorAll('.btn-cancel').forEach(btn => {
      btn.addEventListener('click', () => cancelBooking(btn.dataset.bookingId));
    });
  }

  function statusBadge(status) {
    const map = { INITIATED: 'initiated', CONFIRM: 'confirm', CANCEL: 'cancel', PENDING: 'pending' };
    const cls = map[status] || 'pending';
    return `<span class="badge badge-${cls}">${status}</span>`;
  }

  function bookingCard(b) {
    const dep    = b.flight?.departureAirport?.code || b.departureAirportId || '---';
    const arr    = b.flight?.arrivalAirport?.code  || b.arrivalAirportId   || '---';
    const created= new Date(b.createdAt).toLocaleString();
    const canPay = b.status === 'INITIATED';
    const canCancel = b.status === 'INITIATED' || b.status === 'PENDING';

    return `
    <div class="booking-card">
      <div class="bc-header">
        <div>
          <div class="bc-id">BOOKING #${b.id}</div>
          <div class="bc-flight-num">Flight ${b.flightId}</div>
        </div>
        ${statusBadge(b.status)}
      </div>
      <div class="bc-route">
        <div class="bc-route-code">${dep}</div>
        <div class="bc-route-arrow">
          <div class="bc-route-line"><span>✈</span></div>
          <span>Direct</span>
        </div>
        <div class="bc-route-code">${arr}</div>
      </div>
      <div class="bc-details">
        <div class="bc-detail"><span class="label">Seats</span><span class="value">${b.noOfSeats}</span></div>
        <div class="bc-detail"><span class="label">Booked</span><span class="value">${created}</span></div>
      </div>
      <div class="bc-total">
        <span class="label">Total Cost</span>
        <span class="amount">₹${Number(b.totalCost).toLocaleString('en-IN')}</span>
      </div>
      ${(canPay || canCancel) ? `
      <div class="bc-actions">
        ${canPay ? `<button class="btn-pay" data-booking-id="${b.id}">💳 Pay Now</button>` : ''}
        ${canCancel ? `<button class="btn-cancel" data-booking-id="${b.id}">Cancel</button>` : ''}
      </div>` : ''}
    </div>`;
  }

  function emptyState() {
    return `<div class="state-box" style="grid-column:1/-1">
      <div class="state-icon">🎫</div>
      <h3>No bookings yet</h3>
      <p>Search for flights and make your first booking!</p>
      <a href="flights.html" class="btn-primary" style="display:inline-block;width:auto;margin-top:20px;text-decoration:none;">Find Flights →</a>
    </div>`;
  }

  /* ── Payment Modal ── */
  const payModal     = document.getElementById('pay-modal');
  const payClose     = document.getElementById('pay-modal-close');
  const payAlert     = document.getElementById('pay-alert');
  const payForm      = document.getElementById('pay-form');
  const payIdKey     = document.getElementById('pay-idempotency-key');
  const paySummary   = document.getElementById('pay-summary');
  const payEmailInp  = document.getElementById('pay-email');

  function openPayModal(booking) {
    payingBooking = booking;
    const key = getIdempotencyKey(booking.id);
    if (payIdKey) payIdKey.textContent = key;

    const isRetry = !!localStorage.getItem(`payment_${booking.id}`);
    document.getElementById('pay-retry-hint').style.display = isRetry ? '' : 'none';

    // Pre-fill email
    const storedEmail = localStorage.getItem(`booking_email_${booking.id}`) || '';
    if (payEmailInp) payEmailInp.value = storedEmail;

    if (paySummary) paySummary.innerHTML = `
      <div class="row"><span class="label">Booking ID</span><span class="val">#${booking.id}</span></div>
      <div class="row"><span class="label">Flight</span><span class="val">${booking.flightId}</span></div>
      <div class="row"><span class="label">Seats</span><span class="val">${booking.noOfSeats}</span></div>
      <div class="row total"><span class="label">Total</span><span class="val">₹${Number(booking.totalCost).toLocaleString('en-IN')}</span></div>
    `;

    if (payAlert) payAlert.style.display = 'none';
    payModal.classList.add('open');
    payEmailInp?.focus();
  }

  if (payClose) payClose.addEventListener('click', () => payModal.classList.remove('open'));
  payModal?.addEventListener('click', e => { if (e.target === payModal) payModal.classList.remove('open'); });

  /* ── Make Payment ── */
  if (payForm) {
    payForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = payForm.querySelector('button[type="submit"]');
      const user = getUser();
      const email = payEmailInp?.value.trim();

      if (!email) { showAlert(payAlert, 'Please enter your email for the confirmation.'); return; }
      if (!payingBooking) return;

      // ─── Idempotency key: same key on retry, new key on fresh payment ───────
      const idempotencyKey = getIdempotencyKey(payingBooking.id);

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner"></span> Processing…';

      try {
        const result = await fetch(`${API_BASE}/bookings/payment`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-access-token': getToken(),
            'x-idempotency-key': idempotencyKey,     // ✅ Automatic idempotency
          },
          body: JSON.stringify({
            bookingId: payingBooking.id,
            userId: user.id,
            totalCost: payingBooking.totalCost,
            email,
          }),
        }).then(r => r.json());

        if (result.success === false) throw { message: result.message || 'Payment failed' };

        // Clear idempotency key — payment confirmed, next attempt is a new payment
        clearIdempotencyKey(payingBooking.id);

        payModal.classList.remove('open');
        showToast('✅ Payment confirmed! Check your email for the confirmation.', 'success');
        setTimeout(() => loadBookings(), 1500);
      } catch (err) {
        // Do NOT clear the key on failure — next retry must reuse it
        showAlert(payAlert, err.message || 'Payment failed. Click "Pay Now" again to retry safely.', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirm Payment';
      }
    });
  }

  /* ── Cancel Booking ── */
  async function cancelBooking(bookingId) {
    if (!confirm('Are you sure you want to cancel this booking?')) return;
    try {
      await apiFetch('/bookings/cancel', {
        method: 'DELETE',
        body: JSON.stringify({ bookingId: parseInt(bookingId) }),
      });
      showToast('Booking cancelled successfully.', 'success');
      setTimeout(() => loadBookings(), 1200);
    } catch (err) {
      showToast(err.message || 'Could not cancel booking.', 'error');
    }
  }

  /* ── Toast ── */
  function showToast(msg, type = 'success') {
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 5000);
  }

  /* ── Init ── */
  loadBookings();
});
