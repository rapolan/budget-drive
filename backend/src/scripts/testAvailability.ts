/**
 * Test Availability Endpoint
 * Run with: npx ts-node src/scripts/testAvailability.ts
 */

import { query } from '../config/database';

async function testAvailability() {
  console.log('🧪 Testing Availability System...\n');

  try {
    // Get first instructor
    const instructorsResult = await query(
      `SELECT id, full_name, tenant_id FROM instructors LIMIT 1`
    );

    if (instructorsResult.rows.length === 0) {
      console.log('❌ No instructors found in database');
      process.exit(1);
    }

    const instructor = instructorsResult.rows[0];
    console.log('✅ Found instructor:');
    console.log(`   ID: ${instructor.id}`);
    console.log(`   Name: ${instructor.full_name}`);
    console.log(`   Tenant ID: ${instructor.tenant_id}\n`);

    // Try to fetch availability
    console.log('📋 Fetching availability for instructor...');
    const availabilityResult = await query(
      `SELECT * FROM instructor_availability
       WHERE instructor_id = $1 AND tenant_id = $2 AND is_active = true
       ORDER BY day_of_week, start_time`,
      [instructor.id, instructor.tenant_id]
    );

    console.log(`✅ Query executed successfully!`);
    console.log(`   Found ${availabilityResult.rows.length} availability slots\n`);

    if (availabilityResult.rows.length > 0) {
      console.log('📅 Availability slots:');
      availabilityResult.rows.forEach((slot: any, index: number) => {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        console.log(`   ${index + 1}. ${days[slot.day_of_week]}: ${slot.start_time} - ${slot.end_time}`);
      });
    } else {
      console.log('ℹ️  No availability slots found. This is normal for a new instructor.');
      console.log('   Try adding availability through the UI or API.\n');

      // Try creating a test availability slot
      console.log('📝 Creating test availability slot...');
      await query(
        `INSERT INTO instructor_availability (tenant_id, instructor_id, day_of_week, start_time, end_time, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [instructor.tenant_id, instructor.id, 1, '09:00', '17:00', true]
      );

      console.log('✅ Test availability slot created successfully!');
      console.log(`   Monday: 09:00 - 17:00\n`);
    }

    console.log('✅ Availability system is working correctly!');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error testing availability:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

testAvailability();
