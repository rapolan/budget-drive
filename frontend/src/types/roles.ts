// Canonical role enum, matching the backend's UserRole
// (backend/src/types/index.ts) exactly. Previously inlined as a bare
// string literal on UserTenantMembership.role and left as `string` on
// CurrentUser.role - centralized here so every future role check
// (RequireRole, Sidebar's nav filtering, a controller's ownership check)
// references one shared type instead of re-typing the literal union.
export type UserRole = 'owner' | 'admin' | 'instructor' | 'staff' | 'viewer';
