# File: backend/app.py
# STARTING FROM YOUR PROVIDED 418-LINE VERSION
# Integrating JSON output for test case suggestions and ensuring all other logic is preserved.

from flask import Flask, request, jsonify
from flask_cors import CORS
import logging
import os
import json # <<<<<<<<<<< ENSURING THIS IMPORT IS PRESENT
from werkzeug.utils import secure_filename
import re

# Import utility functions
from utils.gemini_client import generate_text
from utils.file_parser import parse_pdf, parse_docx, get_file_extension
from utils.figma_client import extract_file_key_from_url, get_figma_file_content, process_figma_data

# --- Flask App Setup ---
app = Flask(__name__)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(name)s - %(message)s')
app.logger.setLevel(logging.INFO)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# --- Configuration ---
UPLOAD_ALLOWED_EXTENSIONS = {'pdf', 'docx'}
MAX_AI_INPUT_CHARS = 18000

# --- Helper Functions ---
def allowed_file(filename):
    return '.' in filename and get_file_extension(filename) in UPLOAD_ALLOWED_EXTENSIONS

def create_response(data=None, error=None, status_code=200):
    if error:
        app.logger.error(f"API Error Response ({status_code}): {error}")
        return jsonify({"error": str(error)}), status_code
    return jsonify(data), status_code

def truncate_text(text: str, max_length: int) -> str:
    if len(text) > max_length:
        app.logger.warning(f"Input text truncated from {len(text)} to {max_length} chars.")
        return text[:max_length]
    return text

# --- NEW HELPER FUNCTIONS FOR JSON TEST CASE OUTPUT ---
def _generate_json_test_case_prompt(content_source_description: str, extracted_content: str, is_figma: bool = False) -> str:
    """Helper to create the standardized JSON prompt for test cases."""
    specialized_intro = "specializing in UI/UX testing" if is_figma else ""
    specialized_focus = "Focus on interactions, visual elements implied by text, navigation, and potential edge cases or missing states suggested by the structure." if is_figma else "Identify requirements, features, or user actions described. Cover positive/negative scenarios, boundary values, and edge cases based *only* on the text."
    test_case_type_name = "UI/UX Test Cases" if is_figma else "Test Cases"

    return f"""
    Act as an expert Software Quality Assurance Engineer {specialized_intro}.
    Analyze the following content extracted from '{content_source_description}' and generate detailed test cases.
    For each test case, provide the following details as key-value pairs: "id" (a unique short identifier like TC-XX-01), "scenario" (a general area, e.g., 'User Login' or 'UI Element: Button'), "test_case_summary" (a concise description of what is being tested), "pre_condition" (what needs to be true before starting), "test_steps" (as an array of strings describing actions), "test_data" (example data as a string or array of strings), and "expected_result" (what should happen).
    Return the output strictly as a JSON array, where each element is an object representing a single test case.
    Do NOT include any introductory text, concluding text, or markdown formatting (like ```json) outside of the JSON array itself. Just the raw JSON array.

    Example of a single test case object structure:
    {{
      "id": "TC-LOGIN-01",
      "scenario": "User Login Functionality",
      "test_case_summary": "Verify successful login with valid credentials.",
      "pre_condition": "User has a valid account. Application login page is accessible.",
      "test_steps": ["Navigate to login page.", "Enter valid username in username field.", "Enter valid password in password field.", "Click 'Login' button."],
      "test_data": ["Username: testuser@example.com", "Password: ValidPassword123"],
      "expected_result": "User is successfully logged in and redirected to the dashboard. Welcome message is displayed."
    }}
    {specialized_focus}

    Extracted Content:
    ---
    {extracted_content}
    ---

    JSON Array of {test_case_type_name}:
    """

