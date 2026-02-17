// import React from "react";
// import logo from "../../assets/Logo_Dark_bg.png"; // Using the light-text logo for the dark branding side

// const CardLayout = ({ children }) => {
//   return (
//     <div className="min-h-screen w-full flex flex-col sm:flex-row bg-white dark:bg-dark-bg">
//       {/* Left Side - Form Content */}
//       <div className="w-full sm:w-1/2 flex items-center justify-center p-8 sm:p-12 bg-white dark:bg-dark-panel transition-colors duration-300">
//         <div className="w-full max-w-md">
//           {children}
//         </div>
//       </div>

//       {/* Right Side - Branding/Image */}
//       <div className="w-full sm:w-1/2 bg-gradient-to-br from-sidebar via-primary to-primary-dark relative flex items-center justify-center overflow-hidden min-h-[300px] sm:min-h-screen">
//         {/* Subtle glass-like overlay for depth */}
//         <div className="absolute inset-0 bg-white/10 backdrop-blur-[1px]"></div>

//         {/* Decorative Circles/Shapes */}
//         <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 rounded-full bg-white/10 blur-3xl animate-pulse"></div>
//         <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 rounded-full bg-blue-500/20 blur-3xl animate-pulse delay-1000"></div>

//         <div className="text-white text-center flex flex-col items-center relative z-10 p-12">
//           {/* Logo */}
//           <img
//             src={logo}
//             alt="Synthetic People Logo"
//             className="w-48 mb-8 drop-shadow-2xl"
//           />
          // <h1 className="text-4xl font-bold mb-4 drop-shadow-md">
          //   Synthetic People
          // </h1>
          // <p className="text-lg text-blue-100 max-w-md leading-relaxed drop-shadow-sm">
          //   Empowering your research with AI-driven synthetic personas.
          // </p>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default CardLayout;
import React from "react";
import logoForLight from "../../assets/Logo_Light_bg.png";
import logoForDark from "../../assets/Logo_Dark_bg.png";
import { useTheme } from "../../context/ThemeContext";
const CardLayout = ({ children }) => {
    const { theme } = useTheme();
  return (
    <div className="min-h-screen w-full flex flex-col sm:flex-row bg-white dark:bg-dark-bg">
      {/* Left Side - Form Content */}
      <div className="w-full sm:w-1/2 flex items-center justify-center p-8 sm:p-12 bg-white dark:bg-dark-panel transition-colors duration-300">
        <div className="w-full max-w-md">
          {children}
        </div>
      </div>

      {/* Right Side - Branding/Image */}
      <div className="w-full sm:w-1/2 bg-gradient-to-br from-sidebar via-primary to-primary-dark relative flex items-center justify-center overflow-hidden min-h-[300px] sm:min-h-screen">
        {/* Subtle glass-like overlay for depth */}
        <div className="absolute inset-0 bg-white/10 backdrop-blur-[1px]"></div>

        {/* Decorative Circles/Shapes */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 rounded-full bg-white/10 blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 rounded-full bg-blue-500/20 blur-3xl animate-pulse delay-1000"></div>

        <div className="relative z-10 w-full h-full flex items-center justify-center">
          <img
            src="https://res.cloudinary.com/dyarrjhv7/image/upload/v1764678253/20844835_6248147_hdlgcn.jpg"
            alt="Data Analysis Illustration"
            className="w-full h-full object-cover opacity-05"
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 z-20 bg-black bg-opacity-30">
            <h1 className="text-4xl font-bold text-white mb-4">Synthetic People</h1>
            <p className="text-lg text-gray-200 max-w-md">Empowering your research with AI-driven synthetic personas.</p>
          </div>
        </div>
      </div>
      {/* Logo bottom right */}
            <div className="absolute bottom-4 left-4">
              <img
                src={theme === "dark" ? logoForDark : logoForLight}
                alt="Logo"
                className="w-20 object-contain"
              />
            </div>
    </div>
  );
};

export default CardLayout;

