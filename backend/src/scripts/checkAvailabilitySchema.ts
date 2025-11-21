import { query } from '../config/database';

(async () => {
  const res = await query(
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_name = 'instructor_availability'
     ORDER BY ordinal_position`
  );
  console.log('\n📋 instructor_availability table columns:');
  res.rows.forEach((col: any) => {
    console.log(`   - ${col.column_name} (${col.data_type}) ${col.is_nullable === 'NO' ? 'NOT NULL' : ''}`);
  });
  process.exit(0);
})();
