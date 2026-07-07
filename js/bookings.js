/**
 * bookings.js — My Bookings page
 *
 * Data Strategy:
 * ─────────────────────────────────────────────────────────────
 * The Booking Service has no GET-by-ID or GET-by-user endpoint.
 * So we persist the full booking object to localStorage at creation
 * time (in flights.js) and read from it here.
 *
 * Keys used:
 *   am_booking_ids              → JSON array of booking IDs (newest first)
 *   booking_data_<id>           → Full enriched booking object
 *   booking_email_<id>          → User's email for confirmation
 *   payment_<id>                → Idempotency key for payment
 *
 * Idempotency Strategy (Production-Ready):
 * ─────────────────────────────────────────
 * Every payment attempt generates: `payment_<id>_<timestamp>_<random>`
 * stored in localStorage. On retry the SAME key is reused — the backend
 * returns a cached result instead of charging again.
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

/* ── localStorage booking helpers ── */
const getStoredBookingIds = () => {
  try { return JSON.parse(localStorage.getItem('am_booking_ids') || '[]'); } catch { return []; }
};

const getStoredBooking = (id) => {
  try { return JSON.parse(localStorage.getItem(`booking_data_${id}`)); } catch { return null; }
};

const updateStoredBooking = (id, patch) => {
  const existing = getStoredBooking(id);
  if (!existing) return;
  localStorage.setItem(`booking_data_${id}`, JSON.stringify({ ...existing, ...patch }));
};

