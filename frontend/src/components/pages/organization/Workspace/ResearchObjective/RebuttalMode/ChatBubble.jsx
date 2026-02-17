import React from 'react';

const ChatBubble = ({ message, sender }) => (
    <div className={`flex items-end my-2 ${sender === 'user' ? 'justify-end' : 'justify-start'}`}>
        {sender === 'bot' && <img src="https://res.cloudinary.com/dyarrjhv7/image/upload/v1704997839/default-monochrome-white_p69k2u.svg" alt="Bot Avatar" className="w-8 h-8 rounded-full mr-2" />}
        <div className={`px-3 py-1.5 rounded-xl max-w-md text-sm ${sender === 'user' ? 'bg-blue-500 text-white rounded-br-none' : 'bg-gray-700 text-white rounded-bl-none'}`}>
            {message}
        </div>
        {sender === 'user' && <img src="https://i.pravatar.cc/150?img=3" alt="User Avatar" className="w-8 h-8 rounded-full ml-2" />}
    </div>
);

export default ChatBubble;
