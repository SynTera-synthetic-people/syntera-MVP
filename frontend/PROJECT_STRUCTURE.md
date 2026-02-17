# Complete API Integration Project Structure

## 📦 Final Project File Structure

```
synthetic_people_frontend/
│
├── 📄 .env.example              ← Environment template
├── 📄 .env                      ← Your local config (create from .env.example)
├── 📄 package.json
├── 📄 vite.config.js
├── 📄 tailwind.config.js
├── 📄 eslint.config.js
├── 📄 postcss.config.js
│
├── 📚 DOCUMENTATION
│   ├── API_INTEGRATION_GUIDE.md        ← Full API reference
│   ├── API_INTEGRATION_CHECKLIST.md    ← Integration tasks
│   ├── API_INTEGRATION_SETUP.md        ← Quick start
│   ├── API_INTEGRATION_EXAMPLES.js     ← Code samples
│   └── NEXT_STEPS.md                   ← Implementation roadmap
│
├── public/
│   └── index.html
│
└── src/
    │
    ├── 📁 config/
    │   └── apiConfig.js                 ← API configuration
    │
    ├── 📁 utils/
    │   ├── api.js                       ← 40+ API endpoints ⭐
    │   └── validation.js                ← Form validators
    │
    ├── 📁 hooks/
    │   └── useApi.js                    ← Custom API hook ⭐
    │
    ├── 📁 routes/
    │   ├── ProtectedRoute.jsx
    │   └── PublicRoute.jsx
    │
    ├── 📁 redux/
    │   ├── store.js
    │   └── slices/
    │       ├── authSlice.js
    │       └── userSlice.js
    │
    ├── 📁 context/
    │   ├── UserContext.jsx
    │   └── WorkspaceContext.jsx
    │
    ├── 📁 components/
    │   ├── Sidebar.jsx                  ← Navigation
    │   ├── Button.jsx                   ← UI Component
    │   ├── InputField.jsx               ← Form Input
    │   └── CardLayout.jsx               ← Layout
    │
    ├── 📁 pages/
    │   │
    │   ├── Login/
    │   │   ├── Login.jsx                ← API: loginUser()
    │   │   ├── Signup.jsx               ← API: signupUser()
    │   │   ├── ForgotPassword.jsx       ← API: sendResetEmail()
    │   │   └── ResetPassword.jsx        ← API: resetPassword()
    │   │
    │   ├── Main/
    │   │   └── MainPage.jsx
    │   │
    │   └── organization/
    │       ├── MyOrganization.jsx       ← API: getOrganization()
    │       ├── WorkspaceList.jsx        ← API: getWorkspaces()
    │       ├── ResearchObjectives.jsx   ← API: getResearchObjectives()
    │       │
    │       ├── Workspace/
    │       │   ├── AddWorkspace.jsx     ← API: createWorkspace()
    │       │   ├── EditWorkspace.jsx    ← API: updateWorkspace()
    │       │   ├── ManageUsers.jsx      ← API: getWorkspaceUsers()
    │       │   └── WorkspaceItem.jsx
    │       │
    │       └── ResearchObjective/
    │           ├── AddResearchObjective.jsx    ← API: createResearchObjective()
    │           └── EditResearchObjective.jsx   ← API: updateResearchObjective()
    │
    ├── App.jsx                          ← Main app with routes
    ├── main.jsx                         ← Entry point
    ├── App.css
    └── index.css

```

---

## 🎯 Component → API Mapping

### Authentication Flow
```
Login.jsx
  ↓ onClick(submit)
  ↓ loginUser(email, password)
  ↓ POST /auth/login
  ← response: { token, user }
  ↓ setAuthToken(token)
  ↓ dispatch(setCredentials)
  ↓ navigate(/main/organization)
```

### Workspace Management Flow
```
WorkspaceList.jsx
  ↓ useEffect
  ↓ getWorkspaces(orgId)
  ↓ GET /organizations/{orgId}/workspaces
  ← response: [{ id, name, description, ... }]
  ↓ Display workspace cards
  ↓ onClick(edit)
  ↓ EditWorkspace.jsx
  ↓ getWorkspace(id)
  ↓ PUT /workspaces/{id}
  ← response: { message, workspace }
```

### Research Objectives Flow
```
ResearchObjectives.jsx
  ↓ getResearchObjectives(workspaceId)
  ↓ GET /workspaces/{workspaceId}/research-objectives
  ← response: [{ id, title, description, ... }]
  ↓ Display objectives in tabs
  ↓ getPersonas(objectiveId)
  ↓ GET /research-objectives/{objectiveId}/personas
  ← response: [{ name, demographics, traits }]
```

---

## 📡 API Endpoints by Category

### ✅ Auth (4 endpoints)
- POST `/auth/login`
- POST `/auth/signup`
- POST `/auth/forgot-password`
- POST `/auth/reset-password/{token}`

### ✅ Organization (5 endpoints)
- GET `/organizations/{orgId}`
- PUT `/organizations/{orgId}`
- GET `/organizations/{orgId}/members`
- POST `/organizations/{orgId}/members`
- DELETE `/organizations/{orgId}/members/{userId}`

### ✅ Workspace (8 endpoints)
- GET `/organizations/{orgId}/workspaces`
- GET `/workspaces/{workspaceId}`
- POST `/organizations/{orgId}/workspaces`
- PUT `/workspaces/{workspaceId}`
- DELETE `/workspaces/{workspaceId}`
- GET `/workspaces/{workspaceId}/users`
- POST `/workspaces/{workspaceId}/users`
- DELETE `/workspaces/{workspaceId}/users/{userId}`

