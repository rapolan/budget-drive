import { query } from '../config/database';

async function checkDuplicates() {
  console.log('🔍 Checking for duplicate availability entries...\n');

  try {
    const result = await query(`
      SELECT
        instructor_id,
        day_of_week,
        start_time,
        end_time,
        is_active,
        COUNT(*) as count,
        STRING_AGG(id::text, ', ') as ids,
        MIN(created_at) as first_created,
        MAX(created_at) as last_created
      FROM instructor_availability
      GROUP BY instructor_id, day_of_week, start_time, end_time, is_active
      HAVING COUNT(*) > 1
      ORDER BY instructor_id, day_of_week, start_time
    `);

    console.log('✅ Database connected successfully\n');

    if (result.rows.length === 0) {
      console.log('✅ No duplicates found!\n');
    } else {
      console.log(`⚠️  Found ${result.rows.length} duplicate groups:\n`);

      result.rows.forEach((row: any, index: number) => {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        console.log(`${index + 1}. Instructor ${row.instructor_id}`);
        console.log(`   Day: ${days[row.day_of_week]}`);
        console.log(`   Time: ${row.start_time} - ${row.end_time}`);
        console.log(`   Active: ${row.is_active}`);
        console.log(`   Count: ${row.count} duplicates`);
        console.log(`   IDs: ${row.ids}`);
        console.log(`   First created: ${row.first_created}`);
        console.log(`   Last created: ${row.last_created}\n`);
      });

      // Show all availability for first instructor
      const firstInstructor = result.rows[0].instructor_id;
      const allSlots = await query(`
        SELECT id, day_of_week, start_time, end_time, is_active, created_at, notes
        FROM instructor_availability
        WHERE instructor_id = $1
        ORDER BY day_of_week, start_time, created_at
      `, [firstInstructor]);

      console.log(`\n📋 All availability slots for instructor ${firstInstructor}:`);
      allSlots.rows.forEach((slot: any) => {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        console.log(`  - ${slot.id.substring(0, 8)}: ${days[slot.day_of_week]} ${slot.start_time}-${slot.end_time} [${slot.is_active ? 'Active' : 'Inactive'}] ${slot.notes || ''} (${new Date(slot.created_at).toLocaleString()})`);
      });
    }

    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkDuplicates();
