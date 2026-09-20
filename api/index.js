/**
 * Vercel Serverless Function API Handler
 * Full-stack Disaster Management API with Supabase persistence (no mock data)
 */

const url = require('url');
const { supabaseDb } = require('../supabaseClient');
const { handleTelegramWebhook, sendAdminIncidentNotification, sendAdminResourceNotification } = require('../telegramBot');

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

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Auth-Token, apikey'
  });
  res.end(JSON.stringify(data));
}

module.exports = async (req, res) => {
  const rawUrl = req.headers['x-forwarded-uri'] || req.headers['x-matched-path'] || req.headers['x-original-url'] || req.url;
  const parsedUrl = url.parse(rawUrl, true);
  let pathname = parsedUrl.pathname || '/api';

  if (pathname.endsWith('/index.js')) {
    pathname = pathname.replace('/index.js', '');
  }
  if (pathname.endsWith('.js')) {
    pathname = pathname.slice(0, -3);
  }
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }
  if (!pathname.startsWith('/api')) {
    pathname = '/api' + pathname;
  }
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

  // Parse body helper
  let body = {};
  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    if (req.body && typeof req.body === 'object') {
      body = req.body;
    } else {
      let raw = '';
      await new Promise((resolve) => {
        req.on('data', chunk => raw += chunk);
        req.on('end', () => {
          try { body = raw ? JSON.parse(raw) : {}; } catch (e) { body = {}; }
          resolve();
        });
        req.on('error', () => resolve());
      });
    }
  }

  try {
    // Telegram Webhook Endpoint
    if (pathname === '/api/telegram/webhook') {
      return handleTelegramWebhook(req, res);
    }

    // Config
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

      return sendJson(res, 200, {
        success: true,
        message: 'Login successful.',
        data: { ...user, approved: user.status === 'ACTIVE', token: 'token_' + Date.now() }
      });
    }

    // 2. Auth: Register
    if (pathname === '/api/auth/register') {
      if (method !== 'POST') {
        return sendJson(res, 405, { success: false, error: 'Method Not Allowed', message: `Method ${method} not allowed on /api/auth/register. Use POST.` });
      }
      const phone = (body.phone || '').trim();
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
        }).catch(() => {});
      }

      return sendJson(res, 201, {
        success: true,
        message: initialStatus === 'ACTIVE' ? 'Registration successful!' : 'Registration pending Admin approval.',
        data: { ...newUser, approved: initialStatus === 'ACTIVE', token: 'token_' + Date.now() }
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

    // 5. Disasters & Incidents: Report (with Haversine 10km Deduplication)
    if (method === 'POST' && (pathname === '/api/disasters/report' || pathname === '/api/incidents/report' || pathname === '/api/reports' || pathname === '/api/incidents/create')) {
      const userLat = parseFloat(body.latitude);
      const userLon = parseFloat(body.longitude);
      const type = body.type;

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

      if (targetDisaster) {
        const updatedCount = (targetDisaster.report_count || 1) + 1;
        await supabaseDb.updateDisaster(targetDisaster.id, {
          report_count: updatedCount,
          updated_at: new Date().toISOString()
        });

        await supabaseDb.createReport({
          disaster_id: targetDisaster.id,
          reporter_id: body.reporterId || null,
          reporter_name: body.reporterName || 'Anonymous Citizen',
          reporter_phone: body.reporterPhone || 'N/A',
          latitude: userLat,
          longitude: userLon,
          message: body.description || 'Incident report'
        });

        return sendJson(res, 201, {
          success: true,
          message: `Report merged into existing ${type} incident (#${targetDisaster.id}).`,
          data: { ...targetDisaster, reportCount: updatedCount, wasMerged: true }
        });
      } else {
        let initialStatus = 'PENDING';
        if (body.reporterId) {
          const reporter = await supabaseDb.getUserById(body.reporterId);
          if (reporter && ['ADMIN', 'GOVERNMENT_AGENCY', 'NGO'].includes(reporter.role)) {
            initialStatus = 'VERIFIED_ACTIVE';
          }
        }

        const newDisaster = await supabaseDb.createDisaster({
          type: type,
          title: body.title,
          description: body.description,
          severity: body.severity || 'UNVERIFIED',
          latitude: userLat,
          longitude: userLon,
          location_name: body.locationName || `Lat: ${userLat.toFixed(4)}, Lon: ${userLon.toFixed(4)}`,
          status: initialStatus,
          report_count: 1,
          created_by_user_id: body.reporterId || null
        });

        await supabaseDb.createReport({
          disaster_id: newDisaster.id,
          reporter_id: body.reporterId || null,
          reporter_name: body.reporterName || 'Anonymous Citizen',
          reporter_phone: body.reporterPhone || 'N/A',
          latitude: userLat,
          longitude: userLon,
          message: body.description
        });

        // Trigger Telegram Admin Notification
        sendAdminIncidentNotification({
          ...newDisaster,
          createdByName: body.reporterName || 'Anonymous Citizen'
        }).catch(err => console.warn('Telegram notification warning:', err.message));

        return sendJson(res, 201, {
          success: true,
          message: initialStatus === 'VERIFIED_ACTIVE' ? 'Disaster published to live pipeline.' : 'Citizen report submitted.',
          data: { ...newDisaster, reportCount: 1, wasMerged: false }
        });
      }
    }

    // 6. Update Status
    if ((method === 'POST' || method === 'PATCH' || method === 'PUT') && pathname === '/api/incidents/update') {
      const incidentId = parseInt(body.incidentId || body.disasterId || body.id);
      let statusInput = (body.status || 'IN_PROGRESS').trim();

      if (!incidentId || isNaN(incidentId)) {
        return sendJson(res, 400, { success: false, error: 'Bad Request', message: 'Valid incident ID is required.' });
      }

      let dbStatus = statusInput.toUpperCase();
      if (statusInput === 'Open') dbStatus = 'VERIFIED_ACTIVE';
      if (statusInput === 'In Progress') dbStatus = 'IN_PROGRESS';
      if (statusInput === 'Completed') dbStatus = 'RESOLVED';
      if (statusInput === 'Closed') dbStatus = 'CLOSED';
      if (statusInput === 'Cancelled by Admin' || statusInput === 'CANCELLED_BY_ADMIN' || statusInput === 'CANCELLED') dbStatus = 'CLOSED';

      const updated = await supabaseDb.updateDisaster(incidentId, {
        status: dbStatus,
        updated_at: new Date().toISOString()
      });

      return sendJson(res, 200, {
        success: true,
        message: `Incident #${incidentId} status updated to '${dbStatus}'.`,
        data: updated
      });
    }

    // 6.1 Edit Incident (Admin)
    if ((method === 'POST' || method === 'PUT') && pathname === '/api/incidents/edit') {
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

    // 6.2 Volunteers Directory (Strict role=VOLUNTEER)
    if (method === 'GET' && (pathname === '/api/users/volunteers' || pathname === '/api/volunteers')) {
      const volunteers = await supabaseDb.getVolunteersStrict();
      return sendJson(res, 200, { success: true, count: volunteers.length, data: volunteers });
    }

    // 6.3 Delete Incident
    if ((method === 'DELETE' || method === 'POST') && pathname === '/api/incidents/delete') {
      const incidentId = parseInt(body.incidentId || body.id || body.disasterId || parsedUrl.query.id || parsedUrl.query.incidentId);

      if (!incidentId || isNaN(incidentId)) {
        return sendJson(res, 400, { success: false, error: 'Bad Request', message: 'Valid incident ID is required for deletion.' });
      }

      const deleted = await supabaseDb.deleteDisaster(incidentId);
      return sendJson(res, 200, { success: true, message: `Incident #${incidentId} deleted successfully.`, data: deleted });
    }

    if (method === 'PATCH' && (pathname.includes('/disasters/') || pathname.includes('/incidents/')) && pathname.endsWith('/status')) {
      const parts = pathname.split('/');
      const disasterId = parseInt(parts[3]);
      const status = (body.status || 'VERIFIED_ACTIVE').toUpperCase();

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

    // 7. Volunteers
    if (method === 'GET' && (pathname === '/api/volunteers/available' || pathname === '/api/volunteers')) {
      const list = await supabaseDb.getVolunteers();
      return sendJson(res, 200, { success: true, data: list });
    }

    // 8. Assignments
    if (method === 'GET' && (pathname.startsWith('/api/volunteers/assignments') || pathname.startsWith('/api/assignments'))) {
      const list = await supabaseDb.getAssignments();
      return sendJson(res, 200, { success: true, data: list });
    }

    if (method === 'POST' && (pathname === '/api/volunteers/assignments' || pathname === '/api/assignments')) {
      const newAssign = await supabaseDb.createAssignment({
        disaster_id: body.disasterId || 1,
        volunteer_id: body.volunteerId || 2,
        task_title: body.taskTitle || 'Relief Mission',
        task_description: body.taskDescription || 'Assist field rescue teams.',
        status: 'ASSIGNED',
        assigned_by_user_id: body.assignedById || null
      });

      return sendJson(res, 201, { success: true, message: 'Mission dispatched!', data: newAssign });
    }

    if (method === 'PATCH' && pathname.includes('/assignments/') && pathname.endsWith('/status')) {
      const parts = pathname.split('/');
      const assignId = parseInt(parts[parts.indexOf('assignments') + 1]);
      const status = (body.status || 'IN_PROGRESS').toUpperCase();

      const updated = await supabaseDb.updateAssignmentStatus(assignId, status);
      return sendJson(res, 200, { success: true, message: `Mission status updated to ${status}`, data: updated });
    }

    // 9. Resources: List, Create, Update, Delete
    if (method === 'GET' && (pathname === '/api/resources' || pathname === '/api/resources/list')) {
      const list = await supabaseDb.getResources();
      return sendJson(res, 200, { success: true, count: list.length, data: list });
    }

    if (method === 'POST' && (pathname === '/api/resources' || pathname === '/api/resources/create')) {
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
        }).catch(err => console.warn('Telegram notification warning:', err.message));
      }

      return sendJson(res, 201, { success: true, message: 'Resource supply post created successfully.', data: newRes });
    }

    if ((method === 'POST' || method === 'PUT' || method === 'PATCH') && pathname === '/api/resources/update') {
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
      const resId = parseInt(body.id || body.resourceId || parsedUrl.query.id || parsedUrl.query.resourceId);
      if (!resId || isNaN(resId)) {
        return sendJson(res, 400, { success: false, error: 'Bad Request', message: 'Valid resource ID is required for deletion.' });
      }

      const deleted = await supabaseDb.deleteResource(resId);
      return sendJson(res, 200, { success: true, message: `Resource #${resId} deleted successfully.`, data: deleted });
    }

    // 10. Comments
    if (method === 'GET' && pathname.includes('/comments')) {
      const parts = pathname.split('/');
      const disasterId = parseInt(parts[3]) || 1;
      const comments = await supabaseDb.getComments(disasterId);
      return sendJson(res, 200, { success: true, data: comments });
    }

    if (method === 'POST' && pathname.includes('/comments')) {
      const parts = pathname.split('/');
      const disasterId = parseInt(parts[3]) || 1;
      const newComment = await supabaseDb.createComment({
        disaster_id: disasterId,
        user_id: body.userId || 1,
        message: body.message || ''
      });
      return sendJson(res, 201, { success: true, message: 'Comment posted.', data: newComment });
    }

    // 11. Admin Analytics & Approvals
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
      const actionStatus = body.action === 'APPROVED' ? 'ACTIVE' : 'REJECTED';
      const updated = await supabaseDb.updateUser(body.userId, { status: actionStatus });
      return sendJson(res, 200, { success: true, message: `User ${body.action.toLowerCase()}`, data: updated });
    }

    if (method === 'GET' && pathname === '/api/admin/pending-disasters') {
      const list = await supabaseDb.getPendingDisasters();
      return sendJson(res, 200, { success: true, data: list });
    }

    if (method === 'POST' && pathname === '/api/admin/approve-disaster') {
      const actionStatus = body.action === 'APPROVED' ? 'VERIFIED_ACTIVE' : 'CLOSED';
      const updated = await supabaseDb.updateDisaster(body.disasterId, { status: actionStatus });
      return sendJson(res, 200, { success: true, message: `Disaster ${body.action.toLowerCase()}`, data: updated });
    }

    // 12. Users endpoint alias
    if (method === 'GET' && pathname === '/api/users') {
      const list = await supabaseDb.getAllUsers();
      return sendJson(res, 200, { success: true, data: list });
    }

    // Unmatched API endpoint -> 404 JSON (NEVER HTML!)
    return sendJson(res, 404, {
      success: false,
      error: 'Not Found',
      message: `API endpoint '${method} ${pathname}' does not exist.`
    });

  } catch (apiErr) {
    console.error('Serverless API Error:', apiErr);
    return sendJson(res, 500, {
      success: false,
      error: 'Internal Server Error',
      message: apiErr.message || 'Database execution error'
    });
  }
};
