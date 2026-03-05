/**
 * Seed script to create the super_admins table and initial admin account
 * Usage: node src/scripts/seedAdmin.js
 */
const bcrypt = require('bcryptjs');
const { supabaseAdmin } = require('../config/supabase');

async function seedAdmin() {
  console.log('Setting up super admin...\n');

  // 1. Create super_admins table if not exists
  const { error: tableError } = await supabaseAdmin.rpc('exec_sql', {
    query: `
      CREATE TABLE IF NOT EXISTS super_admins (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(100) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_super_admins_email ON super_admins(email);
    `,
  });

  // If RPC doesn't exist, try direct SQL via REST
  if (tableError) {
    console.log('RPC not available, creating table via direct insert check...');
    // Table will be created manually via Supabase SQL editor
    // Just try to insert the admin - if table doesn't exist it will fail with clear message
  }

  // 2. Check if admin already exists
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.error('Missing required env vars: ADMIN_EMAIL and ADMIN_PASSWORD');
    console.log('Usage: ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=yourpass node src/scripts/seedAdmin.js');
    process.exit(1);
  }

  const { data: existing } = await supabaseAdmin
    .from('super_admins')
    .select('id')
    .eq('email', adminEmail)
    .single();

  if (existing) {
    console.log('Super admin already exists:', adminEmail);
    process.exit(0);
  }

  // 3. Create admin account
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const { data: admin, error } = await supabaseAdmin
    .from('super_admins')
    .insert({
      email: adminEmail,
      password_hash: passwordHash,
      full_name: process.env.ADMIN_NAME || 'ApptiCare Admin',
      is_active: true,
    })
    .select('id, email, full_name')
    .single();

  if (error) {
    console.error('Failed to create super admin:', error.message);
    console.log('\nYou may need to create the super_admins table first.');
    console.log('Run the SQL in sql/admin_schema.sql via Supabase SQL Editor.');
    process.exit(1);
  }

  console.log('Super admin created successfully!');
  console.log(`  ID: ${admin.id}`);
  console.log(`  Email: ${admin.email}`);
  console.log(`  Name: ${admin.full_name}`);
}

seedAdmin().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
