import { query } from './src/config/database';
import bcrypt from 'bcrypt';

async function test() {
    try {
        console.log('--- Database Check ---');
        const users = await query('SELECT id, email, password_hash, status FROM users');
        console.log('Users found:', users.rows.length);
        users.rows.forEach((u: any) => {
            console.log(`- ${u.email} (Status: ${u.status})`);
        });

        const email = 'admin@budgetdrivingschool.com';
        const pass = 'AdminPassword123!';

        const user = users.rows.find((u: any) => u.email === email);
        if (user) {
            const match = await bcrypt.compare(pass, user.password_hash);
            console.log(`\n--- Login Simulation for ${email} ---`);
            console.log('User found in DB: YES');
            console.log('Password match:', match);

            const memberships = await query('SELECT * FROM user_tenant_memberships WHERE user_id = $1', [user.id]);
            console.log('Memberships found:', memberships.rows.length);
            memberships.rows.forEach((m: any) => {
                console.log(`- Tenant: ${m.tenant_id}, Role: ${m.role}, Status: ${m.status}`);
            });
        } else {
            console.log(`\nUser ${email} not found!`);
        }
    } catch (err) {
        console.error('Test failed:', err);
    } finally {
        process.exit();
    }
}

test();
