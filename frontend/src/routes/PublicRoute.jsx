// routes/PublicRoute.js
import { Navigate, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import { getPostLoginPath } from "../utils/authRouting";

const PublicRoute = ({ children }) => {
  const { isAuthenticated, user, loading } = useSelector((state) => state.auth);
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-center">
          <div className="spinner-border animate-spin inline-block w-8 h-8 border-4 rounded-full border-blue-600 border-t-transparent"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated && user) {
    const inviteToken = new URLSearchParams(location.search).get("invite_token");
    if (inviteToken) {
      if (user.must_change_password) {
        return <Navigate to={`/change-password?invite_token=${encodeURIComponent(inviteToken)}`} replace />;
      }
      return <Navigate to={`/accept-invitation?token=${encodeURIComponent(inviteToken)}`} replace />;
    }

    return <Navigate to={getPostLoginPath(user)} replace />;
  }

  return children;
};

export default PublicRoute;
