# API Integration Guide

## Overview
This document outlines all API endpoints and how to integrate them into the frontend.

## Base URL
```
http://127.0.0.1:8000/api
```

## Authentication
All endpoints (except auth endpoints) require Bearer token authentication:
```
Authorization: Bearer <token>
```

### Setting Auth Token
```javascript
import { setAuthToken } from "./utils/api";

// After login
const token = response.data.token;
localStorage.setItem("token", token);
setAuthToken(token);

// On app load
const savedToken = localStorage.getItem("token");
if (savedToken) {
  setAuthToken(savedToken);
}
```

---

## API Endpoints

### Authentication Endpoints

#### 1. Login
- **Endpoint**: `POST /auth/login`
- **Body**: `{ email: string, password: string }`
- **Response**: `{ token: string, user: {...} }`

#### 2. Signup
- **Endpoint**: `POST /auth/signup`
- **Body**: `{ email: string, password: string, name: string }`
- **Response**: `{ token: string, user: {...} }`

#### 3. Forgot Password
- **Endpoint**: `POST /auth/forgot-password`
- **Body**: `{ email: string }`
- **Response**: `{ message: string }`

#### 4. Reset Password
- **Endpoint**: `POST /auth/reset-password/:token`
- **Body**: `{ password: string, confirm_password: string }`
- **Response**: `{ message: string }`

---

### Organization Endpoints

#### 1. Get Organization
- **Endpoint**: `GET /organizations/:orgId`
- **Response**: `{ id, name, description, members: [...] }`

#### 2. Update Organization
- **Endpoint**: `PUT /organizations/:orgId`
- **Body**: `{ name?: string, description?: string }`
- **Response**: `{ message: string, data: {...} }`

#### 3. Get Organization Members
- **Endpoint**: `GET /organizations/:orgId/members`
- **Response**: `[{ id, email, name, role: string }]`

#### 4. Add Organization Member
- **Endpoint**: `POST /organizations/:orgId/members`
- **Body**: `{ email: string, role: string }`
- **Response**: `{ message: string, member: {...} }`

#### 5. Remove Organization Member
- **Endpoint**: `DELETE /organizations/:orgId/members/:userId`
- **Response**: `{ message: string }`

---

### Workspace Endpoints

#### 1. Get All Workspaces
- **Endpoint**: `GET /organizations/:orgId/workspaces`
- **Response**: `[{ id, name, description, createdAt, createdBy: {...} }]`

#### 2. Get Single Workspace
- **Endpoint**: `GET /workspaces/:workspaceId`
- **Response**: `{ id, name, description, users: [...], createdAt }`

#### 3. Create Workspace
- **Endpoint**: `POST /organizations/:orgId/workspaces`
- **Body**: `{ name: string, description: string }`
- **Response**: `{ message: string, workspace: {...} }`

#### 4. Update Workspace
- **Endpoint**: `PUT /workspaces/:workspaceId`
- **Body**: `{ name?: string, description?: string }`
- **Response**: `{ message: string, workspace: {...} }`

#### 5. Delete Workspace
- **Endpoint**: `DELETE /workspaces/:workspaceId`
- **Response**: `{ message: string }`

#### 6. Get Workspace Users
- **Endpoint**: `GET /workspaces/:workspaceId/users`
- **Response**: `[{ id, email, name, role: string }]`

#### 7. Add Workspace User
- **Endpoint**: `POST /workspaces/:workspaceId/users`
- **Body**: `{ userId: string, role: string }`
- **Response**: `{ message: string, user: {...} }`

#### 8. Remove Workspace User
- **Endpoint**: `DELETE /workspaces/:workspaceId/users/:userId`
- **Response**: `{ message: string }`

---

### Research Objectives Endpoints

#### 1. Get All Research Objectives
- **Endpoint**: `GET /workspaces/:workspaceId/research-objectives`
- **Response**: `[{ id, title, description, personas: [...], createdAt }]`

#### 2. Get Single Research Objective
- **Endpoint**: `GET /research-objectives/:objectiveId`
- **Response**: `{ id, title, description, personas: [...], questionnaires: [...] }`

#### 3. Create Research Objective
- **Endpoint**: `POST /workspaces/:workspaceId/research-objectives`
- **Body**: `{ title: string, description: string }`
- **Response**: `{ message: string, objective: {...} }`

#### 4. Update Research Objective
- **Endpoint**: `PUT /research-objectives/:objectiveId`
- **Body**: `{ title?: string, description?: string }`
- **Response**: `{ message: string, objective: {...} }`

#### 5. Delete Research Objective
- **Endpoint**: `DELETE /research-objectives/:objectiveId`
- **Response**: `{ message: string }`

---

### Personas Endpoints

#### 1. Get All Personas
- **Endpoint**: `GET /research-objectives/:objectiveId/personas`
- **Response**: `[{ id, name, description, demographics: {...}, traits: {...} }]`

#### 2. Create Persona
- **Endpoint**: `POST /research-objectives/:objectiveId/personas`
- **Body**: `{ name: string, description: string }`
- **Response**: `{ message: string, persona: {...} }`

#### 3. Update Persona
- **Endpoint**: `PUT /personas/:personaId`
- **Body**: `{ name?: string, description?: string }`
- **Response**: `{ message: string, persona: {...} }`

#### 4. Delete Persona
- **Endpoint**: `DELETE /personas/:personaId`
- **Response**: `{ message: string }`

---

