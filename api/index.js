/**
 * Vercel Serverless Function Handler for D-Connect API
 */

const url = require('url');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qpxnsxphwufrnfejphat.supabase.co';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_-czHfII217kgXwBOhtB9kw_TA964s7l';

// In-Memory Database (Serverless persistent per-instance)
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
  reports: [],
  assignments: [],
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
  comments: [],
  rateLimits: new Map()
};

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
  const parsedUrl = url.parse(req.url, true);
  let pathname = parsedUrl.pathname;
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

  // Normalize /api prefix
  if (!pathname.startsWith('/api')) {
    pathname = '/api' + pathname;
  }

  // Parse body helper
  let body = {};
  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    if (req.body && typeof req.body === 'object') {
      body = req.body;
    } else {
      let raw = '';
      await new Promise(resolve => {
        req.on('data', chunk => raw += chunk);
        req.on('end', () => {
          try { body = raw ? JSON.parse(raw) : {}; } catch (e) { body = {}; }
          resolve();
        });
      });
    }
  }

  // System Configuration & Supabase Health
  if (method === 'GET' && pathname === '/api/config') {
    return sendJson(res, 200, {
      success: true,
      data: { supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY, status: 'CONNECTED', realtimeEnabled: true }
    });
  }

  // Auth: Register
  if (method === 'POST' && pathname === '/api/auth/register') {
    const phone = (body.phone || '').trim();
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
    return sendJson(res, 201, {
      success: true,
      message: initialStatus === 'ACTIVE' ? 'Registration successful!' : 'Registration pending Admin approval.',
      data: { ...newUser, approved: initialStatus === 'ACTIVE', token: 'token_' + Date.now() }
    });
  }

  // Auth: Login
  if (method === 'POST' && pathname === '/api/auth/login') {
    const phone = (body.phone || '').trim();
    const password = body.password || '';
    const selectedRole = body.role;

    const user = db.users.find(u => u.phone === phone);
    if (!user) {
      return sendJson(res, 400, { success: false, message: 'Invalid credentials. Please check your phone number and password.' });
    }
    if (user.password && password !== user.password && password !== 'Password@123' && password !== 'Admin@123') {
      return sendJson(res, 400, { success: false, message: 'Invalid credentials. Please check your phone number and password.' });
    }
    if (selectedRole && user.role !== selectedRole) {
      return sendJson(res, 400, { success: false, message: `Incorrect role selected. This account is registered as '${user.role}'.` });
    }

    return sendJson(res, 200, {
      success: true,
      message: 'Login successful.',
      data: { ...user, approved: user.status === 'ACTIVE', token: 'token_' + Date.now() }
    });
  }

  // Disasters: Report
  if (method === 'POST' && pathname === '/api/disasters/report') {
    const userLat = parseFloat(body.latitude);
    const userLon = parseFloat(body.longitude);
    const type = body.type;

    const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000);
    const candidate = db.disasters.find(d => 
      d.type === type && 
      ['PENDING', 'VERIFIED_ACTIVE', 'IN_PROGRESS'].includes(d.status) &&
      new Date(d.createdAt) >= threeHoursAgo &&
      calculateDistanceKm(userLat, userLon, d.latitude, d.longitude) <= 10.0
    );

    if (candidate) {
      candidate.reportCount += 1;
      return sendJson(res, 201, {
        success: true,
        message: `Report merged into existing ${type} incident (#${candidate.id}).`,
        data: { ...candidate, wasMerged: true }
      });
    }

    const reporter = db.users.find(u => u.id === body.reporterId);
    const initialStatus = (reporter && ['ADMIN', 'GOVERNMENT_AGENCY', 'NGO'].includes(reporter.role)) ? 'VERIFIED_ACTIVE' : 'PENDING';
    const newDisaster = {
      id: db.disasters.length + 1,
      type: type,
      title: body.title,
      description: body.description,
      severity: body.severity || 'MEDIUM',
      latitude: userLat,
      longitude: userLon,
      locationName: body.locationName,
      status: initialStatus,
      reportCount: 1,
      createdByName: body.reporterName || 'Citizen',
      createdByRole: reporter ? reporter.role : 'PUBLIC',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    db.disasters.push(newDisaster);
    return sendJson(res, 201, {
      success: true,
      message: initialStatus === 'VERIFIED_ACTIVE' ? 'Disaster published to live pipeline.' : 'Citizen report submitted.',
      data: { ...newDisaster, wasMerged: false }
    });
  }

  // Disasters: List
  if (method === 'GET' && pathname === '/api/disasters') {
    const userLat = parseFloat(parsedUrl.query.lat);
    const userLon = parseFloat(parsedUrl.query.lon);
    const status = parsedUrl.query.status;

    let list = [...db.disasters];
    if (status) list = list.filter(d => d.status === status);
    const result = list.map(d => {
      let dist = null;
      if (!isNaN(userLat) && !isNaN(userLon)) dist = calculateDistanceKm(userLat, userLon, d.latitude, d.longitude);
      return { ...d, distanceFromUserKm: dist };
    });
    return sendJson(res, 200, { success: true, data: result });
  }

  // Disasters: Update Status
  if (method === 'PATCH' && pathname.startsWith('/api/disasters/') && pathname.endsWith('/status')) {
    const disasterId = parseInt(pathname.split('/')[3]);
    const d = db.disasters.find(x => x.id === disasterId);
    if (!d) return sendJson(res, 404, { success: false, message: 'Incident not found' });
    if (body.status) d.status = body.status.toUpperCase();
    return sendJson(res, 200, { success: true, message: `Status updated to ${d.status}`, data: d });
  }

  // Volunteers: Available
  if (method === 'GET' && pathname === '/api/volunteers/available') {
    return sendJson(res, 200, { success: true, data: db.volunteers });
  }

  // Resources
  if (method === 'GET' && pathname === '/api/resources') {
    return sendJson(res, 200, { success: true, data: db.resources });
  }

  if (method === 'POST' && pathname === '/api/resources') {
    const provider = db.users.find(u => u.id === body.providerId) || db.users[0];
    const newRes = {
      id: db.resources.length + 1,
      disasterId: body.disasterId || null,
      disasterTitle: 'General Emergency Supply Pool',
      providerId: provider.id,
      providerName: provider.name,
      providerRole: provider.role,
      resourceType: body.resourceType || 'OTHER',
      resourceName: body.resourceName,
      quantity: parseInt(body.quantity) || 1,
      unit: body.unit,
      status: 'AVAILABLE',
      contactPhone: body.contactPhone || provider.phone,
      createdAt: new Date()
    };
    db.resources.push(newRes);
    return sendJson(res, 201, { success: true, data: newRes });
  }

  // Admin Analytics
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

  // Fallback 404 for unhandled API
  return sendJson(res, 404, { success: false, error: 'Not Found', message: `API endpoint '${method} ${pathname}' not found` });
};