### ✅ Research Objectives (5 endpoints)
- GET `/workspaces/{workspaceId}/research-objectives`
- GET `/research-objectives/{objectiveId}`
- POST `/workspaces/{workspaceId}/research-objectives`
- PUT `/research-objectives/{objectiveId}`
- DELETE `/research-objectives/{objectiveId}`

### ✅ Personas (4 endpoints)
- GET `/research-objectives/{objectiveId}/personas`
- POST `/research-objectives/{objectiveId}/personas`
- PUT `/personas/{personaId}`
- DELETE `/personas/{personaId}`

### ✅ Demographics (2 endpoints)
- GET `/personas/{personaId}/demographics`
- PUT `/personas/{personaId}/demographics`

### ✅ Traits (4 endpoints)
- GET `/personas/{personaId}/psychographic-traits`
- PUT `/personas/{personaId}/psychographic-traits`
- GET `/personas/{personaId}/behavioral-traits`
- PUT `/personas/{personaId}/behavioral-traits`

### ✅ Questionnaire (4 endpoints)
- GET `/research-objectives/{objectiveId}/questionnaires`
- POST `/research-objectives/{objectiveId}/questionnaires`
- PUT `/questionnaires/{questionnaireId}`
- DELETE `/questionnaires/{questionnaireId}`

### ✅ Survey Results (3 endpoints)
- GET `/research-objectives/{objectiveId}/survey-results`
- POST `/research-objectives/{objectiveId}/survey-results`
- GET `/survey-results/{resultId}`

### ✅ File Upload (1 endpoint)
- POST `/research-objectives/{objectiveId}/upload`

**Total: 40 endpoints**

---

## 🔐 Authentication & Headers

### Initial Login
```
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}

Response:
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "user-123",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

### Subsequent Requests
```
GET /workspaces/ws-123
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json
```

### Token Storage
```javascript
// After login
localStorage.setItem("authToken", response.data.token);
localStorage.setItem("user", JSON.stringify(response.data.user));

// On app load
const token = localStorage.getItem("authToken");
setAuthToken(token); // Sets Authorization header
```

---

## 🛠️ Development Workflow

### 1. Start Backend
```bash
cd ../backend
python manage.py runserver  # or your backend command
# Backend runs on http://127.0.0.1:8000
```

### 2. Start Frontend
```bash
npm run dev
# Frontend runs on http://127.0.0.1:5173
```

### 3. Test in Postman
- Import your Postman collection
- Test each endpoint
- Verify request/response format
- Note any required parameters

### 4. Implement in Frontend
- Look at `API_INTEGRATION_EXAMPLES.js`
- Copy example matching your use case
- Update API endpoint name
- Update component state/context
- Test in browser

### 5. Debug if Issues
- Check Network tab in DevTools
- Verify request headers include `Authorization`
- Check response status and data
- Look for console errors
- Test endpoint in Postman again

---

## 📋 Pre-Integration Checklist

- [ ] Backend server running on `http://127.0.0.1:8000`
- [ ] Database (pgAdmin) connected and ready
- [ ] Postman collection with all endpoints
- [ ] `.env` file created from `.env.example`
- [ ] `VITE_API_BASE_URL` set correctly
- [ ] Node modules installed (`npm install`)
- [ ] Frontend dev server running (`npm run dev`)
- [ ] Redux store properly configured
- [ ] Context providers setup
- [ ] Router configured with ProtectedRoute

---

## 🚀 Integration Priority Order

### 🔴 CRITICAL (Do First)
1. Auth pages (Login, Signup)
2. Workspace CRUD
3. Research Objectives CRUD

### 🟡 IMPORTANT (Do Next)
4. Personas management
5. Demographics editor
6. Questionnaire builder

### 🟢 NICE TO HAVE (Do Last)
7. Survey results viewer
8. File upload
9. Advanced analytics

---

## 📊 Feature Completion Matrix

| Feature | API Ready | Endpoint Count | Priority |
|---------|-----------|----------------|----------|
| Authentication | ✅ | 4 | 🔴 |
| Organization | ✅ | 5 | 🔴 |
| Workspaces | ✅ | 8 | 🔴 |
| Research Objectives | ✅ | 5 | 🔴 |
| Personas | ✅ | 4 | 🟡 |
| Demographics | ✅ | 2 | 🟡 |
| Traits | ✅ | 4 | 🟡 |
| Questionnaire | ✅ | 4 | 🟡 |
| Survey | ✅ | 3 | 🟡 |
| File Upload | ✅ | 1 | 🟢 |
| **TOTAL** | **✅** | **40** | - |

---

## 💾 Key Files to Reference

When integrating a feature, reference these files:

| Need | File | Purpose |
|------|------|---------|
| API function | `src/utils/api.js` | Call API endpoint |
| Error handling | `src/utils/api.js` | `handleApiError()` |
| Custom hook | `src/hooks/useApi.js` | Simplified API calls |
| Configuration | `src/config/apiConfig.js` | API settings |
| Examples | `API_INTEGRATION_EXAMPLES.js` | Code templates |
| Full reference | `API_INTEGRATION_GUIDE.md` | Complete documentation |

---

## ✨ Next: Your Action Items

1. **Create `.env`** from `.env.example`
2. **Update `App.jsx`** to initialize auth token
3. **Test Login** with Postman endpoints first
4. **Connect Login page** following `API_INTEGRATION_EXAMPLES.js`
5. **Test login flow** in browser
6. **Then proceed** with other pages...

You now have everything needed for complete API integration! 🎉
