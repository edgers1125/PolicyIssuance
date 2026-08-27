import { Routes, Route, Navigate } from "react-router-dom";
import { Login } from "./pages/Login";
import { SetPassword } from "./pages/SetPassword";
import { Dashboard } from "./pages/Dashboard";
import { ManageUsers } from "./pages/ManageUsers";
import { Settings } from "./pages/Settings";
import { RoleDefaultPermissions } from "./pages/RoleDefaultPermissions";
import { CreateRole } from "./pages/CreateRole";
import { PolicyApplication } from "./pages/PolicyApplication";
import { AppLayout } from "./layouts/AppLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { RequirePermission } from "./components/RequirePermission";
import { PlaceholderPage } from "./components/PlaceholderPage";

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/set-password" element={<SetPassword />} />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route
          path="/policy-application"
          element={
            <RequirePermission permission="CREATE_APPLICATION">
              <PolicyApplication />
            </RequirePermission>
          }
        />
        <Route
          path="/my-policies"
          element={
            <RequirePermission permission="VIEW_POLICIES">
              <PlaceholderPage title="My Policies" />
            </RequirePermission>
          }
        />
        <Route
          path="/inlease-backlogs"
          element={
            <RequirePermission permission="MANAGE_INLEASE">
              <PlaceholderPage title="In-Lease Backlogs" />
            </RequirePermission>
          }
        />
        <Route
          path="/policy-approval"
          element={
            <RequirePermission permission="APPROVE_APPLICATION">
              <PlaceholderPage title="Policy Approval" />
            </RequirePermission>
          }
        />
        <Route
          path="/manage-users"
          element={
            <RequirePermission permission="MANAGE_USERS">
              <ManageUsers />
            </RequirePermission>
          }
        />
        <Route
          path="/my-agents"
          element={
            <RequirePermission permission="MANAGE_AGENTS">
              <PlaceholderPage title="My Agents" />
            </RequirePermission>
          }
        />
        <Route
          path="/settings"
          element={
            <RequirePermission permission="MANAGE_SETTINGS">
              <Settings />
            </RequirePermission>
          }
        />
        <Route
          path="/settings/role-permissions"
          element={
            <RequirePermission permission="EDIT_ROLE_PERMISSIONS">
              <RoleDefaultPermissions />
            </RequirePermission>
          }
        />
        <Route
          path="/settings/create-role"
          element={
            <RequirePermission permission="CREATE_ROLE">
              <CreateRole />
            </RequirePermission>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
