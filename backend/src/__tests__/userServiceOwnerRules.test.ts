import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const TENANT_ID = 'tenant-abc';

describe('userService owner protection rules', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('only an owner can assign the owner role on create', async () => {
    const userService = await import('../services/userService');

    await expect(
      userService.createUserAndAddToTenant(
        TENANT_ID,
        { email: 'new@example.com' },
        'owner',
        'admin-caller',
        'admin' // caller is only an admin
      )
    ).rejects.toThrow(/only an owner/i);

    // No query should have been made - the check happens before any DB call
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('an owner can assign the owner role on create', async () => {
    const userService = await import('../services/userService');

    mockQuery.mockResolvedValueOnce(queryResult([])); // no existing user
    mockQuery.mockResolvedValueOnce(queryResult([{ id: 'new-user', email: 'new@example.com' }]));
    mockQuery.mockResolvedValueOnce(queryResult([])); // no existing membership
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: 'membership-x', user_id: 'new-user', tenant_id: TENANT_ID, role: 'owner', status: 'active' }])
    );

    const result = await userService.createUserAndAddToTenant(
      TENANT_ID,
      { email: 'new@example.com' },
      'owner',
      'owner-caller',
      'owner'
    );

    expect(result.role).toBe('owner');
  });

  it('a user cannot change their own role', async () => {
    const userService = await import('../services/userService');

    await expect(
      userService.updateUserMembership(
        'user-1',
        TENANT_ID,
        { role: 'admin' },
        'user-1', // caller is the same user being updated
        'owner'
      )
    ).rejects.toThrow(/cannot change your own role/i);
  });

  it('only an owner can change someone else into or out of the owner role', async () => {
    const userService = await import('../services/userService');

    // Target's current role is 'staff'; admin (non-owner) tries to promote to owner
    mockQuery.mockResolvedValueOnce(queryResult([{ role: 'staff' }]));

    await expect(
      userService.updateUserMembership(
        'user-2',
        TENANT_ID,
        { role: 'owner' },
        'admin-caller',
        'admin'
      )
    ).rejects.toThrow(/only an owner/i);
  });

  it('demoting the last active owner is blocked', async () => {
    const userService = await import('../services/userService');

    // Target's current role is 'owner'
    mockQuery.mockResolvedValueOnce(queryResult([{ role: 'owner' }]));
    // countActiveOwners (excluding the target) finds zero other active owners
    mockQuery.mockResolvedValueOnce(queryResult([{ count: '0' }]));

    await expect(
      userService.updateUserMembership(
        'owner-1',
        TENANT_ID,
        { role: 'admin' },
        'another-owner-caller',
        'owner'
      )
    ).rejects.toThrow(/last owner/i);
  });

  it('demoting an owner when another active owner exists succeeds', async () => {
    const userService = await import('../services/userService');

    mockQuery.mockResolvedValueOnce(queryResult([{ role: 'owner' }])); // target's current role
    mockQuery.mockResolvedValueOnce(queryResult([{ count: '1' }])); // one other active owner remains
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: 'membership-1', user_id: 'owner-1', tenant_id: TENANT_ID, role: 'admin', status: 'active' }])
    );

    const result = await userService.updateUserMembership(
      'owner-1',
      TENANT_ID,
      { role: 'admin' },
      'another-owner-caller',
      'owner'
    );

    expect(result.role).toBe('admin');
  });

  it('removing the last active owner is blocked, even when the caller is also an owner', async () => {
    const userService = await import('../services/userService');

    mockQuery.mockResolvedValueOnce(queryResult([{ role: 'owner' }])); // target's current role
    mockQuery.mockResolvedValueOnce(queryResult([{ count: '0' }])); // no other active owners

    await expect(userService.removeUserFromTenant('owner-1', TENANT_ID, 'owner')).rejects.toThrow(/last owner/i);
  });

  it('removing a non-owner is unaffected by the last-owner check', async () => {
    const userService = await import('../services/userService');

    mockQuery.mockResolvedValueOnce(queryResult([{ role: 'staff' }])); // target's current role
    mockQuery.mockResolvedValueOnce(queryResult([])); // DELETE result

    await expect(userService.removeUserFromTenant('staff-1', TENANT_ID, 'admin')).resolves.toBeUndefined();
  });

  it('an admin cannot remove an owner, even when another owner remains', async () => {
    const userService = await import('../services/userService');

    mockQuery.mockResolvedValueOnce(queryResult([{ role: 'owner' }])); // target's current role

    await expect(userService.removeUserFromTenant('owner-1', TENANT_ID, 'admin')).rejects.toThrow(/only an owner can remove/i);
    // The last-owner count check should never even run - the role check
    // short-circuits before it.
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('an owner CAN remove another owner as long as at least one owner remains', async () => {
    const userService = await import('../services/userService');

    mockQuery.mockResolvedValueOnce(queryResult([{ role: 'owner' }])); // target's current role
    mockQuery.mockResolvedValueOnce(queryResult([{ count: '1' }])); // one other active owner remains
    mockQuery.mockResolvedValueOnce(queryResult([])); // DELETE result

    await expect(userService.removeUserFromTenant('owner-1', TENANT_ID, 'owner')).resolves.toBeUndefined();
  });

  // Decision: an admin CAN change another admin's role (e.g. demote to
  // staff, or promote a staff member to admin) - the owner boundary is the
  // one that matters (see the tests above), not an admin-vs-admin
  // hierarchy. This deliberately mirrors "admin cannot create an owner"
  // above: the line is drawn at the owner role, never between two
  // non-owner roles.
  it('an admin CAN change another admin into staff (no owner role involved)', async () => {
    const userService = await import('../services/userService');

    mockQuery.mockResolvedValueOnce(queryResult([{ role: 'admin' }])); // target's current role
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: 'membership-2', user_id: 'admin-2', tenant_id: TENANT_ID, role: 'staff', status: 'active' }])
    );

    const result = await userService.updateUserMembership(
      'admin-2',
      TENANT_ID,
      { role: 'staff' },
      'admin-caller',
      'admin'
    );

    expect(result.role).toBe('staff');
  });

  it('an admin CAN promote a staff member into admin', async () => {
    const userService = await import('../services/userService');

    mockQuery.mockResolvedValueOnce(queryResult([{ role: 'staff' }])); // target's current role
    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: 'membership-3', user_id: 'staff-1', tenant_id: TENANT_ID, role: 'admin', status: 'active' }])
    );

    const result = await userService.updateUserMembership(
      'staff-1',
      TENANT_ID,
      { role: 'admin' },
      'admin-caller',
      'admin'
    );

    expect(result.role).toBe('admin');
  });
});
