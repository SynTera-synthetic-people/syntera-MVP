// routes/PublicRoute.js
import { Navigate } from "react-router-dom";
import { useSelector } from "react-redux";

const PublicRoute = ({ children }) => {
  const { isAuthenticated, user, loading } = useSelector((state) => state.auth);

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
    const isSuperAdmin =
      user?.user_type === "Super Admin" ||
      user?.user_type === "super_admin" ||
      user?.role === "Super Admin" ||
      user?.role === "super_admin";

    if (isSuperAdmin) {
      return <Navigate to="/admin/dashboard" replace />;
    }
    // Redirect to landing if already authenticated
    return <Navigate to="/landing" replace />;
  }

  return children;
};

export default PublicRoute;