const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'driving_school'
});

client.connect()
  .then(() => client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'students' ORDER BY ordinal_position"))
  .then(r => {
    console.log('Current students columns:');
    r.rows.forEach(row => console.log('-', row.column_name));
    client.end();
  })
  .catch(err => {
    console.error('Error:', err.message);
    client.end();
  });
