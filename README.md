# Tip Tracker

A modern, premium dark-themed web application for tracking daily gratuity, tips, and cash earnings. Built with React and Firebase, it provides elegant data visualization and biweekly financial summaries tailored for service industry professionals.

## Features

- **Multi-View Calendar System**
  - **Week View**: Detailed daily breakdown with editable cards
  - **Month View**: Compact monthly overview with quick access to any day
  
- **Real-time Data Management**
  - Track gratuity, tips, and cash earnings for each day
  - Instant Firebase synchronization across all devices
  - Live updates with real-time listeners
  
- **Financial Analytics**
  - Biweekly summary calculations with customizable pay period (1-week lag support)
  - Interactive charts powered by Recharts
  - Visual data representation by week and month

- **User Authentication**
  - Secure Firebase Authentication
  - User-specific data isolation with Firestore security rules
  - Support for email/username login

- **Premium UI/UX**
  - Modern dark theme with glassmorphism effects
  - Smooth animations and micro-interactions
  - Responsive design with Inter font family
  - Minimalistic and clean interface

## Tech Stack

- **Frontend**: React 19.1.1
- **Build Tool**: Vite 7.1.7
- **Database**: Firebase Firestore
- **Authentication**: Firebase Auth
- **Charts**: Recharts 3.5.1
- **Styling**: CSS Modules with custom design system

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Firebase account

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd tip-tracker
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env.local` file in the root directory with your Firebase configuration:
   ```env
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Open your browser and navigate to `http://localhost:5173`

## Available Scripts

- `npm run dev` - Start the development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm run lint` - Run ESLint for code quality

## Deployment

This application is configured for Firebase Hosting:

1. Build the application:
   ```bash
   npm run build
   ```

2. Deploy to Firebase:
   ```bash
   firebase deploy
   ```

The `firebase.json` configuration is already set up to deploy the `dist` folder and includes proper SPA routing.

## Project Structure

```
tip-tracker/
├── src/
│   ├── components/
│   │   ├── Auth/          # Login and authentication components
│   │   ├── Calendar/      # Week and month view calendar components
│   │   ├── Charts/        # Data visualization components
│   │   ├── Header/        # Application header
│   │   ├── WeekHeader/    # Navigation and view mode controls
│   │   └── BiweeklySummary/  # Financial summary component
│   ├── config/            # Firebase configuration
│   ├── context/           # React context (AuthContext)
│   ├── services/          # Data service layer (Firestore operations)
│   ├── styles/            # Global styles and CSS variables
│   ├── utils/             # Utility functions (date handling)
│   ├── App.jsx            # Main application component
│   └── main.jsx           # Application entry point
├── firebase.json          # Firebase configuration
├── firestore.rules        # Firestore security rules
└── package.json
```

## Usage

1. **Sign Up/Login**: Create an account or log in with existing credentials
2. **Navigate**: Use the week/month toggle to switch between views
3. **Edit Data**: Click on any day card to enter edit mode
4. **Input Earnings**: Enter gratuity, tips, and cash amounts
5. **Save**: Click "Save" to persist your data to Firebase
6. **View Summary**: Check the biweekly summary for pay period totals
7. **Analyze Trends**: Review charts for visual insights into your earnings

## Security

- Firestore security rules ensure each user can only access their own data
- Authentication required for all data operations
- Environment variables protect sensitive Firebase credentials

## License

This project is private and not licensed for public use.

## Credits

Built with ❤️ for service industry professionals
