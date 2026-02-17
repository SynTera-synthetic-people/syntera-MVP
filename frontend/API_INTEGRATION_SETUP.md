# API Integration Setup Complete ✅

## What's Been Set Up

### 1. **Comprehensive API Utility** (`src/utils/api.js`)
   - **40+ API endpoints** organized by category:
     - Authentication (login, signup, password reset)
     - Organizations (create, read, update, manage members)
     - Workspaces (CRUD operations, user management)
     - Research Objectives (CRUD operations)
     - Personas (CRUD operations)
     - Demographics (read/update)
     - Traits (psychographic & behavioral)
     - Questionnaires (CRUD operations)
     - Survey Results (submit & retrieve)
     - File Upload (document uploads)
   
   - **Utility Functions:**
     - `setAuthToken()` - Set authorization header
     - `handleApiError()` - Consistent error handling

### 2. **Custom Hook** (`src/hooks/useApi.js`)
   - `useApi()` hook for simplified API calls
   - Automatic loading state management
   - Error handling built-in
   - Prevents component re-renders with memoized execute function

### 3. **Configuration System** (`src/config/apiConfig.js`)
   - Environment-based configuration
   - Supports development, staging, production
   - Configurable timeout, debug mode

### 4. **Environment Setup** (`.env.example`)
   - Ready to copy and configure
   - Supports multiple environments
   - Feature flags for debugging

### 5. **Documentation**
   - `API_INTEGRATION_GUIDE.md` - Complete API reference with examples
   - `API_INTEGRATION_CHECKLIST.md` - Step-by-step integration tasks
   - This file - Quick overview

---

## Quick Start

### Step 1: Setup Environment
```bash
# Copy template
copy .env.example .env

# Update with your backend URL
# VITE_API_BASE_URL=http://127.0.0.1:8000/api
```

### Step 2: Update api.js to Use Config
Edit `src/utils/api.js` first few lines:
```javascript
import { API_CONFIG } from "../config/apiConfig";

const BASE_URL = API_CONFIG.BASE_URL;
```

### Step 3: Initialize Auth Token on App Load
In `src/App.jsx`:
```javascript
import { setAuthToken } from "./utils/api";

useEffect(() => {
  const token = localStorage.getItem("authToken");
  if (token) {
    setAuthToken(token);
  }
}, []);
```

### Step 4: Connect First Page (Login)
```javascript
import { loginUser, setAuthToken, handleApiError } from "../utils/api";
import { useDispatch } from "react-redux";

function Login() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    
    try {
      const response = await loginUser({
        email: formData.email,
        password: formData.password
      });
      
      const token = response.data.token;
      localStorage.setItem("authToken", token);
      setAuthToken(token);
      
      dispatch(loginUser(response.data.user));
      navigate("/main/organization");
    } catch (err) {
      const { message } = handleApiError(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    // ... your form JSX
  );
}
```

---

## API Endpoints Summary

| Category | Operations |
|----------|-----------|
| **Auth** | Login, Signup, Forgot Password, Reset Password |
| **Organization** | Get, Update, Manage Members |
| **Workspace** | CRUD (Create, Read, Update, Delete), User Management |
| **Research Objectives** | CRUD, Manage Personas |
| **Personas** | CRUD, Demographics, Traits |
| **Questionnaire** | CRUD, Question Management |
| **Survey Results** | Get Results, Submit Results |
| **File Upload** | Upload documents to research objectives |

---

## Key Features

✅ **Organized Structure** - Endpoints grouped by feature  
✅ **Error Handling** - Consistent error messages and codes  
✅ **Authentication** - Bearer token support with `setAuthToken()`  
✅ **Custom Hook** - Simple `useApi()` for cleaner components  
✅ **Environment Config** - Multiple environment support  
✅ **Type-safe** - Clear function signatures and return types  
✅ **File Upload** - FormData support with proper headers  
✅ **Timeout Handling** - Configurable request timeout  

---

## Integration Order (Recommended)

1. **Auth Pages** → Test login/signup first
2. **Organization** → Setup org management
3. **Workspaces** → Core feature
4. **Research Objectives** → Main workflow
5. **Personas & Traits** → Detailed config
6. **Questionnaire & Survey** → Advanced features

---

## Example: Using useApi Hook

```javascript
import useApi from "../hooks/useApi";
import { getWorkspaces } from "../utils/api";

function Workspaces() {
  const { data, loading, error, execute } = useApi(getWorkspaces);
  
  useEffect(() => {
    execute(orgId);
  }, [orgId]);
  
  if (loading) return <Spinner />;
  if (error) return <Error message={error.message} />;
  
  return (
    <div>
      {data?.map(w => (
        <Card key={w.id}>
          <h3>{w.name}</h3>
          <p>{w.description}</p>
        </Card>
      ))}
    </div>
  );
}
```

---

## Troubleshooting

### "CORS Error"
- Ensure backend has CORS configured
- Check `VITE_API_BASE_URL` is correct
- Verify backend is running on correct port

### "401 Unauthorized"
- Token not being sent in headers
- Call `setAuthToken()` after login
- Check token is stored in localStorage

### "404 Not Found"
- API endpoint path incorrect
- Backend route not implemented
- Check backend logs for actual routes

### Timeout Issues
- Increase `VITE_API_TIMEOUT` in `.env`
- Check backend is responding
- Check network connectivity

---

## Files You Now Have

```
src/
├── utils/
│   └── api.js                    # 40+ API endpoints
├── hooks/
│   └── useApi.js                 # Custom API hook
├── config/
│   └── apiConfig.js              # Configuration
├── App.jsx                        # (needs auth token setup)
├── pages/
│   ├── Login/
│   │   └── Login.jsx             # (needs API connection)
│   ├── Signup.jsx                # (needs API connection)
│   ├── ... other pages
│
.env.example                       # Environment template
API_INTEGRATION_GUIDE.md           # Full API reference
API_INTEGRATION_CHECKLIST.md       # Integration tasks
API_INTEGRATION_SETUP.md           # This file
```

---

## Next Actions

1. ✅ Copy `.env.example` → `.env`
2. ✅ Update environment variables
3. ✅ Update `api.js` to use `API_CONFIG`
4. ✅ Setup auth token in `App.jsx`
5. ✅ Connect Login page
6. ✅ Test login flow
7. ⏭️ Continue with other pages...

**Happy integrating! 🚀**

Need help? Check `API_INTEGRATION_GUIDE.md` for detailed examples and `API_INTEGRATION_CHECKLIST.md` for step-by-step tasks.
