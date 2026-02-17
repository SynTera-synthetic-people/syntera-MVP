import { createContext, useContext, useState } from "react";

const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [users, setUsers] = useState([
    // example user (optional)
    // { id: crypto.randomUUID(), name: "Admin", email: "admin@me.com" }
  ]);

  const addUser = (user) => {
    const newUser = { id: crypto.randomUUID(), ...user };
    setUsers((prev) => [...prev, newUser]);
    return newUser;
  };

  const removeUser = (userId) => {
    setUsers((prev) => prev.filter((u) => u.id !== userId));
  };

  return (
    <UserContext.Provider value={{ users, addUser, removeUser }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUsers = () => useContext(UserContext);
