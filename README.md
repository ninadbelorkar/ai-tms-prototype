This is a web-based application that leverages artificial intelligence to streamline and enhance the software test case management process. The system integrates with Jira to fetch user stories, uses the Google Gemini API to generate detailed test cases, and persists all data to a cloud-hosted MongoDB database.

## Key Features

-   **User & Project Management:** Full user authentication (Register/Login) and a project-based workflow. All data is scoped to the logged-in user and their specific projects.
-   **Jira Integration (OAuth 2.0):** Securely connects to a user's Jira account to fetch projects and issues (Stories, Tasks, etc.) to use as a source for test case generation.
-   **Manual Input Fallback:** Supports manual text input for user stories if Jira is not used.
-   **Advanced Test Case Generation:** Automatically generates in-depth test cases in two formats:
    -   **Plain English:** Structured, step-by-step functional tests.
    -   **BDD (Gherkin):** Behavior-Driven Development format (`Given-When-Then`).
-   **Interactive Results:** Provides a user-friendly interface to view, edit, and save AI-generated test cases.
-   **Automation Analysis:** An AI-powered feature to analyze generated test cases and recommend the best candidates for automation.
-   **Project Dashboard:** A central dashboard provides key metrics, charts for test case distribution by severity, and a history of recent generation events and analyses.
-   **Data Persistence:** All user accounts, projects, and generated testing artifacts are saved to a cloud MongoDB database.


## Tech Stack

-   **Frontend:** React.js, React Router, Axios
-   **Backend:** Python with Flask
-   **AI / LLM:** Google Gemini API
-   **Database:** MongoDB Atlas (Cloud-hosted)
-   **ODM (Object-Document Mapper):** MongoEngine
-   **Authentication:** Flask-Bcrypt (password hashing), Flask-JWT-Extended (session management)
-   **Jira Integration:** OAuth 2.0 (via `requests-oauthlib`)

__________________________________________________________

## Project Setup Guide

## Prerequisites

-   Node.js (v18.x or later)
-   Python (v3.10 or later)
-   Git


### Part - A

## Step 1: Clone the Repository

On Termianl:
git clone https://github.com/ninadbelorkar/ai-tms-prototype

cd ai-tms-project


## Step 2: Set Up Backend

- Navigate to the backend directory:
cd backend

- Create and activate a Python virtual environment:
python -m venv venv
venv\Scripts\activate

- Install dependencies:
pip install -r requirements.txt


## Step 3: Set Up Frontend

- Open a new terminal.
Navigate to the frontend directory:
cd frontend

- Install dependencies:
npm install

### Part - B

## Step 1: Set Up Atlassian (Jira) OAuth 2.0 App

- Go to the Atlassian Developer Console and create a new "OAuth 2.0 integration".
- Go to Permissions -> Jira API and add the following Granular scopes:
read:jira-work
read:jira-user
read:project:jira

- Go to Authorization -> OAuth 2.0 (3LO) and add a Callback URL:
http://localhost:5001/api/jira/callback

- Go to Settings and copy your Client ID and Client secret.

## Step 2: Set Up Environment Variables (.env file)

1. Go into the backend folder.
2. Create a copy of the .env.example file and rename the copy to .env.
3. Open the new .env file and fill in all the required values:

GOOGLE_API_KEY="YOUR_GOOGLE_AI_STUDIO_API_KEY"
MONGODB_URI="mongodb+srv://<username>:<password>@your-cluster-url.mongodb.net/?retryWrites=true&w=majority"

JIRA_SERVER_URL="YOUR_JIRA_SITE_URL"
JIRA_CLIENT_ID="YOUR_JIRA_APP_CLIENT_ID"
JIRA_CLIENT_SECRET="YOUR_JIRA_APP_CLIENT_SECRET"
JIRA_REDIRECT_URI="http://localhost:5001/api/jira/callback"


### Part - C

## You need both servers running at the same time.

1. Run the Backend Server (in the first terminal):
python app.py

The backend should start on http://localhost:5001.


2. Run the Frontend Server (in the second terminal):
npm start

The application will open at http://localhost:3000.


## How to Use:

1. Register & Login: Create an account and log in.
2. Create a Project: You will land on the project list page. Create a new project.
3. Enter Project Workspace: Click on the project name to enter its detail page.
4. Connect to Jira: Inside the "Provide User Stories" section, click the "Connect to Jira" button and authorize the application.
5. Fetch Stories: Once connected, the Jira project dropdown will populate. Select a project to fetch its stories.
6. Generate Test Cases: Click the "Generate Test Cases" button to have the AI analyze the stories.
7. View & Manage: The results will appear in the TestResults component, where you can view, edit, delete, and export them.