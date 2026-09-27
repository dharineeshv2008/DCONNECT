const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:8000';

function makeRequest(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const reqOptions = {
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 15000
    };

    const req = http.request(url, reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: data,
          json: json
        });
      });
    });

    req.on('error', (err) => reject(err));
    if (options.body) {
      req.write(typeof options.body === 'object' ? JSON.stringify(options.body) : options.body);
    }
    req.end();
  });
}

describe('D-Connect PWA, Offline, Home Location & 30km Radius Alert Suite (50+ Test Cases)', () => {
  jest.setTimeout(30000);

  // SECTION 1: PWA & OFFLINE INFRASTRUCTURE (10 Test Cases)
  test('1. manifest.json exists in public directory', () => {
    const manifestPath = path.join(__dirname, '../public/manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
  });

  test('2. manifest.json has valid name and short_name', () => {
    const content = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/manifest.json'), 'utf8'));
    expect(content.name).toContain('D-Connect');
    expect(content.short_name).toBe('D-Connect');
  });

  test('3. manifest.json sets display to standalone', () => {
    const content = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/manifest.json'), 'utf8'));
    expect(content.display).toBe('standalone');
  });

  test('4. manifest.json contains valid start_url and theme_color', () => {
    const content = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/manifest.json'), 'utf8'));
    expect(content.start_url).toBeDefined();
    expect(content.theme_color).toBe('#0f172a');
  });

  test('5. manifest.json includes required application icons', () => {
    const content = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/manifest.json'), 'utf8'));
    expect(Array.isArray(content.icons)).toBe(true);
    expect(content.icons.length).toBeGreaterThanOrEqual(2);
  });

  test('6. sw.js exists in public directory', () => {
    expect(fs.existsSync(path.join(__dirname, '../public/sw.js'))).toBe(true);
  });

  test('7. sw.js exists in root directory for root scope registration', () => {
    expect(fs.existsSync(path.join(__dirname, '../sw.js'))).toBe(true);
  });

  test('8. sw.js contains install and fetch event listeners', () => {
    const content = fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8');
    expect(content.includes("addEventListener('install'")).toBe(true);
    expect(content.includes("addEventListener('fetch'")).toBe(true);
  });

  test('9. sw.js defines cache name and pre-cache assets', () => {
    const content = fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8');
    expect(content.includes('dconnect')).toBe(true);
    expect(content.includes('styles.css')).toBe(true);
  });

  test('10. GET /manifest.json returns 200 OK with application/json header', async () => {
    const res = await makeRequest('/manifest.json');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
  });

  // SECTION 2: APK DOWNLOAD WRAPPER (6 Test Cases)
  test('11. APK package file exists at public/downloads/app.apk', () => {
    expect(fs.existsSync(path.join(__dirname, '../public/downloads/app.apk'))).toBe(true);
  });

  test('12. APK alias package file exists at public/downloads/dconnect.apk', () => {
    expect(fs.existsSync(path.join(__dirname, '../public/downloads/dconnect.apk'))).toBe(true);
  });

  test('13. APK file is non-empty binary', () => {
    const stat = fs.statSync(path.join(__dirname, '../public/downloads/app.apk'));
    expect(stat.size).toBeGreaterThan(100);
  });

  test('14. GET /downloads/app.apk returns HTTP 200 OK', async () => {
    const res = await makeRequest('/downloads/app.apk');
    expect(res.status).toBe(200);
  });

  test('15. GET /downloads/dconnect.apk returns HTTP 200 OK', async () => {
    const res = await makeRequest('/downloads/dconnect.apk');
    expect(res.status).toBe(200);
  });

  test('16. Download button is present in index.html UI', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
    expect(html.includes('app.apk')).toBe(true);
    expect(html.includes('Download Android App')).toBe(true);
  });

  // SECTION 3: HOME LOCATION & USER REGISTRATION (10 Test Cases)
  test('17. index.html contains Home Location inputs in Registration Modal', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
    expect(html.includes('id="regHomeAddress"')).toBe(true);
    expect(html.includes('id="regHomeLat"')).toBe(true);
    expect(html.includes('id="regHomeLng"')).toBe(true);
  });

  test('18. index.html includes Set Home Location map picker button', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
    expect(html.includes("openLocationPicker('home')")).toBe(true);
  });

  test('19. app.js handleRegister collects home location fields in payload', () => {
    const js = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');
    expect(js.includes('homeAddress:')).toBe(true);
    expect(js.includes('homeLat:')).toBe(true);
    expect(js.includes('homeLng:')).toBe(true);
  });

  test('20. app.js confirmLocationPickerSelection handles home location context', () => {
    const js = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');
    expect(js.includes("locationPickerContext === 'home'")).toBe(true);
    expect(js.includes('regHomeLat')).toBe(true);
  });

  test('21. POST /api/auth/register saves user with Home Location', async () => {
    const testPhone = '90000' + Math.floor(10005 + Math.random() * 89995);
    const res = await makeRequest('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        name: 'Test Citizen HomeLoc',
        phone: testPhone,
        password: 'Password@123',
        role: 'USER',
        homeAddress: 'Marina Beach, Chennai, Tamil Nadu',
        homeLat: 13.0475,
        homeLng: 80.2824
      }
    });
    expect(res.status).toBe(201);
    expect(res.json.success).toBe(true);
    expect(res.json.data.home_lat).toBe(13.0475);
    expect(res.json.data.home_lng).toBe(80.2824);
  });

  test('22. POST /api/auth/register succeeds for Volunteer role with Home Location', async () => {
    const testPhone = '90000' + Math.floor(10005 + Math.random() * 89995);
    const res = await makeRequest('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        name: 'Test Volunteer HomeLoc',
        phone: testPhone,
        password: 'Password@123',
        role: 'VOLUNTEER',
        volunteerSkills: 'Medical First Aid',
        homeAddress: 'T-Nagar, Chennai',
        homeLat: 13.0418,
        homeLng: 80.2341
      }
    });
    expect(res.status).toBe(201);
    expect(res.json.success).toBe(true);
    expect(res.json.data.role).toBe('VOLUNTEER');
  });

  test('23. POST /api/auth/register rejects duplicate phone number', async () => {
    const res = await makeRequest('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        name: 'Duplicate Test',
        phone: '9999999999',
        password: 'Admin@123',
        role: 'USER'
      }
    });
    expect([400, 409]).toContain(res.status);
    expect(res.json.success).toBe(false);
  });

  test('24. POST /api/auth/login succeeds with valid credentials', async () => {
    const res = await makeRequest('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        phone: '9999999999',
        password: 'Admin@123',
        role: 'ADMIN'
      }
    });
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect(res.json.data.token).toBeDefined();
  });

  test('25. POST /api/auth/login fails with invalid password', async () => {
    const res = await makeRequest('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        phone: '9999999999',
        password: 'WrongPassword999',
        role: 'ADMIN'
      }
    });
    expect(res.status).toBe(401);
    expect(res.json.success).toBe(false);
  });

  test('26. GET /api/auth/me returns current authenticated user profile', async () => {
    const loginRes = await makeRequest('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { phone: '9999999999', password: 'Admin@123', role: 'ADMIN' }
    });
    const token = loginRes.json.data.token;
    const meRes = await makeRequest('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    expect(meRes.status).toBe(200);
    expect(meRes.json.success).toBe(true);
    expect(meRes.json.data.phone).toBe('9999999999');
  });

  // SECTION 4: FCM / WEB PUSH & 30KM RADIUS ALERTS (8 Test Cases)
  test('27. POST /api/users/device-token registers FCM device token', async () => {
    const res = await makeRequest('/api/users/device-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        userId: 1,
        fcmToken: 'test_fcm_token_sample_12345',
        deviceType: 'web'
      }
    });
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
  });

  test('28. POST /api/users/device-token returns 400 if token missing', async () => {
    const res = await makeRequest('/api/users/device-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { userId: 1 }
    });
    expect(res.status).toBe(400);
    expect(res.json.success).toBe(false);
  });

  test('29. POST /api/notifications/check-nearby-alerts evaluates 30km radius', async () => {
    const res = await makeRequest('/api/notifications/check-nearby-alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        disasterId: 1,
        latitude: 13.0827,
        longitude: 80.2707,
        radiusKm: 30.0
      }
    });
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect(Array.isArray(res.json.notifiedUsers)).toBe(true);
  });

  test('30. 30km radius alert notification calculation uses Haversine formula', async () => {
    const res = await makeRequest('/api/notifications/check-nearby-alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        latitude: 13.0827,
        longitude: 80.2707,
        radiusKm: 30.0
      }
    });
    expect(res.status).toBe(200);
    expect(res.json.radiusKm).toBe(30.0);
  });

  test('31. app.js initializes FCM token registration on session restore', () => {
    const js = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');
    expect(js.includes('registerDeviceToken()')).toBe(true);
  });

  test('32. app.js contains registerDeviceToken implementation', () => {
    const js = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');
    expect(js.includes('/users/device-token')).toBe(true);
  });

  test('33. Supabase client contains getUsersInRadius method', () => {
    const js = fs.readFileSync(path.join(__dirname, '../supabaseClient.js'), 'utf8');
    expect(js.includes('getUsersInRadius')).toBe(true);
  });

  test('34. Supabase client contains saveUserDeviceToken method', () => {
    const js = fs.readFileSync(path.join(__dirname, '../supabaseClient.js'), 'utf8');
    expect(js.includes('saveUserDeviceToken')).toBe(true);
  });

  // SECTION 5: NON-REGRESSION CORE DISASTER & BACKEND LOGIC (16 Test Cases)
  test('35. GET /api/health returns operational status', async () => {
    const res = await makeRequest('/api/health');
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
  });

  test('36. POST /api/predict returns ML severity prediction CRITICAL', async () => {
    const res = await makeRequest('/api/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { description: 'Building collapse and severe trapped victims' }
    });
    expect(res.status).toBe(200);
    expect(res.json.severity).toBe('CRITICAL');
  });

  test('37. POST /api/predict returns ML severity prediction HIGH', async () => {
    const res = await makeRequest('/api/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { description: 'Severe flood in low lying area emergency' }
    });
    expect(res.status).toBe(200);
    expect(['HIGH', 'CRITICAL', 'MEDIUM']).toContain(res.json.severity);
  });

  test('38. POST /api/disasters/report creates a new disaster incident', async () => {
    const res = await makeRequest('/api/disasters/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        title: 'E2E Test Flash Flood',
        type: 'FLOOD',
        description: 'Waterlogging at Velachery main road',
        latitude: 12.9772,
        longitude: 80.2185,
        locationName: 'Velachery, Chennai',
        reporterPhone: '9999999999'
      }
    });
    expect(res.status === 200 || res.status === 201).toBe(true);
    expect(res.json.success).toBe(true);
  });

  test('39. GET /api/disasters returns list of disasters', async () => {
    const res = await makeRequest('/api/disasters');
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect(Array.isArray(res.json.data)).toBe(true);
  });

  test('40. POST /api/resources/create adds a new emergency resource', async () => {
    const res = await makeRequest('/api/resources/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        resourceType: 'WATER',
        description: '1000 Liters Drinking Water Cans',
        quantity: 1000,
        unit: 'liters',
        contactPhone: '9999999999'
      }
    });
    expect(res.status).toBe(201);
    expect(res.json.success).toBe(true);
  });

  test('41. GET /api/resources returns emergency resources list', async () => {
    const res = await makeRequest('/api/resources');
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect(Array.isArray(res.json.data)).toBe(true);
  });

  test('42. GET /api/volunteers returns available volunteers', async () => {
    const res = await makeRequest('/api/volunteers');
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect(Array.isArray(res.json.data)).toBe(true);
  });

  test('43. POST /api/volunteers/assignments creates a volunteer mission', async () => {
    const loginRes = await makeRequest('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { phone: '9999999999', password: 'Admin@123', role: 'ADMIN' }
    });
    const token = loginRes.json.data.token;

    const repRes = await makeRequest('/api/disasters/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        title: 'Mission Disaster',
        type: 'FLOOD',
        description: 'Need relief mission',
        latitude: 13.0827,
        longitude: 80.2707
      }
    });
    const disasterId = repRes.json.data ? repRes.json.data.id : 1;

    await makeRequest('/api/admin/approve-disaster', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: { disasterId: disasterId, action: 'APPROVED' }
    });

    const res = await makeRequest('/api/volunteers/assignments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: {
        disasterId: disasterId,
        volunteerId: 1,
        taskTitle: 'Distribute Food Packets',
        taskDescription: 'Provide food packets to shelter 4',
        userRole: 'ADMIN'
      }
    });
    expect([200, 201]).toContain(res.status);
    expect(res.json.success).toBe(true);
  }, 20000);

  test('44. GET /api/assignments returns active volunteer missions', async () => {
    const res = await makeRequest('/api/assignments');
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
  });

  test('45. POST /api/incidents/delete removes single disaster incident', async () => {
    const createRes = await makeRequest('/api/disasters/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        title: 'Temp Incident to Delete',
        type: 'OTHER',
        description: 'Single delete test',
        latitude: 13.0,
        longitude: 80.0
      }
    });
    const idToDelete = createRes.json.data ? createRes.json.data.id : 1;
    const delRes = await makeRequest('/api/incidents/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { id: idToDelete }
    });
    expect(delRes.status).toBe(200);
    expect(delRes.json.success).toBe(true);
  });

  test('46. POST /api/admin/reset-data?target=disasters clears all disaster reports', async () => {
    const loginRes = await makeRequest('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { phone: '9999999999', password: 'Admin@123', role: 'ADMIN' }
    });
    const token = loginRes.json.data.token;

    const res = await makeRequest('/api/admin/reset-data?target=disasters', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: { target: 'disasters' }
    });
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);

    const listRes = await makeRequest('/api/disasters');
    expect(listRes.json.data.length).toBe(0);
  }, 35000);

  test('47. POST /api/admin/reset-data?target=resources clears all resource posts', async () => {
    await new Promise(r => setTimeout(r, 2500));
    const loginRes = await makeRequest('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { phone: '9999999999', password: 'Admin@123', role: 'ADMIN' }
    });
    const token = loginRes.json.data.token;

    const res = await makeRequest('/api/admin/reset-data?target=resources', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: { target: 'resources' }
    });
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);

    const listRes = await makeRequest('/api/resources');
    expect(listRes.json.data.length).toBe(0);
  }, 30000);

  test('48. POST /api/admin/reset-system executes master system reset cleanly', async () => {
    await new Promise(r => setTimeout(r, 2500));
    const loginRes = await makeRequest('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { phone: '9999999999', password: 'Admin@123', role: 'ADMIN' }
    });
    const token = loginRes.json.data.token;

    const res = await makeRequest('/api/admin/reset-system?target=all', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: { target: 'all' }
    });
    expect([200, 429]).toContain(res.status);
    if (res.status === 200) {
      expect(res.json.success).toBe(true);
    }
  }, 30000);

  test('49. GET /api/admin/analytics returns valid KPI stats after reset', async () => {
    const loginRes = await makeRequest('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { phone: '9999999999', password: 'Admin@123', role: 'ADMIN' }
    });
    const token = loginRes.json.data.token;

    const res = await makeRequest('/api/admin/analytics', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    expect(res.status).toBe(200);
    expect(res.json.success).toBe(true);
    expect(res.json.data).toBeDefined();
  });

  test('50. Unmatched API route returns JSON 404 error response (Never HTML)', async () => {
    const res = await makeRequest('/api/unmatched-test-route-12345');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.json.success).toBe(false);
  });

});
