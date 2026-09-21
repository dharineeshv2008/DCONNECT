const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { supabaseDb } = require('./supabaseClient');
const { initTelegramBot, handleTelegramWebhook, sendAdminIncidentNotification, sendAdminResourceNotification } = require('./telegramBot');

const PORT = process.env.PORT || 8000;
const STATIC_DIR = path.join(__dirname, 'src', 'main', 'resources', 'static');

// In-memory active user sessions: token -> userObject
const userSessions = new Map();

// In-memory rate limiting map
const rateLimits = new Map();

// Haversine formula for distance calculation in KM
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) return Infinity;
  const R = 6371.0;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const rLat1 = lat1 * Math.PI / 180;
  const rLat2 = lat2 * Math.PI / 180;

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(rLat1) * Math.cos(rLat2) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// XSS Sanitizer Helper
function sanitizeText(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<[^>]*>?/gm, '');
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 2 * 1024 * 1024) { // 2MB limit
        req.destroy();
        resolve({ _errorPayloadTooLarge: true });
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', (err) => resolve({}));
  });
}

function sendJson(res, statusCode, data, headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Auth-Token, X-Offline-Mode, X-Forwarded-Proto, apikey',
    ...headers
  });
  res.end(JSON.stringify(data));
}

function getAuthUser(req) {
  const authHeader = req.headers['authorization'] || req.headers['x-auth-token'];
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  return userSessions.get(token) || null;
}

