import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// `permission` is either a single code (every previous caller) or an array
// of codes, in which case holding ANY one of them is enough — e.g. the
// Approvals page (/approvals), whose two tabs (Policy Approval/Endorsement
// Approval) are each independently gated on their own permission, so the
// page itself has to admit a caller holding either one.
export function RequirePermission({ permission, children }) {
  const { permissions } = useAuth();

  // Still loading — render nothing rather than bouncing the user before we know.
  if (permissions === null) {
    return null;
  }

  const required = Array.isArray(permission) ? permission : permission ? [permission] : [];
  if (required.length > 0 && !required.some((p) => permissions.includes(p))) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
