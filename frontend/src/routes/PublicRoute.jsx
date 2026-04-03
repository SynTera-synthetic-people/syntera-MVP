// routes/PublicRoute.jsx
import { Navigate, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import { useEffect, useState } from "react";
import { getPostLoginPath } from "../utils/authRouting";
import { explorationService } from "../services/explorationService";

const PublicRoute = ({ children }) => {
  const { isAuthenticated, user, loading } = useSelector((state) => state.auth);
  const location = useLocation();

  const [redirectTo, setRedirectTo] = useState(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const postLoginPath = getPostLoginPath(user);

    // If backend says go to landing (no workspace) → /main/landing
    if (postLoginPath === "/landing") {
      setRedirectTo("/main/landing");
      return;
    }

    // If backend says go to change-password, invitation etc → respect that directly
    if (!postLoginPath.includes("/explorations/")) {
      setRedirectTo(postLoginPath);
      return;
    }

    // Has a workspace — now check if they have any explorations
    // Extract workspaceId from the path
    const workspaceId =
      user?.preferred_workspace_id ||
      user?.default_workspace_id;

    if (!workspaceId) {
      setRedirectTo("/main/landing");
      return;
    }

    const checkExplorations = async () => {
      setChecking(true);
      try {
        const expResponse = await explorationService.getAll(workspaceId);
        const explorations = Array.isArray(expResponse?.data)
          ? expResponse.data
          : Array.isArray(expResponse)
          ? expResponse
          : [];

        if (explorations.length > 0) {
          // Has explorations → go to exploration list
          setRedirectTo(`/main/organization/workspace/explorations/${workspaceId}`);
        } else {
          // Has workspace but no explorations → landing
          setRedirectTo("/main/landing");
        }
      } catch (err) {
        // If exploration fetch fails (e.g. 403 limit) but workspace exists
        // → still go to exploration list, user can see their existing explorations
        console.error("PublicRoute exploration check failed:", err);
        setRedirectTo(`/main/organization/workspace/explorations/${workspaceId}`);
      } finally {
        setChecking(false);
      }
    };

    checkExplorations();
  }, [isAuthenticated, user]);

  if (loading || checking) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-center">
          <div className="spinner-border animate-spin inline-block w-8 h-8 border-4 rounded-full border-blue-600 border-t-transparent"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (redirectTo) {
    return <Navigate to={redirectTo} replace />;
  }

  return children;
};

export default PublicRoute;