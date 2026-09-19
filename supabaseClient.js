/**
 * Supabase Data Access Layer
 * Direct PostgREST client for real database persistence (no mock data)
 * Uses SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qpxnsxphwufrnfejphat.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 
                     process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
                     process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 
                     'sb_publishable_-czHfII217kgXwBOhtB9kw_TA964s7l';

const defaultHeaders = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json'
};

async function query(tableWithParams, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${tableWithParams}`;
  const fetchOptions = {
    method: options.method || 'GET',
    headers: {
      ...defaultHeaders,
      ...(options.headers || {})
    }
  };

  if (options.body) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  const res = await fetch(url, fetchOptions);
  const text = await res.text();
  
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (e) {
    data = text;
  }

  if (!res.ok) {
    const errMessage = typeof data === 'object' && data ? (data.message || JSON.stringify(data)) : String(data);
    const err = new Error(`Supabase query failed [${res.status}]: ${errMessage}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

const supabaseDb = {
  // --- USERS ---
  async getUserByPhone(phone) {
    const rows = await query(`users?phone=eq.${encodeURIComponent(phone)}&limit=1`);
    return rows && rows.length > 0 ? rows[0] : null;
  },

  async getUserById(id) {
    const rows = await query(`users?id=eq.${id}&limit=1`);
    return rows && rows.length > 0 ? rows[0] : null;
  },

  async getAllUsers() {
    return await query('users?select=*&order=created_at.desc');
  },

  async createUser(userData) {
    // Sanitize to only valid Supabase users table columns
    const cleanUser = {
      name: userData.name || 'Citizen',
      phone: userData.phone,
      role: userData.role || 'USER',
      status: userData.status || 'ACTIVE',
      organization_name: userData.organizationName || userData.organization_name || null,
      organization_reg_no: userData.organizationRegNo || userData.organization_reg_no || null
    };

    const inserted = await query('users', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: cleanUser
    });
    
    const userRecord = inserted && inserted[0] ? inserted[0] : inserted;

    // If volunteer skills provided, store in volunteers table
    if (userRecord && (userData.role === 'VOLUNTEER' || userData.skills)) {
      try {
        await this.createVolunteerProfile({
          user_id: userRecord.id,
          skills: userData.skills || userData.volunteerSkills || 'General Relief',
          availability_status: 'AVAILABLE',
          helped_count: 0
        });
      } catch (err) {
        console.warn('Volunteer profile creation notice:', err.message);
      }
    }

    return userRecord;
  },

  async updateUser(id, updates) {
    const updated = await query(`users?id=eq.${id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: updates
    });
    return updated && updated[0] ? updated[0] : updated;
  },

  async getPendingUsers() {
    return await query('users?status=eq.PENDING_APPROVAL&order=created_at.desc');
  },

  // --- DISASTERS / INCIDENTS ---
  async getAllDisasters(statusFilter = null) {
    let q = 'disasters?select=*,creator:created_by_user_id(name,role)&order=created_at.desc';
    if (statusFilter) {
      q = `disasters?select=*,creator:created_by_user_id(name,role)&status=eq.${encodeURIComponent(statusFilter)}&order=created_at.desc`;
    }
    const rows = await query(q);
    return rows.map(r => ({
      ...r,
      createdByName: r.creator?.name || 'Authorized Responder',
      createdByRole: r.creator?.role || 'PUBLIC'
    }));
  },

  async getCandidateDisastersForMerge(type) {
    const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
    const q = `disasters?type=eq.${encodeURIComponent(type)}&status=in.(PENDING,VERIFIED_ACTIVE,IN_PROGRESS)&created_at=gte.${threeHoursAgo}&order=created_at.desc`;
    return await query(q);
  },

  async getDisasterById(id) {
    const rows = await query(`disasters?id=eq.${id}&select=*,creator:created_by_user_id(name,role)&limit=1`);
    if (!rows || rows.length === 0) return null;
    const r = rows[0];
    return {
      ...r,
      createdByName: r.creator?.name || 'Authorized Responder',
      createdByRole: r.creator?.role || 'PUBLIC'
    };
  },

  async createDisaster(disasterData) {
    const inserted = await query('disasters', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: disasterData
    });
    return inserted && inserted[0] ? inserted[0] : inserted;
  },

  async updateDisaster(id, updates) {
    const updated = await query(`disasters?id=eq.${id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: updates
    });
    return updated && updated[0] ? updated[0] : updated;
  },

  async getPendingDisasters() {
    const rows = await query('disasters?status=eq.PENDING&select=*,creator:created_by_user_id(name,role)&order=created_at.desc');
    return rows.map(r => ({
      ...r,
      createdByName: r.creator?.name || 'Citizen Reporter',
      createdByRole: r.creator?.role || 'PUBLIC'
    }));
  },

  // --- REPORTS ---
  async createReport(reportData) {
    const inserted = await query('reports', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: reportData
    });
    return inserted && inserted[0] ? inserted[0] : inserted;
  },

  // --- VOLUNTEERS ---
  async getVolunteers() {
    const rows = await query('volunteers?select=*,users:user_id(id,name,phone,status)&order=helped_count.desc');
    return rows.map(v => ({
      id: v.id,
      userId: v.user_id,
      name: v.users?.name || 'Volunteer',
      phone: v.users?.phone || 'N/A',
      skills: v.skills || 'General Relief',
      availabilityStatus: v.availability_status || 'AVAILABLE',
      helpedCount: v.helped_count || 0,
      currentLatitude: v.current_latitude || 13.0827,
      currentLongitude: v.current_longitude || 80.2707
    }));
  },

  async createVolunteerProfile(volData) {
    const inserted = await query('volunteers', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: volData
    });
    return inserted && inserted[0] ? inserted[0] : inserted;
  },

  // --- ASSIGNMENTS ---
  async getAssignments(volunteerId = null, disasterId = null) {
    let q = 'assignments?select=*,users:volunteer_id(name,phone),disasters(title)&order=assigned_at.desc';
    if (volunteerId) {
      q = `assignments?volunteer_id=eq.${volunteerId}&select=*,users:volunteer_id(name,phone),disasters(title)&order=assigned_at.desc`;
    } else if (disasterId) {
      q = `assignments?disaster_id=eq.${disasterId}&select=*,users:volunteer_id(name,phone),disasters(title)&order=assigned_at.desc`;
    }
    const rows = await query(q);
    return rows.map(a => ({
      id: a.id,
      disasterId: a.disaster_id,
      disasterTitle: a.disasters?.title || 'Relief Operation',
      volunteerId: a.volunteer_id,
      volunteerName: a.users?.name || 'Registered Volunteer',
      volunteerPhone: a.users?.phone || 'N/A',
      taskTitle: a.task_title,
      taskDescription: a.task_description,
      status: a.status,
      assignedAt: a.assigned_at,
      completedAt: a.completed_at
    }));
  },

  async createAssignment(assignmentData) {
    const inserted = await query('assignments', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: assignmentData
    });
    return inserted && inserted[0] ? inserted[0] : inserted;
  },

  async updateAssignmentStatus(id, newStatus) {
    const updates = {
      status: newStatus,
      completed_at: newStatus === 'COMPLETED' ? new Date().toISOString() : null
    };
    const updated = await query(`assignments?id=eq.${id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: updates
    });
    return updated && updated[0] ? updated[0] : updated;
  },

  // --- RESOURCES ---
  async getResources() {
    const rows = await query('resources?select=*,users:provider_id(name,role,phone),disasters(title)&order=created_at.desc');
    return rows.map(r => ({
      id: r.id,
      disasterId: r.disaster_id,
      disasterTitle: r.disasters?.title || 'General Emergency Supply Pool',
      providerId: r.provider_id,
      providerName: r.users?.name || 'Relief Agency',
      providerRole: r.users?.role || 'GOVERNMENT_AGENCY',
      resourceType: r.resource_type,
      resourceName: r.resource_name,
      quantity: r.quantity,
      unit: r.unit,
      status: r.status,
      contactPhone: r.contact_phone || r.users?.phone || 'N/A',
      createdAt: r.created_at
    }));
  },

  async createResource(resData) {
    const inserted = await query('resources', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: resData
    });
    return inserted && inserted[0] ? inserted[0] : inserted;
  },

  // --- COMMENTS ---
  async getComments(disasterId) {
    const rows = await query(`comments?disaster_id=eq.${disasterId}&select=*,users:user_id(name,role)&order=created_at.asc`);
    return rows.map(c => ({
      id: c.id,
      disasterId: c.disaster_id,
      userId: c.user_id,
      userName: c.users?.name || 'Authorized Responder',
      userRole: c.users?.role || 'USER',
      message: c.message,
      createdAt: c.created_at
    }));
  },

  async createComment(commentData) {
    const inserted = await query('comments', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: commentData
    });
    return inserted && inserted[0] ? inserted[0] : inserted;
  },

  // --- ANALYTICS ---
  async getAnalytics() {
    const [disasters, users, volunteers, resources] = await Promise.all([
      query('disasters?select=id,status,report_count'),
      query('users?select=id,status'),
      query('volunteers?select=id'),
      query('resources?select=id')
    ]);

    const activeDisasters = disasters.filter(d => ['VERIFIED_ACTIVE', 'IN_PROGRESS'].includes(d.status)).length;
    const pendingDisasters = disasters.filter(d => d.status === 'PENDING').length;
    const totalReports = disasters.reduce((sum, d) => sum + (d.report_count || 1), 0);
    const pendingUsers = users.filter(u => u.status === 'PENDING_APPROVAL').length;

    return {
      totalDisasters: disasters.length,
      activeDisasters,
      pendingDisasters,
      totalReportsAggregated: totalReports,
      activeVolunteers: volunteers.length,
      totalResourcesAvailable: resources.length,
      pendingUserApprovals: pendingUsers
    };
  }
};

module.exports = { supabaseDb, query };
