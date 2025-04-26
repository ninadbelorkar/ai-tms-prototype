from flask import Flask, request, jsonify
from flask_cors import CORS
import logging

# Import the generate_text function from our utility module
from utils.gemini_client import generate_text

# --- Flask App Setup ---
app = Flask(__name__)

# Configure Logging for Flask App
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(name)s - %(message)s')
app.logger.setLevel(logging.INFO) # Ensure app logs are captured

# Enable CORS (Cross-Origin Resource Sharing)
# Allows requests from your React frontend (running on http://localhost:3000 by default)
# For production, restrict origins more specifically: CORS(app, origins=["your_frontend_domain.com"])
CORS(app, resources={r"/api/*": {"origins": "*"}}) # Allows all origins for development simplicity

# --- Helper Function for API Responses ---
def create_response(data=None, error=None, status_code=200):
    """Creates a standardized JSON response."""
    if error:
        app.logger.error(f"API Error: {error}") # Log errors
        return jsonify({"error": error}), status_code
    return jsonify(data), status_code

# --- API Endpoints ---

@app.route('/api/health', methods=['GET'])
def health_check():
    """Simple health check endpoint."""
    app.logger.info("Health check endpoint called.")
    return create_response({"status": "Backend is running"})

@app.route('/api/suggest-test-cases', methods=['POST'])
def suggest_test_cases_endpoint():
    """
    API endpoint to analyze requirements text and suggest test cases using Gemini.
    Expects JSON: {"requirements": "text..."}
    """
    app.logger.info("Received request for /api/suggest-test-cases")
    data = request.get_json()

    if not data or 'requirements' not in data or not data['requirements'].strip():
        return create_response(error="Missing or empty 'requirements' field in request body", status_code=400)

    requirements_text = data['requirements']
    app.logger.info(f"Analyzing requirements: {requirements_text[:100]}...") # Log snippet

    # --- Prompt Engineering is KEY ---
    prompt = f"""
    Act as an expert Software Quality Assurance Engineer.
    Analyze the following software requirement and generate a list of relevant test case titles or brief descriptions.
    Focus on covering positive scenarios, negative scenarios, boundary values, and potential edge cases based *only* on the provided text.
    Format the output clearly, preferably as a numbered or bulleted list.

    Requirement:
    ---
    {requirements_text}
    ---

    Suggested Test Cases:
    """

    suggestion = generate_text(prompt)

    if suggestion.startswith("Error:"):
        # Error already logged in gemini_client, just return it
        return create_response(error=suggestion, status_code=500)

    app.logger.info("Successfully generated test case suggestions.")
    return create_response({"suggestions": suggestion})

@app.route('/api/analyze-defect', methods=['POST'])
def analyze_defect_endpoint():
    """
    API endpoint to analyze defect information using Gemini.
    Expects JSON: {"failed_test": "...", "error_logs": "...", "steps_reproduced": "..." (optional)}
    """
    app.logger.info("Received request for /api/analyze-defect")
    data = request.get_json()
    required_fields = ['failed_test', 'error_logs']

    if not data or not all(field in data and data[field].strip() for field in required_fields):
        return create_response(error=f"Missing or empty required fields: {required_fields}", status_code=400)

    failed_test = data['failed_test']
    error_logs = data['error_logs']
    steps = data.get('steps_reproduced', 'Not Provided').strip()
    context = data.get('context', 'None').strip() # Optional additional context

    app.logger.info(f"Analyzing defect for test: {failed_test}")

    # --- Prompt Engineering ---
    prompt = f"""
    Act as an expert Software Debugging Analyst.
    Analyze the following defect information from a failed test execution.
    Based *only* on the provided details (especially the error logs), suggest:
    1.  A plausible **Potential Root Cause**.
    2.  A **Suggested Severity** (choose one: Low, Medium, High, Critical) with a brief justification.
    3.  A concise **Defect Summary Draft** suitable for a bug report title or initial summary.

    Format your response clearly under these three headings.

    Information Provided:
    ---
    Failed Test Case: {failed_test}
    Error Logs:
    ```
    {error_logs}
    ```
    Steps to Reproduce: {steps}
    Additional Context: {context}
    ---

    Analysis:
    """

    analysis = generate_text(prompt)

    if analysis.startswith("Error:"):
        return create_response(error=analysis, status_code=500)

    app.logger.info("Successfully generated defect analysis.")
    return create_response({"analysis": analysis})