def _handle_ai_test_case_response(ai_response_text: str, source_description: str):
    """
    Parses AI response for test cases, expecting JSON.
    Includes detailed logging for debugging string cleaning.
    """
    app.logger.info(f"--- [DEBUG] ENTERING _handle_ai_test_case_response for {source_description} ---")
    app.logger.debug(f"[DEBUG] Raw AI Response (length {len(ai_response_text)}):\n{repr(ai_response_text)}")

    if ai_response_text.startswith("Error:"): # Error from gemini_client.py
        app.logger.error(f"AI generation error from gemini_client for {source_description}: {ai_response_text}")
        return create_response(error=ai_response_text, status_code=500)

    cleaned_response_text = ai_response_text # Initialize with the original

    try:
        # Step 1: Initial strip of global whitespace
        current_step = "Initial strip"
        cleaned_response_text = ai_response_text.strip()
        app.logger.debug(f"[DEBUG] After '{current_step}' (length {len(cleaned_response_text)}):\n{repr(cleaned_response_text)}")

        # Step 2: Remove ```json prefix
        prefix_to_remove = "```json"
        current_step = f"Remove prefix '{prefix_to_remove}'"
        if cleaned_response_text.startswith(prefix_to_remove):
            cleaned_response_text = cleaned_response_text[len(prefix_to_remove):]
            app.logger.debug(f"[DEBUG] After '{current_step}' (length {len(cleaned_response_text)}):\n{repr(cleaned_response_text)}")
        else:
            app.logger.debug(f"[DEBUG] Prefix '{prefix_to_remove}' not found. Skipping remove prefix.")

        # Step 3: Remove ``` suffix
        suffix_to_remove = "```"
        current_step = f"Remove suffix '{suffix_to_remove}'"
        if cleaned_response_text.endswith(suffix_to_remove): # Check before removing
            cleaned_response_text = cleaned_response_text[:-len(suffix_to_remove)]
            app.logger.debug(f"[DEBUG] After '{current_step}' (length {len(cleaned_response_text)}):\n{repr(cleaned_response_text)}")
        else:
            app.logger.debug(f"[DEBUG] Suffix '{suffix_to_remove}' not found. Skipping remove suffix.")

        # Step 4: Final strip of any whitespace exposed by prefix/suffix removal
        current_step = "Final strip"
        cleaned_response_text = cleaned_response_text.strip()
        app.logger.debug(f"[DEBUG] After '{current_step}' (length {len(cleaned_response_text)}):\n{repr(cleaned_response_text)}")


        if not cleaned_response_text:
            app.logger.error(f"Cleaned AI response is empty for {source_description}.")
            # Pass the original ai_response_text so the user sees what the AI returned
            raise json.JSONDecodeError("Cleaned AI response resulted in an empty string.", ai_response_text, 0)

        app.logger.info(f"Attempting to parse as JSON for {source_description} (length {len(cleaned_response_text)}).")
        test_case_suggestions = json.loads(cleaned_response_text)

        if not isinstance(test_case_suggestions, list):
             app.logger.error(f"Parsed AI response is not a list for {source_description}. Type: {type(test_case_suggestions)}")
             # Pass the original ai_response_text for user visibility
             raise json.JSONDecodeError("AI response did not parse into a JSON array.", ai_response_text, 0)

        app.logger.info(f"Successfully parsed AI JSON response for {source_description}, found {len(test_case_suggestions)} test cases.")
        return create_response({"suggestions": test_case_suggestions, "source": source_description})

    except json.JSONDecodeError as e:
        app.logger.error(f"JSONDecodeError for {source_description}: {e}")
        app.logger.error(f"Failed to parse the following text as JSON (after cleaning attempts):\n>>>>>>>>>>\n{cleaned_response_text if 'cleaned_response_text' in locals() else 'ERROR: cleaned_response_text not defined'}\n<<<<<<<<<<")
        app.logger.debug(f"Original AI Response (raw) for this failed parse:\n>>>>>>>>>>\n{ai_response_text}\n<<<<<<<<<<")
        
        return create_response({
            "suggestions": ai_response_text, # Send the original raw AI text on error
            "source": source_description,
            "warning": f"AI response was not valid JSON. Error: {e}. Displaying raw text. Please check AI prompt or model behavior."
        }, status_code=200) # 200 so frontend processes it, warning indicates issue
    except Exception as e:
        # Catch any other unexpected errors during handling
        app.logger.error(f"Unexpected error in _handle_ai_test_case_response for {source_description}: {e}", exc_info=True)
        return create_response(error="An unexpected error occurred while processing the AI response.", status_code=500)
