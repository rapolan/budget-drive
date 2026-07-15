/**
 * Seed Runner
 * Loads initial test data into the database
 * Now runs ALL seed files in order
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const validateSeed = require('./validate-seed');

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
    console.log('\n🌱 Running all seed files...\n');

    // Get all seed files in order
    const seedsDir = path.join(__dirname, 'seeds');
    const seedFiles = fs.readdirSync(seedsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Alphabetical sort ensures numeric order (001, 002, 003)

    for (const seedFile of seedFiles) {
      console.log(`📄 Running: ${seedFile}...`);
      const seedPath = path.join(seedsDir, seedFile);
      const seedSQL = fs.readFileSync(seedPath, 'utf8');

      try {
        await client.query(seedSQL);
        console.log(`   ✅ ${seedFile} completed\n`);
      } catch (error) {
        // Ignore duplicate key errors (ON CONFLICT DO NOTHING)
        if (error.code === '23505') {
          console.log(`   ⚠️  ${seedFile} - Some data already exists (skipped duplicates)\n`);
        } else {
          throw error;
        }
      }
    }

    console.log('==============================================');
    console.log('✅ ALL SEED DATA LOADED SUCCESSFULLY!');
    console.log('==============================================\n');

    // Get summary statistics (wrapped in try/catch to be robust)
    const getCount = async (table, where = '') => {
      try {
        const result = await client.query(`SELECT COUNT(*) FROM ${table} ${where}`);
        return result.rows[0].count;
      } catch (e) {
        return 'Table not found';
      }
    };

    const tenantCount = await getCount('tenants');
    const studentCount = await getCount('students');
    const instructorCount = await getCount('instructors');
    const vehicleCount = await getCount('vehicles');
    const lessonCount = await getCount('lessons');
    const paymentCount = await getCount('payments');
    const recurringCount = await getCount('recurring_lesson_patterns', "WHERE status = 'active'");

    console.log('📊 Database Summary:');
    console.log(`  - ${tenantCount} Tenant(s)`);
    console.log(`  - ${studentCount} Students`);
    console.log(`  - ${instructorCount} Instructors`);
    console.log(`  - ${vehicleCount} Vehicles`);
    console.log(`  - ${lessonCount} Lessons`);
    console.log(`  - ${paymentCount} Payments`);
    console.log(`  - ${recurringCount} Active Recurring Patterns`);

    // Get tenant info for frontend testing
    const tenantInfo = await client.query('SELECT id, name FROM tenants LIMIT 1');
    if (tenantInfo.rows.length > 0) {
      console.log('\n🔑 For Frontend Testing:');
      console.log(`  Tenant ID: ${tenantInfo.rows[0].id}`);
      console.log(`  Tenant Name: ${tenantInfo.rows[0].name}`);
      console.log('\n  💡 TIP: Set these in localStorage for auth bypass:');
      console.log(`     localStorage.setItem('tenant_id', '${tenantInfo.rows[0].id}');`);
      console.log(`     localStorage.setItem('tenant_name', '${tenantInfo.rows[0].name}');`);
    }

    console.log('\n✅ Database is ready for development!');
    console.log('==============================================\n');

    await client.end();

    // FINAL VALIDATION STEP
    const isValid = await validateSeed();
    if (!isValid) {
      console.error('⚠️  Seed completed but data validation FAILED.');
      process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error.message);
    console.error('\nFull error:', error);
    await client.end();
    process.exit(1);
  }
}

runSeed();
