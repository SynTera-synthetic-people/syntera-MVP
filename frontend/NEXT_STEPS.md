# Next Steps - API Integration Implementation

## 🎯 Current Status
✅ API infrastructure complete
✅ 40+ endpoints organized and documented
✅ Error handling system set up
✅ Authentication token management ready
✅ Custom hook for easy integration
✅ Comprehensive examples provided

---

## 📋 Immediate Action Items

### 1. Create `.env` File
```bash
copy .env.example .env
```

Edit `.env` with your backend URL:
```
VITE_API_BASE_URL=http://127.0.0.1:8000/api
VITE_API_TIMEOUT=30000
VITE_ENABLE_DEBUG=true
```

### 2. Update `src/App.jsx` - Initialize Auth Token
Add this effect to App component to restore auth on page load:

```javascript
import { useEffect } from 'react';
import { setAuthToken } from './utils/api';

function App() {
  useEffect(() => {
    // Restore auth token on app load
    const token = localStorage.getItem("authToken");
    if (token) {
      setAuthToken(token);
    }
  }, []);

  return (
    // existing router setup
  );
}
```

### 3. Test Login Flow First
1. Start your backend server
2. Run frontend: `npm run dev`
3. Test login with valid credentials
4. Verify token is saved to localStorage
5. Check that redirect to `/main/organization` works

---

## 📂 Files Created for API Integration

| File | Purpose |
|------|---------|
| `src/utils/api.js` | 40+ API endpoint functions |
| `src/hooks/useApi.js` | Custom hook for API calls |
| `src/config/apiConfig.js` | Configuration management |
| `.env.example` | Environment template |
| `API_INTEGRATION_GUIDE.md` | Complete API reference |
| `API_INTEGRATION_CHECKLIST.md` | Integration tasks |
| `API_INTEGRATION_SETUP.md` | Quick start guide |
| `API_INTEGRATION_EXAMPLES.js` | Code examples |

---

## 🚀 Integration Roadmap

### Phase 1: Authentication (HIGH PRIORITY)
**Goal:** Validate backend connectivity and auth flow

- [ ] Login page
  - [ ] Call `loginUser()` API
  - [ ] Store token + user
  - [ ] Navigate to dashboard
  - [ ] Test logout

- [ ] Signup page
  - [ ] Call `signupUser()` API
  - [ ] Auto-login after signup
  - [ ] Navigate to dashboard

- [ ] Forgot/Reset password
  - [ ] Call `sendResetEmail()` API
  - [ ] Call `resetPassword()` API
  - [ ] Show success/error messages

**Estimated time:** 2-3 hours

---

### Phase 2: Organization Management
**Goal:** Core organizational structure

- [ ] MyOrganization page
  - [ ] Fetch with `getOrganization()`
  - [ ] Show org details
  - [ ] Display members list

- [ ] Member management
  - [ ] Fetch with `getOrganizationMembers()`
  - [ ] Add member with `addOrganizationMember()`
  - [ ] Remove member with `removeOrganizationMember()`

**Estimated time:** 4-5 hours

---

### Phase 3: Workspace Management
**Goal:** Main feature - workspace CRUD

- [ ] WorkspaceList page
  - [ ] Fetch with `getWorkspaces(orgId)`
  - [ ] Display workspace cards
  - [ ] Show loading/error states
  - [ ] Add pagination if needed

- [ ] AddWorkspace page
  - [ ] Call `createWorkspace()` API
  - [ ] Validate form before submit
  - [ ] Show success/error feedback
  - [ ] Redirect to list

- [ ] EditWorkspace page
  - [ ] Fetch with `getWorkspace()`
  - [ ] Pre-fill form
  - [ ] Call `updateWorkspace()` on save
  - [ ] Show changes confirmation

- [ ] ManageUsers page (workspace level)
  - [ ] Show workspace members
  - [ ] Add/remove users
  - [ ] Assign roles

**Estimated time:** 6-8 hours

---

### Phase 4: Research Objectives
**Goal:** Core research workflow

- [ ] ResearchObjectives list
  - [ ] Fetch with `getResearchObjectives(workspaceId)`
  - [ ] Display objectives
  - [ ] Delete functionality

- [ ] AddResearchObjective page
  - [ ] Call `createResearchObjective()` API
  - [ ] Form validation

- [ ] EditResearchObjective page
  - [ ] Fetch with `getResearchObjective()`
  - [ ] Update with `updateResearchObjective()`

**Estimated time:** 4-6 hours

---

### Phase 5: Personas & Demographics
**Goal:** Research design configuration

- [ ] Personas management
  - [ ] Fetch with `getPersonas(objectiveId)`
  - [ ] Create/Update/Delete personas
  - [ ] Show persona list

- [ ] Demographics editor
  - [ ] Show demographic fields (age, gender, income, etc.)
  - [ ] Call `updateDemographics()` API

- [ ] Traits editor
  - [ ] Psychographic traits with sliders
  - [ ] Behavioral traits with values
  - [ ] Save updates

