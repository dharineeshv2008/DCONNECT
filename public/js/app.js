/**
 * D-Connect Disaster Management Coordination App - Frontend Engine
 * Realtime Supabase Subscriptions, Toast Notifications, and Strict Manual Auth
 */

const API_BASE = '/api';

// Supabase Project Credentials
const SUPABASE_CONFIG = {
  url: 'https://qpxnsxphwufrnfejphat.supabase.co',
  publishableKey: 'sb_publishable_-czHfII217kgXwBOhtB9kw_TA964s7l'
};

// Application State
let currentUser = null;
let selectedLoginRole = 'USER';
let currentCoords = { latitude: 13.0827, longitude: 80.2707 }; // Fallback coordinates
let activeDisasterIdForComments = null;
let isOffline = !navigator.onLine;
let supabaseClient = null;

// ==============================================================================
// 1. INITIALIZATION & LIFECYCLE
// ==============================================================================

document.addEventListener('DOMContentLoaded', () => {
  initNetworkListeners();
  initGeolocation();
  initSupabaseRealtime();
  restoreSession();

  // Requirement 8: Real-time 10s periodic polling fallback sync
  setInterval(() => {
    if (currentUser && currentUser.approved) {
      const activeTab = document.querySelector('.tab-content.active');
      if (activeTab && activeTab.id === 'feedTab') {
        loadDisasters();
      } else if (activeTab && activeTab.id === 'adminTab') {
        loadAdminReportsTable();
      }
    }
  }, 10000);
});

// Resilient API Fetch Helper (Guarantees JSON parsing & handles non-JSON HTML errors safely)
async function fetchAPI(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  const defaultHeaders = { 'Content-Type': 'application/json' };
  
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    options.body = JSON.stringify(options.body);
  }
  options.headers = { ...defaultHeaders, ...options.headers };

  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || '';
    
    let data;
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      const text = await res.text();
      try {
        data = JSON.parse(text);
      } catch (e) {
        // If server returned HTML (e.g. 404 or 500 html page), format into a clean error object
        data = {
          success: false,
          status: res.status,
          message: res.status === 404 ? 'Resource or endpoint not found' : 'Server returned invalid response format'
        };
      }
    }

    if (!res.ok) {
      const errorObj = new Error(data.message || `Request failed with HTTP status ${res.status}`);
      errorObj.status = res.status;
      errorObj.data = data;
      throw errorObj;
    }

    return data;
  } catch (err) {
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      err.message = 'Network error. Please check your internet connection.';
    }
    throw err;
  }
}

// ==============================================================================
// 2. SUPABASE REALTIME SUBSCRIPTIONS
// ==============================================================================

function initSupabaseRealtime() {
  try {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.publishableKey);
      console.log('⚡ [Supabase]: Realtime client initialized successfully.');

      // Channel 1: Live Disasters
      supabaseClient
        .channel('public:disasters')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'disasters' }, payload => {
          console.log('🚨 [Realtime]: Disaster change detected:', payload.eventType);
          if (payload.eventType === 'INSERT') {
            showToast('New Incident Reported', `🚨 ${payload.new.title} (${payload.new.type})`, 'warning');
          } else if (payload.eventType === 'UPDATE') {
            showToast('Incident Status Updated', `Disaster #${payload.new.id} status changed to ${payload.new.status}`, 'info');
          }
          if (document.getElementById('feedTab')?.classList.contains('active')) {
            loadDisasters();
          }
          if (currentUser?.role === 'ADMIN') {
            if (typeof loadAdminReportsTable === 'function') loadAdminReportsTable();
            if (typeof loadAdminPendingDisasters === 'function') loadAdminPendingDisasters();
            if (typeof loadAdminAnalytics === 'function') loadAdminAnalytics();
          }
        })
        .subscribe();

      // Channel 2: Volunteer Assignments
      supabaseClient
        .channel('public:assignments')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments' }, payload => {
          console.log('🤝 [Realtime]: Volunteer mission update:', payload.eventType);
          if (document.getElementById('volunteerTab')?.classList.contains('active')) {
            loadVolunteerAssignments();
          }
        })
        .subscribe();

      // Channel 3: Discussion Comments
      supabaseClient
        .channel('public:comments')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments' }, payload => {
          if (activeDisasterIdForComments && payload.new.disaster_id === activeDisasterIdForComments) {
            loadComments(activeDisasterIdForComments);
          }
        })
        .subscribe();

      // Channel 4: Emergency Resource Pool
      supabaseClient
        .channel('public:resources')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'resources' }, payload => {
          console.log('📦 [Realtime]: Resource change detected:', payload.eventType);
          if (payload.eventType === 'INSERT') {
            showToast('New Resource Offered', `📦 ${payload.new.resource_name || payload.new.description || 'Emergency Resource'} contributed`, 'info');
          } else if (payload.eventType === 'UPDATE') {
            showToast('Resource Status Updated', `Resource #${payload.new.id} status changed to ${payload.new.status}`, 'info');
          }
          if (typeof loadResources === 'function') loadResources();
          if (currentUser?.role === 'ADMIN' && typeof loadAdminResourcesTable === 'function') loadAdminResourcesTable();
        })
        .subscribe();

    } else {
      console.info('ℹ️ [Supabase]: SDK not loaded via CDN, continuing with standard REST pipeline.');
    }
  } catch (err) {
    console.warn('⚠️ [Supabase Realtime]: Could not bind realtime subscriptions:', err.message);
  }
}

// ==============================================================================
// 3. TOAST NOTIFICATION ENGINE (REPLACES ALL RAW ALERTS)
// ==============================================================================

function showToast(title, message, type = 'info', durationMs = 4000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };

  const toast = document.createElement('div');
  toast.className = `toast-item toast-${type}`;
  toast.innerHTML = `
    <div class="toast-icon">${icons[type] || 'ℹ️'}</div>
    <div class="toast-content">
      <div class="toast-title">${escapeHtml(title)}</div>
      <div class="toast-message">${escapeHtml(message)}</div>
    </div>
    <button class="toast-close-btn" onclick="dismissToast(this.parentElement)">✕</button>
    <div class="toast-progress" style="animation-duration: ${durationMs}ms;"></div>
  `;

  container.appendChild(toast);

  const timeoutId = setTimeout(() => {
    dismissToast(toast);
  }, durationMs);

  toast._timeoutId = timeoutId;
}

function dismissToast(toastEl) {
  if (!toastEl || toastEl._isDismissing) return;
  toastEl._isDismissing = true;
  clearTimeout(toastEl._timeoutId);
  toastEl.classList.add('toast-hiding');
  setTimeout(() => {
    if (toastEl.parentElement) {
      toastEl.parentElement.removeChild(toastEl);
    }
  }, 300);
}

// ==============================================================================
// 4. NETWORK & ERROR MONITORING
// ==============================================================================

function initNetworkListeners() {
  window.addEventListener('offline', () => {
    isOffline = true;
    document.getElementById('offlineBanner').style.display = 'block';
    showToast('Offline Mode', 'Internet connection lost. Working in offline mode.', 'error');
  });

  window.addEventListener('online', () => {
    isOffline = false;
    document.getElementById('offlineBanner').style.display = 'none';
    showToast('Reconnected', 'Internet connection restored.', 'success');
    reloadCurrentData();
  });

  if (!navigator.onLine) {
    document.getElementById('offlineBanner').style.display = 'block';
  }
}

function handleApiError(err, fallbackMessage = 'An unexpected error occurred') {
  console.error('API Error:', err);
  if (!navigator.onLine) {
    document.getElementById('offlineBanner').style.display = 'block';
    return;
  }

  if (err && (err.status === 401 || err.message?.includes('User session invalid') || err.message?.includes('Please login again'))) {
    showToast('Session Invalid', 'User session invalid. Please login again.', 'error');
    logout();
    return;
  }

  if (err && err.status === 403 && (err.data?.error === 'Account Pending Approval' || err.message?.includes('approved by the Administrator'))) {
    showPendingApprovalView();
    return;
  }

  if (err && err.status === 403) {
    showAccessDeniedView();
    return;
  }

  if (err && err.status === 404) {
    showNotFoundView();
    return;
  }

  if (err && err.status >= 500) {
    showServerErrorView();
    return;
  }

  showToast('Action Failed', err.message || fallbackMessage, 'error');
}

function hideAllErrorViews() {
  document.getElementById('approvalPendingView').style.display = 'none';
  document.getElementById('accessDeniedView').style.display = 'none';
  document.getElementById('notFoundView').style.display = 'none';
  document.getElementById('serverErrorView').style.display = 'none';
}

function showPendingApprovalView() {
  showDashboardApp();
  hideAllTabs();
  hideAllErrorViews();
  document.getElementById('approvalPendingView').style.display = 'block';
  if (currentUser && currentUser.organizationName) {
    document.getElementById('pendingOrgName').textContent = currentUser.organizationName;
  }
}

function showAccessDeniedView() {
  showDashboardApp();
  hideAllTabs();
  hideAllErrorViews();
  document.getElementById('accessDeniedView').style.display = 'block';
}

function showNotFoundView() {
  showDashboardApp();
  hideAllTabs();
  hideAllErrorViews();
  document.getElementById('notFoundView').style.display = 'block';
}