### Demographics Endpoints

#### 1. Get Demographics
- **Endpoint**: `GET /personas/:personaId/demographics`
- **Response**: `{ age, gender, income, education, occupation, familySize, maritalStatus, geography }`

#### 2. Update Demographics
- **Endpoint**: `PUT /personas/:personaId/demographics`
- **Body**: `{ age?, gender?, income?, ... }`
- **Response**: `{ message: string, demographics: {...} }`

---

### Traits Endpoints

#### 1. Get Psychographic Traits
- **Endpoint**: `GET /personas/:personaId/psychographic-traits`
- **Response**: `[{ id, name, value: number }]`

#### 2. Update Psychographic Traits
- **Endpoint**: `PUT /personas/:personaId/psychographic-traits`
- **Body**: `[{ name: string, value: number }]`
- **Response**: `{ message: string, traits: [...] }`

#### 3. Get Behavioral Traits
- **Endpoint**: `GET /personas/:personaId/behavioral-traits`
- **Response**: `[{ id, name, value: number }]`

#### 4. Update Behavioral Traits
- **Endpoint**: `PUT /personas/:personaId/behavioral-traits`
- **Body**: `[{ name: string, value: number }]`
- **Response**: `{ message: string, traits: [...] }`

---

### Questionnaire Endpoints

#### 1. Get All Questionnaires
- **Endpoint**: `GET /research-objectives/:objectiveId/questionnaires`
- **Response**: `[{ id, title, questions: [...], createdAt }]`

#### 2. Create Questionnaire
- **Endpoint**: `POST /research-objectives/:objectiveId/questionnaires`
- **Body**: `{ title: string, questions: [{question: string, type: string, options?: [...]}] }`
- **Response**: `{ message: string, questionnaire: {...} }`

#### 3. Update Questionnaire
- **Endpoint**: `PUT /questionnaires/:questionnaireId`
- **Body**: `{ title?: string, questions?: [...] }`
- **Response**: `{ message: string, questionnaire: {...} }`

#### 4. Delete Questionnaire
- **Endpoint**: `DELETE /questionnaires/:questionnaireId`
- **Response**: `{ message: string }`

---

### Survey Results Endpoints

#### 1. Get Survey Results
- **Endpoint**: `GET /research-objectives/:objectiveId/survey-results`
- **Response**: `[{ id, participantId, responses: {...}, completedAt }]`

#### 2. Submit Survey Result
- **Endpoint**: `POST /research-objectives/:objectiveId/survey-results`
- **Body**: `{ questionnaireId: string, responses: {...} }`
- **Response**: `{ message: string, result: {...} }`

#### 3. Get Single Survey Result
- **Endpoint**: `GET /survey-results/:resultId`
- **Response**: `{ id, participantId, responses: {...}, completedAt }`

---

### File Upload Endpoint

#### 1. Upload File
- **Endpoint**: `POST /research-objectives/:objectiveId/upload`
- **Body**: FormData with `file` field
- **Response**: `{ message: string, fileUrl: string }`

---

## Usage Examples

### Example 1: Login and Set Token
```javascript
import { loginUser, setAuthToken } from "./utils/api";

const handleLogin = async (credentials) => {
  try {
    const response = await loginUser(credentials);
    const token = response.data.token;
    
    // Store token
    localStorage.setItem("token", token);
    
    // Set auth header
    setAuthToken(token);
    
    // Dispatch to Redux
    dispatch(loginAction(response.data.user));
  } catch (error) {
    console.error("Login failed:", error.message);
  }
};
```

### Example 2: Using Custom Hook
```javascript
import useApi from "../hooks/useApi";
import { getWorkspaces } from "../utils/api";

function WorkspaceList() {
  const { data: workspaces, loading, error, execute } = useApi(getWorkspaces);
  
  useEffect(() => {
    execute(orgId);
  }, [orgId]);
  
  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  
  return (
    <ul>
      {workspaces?.map(w => <li key={w.id}>{w.name}</li>)}
    </ul>
  );
}
```

### Example 3: File Upload
```javascript
import { uploadFile } from "../utils/api";

const handleFileUpload = async (file, objectiveId) => {
  const formData = new FormData();
  formData.append("file", file);
  
  try {
    const response = await uploadFile(objectiveId, formData);
    console.log("File uploaded:", response.data.fileUrl);
  } catch (error) {
    console.error("Upload failed:", error);
  }
};
```

---

## Error Handling

All API errors are handled consistently:

```javascript
{
  message: string,        // Error message
  status: number | null,  // HTTP status code
  data: object | null     // Additional error data
}
```

Use `handleApiError` utility for consistent error handling:

```javascript
import { handleApiError } from "./utils/api";

try {
  await apiCall();
} catch (error) {
  const { message, status, data } = handleApiError(error);
  console.error(`Error ${status}: ${message}`);
}
```

---

## Environment Variables

Create `.env` file in project root:

```
VITE_API_BASE_URL=http://127.0.0.1:8000/api
VITE_API_TIMEOUT=30000
```

Update `api.js` to use environment variables:

```javascript
const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api";
axios.defaults.timeout = import.meta.env.VITE_API_TIMEOUT || 30000;
```

---

## Next Steps

1. Connect Auth pages (Login, Signup, Reset) to API
2. Implement Workspace CRUD operations
3. Implement Research Objectives CRUD
4. Add Personas and Demographics management
5. Implement Survey and Results functionality
6. Add file upload feature
