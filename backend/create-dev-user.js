const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'driving_school',
  port: 5432,
  password: '67d83bc19d3547cc9b1d0bb3b0762a90',
});

async function createDevUser() {
  const client = await pool.connect();
  try {
    console.log('🔧 Creating Development User...\n');
    console.log('='.repeat(70));

    // Create development user
    const userResult = await client.query(`
      INSERT INTO users (
        id,
        email,
        full_name,
        email_verified,
        status,
        created_at,
        updated_at
      ) VALUES (
        '00000000-0000-0000-0000-000000000001',
        'dev@budgetdrivingschool.com',
        'Development User',
        true,
        'active',
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING *
    `);

    if (userResult.rowCount > 0) {
      console.log('✅ Development user created successfully');
      console.log('   ID:', userResult.rows[0].id);
      console.log('   Email:', userResult.rows[0].email);
      console.log('   Name:', userResult.rows[0].full_name);
    } else {
      console.log('ℹ️  Development user already exists (skipped)');
    }

    // Link dev user to default tenant
    const membershipResult = await client.query(`
      INSERT INTO user_tenant_memberships (
        id,
        user_id,
        tenant_id,
        role,
        status,
        created_at,
        updated_at
      ) VALUES (
        gen_random_uuid(),
        '00000000-0000-0000-0000-000000000001',
        '55654b9d-6d7f-46e0-ade2-be606abfe00a',
        'admin',
        'active',
        NOW(),
        NOW()
      )
      ON CONFLICT DO NOTHING
      RETURNING *
    `);

    if (membershipResult.rowCount > 0) {
      console.log('✅ Tenant membership created successfully');
      console.log('   Tenant ID:', membershipResult.rows[0].tenant_id);
      console.log('   Role:', membershipResult.rows[0].role);
    } else {
      console.log('ℹ️  Tenant membership already exists (skipped)');
    }

    // Verify user exists
    const verifyResult = await client.query(`
      SELECT
        u.id,
        u.email,
        u.full_name,
        u.status,
        utm.tenant_id,
        utm.role
      FROM users u
      LEFT JOIN user_tenant_memberships utm ON u.id = utm.user_id
      WHERE u.id = '00000000-0000-0000-0000-000000000001'
    `);

    console.log('\n' + '='.repeat(70));
    console.log('📊 VERIFICATION');
    console.log('='.repeat(70));

    if (verifyResult.rows.length > 0) {
      const user = verifyResult.rows[0];
      console.log('✅ Development user verified in database');
      console.log('   ID:', user.id);
      console.log('   Email:', user.email);
      console.log('   Name:', user.full_name);
      console.log('   Status:', user.status);
      console.log('   Tenant ID:', user.tenant_id || 'Not linked');
      console.log('   Role:', user.role || 'N/A');
      console.log('\n✅ Audit trail can now reference this user without FK errors');
    } else {
      console.log('❌ User verification failed');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    client.release();
    await pool.end();
  }
}

createDevUser();
