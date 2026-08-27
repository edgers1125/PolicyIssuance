import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function RequirePermission({ permission, children }) {
  const { permissions } = useAuth();

  // Still loading — render nothing rather than bouncing the user before we know.
  if (permissions === null) {
    return null;
  }

  if (permission && !permissions.includes(permission)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
