import { useWorkspace } from "../../../context/WorkspaceContext";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { TbEdit, TbTrash, TbMail, TbUsers } from "react-icons/tb";

const WorkspaceItem = ({ workspace }) => {
  const navigate = useNavigate();
  const { removeWorkspace, removeUserFromWorkspace } = useWorkspace();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-white/5 backdrop-blur-xl border-2 border-gray-300/60 dark:border-white/10 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all group hover:border-blue-400 dark:hover:border-blue-500/30"
    >
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
            {workspace.name || workspace.title}
          </h2>
          {workspace.department_name && (
            <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-2 uppercase tracking-wider">
              {workspace.department_name}
            </p>
          )}
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            {workspace.description}
          </p>
        </div>
      </div>

      {/* Users */}
      <div className="mb-4 pb-4 border-b border-gray-200 dark:border-white/10">
        <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
          <TbUsers size={18} />
          Members ({workspace.users?.length || 0})
        </h3>

        {workspace.users?.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm">No users added</p>
        ) : (
          <ul className="space-y-2">
            {workspace.users.map((user) => (
              <li
                key={user.id}
                className="flex justify-between items-center bg-gray-50 dark:bg-white/5 px-3 py-2 rounded-lg"
              >
                <span className="text-gray-900 dark:text-white text-sm">{user.name}</span>
                <button
                  onClick={() => removeUserFromWorkspace(workspace.id, user.id)}
                  className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-sm transition-colors"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => navigate(`/main/workspace/edit/${workspace.id}`)}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-50 hover:bg-blue-100 dark:bg-blue-500/10 dark:hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-lg transition-colors font-medium text-sm"
        >
          <TbEdit size={16} />
          Edit
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => navigate(`/main/workspace/invite/${workspace.id}`)}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-50 hover:bg-green-100 dark:bg-green-500/10 dark:hover:bg-green-500/20 text-green-600 dark:text-green-400 rounded-lg transition-colors font-medium text-sm"
        >
          <TbMail size={16} />
          Invite
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            if (window.confirm("Are you sure you want to delete this workspace?")) {
              removeWorkspace(workspace.id);
            }
          }}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20 text-red-600 dark:text-red-400 rounded-lg transition-colors font-medium text-sm"
        >
          <TbTrash size={16} />
        </motion.button>
      </div>
    </motion.div>
  );
};

export default WorkspaceItem;