function showServerErrorView() {
  showDashboardApp();
  hideAllTabs();
  hideAllErrorViews();
  document.getElementById('serverErrorView').style.display = 'block';
}

function reloadCurrentData() {
  hideAllErrorViews();
  switchTab('feedTab');
}

// ==============================================================================
// 5. GEOLOCATION
// ==============================================================================

function initGeolocation() {
  captureBrowserLocation();
}

function captureBrowserLocation() {
  const statusEl = document.getElementById('geoStatusText');
  if (!navigator.geolocation) {
    if (statusEl) statusEl.textContent = 'Geolocation not supported. Using default coordinates.';
    populateFormCoords(currentCoords.latitude, currentCoords.longitude);
    return;
  }

  if (statusEl) statusEl.textContent = 'Acquiring GPS fix...';

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      currentCoords = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude
      };
      if (statusEl) {
        statusEl.innerHTML = `<span style="font-family: monospace; font-weight: 700;">${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}</span> (Accuracy: ±${Math.round(pos.coords.accuracy)}m)`;
      }
      populateFormCoords(pos.coords.latitude, pos.coords.longitude);
      if (currentUser) loadDisasters();
    },
    (err) => {
      console.warn('Geolocation fallback:', err.message);
      if (statusEl) statusEl.textContent = `Default (Chennai, IN: ${currentCoords.latitude}, ${currentCoords.longitude})`;
      populateFormCoords(currentCoords.latitude, currentCoords.longitude);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
  );
}

function populateFormCoords(lat, lon) {
  const latInput = document.getElementById('reportLatitude');
  const lonInput = document.getElementById('reportLongitude');
  if (latInput && lonInput) {
    latInput.value = lat;
    lonInput.value = lon;
  }
}

// ==============================================================================
// 6. STRICT MANUAL AUTHENTICATION (PHONE + PASSWORD)
// ==============================================================================