# --- END OF NEW HELPER FUNCTIONS ---


# --- API Endpoints ---

@app.route('/api/health', methods=['GET'])
def health_check():
    app.logger.info("Health check endpoint called.")
    return create_response({"status": "Backend is running"})

# --- Test Case Suggestion Endpoints ---

@app.route('/api/suggest-test-cases', methods=['POST'])
def suggest_test_cases_from_text_endpoint():
    app.logger.info("Received request for /api/suggest-test-cases (text input)")
    data = request.get_json()
    if not data or 'requirements' not in data or not data['requirements'].strip():
        return create_response(error="Missing or empty 'requirements' field in request body", status_code=400)

    requirements_text = truncate_text(data['requirements'], MAX_AI_INPUT_CHARS)
    app.logger.info(f"Analyzing requirements text (first 100 chars): {requirements_text[:100]}...")

    # MODIFIED: Use the new JSON prompt helper
    prompt = _generate_json_test_case_prompt("Text Input", requirements_text)

    try:
        ai_response_text = generate_text(prompt)
        # MODIFIED: Use the new JSON response handler
        return _handle_ai_test_case_response(ai_response_text, "Text Input")
    except Exception as e:
        app.logger.error(f"Error during GenAI call for text input: {e}", exc_info=True)
        return create_response(error="Failed to generate suggestions due to an internal server error.", status_code=500)


@app.route('/api/suggest-test-cases-from-file', methods=['POST'])
def suggest_test_cases_from_file_endpoint():
    app.logger.info("Received request for /api/suggest-test-cases-from-file")
    if 'file' not in request.files:
        return create_response(error="No file part in the request", status_code=400)
    file = request.files['file']
    if file.filename == '':
        return create_response(error="No selected file", status_code=400)

    if file and allowed_file(file.filename):
        original_filename = secure_filename(file.filename)
        app.logger.info(f"Processing uploaded file: {original_filename}")
        file_stream = file.stream
        file_ext = get_file_extension(original_filename)
        extracted_text = ""
        source_description = f"File: {original_filename}" # For consistent source naming

        try:
            if file_ext == 'pdf':
                extracted_text = parse_pdf(file_stream)
            elif file_ext == 'docx':
                extracted_text = parse_docx(file_stream)
            # No 'else' needed here as allowed_file check handles it, but good for safety if logic changes
            # else: return create_response(error="Internal error: Unexpected file type allowed.", status_code=500)

            if not extracted_text or not extracted_text.strip():
                 return create_response(error="Could not extract text from the file or file is empty.", status_code=400)

            app.logger.info(f"Extracted {len(extracted_text)} characters from {original_filename}")
            extracted_text = truncate_text(extracted_text, MAX_AI_INPUT_CHARS)

            # MODIFIED: Use the new JSON prompt helper
            prompt = _generate_json_test_case_prompt(source_description, extracted_text)

            ai_response_text = generate_text(prompt)
            # MODIFIED: Use the new JSON response handler
            # The 'source' field in the response will now correctly be `source_description`
            return _handle_ai_test_case_response(ai_response_text, source_description)

        except ValueError as ve:
             app.logger.error(f"File parsing error for {original_filename}: {ve}")
             return create_response(error=str(ve), status_code=400)
        except Exception as e:
             app.logger.error(f"Error processing file {original_filename}: {e}", exc_info=True)
             return create_response(error="An internal server error occurred while processing the file.", status_code=500)
    else:
        return create_response(error="File type not allowed. Please upload PDF or DOCX.", status_code=400)


