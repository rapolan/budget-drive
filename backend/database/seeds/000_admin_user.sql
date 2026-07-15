-- 1. Insert Admin User (Password: AdminPassword123!)
INSERT INTO users (
    id,
    email,
    password_hash,
    full_name,
    email_verified,
    status
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'admin@budgetdrivingschool.com',
    '$2b$10$C7mI901Jf/ONCG0ee7/zY.LWjN4FwzslAEF9TKKqynPjLBUAv2zt6',
    'System Admin',
    TRUE,
    'active'
);
