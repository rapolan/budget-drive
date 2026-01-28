/**
 * Run All Migrations in Order
 * Applies all migration files sequentially
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function runAllMigrations() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'driving_school'
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort(); // Sort alphabetically (001, 002, etc.)

    console.log(`Found ${files.length} migration files\n`);

    for (const file of files) {
      console.log(`📦 Running: ${file}...`);
      const migrationPath = path.join(migrationsDir, file);
      const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

      try {
        await client.query(migrationSQL);
        console.log(`   ✅ ${file} completed\n`);
      } catch (error) {
        // Ignore errors for already-applied migrations
        if (error.code === '42P07' || error.code === '42710') {
          console.log(`   ⏭️  ${file} already applied (skipped)\n`);
        } else {
          console.log(`   ⚠️  ${file} error: ${error.message}\n`);
        }
      }
    }

    console.log('✅ All migrations processed!');
    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration runner failed:', error.message);
    process.exit(1);
  }
}

runAllMigrations();
