import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Login from "./components/pages/Login/Login";
import Signup from "./components/pages/Login/Signup";
import ForgotPassword from "./components/pages/Login/ForgotPassword";
import ResetPassword from "./components/pages/Login/ResetPassword";
import PublicRoute from "./routes/PublicRoute";

import MainPage from "./components/pages/Main/MainPage";
import ProtectedRoute from "./routes/ProtectedRoute";

import MyOrganization from "./components/pages/organization/MyOrganization";
import WorkspaceList from "./components/pages/organization/WorkspaceList";
import AddResearchObjective from "./components/pages/organization/Workspace/ResearchObjective/AddResearchObjective";
import EditResearchObjective from "./components/pages/organization/Workspace/ResearchObjective/EditResearchObjective";
import ExplorationList from "./components/pages/organization/Workspace/Exploration/ExplorationList";
import CreateExploration from "./components/pages/organization/Workspace/Exploration/CreateExploration";

import AddWorkspace from "./components/pages/organization/Workspace/AddWorkspace";
import EditWorkspace from "./components/pages/organization/Workspace/EditWorkspace";
import ManageUsers from "./components/pages/organization/Workspace/ManageUsers";
import WorkspaceForm from "./components/pages/organization/Workspace/WorkspaceForm"

import PersonaBuilder from "./components/pages/organization/Workspace/ResearchObjective/Persona/personaBuilder/PersonaBuilder";
import ApproachSelectionPage from "./components/pages/organization/Workspace/ResearchObjective/Persona/personaBuilder/components/ApproachSelectionPage";
import PersonaBuilderManual from "./components/pages/organization/Workspace/ResearchObjective/Persona/personaBuilder/PersonaBuilderManual/PersonaBuilderManual";
import PersonaGenerationLoader from "./components/pages/organization/Workspace/ResearchObjective/PersonaGenerationLoader";
import AddPersona from "./components/pages/organization/Workspace/ResearchObjective/Persona/AddPersona";
import PersonaPreview from "./components/pages/organization/Workspace/ResearchObjective/Persona/PersonaPreview";
import { ThemeProvider } from "./context/ThemeContext";
import ResearchObjectiveLayout from "./components/pages/organization/Workspace/ResearchObjective/ResearchObjectiveLayout";
import DepthInterview from "./components/pages/organization/Workspace/ResearchObjective/DepthInterview/DepthInterview";
import ChatView from "./components/pages/organization/Workspace/ResearchObjective/DepthInterview/ChatView";
import InsightGeneration from './components/pages/organization/Workspace/ResearchObjective/DepthInterview/components/InsightGeneration';
import PopulationBuilder from "./components/pages/organization/Workspace/ResearchObjective/PopulationBuilder/PopulationBuilder";
import Questionnaire from "./components/pages/organization/Workspace/ResearchObjective/Questionnaire/Questionnaire"
import SurveyResults from "./components/pages/organization/Workspace/ResearchObjective/SurveyResults/SurveyResults"
import RebuttalMode from "./components/pages/organization/Workspace/ResearchObjective/RebuttalMode/RebuttalMode"
import Traceability from "./components/pages/Traceability/Traceability";
import { useDispatch } from 'react-redux';
import { useEffect, useState } from 'react';
import { setCredentials } from './redux/slices/authSlice';
import { setAuthToken } from './utils/axiosConfig';
import { buildAuthUser } from './utils/authRouting';
import Settings from "./components/pages/settings/Settings";


import LandingPage from "./components/pages/LandingPage/LandingPage";
import AdminLayout from "./components/pages/Admin/AdminLayout";
import AdminDashboard from "./components/pages/Admin/AdminDashboard";
import AdminUserList from "./components/pages/Admin/AdminUserList";
import AdminUserProvision from "./components/pages/Admin/AdminUserProvision";
import AdminUserDetail from "./components/pages/Admin/AdminUserDetail";
// import ChangePassword from "./components/pages/ChangePassword/ChangePassword";
import Upgrade from "./components/pages/Upgrade/Upgrade";
import EnterpriseOrgsPage from "./components/pages/Admin/EnterpriseOrgsPage";
import EnterpriseOrgDetail from "./components/pages/Admin/EnterpriseOrgDetail";
import AcceptInvitation from "./components/pages/Invitation/AcceptInvitation";
import SpIconProvider from './components/SPIconProvider';
import ApproachSelectionModal from "./components/pages/organization/Workspace/ResearchObjective/Persona/personaBuilder/components/ApproachSelectionPage";

const queryClient = new QueryClient();

function getWebsiteHandoffPayload() {
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : "";

  if (!hash) {
    return null;
  }

  const params = new URLSearchParams(hash);
  const token = params.get("token");
  const userParam = params.get("user");
  const redirectPath = params.get("redirect");

  if (!token || !userParam) {
    return null;
  }

  try {
    const user = buildAuthUser(JSON.parse(userParam));
    return { token, user, redirectPath };
  } catch (error) {
    console.error("Failed to parse website handoff payload", error);
    return null;
  }
}

