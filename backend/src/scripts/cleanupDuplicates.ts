import { query } from '../config/database';

async function cleanupDuplicates() {
  console.log('🧹 Cleaning up duplicate availability entries...\n');

  try {
    // First, show what will be deleted
    const duplicatesQuery = await query(`
      WITH ranked_availability AS (
        SELECT
          id,
          instructor_id,
          day_of_week,
          start_time,
          end_time,
          is_active,
          created_at,
          ROW_NUMBER() OVER (
            PARTITION BY instructor_id, day_of_week, start_time, end_time, is_active
            ORDER BY created_at ASC
          ) as rn
        FROM instructor_availability
      )
      SELECT id, instructor_id, day_of_week, start_time, end_time, created_at
      FROM ranked_availability
      WHERE rn > 1
      ORDER BY instructor_id, day_of_week, start_time
    `);

    console.log(`Found ${duplicatesQuery.rows.length} duplicate entries to delete\n`);

    if (duplicatesQuery.rows.length === 0) {
      console.log('✅ No duplicates to clean up!');
      process.exit(0);
    }

    // Show summary by instructor
    const summary: { [key: string]: number } = {};
    duplicatesQuery.rows.forEach((row: any) => {
      summary[row.instructor_id] = (summary[row.instructor_id] || 0) + 1;
    });

    console.log('📊 Duplicates per instructor:');
    Object.entries(summary).forEach(([instructor, count]) => {
      console.log(`   ${instructor.substring(0, 8)}...: ${count} duplicates`);
    });
    console.log();

    // Delete duplicates, keeping the oldest entry for each unique combination
    const deleteResult = await query(`
      WITH ranked_availability AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY instructor_id, day_of_week, start_time, end_time, is_active
            ORDER BY created_at ASC
          ) as rn
        FROM instructor_availability
      )
      DELETE FROM instructor_availability
      WHERE id IN (
        SELECT id FROM ranked_availability WHERE rn > 1
      )
      RETURNING id
    `);

    console.log(`✅ Deleted ${deleteResult.rows.length} duplicate entries\n`);

    // Verify cleanup
    const remainingDuplicates = await query(`
      SELECT
        instructor_id,
        day_of_week,
        start_time,
        end_time,
        is_active,
        COUNT(*) as count
      FROM instructor_availability
      GROUP BY instructor_id, day_of_week, start_time, end_time, is_active
      HAVING COUNT(*) > 1
    `);

    if (remainingDuplicates.rows.length === 0) {
      console.log('✅ Cleanup successful! No duplicates remaining.');
    } else {
      console.log('⚠️  Warning: Still found', remainingDuplicates.rows.length, 'duplicate groups');
    }

    // Show final count
    const totalCount = await query('SELECT COUNT(*) as count FROM instructor_availability WHERE is_active = true');
    console.log(`\n📊 Final active availability count: ${totalCount.rows[0].count}`);

    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

cleanupDuplicates();
