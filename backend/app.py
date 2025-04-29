# File: backend/app.py
# Combines all features: Text, File (PDF/DOCX), Figma input for test case suggestions,
# plus defect analysis, automation recommendation, and code change impact.

from flask import Flask, request, jsonify
from flask_cors import CORS
import logging
import os
from werkzeug.utils import secure_filename # For secure file handling (though not saving here)

# Import utility functions
from utils.gemini_client import generate_text
from utils.file_parser import parse_pdf, parse_docx, get_file_extension
from utils.figma_client import extract_file_key_from_url, get_figma_file_content, process_figma_data

# --- Flask App Setup ---
app = Flask(__name__)

# Configure Logging
# Use basicConfig for simple setup, or more advanced logging if needed
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(name)s - %(message)s')
# Ensure Flask's logger uses the configured level
app.logger.setLevel(logging.INFO)

# Enable CORS (Cross-Origin Resource Sharing) for all origins during development
# Restrict origins in production, e.g., origins=["https://your-frontend-domain.com"]
CORS(app, resources={r"/api/*": {"origins": "*"}})

# --- Configuration ---
# Allowed extensions for file uploads
UPLOAD_ALLOWED_EXTENSIONS = {'pdf', 'docx'}
# Max text length to send to AI (to prevent exceeding limits/costs)
MAX_AI_INPUT_CHARS = 18000 # Adjust based on testing and model limits

# --- Helper Functions ---

def allowed_file(filename):
    """Checks if the uploaded file has an allowed extension."""
    return '.' in filename and \
           get_file_extension(filename) in UPLOAD_ALLOWED_EXTENSIONS

def create_response(data=None, error=None, status_code=200):
    """Creates a standardized JSON response and logs errors."""
    if error:
        app.logger.error(f"API Error Response ({status_code}): {error}")
        return jsonify({"error": str(error)}), status_code # Ensure error is string
    return jsonify(data), status_code

def truncate_text(text: str, max_length: int) -> str:
    """Truncates text if it exceeds the maximum length."""
    if len(text) > max_length:
        app.logger.warning(f"Input text truncated from {len(text)} to {max_length} chars.")
        return text[:max_length]
    return text

# --- API Endpoints ---

@app.route('/api/health', methods=['GET'])
def health_check():
    """Simple health check endpoint."""
    app.logger.info("Health check endpoint called.")
    return create_response({"status": "Backend is running"})

# --- Test Case Suggestion Endpoints ---

@app.route('/api/suggest-test-cases', methods=['POST'])
def suggest_test_cases_from_text_endpoint():
    """
    Analyzes requirements TEXT and suggests test cases using Gemini.
    Expects JSON: {"requirements": "text..."}
    """
    app.logger.info("Received request for /api/suggest-test-cases (text input)")
    data = request.get_json()

    if not data or 'requirements' not in data or not data['requirements'].strip():
        return create_response(error="Missing or empty 'requirements' field in request body", status_code=400)

    requirements_text = truncate_text(data['requirements'], MAX_AI_INPUT_CHARS)
    app.logger.info(f"Analyzing requirements text: {requirements_text[:100]}...")

    prompt = f"""
    Act as an expert Software Quality Assurance Engineer.
    Analyze the following software requirement text and generate a list of relevant test case titles or brief descriptions.
    Cover positive scenarios, negative scenarios, boundary values, and potential edge cases based *only* on the provided text.
    Format the output clearly, preferably as a numbered or bulleted list.

    Requirement Text:
    ---
    {requirements_text}
    ---

    Suggested Test Cases:
    """

    try:
        suggestion = generate_text(prompt)
        if suggestion.startswith("Error:"):
            return create_response(error=suggestion, status_code=500) # AI specific error

        app.logger.info("Successfully generated test case suggestions from text.")
        return create_response({"suggestions": suggestion, "source": "Text Input"})
    except Exception as e:
        app.logger.error(f"Error during GenAI call for text input: {e}", exc_info=True)
        return create_response(error="Failed to generate suggestions due to an internal error.", status_code=500)


