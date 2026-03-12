
import axios from 'axios';

async function testFullLoginFlow() {
    const BASE_URL = 'http://localhost:4000/api/v1';

    try {
        console.log('1. Attempting login...');
        const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
            email: 'admin@budgetdrivingschool.com',
            password: 'AdminPassword123!'
        });

        console.log('   ✅ Login successful');
        const { token, tenantId } = loginResponse.data.data;
        console.log('   Token:', token.substring(0, 20) + '...');
        console.log('   Tenant ID:', tenantId);

        console.log('\n2. Attempting /auth/me...');
        const meResponse = await axios.get(`${BASE_URL}/auth/me`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-Tenant-ID': tenantId
            }
        });

        console.log('   ✅ /auth/me successful');
        console.log('   User:', meResponse.data.data.email);

    } catch (error: any) {
        console.error('\n❌ Error encountered:');
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('   Message:', error.message);
        }
    }
}

testFullLoginFlow();
