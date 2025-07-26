This is an application that leverages artificial intelligence to streamline and enhance the software test case management process. The system uses the Google Gemini API to generate, analyze, and provide recommendations on test cases based on various inputs, and persists all data to a cloud-hosted MongoDB database.

## Key Features

-   **Multi-Source Test Case Generation:** Generates detailed, structured test cases from multiple input sources like Text, Documents (PDF/DOCX), UI Screenshots (ZIP), and Figma links.
-   **Intelligent Defect Analysis:** Provides AI-driven analysis of defect reports, suggesting potential root causes and severity.
-   **Interactive UI:** A user-friendly interface allows users to edit and save AI-generated content.
-   **Project Dashboard:** A central dashboard provides key metrics, charts, and a history of recent generation events and analyses.


## Tech Stack

-   **Frontend:** React.js
-   **Backend:** Python with Flask
-   **AI / LLM:** Google Gemini API
-   **Database:** MongoDB Atlas (Cloud-hosted)
-   **ODM:** MongoEngine

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
Generated bash
pip install -r requirements.txt

- Set up environment variables:
Create a copy of .env.example and name it .env.
Open the new .env file and add your GOOGLE_API_KEY and MONGODB_URI.


## Step 3: Set Up Frontend

- Open a new terminal.
Navigate to the frontend directory:
cd frontend

- Install dependencies:
npm install

### Part - B

## Step 1: Set up environment variables (.env file)

1.  Go into the `backend` folder.
2.  In the backend directory, find the file named .env.example
3.  Create a copy of this file and rename the copy to .env
4.  Delete everything inside the new .env
5.  Paste the following text into it.

GOOGLE_API_KEY="YOUR_GOOGLE_AI_STUDIO_API_KEY_HERE"
MONGODB_URI="mongodb+srv://<username>:<password>@your-cluster-url.mongodb.net/?retryWrites=true&w=majority"

## Step 2: Run the Application

- Run the Backend Server (in the first terminal):
python app.py

- Run the Frontend Server (in the second terminal):
npm start

- The application will open at http://localhost:3000.