@app.route('/api/suggest-test-cases-from-file', methods=['POST'])
def suggest_test_cases_from_file_endpoint():
    """
    Analyzes an uploaded file (PDF/DOCX) and suggests test cases.
    Expects multipart/form-data with a file part named 'file'.
    """
    app.logger.info("Received request for /api/suggest-test-cases-from-file")

    if 'file' not in request.files:
        return create_response(error="No file part in the request", status_code=400)

    file = request.files['file']

    if file.filename == '':
        return create_response(error="No selected file", status_code=400)

    if file and allowed_file(file.filename):
        original_filename = secure_filename(file.filename) # Sanitize filename
        app.logger.info(f"Processing uploaded file: {original_filename}")
        file_stream = file.stream
        file_ext = get_file_extension(original_filename)
        extracted_text = ""

        try:
            # 1. Parse File Content
            if file_ext == 'pdf':
                extracted_text = parse_pdf(file_stream)
            elif file_ext == 'docx':
                extracted_text = parse_docx(file_stream)
            else: # Should not happen due to allowed_file check
                return create_response(error="Internal error: Unexpected file type allowed.", status_code=500)

            if not extracted_text or not extracted_text.strip():
                 return create_response(error="Could not extract text from the file or file is empty.", status_code=400)

            app.logger.info(f"Extracted {len(extracted_text)} characters from {original_filename}")
            extracted_text = truncate_text(extracted_text, MAX_AI_INPUT_CHARS)

            # 2. Generate Prompt for AI
            prompt = f"""
            Act as an expert Software Quality Assurance Engineer.
            Analyze the following content extracted from the document '{original_filename}' and generate a list of relevant test case titles or brief descriptions.
            Identify requirements, features, or user actions described. Cover positive/negative scenarios, boundary values, and edge cases based *only* on the text.
            Format the output clearly, preferably as a numbered or bulleted list.

            Extracted Document Content:
            ---
            {extracted_text}
            ---

            Suggested Test Cases:
            """

            # 3. Call AI Service
            suggestion = generate_text(prompt)
            if suggestion.startswith("Error:"):
                return create_response(error=suggestion, status_code=500)

            app.logger.info(f"Successfully generated suggestions for file {original_filename}")
            return create_response({"suggestions": suggestion, "source": f"File: {original_filename}"})

        except ValueError as ve: # Catch specific parsing errors from utils
             app.logger.error(f"File parsing error for {original_filename}: {ve}")
             return create_response(error=str(ve), status_code=400)
        except Exception as e:
             app.logger.error(f"Error processing file {original_filename}: {e}", exc_info=True)
             return create_response(error="An internal server error occurred while processing the file.", status_code=500)

    else:
        return create_response(error="File type not allowed. Please upload PDF or DOCX.", status_code=400)


@app.route('/api/suggest-test-cases-from-figma', methods=['POST'])
def suggest_test_cases_from_figma_endpoint():
    """
    Analyzes Figma file content (fetched via API) and suggests test cases.
    Expects JSON: {"figma_url": "...", "figma_token": "..."}
    """
    app.logger.info("Received request for /api/suggest-test-cases-from-figma")
    data = request.get_json()

    required_fields = ['figma_url', 'figma_token']
    if not data or not all(field in data and data[field].strip() for field in required_fields):
        return create_response(error=f"Missing or empty required fields: {required_fields}", status_code=400)

    figma_url = data['figma_url']
    figma_token = data['figma_token']
    app.logger.info(f"Processing Figma URL: {figma_url}")

    try:
        # 1. Extract File Key
        file_key = extract_file_key_from_url(figma_url)
        if not file_key:
            return create_response(error="Could not extract valid File Key from the provided Figma URL.", status_code=400)
        app.logger.info(f"Extracted Figma file key: {file_key}")

        # 2. Fetch Figma File Content via API
        figma_json = get_figma_file_content(file_key, figma_token)

        # 3. Process JSON to Extract Text
        extracted_text = process_figma_data(figma_json)
        if not extracted_text or not extracted_text.strip():
             return create_response(error="Could not extract any text content from the Figma file via API.", status_code=400)
        app.logger.info(f"Extracted {len(extracted_text)} characters from Figma file {file_key}")
        extracted_text = truncate_text(extracted_text, MAX_AI_INPUT_CHARS)

        # 4. Generate Prompt for AI
        prompt = f"""
        Act as an expert Software Quality Assurance Engineer specializing in UI/UX testing.
        Analyze the following content extracted from a Figma design file (File Key: {file_key}). The content includes text from UI elements and structural information like frame/component names (e.g., [FRAME: Login Screen]).
        Based *only* on this extracted design information, identify potential UI elements, user flows, actions, and display requirements. Generate a list of relevant test case titles or brief descriptions for testing the user interface and user experience.
        Focus on interactions, visual elements implied by text, navigation, and potential edge cases or missing states suggested by the structure.
        Format the output clearly, preferably as a numbered or bulleted list.

        Extracted Figma Content:
        ---
        {extracted_text}
        ---

        Suggested UI/UX Test Cases:
        """

        # 5. Call AI Service
        suggestion = generate_text(prompt)
        if suggestion.startswith("Error:"):
            return create_response(error=suggestion, status_code=500)

        app.logger.info(f"Successfully generated suggestions for Figma file {file_key}")
        return create_response({"suggestions": suggestion, "source": f"Figma File ({file_key})"})

    except ConnectionError as ce: # Catch specific errors from figma_client
         app.logger.error(f"Figma API connection/request error: {ce}")
         return create_response(error=str(ce), status_code=502) # 502 Bad Gateway - upstream error
    except ValueError as ve: # Catch processing errors (e.g., bad JSON from Figma)
         app.logger.error(f"Figma data processing error: {ve}", exc_info=True)
         return create_response(error=f"Error processing Figma data: {ve}", status_code=500)
    except Exception as e:
         app.logger.error(f"Unexpected error processing Figma URL {figma_url}: {e}", exc_info=True)
         return create_response(error="An internal server error occurred processing the Figma request.", status_code=500)


