# Synthetic People Platform - Frontend

Synthetic People is a cutting-edge platform designed for advanced market research and persona-driven AI interactions. It allows users to create research objectives, build detailed synthetic personas, and conduct automated depth interviews and surveys to gather deep insights.

## Key Features

- **Organization & Workspace Management**: Organize your research projects into hierarchical structures.
- **Research Objective Wizard**: A structured flow to define and refine research goals.
- **Persona Builder**: Create highly specific synthetic personas with detailed attributes.
- **Exploration & Persona Preview**: Visualize and manage synthetic participants.
- **Depth Interviews**: Conduct automated, AI-driven chat-based interviews with synthetic personas.
- **Population Builder**: Define and generate large-scale synthetic populations for quantitative research.
- **Questionnaire & Survey Results**: Design surveys and analyze results generated from synthetic populations.
- **Traceability**: Track the origin and logic behind synthetic responses for audit and verification.
- **Admin Dashboard**: Comprehensive user and organization management for administrators.
- **Theme Support**: Integrated dark and light mode for a premium user experience.

## Tech Stack

- **Framework**: [React 19](https://react.dev/) with [Vite](https://vitejs.dev/)
- **State Management**: [Redux Toolkit](https://redux-toolkit.js.org/) & [Redux Saga](https://redux-saga.js.org/)
- **Data Fetching**: [Tanstack Query (React Query) v5](https://tanstack.com/query/latest)
- **Styling**: [Tailwind CSS v3/v4](https://tailwindcss.com/) & [PostCSS](https://postcss.org/)
- **Animations**: [Framer Motion](https://www.framer.com/motion/)
- **Icons**: [React Icons](https://react-icons.github.io/react-icons/)
- **Charts**: [Recharts](https://recharts.org/)
- **Forms**: [React Hook Form](https://react-hook-form.com/)
- **Routing**: [React Router v7](https://reactrouter.com/)

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (Latest LTS recommended)
- [npm](https://www.npmjs.com/) or [pnpm](https://pnpm.io/)

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd synthetic_people_frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   pnpm install
   ```

3. Set up environment variables:
   - Create a `.env` file in the root directory.
   - Refer to `.env.example` for required variables.

### Running Locally

```bash
npm run dev
```
The application will be available at `http://localhost:5173`.

## Project Structure

- `src/components`: UI components organized by feature (pages, organization, admin, etc.).
- `src/redux`: Redux slices and store configuration.
- `src/services`: API service layers and configuration.
- `src/hooks`: Custom React hooks for shared logic.
- `src/context`: React Context providers (e.g., ThemeProvider).
- `src/utils`: Helper functions and configuration (e.g., Axios).
- `src/routes`: Route definitions and protection logic.

## Scripts

- `npm run dev`: Starts the development server.
- `npm run build`: Builds the application for production.
- `npm run lint`: Runs ESLint for code quality checks.
- `npm run preview`: Previews the production build locally