@app.route('/api/suggest-test-cases-from-figma', methods=['POST'])
def suggest_test_cases_from_figma_endpoint():
    app.logger.info("Received request for /api/suggest-test-cases-from-figma")
    data = request.get_json()
    required_fields = ['figma_url', 'figma_token']
    if not data or not all(field in data and data[field].strip() for field in required_fields):
        return create_response(error=f"Missing or empty required fields: {required_fields}", status_code=400)

    figma_url = data['figma_url']
    figma_token = data['figma_token']
    app.logger.info(f"Processing Figma URL: {figma_url}")
    source_description = "" # Will be updated after extracting file_key

    try:
        file_key = extract_file_key_from_url(figma_url)
        if not file_key:
            return create_response(error="Could not extract valid File Key from the provided Figma URL.", status_code=400)
        app.logger.info(f"Extracted Figma file key: {file_key}")
        source_description = f"Figma File ({file_key})" # Update source description

        figma_json_data = get_figma_file_content(file_key, figma_token) # Renamed from figma_json
        extracted_text = process_figma_data(figma_json_data)

        if not extracted_text or not extracted_text.strip():
             return create_response(error="Could not extract any text content from the Figma file via API.", status_code=400)
        app.logger.info(f"Extracted {len(extracted_text)} characters from Figma file {file_key}")
        extracted_text = truncate_text(extracted_text, MAX_AI_INPUT_CHARS)

        # MODIFIED: Use the new JSON prompt helper, passing is_figma=True
        prompt = _generate_json_test_case_prompt(source_description, extracted_text, is_figma=True)
        # The original specialized Figma prompt logic is now within _generate_json_test_case_prompt

        ai_response_text = generate_text(prompt)
        # MODIFIED: Use the new JSON response handler
        return _handle_ai_test_case_response(ai_response_text, source_description)

    except ConnectionError as ce:
         app.logger.error(f"Figma API connection/request error: {ce}")
         return create_response(error=str(ce), status_code=502)
    except ValueError as ve: # Includes JSONDecodeError from Figma API response if not valid JSON
         app.logger.error(f"Figma data processing error: {ve}", exc_info=True)
         return create_response(error=f"Error processing Figma data: {ve}", status_code=500)
    except Exception as e:
         app.logger.error(f"Unexpected error processing Figma URL {figma_url}: {e}", exc_info=True)
         return create_response(error="An internal server error occurred processing the Figma request.", status_code=500)


# --- Other AI Feature Endpoints (Unchanged from your provided version) ---

@app.route('/api/analyze-defect', methods=['POST'])
def analyze_defect_endpoint():
    app.logger.info("Received request for /api/analyze-defect")
    data = request.get_json()
    required_fields = ['failed_test', 'error_logs']
    if not data or not all(field in data and data[field].strip() for field in required_fields):
        return create_response(error=f"Missing or empty required fields: {required_fields}", status_code=400)

    failed_test = data['failed_test']
    error_logs = truncate_text(data['error_logs'], MAX_AI_INPUT_CHARS // 2)
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
    app.logger.info("Received request for /api/recommend-automation")
    data = request.get_json()
    required_fields = ['test_case_description', 'execution_frequency', 'stability', 'manual_time_mins']
    if not data or not all(field in data for field in required_fields):
        return create_response(error=f"Missing one or more required fields: {required_fields}", status_code=400)
    try:
        manual_time = int(data['manual_time_mins'])
        if manual_time <= 0: raise ValueError("Manual time must be positive.") # Added message
    except (ValueError, TypeError):
        return create_response(error="'manual_time_mins' must be a positive integer.", status_code=400)

    description = data['test_case_description'].strip()
    frequency = data['execution_frequency'].strip()
    stability = data['stability'].strip()
    if not description or not frequency or not stability:
         return create_response(error="Text fields (description, frequency, stability) cannot be empty.", status_code=400)
    app.logger.info(f"Analyzing automation potential for test: {description[:100]}...")
    description = truncate_text(description, MAX_AI_INPUT_CHARS // 2)

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
    app.logger.info("Starting Flask development server...")
    app.run(host='0.0.0.0', port=5001, debug=True)