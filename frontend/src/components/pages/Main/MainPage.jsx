import React, { useRef, useState } from "react";
import { FaPlus, FaPaperPlane } from "react-icons/fa";
import Sidebar from "../Main/Sidebar";
import { Outlet } from "react-router-dom";
import Chatbot from "../../Chatbot/Chatbot";
import ResponseBar from "../../common/ResponseBar";

const MainPage = () => {
  const fileInputRef = useRef(null);
  const [inputValue, setInputValue] = useState("");

  const handlePlusClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = (event) => {
    const files = event.target.files;
    if (files.length > 0) {
      console.log("Files selected:", files);
      // Handle file upload logic here
    }
  };

  const handleSend = () => {
    if (inputValue.trim()) {
      console.log("Sending message:", inputValue);
      // Handle send logic here
      setInputValue("");
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 dark:text-white overflow-hidden transition-colors duration-300 bg-white dark:bg-black-primary-light">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-black-primary-light">
          <div className="flex items-center gap-2 max-w-4xl mx-auto">
            <div className="flex-1 relative group">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask anything..."
                className="w-full p-4 pl-14 pr-12 border-2 border-gray-300 dark:border-gray-600 rounded-full focus:outline-none focus:ring-4 focus:ring-blue-500/30 focus:border-blue-500 transition-all duration-300 transform hover:scale-[1.02] focus:scale-[1.02] bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-lg hover:shadow-xl focus:shadow-2xl"
              />

              <button
                onClick={handlePlusClick}
                className="absolute left-3 top-1/2 transform -translate-y-1/2 flex-shrink-0 p-2 bg-gray-200 dark:bg-gray-600 hover:bg-blue-500 text-gray-600 dark:text-gray-300 hover:text-white rounded-full transition-all duration-200 hover:scale-110 active:scale-95 shadow-md hover:shadow-lg group/plus"
                title="Upload files"
              >
                <FaPlus className="w-4 h-4 transition-transform duration-200 group-hover/plus:rotate-90" />
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                  multiple
                  accept=".jpg,.jpeg,.png,.pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                />
              </button>

              <button
                onClick={handleSend}
                disabled={!inputValue.trim()}
                className={`absolute right-3 top-1/2 transform -translate-y-1/2 flex-shrink-0 p-2 rounded-full transition-all duration-200 group/send ${inputValue.trim()
                  ? "bg-blue-500 hover:bg-blue-600 text-white hover:scale-110 active:scale-95 shadow-md hover:shadow-lg"
                  : "bg-gray-200 dark:bg-gray-600 text-gray-400 cursor-not-allowed"
                  }`}
              >
                <FaPaperPlane className={`w-4 h-4 transition-transform duration-200 ${inputValue.trim() ? 'group-hover/send:translate-x-0.5 group-hover/send:-translate-y-0.5' : ''}`} />
              </button>

              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-500/0 via-blue-500/5 to-blue-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
            </div>
          </div>
        </div> */}
        <div className="flex-1 overflow-y-auto relative no-scrollbar">
          <div className="pt-16 md:pt-0 pb-20">
            <Outlet />
          </div>
        </div>
        <ResponseBar />
      </div>
      {/* <Chatbot /> */}
      {/* <Chatbot /> */}
    </div>
  );
};

export default MainPage;