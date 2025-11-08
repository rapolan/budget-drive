/**
 * Migration Runner
 * Runs the database migration script to create all tables
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'driving_school'
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Read migration file
    const migrationPath = path.join(__dirname, 'migrations', '001_complete_schema.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📦 Running migration: 001_complete_schema.sql...');

    // Run migration
    await client.query(migrationSQL);

    console.log('✅ Migration completed successfully!');
    console.log('\n📊 Tables created: 23');
    console.log('📊 Views created: 1');
    console.log('\nNext step: Run seed data with: node database/run-seed.js');

    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

runMigration();