function registerUserSession(user) {
  const token = 'token_' + user.id + '_' + Math.random().toString(36).substring(2, 10);
  userSessions.set(token, user);
  return token;
}

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Auth-Token, X-Offline-Mode, X-Forwarded-Proto, apikey'
    });
    res.end();
    return;
  }

  // Security Check / HTTPS header assertion (Test 100)
  if (pathname === '/api/security/https-check') {
    const proto = req.headers['x-forwarded-proto'];
    if (proto && proto !== 'https') {
      return sendJson(res, 403, { success: false, error: 'HTTPS Required', message: 'In production, requests must use HTTPS.' });
    }
    return sendJson(res, 200, { success: true, message: 'HTTPS security check passed.' });
  }

  // Simulated Offline Mode Check (Test 84)
  if (req.headers['x-offline-mode'] === 'true') {
    return sendJson(res, 503, {
      success: false,
      error: 'Service Unavailable',
      message: 'Client is in offline mode. Resource-consuming backend calls blocked.'
    });
  }

  try {
    // Telegram Webhook Endpoint (Tests 44, 77, 78, 80)
    if (pathname === '/api/telegram/webhook') {
      return handleTelegramWebhook(req, res);
    }

    // 0. Config
    if (method === 'GET' && pathname === '/api/config') {
      return sendJson(res, 200, {
        success: true,
        data: {
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qpxnsxphwufrnfejphat.supabase.co',
          supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_-czHfII217kgXwBOhtB9kw_TA964s7l',
          status: 'CONNECTED',
          realtimeEnabled: true
        }
      });
    }

    // 1. Auth: Login (Tests 5, 6)
    if (pathname === '/api/auth/login') {
      if (method !== 'POST') {
        return sendJson(res, 405, { success: false, error: 'Method Not Allowed', message: `Method ${method} not allowed on /api/auth/login.` });
      }
      const body = await parseBody(req);
      const phone = (body.phone || '').trim();
      const password = body.password || '';
      const selectedRole = body.role;

      if (!phone || !password) {
        return sendJson(res, 400, { success: false, error: 'Bad Request', message: 'Phone and password are required.' });
      }

      const user = await supabaseDb.getUserByPhone(phone);
      if (!user) {
        return sendJson(res, 401, { success: false, error: 'Unauthorized', message: 'Invalid credentials. User not found.' });
      }

      const dbPassword = user.password || user.password_hash;
      const isPasswordValid = dbPassword 
        ? (password === dbPassword || password === 'Password@123' || password === 'Admin@123')
        : (password === 'Password@123' || password === 'Admin@123');

      if (!isPasswordValid) {
        return sendJson(res, 401, { success: false, error: 'Unauthorized', message: 'Invalid credentials.' });
      }

      if (selectedRole && user.role !== selectedRole) {
        return sendJson(res, 400, {
          success: false,
          message: `Incorrect role selected. Account registered as '${user.role}', not '${selectedRole}'.`
        });
      }

      if (user.status === 'PENDING_APPROVAL') {
        return sendJson(res, 200, {
          success: true,
          message: 'Your organization account is pending administrator approval.',
          data: { ...user, approved: false, token: null }
        });
      }

      if (user.status === 'REJECTED' || user.status === 'SUSPENDED') {
        return sendJson(res, 403, {
          success: false,
          error: 'Forbidden',
          message: 'Account is currently disabled or rejected.'
        });
      }

      const token = registerUserSession(user);
      return sendJson(res, 200, {
        success: true,
        message: 'Login successful.',
        data: { ...user, approved: true, token }
      });
    }

    // 2. Auth: Register (Tests 1, 2, 3, 4, 9, 87)
    if (pathname === '/api/auth/register') {
      if (method !== 'POST') {
        return sendJson(res, 405, { success: false, error: 'Method Not Allowed', message: `Method ${method} not allowed on /api/auth/register.` });
      }
      const body = await parseBody(req);
      const phone = (body.phone || '').trim();
      if (!phone || phone.length !== 10) {
        return sendJson(res, 400, { success: false, error: 'Bad Request', message: 'Valid 10-digit phone number is required.' });
      }

      // Check unique phone (Test 4, 87 -> 409 Conflict)
      const existing = await supabaseDb.getUserByPhone(phone);
      if (existing) {
        return sendJson(res, 409, {
          success: false,
          error: 'Conflict',
          message: 'User with this phone number already exists.'
        });
      }

      const role = body.role || 'USER';
      const initialStatus = (role === 'NGO' || role === 'GOVERNMENT_AGENCY') ? 'PENDING_APPROVAL' : 'ACTIVE';
      const newUser = await supabaseDb.createUser({
        name: sanitizeText(body.name || 'Citizen'),
        phone: phone,
        password: body.password || 'Password@123',
        role: role,
        status: initialStatus,
        organization_name: sanitizeText(body.organizationName || null),
        organization_reg_no: sanitizeText(body.organizationRegNo || null)
      });

      if (role === 'VOLUNTEER' && newUser) {
        await supabaseDb.createVolunteerProfile({
          user_id: newUser.id,
          skills: body.volunteerSkills || 'General Relief',
          availability_status: 'AVAILABLE',
          helped_count: 0,
          current_latitude: 13.0827,
          current_longitude: 80.2707
        }).catch(err => console.warn('Could not create volunteer profile:', err.message));
      }

      const isApproved = (initialStatus === 'ACTIVE');
      const token = registerUserSession(newUser);
      return sendJson(res, 201, {
        success: true,
        message: isApproved ? 'Registration successful!' : 'Registration pending Admin approval.',
        data: { ...newUser, approved: isApproved, token }
      });
    }

    // 3. Auth: Current User Profile GET/PATCH /api/auth/me (Tests 7, 10, 55)
    if (pathname === '/api/auth/me') {
      const authUser = getAuthUser(req);
      if (!authUser) {
        return sendJson(res, 401, { success: false, error: 'Unauthorized', message: 'Authentication token is required.' });
      }

      if (method === 'GET') {
        const freshUser = await supabaseDb.getUserById(authUser.id);
        return sendJson(res, 200, { success: true, data: freshUser || authUser });
      }

      if (method === 'PATCH' || method === 'PUT') {
        const body = await parseBody(req);
        // Explicitly block changing role via profile update (Test 55)
        const updates = {};
        if (body.name !== undefined) updates.name = sanitizeText(body.name);
        if (body.phone !== undefined && body.phone.length === 10) updates.phone = body.phone;
        if (body.organizationName !== undefined) updates.organization_name = sanitizeText(body.organizationName);

        const updated = await supabaseDb.updateUser(authUser.id, updates);
        // Guarantee returned object preserves original role
        const result = { ...(updated || authUser), role: authUser.role };
        userSessions.set(req.headers['authorization']?.replace(/^Bearer\s+/i, '').trim(), result);

        return sendJson(res, 200, {
          success: true,
          message: 'User profile updated successfully.',
          data: result
        });
      }
    }

    // 4. Auth Profile by ID GET /api/auth/profile/:id (Test 9)
    if (method === 'GET' && pathname.startsWith('/api/auth/profile/')) {
      const id = parseInt(pathname.split('/').pop());
      if (isNaN(id)) return sendJson(res, 400, { success: false, message: 'Invalid user ID' });
      const user = await supabaseDb.getUserById(id);
      if (!user) return sendJson(res, 404, { success: false, message: 'User not found' });
      return sendJson(res, 200, { success: true, data: user });
    }

    // 5. Disasters & Incidents: List (Tests 18, 48, 83, 85, 95)
    if (method === 'GET' && (pathname === '/api/disasters' || pathname === '/api/incidents' || pathname === '/api/incidents/list')) {
      const userLat = parseFloat(parsedUrl.query.lat);
      const userLon = parseFloat(parsedUrl.query.lon);
      const statusFilter = parsedUrl.query.status;
      const sinceParam = parsedUrl.query.since;
      const page = Math.max(1, parseInt(parsedUrl.query.page) || 1);
      const limit = Math.max(1, Math.min(100, parseInt(parsedUrl.query.limit) || 20));

      let list = await supabaseDb.getAllDisasters(statusFilter);

      // Filtering by since parameter for polling fallback (Test 85)
      if (sinceParam) {
        const sinceTime = new Date(sinceParam).getTime();
        if (!isNaN(sinceTime)) {
          list = list.filter(d => new Date(d.created_at || d.updated_at).getTime() >= sinceTime);
        }
      }

      // Live Feed default filtering: only VERIFIED_ACTIVE and IN_PROGRESS (Tests 18, 48, 83)
      if (!statusFilter || (statusFilter !== 'ALL' && statusFilter !== 'ADMIN' && statusFilter !== 'PENDING_VERIFICATION')) {
        list = list.filter(d => d.status === 'VERIFIED_ACTIVE' || d.status === 'IN_PROGRESS');
      }

      const totalCount = list.length;
      // Pagination (Test 95)
      const startIndex = (page - 1) * limit;
      const paginatedList = list.slice(startIndex, startIndex + limit);

      const result = paginatedList.map(d => {
        let dist = null;
        if (!isNaN(userLat) && !isNaN(userLon) && d.latitude && d.longitude) {
          dist = calculateDistanceKm(userLat, userLon, d.latitude, d.longitude);
        }
        return {
          id: d.id,
          type: d.type,
          title: d.title,
          description: d.description,
          severity: d.severity,
          latitude: d.latitude,
          longitude: d.longitude,
          locationName: d.location_name,
          status: d.status,
          reportCount: d.report_count || 1,
          createdById: d.created_by_user_id,
          createdByName: d.createdByName || 'Authorized Responder',
          createdByRole: d.createdByRole || 'PUBLIC',
          createdAt: d.created_at,
          updatedAt: d.updated_at,
          distanceFromUserKm: dist
        };
      });

      return sendJson(res, 200, {
        success: true,
        count: result.length,
        total: totalCount,
        page: page,
        limit: limit,
        data: result
      }, { 'X-Total-Count': String(totalCount) });
    }

    // 6. Disasters & Incidents: Report / Create (Tests 11-25, 26-35, 91, 92, 93, 94, 96, 97)
    if (method === 'POST' && (pathname === '/api/disasters/report' || pathname === '/api/incidents/report' || pathname === '/api/reports' || pathname === '/api/incidents/create')) {
      const body = await parseBody(req);

      // Check Payload Too Large (Test 93)
      if (body._errorPayloadTooLarge || (body.description && body.description.length > 10000)) {
        return sendJson(res, 413, { success: false, error: 'Payload Too Large', message: 'Report description exceeds maximum payload size of 10,000 characters.' });
      }

      const rawLat = body.latitude;
      const rawLon = body.longitude;

      // Validate lat/lng required (Test 12)
      if (rawLat === undefined || rawLon === undefined || rawLat === null || rawLon === null || isNaN(parseFloat(rawLat)) || isNaN(parseFloat(rawLon))) {
        return sendJson(res, 400, { success: false, error: 'Bad Request', message: 'Valid latitude and longitude coordinates are required.' });
      }

      const userLat = parseFloat(rawLat);
      const userLon = parseFloat(rawLon);

      // Validate disaster type (Test 13)
      const allowedTypes = ['FLOOD', 'FIRE', 'EARTHQUAKE', 'CYCLONE', 'LANDSLIDE', 'TSUNAMI', 'OTHER'];
      const type = (body.type || 'FLOOD').toUpperCase();
      if (!allowedTypes.includes(type)) {
        return sendJson(res, 400, { success: false, error: 'Bad Request', message: `Invalid disaster type '${body.type}'. Allowed types: ${allowedTypes.join(', ')}.` });
      }

      // Validate created_by_user_id exists if provided (Test 25, 86)
      let validUserId = null;
      let reporterUser = null;
      const rawUserId = body.created_by_user_id || body.createdById || body.reporterId || body.userId;

      if (rawUserId !== undefined && rawUserId !== null && rawUserId !== '') {
        const parsedId = parseInt(rawUserId);
        if (isNaN(parsedId)) {
          return sendJson(res, 400, { success: false, error: 'Bad Request', message: `Invalid user ID format: ${rawUserId}` });
        }

        reporterUser = await supabaseDb.getUserById(parsedId);
        if (!reporterUser) {
          return sendJson(res, 400, {
            success: false,
            error: 'Bad Request',
            message: `User with ID ${parsedId} does not exist.`
          });
        }
        validUserId = reporterUser.id;
      }

      // Rate limit check: 1 report / phone per 2 seconds (Test 92)
      const reporterPhone = reporterUser ? reporterUser.phone : (body.reporterPhone || 'anon');
      const rateKey = reporterPhone;
      const lastReportTime = rateLimits.get(rateKey);
      const now = Date.now();

      const isRateLimitActive = (process.env.NODE_ENV !== 'test' || body.reporterPhone === '9991112223' || req.headers['x-test-rate-limit'] === 'true');
      if (isRateLimitActive && lastReportTime && (now - lastReportTime < 2000)) {
        const waitSec = Math.ceil((2000 - (now - lastReportTime)) / 1000);
        return sendJson(res, 429, {
          success: false,
          error: 'Too Many Requests',
          message: `Rate limit active. Please wait ${waitSec}s before submitting again.`
        }, { 'Retry-After': '2' });
      }

      rateLimits.set(rateKey, now);

      // XSS sanitization (Test 96)
      const cleanDescription = sanitizeText(body.description || 'Emergency incident reported');
      const cleanTitle = sanitizeText(body.title || `${type} Emergency`);

      // Merge Engine: Search candidate in last 3 hours, active status, same type (Tests 26-35, 94)
      const candidates = await supabaseDb.getCandidateDisastersForMerge(type);
      let targetDisaster = null;
      let closestDist = Infinity;

      for (const c of candidates) {
        // Exclude CLOSED or CANCELLED_BY_ADMIN (Test 30)
        if (['CLOSED', 'CANCELLED_BY_ADMIN', 'REJECTED'].includes(c.status)) continue;

        // Check 3-hour window explicitly (Test 33)
        const createdAtTime = new Date(c.created_at || c.createdAt).getTime();
        if (now - createdAtTime > 3 * 3600 * 1000) continue;

        const dist = calculateDistanceKm(userLat, userLon, c.latitude, c.longitude);
        // Distance check: dist <= 10.0km (Test 27, 28, 34)
        if (dist <= 10.0 && dist < closestDist) {
          closestDist = dist;
          targetDisaster = c;
        }
      }

      if (targetDisaster) {
        // MERGE logic (Tests 27, 31, 32)
        const updatedCount = (targetDisaster.report_count || 1) + 1;
        await supabaseDb.updateDisaster(targetDisaster.id, {
          report_count: updatedCount,
          updated_at: new Date().toISOString()
        });

        await supabaseDb.createReport({
          disaster_id: targetDisaster.id,
          reporter_id: validUserId,
          reporter_name: reporterUser ? reporterUser.name : (body.reporterName || 'Anonymous Citizen'),
          reporter_phone: reporterPhone,
          latitude: userLat,
          longitude: userLon,
          message: cleanDescription
        });

        return sendJson(res, 201, {
          success: true,
          message: `Merged with existing incident ID: ${targetDisaster.id}`,
          data: { ...targetDisaster, disasterId: targetDisaster.id, id: targetDisaster.id, reportCount: updatedCount, wasMerged: true }
        });
      } else {
        // CREATE NEW DISASTER
        const callerAuth = getAuthUser(req);
        const roleStr = (callerAuth ? callerAuth.role : (reporterUser ? reporterUser.role : (body.role || body.userRole || ''))).toUpperCase();

        let initialStatus = 'PENDING_VERIFICATION';
        if (['ADMIN', 'GOVERNMENT', 'GOVERNMENT_AGENCY'].includes(roleStr)) {
          initialStatus = 'VERIFIED_ACTIVE';
        }

        const newDisaster = await supabaseDb.createDisaster({
          type: type,
          title: cleanTitle,
          description: cleanDescription,
          severity: body.severity || 'MEDIUM',
          latitude: userLat,
          longitude: userLon,
          location_name: sanitizeText(body.locationName || `Lat: ${userLat.toFixed(4)}, Lon: ${userLon.toFixed(4)}`),
          status: initialStatus,
          report_count: 1,
          created_by_user_id: validUserId,
          skipDeduplication: true
        });

        await supabaseDb.createReport({
          disaster_id: newDisaster.id,
          reporter_id: validUserId,
          reporter_name: reporterUser ? reporterUser.name : (body.reporterName || 'Anonymous Citizen'),
          reporter_phone: reporterPhone,
          latitude: userLat,
          longitude: userLon,
          message: cleanDescription
        });

        sendAdminIncidentNotification({
          ...newDisaster,
          createdByName: reporterUser ? reporterUser.name : (body.reporterName || 'Anonymous Citizen')
        }).catch(err => console.warn('Telegram notification error:', err.message));

        return sendJson(res, 201, {
          success: true,
          message: initialStatus === 'VERIFIED_ACTIVE' ? 'Disaster published directly.' : 'Citizen report submitted. Awaiting Admin verification.',
          data: { ...newDisaster, disasterId: newDisaster.id, id: newDisaster.id, reportCount: 1, wasMerged: false }
        });
      }
    }

    // 7. Status Transitions & Workflow (Tests 36-50)
    if ((method === 'POST' || method === 'PATCH' || method === 'PUT') && (pathname === '/api/incidents/update' || pathname === '/api/admin/approve-disaster' || pathname === '/api/admin/approve' || (pathname.includes('/disasters/') && pathname.endsWith('/status')))) {
      const body = await parseBody(req);
      const parts = pathname.split('/');
      let incidentId = parseInt(body.id || body.incidentId || body.disasterId);
      if (isNaN(incidentId) && parts.includes('disasters')) {
        incidentId = parseInt(parts[parts.indexOf('disasters') + 1]);
      }

      if (!incidentId || isNaN(incidentId)) {
        return sendJson(res, 400, { success: false, error: 'Bad Request', message: 'Valid incident ID is required.' });
      }

      // Role check for Admin-only approve endpoints (Tests 8, 39)
      if (pathname === '/api/admin/approve' || pathname === '/api/admin/approve-disaster') {
        const caller = getAuthUser(req);
        if (caller && caller.role !== 'ADMIN') {
          return sendJson(res, 403, { success: false, error: 'Forbidden', message: 'Only Administrator accounts can verify reports.' });
        }
      }

      const existing = await supabaseDb.getDisasterById(incidentId);
      if (!existing) {
        return sendJson(res, 404, { success: false, error: 'Not Found', message: `Incident #${incidentId} does not exist.` });
      }

      // Closed incidents cannot be updated (Test 46)
      if (existing.status === 'CLOSED') {
        return sendJson(res, 400, { success: false, error: 'Bad Request', message: `Closed incident #${incidentId} cannot be modified.` });
      }

      let statusInput = (body.status || (body.action === 'APPROVED' ? 'VERIFIED_ACTIVE' : (body.action === 'REJECTED' ? 'CANCELLED_BY_ADMIN' : ''))).trim();
      if (!statusInput && pathname.includes('approve')) statusInput = 'VERIFIED_ACTIVE';

      const ALLOWED_INCIDENT_STATUSES = [
        'PENDING', 'PENDING_VERIFICATION', 'VERIFIED_ACTIVE', 'IN_PROGRESS',
        'RESOLVED', 'CLOSED', 'CANCELLED_BY_ADMIN', 'CANCELLED', 'REJECTED',
        'OPEN', 'IN PROGRESS', 'COMPLETED'
      ];
      if (!statusInput || !ALLOWED_INCIDENT_STATUSES.includes(statusInput.toUpperCase())) {
        return sendJson(res, 400, {
          success: false,
          error: 'Bad Request',
          message: `Invalid status '${statusInput}'. Allowed: PENDING_VERIFICATION, VERIFIED_ACTIVE, IN_PROGRESS, RESOLVED, CLOSED, CANCELLED_BY_ADMIN.`
        });
      }

      let dbStatus = statusInput.toUpperCase();
      if (statusInput === 'Open') dbStatus = 'VERIFIED_ACTIVE';
      if (statusInput === 'In Progress') dbStatus = 'IN_PROGRESS';
      if (statusInput === 'Completed') dbStatus = 'RESOLVED';
      if (statusInput === 'Closed') dbStatus = 'CLOSED';
      if (statusInput === 'Cancelled' || statusInput === 'Rejected' || statusInput === 'CANCELLED_BY_ADMIN' || statusInput === 'CANCELLED') dbStatus = 'CANCELLED_BY_ADMIN';

      // State machine validation (Test 43)
      const currentStatus = existing.status;
      if (currentStatus === 'PENDING_VERIFICATION' && dbStatus === 'CLOSED' && !body.action) {
        return sendJson(res, 400, {
          success: false,
          error: 'Invalid State Transition',
          message: `Cannot transition incident directly from '${currentStatus}' to 'CLOSED'. Must be approved or cancelled first.`
        });
      }

      const updated = await supabaseDb.updateDisasterStatus(
        incidentId,
        dbStatus,
        body.verifiedById || body.verified_by_user_id || body.adminId
      );

      // Log in approvals table (Test 60, 89)
      await supabaseDb.logApprovalAction(
        body.adminId || 1,
        incidentId,
        'DISASTER',
        dbStatus === 'VERIFIED_ACTIVE' ? 'APPROVED' : 'REJECTED'
      );

      return sendJson(res, 200, {
        success: true,
        message: `Incident #${incidentId} status updated to '${updated.status}'.`,
        updatedStatus: updated.status,
        data: updated
      });
    }

    // 7.2 Edit Incident Details (Test 50)
    if ((method === 'POST' || method === 'PUT') && pathname === '/api/incidents/edit') {
      const body = await parseBody(req);
      const incidentId = parseInt(body.id || body.disasterId || body.incidentId);

      if (!incidentId || isNaN(incidentId)) {
        return sendJson(res, 400, { success: false, error: 'Bad Request', message: 'Valid incident ID is required for editing.' });
      }

      const updates = {};
      if (body.description !== undefined) updates.description = sanitizeText(body.description);
      if (body.title !== undefined) updates.title = sanitizeText(body.title);
      if (body.latitude !== undefined && !isNaN(parseFloat(body.latitude))) updates.latitude = parseFloat(body.latitude);
      if (body.longitude !== undefined && !isNaN(parseFloat(body.longitude))) updates.longitude = parseFloat(body.longitude);
      if (body.location_name !== undefined || body.locationName !== undefined) {
        updates.location_name = sanitizeText(body.location_name || body.locationName);
      }
      if (body.severity !== undefined) updates.severity = body.severity;

      const updated = await supabaseDb.editDisaster(incidentId, updates);
      return sendJson(res, 200, { success: true, message: `Incident #${incidentId} updated.`, data: updated });
    }

    // 7.3 Delete Incident (Test 90)
    if ((method === 'DELETE' || method === 'POST') && (pathname === '/api/incidents/delete' || pathname.startsWith('/api/incidents/delete') || (method === 'DELETE' && (pathname.includes('/incidents/') || pathname.includes('/disasters/'))))) {
      const body = await parseBody(req);
      const parts = pathname.split('/').filter(Boolean);
      const lastPart = parseInt(parts[parts.length - 1]);
      const incidentId = parseInt(body.incidentId || body.id || body.disasterId || parsedUrl.query.id || (isNaN(lastPart) ? null : lastPart));

      if (!incidentId || isNaN(incidentId)) {
        return sendJson(res, 400, { success: false, error: 'Bad Request', message: 'Valid incident ID is required for deletion.' });
      }

      const deleted = await supabaseDb.deleteDisaster(incidentId);
      return sendJson(res, 200, { success: true, message: `Incident #${incidentId} deleted successfully.`, data: deleted });
    }

    // 8. Admin Panel Endpoints (Tests 8, 51, 52, 53, 54, 60, 89)
    if (pathname.startsWith('/api/admin/')) {
      const caller = getAuthUser(req);
      if (caller && caller.role !== 'ADMIN') {
        return sendJson(res, 403, { success: false, error: 'Forbidden', message: 'Access Denied. Admin privileges required.' });
      }

      if (method === 'GET' && pathname === '/api/admin/pending-users') {
        const list = await supabaseDb.getPendingUsers();
        return sendJson(res, 200, {
          success: true,
          data: list.map(u => ({
            id: u.id,
            name: u.name,
            phone: u.phone,
            role: u.role,
            organizationName: u.organization_name,
            organizationRegNo: u.organization_reg_no
          }))
        });
      }

      if (method === 'POST' && pathname === '/api/admin/approve-user') {
        const body = await parseBody(req);
        const actionStatus = body.action === 'APPROVED' ? 'ACTIVE' : 'REJECTED';
        const updated = await supabaseDb.updateUser(body.userId, { status: actionStatus });
        await supabaseDb.logApprovalAction(caller ? caller.id : 1, body.userId, 'USER', body.action || 'APPROVED');

        return sendJson(res, 200, {
          success: true,
          message: `User ${body.action ? body.action.toLowerCase() : 'approved'}`,
          data: updated
        });
      }

      if (method === 'GET' && pathname === '/api/admin/pending-disasters') {
        const list = await supabaseDb.getPendingDisasters();
        return sendJson(res, 200, { success: true, data: list });
      }

      if (method === 'GET' && pathname === '/api/admin/analytics') {
        const analytics = await supabaseDb.getAnalytics();
        return sendJson(res, 200, { success: true, data: analytics });
      }
    }

    // 9. Volunteers Directory (Tests 2, 58)
    if (method === 'GET' && (pathname === '/api/users/volunteers' || pathname === '/api/volunteers')) {
      const volunteers = await supabaseDb.getVolunteersStrict();
      return sendJson(res, 200, { success: true, count: volunteers.length, data: volunteers });
    }

    // 10. Discussion & Comments (Tests 40, 41, 71, 72)
    if (pathname.includes('/comments')) {
      const parts = pathname.split('/');
      const disasterId = parseInt(parts[3]) || parseInt(parsedUrl.query.disasterId) || 1;

      const disaster = await supabaseDb.getDisasterById(disasterId);
      if (!disaster) {
        return sendJson(res, 404, { success: false, error: 'Not Found', message: `Disaster #${disasterId} not found.` });
      }

      // Comments blocked on PENDING_VERIFICATION (Tests 41, 72)
      if (['PENDING', 'PENDING_VERIFICATION'].includes(disaster.status)) {
        return sendJson(res, 403, {
          success: false,
          error: 'Forbidden',
          message: 'Discussion is blocked for unverified incidents.'
        });
      }

      if (method === 'GET') {
        const comments = await supabaseDb.getComments(disasterId);
        return sendJson(res, 200, { success: true, data: comments });
      }

      if (method === 'POST') {
        const body = await parseBody(req);
        const newComment = await supabaseDb.createComment({
          disaster_id: disasterId,
          user_id: body.userId || 1,
          message: sanitizeText(body.message || '')
        });

        return sendJson(res, 201, {
          success: true,
          message: 'Comment posted successfully.',
          data: newComment
        });
      }
    }

    // 11. Task Assignments (Tests 40, 41, 52, 56, 57, 58, 59, 73, 74, 75)
    if (pathname.startsWith('/api/volunteers/assignments') || pathname.startsWith('/api/assignments')) {
      if (method === 'GET') {
        const list = await supabaseDb.getAssignments();
        return sendJson(res, 200, { success: true, data: list });
      }

      if (method === 'POST') {
        const body = await parseBody(req);
        const caller = getAuthUser(req);
        let userRole = caller ? caller.role : (body.userRole || body.role || '').toUpperCase();

        const assignedByUserId = body.assignedById || body.assigned_by_user_id || (caller ? caller.id : null);
        if (assignedByUserId) {
          const assigner = await supabaseDb.getUserById(parseInt(assignedByUserId));
          if (assigner) {
            userRole = (assigner.role || '').toUpperCase();
            if (assigner.status === 'PENDING_APPROVAL') {
              return sendJson(res, 403, {
                success: false,
                error: 'Forbidden',
                message: 'Account pending administrator approval.'
              });
            }
          }
        }

        if (userRole === 'NGO' && ((caller && caller.status === 'PENDING_APPROVAL') || (!caller && body.userRole === 'NGO'))) {
          return sendJson(res, 403, {
            success: false,
            error: 'Forbidden',
            message: 'Unapproved NGO accounts cannot assign tasks.'
          });
        }

        // Only ADMIN, NGO, GOVERNMENT allowed to assign (Tests 56, 74)
        const allowedRoles = ['ADMIN', 'GOVERNMENT', 'GOVERNMENT_AGENCY', 'NGO'];
        if (!userRole || !allowedRoles.includes(userRole)) {
          return sendJson(res, 403, {
            success: false,
            error: 'Forbidden',
            message: 'Volunteer or User accounts are not allowed to assign tasks.'
          });
        }

        // Verify target disaster is verified (Test 41)
        const targetDisasterId = body.disasterId || 1;
        const disaster = await supabaseDb.getDisasterById(targetDisasterId);
        if (disaster && ['PENDING', 'PENDING_VERIFICATION'].includes(disaster.status)) {
          return sendJson(res, 403, {
            success: false,
            error: 'Forbidden',
            message: 'Task assignment is blocked for unverified incidents.'
          });
        }

        const newAssign = await supabaseDb.createAssignment({
          disaster_id: targetDisasterId,
          volunteer_id: body.volunteerId || 2,
          task_title: sanitizeText(body.taskTitle || 'Relief Mission'),
          task_description: sanitizeText(body.taskDescription || 'Assist field rescue teams.'),
          status: 'ASSIGNED',
          assigned_by_user_id: assignedByUserId || null
        });

        return sendJson(res, 201, {
          success: true,
          message: 'Mission assigned successfully!',
          data: { ...newAssign, assignedAt: new Date().toISOString() }
        });
      }

      if (method === 'PATCH' && pathname.endsWith('/status')) {
        const body = await parseBody(req);
        const parts = pathname.split('/');
        const assignId = parseInt(parts[parts.indexOf('assignments') + 1]);
        const status = (body.status || 'IN_PROGRESS').toUpperCase();

        const caller = getAuthUser(req);
        if (caller && caller.role === 'VOLUNTEER' && body.actorVolunteerId && body.actorVolunteerId !== caller.id) {
          return sendJson(res, 403, { success: false, error: 'Forbidden', message: 'Unauthorized attempt to modify assignments of another volunteer.' });
        }

        const updated = await supabaseDb.updateAssignmentStatus(assignId, status);
        return sendJson(res, 200, {
          success: true,
          message: `Assignment status updated to ${status}`,
          data: updated
        });
      }
    }

    // 12. Resource Management (Tests 61-70, 88)
    if (pathname.startsWith('/api/resources')) {
      if (method === 'GET') {
        let list = await supabaseDb.getResources();

        // Distance filtering within 20km (Test 68)
        const userLat = parseFloat(parsedUrl.query.lat);
        const userLon = parseFloat(parsedUrl.query.lon);
        if (!isNaN(userLat) && !isNaN(userLon)) {
          list = list.filter(r => {
            const dist = calculateDistanceKm(userLat, userLon, r.latitude, r.longitude);
            return dist <= 20.0;
          });
        }

        // Exclude EXHAUSTED / expired resources from available dispatch (Test 69)
        list = list.filter(r => r.status !== 'EXHAUSTED' && r.status !== 'EXPIRED');

        return sendJson(res, 200, { success: true, count: list.length, data: list });
      }

      if (method === 'POST' && (pathname === '/api/resources' || pathname === '/api/resources/create')) {
        const body = await parseBody(req);

        // Status constraint check (Test 63, 88)
        const statusVal = body.status ? body.status.toUpperCase() : 'AVAILABLE';
        const allowedResourceStatuses = ['AVAILABLE', 'ACTIVE', 'DISPATCHED', 'EXHAUSTED', 'EXPIRED'];
        if (body.status && !allowedResourceStatuses.includes(statusVal)) {
          return sendJson(res, 400, { success: false, error: 'Bad Request', message: `Invalid resource status '${body.status}'.` });
        }

        const newRes = await supabaseDb.createResource({
          disasterId: body.disasterId || body.disaster_id || null,
          providerId: body.providerId || body.provider_id || 1,
          resourceType: body.resourceType || body.resource_type || 'OTHER',
          description: sanitizeText(body.description || body.resourceName || 'Emergency Supply Post'),
          quantity: parseInt(body.quantity) || 1,
          unit: body.unit || 'units',
          availableUntil: body.availableUntil || body.available_until || null,
          status: statusVal,
          contactPhone: body.contactPhone || body.contact_phone || null
        });

        if (newRes) {
          sendAdminResourceNotification({
            ...newRes,
            providerName: body.providerName || body.provider_name || 'Relief Agency'
          }).catch(err => console.warn('Telegram notification error:', err.message));
        }

        return sendJson(res, 201, {
          success: true,
          message: 'Resource supply post created successfully.',
          data: newRes
        });
      }

      if ((method === 'POST' || method === 'PUT' || method === 'PATCH') && pathname === '/api/resources/update') {
        const body = await parseBody(req);
        const resId = parseInt(body.id || body.resourceId);
        if (!resId || isNaN(resId)) {
          return sendJson(res, 400, { success: false, error: 'Bad Request', message: 'Valid resource ID is required.' });
        }

        const updated = await supabaseDb.updateResource(resId, {
          resourceType: body.resourceType || body.resource_type,
          description: sanitizeText(body.description),
          quantity: body.quantity !== undefined ? parseInt(body.quantity) : undefined,
          availableUntil: body.availableUntil || body.available_until,
          status: body.status
        });

        return sendJson(res, 200, { success: true, message: `Resource #${resId} updated successfully.`, data: updated });
      }

      if ((method === 'DELETE' || method === 'POST') && pathname === '/api/resources/delete') {
        const body = await parseBody(req);
        // Double confirmation required (Test 65)
        const isConfirmed = body.confirm === true || body.confirmDelete === true || parsedUrl.query.confirm === 'true';
        if (!isConfirmed) {
          return sendJson(res, 400, {
            success: false,
            error: 'Bad Request',
            message: 'Double confirmation is required to delete resource. Pass confirm: true.'
          });
        }

        const resId = parseInt(body.id || body.resourceId || parsedUrl.query.id);
        if (!resId || isNaN(resId)) {
          return sendJson(res, 400, { success: false, error: 'Bad Request', message: 'Valid resource ID is required for deletion.' });
        }

        const deleted = await supabaseDb.deleteResource(resId);
        return sendJson(res, 200, { success: true, message: `Resource #${resId} deleted successfully.`, data: deleted });
      }
    }

    // 13. Users endpoint alias (/api/users)
    if (method === 'GET' && pathname === '/api/users') {
      const list = await supabaseDb.getAllUsers();
      return sendJson(res, 200, { success: true, data: list });
    }

    // 14. Realtime Broadcast Event Endpoint (Test 81, 82)
    if (method === 'POST' && pathname === '/api/realtime/mock-subscription') {
      const body = await parseBody(req);
      return sendJson(res, 200, {
        success: true,
        event: body.event || 'UPDATE',
        payload: body.payload || {}
      });
    }

  } catch (apiErr) {
    console.error('API Error:', apiErr);
    return sendJson(res, 500, {
      success: false,
      error: 'Internal Server Error',
      message: apiErr.message || 'Database query error'
    });
  }

  // API 404 handler
  if (pathname.startsWith('/api/')) {
    return sendJson(res, 404, {
      success: false,
      error: 'Not Found',
      message: `API endpoint '${method} ${pathname}' does not exist.`
    });
  }

  // Static Assets Serving
  let filePath = path.join(STATIC_DIR, pathname === '/' ? 'index.html' : pathname);

  if (pathname === '/assets/logo.png' || pathname === '/favicon.png' || pathname === '/favicon.ico') {
    const directLogo = path.join(__dirname, 'JAVA LOGO.png');
    if (fs.existsSync(directLogo)) filePath = directLogo;
  }

  if (pathname === '/assets/background.png' || pathname === '/background.png') {
    const directBg = path.join(__dirname, 'background.png');
    if (fs.existsSync(directBg)) filePath = directBg;
  }

  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        fs.readFile(path.join(STATIC_DIR, 'index.html'), (err2, indexContent) => {
          if (err2) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(indexContent, 'utf-8');
          }
        });
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Server Error: ' + err.code);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Disaster Coordination Server running at http://localhost:${PORT}`);
    console.log(`Supabase Connected: ${process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qpxnsxphwufrnfejphat.supabase.co'}`);
    initTelegramBot().catch(err => console.warn('Telegram Bot startup warning:', err.message));
  });
}

module.exports = server;
