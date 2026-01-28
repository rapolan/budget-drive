/**
 * Update Dev User with Password
 * Sets password for the dev user so they can log in
 */

const { Client } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

async function updateDevUser() {
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

    // Generate hash for 'admin123'
    const passwordHash = await bcrypt.hash('admin123', 10);

    // Update the dev user with a password
    await client.query(
      'UPDATE users SET password_hash = $1, email_verified = TRUE WHERE id = $2',
      [passwordHash, '00000000-0000-0000-0000-000000000001']
    );

    console.log('✅ Updated dev user with password hash');
    console.log('   Email: dev@budgetdrivingschool.com');
    console.log('   Password: admin123');

    // Verify
    const result = await client.query(
      'SELECT id, email, full_name, password_hash IS NOT NULL as has_password FROM users'
    );
    console.log('\nUsers after update:');
    console.table(result.rows);

    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

updateDevUser();
