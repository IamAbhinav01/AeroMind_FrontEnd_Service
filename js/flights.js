/* flights.js — Search flights and create booking */

document.addEventListener('DOMContentLoaded', () => {

  /* ── Pre-fill from URL params (quick search hand-off) ── */
  const params = new URLSearchParams(window.location.search);
  const preFrom  = params.get('from') || '';
  const preTo    = params.get('to')   || '';
  const preDate  = params.get('date') || new Date().toISOString().split('T')[0];
  const prePax   = params.get('pax')  || 1;

  const fFrom  = document.getElementById('f-from');
  const fTo    = document.getElementById('f-to');
  const fDate  = document.getElementById('f-date');
  const fPax   = document.getElementById('f-pax');
  const fSort  = document.getElementById('f-sort');
  const fMin   = document.getElementById('f-min-price');
  const fMax   = document.getElementById('f-max-price');

  if (fFrom) fFrom.value = preFrom;
  if (fTo)   fTo.value   = preTo;
  if (fDate) fDate.value = preDate;
  if (fPax)  fPax.value  = prePax;

  /* ── State ── */
  let allFlights = [];
  let selectedFlight = null;

  /* ── Search ── */
  async function searchFlights() {
    const listEl   = document.getElementById('flights-list');
    const countEl  = document.getElementById('results-count');
    listEl.innerHTML = renderState('loading');

    try {
      const query = {};
      const from  = fFrom?.value.trim();
      const to    = fTo?.value.trim();
      const date  = fDate?.value;
      const sort  = fSort?.value;
      const min   = fMin?.value;
      const max   = fMax?.value;
      const pax   = parseInt(fPax?.value || 1);

      // Build trips param: "DEP-ARR" format used by backend
      if (from && to) query.trips = `${from.toUpperCase()}-${to.toUpperCase()}`;
      if (date)       query.tripDate = date;
      if (sort)       query.sort = sort;
      if (min && max) query.price = `${min}-${max}`;
      if (pax > 0)    query.travellers = pax;

      const qs = new URLSearchParams(query).toString();
      const data = await apiFetch(`/flights${qs ? '?' + qs : ''}`);
      allFlights = data.data || [];

      countEl.innerHTML = `<strong>${allFlights.length}</strong> flight${allFlights.length !== 1 ? 's' : ''} found`;
      renderFlights(allFlights);
    } catch (err) {
      listEl.innerHTML = renderState('error', err.message);
      if (countEl) countEl.innerHTML = '';
    }
  }

  function renderFlights(flights) {
    const listEl = document.getElementById('flights-list');
    if (!flights.length) { listEl.innerHTML = renderState('empty'); return; }
    listEl.innerHTML = flights.map(f => flightCard(f)).join('');
    listEl.querySelectorAll('.btn-book').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.flightId;
        openBookModal(allFlights.find(f => String(f.id) === id));
      });
    });
  }

  function flightCard(f) {
    const dep = f.departureAirport?.code || f.departureAirportId || '---';
    const arr = f.arrivalAirport?.code  || f.arrivalAirportId   || '---';
    const depCity = f.departureAirport?.cityDetails?.name || '';
    const arrCity = f.arrivalAirport?.cityDetails?.name  || '';
    const depTime = f.departureTime ? new Date(f.departureTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
    const arrTime = f.arrivalTime   ? new Date(f.arrivalTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })   : '--:--';

    let duration = '';
    if (f.departureTime && f.arrivalTime) {
      const mins = Math.round((new Date(f.arrivalTime) - new Date(f.departureTime)) / 60000);
      duration = `${Math.floor(mins / 60)}h ${mins % 60}m`;
    }

    const seatsColor = f.totalSeats < 10 ? 'color:var(--error)' : '';
    return `
    <div class="flight-card">
      <div class="fc-airline">
        <div class="fc-airline-name">${f.airplane?.modelNumber || 'AeroMind Air'}</div>
        <div class="fc-flight-num">${f.flightNumber || 'AM' + f.id}</div>
      </div>
      <div class="fc-route">
        <div class="fc-airport">
          <div class="fc-airport-code">${dep}</div>
          <div class="fc-airport-time">${depTime}</div>
          ${depCity ? `<div class="fc-airport-time">${depCity}</div>` : ''}
        </div>
        <div class="fc-line">
          <div class="fc-duration">${duration}</div>
          <div class="fc-line-bar"><span class="fc-plane">✈</span></div>
          <div class="fc-stops">Direct</div>
        </div>
        <div class="fc-airport">
          <div class="fc-airport-code">${arr}</div>
          <div class="fc-airport-time">${arrTime}</div>
          ${arrCity ? `<div class="fc-airport-time">${arrCity}</div>` : ''}
        </div>
      </div>
      <div class="fc-info">
        <div class="fc-seats" style="${seatsColor}">${f.totalSeats}</div>
        <div class="fc-seats-label">seats left</div>
      </div>
      <div class="fc-price">
        <div class="fc-price-amount">₹${Number(f.price).toLocaleString('en-IN')}</div>
        <div class="fc-price-unit">per seat</div>
      </div>
      <div class="fc-action">
        <button class="btn-book" data-flight-id="${f.id}">Book Now</button>
      </div>
    </div>`;
  }

  function renderState(type, msg = '') {
    if (type === 'loading') return `<div class="state-box"><div class="state-icon">⏳</div><h3>Searching flights…</h3><p>Fetching real-time availability.</p></div>`;
    if (type === 'empty')   return `<div class="state-box"><div class="state-icon">🔍</div><h3>No flights found</h3><p>Try different dates, airports, or fewer passengers.</p></div>`;
    if (type === 'error')   return `<div class="state-box"><div class="state-icon">⚠️</div><h3>Something went wrong</h3><p>${msg || 'Could not reach the server.'}</p></div>`;
    return '';
  }

  /* ── Book Modal ── */
  const modal        = document.getElementById('book-modal');
  const modalClose   = document.getElementById('modal-close');
  const modalRoute   = document.getElementById('modal-route');
  const modalMeta    = document.getElementById('modal-meta');
  const seatsInput   = document.getElementById('modal-seats');
  const emailInput   = document.getElementById('modal-email');
  const costPreview  = document.getElementById('modal-cost');
  const bookForm     = document.getElementById('modal-book-form');
  const bookAlert    = document.getElementById('modal-alert');

  function openBookModal(flight) {
    if (!getToken()) { window.location.href = 'signin.html'; return; }
    selectedFlight = flight;
    const dep = flight.departureAirport?.code || flight.departureAirportId;
    const arr = flight.arrivalAirport?.code  || flight.arrivalAirportId;
    modalRoute.textContent = `${dep} → ${arr}`;
    modalMeta.textContent  = `${flight.flightNumber || 'Flight'} · ₹${Number(flight.price).toLocaleString('en-IN')} per seat · ${flight.totalSeats} seats available`;
    if (seatsInput) seatsInput.value = 1;
    updateCostPreview();
    if (bookAlert) bookAlert.style.display = 'none';
    modal.classList.add('open');
    seatsInput?.focus();
  }

  function updateCostPreview() {
    if (!selectedFlight || !costPreview) return;
    const seats = parseInt(seatsInput?.value || 1);
    const cost  = seats * selectedFlight.price;
    costPreview.textContent = `₹${Number(cost).toLocaleString('en-IN')}`;
  }

  if (seatsInput) seatsInput.addEventListener('input', updateCostPreview);
  if (modalClose) modalClose.addEventListener('click', () => modal.classList.remove('open'));
  modal?.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });

  /* ── Create Booking ── */
  if (bookForm) {
    bookForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = bookForm.querySelector('button[type="submit"]');
      const user = getUser();
      if (!user) { window.location.href = 'signin.html'; return; }

      const seats = parseInt(seatsInput.value);
      const email = emailInput?.value.trim();

      if (!seats || seats < 1) { showAlert(bookAlert, 'Please enter a valid number of seats.'); return; }
      if (seats > selectedFlight.totalSeats) { showAlert(bookAlert, `Only ${selectedFlight.totalSeats} seats available.`); return; }

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner"></span> Booking…';

      try {
        const result = await apiFetch('/bookings', {
          method: 'POST',
          body: JSON.stringify({
            flightId: selectedFlight.id,
            userId: user.id,
            noOfSeats: seats,
          }),
        });

        // Store email for payment step
        if (email) localStorage.setItem(`booking_email_${result.data.id}`, email);

        modal.classList.remove('open');
        showToast(`✅ Booking #${result.data.id} created! Pay within 5 minutes.`, 'success');
        setTimeout(() => { window.location.href = 'my-bookings.html'; }, 2200);
      } catch (err) {
        showAlert(bookAlert, err.message || 'Booking failed. Please try again.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirm Booking';
      }
    });
  }

  /* ── Toast notification ── */
  function showToast(msg, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 400); }, 4000);
  }

  /* ── Search button ── */
  document.getElementById('filter-search-btn')?.addEventListener('click', searchFlights);

  /* ── Keyboard enter ── */
  document.querySelectorAll('.filter-field input').forEach(el => {
    el.addEventListener('keydown', e => { if (e.key === 'Enter') searchFlights(); });
  });

  /* ── Auto-search on page load ── */
  searchFlights();
});