function selectLoginRole(role, btnEl) {
  selectedLoginRole = role;
  document.querySelectorAll('#loginRoleTabs .role-tab-item').forEach(btn => btn.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  const phoneInput = document.getElementById('landingLoginPhone');
  const passInput = document.getElementById('landingLoginPassword');
  const alertBox = document.getElementById('landingLoginAlert');

  if (phoneInput) phoneInput.value = '';
  if (passInput) passInput.value = '';
  if (alertBox) alertBox.innerHTML = '';

  handleLoginInputChange();
}

function handleLoginInputChange() {
  const phoneInput = document.getElementById('landingLoginPhone');
  const passInput = document.getElementById('landingLoginPassword');
  const submitBtn = document.getElementById('landingLoginBtn');
  const helper = document.getElementById('loginInputHelper');

  if (!phoneInput || !passInput || !submitBtn) return;

  phoneInput.value = phoneInput.value.replace(/\D/g, '').slice(0, 10);
  const phone = phoneInput.value;
  const password = passInput.value;

  const isPhoneValid = phone.length === 10;
  const isPassValid = password.length > 0;

  if (phone.length > 0 && phone.length < 10) {
    if (helper) {
      helper.style.display = 'block';
      helper.textContent = `Phone number requires 10 digits (${phone.length}/10)`;
      helper.style.color = '#d97706';
    }
  } else {
    if (helper) helper.style.display = 'none';
  }

  submitBtn.disabled = !(isPhoneValid && isPassValid);
}

function restoreSession() {
  const stored = localStorage.getItem('dconnect_user');
  if (stored) {
    try {
      currentUser = JSON.parse(stored);
      showDashboardApp();
      updateUserUI();
      loadDisasters();
    } catch (e) {
      localStorage.removeItem('dconnect_user');
      showAuthLanding();
    }
  } else {
    showAuthLanding();
  }
}

function showAuthLanding() {
  document.getElementById('authLandingScreen').style.display = 'flex';
  document.getElementById('mainDashboardApp').style.display = 'none';
  
  const phoneInput = document.getElementById('landingLoginPhone');
  const passInput = document.getElementById('landingLoginPassword');
  if (phoneInput) phoneInput.value = '';
  if (passInput) passInput.value = '';
  handleLoginInputChange();
}

function showDashboardApp() {
  document.getElementById('authLandingScreen').style.display = 'none';
  document.getElementById('mainDashboardApp').style.display = 'flex';
}

function updateUserUI() {
  const roleBadge = document.getElementById('userBadgeRole');
  const nameDisp = document.getElementById('userNameDisplay');
  const adminNav = document.getElementById('adminNavBtn');

  if (currentUser) {
    roleBadge.textContent = currentUser.role;
    roleBadge.className = `badge badge-${currentUser.role.toLowerCase().replace('_', '')}`;
    nameDisp.textContent = currentUser.name + (currentUser.organizationName ? ` (${currentUser.organizationName})` : '');

    if (currentUser.role === 'ADMIN') {
      adminNav.style.display = 'block';
    } else {
      adminNav.style.display = 'none';
    }

    if (!currentUser.approved && (currentUser.role === 'NGO' || currentUser.role === 'GOVERNMENT_AGENCY')) {
      showPendingApprovalView();
    }
  }
}

function logout() {
  currentUser = null;
  localStorage.removeItem('dconnect_user');
  hideAllErrorViews();
  showAuthLanding();
  showToast('Logged Out', 'You have been safely signed out.', 'info');
}

function toggleOrgFields() {
  const role = document.getElementById('regRole').value;
  const orgFields = document.getElementById('orgFields');
  const volFields = document.getElementById('volunteerFields');

  if (role === 'NGO' || role === 'GOVERNMENT_AGENCY') {
    orgFields.style.display = 'block';
    document.getElementById('regOrgName').required = true;
  } else {
    orgFields.style.display = 'none';
    document.getElementById('regOrgName').required = false;
  }

  if (role === 'VOLUNTEER') {
    volFields.style.display = 'block';
  } else {
    volFields.style.display = 'none';
  }
}

async function handleLandingLogin(e) {
  e.preventDefault();
  const alertBox = document.getElementById('landingLoginAlert');
  const submitBtn = document.getElementById('landingLoginBtn');
  const spinner = document.getElementById('loginBtnSpinner');
  const btnText = document.getElementById('loginBtnText');

  alertBox.innerHTML = '';

  const phone = document.getElementById('landingLoginPhone').value.trim();
  const password = document.getElementById('landingLoginPassword').value;

  if (phone.length !== 10) {
    alertBox.innerHTML = `<div class="alert alert-danger" style="padding: 8px 12px; font-size: 0.82rem;">Please enter a valid 10-digit phone number.</div>`;
    return;
  }

  if (!password) {
    alertBox.innerHTML = `<div class="alert alert-danger" style="padding: 8px 12px; font-size: 0.82rem;">Please enter your password.</div>`;
    return;
  }

  submitBtn.disabled = true;
  if (spinner) spinner.style.display = 'inline-block';
  if (btnText) btnText.textContent = 'Verifying...';

  try {
    const data = await fetchAPI('/auth/login', {
      method: 'POST',
      body: { phone, password, role: selectedLoginRole }
    });

    currentUser = data.data;
    localStorage.setItem('dconnect_user', JSON.stringify(currentUser));
    
    document.getElementById('landingLoginPassword').value = '';

    showDashboardApp();
    updateUserUI();
    showToast('Welcome Back', `Logged in as ${currentUser.name}`, 'success');

    if (!currentUser.approved) {
      showPendingApprovalView();
    } else {
      switchTab('feedTab');
    }
  } catch (err) {
    alertBox.innerHTML = `<div class="alert alert-danger" style="padding: 8px 12px; font-size: 0.82rem;">${err.message || 'Invalid credentials. Please check your phone and password.'}</div>`;
  } finally {
    submitBtn.disabled = false;
    if (spinner) spinner.style.display = 'none';
    if (btnText) btnText.textContent = 'Login ➔';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const alertBox = document.getElementById('registerAlertBox');
  alertBox.innerHTML = '';

  const payload = {
    name: document.getElementById('regName').value.trim(),
    phone: document.getElementById('regPhone').value.trim(),
    password: document.getElementById('regPassword').value,
    role: document.getElementById('regRole').value,
    organizationName: document.getElementById('regOrgName').value.trim() || null,
    organizationRegNo: document.getElementById('regOrgRegNo').value.trim() || null,
    volunteerSkills: document.getElementById('regSkills').value.trim() || null
  };

  try {
    const data = await fetchAPI('/auth/register', {
      method: 'POST',
      body: payload
    });

    currentUser = data.data;
    localStorage.setItem('dconnect_user', JSON.stringify(currentUser));
    closeModal('registerModal');
    
    showDashboardApp();
    updateUserUI();

    if (!currentUser.approved) {
      showPendingApprovalView();
      showToast('Registration Pending', 'Your organization account is awaiting Admin verification.', 'warning');
    } else {
      showToast('Registration Success', `Welcome to D-Connect, ${currentUser.name}!`, 'success');
      switchTab('feedTab');
    }
  } catch (err) {
    alertBox.innerHTML = `<div class="alert alert-danger">${err.message || 'Registration error.'}</div>`;
  }
}

async function checkApprovalStatus() {
  if (!currentUser) return;
  try {
    const data = await fetchAPI(`/auth/profile/${currentUser.id}`);
    if (data.data) {
      if (data.data.status === 'ACTIVE') {
        currentUser.status = 'ACTIVE';
        currentUser.approved = true;
        localStorage.setItem('dconnect_user', JSON.stringify(currentUser));
        updateUserUI();
        hideAllErrorViews();
        showToast('Account Approved', 'Your organization has been approved by the Administrator!', 'success');
        switchTab('feedTab');
      } else if (data.data.status === 'REJECTED') {
        showToast('Account Rejected', 'Your organization application was rejected by administrator.', 'error');
        logout();
      } else {
        showToast('Pending Review', 'Your account is still awaiting administrative review.', 'info');
      }
    }
  } catch (err) {
    handleApiError(err);
  }
}

// ==============================================================================
// 6.5 DOUBLE VERIFICATION SYSTEM (SENSITIVE ACTION STEP 1 & STEP 2)
// ==============================================================================

let pendingDoubleConfirmCallback = null;

function requestDoubleVerification(title, message, onVerifiedCallback) {
  pendingDoubleConfirmCallback = onVerifiedCallback;

  const titleEl = document.getElementById('doubleConfirmStep1Title');
  const msgEl = document.getElementById('doubleConfirmStep1Message');
  if (titleEl) titleEl.textContent = title || 'Confirm Action';
  if (msgEl) msgEl.textContent = message || 'This is a sensitive action. Are you sure?';

  openModal('doubleConfirmStep1Modal');
}

function handleDoubleConfirmStep1Continue() {
  closeModal('doubleConfirmStep1Modal');

  const textInput = document.getElementById('doubleConfirmTextInput');
  const submitBtn = document.getElementById('doubleConfirmSubmitBtn');
  if (textInput) {
    textInput.value = '';
    textInput.oninput = (e) => {
      const val = (e.target.value || '').trim();
      if (submitBtn) submitBtn.disabled = (val !== 'CONFIRM');
    };
  }
  if (submitBtn) submitBtn.disabled = true;

  openModal('doubleConfirmStep2Modal');
}

function handleDoubleConfirmStep2Submit(e) {
  e.preventDefault();
  const textVal = (document.getElementById('doubleConfirmTextInput')?.value || '').trim();
  if (textVal !== 'CONFIRM') {
    showToast('Verification Required', 'Please type CONFIRM to execute action.', 'warning');
    return;
  }

  closeModal('doubleConfirmStep2Modal');

  if (typeof pendingDoubleConfirmCallback === 'function') {
    const callback = pendingDoubleConfirmCallback;
    pendingDoubleConfirmCallback = null;
    callback();
  }
}

// ==============================================================================
// 7. DISASTER REPORTING & HAVERSINE DEDUPLICATION
// ==============================================================================

async function handleDisasterSubmit(e) {
  e.preventDefault();

  const payload = {
    type: document.getElementById('reportDisasterType').value,
    severity: 'UNVERIFIED',
    title: document.getElementById('reportTitle').value.trim(),
    locationName: document.getElementById('reportLocationName').value.trim(),
    latitude: parseFloat(document.getElementById('reportLatitude').value),
    longitude: parseFloat(document.getElementById('reportLongitude').value),
    description: document.getElementById('reportDescription').value.trim(),
    reporterId: currentUser ? currentUser.id : null,
    reporterName: currentUser ? currentUser.name : 'Anonymous Citizen',
    reporterPhone: currentUser ? currentUser.phone : 'N/A'
  };

  requestDoubleVerification(
    'Report Emergency Incident',
    `You are submitting an emergency ${payload.type} report for '${payload.locationName}'. Are you sure?`,
    () => executeDisasterSubmit(payload)
  );
}

async function executeDisasterSubmit(payload) {
  const alertBox = document.getElementById('reportAlertBox');
  if (alertBox) alertBox.innerHTML = '';

  try {
    const data = await fetchAPI('/incidents/create', {
      method: 'POST',
      body: payload
    });

    const disaster = data.data;
    if (disaster.wasMerged) {
      if (alertBox) {
        alertBox.innerHTML = `
          <div class="alert alert-info">
            🔄 <strong>AUTOMATICALLY MERGED (10km Active Incident Rule):</strong><br>
            Already reported. Added to existing case (Incident #${disaster.id}).<br>
            Total aggregated reports: <strong>${disaster.reportCount}</strong>.
          </div>
        `;
      }
      showToast('Already reported', 'Added to existing case', 'info');
    } else {
      const isDirectVerified = disaster.status === 'VERIFIED_ACTIVE';
      const toastMsg = isDirectVerified ? 'Incident published directly to live feed' : 'Incident submitted for verification';
      if (alertBox) {
        alertBox.innerHTML = `
          <div class="alert alert-success">
            ✅ <strong>${isDirectVerified ? 'DISASTER PUBLISHED:' : 'INCIDENT SUBMITTED:'}</strong><br>
            ${toastMsg}<br>
            Incident ID: #${disaster.id} (<strong>${escapeHtml(disaster.title)}</strong>).
          </div>
        `;
      }
      showToast('Incident Submitted', toastMsg, 'success');
    }

    document.getElementById('disasterReportForm').reset();
    populateFormCoords(currentCoords.latitude, currentCoords.longitude);
    loadDisasters();
  } catch (err) {
    if (err && (err.status === 401 || err.message?.includes('User session invalid') || err.message?.includes('Please login again'))) {
      showToast('Session Error', 'User session invalid. Please login again.', 'error');
      logout();
      return;
    }
    showToast('Submission Failed', err.message || 'Update failed. Try again.', 'error');
  }
}

async function loadDisasters() {
  const container = document.getElementById('disasterFeedList');
  if (!container) return;

  const typeFilter = document.getElementById('feedTypeFilter')?.value;
  const statusFilter = document.getElementById('feedStatusFilter')?.value;

  let url = `/disasters?lat=${currentCoords.latitude}&lon=${currentCoords.longitude}`;
  if (statusFilter) url += `&status=${statusFilter}`;

  try {
    const data = await fetchAPI(url);
    let list = data.data || [];

    // Requirement 1 & 7: Filter logic & safety check - only include active real-time incidents
    list = list.filter(d => d.status === 'VERIFIED_ACTIVE' || d.status === 'IN_PROGRESS');

    if (typeFilter) {
      list = list.filter(d => d.type === typeFilter);
    }

    // Safeguard: Deduplicate incidents by ID to prevent duplicate cards in UI
    const seenIds = new Set();
    list = list.filter(d => {
      if (!d.id || seenIds.has(d.id)) return false;
      seenIds.add(d.id);
      return true;
    });

    if (list.length === 0) {
      container.innerHTML = `<p style="color: var(--text-muted); text-align: center; padding: 30px; font-weight: 600;">No active disasters currently</p>`;
      return;
    }

    container.innerHTML = list.map(d => {
      const statusStr = (d.status || 'PENDING_VERIFICATION').toUpperCase();
      const isPending = statusStr === 'PENDING_VERIFICATION' || statusStr === 'PENDING';
      const isVerified = statusStr === 'VERIFIED_ACTIVE';
      const isInProgress = statusStr === 'IN_PROGRESS';
      const isResolved = statusStr === 'RESOLVED';
      const isClosed = statusStr === 'CLOSED' || statusStr === 'CANCELLED_BY_ADMIN' || statusStr === 'CANCELLED';

      let borderStyle = 'border-left: 4px solid var(--border-color);';
      if (isVerified) borderStyle = 'border-left: 4px solid #16a34a;';
      if (isInProgress) borderStyle = 'border-left: 4px solid #0284c7;';
      if (isResolved) borderStyle = 'border-left: 4px solid #0d9488;';
      if (isClosed) borderStyle = 'border-left: 4px solid #94a3b8;';
      if (isPending) borderStyle = 'border-left: 4px solid #eab308;';

      const userRole = currentUser ? (currentUser.role || '').toUpperCase() : '';
      const canAssign = ['ADMIN', 'GOVERNMENT', 'GOVERNMENT_AGENCY', 'NGO'].includes(userRole) && !isPending && !isResolved && !isClosed;
      const canUpdateStatus = (currentUser?.role === 'ADMIN' || currentUser?.role === 'GOVERNMENT_AGENCY' || currentUser?.role === 'GOVERNMENT') && !isClosed;
      const canDiscuss = !isPending && !isClosed;

      let cardClass = "disaster-card";
      if (isClosed) cardClass += " disaster-card-disabled";

      return `
      <div class="${cardClass}" style="${borderStyle}">
        <div class="disaster-card-header">
          <div>
            <div class="disaster-title">
              #${d.id} [${d.type}] ${escapeHtml(d.title)}
            </div>
            <div class="disaster-meta">
              <span>📍 ${escapeHtml(d.locationName || 'N/A')}</span>
              <span>📏 ${d.distanceFromUserKm !== null ? d.distanceFromUserKm.toFixed(1) + ' km away' : 'Proximity unknown'}</span>
              <span>🕒 ${new Date(d.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
              <span>👤 Reported by: ${escapeHtml(d.createdByName)} (${d.createdByRole})</span>
            </div>
          </div>
          <div style="display: flex; gap: 6px; align-items: center;">
            <span class="badge badge-${d.severity.toLowerCase()}">${d.severity}</span>
            <span class="badge badge-status-${d.status.toLowerCase()}">${d.status}</span>
          </div>
        </div>

        <p class="disaster-desc">${escapeHtml(d.description)}</p>

        ${isPending ? `
          <div class="pending-approval-banner">
            ⏳ Waiting for admin approval. Actions are locked until verified.
          </div>
        ` : ''}

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; flex-wrap: wrap; gap: 8px;">
          <div>
            <span class="merge-tag">📊 Aggregated Reports: ${d.reportCount}</span>
          </div>
          <div style="display: flex; gap: 8px;">
            ${canDiscuss ? `
              <button class="btn btn-outline btn-sm" onclick="openDiscussionModal(${d.id}, '${escapeHtml(d.title)}')">💬 Discussion</button>
            ` : (isPending ? `<button class="btn btn-outline btn-sm" disabled style="opacity: 0.5; cursor: not-allowed;">💬 Discussion (Locked)</button>` : '')}
            
            ${canAssign ? `
              <button class="btn btn-secondary btn-sm" onclick="openAssignTaskModal(${d.id})">🎯 Assign Task</button>
            ` : ''}
            
            ${canUpdateStatus ? `
              <button class="btn btn-outline btn-sm" onclick="openStatusUpdateModal(${d.id}, '${escapeHtml(d.title)}', '${d.status}')">⚙️ Update Status</button>
            ` : ''}
          </div>
        </div>
      </div>
      `;
    }).join('');
  } catch (err) {
    handleApiError(err);
  }
}

// Interactive Dropdown Modal for Status Update (Replaces text prompt)
function openStatusUpdateModal(disasterId, title, currentStatus) {
  document.getElementById('statusModalDisasterId').value = disasterId;
  document.getElementById('statusModalDisasterTitle').value = `#${disasterId} - ${title}`;
  const select = document.getElementById('statusModalSelect');
  if (select && currentStatus) {
    select.value = currentStatus;
  }
  openModal('statusUpdateModal');
}

async function handleStatusUpdateSubmit(e) {
  e.preventDefault();
  const submitBtn = document.getElementById('statusUpdateSubmitBtn');
  const disasterId = parseInt(document.getElementById('statusModalDisasterId').value);
  const newStatus = document.getElementById('statusModalSelect').value;

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Updating...';
  }

  try {
    const data = await fetchAPI('/incidents/update', {
      method: 'POST',
      body: { id: disasterId, status: newStatus }
    });

    closeModal('statusUpdateModal');
    showToast('Status Updated', `Incident #${disasterId} status changed to ${newStatus}`, 'success');

    // Rule 6: Instant UI Update & Refetch
    await loadDisasters();
    if (currentUser?.role === 'ADMIN') {
      if (typeof loadAdminReportsTable === 'function') loadAdminReportsTable();
      if (typeof loadAdminAnalytics === 'function') loadAdminAnalytics();
    }
  } catch (err) {
    showToast('Update Failed', err.message || 'Update failed. Try again.', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Update Status';
    }
  }
}

// ==============================================================================
// 8. VOLUNTEER MISSIONS & ASSIGNMENT HUB
// ==============================================================================

async function loadVolunteerData() {
  loadVolunteerAssignments();
  loadVolunteersDirectory();
}

async function loadVolunteerAssignments() {
  const container = document.getElementById('volunteerAssignmentsList');
  if (!container) return;

  let url = '/volunteers/assignments';

  try {
    const data = await fetchAPI(url);
    const list = data.data || [];
    if (list.length === 0) {
      container.innerHTML = `<p style="color: var(--text-muted); text-align: center; padding: 20px;">No rescue mission assignments found.</p>`;
      return;
    }

    container.innerHTML = list.map(a => `
      <div style="border-bottom: 1px solid var(--border); padding: 12px 0;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong>🎯 ${escapeHtml(a.taskTitle)}</strong>
          <span class="badge badge-status-${a.status.toLowerCase()}">${a.status}</span>
        </div>
        <div style="font-size: 0.85rem; color: var(--text-muted); margin: 4px 0;">
          Disaster: <em>${escapeHtml(a.disasterTitle)}</em> | Volunteer: <strong>${escapeHtml(a.volunteerName)}</strong> (${escapeHtml(a.volunteerPhone)})
        </div>
        <p style="font-size: 0.85rem; margin: 6px 0;">${escapeHtml(a.taskDescription)}</p>
        
        ${currentUser && (currentUser.id === a.volunteerId || currentUser.role === 'ADMIN' || currentUser.role === 'NGO') ? `
          <div style="margin-top: 10px; display: flex; align-items: center; gap: 8px;">
            <label style="font-size: 0.8rem; font-weight: 700;">Status:</label>
            <select class="form-control" style="width: 150px; padding: 4px 8px; font-size: 0.82rem;" onchange="updateMissionStatus(${a.id}, this.value)">
              <option value="ASSIGNED" ${a.status === 'ASSIGNED' ? 'selected' : ''}>ASSIGNED</option>
              <option value="IN_PROGRESS" ${a.status === 'IN_PROGRESS' ? 'selected' : ''}>IN_PROGRESS</option>
              <option value="COMPLETED" ${a.status === 'COMPLETED' ? 'selected' : ''}>COMPLETED</option>
              <option value="CANCELLED" ${a.status === 'CANCELLED' ? 'selected' : ''}>CANCELLED</option>
            </select>
          </div>
        ` : ''}
      </div>
    `).join('');
  } catch (err) {
    handleApiError(err);
  }
}

async function updateMissionStatus(assignmentId, newStatus) {
  try {
    const data = await fetchAPI(`/volunteers/assignments/${assignmentId}/status`, {
      method: 'PATCH',
      body: { status: newStatus }
    });
    showToast('Mission Updated', `Assignment marked as ${newStatus}`, 'success');
    loadVolunteerAssignments();
  } catch (err) {
    handleApiError(err);
  }
}

async function loadVolunteersDirectory() {
  const container = document.getElementById('volunteersDirectoryList');
  if (!container) return;

  try {
    let data;
    try {
      data = await fetchAPI('/users/volunteers');
    } catch (e) {
      data = await fetchAPI(`/volunteers/available?lat=${currentCoords.latitude}&lon=${currentCoords.longitude}`);
    }
    const list = data.data || [];
    if (list.length === 0) {
      container.innerHTML = `<p style="color: var(--text-muted); text-align: center; padding: 20px;">No registered volunteers found in directory.</p>`;
      return;
    }

    container.innerHTML = list.map(v => `
      <div style="border-bottom: 1px solid var(--border); padding: 10px 0; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <strong>🧑‍🚒 ${escapeHtml(v.name || 'Volunteer')}</strong>
          <span class="badge badge-status-active" style="margin-left: 6px;">VOLUNTEER</span>
          <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 2px;">
            🛠️ Skills: ${escapeHtml(v.skills || 'General Relief')} | 📞 ${escapeHtml(v.phone || 'N/A')}
          </div>
        </div>
        <div>
          <span class="badge badge-${(v.availabilityStatus || 'AVAILABLE').toLowerCase() === 'available' ? 'low' : 'medium'}">${v.availabilityStatus || 'AVAILABLE'}</span>
        </div>
      </div>
    `).join('');
  } catch (err) {
    handleApiError(err);
  }
}

async function openAssignTaskModal(disasterId) {
  const allowedRoles = ['ADMIN', 'GOVERNMENT', 'GOVERNMENT_AGENCY', 'NGO'];
  const userRole = currentUser ? (currentUser.role || '').toUpperCase() : '';

  if (!allowedRoles.includes(userRole)) {
    showToast('Forbidden', 'Not allowed to assign tasks', 'error');
    return;
  }

  document.getElementById('assignDisasterId').value = disasterId;
  const select = document.getElementById('assignVolunteerSelect');
  select.innerHTML = '<option value="">Loading volunteers...</option>';

  openModal('taskAssignModal');

  try {
    const data = await fetchAPI('/volunteers/available');
    const volunteers = data.data || [];
    if (volunteers.length === 0) {
      select.innerHTML = '<option value="">No volunteers available right now</option>';
      return;
    }
    select.innerHTML = volunteers.map(v => `
      <option value="${v.userId}">${v.name} (${v.skills || 'General'}) - ${v.phone}</option>
    `).join('');
  } catch (err) {
    select.innerHTML = '<option value="">Error loading volunteers</option>';
  }
}

async function handleAssignTaskSubmit(e) {
  e.preventDefault();
  const payload = {
    disasterId: parseInt(document.getElementById('assignDisasterId').value),
    volunteerId: parseInt(document.getElementById('assignVolunteerSelect').value),
    taskTitle: document.getElementById('assignTaskTitle').value.trim(),
    taskDescription: document.getElementById('assignTaskDesc').value.trim(),
    assignedById: currentUser ? currentUser.id : null
  };

  requestDoubleVerification(
    'Dispatch Rescue Mission',
    `You are dispatching task '${payload.taskTitle}' to a field volunteer. Are you sure?`,
    () => executeAssignTaskSubmit(payload)
  );
}

async function executeAssignTaskSubmit(payload) {
  try {
    await fetchAPI('/volunteers/assignments', {
      method: 'POST',
      body: payload
    });

    showToast('Task Dispatched', 'Volunteer assigned to mission successfully!', 'success');
    closeModal('taskAssignModal');
    loadVolunteerAssignments();
  } catch (err) {
    showToast('Dispatch Failed', err.message || 'Update failed. Try again.', 'error');
  }
}

function toggleNoExpiry(context = 'resource') {
  const isResource = context === 'resource';
  const toggle = document.getElementById(isResource ? 'resNoExpiryToggle' : 'adminEditResNoExpiryToggle');
  const dateInput = document.getElementById(isResource ? 'resAvailableUntil' : 'adminEditResAvailableUntil');

  if (!toggle || !dateInput) return;

  if (toggle.checked) {
    dateInput.value = '';
    dateInput.disabled = true;
  } else {
    dateInput.disabled = false;
  }
}

// ==============================================================================
// 9. RESOURCE MANAGEMENT
// ==============================================================================

async function loadResources() {
  const container = document.getElementById('resourcePoolList');
  if (!container) return;

  try {
    const data = await fetchAPI('/resources/list');
    const list = data.data || [];
    if (list.length === 0) {
      container.innerHTML = `<p style="color: var(--text-muted); text-align: center; padding: 20px;">No supplies currently in the emergency pool.</p>`;
      return;
    }

    container.innerHTML = list.map(r => {
      const isExhausted = r.status === 'EXHAUSTED' || r.status === 'EXPIRED' || r.status === 'REMOVED' || r.status === 'INACTIVE';
      const isDispatched = r.status === 'DISPATCHED';
      const badgeClass = isExhausted ? 'badge-high' : (isDispatched ? 'badge-medium' : 'badge-status-active');
      const expiryRaw = r.expiryDate || r.availableUntil || r.expiry_date;
      const formattedExpiry = expiryRaw ? new Date(expiryRaw).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'No Expiry';
      const lat = r.latitude ? parseFloat(r.latitude) : 13.0827;
      const lng = r.longitude ? parseFloat(r.longitude) : 80.2707;
      const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
      const addressText = escapeHtml(r.address || 'Central Relief Pool');

      return `
        <div style="border-bottom: 1px solid var(--border); padding: 12px 0;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <strong>[${r.resourceType}] ${escapeHtml(r.description || r.resourceName)}</strong>
            <div style="display: flex; gap: 6px; align-items: center;">
              <span class="badge ${badgeClass}">${r.status}</span>
              <span class="badge badge-status-active">${r.quantity} ${escapeHtml(r.unit)}</span>
            </div>
          </div>
          <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 6px;">
            📍 Pickup Location: <strong>${addressText}</strong><br>
            Provided by: <strong>${escapeHtml(r.providerName)}</strong> (${r.providerRole}) | Contact: ${escapeHtml(r.contactPhone || 'N/A')}<br>
            ⏳ Available Until: <strong>${formattedExpiry}</strong>
          </div>
          <div style="margin-top: 8px;">
            <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm" style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.78rem; padding: 4px 10px; text-decoration: none;">
              🗺️ View on Google Maps
            </a>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    handleApiError(err);
  }
}

async function handleResourceSubmit(e) {
  e.preventDefault();
  if (!currentUser) return;

  const desc = document.getElementById('resDescription')?.value.trim();
  const noExpiryChecked = document.getElementById('resNoExpiryToggle')?.checked;
  const untilVal = document.getElementById('resAvailableUntil')?.value;
  const address = document.getElementById('resAddress')?.value.trim();
  const latVal = parseFloat(document.getElementById('resLatitude')?.value);
  const lngVal = parseFloat(document.getElementById('resLongitude')?.value);
  const statusVal = document.getElementById('resStatus')?.value || 'AVAILABLE';

  if (!desc) {
    showToast('Missing Field', 'Please provide a resource description.', 'warning');
    return;
  }

  let expiryIso = null;
  if (!noExpiryChecked && untilVal) {
    const d = new Date(untilVal);
    if (!isNaN(d.getTime())) {
      expiryIso = d.toISOString();
    }
  }

  const payload = {
    providerId: currentUser.id,
    resourceType: document.getElementById('resType').value,
    description: desc,
    resourceName: desc,
    quantity: parseInt(document.getElementById('resQty').value),
    unit: document.getElementById('resUnit').value.trim(),
    availableUntil: expiryIso,
    expiryDate: expiryIso,
    expiry_date: expiryIso,
    status: statusVal.toUpperCase(),
    latitude: !isNaN(latVal) ? latVal : 13.0827,
    longitude: !isNaN(lngVal) ? lngVal : 80.2707,
    address: address || desc || 'Central Relief Pool',
    contactPhone: document.getElementById('resPhone').value.trim() || currentUser.phone
  };

  try {
    await fetchAPI('/resources/create', {
      method: 'POST',
      body: payload
    });

    showToast('Resource Created', 'Emergency supply post created successfully!', 'success');
    document.getElementById('resourceForm').reset();
    if (document.getElementById('resNoExpiryToggle')) document.getElementById('resNoExpiryToggle').checked = false;
    if (document.getElementById('resAvailableUntil')) document.getElementById('resAvailableUntil').disabled = false;
    loadResources();
  } catch (err) {
    showToast('Creation Failed', err.message || 'Failed to post resource.', 'error');
  }
}

// ==============================================================================
// 10. DISCUSSION & COMMENTS
// ==============================================================================

async function openDiscussionModal(disasterId, title) {
  activeDisasterIdForComments = disasterId;
  document.getElementById('discussionModalTitle').textContent = `💬 Incident #${disasterId} Discussion`;
  openModal('discussionModal');
  loadComments(disasterId);
}

async function loadComments(disasterId) {
  const container = document.getElementById('commentsContainer');
  if (!container) return;

  try {
    const data = await fetchAPI(`/disasters/${disasterId}/comments`);
    const list = data.data || [];
    if (list.length === 0) {
      container.innerHTML = `<p style="color: var(--text-muted); text-align: center; padding: 20px;">No coordination messages posted yet.</p>`;
      return;
    }

    container.innerHTML = list.map(c => `
      <div class="comment-item">
        <div class="comment-author">
          <span>${escapeHtml(c.userName)} (${c.userRole})</span>
          <span>${new Date(c.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
        </div>
        <div class="comment-body">${escapeHtml(c.message)}</div>
      </div>
    `).join('');
  } catch (err) {
    handleApiError(err);
  }
}

async function handlePostComment(e) {
  e.preventDefault();
  if (!currentUser) return;

  const textInput = document.getElementById('newCommentText');
  const payload = {
    userId: currentUser.id,
    message: textInput.value.trim()
  };

  try {
    await fetchAPI(`/disasters/${activeDisasterIdForComments}/comments`, {
      method: 'POST',
      body: payload
    });

    textInput.value = '';
    loadComments(activeDisasterIdForComments);
    showToast('Comment Posted', 'Coordination message broadcast to teams.', 'info');
  } catch (err) {
    handleApiError(err);
  }
}

// ==============================================================================
// 11. ADMIN COMMAND CENTER & REDESIGNED TABLE VIEW
// ==============================================================================

let adminReportsList = [];
let adminCurrentPage = 1;
const adminPageSize = 10;
let adminSearchDebounceTimer = null;
let pendingDeleteIncidentId = null;

async function loadAdminData() {
  if (!currentUser || currentUser.role !== 'ADMIN') {
    showAccessDeniedView();
    return;
  }

  loadAdminAnalytics();
  loadAdminReportsTable();
  loadAdminPendingUsers();
  loadAdminPendingDisasters();
  loadAdminResourcesTable();
}

let adminResourcesList = [];

async function loadAdminResourcesTable() {
  const tbody = document.getElementById('adminResourcesTableBody');
  if (!tbody) return;

  try {
    const data = await fetchAPI('/resources/list');
    adminResourcesList = data.data || [];
    renderAdminResourcesTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 20px;">Failed to load resources.</td></tr>`;
  }
}

function renderAdminResourcesTable() {
  const tbody = document.getElementById('adminResourcesTableBody');
  if (!tbody) return;

  if (adminResourcesList.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 28px 16px;">
          📦 No emergency resource supply posts found.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = adminResourcesList.map(r => {
    const formattedExpiry = r.availableUntil ? new Date(r.availableUntil).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'N/A';
    return `
      <tr>
        <td><strong>#${r.id}</strong></td>
        <td><span class="badge badge-status-active">${r.resourceType}</span></td>
        <td>${escapeHtml(r.description || r.resourceName)}</td>
        <td><strong>${escapeHtml(r.providerName)}</strong></td>
        <td>${r.quantity} ${escapeHtml(r.unit)}</td>
        <td style="font-size: 0.82rem;">${formattedExpiry}</td>
        <td>
          <select class="admin-select-status" onchange="updateAdminInlineResourceStatus(${r.id}, this.value)">
            <option value="AVAILABLE" ${r.status === 'AVAILABLE' || r.status === 'ACTIVE' ? 'selected' : ''}>🟢 AVAILABLE</option>
            <option value="DISPATCHED" ${r.status === 'DISPATCHED' ? 'selected' : ''}>🚚 DISPATCHED</option>
            <option value="EXHAUSTED" ${r.status === 'EXHAUSTED' || r.status === 'EXPIRED' || r.status === 'INACTIVE' ? 'selected' : ''}>🔴 EXHAUSTED</option>
          </select>
        </td>
        <td>
          <div style="display: flex; gap: 6px; align-items: center;">
            <button class="btn btn-outline btn-sm" onclick="openAdminEditResourceModal(${r.id})">✏️ Edit</button>
            <button class="btn btn-danger btn-sm" onclick="promptDeleteResource(${r.id}, '${escapeHtml(r.description || r.resourceName)}')">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function updateAdminInlineResourceStatus(resId, newStatus) {
  try {
    await fetchAPI('/resources/update', {
      method: 'POST',
      body: { id: resId, status: newStatus }
    });

    showToast('Resource Status Updated', `Resource #${resId} status updated to '${newStatus}'`, 'success');

    const item = adminResourcesList.find(r => r.id === resId);
    if (item) item.status = newStatus;
    renderAdminResourcesTable();
    loadResources();
  } catch (err) {
    showToast('Update Failed', err.message || 'Failed to update resource status.', 'error');
    loadAdminResourcesTable();
  }
}

function openAdminEditResourceModal(resId) {
  const item = adminResourcesList.find(r => r.id === resId);
  if (!item) return;

  document.getElementById('adminEditResId').value = item.id;
  document.getElementById('adminEditResType').value = item.resourceType || 'OTHER';
  document.getElementById('adminEditResDescription').value = item.description || item.resourceName || '';
  document.getElementById('adminEditResQuantity').value = item.quantity || 1;
  document.getElementById('adminEditResStatus').value = item.status || 'AVAILABLE';

  const expiryRaw = item.expiryDate || item.availableUntil || item.expiry_date;
  const noExpiryToggle = document.getElementById('adminEditResNoExpiryToggle');
  const dateInput = document.getElementById('adminEditResAvailableUntil');

  if (expiryRaw) {
    const d = new Date(expiryRaw);
    if (!isNaN(d.getTime())) {
      const isoLocal = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      if (dateInput) {
        dateInput.value = isoLocal;
        dateInput.disabled = false;
      }
      if (noExpiryToggle) noExpiryToggle.checked = false;
    } else {
      if (dateInput) {
        dateInput.value = '';
        dateInput.disabled = true;
      }
      if (noExpiryToggle) noExpiryToggle.checked = true;
    }
  } else {
    if (dateInput) {
      dateInput.value = '';
      dateInput.disabled = true;
    }
    if (noExpiryToggle) noExpiryToggle.checked = true;
  }

  openModal('adminEditResourceModal');
}

async function submitAdminEditResource(e) {
  e.preventDefault();
  const id = parseInt(document.getElementById('adminEditResId').value);
  const resourceType = document.getElementById('adminEditResType').value;
  const description = document.getElementById('adminEditResDescription').value.trim();
  const quantity = parseInt(document.getElementById('adminEditResQuantity').value);
  const status = document.getElementById('adminEditResStatus').value;
  const noExpiryChecked = document.getElementById('adminEditResNoExpiryToggle')?.checked;
  const availableUntilVal = document.getElementById('adminEditResAvailableUntil').value;

  let expiryIso = null;
  if (!noExpiryChecked && availableUntilVal) {
    const d = new Date(availableUntilVal);
    if (!isNaN(d.getTime())) {
      expiryIso = d.toISOString();
    }
  }

  try {
    await fetchAPI('/resources/update', {
      method: 'POST',
      body: {
        id,
        resourceType,
        description,
        quantity,
        status,
        availableUntil: expiryIso,
        expiryDate: expiryIso,
        expiry_date: expiryIso
      }
    });

    closeModal('adminEditResourceModal');
    showToast('Resource Updated', `Resource #${id} updated successfully.`, 'success');
    loadAdminResourcesTable();
    loadResources();
  } catch (err) {
    showToast('Update Failed', err.message || 'Failed to update resource.', 'error');
  }
}

function promptDeleteResource(resId, name) {
  if (!currentUser || currentUser.role !== 'ADMIN') {
    showToast('Access Denied', 'Only administrators can delete resource posts.', 'error');
    return;
  }

  document.getElementById('deleteTargetResourceId').value = resId;

  const textInput = document.getElementById('deleteResourceTextInput');
  const submitBtn = document.getElementById('deleteResourceSubmitBtn');
  if (textInput) {
    textInput.value = '';
    textInput.oninput = (e) => {
      const val = (e.target.value || '').trim();
      if (submitBtn) submitBtn.disabled = (val !== 'DELETE');
    };
  }
  if (submitBtn) submitBtn.disabled = true;

  openModal('deleteResourceConfirmModal');
}

async function handleDeleteResourceConfirmSubmit(e) {
  e.preventDefault();
  const resId = parseInt(document.getElementById('deleteTargetResourceId').value);
  const val = (document.getElementById('deleteResourceTextInput')?.value || '').trim();

  if (val !== 'DELETE') {
    showToast('Verification Required', 'Please type DELETE in uppercase to confirm.', 'warning');
    return;
  }

  try {
    await fetchAPI('/resources/delete', {
      method: 'DELETE',
      body: { id: resId }
    });

    closeModal('deleteResourceConfirmModal');
    showToast('Resource Deleted', `Resource supply post #${resId} deleted successfully.`, 'success');
    loadAdminResourcesTable();
    loadResources();
  } catch (err) {
    showToast('Deletion Failed', err.message || 'Failed to delete resource.', 'error');
  }
}

async function loadAdminAnalytics() {
  try {
    const data = await fetchAPI('/admin/analytics');
    const kpi = data.data;
    document.getElementById('kpiActiveDisasters').textContent = kpi.activeDisasters;
    document.getElementById('kpiReportsAggregated').textContent = kpi.totalReportsAggregated;
    document.getElementById('kpiActiveVolunteers').textContent = kpi.activeVolunteers;
    document.getElementById('kpiPendingApprovals').textContent = kpi.pendingUserApprovals + kpi.pendingDisasters;
  } catch (err) {
    console.error(err);
  }
}

async function loadAdminReportsTable() {
  try {
    const data = await fetchAPI('/incidents/list?status=ALL');
    adminReportsList = data.data || [];
    renderAdminReportsTable();
  } catch (err) {
    showToast('Failed to load reports', err.message || 'Error fetching incidents from database.', 'error');
  }
}

function onAdminSearchInput() {
  if (adminSearchDebounceTimer) clearTimeout(adminSearchDebounceTimer);
  adminSearchDebounceTimer = setTimeout(() => {
    adminCurrentPage = 1;
    renderAdminReportsTable();
  }, 250);
}

function renderAdminReportsTable() {
  const tbody = document.getElementById('adminReportsTableBody');
  if (!tbody) return;

  const statusFilter = document.getElementById('adminStatusFilter')?.value || '';
  const typeFilter = document.getElementById('adminTypeFilter')?.value || '';
  const roleFilter = document.getElementById('adminRoleFilter')?.value || '';
  const searchTerm = (document.getElementById('adminSearchInput')?.value || '').trim().toLowerCase();

  let filtered = adminReportsList.filter(d => {
    if (statusFilter && d.status !== statusFilter) {
      if (!(statusFilter === 'CANCELLED_BY_ADMIN' && d.status === 'CANCELLED')) {
        return false;
      }
    }
    if (typeFilter && d.type !== typeFilter) return false;
    if (roleFilter && (d.createdByRole || 'PUBLIC') !== roleFilter) return false;
    if (searchTerm) {
      const title = (d.title || '').toLowerCase();
      const loc = (d.locationName || '').toLowerCase();
      const reporter = (d.createdByName || '').toLowerCase();
      if (!title.includes(searchTerm) && !loc.includes(searchTerm) && !reporter.includes(searchTerm)) {
        return false;
      }
    }
    return true;
  });

  const totalRows = filtered.length;
  const totalPages = Math.ceil(totalRows / adminPageSize) || 1;
  if (adminCurrentPage > totalPages) adminCurrentPage = totalPages;
  if (adminCurrentPage < 1) adminCurrentPage = 1;

  const startIndex = (adminCurrentPage - 1) * adminPageSize;
  const pageRows = filtered.slice(startIndex, startIndex + adminPageSize);

  const infoEl = document.getElementById('adminTablePaginationInfo');
  if (infoEl) {
    const endCount = Math.min(startIndex + adminPageSize, totalRows);
    infoEl.textContent = totalRows === 0 ? 'No reports found' : `Showing ${startIndex + 1}-${endCount} of ${totalRows} reports`;
  }
  const pageLabel = document.getElementById('adminCurrentPageLabel');
  if (pageLabel) pageLabel.textContent = `Page ${adminCurrentPage} of ${totalPages}`;

  const prevBtn = document.getElementById('adminPrevPageBtn');
  const nextBtn = document.getElementById('adminNextPageBtn');
  if (prevBtn) prevBtn.disabled = (adminCurrentPage <= 1);
  if (nextBtn) nextBtn.disabled = (adminCurrentPage >= totalPages);

  if (totalRows === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; color: var(--text-muted); padding: 36px 16px;">
          🚫 <strong>No reports found</strong> matching your current filter criteria.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = pageRows.map(d => {
    const isPending = (d.status === 'PENDING_VERIFICATION' || d.status === 'PENDING');
    const isCancelled = (d.status === 'CANCELLED_BY_ADMIN' || d.status === 'CANCELLED');
    const severityVal = (d.severity || 'UNVERIFIED').toUpperCase();
    return `
      <tr>
        <td><strong>#${d.id}</strong></td>
        <td><span class="badge badge-${severityVal.toLowerCase()}">${d.type}</span></td>
        <td>📍 ${escapeHtml(d.locationName || 'N/A')}</td>
        <td><strong>${escapeHtml(d.createdByName)}</strong></td>
        <td><span class="badge badge-status-active">${escapeHtml(d.createdByRole || 'PUBLIC')}</span></td>
        <td>
          <select class="admin-select-status" onchange="updateAdminInlineStatus(${d.id}, this.value)">
            <option value="PENDING_VERIFICATION" ${isPending ? 'selected' : ''}>⏳ PENDING_VERIFICATION</option>
            <option value="VERIFIED_ACTIVE" ${d.status === 'VERIFIED_ACTIVE' ? 'selected' : ''}>🛡️ VERIFIED_ACTIVE</option>
            <option value="IN_PROGRESS" ${d.status === 'IN_PROGRESS' ? 'selected' : ''}>🟡 IN_PROGRESS</option>
            <option value="RESOLVED" ${d.status === 'RESOLVED' ? 'selected' : ''}>🟢 RESOLVED</option>
            <option value="CLOSED" ${d.status === 'CLOSED' ? 'selected' : ''}>📁 CLOSED</option>
            <option value="CANCELLED_BY_ADMIN" ${isCancelled ? 'selected' : ''}>⚪ CANCELLED_BY_ADMIN</option>
          </select>
        </td>
        <td>
          <select class="admin-select-status" onchange="updateAdminInlineSeverity(${d.id}, this.value)">
            <option value="UNVERIFIED" ${severityVal === 'UNVERIFIED' ? 'selected' : ''}>⚪ UNVERIFIED</option>
            <option value="LOW" ${severityVal === 'LOW' ? 'selected' : ''}>🟢 LOW</option>
            <option value="MEDIUM" ${severityVal === 'MEDIUM' ? 'selected' : ''}>🟡 MEDIUM</option>
            <option value="HIGH" ${severityVal === 'HIGH' ? 'selected' : ''}>🟠 HIGH</option>
            <option value="CRITICAL" ${severityVal === 'CRITICAL' ? 'selected' : ''}>🔴 CRITICAL</option>
          </select>
        </td>
        <td><span class="badge badge-assigned" style="font-weight: 700;" title="${d.reportCount || 1} aggregated report(s)">📊 ${d.reportCount || 1} Merged</span></td>
        <td style="font-size: 0.8rem; color: var(--text-muted);">${new Date(d.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
        <td>
          <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
            ${isPending ? `
              <button class="btn btn-success btn-sm" onclick="updateAdminInlineStatus(${d.id}, 'VERIFIED_ACTIVE')" title="Verify & Publish">✅ Verify & Publish</button>
              <button class="btn btn-danger btn-sm" onclick="updateAdminInlineStatus(${d.id}, 'CANCELLED_BY_ADMIN')" title="Reject Report">❌ Reject</button>
            ` : ''}
            <button class="btn btn-outline btn-sm" onclick="openAdminEditModal(${d.id})">✏️ Edit</button>
            <button class="btn btn-outline btn-sm" onclick="openDiscussionModal(${d.id}, '${escapeHtml(d.title)}')">💬</button>
            <button class="btn btn-danger btn-sm" onclick="promptDeleteIncident(${d.id}, '${escapeHtml(d.title)}')">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function changeAdminPage(delta) {
  adminCurrentPage += delta;
  renderAdminReportsTable();
}

async function updateAdminInlineStatus(incidentId, newStatus) {
  try {
    await fetchAPI('/incidents/update', {
      method: 'POST',
      body: { id: incidentId, status: newStatus }
    });

    showToast('Status Updated', `Report #${incidentId} status updated to '${newStatus}'`, 'success');

    const item = adminReportsList.find(d => d.id === incidentId);
    if (item) item.status = newStatus;
    renderAdminReportsTable();
    loadAdminAnalytics();
    loadDisasters();
  } catch (err) {
    showToast('Update Failed', err.message || 'Update failed. Try again.', 'error');
    loadAdminReportsTable();
  }
}

async function updateAdminInlineSeverity(incidentId, newSeverity) {
  try {
    await fetchAPI('/incidents/edit', {
      method: 'POST',
      body: { id: incidentId, severity: newSeverity }
    });

    showToast('Severity Updated', `Report #${incidentId} severity set to '${newSeverity}'`, 'success');

    const item = adminReportsList.find(d => d.id === incidentId);
    if (item) item.severity = newSeverity;
    renderAdminReportsTable();
  } catch (err) {
    showToast('Update Failed', err.message || 'Failed to update severity.', 'error');
    loadAdminReportsTable();
  }
}

function openAdminEditModal(incidentId) {
  const item = adminReportsList.find(d => d.id === incidentId);
  if (!item) return;

  document.getElementById('adminEditId').value = item.id;
  document.getElementById('adminEditTitle').value = item.title || '';
  document.getElementById('adminEditDescription').value = item.description || '';
  document.getElementById('adminEditSeverity').value = (item.severity || 'UNVERIFIED').toUpperCase();
  document.getElementById('adminEditStatus').value = (item.status === 'CANCELLED' ? 'CANCELLED_BY_ADMIN' : item.status) || 'PENDING_VERIFICATION';
  document.getElementById('adminEditLocationName').value = item.locationName || '';
  document.getElementById('adminEditLatitude').value = item.latitude || 13.0827;
  document.getElementById('adminEditLongitude').value = item.longitude || 80.2707;

  openModal('adminEditIncidentModal');
}

async function submitAdminEditIncident(e) {
  e.preventDefault();
  const id = parseInt(document.getElementById('adminEditId').value);
  const title = document.getElementById('adminEditTitle').value.trim();
  const description = document.getElementById('adminEditDescription').value.trim();
  const severity = document.getElementById('adminEditSeverity').value;
  const status = document.getElementById('adminEditStatus').value;
  const locationName = document.getElementById('adminEditLocationName').value.trim();
  const latitude = parseFloat(document.getElementById('adminEditLatitude').value);
  const longitude = parseFloat(document.getElementById('adminEditLongitude').value);

  try {
    const data = await fetchAPI('/incidents/edit', {
      method: 'POST',
      body: { id, title, description, severity, status, locationName, latitude, longitude }
    });

    closeModal('adminEditIncidentModal');
    showToast('Incident Updated', `Incident #${id} details updated successfully.`, 'success');

    loadAdminReportsTable();
    loadDisasters();
  } catch (err) {
    showToast('Edit Failed', err.message || 'Failed to update incident.', 'error');
  }
}

function promptDeleteIncident(incidentId, title) {
  if (!currentUser || currentUser.role !== 'ADMIN') {
    showToast('Access Denied', 'Only administrators can delete disaster reports.', 'error');
    return;
  }

  pendingDeleteIncidentId = incidentId;
  const msgEl = document.getElementById('adminDeleteConfirmMessage');
  if (msgEl) {
    msgEl.textContent = `Are you sure you want to delete report #${incidentId} (${title || 'Incident'})? This action will delete the report from live systems.`;
  }
  openModal('adminDeleteConfirmModal');
}

async function executeDeleteIncident() {
  if (!pendingDeleteIncidentId) return;

  try {
    await fetchAPI('/incidents/delete', {
      method: 'POST',
      body: { id: pendingDeleteIncidentId }
    });

    closeModal('adminDeleteConfirmModal');
    showToast('Incident Deleted', `Disaster report #${pendingDeleteIncidentId} deleted successfully.`, 'success');

    pendingDeleteIncidentId = null;
    loadAdminReportsTable();
    loadAdminAnalytics();
    loadDisasters();
  } catch (err) {
    showToast('Delete Failed', err.message || 'Failed to delete disaster report.', 'error');
  }
}

// ==============================================================================
// LEAFLET MAP LOCATION PICKER & REVERSE GEOCODING
// ==============================================================================

let locationPickerMap = null;
let locationPickerMarker = null;
let locationPickerContext = 'report';
let selectedCoords = { lat: 13.0827, lng: 80.2707 };
let selectedAddress = '';

function openLocationPicker(context = 'report') {
  locationPickerContext = context;
  openModal('locationPickerModal');

  let initLat = 13.0827;
  let initLng = 80.2707;

  if (context === 'report') {
    const rLat = parseFloat(document.getElementById('reportLatitude')?.value);
    const rLng = parseFloat(document.getElementById('reportLongitude')?.value);
    if (!isNaN(rLat) && !isNaN(rLng)) { initLat = rLat; initLng = rLng; }
  } else if (context === 'adminEdit') {
    const aLat = parseFloat(document.getElementById('adminEditLatitude')?.value);
    const aLng = parseFloat(document.getElementById('adminEditLongitude')?.value);
    if (!isNaN(aLat) && !isNaN(aLng)) { initLat = aLat; initLng = aLng; }
  } else if (context === 'resource') {
    const resLat = parseFloat(document.getElementById('resLatitude')?.value);
    const resLng = parseFloat(document.getElementById('resLongitude')?.value);
    if (!isNaN(resLat) && !isNaN(resLng)) { initLat = resLat; initLng = resLng; }
  }

  selectedCoords = { lat: initLat, lng: initLng };
  setTimeout(() => {
    initLocationPickerMap(initLat, initLng);
  }, 200);
}

function initLocationPickerMap(lat, lng) {
  const mapContainer = document.getElementById('locationPickerMap');
  if (!mapContainer || typeof L === 'undefined') return;

  if (!locationPickerMap) {
    locationPickerMap = L.map('locationPickerMap').setView([lat, lng], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(locationPickerMap);

    locationPickerMarker = L.marker([lat, lng], { draggable: true }).addTo(locationPickerMap);

    locationPickerMap.on('click', (e) => {
      const clickedLat = e.latlng.lat;
      const clickedLng = e.latlng.lng;
      locationPickerMarker.setLatLng([clickedLat, clickedLng]);
      updateLocationPickerSelection(clickedLat, clickedLng);
    });

    locationPickerMarker.on('dragend', () => {
      const position = locationPickerMarker.getLatLng();
      updateLocationPickerSelection(position.lat, position.lng);
    });
  } else {
    locationPickerMap.setView([lat, lng], 14);
    locationPickerMarker.setLatLng([lat, lng]);
    locationPickerMap.invalidateSize();
  }

  updateLocationPickerSelection(lat, lng);
}

async function updateLocationPickerSelection(lat, lng) {
  selectedCoords = { lat, lng };
  document.getElementById('pickerCoordsDisplay').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  document.getElementById('pickerAddressDisplay').textContent = 'Resolving address via OpenStreetMap...';

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
    const data = await res.json();
    if (data && data.display_name) {
      selectedAddress = data.display_name;
      document.getElementById('pickerAddressDisplay').textContent = selectedAddress;
    } else {
      selectedAddress = `Lat: ${lat.toFixed(4)}, Lon: ${lng.toFixed(4)}`;
      document.getElementById('pickerAddressDisplay').textContent = selectedAddress;
    }
  } catch (err) {
    selectedAddress = `Lat: ${lat.toFixed(4)}, Lon: ${lng.toFixed(4)}`;
    document.getElementById('pickerAddressDisplay').textContent = selectedAddress;
  }
}

function confirmLocationPickerSelection() {
  if (locationPickerContext === 'report') {
    if (document.getElementById('reportLatitude')) document.getElementById('reportLatitude').value = selectedCoords.lat.toFixed(6);
    if (document.getElementById('reportLongitude')) document.getElementById('reportLongitude').value = selectedCoords.lng.toFixed(6);
    if (document.getElementById('reportLocationName') && selectedAddress) {
      document.getElementById('reportLocationName').value = selectedAddress;
    }
  } else if (locationPickerContext === 'adminEdit') {
    if (document.getElementById('adminEditLatitude')) document.getElementById('adminEditLatitude').value = selectedCoords.lat.toFixed(6);
    if (document.getElementById('adminEditLongitude')) document.getElementById('adminEditLongitude').value = selectedCoords.lng.toFixed(6);
    if (document.getElementById('adminEditLocationName') && selectedAddress) {
      document.getElementById('adminEditLocationName').value = selectedAddress;
    }
  } else if (locationPickerContext === 'resource') {
    if (document.getElementById('resLatitude')) document.getElementById('resLatitude').value = selectedCoords.lat.toFixed(6);
    if (document.getElementById('resLongitude')) document.getElementById('resLongitude').value = selectedCoords.lng.toFixed(6);
    if (document.getElementById('resAddress') && selectedAddress) {
      document.getElementById('resAddress').value = selectedAddress;
    }
  }
  closeModal('locationPickerModal');
  showToast('Location Selected', `Coordinates set to ${selectedCoords.lat.toFixed(4)}, ${selectedCoords.lng.toFixed(4)}`, 'info');
}

function promptDeleteIncident(incidentId, title) {
  if (!currentUser || currentUser.role !== 'ADMIN') {
    showToast('Access Denied', 'Only administrators can delete disaster reports.', 'error');
    return;
  }

  pendingDeleteIncidentId = incidentId;
  const msgEl = document.getElementById('adminDeleteConfirmMessage');
  if (msgEl) {
    msgEl.innerHTML = `Are you sure you want to delete report <strong>#${incidentId} (${escapeHtml(title)})</strong>?<br><br>This action will delete the report from live systems.`;
  }
  openModal('adminDeleteConfirmModal');
}

async function executeDeleteIncident() {
  if (!pendingDeleteIncidentId) return;

  const confirmBtn = document.getElementById('adminConfirmDeleteBtn');
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Deleting...';
  }

  try {
    await fetchAPI('/incidents/delete', {
      method: 'DELETE',
      body: { incidentId: pendingDeleteIncidentId }
    });

    closeModal('adminDeleteConfirmModal');
    showToast('Deleted Successfully', `Report #${pendingDeleteIncidentId} has been deleted.`, 'success');

    pendingDeleteIncidentId = null;
    loadAdminReportsTable();
    loadAdminAnalytics();
    loadDisasters();
  } catch (err) {
    showToast('Delete Failed', err.message || 'Failed to delete report. Try again.', 'error');
  } finally {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Confirm Delete';
    }
  }
}

async function loadAdminPendingUsers() {
  const container = document.getElementById('adminPendingUsersList');
  if (!container) return;

  try {
    const data = await fetchAPI('/admin/pending-users');
    const list = data.data || [];
    if (list.length === 0) {
      container.innerHTML = `<p style="color: var(--text-muted); text-align: center; padding: 20px;">No organizations pending approval.</p>`;
      return;
    }

    container.innerHTML = list.map(u => `
      <div style="border-bottom: 1px solid var(--border); padding: 12px 0;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong>🏢 ${escapeHtml(u.organizationName || u.name)}</strong>
          <span class="badge badge-ngo">${u.role}</span>
        </div>
        <div style="font-size: 0.85rem; color: var(--text-muted); margin: 4px 0;">
          Contact: <strong>${escapeHtml(u.name)}</strong> (${escapeHtml(u.phone)}) | Reg No: ${escapeHtml(u.organizationRegNo || 'N/A')}
        </div>
        <div style="margin-top: 8px; display: flex; gap: 8px;">
          <button class="btn btn-success btn-sm" onclick="adminApproveUser(${u.id}, 'APPROVED')">✓ Approve Account</button>
          <button class="btn btn-outline btn-sm" onclick="adminApproveUser(${u.id}, 'REJECTED')">✕ Reject</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    handleApiError(err);
  }
}

async function adminApproveUser(userId, action) {
  try {
    await fetchAPI('/admin/approve-user', {
      method: 'POST',
      body: {
        adminId: currentUser.id,
        userId: userId,
        action: action,
        comments: action === 'APPROVED' ? 'Verified organization credentials' : 'Failed verification'
      }
    });

    showToast('Organization Reviewed', `Organization marked as ${action.toLowerCase()}`, 'success');
    loadAdminData();
  } catch (err) {
    handleApiError(err);
  }
}

async function loadAdminPendingDisasters() {
  const container = document.getElementById('adminPendingDisastersList');
  if (!container) return;

  try {
    const data = await fetchAPI('/admin/pending-disasters');
    const list = data.data || [];
    if (list.length === 0) {
      container.innerHTML = `<p style="color: var(--text-muted); text-align: center; padding: 20px;">No pending citizen reports.</p>`;
      return;
    }

    container.innerHTML = list.map(d => `
      <div style="border-bottom: 1px solid var(--border); padding: 12px 0;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong>🚨 [${d.type}] ${escapeHtml(d.title)}</strong>
          <span class="badge badge-${d.severity.toLowerCase()}">${d.severity}</span>
        </div>
        <p style="font-size: 0.85rem; margin: 4px 0;">${escapeHtml(d.description)}</p>
        <div style="font-size: 0.8rem; color: var(--text-muted);">
          📍 ${escapeHtml(d.locationName || '')} (${d.latitude}, ${d.longitude}) | Aggregated Reports: ${d.reportCount}
        </div>
        <div style="margin-top: 8px; display: flex; gap: 8px;">
          <button class="btn btn-success btn-sm" onclick="adminApproveDisaster(${d.id}, 'APPROVED')">✓ Verify & Publish</button>
          <button class="btn btn-outline btn-sm" onclick="adminApproveDisaster(${d.id}, 'REJECTED')">✕ Close</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    handleApiError(err);
  }
}

async function adminApproveDisaster(disasterId, action) {
  try {
    await fetchAPI('/admin/approve-disaster', {
      method: 'POST',
      body: {
        adminId: currentUser.id,
        disasterId: disasterId,
        action: action,
        comments: action === 'APPROVED' ? 'Report verified by incident commander' : 'False alarm'
      }
    });

    showToast('Report Processed', `Incident marked as ${action.toLowerCase()}`, 'info');
    loadAdminData();
    loadDisasters();
  } catch (err) {
    handleApiError(err);
  }
}

// ==============================================================================
// 12. UI NAVIGATION & MODALS
// ==============================================================================

function switchTab(tabId) {
  hideAllErrorViews();
  hideAllTabs();

  const targetPane = document.getElementById(tabId);
  if (targetPane) {
    targetPane.classList.add('active');
  }

  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = Array.from(document.querySelectorAll('.nav-btn')).find(b => b.getAttribute('onclick')?.includes(tabId));
  if (activeBtn) activeBtn.classList.add('active');

  if (tabId === 'feedTab') loadDisasters();
  if (tabId === 'volunteerTab') loadVolunteerData();
  if (tabId === 'resourceTab') loadResources();
  if (tabId === 'adminTab') loadAdminData();
}

function hideAllTabs() {
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}

function openRegisterModal() { openModal('registerModal'); }

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
