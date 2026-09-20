/**
 * Supabase Data Access Layer using official @supabase/supabase-js client
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qpxnsxphwufrnfejphat.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 
                    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
                    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 
                    'sb_publishable_-czHfII217kgXwBOhtB9kw_TA964s7l';

const supabase = createClient(supabaseUrl, supabaseKey);

function sanitizeResourceStatus(input) {
  if (!input) return 'AVAILABLE';
  const upper = String(input).trim().toUpperCase();
  if (['ACTIVE', 'AVAILABLE', 'OPEN', 'IN_STOCK'].includes(upper)) return 'AVAILABLE';
  if (['DISPATCHED', 'IN_PROGRESS', 'ALLOCATED', 'ASSIGNED'].includes(upper)) return 'DISPATCHED';
  if (['EXPIRED', 'EXHAUSTED', 'INACTIVE', 'REMOVED', 'CLOSED', 'DEPLETED'].includes(upper)) return 'EXHAUSTED';
  return 'AVAILABLE';
}

const supabaseDb = {
  supabase,

  // --- USERS ---
  async getUserByPhone(phone) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('phone', phone)
      .limit(1);
    if (error) throw error;
    return data && data.length > 0 ? data[0] : null;
  },

  async getUserById(id) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .limit(1);
    if (error) throw error;
    return data && data.length > 0 ? data[0] : null;
  },

  async getAllUsers() {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async createUser(userData) {
    const cleanUser = {
      name: userData.name || 'Citizen',
      phone: userData.phone,
      role: userData.role || 'USER',
      status: userData.status || 'ACTIVE',
      organization_name: userData.organizationName || userData.organization_name || null,
      organization_reg_no: userData.organizationRegNo || userData.organization_reg_no || null
    };

    const { data, error } = await supabase
      .from('users')
      .insert([cleanUser])
      .select();

    if (error) throw error;
    const userRecord = data && data.length > 0 ? data[0] : null;

    if (userRecord && (userData.role === 'VOLUNTEER' || userData.skills)) {
      try {
        await supabase.from('volunteers').insert([{
          user_id: userRecord.id,
          skills: userData.skills || userData.volunteerSkills || 'General Relief',
          availability_status: 'AVAILABLE',
          helped_count: 0
        }]);
      } catch (err) {
        console.warn('Volunteer creation notice:', err.message);
      }
    }

    return userRecord;
  },

  async updateUser(id, updates) {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', id)
      .select();
    if (error) throw error;
    return data && data.length > 0 ? data[0] : null;
  },

  async getPendingUsers() {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('status', 'PENDING_APPROVAL')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  // --- INCIDENTS / DISASTERS ---
  async getAllDisasters(statusFilter = null) {
    let query = supabase
      .from('disasters')
      .select('*, creator:created_by_user_id(name,role)')
      .order('created_at', { ascending: false });

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(r => ({
      ...r,
      createdByName: r.creator?.name || 'Authorized Responder',
      createdByRole: r.creator?.role || 'PUBLIC'
    }));
  },

  async getCandidateDisastersForMerge(type) {
    const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
    const { data, error } = await supabase
      .from('disasters')
      .select('*')
      .eq('type', type)
      .in('status', ['PENDING', 'VERIFIED_ACTIVE', 'IN_PROGRESS', 'Open', 'In Progress'])
      .gte('created_at', threeHoursAgo)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async getDisasterById(id) {
    const { data, error } = await supabase
      .from('disasters')
      .select('*, creator:created_by_user_id(name,role)')
      .eq('id', id)
      .limit(1);
    if (error) throw error;
    if (!data || data.length === 0) return null;
    const r = data[0];
    return {
      ...r,
      createdByName: r.creator?.name || 'Authorized Responder',
      createdByRole: r.creator?.role || 'PUBLIC'
    };
  },

  async createDisaster(disasterData) {
    const rawSeverity = (disasterData.severity || 'UNVERIFIED').toUpperCase();
    const dbSeverity = (rawSeverity === 'UNVERIFIED') ? 'LOW' : rawSeverity;

    const payload = {
      ...disasterData,
      severity: dbSeverity,
      status: disasterData.status || 'PENDING'
    };
    const { data, error } = await supabase
      .from('disasters')
      .insert([payload])
      .select();
    if (error) throw error;
    if (!data || data.length === 0) return null;
    return {
      ...data[0],
      severity: rawSeverity
    };
  },

  async editDisaster(id, updates) {
    const cleanUpdates = {};
    if (updates.description !== undefined) cleanUpdates.description = updates.description;
    if (updates.latitude !== undefined && !isNaN(parseFloat(updates.latitude))) cleanUpdates.latitude = parseFloat(updates.latitude);
    if (updates.longitude !== undefined && !isNaN(parseFloat(updates.longitude))) cleanUpdates.longitude = parseFloat(updates.longitude);
    if (updates.location_name !== undefined || updates.locationName !== undefined) {
      cleanUpdates.location_name = updates.location_name || updates.locationName;
    }
    if (updates.severity !== undefined) {
      const s = updates.severity.toUpperCase();
      cleanUpdates.severity = (s === 'UNVERIFIED') ? 'LOW' : s;
    }
    if (updates.status !== undefined) cleanUpdates.status = updates.status;
    if (updates.title !== undefined) cleanUpdates.title = updates.title;

    const { data, error } = await supabase
      .from('disasters')
      .update(cleanUpdates)
      .eq('id', id)
      .select();
    if (error) throw error;
    return data && data.length > 0 ? data[0] : null;
  },

  async updateDisaster(id, updates) {
    const { data, error } = await supabase
      .from('disasters')
      .update(updates)
      .eq('id', id)
      .select();
    if (error) throw error;
    return data && data.length > 0 ? data[0] : null;
  },

  async deleteDisaster(id) {
    await supabase.from('reports').delete().eq('disaster_id', id).catch(() => {});
    await supabase.from('assignments').delete().eq('disaster_id', id).catch(() => {});
    await supabase.from('resources').delete().eq('disaster_id', id).catch(() => {});
    await supabase.from('comments').delete().eq('disaster_id', id).catch(() => {});

    const { data, error } = await supabase
      .from('disasters')
      .delete()
      .eq('id', id)
      .select();
    if (error) throw error;
    return data && data.length > 0 ? data[0] : { id };
  },

  async getPendingDisasters() {
    const { data, error } = await supabase
      .from('disasters')
      .select('*, creator:created_by_user_id(name,role)')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(r => ({
      ...r,
      createdByName: r.creator?.name || 'Citizen Reporter',
      createdByRole: r.creator?.role || 'PUBLIC'
    }));
  },

  // --- REPORTS ---
  async createReport(reportData) {
    const { data, error } = await supabase
      .from('reports')
      .insert([reportData])
      .select();
    if (error) throw error;
    return data && data.length > 0 ? data[0] : null;
  },

  // --- VOLUNTEERS ---
  async getVolunteersStrict() {
    const { data, error } = await supabase
      .from('users')
      .select('*, volunteers(id, skills, availability_status, helped_count, current_latitude, current_longitude)')
      .eq('role', 'VOLUNTEER')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('getVolunteersStrict error:', error.message);
      return this.getVolunteers();
    }

    return (data || []).map(u => {
      const vArr = u.volunteers;
      const v = (Array.isArray(vArr) && vArr.length > 0) ? vArr[0] : {};
      return {
        id: v.id || u.id,
        userId: u.id,
        name: u.name || 'Volunteer',
        phone: u.phone || 'N/A',
        role: u.role,
        status: u.status,
        skills: v.skills || 'General Relief',
        availabilityStatus: v.availability_status || 'AVAILABLE',
        helpedCount: v.helped_count || 0,
        currentLatitude: v.current_latitude || 13.0827,
        currentLongitude: v.current_longitude || 80.2707
      };
    });
  },
  async createVolunteerProfile(profileData) {
    const { data, error } = await supabase
      .from('volunteers')
      .insert([{
        user_id: profileData.user_id || profileData.userId,
        skills: profileData.skills || profileData.volunteerSkills || 'General Relief',
        availability_status: profileData.availability_status || profileData.availabilityStatus || 'AVAILABLE',
        helped_count: profileData.helped_count || profileData.helpedCount || 0,
        current_latitude: profileData.current_latitude || profileData.currentLatitude || 13.0827,
        current_longitude: profileData.current_longitude || profileData.currentLongitude || 80.2707
      }])
      .select();
    if (error) {
      console.warn('Volunteer profile insertion warning:', error.message);
      return null;
    }
    return data && data.length > 0 ? data[0] : null;
  },

  async getVolunteers() {
    const { data, error } = await supabase
      .from('volunteers')
      .select('*, users:user_id(id,name,phone,status)')
      .order('helped_count', { ascending: false });
    if (error) throw error;
    return (data || []).map(v => ({
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

  // --- ASSIGNMENTS ---
  async getAssignments() {
    const { data, error } = await supabase
      .from('assignments')
      .select('*, users:volunteer_id(name,phone), disasters(title)')
      .order('assigned_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(a => ({
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
    const { data, error } = await supabase
      .from('assignments')
      .insert([assignmentData])
      .select();
    if (error) throw error;
    return data && data.length > 0 ? data[0] : null;
  },

  async updateAssignmentStatus(id, newStatus) {
    const { data, error } = await supabase
      .from('assignments')
      .update({
        status: newStatus,
        completed_at: newStatus === 'COMPLETED' ? new Date().toISOString() : null
      })
      .eq('id', id)
      .select();
    if (error) throw error;
    return data && data.length > 0 ? data[0] : null;
  },

  // --- RESOURCES ---
  async getResources() {
    let data, error;
    try {
      const res = await supabase
        .from('resources')
        .select('*, users:provider_id(name,role,phone), disasters(title)')
        .order('created_at', { ascending: false });
      data = res.data;
      error = res.error;
      if (error) throw error;
    } catch (err) {
      if (err.message && (err.message.includes('available_until') || err.message.includes('description') || err.message.includes('schema cache'))) {
        const res2 = await supabase
          .from('resources')
          .select('id, disaster_id, provider_id, resource_type, resource_name, quantity, unit, status, contact_phone, created_at, users:provider_id(name,role,phone), disasters(title)')
          .order('created_at', { ascending: false });
        data = res2.data;
        if (res2.error) throw res2.error;
      } else {
        throw err;
      }
    }

    const now = new Date();
    const expiredIdsToUpdate = [];

    const mapped = (data || []).map(r => {
      let currentStatus = sanitizeResourceStatus(r.status);

      if (r.available_until && new Date(r.available_until) < now && currentStatus === 'AVAILABLE') {
        currentStatus = 'EXHAUSTED';
        expiredIdsToUpdate.push(r.id);
      }

      return {
        id: r.id,
        disasterId: r.disaster_id,
        disasterTitle: r.disasters?.title || 'General Emergency Supply Pool',
        providerId: r.provider_id,
        providerName: r.users?.name || 'Relief Agency',
        providerRole: r.users?.role || 'GOVERNMENT_AGENCY',
        resourceType: r.resource_type || 'OTHER',
        resourceName: r.resource_name || r.description || 'Emergency Supply',
        description: r.description || r.resource_name || 'Emergency Supply Post',
        quantity: r.quantity || 1,
        unit: r.unit || 'units',
        latitude: r.latitude ? parseFloat(r.latitude) : 13.0827,
        longitude: r.longitude ? parseFloat(r.longitude) : 80.2707,
        address: r.address || r.location_name || 'Central Command Pool',
        availableUntil: r.available_until || null,
        status: currentStatus,
        contactPhone: r.contact_phone || r.users?.phone || 'N/A',
        createdAt: r.created_at
      };
    });

    if (expiredIdsToUpdate.length > 0) {
      supabase.from('resources').update({ status: 'EXHAUSTED' }).in('id', expiredIdsToUpdate).catch(() => {});
    }

    return mapped;
  },

  async createResource(resData) {
    let targetDisasterId = resData.disaster_id || resData.disasterId;

    if (targetDisasterId) {
      try {
        const existing = await this.getDisasterById(targetDisasterId);
        if (!existing) targetDisasterId = null;
      } catch (e) {
        targetDisasterId = null;
      }
    }

    if (!targetDisasterId) {
      try {
        const activeDisasters = await this.getAllDisasters();
        if (activeDisasters && activeDisasters.length > 0) {
          targetDisasterId = activeDisasters[0].id;
        }
      } catch (e) {
        targetDisasterId = null;
      }
    }

    const availableUntilVal = resData.available_until || resData.availableUntil || null;
    let initialStatus = sanitizeResourceStatus(resData.status);
    if (availableUntilVal && new Date(availableUntilVal) < new Date()) {
      initialStatus = 'EXHAUSTED';
    }

    const cleanRes = {
      disaster_id: targetDisasterId,
      provider_id: resData.provider_id || resData.providerId || null,
      resource_type: resData.resource_type || resData.resourceType || 'OTHER',
      resource_name: resData.resource_name || resData.description || resData.resourceName || 'Emergency Supply',
      description: resData.description || resData.resource_name || resData.resourceName || 'Emergency Supply Post',
      quantity: parseInt(resData.quantity) || 1,
      unit: resData.unit || 'units',
      latitude: resData.latitude ? parseFloat(resData.latitude) : 13.0827,
      longitude: resData.longitude ? parseFloat(resData.longitude) : 80.2707,
      address: resData.address || resData.locationName || 'Central Relief Pool',
      available_until: availableUntilVal,
      status: initialStatus,
      contact_phone: resData.contact_phone || resData.contactPhone || null
    };

    try {
      const { data, error } = await supabase
        .from('resources')
        .insert([cleanRes])
        .select();
      if (error) throw error;
      return data && data.length > 0 ? data[0] : null;
    } catch (err) {
      if (err.code === '23503' && !cleanRes.disaster_id) {
        const defaultDisaster = await this.createDisaster({
          title: 'General Emergency Relief Supply Pool',
          type: 'OTHER',
          description: 'System pool for general resource contributions.',
          severity: 'LOW',
          latitude: 13.0827,
          longitude: 80.2707,
          location_name: 'Central Emergency Relief Command',
          status: 'VERIFIED_ACTIVE'
        });
        cleanRes.disaster_id = defaultDisaster.id;
        return this.createResource(cleanRes);
      }

      // Fallback without missing schema columns (e.g. available_until, description, latitude, longitude, address)
      if (err.message && (err.message.includes('column') || err.message.includes('schema cache') || err.code === 'PGRST204')) {
        console.warn('Fallback inserting resource without extra schema columns:', err.message);
        const fallbackRes = {
          disaster_id: cleanRes.disaster_id,
          provider_id: cleanRes.provider_id,
          resource_type: cleanRes.resource_type,
          resource_name: cleanRes.description || cleanRes.resource_name,
          quantity: cleanRes.quantity,
          unit: cleanRes.unit,
          status: cleanRes.status,
          contact_phone: cleanRes.contact_phone
        };

        const { data: dFallback, error: eFallback } = await supabase
          .from('resources')
          .insert([fallbackRes])
          .select();
        if (eFallback) throw eFallback;
        return dFallback && dFallback.length > 0 ? dFallback[0] : null;
      }

      throw err;
    }
  },

  async updateResource(id, updates) {
    const cleanUpdates = {};
    if (updates.resource_type || updates.resourceType) cleanUpdates.resource_type = updates.resource_type || updates.resourceType;
    if (updates.description !== undefined || updates.resourceName !== undefined || updates.resource_name !== undefined) {
      const val = updates.description !== undefined ? updates.description : (updates.resourceName || updates.resource_name);
      cleanUpdates.description = val;
      cleanUpdates.resource_name = val;
    }
    if (updates.quantity !== undefined) cleanUpdates.quantity = parseInt(updates.quantity);
    if (updates.unit !== undefined) cleanUpdates.unit = updates.unit;
    if (updates.available_until !== undefined || updates.availableUntil !== undefined) {
      cleanUpdates.available_until = updates.available_until || updates.availableUntil;
    }
    if (updates.status !== undefined) cleanUpdates.status = sanitizeResourceStatus(updates.status);
    if (updates.contact_phone !== undefined || updates.contactPhone !== undefined) {
      cleanUpdates.contact_phone = updates.contact_phone || updates.contactPhone;
    }

    try {
      const { data, error } = await supabase
        .from('resources')
        .update(cleanUpdates)
        .eq('id', id)
        .select();
      if (error) throw error;
      return data && data.length > 0 ? data[0] : null;
    } catch (err) {
      if (err.message && (err.message.includes('column') || err.message.includes('schema cache') || err.code === 'PGRST204')) {
        console.warn('Fallback updating resource without extra schema columns:', err.message);
        const fallbackUpdates = {};
        if (cleanUpdates.resource_type) fallbackUpdates.resource_type = cleanUpdates.resource_type;
        if (cleanUpdates.resource_name) fallbackUpdates.resource_name = cleanUpdates.resource_name;
        if (cleanUpdates.quantity !== undefined) fallbackUpdates.quantity = cleanUpdates.quantity;
        if (cleanUpdates.unit) fallbackUpdates.unit = cleanUpdates.unit;
        if (cleanUpdates.status) fallbackUpdates.status = cleanUpdates.status;
        if (cleanUpdates.contact_phone) fallbackUpdates.contact_phone = cleanUpdates.contact_phone;

        const { data: dFallback, error: eFallback } = await supabase
          .from('resources')
          .update(fallbackUpdates)
          .eq('id', id)
          .select();
        if (eFallback) throw eFallback;
        return dFallback && dFallback.length > 0 ? dFallback[0] : null;
      }
      throw err;
    }
  },

  async deleteResource(id) {
    const { data, error } = await supabase
      .from('resources')
      .delete()
      .eq('id', id)
      .select();
    if (error) throw error;
    return data && data.length > 0 ? data[0] : { id };
  },

  // --- COMMENTS ---
  async getComments(disasterId) {
    const { data, error } = await supabase
      .from('comments')
      .select('*, users:user_id(name,role)')
      .eq('disaster_id', disasterId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map(c => ({
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
    const { data, error } = await supabase
      .from('comments')
      .insert([commentData])
      .select();
    if (error) throw error;
    return data && data.length > 0 ? data[0] : null;
  },

  // --- ANALYTICS ---
  async getAnalytics() {
    const [{ data: disasters }, { data: users }, { data: volunteers }, { data: resources }] = await Promise.all([
      supabase.from('disasters').select('id,status,report_count'),
      supabase.from('users').select('id,status'),
      supabase.from('volunteers').select('id'),
      supabase.from('resources').select('id')
    ]);

    const activeDisasters = (disasters || []).filter(d => ['VERIFIED_ACTIVE', 'IN_PROGRESS', 'Open', 'In Progress'].includes(d.status)).length;
    const pendingDisasters = (disasters || []).filter(d => d.status === 'PENDING').length;
    const totalReports = (disasters || []).reduce((sum, d) => sum + (d.report_count || 1), 0);
    const pendingUsers = (users || []).filter(u => u.status === 'PENDING_APPROVAL').length;

    return {
      totalDisasters: (disasters || []).length,
      activeDisasters,
      pendingDisasters,
      totalReportsAggregated: totalReports,
      activeVolunteers: (volunteers || []).length,
      totalResourcesAvailable: (resources || []).length,
      pendingUserApprovals: pendingUsers
    };
  }
};

module.exports = { supabase, supabaseDb };
