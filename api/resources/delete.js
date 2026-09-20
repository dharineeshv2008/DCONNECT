/**
 * Vercel Serverless Function: DELETE /api/resources/delete
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

  if (req.method !== 'DELETE' && req.method !== 'POST') {
    return sendJson(res, 405, {
      success: false,
      error: 'Method Not Allowed',
      message: `HTTP method ${req.method} is not allowed on /api/resources/delete. Use DELETE or POST.`
    });
  }

  try {
    let body = req.body || {};
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    if (!body || Object.keys(body).length === 0) {
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

    const urlObj = new URL(req.url || '/', 'http://localhost');
    const idParam = urlObj.searchParams.get('id') || urlObj.searchParams.get('resourceId');
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    const lastPart = parseInt(pathParts[pathParts.length - 1]);
    const id = parseInt(body.id || body.resourceId || idParam || (isNaN(lastPart) ? null : lastPart));

    if (!id || isNaN(id)) {
      return sendJson(res, 400, {
        success: false,
        error: 'Bad Request',
        message: 'Valid resource ID (id) is required for deletion.'
      });
    }

    const deleted = await supabaseDb.deleteResource(id);

    return sendJson(res, 200, {
      success: true,
      message: `Resource #${id} deleted successfully.`,
      data: deleted
    });

  } catch (err) {
    console.error('API /api/resources/delete error:', err);
    return sendJson(res, 500, {
      success: false,
      error: 'Internal Server Error',
      message: err.message || 'Failed to delete resource.'
    });
  }
};
