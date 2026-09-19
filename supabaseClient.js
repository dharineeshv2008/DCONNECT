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
    const { data, error } = await supabase
      .from('disasters')
      .insert([disasterData])
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
    const { data, error } = await supabase
      .from('resources')
      .select('*, users:provider_id(name,role,phone), disasters(title)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(r => ({
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
    const { data, error } = await supabase
      .from('resources')
      .insert([resData])
      .select();
    if (error) throw error;
    return data && data.length > 0 ? data[0] : null;
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
