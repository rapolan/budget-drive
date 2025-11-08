/**
 * Seed Runner
 * Loads initial test data into the database
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runSeed() {
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

    // Read seed file
    const seedPath = path.join(__dirname, 'seeds', '001_budget_driving_school.sql');
    const seedSQL = fs.readFileSync(seedPath, 'utf8');

    console.log('🌱 Running seed: 001_budget_driving_school.sql...');

    // Run seed
    await client.query(seedSQL);

    console.log('✅ Seed data loaded successfully!');
    console.log('\n📊 Sample Data Created:');
    console.log('  - 1 Tenant: Budget Driving School (Los Angeles, CA)');
    console.log('  - 2 Instructors: John Smith, Maria Rodriguez');
    console.log('  - 2 Vehicles: Honda Civic 2022, Toyota Corolla 2023');
    console.log('  - 2 Students: Sarah Johnson, Michael Chen');
    console.log('  - 2 Leads: Emily Davis, David Martinez');
    console.log('\n✅ Database is ready for development!');

    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

runSeed();
