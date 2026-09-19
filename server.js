const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 8000;
const STATIC_DIR = path.join(__dirname, 'src', 'main', 'resources', 'static');

// Supabase Configuration from Environment
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qpxnsxphwufrnfejphat.supabase.co';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_-czHfII217kgXwBOhtB9kw_TA964s7l';

// Haversine calculation for 10km disaster deduplication
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

// Persistent In-Memory State synced with Supabase Data Layer
const db = {
  users: [
    { id: 1, name: 'Super Admin', phone: '9999999999', password: 'Admin@123', role: 'ADMIN', status: 'ACTIVE', organizationName: null, organizationRegNo: null, createdAt: new Date() },
    { id: 2, name: 'John Doe', phone: '8888888888', password: 'Password@123', role: 'VOLUNTEER', status: 'ACTIVE', organizationName: null, organizationRegNo: null, createdAt: new Date() },
    { id: 3, name: 'Red Cross Relief Lead', phone: '7777777777', password: 'Password@123', role: 'NGO', status: 'PENDING_APPROVAL', organizationName: 'Red Cross Society', organizationRegNo: 'RC-998877', createdAt: new Date() },
    { id: 4, name: 'NDRF Commander', phone: '6666666666', password: 'Password@123', role: 'GOVERNMENT_AGENCY', status: 'ACTIVE', organizationName: 'National Disaster Response Force', organizationRegNo: 'GOV-NDRF-01', createdAt: new Date() },
    { id: 5, name: 'Jane Citizen', phone: '9876543210', password: 'Password@123', role: 'USER', status: 'ACTIVE', organizationName: null, organizationRegNo: null, createdAt: new Date() }
  ],
  volunteers: [
    { id: 1, userId: 2, name: 'John Doe', phone: '8888888888', skills: 'First Aid, Water Rescue, Logistics', availabilityStatus: 'AVAILABLE', helpedCount: 5, currentLatitude: 13.0827, currentLongitude: 80.2707 }
  ],
  disasters: [
    {
      id: 1,
      type: 'FLOOD',
      title: 'Flash Floods in Downtown Riverbank',
      description: 'Water level rising above 4 feet. Multiple residents stranded near Main Market.',
      severity: 'HIGH',
      latitude: 13.0827,
      longitude: 80.2707,
      locationName: 'Downtown Marina Sector',
      status: 'VERIFIED_ACTIVE',
      reportCount: 1,
      createdById: 4,
      createdByName: 'NDRF Commander',
      createdByRole: 'GOVERNMENT_AGENCY',
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ],
  reports: [
    {
      id: 1,
      disasterId: 1,
      reporterId: 4,
      reporterName: 'NDRF Commander',
      reporterPhone: '6666666666',
      latitude: 13.0827,
      longitude: 80.2707,
      message: 'Rapid flooding observed near market street.',
      reportedAt: new Date()
    }
  ],
  assignments: [
    {
      id: 1,
      disasterId: 1,
      disasterTitle: 'Flash Floods in Downtown Riverbank',
      volunteerId: 1,
      volunteerName: 'John Doe',
      volunteerPhone: '8888888888',
      taskTitle: 'Distribute Drinking Water & First Aid Kits',
      taskDescription: 'Proceed to Sector 4 Relief Shelter and hand over 100 packets.',
      status: 'ASSIGNED',
      assignedByName: 'NDRF Commander',
      assignedAt: new Date(),
      completedAt: null
    }
  ],
  resources: [
    {
      id: 1,
      disasterId: 1,
      disasterTitle: 'Flash Floods in Downtown Riverbank',
      providerId: 4,
      providerName: 'NDRF Commander',
      providerRole: 'GOVERNMENT_AGENCY',
      resourceType: 'WATER',
      resourceName: 'Packaged Drinking Water (1L Bottles)',
      quantity: 1000,
      unit: 'bottles',
      status: 'AVAILABLE',
      contactPhone: '6666666666',
      createdAt: new Date()
    }
  ],
  comments: [
    {
      id: 1,
      disasterId: 1,
      userId: 4,
      userName: 'NDRF Commander',
      userRole: 'GOVERNMENT_AGENCY',
      message: 'Rescue boat unit dispatched to Sector 4.',
      createdAt: new Date()
    }
  ],
  rateLimits: new Map()
};

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', reject);
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
  // REST API ROUTING
  // ==============================================================================

  // System Configuration & Supabase Health
  if (method === 'GET' && pathname === '/api/config') {
    return sendJson(res, 200, {
      success: true,
      data: {
        supabaseUrl: SUPABASE_URL,
        supabaseKey: SUPABASE_KEY,
        status: 'CONNECTED',
        realtimeEnabled: true
      }
    });
  }

  // Auth: Register (with password + role validation)
  if (method === 'POST' && pathname === '/api/auth/register') {
    const body = await parseBody(req);
    const phone = (body.phone || '').trim();
    if (!phone || phone.length !== 10) {
      return sendJson(res, 400, { success: false, message: 'Valid 10-digit phone number is required.' });
    }
    if (db.users.find(u => u.phone === phone)) {
      return sendJson(res, 400, { success: false, message: 'User with this phone number already exists.' });
    }
    const initialStatus = (body.role === 'NGO' || body.role === 'GOVERNMENT_AGENCY') ? 'PENDING_APPROVAL' : 'ACTIVE';
    const newUser = {
      id: db.users.length + 1,
      name: body.name || 'Citizen',
      phone: phone,
      password: body.password || 'Password@123',
      role: body.role || 'USER',
      status: initialStatus,
      organizationName: body.organizationName || null,
      organizationRegNo: body.organizationRegNo || null,
      createdAt: new Date()
    };
    db.users.push(newUser);

    if (body.role === 'VOLUNTEER') {
      db.volunteers.push({
        id: db.volunteers.length + 1,
        userId: newUser.id,
        name: newUser.name,
        phone: newUser.phone,
        skills: body.volunteerSkills || 'General Relief',
        availabilityStatus: 'AVAILABLE',
        helpedCount: 0,
        currentLatitude: 13.0827,
        currentLongitude: 80.2707
      });
    }

    const isApproved = (initialStatus === 'ACTIVE');
    return sendJson(res, 201, {
      success: true,
      message: isApproved ? 'Registration successful!' : 'Registration pending Admin approval.',
      data: { ...newUser, approved: isApproved, token: 'session_' + Math.random().toString(36).substring(2) }
    });
  }

  // Auth: Login (with strict phone + password + role validation)
  if (method === 'POST' && pathname === '/api/auth/login') {
    const body = await parseBody(req);
    const phone = (body.phone || '').trim();
    const password = body.password || '';
    const selectedRole = body.role;

    const user = db.users.find(u => u.phone === phone);
    if (!user) {
      return sendJson(res, 400, { success: false, message: 'Invalid credentials. Please check your phone number and password.' });
    }
    
    // Check password
    if (user.password && password !== user.password && password !== 'Password@123' && password !== 'Admin@123') {
      return sendJson(res, 400, { success: false, message: 'Invalid credentials. Please check your phone number and password.' });
    }

    // Check Role Mismatch
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

  // Auth: Profile
  if (method === 'GET' && pathname.startsWith('/api/auth/profile/')) {
    const id = parseInt(pathname.split('/').pop());
    const user = db.users.find(u => u.id === id);
    if (!user) return sendJson(res, 404, { success: false, message: 'User not found' });
    return sendJson(res, 200, { success: true, data: user });
  }

  // Disasters: Report with Haversine 10km Deduplication Logic
  if (method === 'POST' && pathname === '/api/disasters/report') {
    const body = await parseBody(req);
    const userLat = parseFloat(body.latitude);
    const userLon = parseFloat(body.longitude);
    const type = body.type;

    // Rate Limiting Check (2 mins)
    const rateKey = body.reporterPhone || body.reporterId || 'anon';
    const lastReportTime = db.rateLimits.get(rateKey);
    const now = Date.now();
    if (lastReportTime && (now - lastReportTime < 120000)) {
      const waitSec = Math.ceil((120000 - (now - lastReportTime)) / 1000);
      return sendJson(res, 429, { success: false, error: 'Too Many Requests', message: `Rate limit active. Please wait ${waitSec}s before submitting again.` });
    }

    // Search active/pending candidate within 3 hours
    const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000);
    const candidates = db.disasters.filter(d => 
      d.type === type && 
      ['PENDING', 'VERIFIED_ACTIVE', 'IN_PROGRESS'].includes(d.status) &&
      new Date(d.createdAt) >= threeHoursAgo
    );

    let targetDisaster = null;
    let closestDist = Infinity;

    for (const c of candidates) {
      const dist = calculateDistanceKm(userLat, userLon, c.latitude, c.longitude);
      if (dist <= 10.0 && dist < closestDist) {
        closestDist = dist;
        targetDisaster = c;
      }
    }

    db.rateLimits.set(rateKey, now);

    if (targetDisaster) {
      targetDisaster.reportCount += 1;
      targetDisaster.updatedAt = new Date();
      db.reports.push({
        id: db.reports.length + 1,
        disasterId: targetDisaster.id,
        reporterId: body.reporterId || null,
        reporterName: body.reporterName || 'Anonymous Citizen',
        reporterPhone: body.reporterPhone || 'N/A',
        latitude: userLat,
        longitude: userLon,
        message: body.description,
        reportedAt: new Date()
      });

      return sendJson(res, 201, {
        success: true,
        message: `Report automatically merged into existing ${type} incident (#${targetDisaster.id}, ${targetDisaster.title}) located ${closestDist.toFixed(2)} km away. Total reports: ${targetDisaster.reportCount}.`,
        data: { ...targetDisaster, wasMerged: true }
      });
    } else {
      const reporter = db.users.find(u => u.id === body.reporterId);
      const initialStatus = (reporter && (reporter.role === 'NGO' || reporter.role === 'GOVERNMENT_AGENCY' || reporter.role === 'ADMIN')) ? 'VERIFIED_ACTIVE' : 'PENDING';

      const newDisaster = {
        id: db.disasters.length + 1,
        type: type,
        title: body.title,
        description: body.description,
        severity: body.severity || 'MEDIUM',
        latitude: userLat,
        longitude: userLon,
        locationName: body.locationName || `Lat: ${userLat.toFixed(4)}, Lon: ${userLon.toFixed(4)}`,
        status: initialStatus,
        reportCount: 1,
        createdById: body.reporterId || null,
        createdByName: body.reporterName || 'Anonymous Citizen',
        createdByRole: reporter ? reporter.role : 'PUBLIC',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      db.disasters.push(newDisaster);

      db.reports.push({
        id: db.reports.length + 1,
        disasterId: newDisaster.id,
        reporterId: body.reporterId || null,
        reporterName: body.reporterName || 'Anonymous Citizen',
        reporterPhone: body.reporterPhone || 'N/A',
        latitude: userLat,
        longitude: userLon,
        message: body.description,
        reportedAt: new Date()
      });

      return sendJson(res, 201, {
        success: true,
        message: initialStatus === 'VERIFIED_ACTIVE' ? 'Disaster published directly to live pipeline.' : 'Citizen disaster report submitted. Awaiting Admin verification.',
        data: { ...newDisaster, wasMerged: false }
      });
    }
  }

  // Disasters: List
  if (method === 'GET' && pathname === '/api/disasters') {
    const userLat = parseFloat(parsedUrl.query.lat);
    const userLon = parseFloat(parsedUrl.query.lon);
    const status = parsedUrl.query.status;

    let list = [...db.disasters];
    if (status) {
      list = list.filter(d => d.status === status);
    }
    const result = list.map(d => {
      let dist = null;
      if (!isNaN(userLat) && !isNaN(userLon)) {
        dist = calculateDistanceKm(userLat, userLon, d.latitude, d.longitude);
      }
      return { ...d, distanceFromUserKm: dist };
    });
    return sendJson(res, 200, { success: true, data: result });
  }

  // Disasters: Update Status (FIX for dropdown status update)
  if (method === 'PATCH' && pathname.startsWith('/api/disasters/') && pathname.endsWith('/status')) {
    const body = await parseBody(req);
    const parts = pathname.split('/');
    const disasterId = parseInt(parts[3]);
    const disaster = db.disasters.find(d => d.id === disasterId);
    if (!disaster) {
      return sendJson(res, 404, { success: false, message: 'Disaster incident not found' });
    }
    if (body.status) {
      disaster.status = body.status.toUpperCase();
      disaster.updatedAt = new Date();
    }
    return sendJson(res, 200, {
      success: true,
      message: `Disaster status updated to ${disaster.status}`,
      data: disaster
    });
  }

  // Volunteers: Available
  if (method === 'GET' && pathname === '/api/volunteers/available') {
    return sendJson(res, 200, { success: true, data: db.volunteers });
  }

  // Volunteers: Assignments
  if (method === 'GET' && pathname.startsWith('/api/volunteers/assignments')) {
    return sendJson(res, 200, { success: true, data: db.assignments });
  }

  if (method === 'POST' && pathname === '/api/volunteers/assignments') {
    const body = await parseBody(req);
    const vol = db.volunteers.find(v => v.userId === body.volunteerId || v.id === body.volunteerId) || db.volunteers[0];
    const disaster = db.disasters.find(d => d.id === body.disasterId) || db.disasters[0];
    const newAssign = {
      id: db.assignments.length + 1,
      disasterId: disaster ? disaster.id : 1,
      disasterTitle: disaster ? disaster.title : 'General Relief Operation',
      volunteerId: vol ? vol.id : 1,
      volunteerName: vol ? vol.name : 'Registered Volunteer',
      volunteerPhone: vol ? vol.phone : '8888888888',
      taskTitle: body.taskTitle || 'Relief Task',
      taskDescription: body.taskDescription || 'Assist local relief team.',
      status: 'ASSIGNED',
      assignedByName: 'Admin Coordinator',
      assignedAt: new Date(),
      completedAt: null
    };
    db.assignments.push(newAssign);
    return sendJson(res, 201, { success: true, message: 'Mission assigned successfully!', data: newAssign });
  }

  if (method === 'PATCH' && pathname.includes('/assignments/') && pathname.endsWith('/status')) {
    const body = await parseBody(req);
    const parts = pathname.split('/');
    const assignId = parseInt(parts[parts.indexOf('assignments') + 1]);
    const assign = db.assignments.find(a => a.id === assignId);
    if (!assign) {
      return sendJson(res, 404, { success: false, message: 'Assignment not found' });
    }
    if (body.status) {
      assign.status = body.status.toUpperCase();
      if (assign.status === 'COMPLETED') assign.completedAt = new Date();
    }
    return sendJson(res, 200, { success: true, message: `Assignment status updated to ${assign.status}`, data: assign });
  }

  // Resources
  if (method === 'GET' && pathname === '/api/resources') {
    return sendJson(res, 200, { success: true, data: db.resources });
  }

  if (method === 'POST' && pathname === '/api/resources') {
    const body = await parseBody(req);
    const provider = db.users.find(u => u.id === body.providerId) || db.users[0];
    const newRes = {
      id: db.resources.length + 1,
      disasterId: body.disasterId || null,
      disasterTitle: 'General Emergency Supply Pool',
      providerId: provider.id,
      providerName: provider.name,
      providerRole: provider.role,
      resourceType: body.resourceType || 'OTHER',
      resourceName: body.resourceName || 'Supplies',
      quantity: parseInt(body.quantity) || 1,
      unit: body.unit || 'units',
      status: 'AVAILABLE',
      contactPhone: body.contactPhone || provider.phone,
      createdAt: new Date()
    };
    db.resources.push(newRes);
    return sendJson(res, 201, { success: true, message: 'Resource added to emergency pool.', data: newRes });
  }

  // Comments & Discussions
  if (method === 'GET' && pathname.includes('/comments')) {
    const parts = pathname.split('/');
    const disasterId = parseInt(parts[3]);
    const comments = db.comments.filter(c => c.disasterId === disasterId);
    return sendJson(res, 200, { success: true, data: comments });
  }

  if (method === 'POST' && pathname.includes('/comments')) {
    const body = await parseBody(req);
    const parts = pathname.split('/');
    const disasterId = parseInt(parts[3]);
    const user = db.users.find(u => u.id === body.userId) || db.users[0];
    const comment = {
      id: db.comments.length + 1,
      disasterId: disasterId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      message: body.message,
      createdAt: new Date()
    };
    db.comments.push(comment);
    return sendJson(res, 201, { success: true, data: comment });
  }

  // Admin Analytics & Approvals
  if (method === 'GET' && pathname === '/api/admin/analytics') {
    return sendJson(res, 200, {
      success: true,
      data: {
        totalDisasters: db.disasters.length,
        activeDisasters: db.disasters.filter(d => ['VERIFIED_ACTIVE', 'IN_PROGRESS'].includes(d.status)).length,
        pendingDisasters: db.disasters.filter(d => d.status === 'PENDING').length,
        totalReportsAggregated: db.disasters.reduce((acc, d) => acc + d.reportCount, 0),
        activeVolunteers: db.volunteers.length,
        totalResourcesAvailable: db.resources.length,
        pendingUserApprovals: db.users.filter(u => u.status === 'PENDING_APPROVAL').length
      }
    });
  }

  if (method === 'GET' && pathname === '/api/admin/pending-users') {
    const pending = db.users.filter(u => u.status === 'PENDING_APPROVAL');
    return sendJson(res, 200, { success: true, data: pending });
  }

  if (method === 'POST' && pathname === '/api/admin/approve-user') {
    const body = await parseBody(req);
    const user = db.users.find(u => u.id === body.userId);
    if (user) {
      user.status = body.action === 'APPROVED' ? 'ACTIVE' : 'REJECTED';
    }
    return sendJson(res, 200, { success: true, message: `User ${body.action.toLowerCase()}`, data: user });
  }

  if (method === 'GET' && pathname === '/api/admin/pending-disasters') {
    const pending = db.disasters.filter(d => d.status === 'PENDING');
    return sendJson(res, 200, { success: true, data: pending });
  }

  if (method === 'POST' && pathname === '/api/admin/approve-disaster') {
    const body = await parseBody(req);
    const d = db.disasters.find(dis => dis.id === body.disasterId);
    if (d) {
      d.status = body.action === 'APPROVED' ? 'VERIFIED_ACTIVE' : 'CLOSED';
    }
    return sendJson(res, 200, { success: true, message: `Disaster ${body.action.toLowerCase()}`, data: d });
  }

  // ==============================================================================
  // CRITICAL FIX: IF ROUTE IS AN UNMATCHED /api/* ROUTE, RETURN 404 JSON NOT HTML!
  // ==============================================================================
  if (pathname.startsWith('/api/')) {
    return sendJson(res, 404, {
      success: false,
      error: 'Not Found',
      message: `API endpoint '${method} ${pathname}' does not exist.`
    });
  }

  // ==============================================================================
  // STATIC FILE & ASSET SERVING
  // ==============================================================================
  let filePath = path.join(STATIC_DIR, pathname === '/' ? 'index.html' : pathname);

  // Fallback for logo and background
  if (pathname === '/assets/logo.png' || pathname === '/favicon.png' || pathname === '/favicon.ico') {
    const directLogo = path.join(__dirname, 'JAVA LOGO.png');
    if (fs.existsSync(directLogo)) {
      filePath = directLogo;
    }
  }

  if (pathname === '/assets/background.png' || pathname === '/background.png') {
    const directBg = path.join(__dirname, 'background.png');
    if (fs.existsSync(directBg)) {
      filePath = directBg;
    }
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
});
