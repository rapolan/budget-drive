/**
 * Check Instructors Table Schema
 * Run with: npx ts-node src/scripts/checkInstructorsSchema.ts
 */

import { query } from '../config/database';

async function checkSchema() {
  console.log('🔍 Checking instructors table schema...\n');

  try {
    // Get table schema
    const result = await query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'instructors'
      ORDER BY ordinal_position;
    `);

    console.log('✅ Instructors table columns:');
    result.rows.forEach((col: any) => {
      console.log(`   - ${col.column_name} (${col.data_type}) ${col.is_nullable === 'NO' ? 'NOT NULL' : ''}`);
    });

    console.log('\n📋 Fetching sample instructor...');
    const instructor = await query(`SELECT * FROM instructors LIMIT 1`);

    if (instructor.rows.length > 0) {
      console.log('\n✅ Sample instructor data:');
      console.log(JSON.stringify(instructor.rows[0], null, 2));
    } else {
      console.log('\nℹ️  No instructors in database');
    }

    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkSchema();
