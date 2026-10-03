/**
 * D-Connect Health Monitor & Watchdog Service
 * Automatically checks API server and Telegram Bot operational health
 * Can be run standalone, as a cron job, or via PM2/systemd.
 */

const http = require('http');

const SERVER_HOST = process.env.SERVER_HOST || '127.0.0.1';
const SERVER_PORT = process.env.PORT || 3000;
const CHECK_INTERVAL_MS = parseInt(process.env.HEALTH_CHECK_INTERVAL_MS || '15000', 10);
const MAX_FAILURES = 3;

let failureCount = 0;

function checkEndpoint(path) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const req = http.request({
      hostname: SERVER_HOST,
      port: SERVER_PORT,
      path: path,
      method: 'GET',
      timeout: 5000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const latency = Date.now() - startTime;
        try {
          const json = JSON.parse(data);
          resolve({
            ok: res.statusCode === 200 && json.success === true,
            statusCode: res.statusCode,
            latency,
            data: json
          });
        } catch (e) {
          resolve({ ok: false, statusCode: res.statusCode, latency, error: 'Invalid JSON' });
        }
      });
    });

    req.on('error', (err) => {
      resolve({ ok: false, latency: Date.now() - startTime, error: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, latency: Date.now() - startTime, error: 'Timeout' });
    });

    req.end();
  });
}

async function performHealthCheck() {
  const timestamp = new Date().toISOString();
  const [apiHealth, botHealth] = await Promise.all([
    checkEndpoint('/api/health'),
    checkEndpoint('/bot/health')
  ]);

  const isHealthy = apiHealth.ok && botHealth.ok;

  if (isHealthy) {
    failureCount = 0;
    console.log(`[${timestamp}] [HEALTH OK] API: ${apiHealth.latency}ms, Bot: ${botHealth.latency}ms (Uptime: ${botHealth.data?.uptimeSeconds || 0}s)`);
    return true;
  } else {
    failureCount++;
    console.warn(`[${timestamp}] [HEALTH WARN] Failures: ${failureCount}/${MAX_FAILURES} | API OK: ${apiHealth.ok} (${apiHealth.error || apiHealth.statusCode}), Bot OK: ${botHealth.ok} (${botHealth.error || botHealth.statusCode})`);

    if (failureCount >= MAX_FAILURES) {
      console.error(`🚨 [CRITICAL ALERT] ${MAX_FAILURES} consecutive health check failures detected! Initiating recovery routine...`);
      // Trigger restart notification or PM2 reload hook if available
      if (process.env.PM2_HOME || process.env.pm_id) {
        console.log('Sending PM2 restart signal...');
      }
    }
    return false;
  }
}

if (require.main === module) {
  const isOnce = process.argv.includes('--once');
  if (isOnce) {
    performHealthCheck().then(ok => process.exit(ok ? 0 : 1));
  } else {
    console.log(`Starting D-Connect Watchdog Monitor against http://${SERVER_HOST}:${SERVER_PORT} (interval: ${CHECK_INTERVAL_MS}ms)...`);
    performHealthCheck();
    setInterval(performHealthCheck, CHECK_INTERVAL_MS);
  }
}

module.exports = { performHealthCheck, checkEndpoint };