document.addEventListener('DOMContentLoaded', () => {
  requireAuth();

  let myBookings = [];
  let payingBooking = null;

  /* ── Load bookings from localStorage ── */
  function loadBookings() {
    const grid = document.getElementById('bookings-grid');
    const ids  = getStoredBookingIds();

    if (!ids.length) {
      grid.innerHTML = emptyState();
      return;
    }

    myBookings = ids
      .map(id => getStoredBooking(id))
      .filter(Boolean);

    if (!myBookings.length) {
      grid.innerHTML = emptyState();
      return;
    }

    renderBookings(myBookings);
  }

  function renderBookings(bookings) {
    const grid = document.getElementById('bookings-grid');
    grid.innerHTML = bookings.map(b => bookingCard(b)).join('');

    // Wire Pay buttons
    grid.querySelectorAll('.btn-pay').forEach(btn => {
      btn.addEventListener('click', () => {
        const b = myBookings.find(x => String(x.id) === String(btn.dataset.bookingId));
        if (b) openPayModal(b);
      });
    });

    // Wire Cancel buttons
    grid.querySelectorAll('.btn-cancel').forEach(btn => {
      btn.addEventListener('click', () => cancelBooking(btn.dataset.bookingId));
    });
  }

  function statusBadge(status) {
    const map = { INITIATED: 'initiated', CONFIRM: 'confirm', CANCEL: 'cancel', PENDING: 'pending' };
    const cls = map[status] || 'pending';
    const icons = { INITIATED: '⏳', CONFIRM: '✅', CANCEL: '❌', PENDING: '🔄' };
    return `<span class="badge badge-${cls}">${icons[status] || ''} ${status}</span>`;
  }

  function bookingCard(b) {
    const flight = b._flight || {};
    const dep    = flight.departureAirport?.code || flight.departureAirportId || '---';
    const arr    = flight.arrivalAirport?.code   || flight.arrivalAirportId   || '---';
    const depCity= flight.departureAirport?.cityDetails?.name || '';
    const arrCity= flight.arrivalAirport?.cityDetails?.name  || '';
    const created= b.createdAt ? new Date(b.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
    const canPay    = b.status === 'INITIATED';
    const canCancel = b.status === 'INITIATED' || b.status === 'PENDING';

    // 5-minute countdown if INITIATED
    let countdownHtml = '';
    if (canPay && b.createdAt) {
      const expiresAt = new Date(b.createdAt).getTime() + 5 * 60 * 1000;
      const remaining = expiresAt - Date.now();
      if (remaining > 0) {
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        countdownHtml = `<div class="bc-countdown" data-expires="${expiresAt}" data-booking="${b.id}">
          ⏱ Pay within <span class="countdown-time">${mins}m ${secs}s</span>
        </div>`;
      } else {
        countdownHtml = `<div style="font-size:0.78rem;color:var(--error);">⚠️ Booking may have expired</div>`;
      }
    }

    return `
    <div class="booking-card" id="booking-card-${b.id}">
      <div class="bc-header">
        <div>
          <div class="bc-id">BOOKING #${b.id}</div>
          <div class="bc-flight-num">Flight ${b.flightId}${flight.flightNumber ? ' · ' + flight.flightNumber : ''}</div>
        </div>
        ${statusBadge(b.status)}
      </div>

      <div class="bc-route">
        <div style="text-align:center;">
          <div class="bc-route-code">${dep}</div>
          ${depCity ? `<div style="font-size:0.72rem;color:var(--text-muted);">${depCity}</div>` : ''}
        </div>
        <div class="bc-route-arrow">
          <div class="bc-route-line"><span>✈</span></div>
          <span>Direct</span>
        </div>
        <div style="text-align:center;">
          <div class="bc-route-code">${arr}</div>
          ${arrCity ? `<div style="font-size:0.72rem;color:var(--text-muted);">${arrCity}</div>` : ''}
        </div>
      </div>

      <div class="bc-details">
        <div class="bc-detail"><span class="label">Seats</span><span class="value">${b.noOfSeats}</span></div>
        <div class="bc-detail"><span class="label">Booked</span><span class="value">${created}</span></div>
        ${flight.price ? `<div class="bc-detail"><span class="label">Per Seat</span><span class="value">₹${Number(flight.price).toLocaleString('en-IN')}</span></div>` : ''}
      </div>

      ${countdownHtml}

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
      <a href="flights.html" class="btn-primary" style="display:inline-block;width:auto;margin-top:20px;text-decoration:none;padding:12px 28px;">Find Flights →</a>
    </div>`;
  }

  /* ── Live countdown timers ── */
  function startCountdowns() {
    const timers = document.querySelectorAll('.bc-countdown');
    timers.forEach(el => {
      const expires   = parseInt(el.dataset.expires);
      const bookingId = el.dataset.booking;
      const display   = el.querySelector('.countdown-time');

      const tick = () => {
        const remaining = expires - Date.now();
        if (remaining <= 0) {
          display.textContent = 'Expired';
          display.style.color = 'var(--error)';
          // Update status in localStorage to reflect expiry
          updateStoredBooking(bookingId, { status: 'CANCEL' });
          // Re-render this card
          const idx = myBookings.findIndex(b => String(b.id) === String(bookingId));
          if (idx !== -1) {
            myBookings[idx] = { ...myBookings[idx], status: 'CANCEL' };
            document.getElementById(`booking-card-${bookingId}`)?.replaceWith(
              document.createRange().createContextualFragment(bookingCard(myBookings[idx]))
            );
          }
          return;
        }
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        display.textContent = `${mins}m ${secs}s`;
        display.style.color = remaining < 60000 ? 'var(--error)' : 'var(--warning)';
        setTimeout(tick, 1000);
      };
      tick();
    });
  }

  /* ── 3-State Payment Modal Logic ── */
  const payModal   = document.getElementById('pay-modal');
  const payClose   = document.getElementById('pay-modal-close');
  const payAlert   = document.getElementById('pay-alert');
  const payForm    = document.getElementById('pay-form');
  const payIdKey   = document.getElementById('pay-idempotency-key');
  const paySummary = document.getElementById('pay-summary');
  const payEmailEl = document.getElementById('pay-email');
  const retryHint  = document.getElementById('pay-retry-hint');

  // Views
  const viewForm     = document.getElementById('pay-view-form');
  const viewProc     = document.getElementById('pay-view-processing');
  const viewConf     = document.getElementById('pay-view-confirmed');

  // Processing elements
  const procRing     = document.getElementById('pay-ring');
  const procStatus   = document.getElementById('pay-proc-status');
  const procSub      = document.getElementById('pay-proc-sub');
  const procCount    = document.getElementById('pay-countdown');
  const procSummary  = document.getElementById('pay-proc-summary');
  const btnAbort     = document.getElementById('pay-abort-btn');

  // Confirmed elements
  const confDetail   = document.getElementById('pay-conf-detail');
  const confNote     = document.getElementById('pay-conf-email-note');
  const confClose    = document.getElementById('pay-conf-close');

  let abortCtrl = null;
  let animFrame = null;

  function resetModal() {
    viewForm.style.display = 'block';
    viewProc.style.display = 'none';
    viewConf.style.display = 'none';
    if (payAlert) payAlert.style.display = 'none';
    if (animFrame) cancelAnimationFrame(animFrame);
    abortCtrl = null;
  }

  function openPayModal(booking) {
    payingBooking = booking;
    resetModal();

    const existingKey = localStorage.getItem(`payment_${booking.id}`);
    const idempotencyKey = existingKey || (() => {
      const k = `payment_${booking.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem(`payment_${booking.id}`, k);
      return k;
    })();

    if (payIdKey)  payIdKey.textContent = idempotencyKey;
    if (retryHint) retryHint.style.display = existingKey ? 'flex' : 'none';

    const storedEmail = localStorage.getItem(`booking_email_${booking.id}`) || booking._email || '';
    if (payEmailEl) payEmailEl.value = storedEmail;

    const flight = booking._flight || {};
    const dep    = flight.departureAirport?.code || flight.departureAirportId || '---';
    const arr    = flight.arrivalAirport?.code   || flight.arrivalAirportId   || '---';
    const summaryHtml = `
      <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Route</span><strong>${dep} → ${arr}</strong></div>
      <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Booking</span><strong>#${booking.id}</strong></div>
      <div style="display:flex;justify-content:space-between;padding:4px 0;"><span>Total</span><strong style="color:var(--accent);">₹${Number(booking.totalCost).toLocaleString('en-IN')}</strong></div>
    `;
    if (paySummary) paySummary.innerHTML = summaryHtml;
    if (procSummary) procSummary.innerHTML = summaryHtml;
    
    payModal.classList.add('open');
    payEmailEl?.focus();
  }

  function closeModal() {
    if (abortCtrl) return; // Prevent closing while processing
    payModal.classList.remove('open');
  }

  payClose?.addEventListener('click', closeModal);
  confClose?.addEventListener('click', closeModal);
  payModal?.addEventListener('click', e => { if (e.target === payModal) closeModal(); });

  /* ── Form Submit → Process Payment ── */
  if (payForm) {
    payForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = payEmailEl?.value.trim();
      if (!email) { showAlert(payAlert, 'Please enter your confirmation email.'); return; }
      if (!payingBooking) return;

      localStorage.setItem(`booking_email_${payingBooking.id}`, email);

      // Switch to Processing View
      viewForm.style.display = 'none';
      viewProc.style.display = 'block';

      const idempotencyKey = localStorage.getItem(`payment_${payingBooking.id}`);
      const DURATION_MS = 3000;
      const circumference = 339.3;
      const statusMsgs = [
        { at: 0,    status: 'Securing your booking',      sub: 'Encrypting payment details…' },
        { at: 900,  status: 'Verifying availability',     sub: 'Checking real-time inventory…' },
        { at: 1800, status: 'Processing payment',         sub: 'Almost there…' },
      ];

      abortCtrl = new AbortController();
      let aborted = false;
      const startTime = Date.now();
      let msgIndex = 0;

      // ── Start Animation ──
      function animate() {
        if (aborted) return;
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / DURATION_MS, 1);

        if (procRing) procRing.style.strokeDashoffset = circumference * (1 - progress);
        
        const remaining = Math.max(0, Math.ceil((DURATION_MS - elapsed) / 1000));
        if (procCount) procCount.textContent = remaining;

        for (let i = statusMsgs.length - 1; i >= 0; i--) {
          if (elapsed >= statusMsgs[i].at && msgIndex <= i) {
            if (procStatus) procStatus.textContent = statusMsgs[i].status;
            if (procSub) procSub.textContent = statusMsgs[i].sub;
            msgIndex = i + 1;
            break;
          }
        }
        if (progress < 1) animFrame = requestAnimationFrame(animate);
      }
      animFrame = requestAnimationFrame(animate);

      // ── Start API Call ──
      const user = getUser();
      const apiPromise = fetch(`${API_BASE}/booking/payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-access-token': getToken(),
          'x-idempotency-key': idempotencyKey,
        },
        body: JSON.stringify({
          bookingId: payingBooking.id,
          userId: user.id,
          totalCost: payingBooking.totalCost,
          email,
        }),
        signal: abortCtrl.signal
      }).then(r => r.json());

      const timerPromise = new Promise(resolve => setTimeout(resolve, DURATION_MS + 100));

      try {
        const [result] = await Promise.all([apiPromise, timerPromise]);
        if (aborted) return;
        if (result.success === false) throw new Error(result.message || 'Payment failed');

        // Success!
        localStorage.removeItem(`payment_${payingBooking.id}`);
        updateStoredBooking(payingBooking.id, { status: 'CONFIRM' });
        
        // Switch to Confirmed View
        viewProc.style.display = 'none';
        viewConf.style.display = 'block';
        abortCtrl = null;

        const flight = payingBooking._flight || {};
        if (confDetail) confDetail.innerHTML = `
          <div><strong>Booking:</strong> #${payingBooking.id}</div>
          <div><strong>Flight:</strong> ${payingBooking.flightId}${flight.flightNumber ? ' · ' + flight.flightNumber : ''}</div>
          <div><strong>Seats:</strong> ${payingBooking.noOfSeats}</div>
          <div style="margin-top:6px;font-size:1.05rem;color:var(--success);"><strong>Total Paid: ₹${Number(payingBooking.totalCost).toLocaleString('en-IN')}</strong></div>
        `;
        if (confNote) confNote.textContent = `📧 A receipt has been sent to ${email} via our notification service.`;

        // Update cards in background
        myBookings = myBookings.map(b => String(b.id) === String(payingBooking.id) ? { ...b, status: 'CONFIRM' } : b);
        renderBookings(myBookings);
        startCountdowns();

      } catch (err) {
        if (aborted || err.name === 'AbortError') return;
        resetModal();
        showAlert(payAlert, err.message || 'Payment failed. You can safely retry.', 'error');
      }
    });
  }

  /* ── Abort Button ── */
  if (btnAbort) {
    btnAbort.addEventListener('click', () => {
      if (!abortCtrl) return;
      abortCtrl.abort();
      resetModal();
      payModal.classList.remove('open');
      showToast('Payment aborted.', 'error');
    });
  }




  /* ── Cancel Booking ── */
  async function cancelBooking(bookingId) {
    if (!confirm('Cancel this booking? Seats will be released immediately.')) return;

    try {
      await apiFetch('/booking/cancel', {
        method: 'DELETE',
        body: JSON.stringify({ bookingId: parseInt(bookingId) }),
      });

      // Update local cache
      updateStoredBooking(bookingId, { status: 'CANCEL' });
      myBookings = myBookings.map(b =>
        String(b.id) === String(bookingId) ? { ...b, status: 'CANCEL' } : b
      );
      renderBookings(myBookings);
      startCountdowns();
      showToast('Booking cancelled. Seats have been released.', 'success');
    } catch (err) {
      showToast(err.message || 'Could not cancel. Please try again.', 'error');
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
  startCountdowns();
});
