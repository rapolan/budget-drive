/**
 * Seed Validation Utility
 * Verifies the integrity of seeded data
 */

const { Client } = require('pg');
require('dotenv').config();

async function validateSeed() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'driving_school'
  });

  try {
    await client.connect();
    console.log('🔍 Validating seeded data...');

    let errors = [];

    // 1. Check for Admin User
    const adminResult = await client.query("SELECT COUNT(*) FROM users WHERE email = 'admin@budgetdrivingschool.com'");
    if (parseInt(adminResult.rows[0].count) === 0) {
      errors.push('❌ Error: Missing primary admin user (admin@budgetdrivingschool.com)');
    }

    // 2. Check Password Hash Integrity
    const hashResult = await client.query("SELECT email, password_hash FROM users");
    for (const row of hashResult.rows) {
      if (!row.password_hash || row.password_hash.length !== 60) {
        errors.push(`❌ Error: User ${row.email} has invalid password hash length (${row.password_hash?.length || 0} chars). Expected 60.`);
      }
    }

    // 3. Check Tenant Integrity
    const tenantResult = await client.query("SELECT COUNT(*) FROM tenants");
    if (parseInt(tenantResult.rows[0].count) === 0) {
      errors.push('❌ Error: No tenants found in database');
    }

    // 4. Check Instructor/User link
    const linkResult = await client.query(`
      SELECT COUNT(*) FROM user_tenant_memberships 
      WHERE role = 'instructor' AND instructor_id IS NULL
    `);
    if (parseInt(linkResult.rows[0].count) > 0) {
      errors.push(`❌ Error: ${linkResult.rows[0].count} instructor records are missing their linked instructor_id`);
    }

    if (errors.length > 0) {
      console.log('\n🚨 DATA INTEGRITY ISSUES FOUND:');
      errors.forEach(err => console.error(err));
      console.log('\n==============================================');
      await client.end();
      return false;
    }

    console.log('✅ All data integrity checks passed!');
    console.log('==============================================\n');
    await client.end();
    return true;
  } catch (error) {
    console.error('❌ Validation process failed:', error.message);
    await client.end();
    return false;
  }
}

// Allow calling directly or exporting
if (require.main === module) {
  validateSeed().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = validateSeed;
