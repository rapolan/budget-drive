/**
 * Database Setup Script
 * Creates the database if it doesn't exist
 */

const { Client } = require('pg');
require('dotenv').config();

async function setupDatabase() {
  // Connect to postgres database to create our app database
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: 'postgres' // Connect to default postgres database
  });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL server');

    // Check if database exists
    const dbName = process.env.DB_NAME || 'driving_school';
    const checkDbQuery = `SELECT 1 FROM pg_database WHERE datname = $1`;
    const result = await client.query(checkDbQuery, [dbName]);

    if (result.rows.length === 0) {
      // Database doesn't exist, create it
      console.log(`📦 Creating database: ${dbName}...`);
      await client.query(`CREATE DATABASE ${dbName}`);
      console.log(`✅ Database '${dbName}' created successfully!`);
    } else {
      console.log(`✅ Database '${dbName}' already exists`);
    }

    await client.end();
    console.log('\n✅ Database setup complete!');
    console.log(`\nNext steps:`);
    console.log(`  1. Run migrations: node database/run-migration.js`);
    console.log(`  2. Seed data: node database/run-seed.js`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error setting up database:', error.message);
    process.exit(1);
  }
}

setupDatabase();
