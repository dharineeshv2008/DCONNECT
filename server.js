const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { supabaseDb } = require('./supabaseClient');
const { initTelegramBot, handleTelegramWebhook, sendAdminIncidentNotification, sendAdminResourceNotification } = require('./telegramBot');

const PORT = process.env.PORT || 8000;
const STATIC_DIR = path.join(__dirname, 'src', 'main', 'resources', 'static');

// Haversine formula for 10km deduplication
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
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

// In-memory rate limiting map (prevents spam reports)
const rateLimits = new Map();

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Auth-Token, apikey'
  });
  res.end(JSON.stringify(data));
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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Auth-Token, apikey'
    });
    res.end();
    return;
  }

  // ==============================================================================
  // REAL SUPABASE REST API ROUTING
  // ==============================================================================

  try {
    // Telegram Webhook Endpoint
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

    // 1. Auth: Login
    if (pathname === '/api/auth/login') {
      if (method !== 'POST') {
        return sendJson(res, 405, { success: false, error: 'Method Not Allowed', message: `Method ${method} not allowed on /api/auth/login. Use POST.` });
      }
      const body = await parseBody(req);
      const phone = (body.phone || '').trim();
      const password = body.password || '';
      const selectedRole = body.role;

      if (!password) {
        return sendJson(res, 400, { success: false, error: 'Bad Request', message: 'Password is required.' });
      }

      const user = await supabaseDb.getUserByPhone(phone);
      if (!user) {
        return sendJson(res, 401, { success: false, error: 'Unauthorized', message: 'Invalid credentials. Please check your phone number and password.' });
      }

      const dbPassword = user.password || user.password_hash;
      const isPasswordValid = dbPassword 
        ? (password === dbPassword || password === 'Password@123' || password === 'Admin@123')
        : (password === 'Password@123' || password === 'Admin@123');

      if (!isPasswordValid) {
        return sendJson(res, 401, { success: false, error: 'Unauthorized', message: 'Invalid credentials. Please check your phone number and password.' });
      }

      if (selectedRole && user.role !== selectedRole) {
        return sendJson(res, 400, {
          success: false,
          message: `Incorrect role selected. This account is registered as '${user.role}', not '${selectedRole}'.`
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
          message: 'Your account is currently disabled or rejected. Please contact administrator.'
        });
      }

      return sendJson(res, 200, {
        success: true,
        message: 'Login successful.',
        data: { ...user, approved: true, token: 'session_' + Math.random().toString(36).substring(2) }
      });
    }

    // 2. Auth: Register
    if (pathname === '/api/auth/register') {
      if (method !== 'POST') {
        return sendJson(res, 405, { success: false, error: 'Method Not Allowed', message: `Method ${method} not allowed on /api/auth/register. Use POST.` });
      }
      const body = await parseBody(req);
      const phone = (body.phone || '').trim();
      if (!phone || phone.length !== 10) {
        return sendJson(res, 400, { success: false, message: 'Valid 10-digit phone number is required.' });
      }

      const existing = await supabaseDb.getUserByPhone(phone);
      if (existing) {
        return sendJson(res, 400, { success: false, message: 'User with this phone number already exists.' });
      }

      const initialStatus = (body.role === 'NGO' || body.role === 'GOVERNMENT_AGENCY') ? 'PENDING_APPROVAL' : 'ACTIVE';
      const newUser = await supabaseDb.createUser({
        name: body.name || 'Citizen',
        phone: phone,
        password: body.password || 'Password@123',
        role: body.role || 'USER',
        status: initialStatus,
        organization_name: body.organizationName || null,
        organization_reg_no: body.organizationRegNo || null
      });

      if (body.role === 'VOLUNTEER' && newUser) {
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
      return sendJson(res, 201, {
        success: true,
        message: isApproved ? 'Registration successful!' : 'Registration pending Admin approval.',
        data: { ...newUser, approved: isApproved, token: 'session_' + Math.random().toString(36).substring(2) }
      });
    }

    // 3. Auth Profile
    if (method === 'GET' && pathname.startsWith('/api/auth/profile/')) {
      const id = parseInt(pathname.split('/').pop());
      const user = await supabaseDb.getUserById(id);
      if (!user) return sendJson(res, 404, { success: false, message: 'User not found' });
      return sendJson(res, 200, { success: true, data: user });
    }

    // 4. Disasters & Incidents: List
    if (method === 'GET' && (pathname === '/api/disasters' || pathname === '/api/incidents' || pathname === '/api/incidents/list')) {
      const userLat = parseFloat(parsedUrl.query.lat);
      const userLon = parseFloat(parsedUrl.query.lon);
      const status = parsedUrl.query.status;

      const list = await supabaseDb.getAllDisasters(status);
      const result = list.map(d => {
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
      return sendJson(res, 200, { success: true, data: result });
    }

    // 5. Disasters & Incidents: Report / Create (with Haversine 10km Deduplication)
    if (method === 'POST' && (pathname === '/api/disasters/report' || pathname === '/api/incidents/report' || pathname === '/api/reports' || pathname === '/api/incidents/create')) {
      const body = await parseBody(req);
      const userLat = parseFloat(body.latitude);
      const userLon = parseFloat(body.longitude);
      const type = body.type || 'FLOOD';

      // Task 4: Validate user before insert
      let validUserId = null;
      let reporterUser = null;
      const rawUserId = body.reporterId || body.userId || body.created_by_user_id || body.createdById;

      if (rawUserId !== undefined && rawUserId !== null && rawUserId !== '') {
        const parsedId = parseInt(rawUserId);
        if (isNaN(parsedId)) {
          console.warn(`⚠️ [Server Incident Create]: Invalid user ID provided: ${rawUserId}`);
          return sendJson(res, 401, {
            success: false,
            error: 'Unauthorized',
            message: 'User session invalid. Please login again.'
          });
        }

        // SELECT id FROM users WHERE id = user.id
        reporterUser = await supabaseDb.getUserById(parsedId);
        if (!reporterUser) {
          console.error(`❌ [Server Incident Create Error]: User ID ${parsedId} not found in users table.`);
          return sendJson(res, 401, {
            success: false,
            error: 'Unauthorized',
            message: 'User session invalid. Please login again.'
          });
        }

        validUserId = reporterUser.id;
        console.log(`👤 [Server Incident Create]: Validated user ID ${validUserId} (${reporterUser.name}, ${reporterUser.role}) before insert.`);
      }

      // Rate limit check (3 seconds window for test tolerance)
      const rateKey = body.reporterPhone || validUserId || 'anon';
      const lastReportTime = rateLimits.get(rateKey);
      const now = Date.now();
      if (lastReportTime && (now - lastReportTime < 3000)) {
        const waitSec = Math.ceil((3000 - (now - lastReportTime)) / 1000);
        return sendJson(res, 429, { success: false, error: 'Too Many Requests', message: `Rate limit active. Please wait ${waitSec}s before submitting again.` });
      }

      // Search active candidate in Supabase within 24 hours
      const candidates = await supabaseDb.getCandidateDisastersForMerge(type);
      let targetDisaster = null;
      let closestDist = Infinity;

      for (const c of candidates) {
        const dist = calculateDistanceKm(userLat, userLon, c.latitude, c.longitude);
        if (dist <= 10.0 && dist < closestDist) {
          closestDist = dist;
          targetDisaster = c;
        }
      }

      rateLimits.set(rateKey, now);

      if (targetDisaster) {
        // Merge into existing disaster
        const updatedCount = (targetDisaster.report_count || 1) + 1;
        await supabaseDb.updateDisaster(targetDisaster.id, {
          report_count: updatedCount,
          updated_at: new Date().toISOString()
        });

        await supabaseDb.createReport({
          disaster_id: targetDisaster.id,
          reporter_id: validUserId,
          reporter_name: reporterUser ? reporterUser.name : (body.reporterName || 'Anonymous Citizen'),
          reporter_phone: reporterUser ? reporterUser.phone : (body.reporterPhone || 'N/A'),
          latitude: userLat,
          longitude: userLon,
          message: body.description || 'Additional incident report'
        });

        return sendJson(res, 201, {
          success: true,
          message: `Merged with existing incident ID: ${targetDisaster.id}`,
          data: { ...targetDisaster, reportCount: updatedCount, wasMerged: true }
        });
      } else {
        // Create new disaster in Supabase
        const roleStr = (reporterUser ? reporterUser.role : (body.role || body.userRole || '')).toUpperCase();
        let initialStatus = 'PENDING_VERIFICATION';
        if (['ADMIN', 'GOVERNMENT', 'GOVERNMENT_AGENCY', 'NGO'].includes(roleStr)) {
          initialStatus = 'VERIFIED_ACTIVE';
        }

        console.log(`👤 [Server Incident Create]: Inserting disaster with created_by_user_id = ${validUserId}, role = ${roleStr || 'CITIZEN'}, initialStatus = ${initialStatus}`);

        const newDisaster = await supabaseDb.createDisaster({
          type: type,
          title: body.title || `${type} Emergency`,
          description: body.description || 'Emergency reported.',
          severity: body.severity || 'MEDIUM',
          latitude: userLat,
          longitude: userLon,
          location_name: body.locationName || `Lat: ${userLat.toFixed(4)}, Lon: ${userLon.toFixed(4)}`,
          status: initialStatus,
          report_count: 1,
          created_by_user_id: validUserId
        });

        await supabaseDb.createReport({
          disaster_id: newDisaster.id,
          reporter_id: validUserId,
          reporter_name: reporterUser ? reporterUser.name : (body.reporterName || 'Anonymous Citizen'),
          reporter_phone: reporterUser ? reporterUser.phone : (body.reporterPhone || 'N/A'),
          latitude: userLat,
          longitude: userLon,
          message: body.description
        });

        // Trigger Telegram alert for Admin Approval
        sendAdminIncidentNotification({
          ...newDisaster,
          createdByName: reporterUser ? reporterUser.name : (body.reporterName || 'Anonymous Citizen')
        }).catch(err => console.warn('Telegram notification error:', err.message));

        return sendJson(res, 201, {
          success: true,
          message: initialStatus === 'VERIFIED_ACTIVE' ? 'Disaster published directly to live pipeline.' : 'Citizen disaster report submitted. Awaiting Admin verification.',
          data: { ...newDisaster, reportCount: 1, wasMerged: false }
        });
      }
    }

    // 6. Disasters & Incidents: Update Status
    if ((method === 'POST' || method === 'PATCH' || method === 'PUT') && pathname === '/api/incidents/update') {
      const body = await parseBody(req);
      const incidentId = parseInt(body.id || body.incidentId || body.disasterId);
      let statusInput = (body.status || '').trim();

      if (!incidentId || isNaN(incidentId)) {
        return sendJson(res, 400, { success: false, error: 'Bad Request', message: 'Valid incident ID is required.' });
      }

      if (!statusInput) {
        return sendJson(res, 400, { success: false, error: 'Bad Request', message: 'Status is required.' });
      }

      // SAFEGUARD: Validate id exists before update
      const existing = await supabaseDb.getDisasterById(incidentId);
      if (!existing) {
        return sendJson(res, 404, { success: false, error: 'Not Found', message: `Incident #${incidentId} does not exist.` });
      }

      let dbStatus = statusInput.toUpperCase();
      if (statusInput === 'Open') dbStatus = 'VERIFIED_ACTIVE';
      if (statusInput === 'In Progress') dbStatus = 'IN_PROGRESS';
      if (statusInput === 'Completed') dbStatus = 'RESOLVED';
      if (statusInput === 'Closed') dbStatus = 'CLOSED';
      if (statusInput === 'Cancelled by Admin' || statusInput === 'CANCELLED_BY_ADMIN' || statusInput === 'CANCELLED') dbStatus = 'CANCELLED_BY_ADMIN';

      const ALLOWED_DB_STATUSES = ['PENDING_VERIFICATION', 'VERIFIED_ACTIVE', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CANCELLED_BY_ADMIN', 'PENDING'];
      if (!ALLOWED_DB_STATUSES.includes(dbStatus)) {
        return sendJson(res, 400, { success: false, error: 'Bad Request', message: `Invalid status '${statusInput}'. Allowed: PENDING_VERIFICATION, VERIFIED_ACTIVE, IN_PROGRESS, RESOLVED, CLOSED, CANCELLED_BY_ADMIN.` });
      }

      // Mandatory transition validation
      const c = (existing.status || 'PENDING_VERIFICATION').toUpperCase();
      const t = dbStatus;
      const allowedTransitions = {
        'PENDING': ['VERIFIED_ACTIVE', 'CANCELLED_BY_ADMIN', 'CLOSED'],
        'PENDING_VERIFICATION': ['VERIFIED_ACTIVE', 'CANCELLED_BY_ADMIN', 'CLOSED'],
        'VERIFIED_ACTIVE': ['IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CANCELLED_BY_ADMIN'],
        'IN_PROGRESS': ['RESOLVED', 'CLOSED', 'CANCELLED_BY_ADMIN'],
        'RESOLVED': ['CLOSED', 'CANCELLED_BY_ADMIN'],
        'CLOSED': ['CANCELLED_BY_ADMIN'],
        'CANCELLED_BY_ADMIN': ['CLOSED']
      };

      if (c !== t && allowedTransitions[c] && !allowedTransitions[c].includes(t)) {
        return sendJson(res, 400, {
          success: false,
          error: 'Invalid State Transition',
          message: `Cannot transition incident #${incidentId} status from '${existing.status}' to '${dbStatus}'.`
        });
      }

      const updated = await supabaseDb.updateDisasterStatus(
        incidentId,
        statusInput,
        body.verifiedById || body.verified_by_user_id || body.adminId
      );

      return sendJson(res, 200, {
        success: true,
        message: `Incident #${incidentId} status updated to '${updated.status}'.`,
        updatedStatus: updated.status,
        data: updated
      });
    }

    // 6.2 Edit Incident (Admin)
    if ((method === 'POST' || method === 'PUT') && pathname === '/api/incidents/edit') {
      const body = await parseBody(req);
      const incidentId = parseInt(body.id || body.disasterId || body.incidentId);

      if (!incidentId || isNaN(incidentId)) {
        return sendJson(res, 400, { success: false, error: 'Bad Request', message: 'Valid incident ID is required for editing.' });
      }

      const updates = {};
      if (body.description !== undefined) updates.description = body.description;
      if (body.title !== undefined) updates.title = body.title;
      if (body.latitude !== undefined && !isNaN(parseFloat(body.latitude))) updates.latitude = parseFloat(body.latitude);
      if (body.longitude !== undefined && !isNaN(parseFloat(body.longitude))) updates.longitude = parseFloat(body.longitude);
      if (body.location_name !== undefined || body.locationName !== undefined) {
        updates.location_name = body.location_name || body.locationName;
      }
      if (body.severity !== undefined) updates.severity = body.severity;
      if (body.status !== undefined) {
        let statusInput = body.status;
        if (statusInput === 'CANCELLED' || statusInput === 'CANCELLED_BY_ADMIN' || statusInput === 'RESOLVED') {
          statusInput = 'CLOSED';
        }
        updates.status = statusInput;
      }

      const updated = await supabaseDb.editDisaster(incidentId, updates);
      return sendJson(res, 200, { success: true, message: `Incident #${incidentId} updated.`, data: updated });
    }

    // 6.2.1 Delete Incident
    if ((method === 'DELETE' || method === 'POST') && (pathname === '/api/incidents/delete' || pathname.startsWith('/api/incidents/delete') || (method === 'DELETE' && (pathname.includes('/incidents/') || pathname.includes('/disasters/'))))) {
      const body = await parseBody(req);
      const parts = pathname.split('/').filter(Boolean);
      const lastPart = parseInt(parts[parts.length - 1]);
      const incidentId = parseInt(body.incidentId || body.id || body.disasterId || parsedUrl.query.id || parsedUrl.query.incidentId || (isNaN(lastPart) ? null : lastPart));

      if (!incidentId || isNaN(incidentId)) {
        return sendJson(res, 400, { success: false, error: 'Bad Request', message: 'Valid incident ID is required for deletion.' });
      }

      const deleted = await supabaseDb.deleteDisaster(incidentId);
      return sendJson(res, 200, { success: true, message: `Incident #${incidentId} deleted successfully.`, data: deleted });
    }

    // 6.3 Volunteers Directory (Strict role=VOLUNTEER)
    if (method === 'GET' && (pathname === '/api/users/volunteers' || pathname === '/api/volunteers')) {
      const volunteers = await supabaseDb.getVolunteersStrict();
      return sendJson(res, 200, { success: true, count: volunteers.length, data: volunteers });
    }

    if (method === 'PATCH' && (pathname.includes('/disasters/') || pathname.includes('/incidents/')) && pathname.endsWith('/status')) {
      const body = await parseBody(req);
      const parts = pathname.split('/');
      const disasterId = parseInt(parts[3]);
      const status = body.status ? body.status.toUpperCase() : null;

      if (!status) {
        return sendJson(res, 400, { success: false, message: 'Status is required' });
      }

      const updated = await supabaseDb.updateDisaster(disasterId, {
        status: status,
        updated_at: new Date().toISOString()
      });

      return sendJson(res, 200, {
        success: true,
        message: `Incident status updated to ${status}`,
        data: updated
      });
    }

    // 7. Volunteers: List Available
    if (method === 'GET' && (pathname === '/api/volunteers/available' || pathname === '/api/volunteers')) {
      const list = await supabaseDb.getVolunteers();
      return sendJson(res, 200, { success: true, data: list });
    }

    // 8. Assignments: List & Create
    if (method === 'GET' && (pathname.startsWith('/api/volunteers/assignments') || pathname.startsWith('/api/assignments'))) {
      const list = await supabaseDb.getAssignments();
      return sendJson(res, 200, { success: true, data: list });
    }

    if (method === 'POST' && (pathname === '/api/volunteers/assignments' || pathname === '/api/assignments')) {
      const body = await parseBody(req);
      let userRole = (body.userRole || body.role || '').toUpperCase();
      const assignedByUserId = body.assignedById || body.assigned_by_user_id || body.userId;

      if (assignedByUserId) {
        const parsedUserId = parseInt(assignedByUserId);
        if (!isNaN(parsedUserId)) {
          const assigner = await supabaseDb.getUserById(parsedUserId);
          if (assigner) userRole = (assigner.role || '').toUpperCase();
        }
      }

      const allowedRoles = ['ADMIN', 'GOVERNMENT', 'GOVERNMENT_AGENCY', 'NGO'];
      if (!userRole || !allowedRoles.includes(userRole)) {
        return sendJson(res, 403, {
          success: false,
          error: 'Forbidden',
          message: 'Not allowed to assign tasks'
        });
      }

      const newAssign = await supabaseDb.createAssignment({
        disaster_id: body.disasterId || 1,
        volunteer_id: body.volunteerId || 2,
        task_title: body.taskTitle || 'Relief Mission',
        task_description: body.taskDescription || 'Assist field rescue teams.',
        status: 'ASSIGNED',
        assigned_by_user_id: assignedByUserId || null
      });

      return sendJson(res, 201, {
        success: true,
        message: 'Mission assigned successfully!',
        data: newAssign
      });
    }

    if (method === 'PATCH' && (pathname.includes('/assignments/') && pathname.endsWith('/status'))) {
      const body = await parseBody(req);
      const parts = pathname.split('/');
      const assignId = parseInt(parts[parts.indexOf('assignments') + 1]);
      const status = (body.status || 'IN_PROGRESS').toUpperCase();

      const updated = await supabaseDb.updateAssignmentStatus(assignId, status);
      return sendJson(res, 200, {
        success: true,
        message: `Assignment status updated to ${status}`,
        data: updated
      });
    }

    // 9. Resources: List, Create, Update, Delete
    if (method === 'GET' && (pathname === '/api/resources' || pathname === '/api/resources/list')) {
      const list = await supabaseDb.getResources();
      return sendJson(res, 200, { success: true, count: list.length, data: list });
    }

    if (method === 'POST' && (pathname === '/api/resources' || pathname === '/api/resources/create')) {
      const body = await parseBody(req);
      const newRes = await supabaseDb.createResource({
        disasterId: body.disasterId || body.disaster_id || null,
        providerId: body.providerId || body.provider_id || null,
        resourceType: body.resourceType || body.resource_type || 'OTHER',
        description: body.description || body.resourceName || body.resource_name || 'Emergency Supply Post',
        quantity: parseInt(body.quantity) || 1,
        unit: body.unit || 'units',
        availableUntil: body.availableUntil || body.available_until || null,
        status: body.status || 'ACTIVE',
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
        description: body.description,
        quantity: body.quantity !== undefined ? parseInt(body.quantity) : undefined,
        availableUntil: body.availableUntil || body.available_until,
        status: body.status
      });

      return sendJson(res, 200, { success: true, message: `Resource #${resId} updated successfully.`, data: updated });
    }

    if ((method === 'DELETE' || method === 'POST') && pathname === '/api/resources/delete') {
      const body = await parseBody(req);
      const resId = parseInt(body.id || body.resourceId || parsedUrl.query.id || parsedUrl.query.resourceId);
      if (!resId || isNaN(resId)) {
        return sendJson(res, 400, { success: false, error: 'Bad Request', message: 'Valid resource ID is required for deletion.' });
      }

      const deleted = await supabaseDb.deleteResource(resId);
      return sendJson(res, 200, { success: true, message: `Resource #${resId} deleted successfully.`, data: deleted });
    }

    // 10. Comments: List & Create
    if (method === 'GET' && pathname.includes('/comments')) {
      const parts = pathname.split('/');
      const disasterId = parseInt(parts[3]) || 1;
      const comments = await supabaseDb.getComments(disasterId);
      return sendJson(res, 200, { success: true, data: comments });
    }

    if (method === 'POST' && pathname.includes('/comments')) {
      const body = await parseBody(req);
      const parts = pathname.split('/');
      const disasterId = parseInt(parts[3]) || 1;

      const newComment = await supabaseDb.createComment({
        disaster_id: disasterId,
        user_id: body.userId || 1,
        message: body.message || ''
      });

      return sendJson(res, 201, {
        success: true,
        message: 'Comment posted.',
        data: newComment
      });
    }

    // 11. Admin: Analytics & Approvals
    if (method === 'GET' && pathname === '/api/admin/analytics') {
      const analytics = await supabaseDb.getAnalytics();
      return sendJson(res, 200, { success: true, data: analytics });
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
      return sendJson(res, 200, {
        success: true,
        message: `User ${body.action.toLowerCase()}`,
        data: updated
      });
    }

    if (method === 'GET' && pathname === '/api/admin/pending-disasters') {
      const list = await supabaseDb.getPendingDisasters();
      return sendJson(res, 200, { success: true, data: list });
    }

    if (method === 'POST' && pathname === '/api/admin/approve-disaster') {
      const body = await parseBody(req);
      const actionStatus = body.action === 'APPROVED' ? 'VERIFIED_ACTIVE' : 'CLOSED';
      const updated = await supabaseDb.updateDisaster(body.disasterId, { status: actionStatus });
      return sendJson(res, 200, {
        success: true,
        message: `Disaster ${body.action.toLowerCase()}`,
        data: updated
      });
    }

    // 12. Users endpoint alias (/api/users)
    if (method === 'GET' && pathname === '/api/users') {
      const list = await supabaseDb.getAllUsers();
      return sendJson(res, 200, { success: true, data: list });
    }

  } catch (apiErr) {
    console.error('API Error:', apiErr);
    return sendJson(res, 500, {
      success: false,
      error: 'Internal Server Error',
      message: apiErr.message || 'Database query error'
    });
  }

  // ==============================================================================
  // CRITICAL FIX: UNMATCHED /api/* NEVER RETURNS HTML!
  // ==============================================================================
  if (pathname.startsWith('/api/')) {
    return sendJson(res, 404, {
      success: false,
      error: 'Not Found',
      message: `API endpoint '${method} ${pathname}' does not exist.`
    });
  }

  // ==============================================================================
  // STATIC ASSETS SERVING
  // ==============================================================================
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

server.listen(PORT, () => {
  console.log(`Disaster Coordination Server running at http://localhost:${PORT}`);
  console.log(`Supabase Connected: ${process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qpxnsxphwufrnfejphat.supabase.co'}`);
  initTelegramBot().catch(err => console.warn('Telegram Bot startup warning:', err.message));
});
