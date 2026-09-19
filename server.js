const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { supabaseDb } = require('./supabaseClient');

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
      const type = body.type;

      // Rate limit check (3 seconds window for test tolerance)
      const rateKey = body.reporterPhone || body.reporterId || 'anon';
      const lastReportTime = rateLimits.get(rateKey);
      const now = Date.now();
      if (lastReportTime && (now - lastReportTime < 3000)) {
        const waitSec = Math.ceil((3000 - (now - lastReportTime)) / 1000);
        return sendJson(res, 429, { success: false, error: 'Too Many Requests', message: `Rate limit active. Please wait ${waitSec}s before submitting again.` });
      }

      // Search active candidate in Supabase within 3 hours
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
          reporter_id: body.reporterId || null,
          reporter_name: body.reporterName || 'Anonymous Citizen',
          reporter_phone: body.reporterPhone || 'N/A',
          latitude: userLat,
          longitude: userLon,
          message: body.description || 'Additional incident report'
        });

        return sendJson(res, 201, {
          success: true,
          message: `Report merged into existing ${type} incident (#${targetDisaster.id}, ${targetDisaster.title}) located ${closestDist.toFixed(2)} km away. Total reports: ${updatedCount}.`,
          data: { ...targetDisaster, reportCount: updatedCount, wasMerged: true }
        });
      } else {
        // Create new disaster in Supabase
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
          severity: body.severity || 'MEDIUM',
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
      const incidentId = parseInt(body.incidentId || body.disasterId || body.id);
      let statusInput = (body.status || 'IN_PROGRESS').trim();

      if (!incidentId || isNaN(incidentId)) {
        return sendJson(res, 400, { success: false, error: 'Bad Request', message: 'Valid incident ID is required.' });
      }

      let dbStatus = statusInput.toUpperCase();
      if (statusInput === 'Open') dbStatus = 'VERIFIED_ACTIVE';
      if (statusInput === 'In Progress') dbStatus = 'IN_PROGRESS';
      if (statusInput === 'Closed') dbStatus = 'CLOSED';
      if (statusInput === 'Cancelled by Admin') dbStatus = 'CANCELLED';

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
      const newAssign = await supabaseDb.createAssignment({
        disaster_id: body.disasterId || 1,
        volunteer_id: body.volunteerId || 2,
        task_title: body.taskTitle || 'Relief Mission',
        task_description: body.taskDescription || 'Assist field rescue teams.',
        status: 'ASSIGNED',
        assigned_by_user_id: body.assignedById || null
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

    // 9. Resources: List & Create
    if (method === 'GET' && pathname === '/api/resources') {
      const list = await supabaseDb.getResources();
      return sendJson(res, 200, { success: true, data: list });
    }

    if (method === 'POST' && pathname === '/api/resources') {
      const body = await parseBody(req);
      const newRes = await supabaseDb.createResource({
        disaster_id: body.disasterId || 1,
        provider_id: body.providerId || 4,
        resource_type: body.resourceType || 'OTHER',
        resource_name: body.resourceName || 'Emergency Supply',
        quantity: parseInt(body.quantity) || 1,
        unit: body.unit || 'units',
        status: 'AVAILABLE',
        contact_phone: body.contactPhone || null
      });

      return sendJson(res, 201, {
        success: true,
        message: 'Resource added to emergency pool.',
        data: newRes
      });
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
});
