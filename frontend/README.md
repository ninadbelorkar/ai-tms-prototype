# AI-TMS Frontend

This directory contains the React frontend code for the AI-Integrated Test Case Management System prototype.

## Available Scripts

In the project directory, you can run:

### `npm install`

Installs all the necessary dependencies for the frontend application. Run this first.

### `npm start`

Runs the app in development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload if you make edits.\
You will also see any lint errors in the console.

**Note:** Ensure the backend server (typically on port 5001) is running for the API calls to work.

### `npm test`

Launches the test runner in interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

## Backend Communication

This frontend expects the backend API server to be running, by default at `http://localhost:5001`. The backend URL can be configured via the `REACT_APP_BACKEND_URL` environment variable if needed.