@app.route('/api/recommend-automation', methods=['POST'])
def recommend_automation_endpoint():
    """
    API endpoint to recommend test case automation suitability using Gemini.
    Expects JSON: {"test_case_description": "...", "execution_frequency": "...", "stability": "...", "manual_time_mins": ...}
    """
    app.logger.info("Received request for /api/recommend-automation")
    data = request.get_json()
    required_fields = ['test_case_description', 'execution_frequency', 'stability', 'manual_time_mins']

    if not data or not all(field in data for field in required_fields):
         # Basic check for presence, add more specific validation if needed (e.g., is manual_time_mins a number?)
        return create_response(error=f"Missing one or more required fields: {required_fields}", status_code=400)

    try:
        # Validate manual_time_mins is a number
        manual_time = int(data['manual_time_mins'])
        if manual_time <= 0:
            raise ValueError("Manual time must be positive.")
    except (ValueError, TypeError):
        return create_response(error="'manual_time_mins' must be a positive integer.", status_code=400)

    description = data['test_case_description'].strip()
    frequency = data['execution_frequency'].strip()
    stability = data['stability'].strip()

    if not description or not frequency or not stability:
         return create_response(error="Text fields (description, frequency, stability) cannot be empty.", status_code=400)

    app.logger.info(f"Analyzing automation potential for test: {description[:100]}...")

    # --- Prompt Engineering ---
    prompt = f"""
    Act as an expert Test Automation Strategist.
    Evaluate the suitability of the following manual test case for automation based on the provided details.
    Consider the return on investment (ROI) based on frequency, manual effort saved, and feature stability (stable features are better candidates).
    Provide a clear **Recommendation** (choose one: Yes, No, Maybe) and a concise **Justification**.

    Test Case Details:
    ---
    Description: {description}
    Execution Frequency: {frequency} (e.g., Daily, Weekly, Per Release, Rarely)
    Feature Stability: {stability} (e.g., High, Medium, Low/Volatile)
    Estimated Manual Execution Time (minutes): {manual_time}
    ---

    Automation Analysis:
    Recommendation: [Yes/No/Maybe]
    Justification: [Explain your reasoning based on ROI factors like frequency, time saved, and stability vs. maintenance effort.]
    """

    recommendation = generate_text(prompt)

    if recommendation.startswith("Error:"):
        return create_response(error=recommendation, status_code=500)

    app.logger.info("Successfully generated automation recommendation.")
    return create_response({"recommendation": recommendation})


# --- Test Case Adaptation Endpoint (Simplified Text-Based Analysis) ---
# Needs enhancement for real-world use (Git integration, code context)
@app.route('/api/analyze-code-change-impact', methods=['POST'])
def analyze_code_change_impact_endpoint():
    """
    SIMPLIFIED API endpoint to analyze potential impact of a code change on a test case based on text descriptions.
    Expects JSON: {"code_change_description": "...", "test_case_description": "..."}
    """
    app.logger.info("Received request for /api/analyze-code-change-impact")
    data = request.get_json()
    required_fields = ['code_change_description', 'test_case_description']

    if not data or not all(field in data and data[field].strip() for field in required_fields):
        return create_response(error=f"Missing or empty required fields: {required_fields}", status_code=400)

    code_change_desc = data['code_change_description']
    test_case_desc = data['test_case_description']

    app.logger.info(f"Analyzing impact of change '{code_change_desc[:100]}...' on test '{test_case_desc[:100]}...'")

    # --- Prompt Engineering ---
    prompt = f"""
    Act as an AI assisting with Test Impact Analysis.
    You are given a description of a code change and a description of an existing test case.
    Based *only* on the semantics and keywords in these two descriptions, estimate the likelihood that the test case needs to be reviewed or updated due to this code change.

    Provide:
    1.  **Impact Likelihood:** (Choose one: High, Medium, Low, None)
    2.  **Reasoning:** (Briefly explain why you chose that likelihood, linking keywords if possible.)

    Code Change Description:
    ---
    {code_change_desc}
    ---

    Test Case Description:
    ---
    {test_case_desc}
    ---

    Impact Analysis:
    """

    impact_analysis = generate_text(prompt)

    if impact_analysis.startswith("Error:"):
        return create_response(error=impact_analysis, status_code=500)

    app.logger.info("Successfully generated code change impact analysis.")
    return create_response({"impact_analysis": impact_analysis})


# --- Main Execution Guard ---
if __name__ == '__main__':
    # Runs the Flask development server
    # Debug=True enables auto-reloading on code changes and provides detailed error pages
    # Use a port different from the React default (3000)
    # Host='0.0.0.0' makes the server accessible on your network (use with caution)
    app.logger.info("Starting Flask development server...")
    app.run(host='0.0.0.0', port=5001, debug=True)
    # For production, use a proper WSGI server like Gunicorn or uWSGI, e.g.:
    # gunicorn -w 4 -b 0.0.0.0:5001 app:app