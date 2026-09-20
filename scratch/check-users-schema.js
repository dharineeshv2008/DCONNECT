const { supabase, supabaseDb } = require('../supabaseClient');

async function checkSchema() {
  console.log('--- CHECK USERS TABLE ---');
  const { data: users, error: userError } = await supabase.from('users').select('*').limit(5);
  if (userError) {
    console.error('Users fetch error:', userError);
  } else {
    console.log('Sample Users:', users);
  }

  console.log('\n--- CHECK DISASTERS TABLE ---');
  const { data: disasters, error: disError } = await supabase.from('disasters').select('*').limit(5);
  if (disError) {
    console.error('Disasters fetch error:', disError);
  } else {
    console.log('Sample Disasters:', disasters);
  }

  console.log('\n--- CHECK SUPABASE AUTH USERS ---');
  try {
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
    if (authError) {
      console.warn('Auth admin listUsers error (might need service role key):', authError.message);
    } else {
      console.log('Sample Auth Users count:', authUsers?.users?.length);
    }
  } catch (e) {
    console.warn('Auth error:', e.message);
  }
}

checkSchema();
