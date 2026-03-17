export const isPlatformAdmin = (user) =>
  user?.role === "super_admin";

export const buildAuthUser = (data = {}) => ({
  user_id: data.user_id || data.id,
  full_name: data.full_name,
  email: data.email,
  role: data.role,
  organization_id: data.organization_id ?? null,
  org_id: data.organization_id ?? data.org_id ?? null,
  must_change_password: data.must_change_password ?? false,
  is_trial: data.is_trial ?? false,
  exploration_count: data.exploration_count ?? 0,
  trial_exploration_limit: data.trial_exploration_limit ?? 1,
  account_tier: data.account_tier ?? "free",
  landing_type: data.landing_type ?? "landing",
  preferred_workspace_id: data.preferred_workspace_id ?? null,
  default_workspace_id: data.default_workspace_id ?? null,
  has_accessible_workspaces: data.has_accessible_workspaces ?? false,
  can_create_workspace: data.can_create_workspace ?? false,
});

export const getPostLoginPath = (user) => {
  if (!user) {
    return "/login";
  }

  const pendingInvite = sessionStorage.getItem('pending_invite_token');

  if (user.must_change_password) {
    return pendingInvite
      ? `/change-password?invite_token=${pendingInvite}`
      : "/change-password";
  }

  if (pendingInvite) {
    sessionStorage.removeItem('pending_invite_token');
    return `/invitation/accept?token=${pendingInvite}`;
  }

  if (isPlatformAdmin(user)) {
    return "/admin/dashboard";
  }

  if (user.landing_type === "enterprise_setup") {
    return "/landing";
  }

  const workspaceId =
    user.preferred_workspace_id ||
    user.default_workspace_id;

  if (workspaceId) {
    return `/main/organization/workspace/explorations/${workspaceId}`;
  }

  return "/landing";
};
