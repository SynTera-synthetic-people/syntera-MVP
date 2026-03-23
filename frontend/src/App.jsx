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
import AddPersona from "./components/pages/organization/Workspace/ResearchObjective/Persona/AddPersona";
import PersonaPreview from "./components/pages/organization/Workspace/ResearchObjective/Persona/PersonaPreview";
import { ThemeProvider } from "./context/ThemeContext";
import ResearchObjectiveLayout from "./components/pages/organization/Workspace/ResearchObjective/ResearchObjectiveLayout";
import DepthInterview from "./components/pages/organization/Workspace/ResearchObjective/DepthInterview/DepthInterview";
import ChatView from "./components/pages/organization/Workspace/ResearchObjective/DepthInterview/ChatView";
import PopulationBuilder from "./components/pages/organization/Workspace/ResearchObjective/PopulationBuilder/PopulationBuilder";
import Questionnaire from "./components/pages/organization/Workspace/ResearchObjective/Questionnaire/Questionnaire"
import SurveyResults from "./components/pages/organization/Workspace/ResearchObjective/SurveyResults/SurveyResults"
import RebuttalMode from "./components/pages/organization/Workspace/ResearchObjective/RebuttalMode/RebuttalMode"
import Traceability from "./components/pages/Traceability/Traceability";
import { useDispatch } from 'react-redux';
import { useEffect } from 'react';
import { setCredentials } from './redux/slices/authSlice';
import { setAuthToken } from './utils/axiosConfig';
import Settings from "./components/pages/settings/Settings";


import LandingPage from "./components/pages/LandingPage/LandingPage";
import AdminLayout from "./components/pages/Admin/AdminLayout";
import AdminDashboard from "./components/pages/Admin/AdminDashboard";
import AdminUserList from "./components/pages/Admin/AdminUserList";

const queryClient = new QueryClient();
function App() {

  const dispatch = useDispatch();

  useEffect(() => {
    // Check auth state on app initialization
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));

    if (token && user) {
      setAuthToken(token);
      dispatch(setCredentials({ user, token }));
    }
  }, [dispatch]);
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
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
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={["Super Admin", "super_admin"]}>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<AdminDashboard />} />
              <Route path="dashboard" element={<AdminDashboard />} />
              <Route path="users" element={<AdminUserList />} />
            </Route>

            {/* PROTECTED ROUTES */}
            <Route
              path="/landing"
              element={
                <ProtectedRoute>
                  <LandingPage />
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
              <Route path="organization/workspace/research-objectives/:workspaceId" element={<ResearchObjectiveLayout />}>
                <Route path=":explorationId/research-mode" element={<AddResearchObjective />} />
                {/* <Route
                  path=":objectiveId/edit"
                  element={<EditResearchObjective />}
                /> */}
                <Route
                  path=":objectiveId/persona/add"
                  element={<AddPersona />}
                />
                <Route
                  path=":objectiveId/persona-builder"
                  element={<PersonaBuilder />}
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

            </Route>
          </Routes>
        </Router>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
