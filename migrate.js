const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const dns = require('dns');

// Force IPv4
dns.setDefaultResultOrder('ipv4first');

async function tryConnect(config) {
  const client = new Client(config);
  try {
    console.log(`Trying ${config._name} (${config.host}:${config.port})...`);
    await client.connect();
    console.log('Connected successfully!');
    return client;
  } catch (err) {
    console.error(`${config._name} failed:`, err.message);
    try { await client.end(); } catch(e) {}
    return null;
  }
}

async function migrate() {
  const configs = [
    {
      _name: 'Direct (IPv4 forced)',
      host: 'db.jjoefvdgtjcnsfyqathe.supabase.co',
      port: 5432,
      database: 'postgres',
      user: 'postgres',
      password: process.env.SUPABASE_DB_PASSWORD,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    },
    {
      _name: 'Pooler Transaction Mode',
      host: 'aws-0-me-south-1.pooler.supabase.com',
      port: 6543,
      database: 'postgres',
      user: 'postgres.jjoefvdgtjcnsfyqathe',
      password: process.env.SUPABASE_DB_PASSWORD,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    },
    {
      _name: 'Pooler Session Mode',
      host: 'aws-0-me-south-1.pooler.supabase.com',
      port: 5432,
      database: 'postgres',
      user: 'postgres.jjoefvdgtjcnsfyqathe',
      password: process.env.SUPABASE_DB_PASSWORD,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    },
  ];

  let client = null;
  for (const config of configs) {
    client = await tryConnect(config);
    if (client) break;
  }

  if (!client) {
    console.error('All connection methods failed.');
    process.exit(1);
  }

  try {
    const schema = fs.readFileSync(path.join(__dirname, 'sql', 'schema.sql'), 'utf8');
    console.log('Running schema migration...');
    await client.query(schema);
    console.log('Schema migration completed successfully!');

    const result = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    console.log('Tables created:', result.rows.map(r => r.table_name));
  } catch (err) {
    console.error('Migration error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
