import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { usePersonas } from "../../../../../../context/PersonaContext";

const EditPersona = () => {
  const { id } = useParams();
  const { personas, updatePersona } = usePersonas();
  const navigate = useNavigate();

  const [persona, setPersona] = useState(null);

  useEffect(() => {
    const found = personas.find((p) => p.id === id);
    if (found) setPersona(found);
  }, [id, personas]);

  const handleUpdate = async () => {
    const res = await fetch(`/api/personas/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(persona),
    });

    const updated = await res.json();

    updatePersona(id, updated);

    navigate("/main/organization/workspace/research-objectives/persona-builder");
  };

  if (!persona) return <p className="text-gray-500 dark:text-gray-400">Loading...</p>;

  return (
    <div className="p-6 bg-white dark:bg-black-primary-light min-h-screen">
      <h1 className="text-2xl mb-6 text-blue-primary-dark dark:text-white">Edit Persona</h1>

      <input
        className="w-full p-2 rounded mb-4 bg-white dark:bg-dark-bg border border-gray-300 dark:border-dark-border text-gray-900 dark:text-white"
        value={persona.name}
        onChange={(e) =>
          setPersona({ ...persona, name: e.target.value })
        }
      />

      <button
        onClick={handleUpdate}
        className="px-4 py-2 bg-gradient-to-r from-blue-primary to-blue-primary-dark dark:from-primary dark:to-primary-dark text-white rounded-lg"
      >
        Save Changes
      </button>
    </div>
  );
};

export default EditPersona;
