# API Integration Checklist

## Phase 1: Setup ✅
- [x] Create comprehensive API utility file (`src/utils/api.js`)
- [x] Create custom hook for API calls (`src/hooks/useApi.js`)
- [x] Create API configuration file (`src/config/apiConfig.js`)
- [x] Create environment variables template (`.env.example`)
- [x] Create API integration guide (`API_INTEGRATION_GUIDE.md`)

## Phase 2: Authentication Pages (NEXT)
- [ ] Connect Login page to API
  - [ ] Call `loginUser()` API
  - [ ] Store token in localStorage
  - [ ] Call `setAuthToken()` to set auth header
  - [ ] Dispatch user to Redux store
  - [ ] Navigate to `/main/organization`
  
- [ ] Connect Signup page to API
  - [ ] Call `signupUser()` API
  - [ ] Handle validation errors
  - [ ] Store token and user
  - [ ] Navigate to main dashboard
  
- [ ] Connect Forgot Password page to API
  - [ ] Call `sendResetEmail()` API
  - [ ] Show success/error messages
  
- [ ] Connect Reset Password page to API
  - [ ] Extract token from URL
  - [ ] Call `resetPassword()` API
  - [ ] Navigate to login on success

## Phase 3: Organization Pages
- [ ] Connect MyOrganization page
  - [ ] Call `getOrganization()` on mount
  - [ ] Display organization details
  - [ ] Implement member management (add/remove)
  
- [ ] Create organization members modal/page
  - [ ] Call `getOrganizationMembers()`
  - [ ] Call `addOrganizationMember()`
  - [ ] Call `removeOrganizationMember()`

## Phase 4: Workspace Management
- [ ] Connect WorkspaceList page
  - [ ] Call `getWorkspaces()` on mount
  - [ ] Display workspace cards
  - [ ] Add loading states
  - [ ] Add error handling
  
- [ ] Connect AddWorkspace page
  - [ ] Call `createWorkspace()` on submit
  - [ ] Validate form data
  - [ ] Show success/error messages
  - [ ] Redirect to workspace list
  
- [ ] Connect EditWorkspace page
  - [ ] Call `getWorkspace()` on mount
  - [ ] Pre-fill form with current data
  - [ ] Call `updateWorkspace()` on submit
  - [ ] Redirect to workspace list
  
- [ ] Connect ManageUsers page
  - [ ] Call `getWorkspaceUsers()`
  - [ ] Call `addWorkspaceUser()`
  - [ ] Call `removeWorkspaceUser()`
  - [ ] Show member roles

## Phase 5: Research Objectives
- [ ] Connect ResearchObjectives list page
  - [ ] Call `getResearchObjectives()` on mount
  - [ ] Display objective cards
  - [ ] Implement delete functionality
  
- [ ] Connect AddResearchObjective page
  - [ ] Call `createResearchObjective()` on submit
  - [ ] Handle form validation
  - [ ] Show success/error messages
  
- [ ] Connect EditResearchObjective page
  - [ ] Call `getResearchObjective()` on mount
  - [ ] Pre-fill form
  - [ ] Call `updateResearchObjective()` on submit

## Phase 6: Personas & Demographics
- [ ] Create Personas management page
  - [ ] Call `getPersonas()` to list
  - [ ] Call `createPersona()` for new
  - [ ] Call `updatePersona()` for edit
  - [ ] Call `deletePersona()` for delete
  
- [ ] Create Demographics editor
  - [ ] Call `getDemographics()` on load
  - [ ] Call `updateDemographics()` on save
  - [ ] Show demographic fields (age, gender, income, etc.)
  
- [ ] Create Traits editor
  - [ ] Call `getPsychographicTraits()` and `getBehavioralTraits()`
  - [ ] Call update functions on save
  - [ ] Show sliders for trait values

## Phase 7: Questionnaire & Survey
- [ ] Create Questionnaire builder
  - [ ] Call `getQuestionnaires()` to list
  - [ ] Call `createQuestionnaire()` for new
  - [ ] Call `updateQuestionnaire()` for edit
  - [ ] Call `deleteQuestionnaire()` for delete
  - [ ] Implement question editor
  
- [ ] Create Survey Results viewer
  - [ ] Call `getSurveyResults()` to list
  - [ ] Call `getSurveyResult()` for details
  - [ ] Show survey responses
  - [ ] Implement result analytics

## Phase 8: File Upload
- [ ] Implement file upload component
  - [ ] Create file input handler
  - [ ] Call `uploadFile()` API
  - [ ] Show upload progress
  - [ ] Display uploaded file

## Phase 9: Error Handling & Loading States
- [ ] Add loading spinners to all pages
- [ ] Implement error toasts/notifications
- [ ] Add retry logic for failed requests
- [ ] Implement timeout handling
- [ ] Add network error handling

## Phase 10: Testing & Optimization
- [ ] Test all API endpoints
- [ ] Verify token refresh logic
- [ ] Test error scenarios
- [ ] Optimize API calls (caching, pagination)
- [ ] Add request interceptors for logging

## Integration Tips

### Using the useApi Hook
```javascript
import useApi from "../hooks/useApi";
import { getWorkspaces } from "../utils/api";

function MyComponent() {
  const orgId = "123"; // from params/context
  const { data, loading, error, execute } = useApi(getWorkspaces);
  
  useEffect(() => {
    execute(orgId);
  }, [orgId]);
  
  return (
    <>
      {loading && <LoadingSpinner />}
      {error && <ErrorMessage error={error} />}
      {data && <List items={data} />}
    </>
  );
}
```

### Manual API Call with Error Handling
```javascript
import { createWorkspace, handleApiError } from "../utils/api";

async function handleCreate(formData) {
  try {
    const response = await createWorkspace(orgId, formData);
    // Success - update state or navigate
    navigate("/success");
  } catch (error) {
    const { message, status } = handleApiError(error);
    // Show error to user
    setError(message);
  }
}
```

### Setting Auth Token on App Load
```javascript
// src/App.jsx
useEffect(() => {
  const token = localStorage.getItem("authToken");
  if (token) {
    setAuthToken(token);
  }
}, []);
```

## Files Created/Modified

1. ✅ `src/utils/api.js` - All API endpoints
2. ✅ `src/hooks/useApi.js` - Custom API hook
3. ✅ `src/config/apiConfig.js` - Configuration
4. ✅ `.env.example` - Environment template
5. ✅ `API_INTEGRATION_GUIDE.md` - Complete API reference
6. ✅ `API_INTEGRATION_CHECKLIST.md` - This file

## Next Immediate Steps

1. Create `.env` file from `.env.example`
2. Update `src/utils/api.js` to use config
3. Connect Login page to API
4. Connect Signup page to API
5. Test authentication flow
6. Then proceed with other pages...

Good luck with the integration! 🚀
