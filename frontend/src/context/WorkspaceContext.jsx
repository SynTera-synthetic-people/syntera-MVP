// import { createContext, useContext, useState } from "react";

// const WorkspaceContext = createContext();

// export const WorkspaceProvider = ({ children }) => {
//   const [workspaces, setWorkspaces] = useState([]);

//   // Create new workspace
//   const addWorkspace = (workspace) => {
//     const newWorkspace = {
//       id: Date.now(),      // unique ID
//       ...workspace,
//       users: [],
//     };

//     setWorkspaces((prev) => [...prev, newWorkspace]);
//   };

//   // Edit workspace
//   const updateWorkspace = (id, updatedData) => {
//   setWorkspaces((prev) =>
//     prev.map((ws) =>
//       ws.id === id ? { ...ws, ...updatedData } : ws
//     )
//   );
// };

//   // Delete workspace
//   const deleteWorkspace = (id) => {
//     setWorkspaces((prev) => prev.filter((ws) => ws.id !== id));
//   };

//   // Add user to workspace
//   const addUserToWorkspace = (workspaceId, user) => {
//     setWorkspaces((prev) =>
//       prev.map((ws) =>
//         ws.id === workspaceId
//           ? { ...ws, users: [...ws.users, user] }
//           : ws
//       )
//     );
//   };

//   // Remove user from workspace
//   const removeUserFromWorkspace = (workspaceId, email) => {
//     setWorkspaces((prev) =>
//       prev.map((ws) =>
//         ws.id === workspaceId
//           ? { ...ws, users: ws.users.filter((u) => u.email !== email) }
//           : ws
//       )
//     );
//   };

//   return (
//     <WorkspaceContext.Provider
//       value={{
//         workspaces,
//         addWorkspace,
//         updateWorkspace,
//         deleteWorkspace,
//         addUserToWorkspace,
//         removeUserFromWorkspace,
//       }}
//     >
//       {children}
//     </WorkspaceContext.Provider>
//   );
// };

// export const useWorkspace = () => useContext(WorkspaceContext);
// src/context/WorkspaceContext.jsx
import { createContext, useContext, useState } from "react";

const WorkspaceContext = createContext();

export const WorkspaceProvider = ({ children }) => {
  const [workspaces, setWorkspaces] = useState([
    // sample workspace (optional)
    // { id: crypto.randomUUID(), title: "General", description: "Default", users: [] }
  ]);
  const [selectedWorkspace, setSelectedWorkspace] = useState(null);

  // const addWorkspace = (data) => {
  //   const newWS = { id: crypto.randomUUID(), ...data, users: [] };
  //   setWorkspaces((prev) => [...prev, newWS]);
  //   return newWS;
  // };
  const addWorkspace = (workspace) => {
    const newWorkspace = {
      id: crypto.randomUUID(),   // 🔥 FIX: Add unique ID
      ...workspace,
      users: [],
    };

    setWorkspaces((prev) => [...prev, newWorkspace]);
  };


  // Restore (id, updatedData) signature so callers like EditWorkspace work
  const updateWorkspace = (id, updatedData) => {
    setWorkspaces((prev) =>
      prev.map((ws) => (ws.id === id ? { ...ws, ...updatedData } : ws))
    );
  };
  const deleteWorkspace = (id) => {
    setWorkspaces((prev) => prev.filter((w) => w.id !== id));
  };

  const addUserToWorkspace = (workspaceId, user) => {
    setWorkspaces((prev) =>
      prev.map((w) =>
        w.id === workspaceId ? { ...w, users: [...w.users, user] } : w
      )
    );
  };

  const removeUserFromWorkspace = (workspaceId, userId) => {
    setWorkspaces((prev) =>
      prev.map((w) =>
        w.id === workspaceId
          ? { ...w, users: w.users.filter((u) => u.id !== userId) }
          : w
      )
    );
  };

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        selectedWorkspace,
        setSelectedWorkspace,
        addWorkspace,
        updateWorkspace,
        deleteWorkspace,
        addUserToWorkspace,
        removeUserFromWorkspace,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => useContext(WorkspaceContext);
