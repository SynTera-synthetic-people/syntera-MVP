// import React from "react";
// import ReactDOM from "react-dom/client";
// import App from "./App.jsx";
// import { Provider } from "react-redux";
// import "./index.css";
// import { store } from "./redux/store";
// import { setCredentials } from "./redux/slices/authSlice";
// import { WorkspaceProvider } from "./context/WorkspaceContext";
// import { ObjectiveProvider } from "./context/ObjectiveContext";
// import { UserProvider } from "./context/UserContext";  // ✅ ADD THIS
// import { PersonaProvider } from "./context/PersonaContext.jsx";

// // Restore login from localStorage
// const token = localStorage.getItem("token");
// const userStr = localStorage.getItem("user");

// if (token && userStr) {
//   try {
//     const user = JSON.parse(userStr);
//     store.dispatch(setCredentials({ user, token }));
//   } catch (e) {
//     localStorage.removeItem("user");
//     localStorage.removeItem("token");
//   }
// }

// ReactDOM.createRoot(document.getElementById("root")).render(
//   <Provider store={store}>
//     <UserProvider>                 {/* ✅ MUST wrap app */}
//       <WorkspaceProvider>  
//         <ObjectiveProvider>
//           <PersonaProvider>
//             <App />
//           </PersonaProvider>
//         </ObjectiveProvider>        {/* Keep workspace provider */}
//       </WorkspaceProvider>
//     </UserProvider>
//   </Provider>
// );
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { Provider } from "react-redux";
import "./index.css";
import { store } from "./redux/store";
import { WorkspaceProvider } from "./context/WorkspaceContext";
import { ObjectiveProvider } from "./context/ObjectiveContext";
import { UserProvider } from "./context/UserContext";
import { PersonaProvider } from "./context/PersonaContext.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <Provider store={store}>
    <UserProvider>
      <WorkspaceProvider>
        <ObjectiveProvider>
          <PersonaProvider>
            <App />
          </PersonaProvider>
        </ObjectiveProvider>
      </WorkspaceProvider>
    </UserProvider>
  </Provider>
);
