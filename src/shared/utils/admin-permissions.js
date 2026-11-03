export const ALL_ADMIN_PERMISSIONS = [
  'patients.view',
  'assessments.review',
  'care-plans.edit',
  'progress.review',
  'documents.view',
  'documents.upload',
  'documents.share',
  'patients.export',
  'patients.lookup',
  'hair-tests.view',
  'hair-tests.upload',
  'hair-tests.submit',
  'reports.approve',
  'reports.share',
  'content.edit',
  'media.upload',
  'content.publish',
  'notifications.manage',
  'products.manage',
  'orders.manage',
  'promotions.manage',
  'commerce.export',
  'bookings.manage',
  'admins.manage',
  'audit.view',
];

export const ROLE_TEMPLATES = {
  'clinical-admin': {
    label: 'Clinical Admin',
    permissions: [
      'patients.view',
      'assessments.review',
      'progress.review',
      'documents.view',
      'documents.upload',
      'hair-tests.view',
    ],
  },
  'operations-admin': {
    label: 'Operations Admin',
    permissions: [
      'products.manage',
      'orders.manage',
      'promotions.manage',
      'bookings.manage',
    ],
  },
  'content-admin': {
    label: 'Content & Media Editor',
    permissions: ['content.edit', 'media.upload'],
  },
  'hair-test-operator': {
    label: 'Hair Test Operator',
    permissions: [
      'patients.lookup',
      'hair-tests.view',
      'hair-tests.upload',
      'hair-tests.submit',
    ],
  },
  'custom-admin': {
    label: 'Custom Admin',
    permissions: ['patients.view'],
  },
};

export function getEffectivePermissions(account) {
  if (!account) return [];
  if (account.role === 'super_admin') {
    return [...ALL_ADMIN_PERMISSIONS];
  }

  const templateKey = account.roleTemplate || 'clinical-admin';
  const basePermissions = ROLE_TEMPLATES[templateKey]?.permissions || ['patients.view'];
  const permissionsSet = new Set(basePermissions);

  if (Array.isArray(account.permissions)) {
    for (const p of account.permissions) {
      permissionsSet.add(p);
    }
  }

  const overrides = account.permissionOverrides instanceof Map
    ? Object.fromEntries(account.permissionOverrides)
    : account.permissionOverrides || {};

  for (const [perm, override] of Object.entries(overrides)) {
    if (override === 'allow') {
      permissionsSet.add(perm);
    } else if (override === 'deny') {
      permissionsSet.delete(perm);
    }
  }

  return Array.from(permissionsSet);
}

export function hasPermission(account, permission) {
  if (!account) return false;
  if (account.role === 'super_admin') return true;
  const effective = getEffectivePermissions(account);
  return effective.includes(permission);
}