function App() {

  const dispatch = useDispatch();
  const [isBootstrapped, setIsBootstrapped] = useState(false);

  useEffect(() => {
    const handoffPayload = getWebsiteHandoffPayload();

    if (handoffPayload) {
      localStorage.setItem('token', handoffPayload.token);
      localStorage.setItem('user', JSON.stringify(handoffPayload.user));
      setAuthToken(handoffPayload.token);
      dispatch(setCredentials({ user: handoffPayload.user, token: handoffPayload.token }));
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
      if (
        handoffPayload.redirectPath &&
        `${window.location.pathname}${window.location.search}` !== handoffPayload.redirectPath
      ) {
        window.location.replace(handoffPayload.redirectPath);
      }
      setIsBootstrapped(true);
      return;
    }

    // Check auth state on app initialization
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    const user = userStr ? buildAuthUser(JSON.parse(userStr)) : null;

    if (token && user) {
      setAuthToken(token);
      dispatch(setCredentials({ user, token }));
    }
    setIsBootstrapped(true);
  }, [dispatch]);

  if (!isBootstrapped) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0f1115] text-gray-900 dark:text-white">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p>Loading workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SpIconProvider />
        <Router>
          <Routes>
            {/* PUBLIC ROUTES */}
            <Route
              path="/"
              element={
                <PublicRoute>
                  <Login />
                </PublicRoute>
              }
            />
            <Route
              path="/login"
              element={
                <PublicRoute>
                  <Login />
                </PublicRoute>
              }
            />
            <Route
              path="/signup"
              element={
                <PublicRoute>
                  <Signup />
                </PublicRoute>
              }
            />
            <Route
              path="/forgot-password"
              element={
                <PublicRoute>
                  <ForgotPassword />
                </PublicRoute>
              }
            />
            <Route
              path="/reset-password/:token"
              element={
                <PublicRoute>
                  <ResetPassword />
                </PublicRoute>
              }
            />
            <Route
              path="/accept-invitation"
              element={<AcceptInvitation />}
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={["super_admin"]}>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<AdminDashboard />} />
              <Route path="dashboard" element={<AdminDashboard />} />
              <Route path="users" element={<AdminUserList />} />
              <Route path="users/provision" element={<AdminUserProvision />} />
              <Route path="users/:userId/detail" element={<AdminUserDetail />} />
              <Route path="enterprise" element={<EnterpriseOrgsPage />} />
              <Route path="enterprise/:orgId" element={<EnterpriseOrgDetail />} />
            </Route>

            {/* PROTECTED ROUTES */}
            {/* <Route
              path="/change-password"
              element={
                <ProtectedRoute>
                  <ChangePassword />
                </ProtectedRoute>
              }
            /> */}
            <Route
              path="/upgrade"
              element={
                <ProtectedRoute>
                  <Upgrade />
                </ProtectedRoute>
              }
            />

            <Route
              path="/main"
              element={
                <ProtectedRoute>
                  <MainPage />
                </ProtectedRoute>
              }
            >

              <Route path="organization" element={<MyOrganization />} />

              {/* STANDALONE EXPLORATION LIST ROUTE */}
              <Route path="organization/workspace/explorations/:workspaceId" element={<ExplorationList />} />
              <Route path="organization/workspace/explorations/:workspaceId/create" element={<CreateExploration />} />
              <Route path="/main/organization/workspace/explorations/:workspaceId/:explorationId/edit"
                element={<CreateExploration />} />

              {/* RESEARCH OBJECTIVE WIZARD ROUTES (WITH LAYOUT) */}
              {/* ── ONLY CHANGE FROM ORIGINAL ──────────────────────────────────
                  :explorationId renamed to :objectiveId on research-mode and
                  persona-generating routes so all child routes use the same
                  param name. This fixes useStepProgress() receiving undefined
                  and the sidebar never showing completed steps.
                  The actual URL structure is identical — same ID, same paths.
              ──────────────────────────────────────────────────────────────── */}
              <Route path="organization/workspace/research-objectives/:workspaceId" element={<ResearchObjectiveLayout />}>
                <Route path=":objectiveId/research-mode" element={<AddResearchObjective />} />
                {/* <Route
                  path=":objectiveId/edit"
                  element={<EditResearchObjective />}
                /> */}
                <Route
                  path=":objectiveId/persona-generating"
                  element={<PersonaGenerationLoader />}
                />
                <Route
                  path=":objectiveId/persona/add"
                  element={<AddPersona />}
                />
                <Route
                  path=":objectiveId/persona-builder"
                  element={<PersonaBuilder />}
                />
                <Route
                  path=":objectiveId/approach-selection"
                  element={<ApproachSelectionPage />}
                />

                <Route
                  path=":objectiveId/persona-builder/manual"
                  element={<PersonaBuilderManual />}
                />
                <Route
                  path=":objectiveId/persona-preview/:personaId"
                  element={<PersonaPreview />}
                />
                <Route
                  path=":objectiveId/depth-interview"
                  element={<DepthInterview />}
                />
                <Route
                  path=":objectiveId/chatview"
                  element={<ChatView />}
                />
                <Route
                  path=":objectiveId/population-builder"
                  element={<PopulationBuilder />}
                />
                 <Route 
                  path=":objectiveId/insights"
                  element={<InsightGeneration />} />
                <Route
                  path=":objectiveId/questionnaire"
                  element={<Questionnaire />}
                />
                <Route
                  path=":objectiveId/survey-results"
                  element={<SurveyResults />}
                />
                <Route
                  path=":objectiveId/rebuttal-mode"
                  element={<RebuttalMode />}
                />
              </Route>
              <Route path="organization/workspace" element={<WorkspaceList />} />
              <Route path="organization/workspace/add" element={<WorkspaceForm />} />
              <Route path="organization/workspace/edit/:id" element={<WorkspaceForm />} />
              <Route path="organization/workspace/manage/:id" element={<ManageUsers />} />
              <Route path="settings" element={<Settings />} />
              <Route path="traceability" element={<Traceability />} />
              <Route path="traceability/:workspaceId/:explorationId" element={<Traceability />} />
              <Route path="landing" element={<LandingPage />} />

            </Route>
          </Routes>
        </Router>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;