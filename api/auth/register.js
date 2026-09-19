/**
 * Vercel Serverless Function: POST /api/auth/register
 */

const { supabaseDb } = require('../../supabaseClient');

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
  if (req.method === 'OPTIONS') {
    return sendJson(res, 204, {});
  }

  // Task 1 & 9: Method Validation - Return 405 JSON for non-POST
  if (req.method !== 'POST') {
    return sendJson(res, 405, {
      success: false,
      error: 'Method Not Allowed',
      message: `HTTP method ${req.method} is not allowed on /api/auth/register. Use POST.`
    });
  }

  try {
    let body = req.body || {};
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }

    const phone = (body.phone || '').trim();
    const name = (body.name || '').trim();
    const password = body.password || 'Password@123';
    const role = body.role || 'USER';

    if (!phone || phone.length !== 10) {
      return sendJson(res, 400, {
        success: false,
        error: 'Bad Request',
        message: 'Valid 10-digit phone number is required.'
      });
    }

    if (!name) {
      return sendJson(res, 400, {
        success: false,
        error: 'Bad Request',
        message: 'Name is required.'
      });
    }

    // Check if user exists in Supabase
    const existing = await supabaseDb.getUserByPhone(phone);
    if (existing) {
      return sendJson(res, 400, {
        success: false,
        error: 'Conflict',
        message: 'User with this phone number already exists.'
      });
    }

    const initialStatus = (role === 'NGO' || role === 'GOVERNMENT_AGENCY') ? 'PENDING_APPROVAL' : 'ACTIVE';
    const newUser = await supabaseDb.createUser({
      name: name,
      phone: phone,
      password: password,
      role: role,
      status: initialStatus,
      organizationName: body.organizationName || null,
      organizationRegNo: body.organizationRegNo || null,
      skills: body.skills || body.volunteerSkills || null
    });

    const isApproved = (initialStatus === 'ACTIVE');
    return sendJson(res, 201, {
      success: true,
      message: isApproved ? 'Registration successful!' : 'Registration pending Admin approval.',
      data: {
        id: newUser.id,
        name: newUser.name,
        phone: newUser.phone,
        role: newUser.role,
        status: newUser.status,
        organizationName: newUser.organization_name,
        approved: isApproved,
        token: 'token_' + Math.random().toString(36).substring(2)
      }
    });

  } catch (err) {
    console.error('Registration API Error:', err);
    return sendJson(res, 500, {
      success: false,
      error: 'Internal Server Error',
      message: err.message || 'Failed to complete registration in Supabase.'
    });
  }
};