**Estimated time:** 5-7 hours

---

### Phase 6: Questionnaire & Survey
**Goal:** Survey design and results

- [ ] Questionnaire builder
  - [ ] Create/Edit questionnaires
  - [ ] Question management
  - [ ] Question types (text, multiple choice, etc.)

- [ ] Survey results viewer
  - [ ] Display responses
  - [ ] Show analytics
  - [ ] Export results

**Estimated time:** 8-10 hours

---

### Phase 7: File Upload
**Goal:** Document management

- [ ] Upload component
  - [ ] File input handler
  - [ ] Call `uploadFile()` API
  - [ ] Show upload progress
  - [ ] Display uploaded files

**Estimated time:** 2-3 hours

---

### Phase 8: Refinements
**Goal:** Polish and optimization

- [ ] Add loading spinners to all pages
- [ ] Implement error toasts/notifications
- [ ] Add retry logic
- [ ] Optimize API calls (caching)
- [ ] Add request logging
- [ ] Performance testing

**Estimated time:** 4-6 hours

---

## 💡 Implementation Tips

### 1. Use the useApi Hook for List Pages
```javascript
const { data, loading, error, execute } = useApi(getWorkspaces);

useEffect(() => {
  execute(orgId);
}, [orgId]);
```

### 2. Use Manual API Calls for Forms
```javascript
try {
  const response = await createWorkspace(orgId, formData);
  showSuccess("Created!");
} catch (err) {
  const { message } = handleApiError(err);
  setError(message);
}
```

### 3. Always Validate Before Sending
```javascript
const errors = validateForm(formData);
if (Object.keys(errors).length > 0) {
  setErrors(errors);
  return;
}
```

### 4. Show Loading States
```javascript
<button disabled={loading}>
  {loading ? "Loading..." : "Submit"}
</button>
```

### 5. Handle Errors Gracefully
```javascript
if (error) {
  return <ErrorAlert message={error.message} />;
}
```

---

## 🔍 Testing Checklist

After each API integration:

- [ ] API call is made
- [ ] Response is received correctly
- [ ] Data is displayed on UI
- [ ] Error case is handled
- [ ] Loading state shows
- [ ] Form validation works
- [ ] Token refresh works (if needed)
- [ ] Logout clears token
- [ ] Cannot access protected routes without token

---

## 📞 Postman Collections

Since you have Postman with API list:

1. **Export from Postman:**
   - File → Export → Collection
   - Save as `postman_collection.json`

2. **Import to docs:**
   - Create folder `postman/` in project
   - Place `postman_collection.json`
   - Reference in team wiki/docs

3. **Use for testing:**
   - Test each endpoint in Postman first
   - Then implement in frontend
   - Verify requests match expected format

---

## 🐛 Debugging Tips

### Check Network Requests
1. Open DevTools → Network tab
2. Make API call
3. Check request/response in console
4. Verify headers include `Authorization: Bearer <token>`

### Check Console Errors
```javascript
import { API_CONFIG } from "./config/apiConfig";
console.log("API Base URL:", API_CONFIG.BASE_URL);
```

### Test API Directly
```javascript
// In browser console
import { getWorkspaces } from "./utils/api";
getWorkspaces("org-id").then(r => console.log(r));
```

### Enable Debug Mode
Update `.env`:
```
VITE_ENABLE_DEBUG=true
```

---

## 📊 Project Timeline

| Phase | Duration | Priority |
|-------|----------|----------|
| Setup + Auth | 2-3h | 🔴 HIGH |
| Organization | 4-5h | 🔴 HIGH |
| Workspaces | 6-8h | 🔴 HIGH |
| Research Obj. | 4-6h | 🟡 MEDIUM |
| Personas | 5-7h | 🟡 MEDIUM |
| Survey | 8-10h | 🟡 MEDIUM |
| File Upload | 2-3h | 🟡 MEDIUM |
| Polish | 4-6h | 🟢 LOW |
| **TOTAL** | **35-48h** | - |

---

## ✨ Quality Checklist

- [ ] All error messages are user-friendly
- [ ] Loading states are visible
- [ ] API errors don't crash app
- [ ] Forms clear after successful submit
- [ ] Confirmations for destructive actions
- [ ] Empty states handled gracefully
- [ ] Mobile responsive UI maintained
- [ ] Keyboard navigation works
- [ ] Token refresh implemented
- [ ] Rate limiting handled

---

## 🎓 Resources

- `API_INTEGRATION_GUIDE.md` - Full API reference
- `API_INTEGRATION_EXAMPLES.js` - Code samples
- `API_INTEGRATION_CHECKLIST.md` - Task list
- `.env.example` - Configuration template

---

## 🎯 Start Here

1. ✅ Copy `.env.example` → `.env`
2. ✅ Update environment variables
3. ✅ Add auth token init to `App.jsx`
4. ✅ Connect Login page
5. ✅ Test login flow with Postman + browser

**Then proceed with other pages based on priority!**

Good luck with the integration! 🚀