# --- Other AI Feature Endpoints ---

@app.route('/api/analyze-defect', methods=['POST'])
def analyze_defect_endpoint():
    """
    Analyzes defect information using Gemini.
    Expects JSON: {"failed_test": "...", "error_logs": "...", "steps_reproduced": "..." (optional), "context": "..." (optional)}
    """
    app.logger.info("Received request for /api/analyze-defect")
    data = request.get_json()
    required_fields = ['failed_test', 'error_logs']

    if not data or not all(field in data and data[field].strip() for field in required_fields):
        return create_response(error=f"Missing or empty required fields: {required_fields}", status_code=400)

    failed_test = data['failed_test']
    error_logs = truncate_text(data['error_logs'], MAX_AI_INPUT_CHARS // 2) # Limit log size too
    steps = data.get('steps_reproduced', 'Not Provided').strip()
    context = data.get('context', 'None').strip()
    app.logger.info(f"Analyzing defect for test: {failed_test}")

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
    try:
        analysis = generate_text(prompt)
        if analysis.startswith("Error:"):
            return create_response(error=analysis, status_code=500)

        app.logger.info("Successfully generated defect analysis.")
        return create_response({"analysis": analysis})
    except Exception as e:
        app.logger.error(f"Error during GenAI call for defect analysis: {e}", exc_info=True)
        return create_response(error="Failed to generate defect analysis due to an internal error.", status_code=500)


@app.route('/api/recommend-automation', methods=['POST'])
def recommend_automation_endpoint():
    """
    Recommends test case automation suitability using Gemini.
    Expects JSON: {"test_case_description": "...", "execution_frequency": "...", "stability": "...", "manual_time_mins": ...}
    """
    app.logger.info("Received request for /api/recommend-automation")
    data = request.get_json()
    required_fields = ['test_case_description', 'execution_frequency', 'stability', 'manual_time_mins']

    if not data or not all(field in data for field in required_fields):
        return create_response(error=f"Missing one or more required fields: {required_fields}", status_code=400)

    try:
        manual_time = int(data['manual_time_mins'])
        if manual_time <= 0: raise ValueError()
    except (ValueError, TypeError):
        return create_response(error="'manual_time_mins' must be a positive integer.", status_code=400)

    description = data['test_case_description'].strip()
    frequency = data['execution_frequency'].strip()
    stability = data['stability'].strip()

    if not description or not frequency or not stability:
         return create_response(error="Text fields (description, frequency, stability) cannot be empty.", status_code=400)

    app.logger.info(f"Analyzing automation potential for test: {description[:100]}...")
    description = truncate_text(description, MAX_AI_INPUT_CHARS // 2) # Limit description size

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
    try:
        recommendation = generate_text(prompt)
        if recommendation.startswith("Error:"):
            return create_response(error=recommendation, status_code=500)

        app.logger.info("Successfully generated automation recommendation.")
        return create_response({"recommendation": recommendation})
    except Exception as e:
        app.logger.error(f"Error during GenAI call for automation recommendation: {e}", exc_info=True)
        return create_response(error="Failed to generate recommendation due to an internal error.", status_code=500)


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

    code_change_desc = truncate_text(data['code_change_description'], MAX_AI_INPUT_CHARS // 2)
    test_case_desc = truncate_text(data['test_case_description'], MAX_AI_INPUT_CHARS // 2)
    app.logger.info(f"Analyzing impact of change '{code_change_desc[:100]}...' on test '{test_case_desc[:100]}...'")

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
    try:
        impact_analysis = generate_text(prompt)
        if impact_analysis.startswith("Error:"):
            return create_response(error=impact_analysis, status_code=500)

        app.logger.info("Successfully generated code change impact analysis.")
        return create_response({"impact_analysis": impact_analysis})
    except Exception as e:
        app.logger.error(f"Error during GenAI call for code change impact: {e}", exc_info=True)
        return create_response(error="Failed to generate impact analysis due to an internal error.", status_code=500)

# --- Main Execution Guard ---
if __name__ == '__main__':
    # Runs the Flask development server
    # Debug=True enables auto-reloading and detailed error pages (disable in production)
    # Host='0.0.0.0' makes the server accessible on your local network
    app.logger.info("Starting Flask development server...")
    app.run(host='0.0.0.0', port=5001, debug=True) # Use a port like 5001, not 3000 (React default)