import { Routes, Route, Navigate } from "react-router-dom";
import { Login } from "./pages/Login";
import { ForgotPassword } from "./pages/ForgotPassword";
import { SetPassword } from "./pages/SetPassword";
import { Dashboard } from "./pages/Dashboard";
import { ManageUsers } from "./pages/ManageUsers";
import { Settings } from "./pages/Settings";
import { RoleDefaultPermissions } from "./pages/RoleDefaultPermissions";
import { CreateRole } from "./pages/CreateRole";
import { ManageProducts } from "./pages/ManageProducts";
import { AuthorizedPaymentMethods } from "./pages/AuthorizedPaymentMethods";
import { PolicyApplications } from "./pages/PolicyApplications";
import { Quotations } from "./pages/Quotations";
import { Approvals } from "./pages/Approvals";
import { MyClients } from "./pages/MyClients";
import { MyAgents } from "./pages/MyAgents";
import { Accounting } from "./pages/Accounting";
import { InLeaseBacklogs } from "./pages/InLeaseBacklogs";
import { AppLayout } from "./layouts/AppLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { RequirePermission } from "./components/RequirePermission";

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
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
              <PolicyApplications />
            </RequirePermission>
          }
        />
        <Route
          path="/quotation-tracker"
          element={
            <RequirePermission permission="QUOTATION_TRACKER">
              <Quotations />
            </RequirePermission>
          }
        />
        <Route
          path="/my-policies"
          element={
            <RequirePermission permission="VIEW_POLICIES">
              <MyClients />
            </RequirePermission>
          }
        />
        <Route
          path="/inlease-backlogs"
          element={
            <RequirePermission permission="MANAGE_INLEASE">
              <InLeaseBacklogs />
            </RequirePermission>
          }
        />
        <Route
          path="/approvals"
          element={
            <RequirePermission permission={["APPROVE_APPLICATION", "APPROVE_ENDORSEMENT"]}>
              <Approvals />
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
              <MyAgents />
            </RequirePermission>
          }
        />
        <Route
          path="/accounting"
          element={
            <RequirePermission permission="MANAGE_ACCOUNTING">
              <Accounting />
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
            <RequirePermission permission="MANAGE_SETTINGS.EDIT_ROLE_PERMISSIONS">
              <RoleDefaultPermissions />
            </RequirePermission>
          }
        />
        <Route
          path="/settings/create-role"
          element={
            <RequirePermission permission="MANAGE_SETTINGS.CREATE_ROLE">
              <CreateRole />
            </RequirePermission>
          }
        />
        <Route
          path="/settings/payment-methods"
          element={
            <RequirePermission permission="MANAGE_SETTINGS.MANAGE_PAYMENT_METHODS">
              <AuthorizedPaymentMethods />
            </RequirePermission>
          }
        />
        <Route
          path="/settings/manage-products"
          element={
            <RequirePermission permission="MANAGE_SETTINGS.MANAGE_PRODUCTS">
              <ManageProducts />
            </RequirePermission>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
