import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { TbArrowRight, TbCheck, TbMail, TbX } from "react-icons/tb";

import { setCredentials, logout } from "../../../redux/slices/authSlice";
import { authService } from "../../../services/authService";
import { workspaceService } from "../../../services/workspaceService";
import { buildAuthUser } from "../../../utils/authRouting";
import { setAuthToken } from "../../../utils/axiosConfig";

export default function AcceptInvitation() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get("token");

  const { isAuthenticated, user, token: authToken } = useSelector((state) => state.auth);

  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accepting, setAccepting] = useState(false);
  const autoHandledRef = useRef(false);

  useEffect(() => {
    if (!inviteToken) {
      setError("Invitation token is missing.");
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadInvite = async () => {
      try {
        const response = await workspaceService.getInviteDetails(inviteToken);
        if (!cancelled) {
          setInvite(response.data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "Failed to load invitation.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadInvite();
    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

  useEffect(() => {
    if (
      !isAuthenticated ||
      !invite ||
      !inviteToken ||
      autoHandledRef.current
    ) {
      return;
    }

    if (invite.expired) {
      return;
    }

    if (user?.email?.toLowerCase() !== invite.email?.toLowerCase()) {
      setError(`This invite is for ${invite.email}. Sign in with that email to continue.`);
      return;
    }

    autoHandledRef.current = true;

    const accept = async () => {
      setAccepting(true);
      setError("");

      try {
        if (!invite.accepted) {
          await workspaceService.acceptInvitation(inviteToken);
        }

        const meResponse = await authService.fetchMe();
        const updatedUser = buildAuthUser(meResponse?.data || {});
        localStorage.setItem("user", JSON.stringify(updatedUser));
        dispatch(setCredentials({ user: updatedUser, token: authToken }));

        navigate(
          `/main/organization/workspace/explorations/${invite.workspace_id}`,
          { replace: true },
        );
      } catch (err) {
        autoHandledRef.current = false;
        setError(err?.message || "Failed to accept invitation.");
      } finally {
        setAccepting(false);
      }
    };

    accept();
  }, [authToken, dispatch, invite, inviteToken, isAuthenticated, navigate, user]);

  const handleSwitchAccount = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setAuthToken(null);
    dispatch(logout());
    navigate(
      `/login?invite_token=${encodeURIComponent(inviteToken || "")}&email=${encodeURIComponent(invite?.email || "")}`,
      { replace: true },
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0f1115] text-gray-900 dark:text-white">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p>Loading invitation...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0f1115] px-4">
      <div className="w-full max-w-lg bg-white dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-2xl shadow-xl p-8 text-gray-900 dark:text-white">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300 flex items-center justify-center">
            <TbMail size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Workspace Invitation</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Join a team workspace on Synthetic People
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {invite && (
          <div className="mb-6 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-4 py-4">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Workspace</p>
            <p className="font-semibold">{invite.workspace_name}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">Invited email</p>
            <p className="font-medium">{invite.email}</p>
          </div>
        )}

        {accepting && (
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 px-4 py-3 text-sm text-blue-700 dark:text-blue-300">
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            Accepting invitation...
          </div>
        )}

        {!isAuthenticated && invite && !invite.expired && (
          <div className="space-y-3">
            <Link
              to={`/login?invite_token=${encodeURIComponent(inviteToken || "")}&email=${encodeURIComponent(invite.email || "")}`}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-3 transition-colors"
            >
              Sign In
              <TbArrowRight size={18} />
            </Link>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
              If this is your first invite, use the temporary password sent in the invitation email.
            </p>
          </div>
        )}

        {isAuthenticated && invite && !invite.expired && user?.email?.toLowerCase() !== invite.email?.toLowerCase() && (
          <button
            type="button"
            onClick={handleSwitchAccount}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-3 transition-colors"
          >
            Sign In With Correct Email
            <TbArrowRight size={18} />
          </button>
        )}

        {invite?.expired && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
            This invitation has expired.
          </div>
        )}

        {invite?.accepted && !accepting && !error && (
          <div className="rounded-xl border border-green-200 dark:border-green-500/30 bg-green-50 dark:bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-300 flex items-center gap-2">
            <TbCheck size={18} />
            Invitation already accepted.
          </div>
        )}
      </div>
    </div>
  );
}
