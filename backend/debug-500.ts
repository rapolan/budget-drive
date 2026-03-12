
import { query } from './src/config/database';
import bcrypt from 'bcrypt';
import { generateToken } from './src/utils/jwt';

async function debugLogin() {
    const email = 'admin@budgetdrivingschool.com';
    const password = 'AdminPassword123!';

    console.log('1. Checking user...');
    const userResult = await query(
        `SELECT id, email, password_hash, full_name, email_verified
     FROM users
     WHERE email = $1`,
        [email]
    );

    if (userResult.rows.length === 0) {
        console.error('User not found');
        return;
    }
    const user = userResult.rows[0];
    console.log('User found:', user.email);

    console.log('2. Verifying password...');
    const isValid = await bcrypt.compare(password, user.password_hash);
    console.log('Password valid:', isValid);

    console.log('3. Checking tenant membership...');
    const membershipResult = await query(
        `SELECT utm.tenant_id, utm.role, utm.status, t.name as tenant_name
     FROM user_tenant_memberships utm
     JOIN tenants t ON t.id = utm.tenant_id
     WHERE utm.user_id = $1 AND utm.status = 'active'
     ORDER BY utm.created_at ASC
     LIMIT 1`,
        [user.id]
    );

    if (membershipResult.rows.length === 0) {
        console.error('No active membership');
        return;
    }
    const membership = membershipResult.rows[0];
    console.log('Membership found:', membership.tenant_name, 'Role:', membership.role);

    console.log('4. Generating token...');
    try {
        const token = generateToken({
            userId: user.id,
            tenantId: membership.tenant_id,
            email: user.email,
            role: membership.role
        });
        console.log('Token generated successfully');
    } catch (err) {
        console.error('Token generation failed:', err);
    }

    process.exit(0);
}

debugLogin();
