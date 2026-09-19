/**
 * D-Connect Disaster Management Coordination App - Frontend Engine
 * Green Theme & Split-Screen Password Auth Coordinator
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
let currentCoords = { latitude: 13.0827, longitude: 80.2707 }; // Default fallback coordinates
let activeDisasterIdForComments = null;
let isOffline = !navigator.onLine;

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  initNetworkListeners();
  initGeolocation();
  restoreSession();
});

// ==============================================================================
// 1. NETWORK & ERROR MONITORING
// ==============================================================================

function initNetworkListeners() {
  window.addEventListener('offline', () => {
    isOffline = true;
    document.getElementById('offlineBanner').style.display = 'block';
  });

  window.addEventListener('online', () => {
    isOffline = false;
    document.getElementById('offlineBanner').style.display = 'none';
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

  if (err && err.status === 403 && (err.error === 'Account Pending Approval' || err.message?.includes('approved by the Administrator'))) {
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

  alert(err.message || fallbackMessage);
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
// 2. GEOLOCATION (BROWSER GPS ONLY - NO GOOGLE MAPS)
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
// 3. STRICT MANUAL AUTHENTICATION (PHONE + PASSWORD & ROLE VALIDATION)
// ==============================================================================

function selectLoginRole(role, btnEl) {
  selectedLoginRole = role;
  document.querySelectorAll('#loginRoleTabs .role-tab-item').forEach(btn => btn.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  // STRICT MANUAL INPUT: Clear inputs and reset validation on role switch
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

  // Sanitize phone to digits only in real-time
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
  
  // Ensure inputs are blank by default
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

  // Loading state
  submitBtn.disabled = true;
  if (spinner) spinner.style.display = 'inline-block';
  if (btnText) btnText.textContent = 'Verifying...';

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password, role: selectedLoginRole })
    });

    const data = await res.json();
    if (!res.ok) throw data;

    currentUser = data.data;
    localStorage.setItem('dconnect_user', JSON.stringify(currentUser));
    
    // Clear sensitive password input from memory
    document.getElementById('landingLoginPassword').value = '';

    showDashboardApp();
    updateUserUI();

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
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw data;

    currentUser = data.data;
    localStorage.setItem('dconnect_user', JSON.stringify(currentUser));
    closeModal('registerModal');
    
    showDashboardApp();
    updateUserUI();

    if (!currentUser.approved) {
      showPendingApprovalView();
    } else {
      alert('Registration successful! Welcome to D-Connect, ' + currentUser.name);
      switchTab('feedTab');
    }
  } catch (err) {
    alertBox.innerHTML = `<div class="alert alert-danger">${err.message || 'Registration error.'}</div>`;
  }
}

async function checkApprovalStatus() {
  if (!currentUser) return;
  try {
    const res = await fetch(`${API_BASE}/auth/profile/${currentUser.id}`);
    const data = await res.json();
    if (res.ok && data.data) {
      if (data.data.status === 'ACTIVE') {
        currentUser.status = 'ACTIVE';
        currentUser.approved = true;
        localStorage.setItem('dconnect_user', JSON.stringify(currentUser));
        updateUserUI();
        hideAllErrorViews();
        alert('Your account is now APPROVED! You have full access.');
        switchTab('feedTab');
      } else if (data.data.status === 'REJECTED') {
        alert('Your organization application was rejected by the administrator.');
        logout();
      } else {
        alert('Your account is still pending administrator review.');
      }
    }
  } catch (err) {
    handleApiError(err);
  }
}

// ==============================================================================
// 4. DISASTER REPORTING & HAVERSINE MERGE ENGINE
// ==============================================================================

async function handleDisasterSubmit(e) {
  e.preventDefault();
  const alertBox = document.getElementById('reportAlertBox');
  alertBox.innerHTML = '';

  const payload = {
    type: document.getElementById('reportDisasterType').value,
    severity: document.getElementById('reportSeverity').value,
    title: document.getElementById('reportTitle').value.trim(),
    locationName: document.getElementById('reportLocationName').value.trim(),
    latitude: parseFloat(document.getElementById('reportLatitude').value),
    longitude: parseFloat(document.getElementById('reportLongitude').value),
    description: document.getElementById('reportDescription').value.trim(),
    reporterId: currentUser ? currentUser.id : null,
    reporterName: currentUser ? currentUser.name : 'Anonymous Citizen',
    reporterPhone: currentUser ? currentUser.phone : 'N/A'
  };

  try {
    const res = await fetch(`${API_BASE}/disasters/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw data;

    const disaster = data.data;
    if (disaster.wasMerged) {
      alertBox.innerHTML = `
        <div class="alert alert-info">
          🔄 <strong>AUTOMATICALLY MERGED (Haversine 10km Rule):</strong><br>
          ${data.message}<br>
          Incident ID: #${disaster.id} (<strong>${escapeHtml(disaster.title)}</strong>) now has <strong>${disaster.reportCount} reports</strong>.
        </div>
      `;
    } else {
      alertBox.innerHTML = `
        <div class="alert alert-success">
          ✅ <strong>NEW DISASTER CREATED:</strong><br>
          ${data.message}<br>
          Incident ID: #${disaster.id} (<strong>${escapeHtml(disaster.title)}</strong>).
        </div>
      `;
    }

    document.getElementById('disasterReportForm').reset();
    populateFormCoords(currentCoords.latitude, currentCoords.longitude);
    loadDisasters();
  } catch (err) {
    handleApiError(err, 'Failed to submit disaster report.');
    alertBox.innerHTML = `<div class="alert alert-danger">${err.message || 'Submission error.'}</div>`;
  }
}

async function loadDisasters() {
  const container = document.getElementById('disasterFeedList');
  if (!container) return;

  const typeFilter = document.getElementById('feedTypeFilter')?.value;
  const statusFilter = document.getElementById('feedStatusFilter')?.value;

  let url = `${API_BASE}/disasters?lat=${currentCoords.latitude}&lon=${currentCoords.longitude}`;
  if (statusFilter) url += `&status=${statusFilter}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) throw data;

    let list = data.data || [];
    if (typeFilter) {
      list = list.filter(d => d.type === typeFilter);
    }

    if (list.length === 0) {
      container.innerHTML = `<p style="color: var(--text-muted); text-align: center; padding: 30px;">No disaster incidents match your current filter.</p>`;
      return;
    }

    container.innerHTML = list.map(d => `
      <div class="disaster-card">
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
            <span class="badge badge-status-${d.status.toLowerCase().replace('_', '')}">${d.status}</span>
          </div>
        </div>

        <p class="disaster-desc">${escapeHtml(d.description)}</p>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; flex-wrap: wrap; gap: 8px;">
          <div>
            <span class="merge-tag">📊 Aggregated Reports: ${d.reportCount}</span>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-outline btn-sm" onclick="openDiscussionModal(${d.id}, '${escapeHtml(d.title)}')">💬 Discussion</button>
            <button class="btn btn-secondary btn-sm" onclick="openAssignTaskModal(${d.id})">🎯 Assign Task</button>
            ${currentUser && (currentUser.role === 'ADMIN' || currentUser.role === 'GOVERNMENT_AGENCY') ? `
              <button class="btn btn-outline btn-sm" onclick="updateDisasterStatusPrompt(${d.id})">⚙️ Update Status</button>
            ` : ''}
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    handleApiError(err);
  }
}

async function updateDisasterStatusPrompt(disasterId) {
  const newStatus = prompt("Enter new status (VERIFIED_ACTIVE, IN_PROGRESS, RESOLVED, CLOSED):");
  if (!newStatus) return;

  try {
    const res = await fetch(`${API_BASE}/disasters/${disasterId}/status?actorId=${currentUser ? currentUser.id : ''}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus.toUpperCase().trim() })
    });
    const data = await res.json();
    if (!res.ok) throw data;
    alert("Disaster status successfully updated!");
    loadDisasters();
  } catch (err) {
    handleApiError(err);
  }
}

// ==============================================================================
// 5. VOLUNTEER MISSIONS & ASSIGNMENT HUB
// ==============================================================================

async function loadVolunteerData() {
  loadVolunteerAssignments();
  loadVolunteersDirectory();
}

async function loadVolunteerAssignments() {
  const container = document.getElementById('volunteerAssignmentsList');
  if (!container) return;

  let url = `${API_BASE}/volunteers/assignments/disaster/1`;
  if (currentUser && currentUser.role === 'VOLUNTEER') {
    url = `${API_BASE}/volunteers/assignments/volunteer/${currentUser.id}`;
  }

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) throw data;

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
        
        ${currentUser && (currentUser.id === a.volunteerId || currentUser.role === 'ADMIN' || currentUser.role === 'NGO') && a.status !== 'COMPLETED' ? `
          <div style="margin-top: 8px;">
            <button class="btn btn-success btn-sm" onclick="updateMissionStatus(${a.id}, 'COMPLETED')">✓ Mark Completed</button>
            <button class="btn btn-outline btn-sm" onclick="updateMissionStatus(${a.id}, 'IN_PROGRESS')">⏳ In Progress</button>
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
    const res = await fetch(`${API_BASE}/volunteers/assignments/${assignmentId}/status?userId=${currentUser ? currentUser.id : ''}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    if (!res.ok) throw data;
    alert("Mission status updated to " + newStatus);
    loadVolunteerAssignments();
  } catch (err) {
    handleApiError(err);
  }
}

async function loadVolunteersDirectory() {
  const container = document.getElementById('volunteersDirectoryList');
  if (!container) return;

  try {
    const res = await fetch(`${API_BASE}/volunteers/available?lat=${currentCoords.latitude}&lon=${currentCoords.longitude}`);
    const data = await res.json();
    if (!res.ok) throw data;

    const list = data.data || [];
    if (list.length === 0) {
      container.innerHTML = `<p style="color: var(--text-muted); text-align: center; padding: 20px;">No available volunteers found in the pool.</p>`;
      return;
    }

    container.innerHTML = list.map(v => `
      <div style="border-bottom: 1px solid var(--border); padding: 10px 0; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <strong>👷 ${escapeHtml(v.name)}</strong> (${escapeHtml(v.phone)})
          <div style="font-size: 0.8rem; color: var(--text-muted);">
            Skills: ${escapeHtml(v.skills || 'General Relief')} | Missions Completed: <strong>${v.helpedCount}</strong>
          </div>
        </div>
        <span class="badge badge-status-active">${v.availabilityStatus}</span>
      </div>
    `).join('');
  } catch (err) {
    handleApiError(err);
  }
}

async function openAssignTaskModal(disasterId) {
  document.getElementById('assignDisasterId').value = disasterId;
  const select = document.getElementById('assignVolunteerSelect');
  select.innerHTML = '<option value="">Loading volunteers...</option>';

  openModal('taskAssignModal');

  try {
    const res = await fetch(`${API_BASE}/volunteers/available`);
    const data = await res.json();
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

  try {
    const res = await fetch(`${API_BASE}/volunteers/assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw data;

    alert("Rescue mission successfully dispatched!");
    closeModal('taskAssignModal');
    loadVolunteerAssignments();
  } catch (err) {
    handleApiError(err);
  }
}

// ==============================================================================
// 6. RESOURCE MANAGEMENT
// ==============================================================================

async function loadResources() {
  const container = document.getElementById('resourcePoolList');
  if (!container) return;

  try {
    const res = await fetch(`${API_BASE}/resources`);
    const data = await res.json();
    if (!res.ok) throw data;

    const list = data.data || [];
    if (list.length === 0) {
      container.innerHTML = `<p style="color: var(--text-muted); text-align: center; padding: 20px;">No supplies in the emergency pool yet.</p>`;
      return;
    }

    container.innerHTML = list.map(r => `
      <div style="border-bottom: 1px solid var(--border); padding: 12px 0;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong>[${r.resourceType}] ${escapeHtml(r.resourceName)}</strong>
          <span class="badge badge-status-active">${r.quantity} ${escapeHtml(r.unit)}</span>
        </div>
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;">
          Provided by: <strong>${escapeHtml(r.providerName)}</strong> (${r.providerRole}) | Contact: ${escapeHtml(r.contactPhone || 'N/A')}
        </div>
      </div>
    `).join('');
  } catch (err) {
    handleApiError(err);
  }
}

async function handleResourceSubmit(e) {
  e.preventDefault();
  if (!currentUser) return;

  const payload = {
    providerId: currentUser.id,
    resourceType: document.getElementById('resType').value,
    resourceName: document.getElementById('resName').value.trim(),
    quantity: parseInt(document.getElementById('resQty').value),
    unit: document.getElementById('resUnit').value.trim(),
    contactPhone: document.getElementById('resPhone').value.trim() || currentUser.phone
  };

  try {
    const res = await fetch(`${API_BASE}/resources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw data;

    alert("Resource successfully contributed to emergency pool!");
    document.getElementById('resourceForm').reset();
    loadResources();
  } catch (err) {
    handleApiError(err);
  }
}

// ==============================================================================
// 7. DISCUSSION & COMMENTS
// ==============================================================================

async function openDiscussionModal(disasterId, title) {
  activeDisasterIdForComments = disasterId;
  document.getElementById('discussionModalTitle').textContent = `💬 Incident #${disasterId} Coordination Discussion`;
  openModal('discussionModal');
  loadComments(disasterId);
}

async function loadComments(disasterId) {
  const container = document.getElementById('commentsContainer');
  if (!container) return;

  try {
    const res = await fetch(`${API_BASE}/disasters/${disasterId}/comments`);
    const data = await res.json();
    if (!res.ok) throw data;

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
    const res = await fetch(`${API_BASE}/disasters/${activeDisasterIdForComments}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw data;

    textInput.value = '';
    loadComments(activeDisasterIdForComments);
  } catch (err) {
    handleApiError(err);
  }
}

// ==============================================================================
// 8. ADMIN COMMAND CENTER & ANALYTICS
// ==============================================================================

async function loadAdminData() {
  if (!currentUser || currentUser.role !== 'ADMIN') {
    showAccessDeniedView();
    return;
  }

  loadAdminAnalytics();
  loadAdminPendingUsers();
  loadAdminPendingDisasters();
}

async function loadAdminAnalytics() {
  try {
    const res = await fetch(`${API_BASE}/admin/analytics`);
    const data = await res.json();
    if (!res.ok) throw data;

    const kpi = data.data;
    document.getElementById('kpiActiveDisasters').textContent = kpi.activeDisasters;
    document.getElementById('kpiReportsAggregated').textContent = kpi.totalReportsAggregated;
    document.getElementById('kpiActiveVolunteers').textContent = kpi.activeVolunteers;
    document.getElementById('kpiPendingApprovals').textContent = kpi.pendingUserApprovals + kpi.pendingDisasters;
  } catch (err) {
    console.error(err);
  }
}

async function loadAdminPendingUsers() {
  const container = document.getElementById('adminPendingUsersList');
  if (!container) return;

  try {
    const res = await fetch(`${API_BASE}/admin/pending-users`);
    const data = await res.json();
    if (!res.ok) throw data;

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
    const res = await fetch(`${API_BASE}/admin/approve-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminId: currentUser.id,
        userId: userId,
        action: action,
        comments: action === 'APPROVED' ? 'Verified organization credentials' : 'Failed verification'
      })
    });
    const data = await res.json();
    if (!res.ok) throw data;

    alert(`Organization ${action.toLowerCase()} successfully.`);
    loadAdminData();
  } catch (err) {
    handleApiError(err);
  }
}

async function loadAdminPendingDisasters() {
  const container = document.getElementById('adminPendingDisastersList');
  if (!container) return;

  try {
    const res = await fetch(`${API_BASE}/admin/pending-disasters`);
    const data = await res.json();
    if (!res.ok) throw data;

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
    const res = await fetch(`${API_BASE}/admin/approve-disaster`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminId: currentUser.id,
        disasterId: disasterId,
        action: action,
        comments: action === 'APPROVED' ? 'Report verified by incident commander' : 'False alarm'
      })
    });
    const data = await res.json();
    if (!res.ok) throw data;

    alert(`Disaster report ${action.toLowerCase()}.`);
    loadAdminData();
    loadDisasters();
  } catch (err) {
    handleApiError(err);
  }
}

// ==============================================================================
// 9. UI NAVIGATION & MODALS
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
  document.getElementById(id).classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
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
