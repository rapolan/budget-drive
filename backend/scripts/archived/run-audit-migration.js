const fs = require('fs');
const path = require('path');
const { query } = require('./src/config/database');

async function runMigration() {
  try {
    console.log('🔄 Running audit trail migration...');

    const migrationPath = path.join(__dirname, 'database', 'migrations', '030_audit_trail.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    await query(sql);

    console.log('✅ Audit trail migration completed successfully!');
    console.log('📊 Added created_by and updated_by columns to:');
    console.log('   - students');
    console.log('   - lessons');
    console.log('   - instructors');
    console.log('   - payments');
    console.log('   - vehicles');

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
