# File: backend/app.py
# STARTING FROM YOUR PROVIDED 418-LINE VERSION
# CORRECTLY Integrating JSON output for ALL AI features.

from flask import Flask, request, jsonify
from flask_cors import CORS
import logging
import os
import json # <<<<<<<<<<< ENSURED THIS IMPORT IS PRESENT
from werkzeug.utils import secure_filename
import re # Will use for robust cleaning
from utils.image_parser import process_zip_file_for_images

# Import utility functions
from utils.gemini_client import generate_text
from utils.file_parser import parse_pdf, parse_docx, get_file_extension
# Assuming figma_client.py exists and has these functions:
from utils.figma_client import extract_file_key_from_url, get_figma_file_content, process_figma_data

# --- Flask App Setup ---
app = Flask(__name__)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(name)s - %(message)s')
app.logger.setLevel(logging.INFO)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# --- Configuration ---
UPLOAD_ALLOWED_EXTENSIONS = {'pdf', 'docx', 'zip'}
MAX_AI_INPUT_CHARS = 18000

# --- Helper Functions (from your original) ---
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

# --- NEW/MODIFIED HELPER FUNCTIONS FOR JSON HANDLING ---

def _clean_ai_response_for_json(ai_response_text: str) -> str:
    """Cleans common AI artifacts around JSON output using regex for robustness."""
    app.logger.debug(f"[CLEAN_FN] Input to clean (len {len(ai_response_text)}): {repr(ai_response_text)[:200]}...")
    # Try to extract content between ```json and ``` or just ``` and ```
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", ai_response_text, re.DOTALL)
    if match:
        cleaned = match.group(1).strip()
        app.logger.debug(f"[CLEAN_FN] Extracted from markdown (len {len(cleaned)}): {repr(cleaned)[:200]}...")
        return cleaned
    else:
        # If no markdown fences, just strip whitespace
        cleaned = ai_response_text.strip()
        app.logger.debug(f"[CLEAN_FN] No markdown, just stripped (len {len(cleaned)}): {repr(cleaned)[:200]}...")
        return cleaned


def _generate_json_test_case_prompt(content_source_description: str, extracted_content: str, is_figma: bool = False) -> str:
    """
    MODIFIED Helper to create a more detailed and structured JSON prompt for test cases.
    It now groups test cases by scenario and is more demanding about depth.
    """
    specialized_intro = "specializing in UI/UX testing" if is_figma else ""
    specialized_focus = "Focus on interactions, visual elements, navigation, and edge cases." if is_figma else "Identify requirements, features, and user actions. Cover all positive, negative, and boundary conditions."
    test_case_type_name = "UI/UX Test Scenarios" if is_figma else "Test Scenarios"

    return f"""
    Act as an expert and extremely detail-oriented Software Quality Assurance Engineer {specialized_intro}.
    Your task is to dissect the requirements from '{content_source_description}' and create an exhaustive set of IN-DEPTH test cases. Do not provide high-level or general test cases. Each test case must be a specific, executable action.

    For each functional area or feature you identify, create a "scenario" object. Each scenario object must contain:
    - "scenario_title": (string) The name of the feature or area being tested (e.g., "Book Management: Add New Book").
    - "positive_test_cases": (array of objects) Must include happy path, and tests for all optional fields or alternative valid inputs. Be thorough.
    - "negative_test_cases": (array of objects) Must include tests for each validation rule mentioned, invalid data types, boundary conditions (min/max/empty values), and error handling. Be thorough.

    Each individual test case object (within the positive and negative arrays) must have the following keys:
    - "id": (string) A unique identifier like TC-ADD-POS-01.
    - "test_case_summary": (string) Be very specific. Instead of "Test login", use "Test login with valid username and valid password".
    - "test_steps": (array of strings) Provide clear, discrete user actions.
    - "test_data": (array of strings) Provide concrete example data. For a negative test, provide the specific data that causes the failure.
    - "expected_result": (string) The specific expected outcome.
    - "priority": (string, one of: "P1", "P2", "P3") - P1 being highest.
    - "severity": (string, one of: "High", "Medium", "Low") - High being most critical failure.

    Return the output strictly as a JSON array of these "scenario" objects. Do not include any introductory text, concluding text, or markdown formatting (like ```json) outside of the JSON array itself.

    Example of the required detail and structure:
    [
      {{
        "scenario_title": "Book Management: Add New Book",
        "positive_test_cases": [
          {{
            "id": "TC-ADD-POS-01",
            "test_case_summary": "Add a new book with all valid data, including all optional fields.",
            "test_steps": ["Navigate to 'Add Book'", "Fill all fields with valid data including optional notes", "Click Save"],
            "test_data": ["ISBN: 9780123456789", "Title: A Valid Book", "Notes: First edition copy."],
            "expected_result": "Success message is shown. Book appears in inventory with all data saved correctly.",
            "priority": "P1",
            "severity": "High"
          }}
        ],
        "negative_test_cases": [
          {{
            "id": "TC-ADD-NEG-01",
            "test_case_summary": "Attempt to add a book with a duplicate ISBN.",
            "test_steps": ["Navigate to 'Add Book'", "Enter an ISBN that already exists in the system", "Fill other fields", "Click Save"],
            "test_data": ["ISBN: 9780000000001 (known duplicate)"],
            "expected_result": "An inline error message 'ISBN already exists' is displayed. The form is not submitted.",
            "priority": "P1",
            "severity": "High"
          }},
          {{
            "id": "TC-ADD-NEG-02",
            "test_case_summary": "Attempt to add a book with an empty required 'Title' field.",
            "test_steps": ["Navigate to 'Add Book'", "Leave the 'Title' field empty", "Fill other required fields", "Click Save"],
            "test_data": ["Title: (empty)"],
            "expected_result": "A validation error message appears next to the 'Title' field, indicating it cannot be empty.",
            "priority": "P1",
            "severity": "Medium"
          }}
        ]
      }}
    ]

    {specialized_focus}

    Extracted Content:
    ---
    {extracted_content}
    ---

    JSON Array of {test_case_type_name}:
    """

def _handle_ai_json_array_response(ai_response_text: str, source_description: str):
    """Parses AI response expecting a JSON array (e.g., for test cases)."""
    app.logger.debug(f"[JSON_ARRAY_HANDLER] Raw AI for {source_description} (len {len(ai_response_text)}): {repr(ai_response_text)[:200]}...")
    if ai_response_text.startswith("Error:"): # Error from gemini_client
        return create_response(error=ai_response_text, status_code=500)
    
    cleaned_text = "" # Initialize to ensure it's defined for the final except block
    try:
        cleaned_text = _clean_ai_response_for_json(ai_response_text)
        app.logger.debug(f"[JSON_ARRAY_HANDLER] Cleaned for {source_description} (len {len(cleaned_text)}): {repr(cleaned_text)[:200]}...")
        if not cleaned_text: raise json.JSONDecodeError("Cleaned AI response is empty.", cleaned_text, 0)
        
        parsed_data = json.loads(cleaned_text)
        if not isinstance(parsed_data, list):
            app.logger.error(f"Parsed AI response for {source_description} is not a list. Type: {type(parsed_data)}")
            raise json.JSONDecodeError("AI response did not parse into a JSON array.", cleaned_text, 0)
        
        app.logger.info(f"Successfully parsed AI JSON array for {source_description}, found {len(parsed_data)} items.")
        return create_response({"suggestions": parsed_data, "source": source_description})
    except json.JSONDecodeError as e:
        app.logger.error(f"JSONDecodeError (array expected) for {source_description}: {e}")
        app.logger.debug(f"Text that failed array parsing (cleaned):\n>>>>>>>>>>\n{cleaned_text}\n<<<<<<<<<<")
        app.logger.debug(f"Original raw AI text for this error:\n>>>>>>>>>>\n{ai_response_text}\n<<<<<<<<<<")
        return create_response({
            "suggestions": ai_response_text, "source": source_description,
            "warning": f"AI response was not valid JSON array. Error: {e}. Displaying raw text."
        }, status_code=200)
    except Exception as e:
        app.logger.error(f"Unexpected error in _handle_ai_json_array_response for {source_description}: {e}", exc_info=True)
        return create_response(error="Unexpected error processing AI array response.", status_code=500)

def _handle_ai_json_object_response(ai_response_text: str, source_description: str, response_key: str):
    """Parses AI response expecting a single JSON object."""
    app.logger.debug(f"[JSON_OBJECT_HANDLER] Raw AI for {source_description} (len {len(ai_response_text)}): {repr(ai_response_text)[:200]}...")
    if ai_response_text.startswith("Error:"):
        return create_response(error=ai_response_text, status_code=500)
    
    cleaned_text = "" # Initialize
    try:
        cleaned_text = _clean_ai_response_for_json(ai_response_text)
        app.logger.debug(f"[JSON_OBJECT_HANDLER] Cleaned for {source_description} (len {len(cleaned_text)}): {repr(cleaned_text)[:200]}...")
        if not cleaned_text: raise json.JSONDecodeError("Cleaned AI response is empty.", cleaned_text, 0)
        
        parsed_data = json.loads(cleaned_text)
        if not isinstance(parsed_data, dict):
            app.logger.error(f"Parsed AI response for {source_description} is not a dictionary. Type: {type(parsed_data)}")
            raise json.JSONDecodeError("AI response did not parse into a JSON object.", cleaned_text, 0)
        
        app.logger.info(f"Successfully parsed AI JSON object for {source_description}.")
        return create_response({response_key: parsed_data, "source": source_description}) # Note: source is good for frontend context
    except json.JSONDecodeError as e:
        app.logger.error(f"JSONDecodeError (object expected) for {source_description}: {e}")
        app.logger.debug(f"Text that failed object parsing (cleaned):\n>>>>>>>>>>\n{cleaned_text}\n<<<<<<<<<<")
        app.logger.debug(f"Original raw AI text for this error:\n>>>>>>>>>>\n{ai_response_text}\n<<<<<<<<<<")
        return create_response({
            response_key: ai_response_text, "source": source_description,
            "warning": f"AI response was not valid JSON object. Error: {e}. Displaying raw text."
        }, status_code=200)
    except Exception as e:
        app.logger.error(f"Unexpected error in _handle_ai_json_object_response for {source_description}: {e}", exc_info=True)
        return create_response(error="Unexpected error processing AI object response.", status_code=500)

# --- API Endpoints ---


#This endpoint will receive a list of existing test cases and return a list of IDs for those that should be automated
@app.route('/api/analyze-for-automation', methods=['POST'])
def analyze_for_automation_endpoint():
    """
    Analyzes a list of test cases and suggests which are good candidates for automation.
    Expects JSON: { "test_cases": [ { "id": "...", "test_case_summary": "...", "test_steps": [...] }, ... ] }
    """
    app.logger.info("Received request for /api/analyze-for-automation")
    data = request.get_json()

    if not data or 'test_cases' not in data or not isinstance(data['test_cases'], list) or len(data['test_cases']) == 0:
        return create_response(error="Request must include a non-empty 'test_cases' array.", status_code=400)

    # Convert the test cases list to a simplified string format for the prompt
    # This is more token-efficient than sending the full JSON
    test_cases_text = ""
    for tc in data['test_cases']:
        test_cases_text += f"ID: {tc.get('id', 'N/A')}\n"
        test_cases_text += f"Summary: {tc.get('test_case_summary', 'N/A')}\n"
        steps_str = " -> ".join(tc.get('test_steps', []))
        test_cases_text += f"Steps: {steps_str}\n---\n"
    
    test_cases_text = truncate_text(test_cases_text, MAX_AI_INPUT_CHARS)

    prompt = f"""
    Act as an expert Test Automation Strategist.
    Review the following list of test cases. Based on the summary and steps, identify the best candidates for automation. Good candidates are repetitive, test stable core functionality, are data-driven, or check critical paths. Bad candidates are exploratory, require human visual checks, or test highly unstable features.

    Return a single JSON object with one key: "automated_test_case_ids". The value should be an array of strings, containing only the IDs of the test cases you recommend for automation.
    Do NOT include any explanation or text outside the JSON object.

    Example JSON output:
    {{
      "automated_test_case_ids": ["TC-BM-01-01", "TC-BM-02-01", "TC-CO-01"]
    }}

    List of Test Cases to Analyze:
    ---
    {test_cases_text}
    ---
    JSON Automation Candidates:
    """
    try:
        ai_response_text = generate_text([prompt]) # Pass as list
        # We expect a single JSON object, so use the object handler
        # The result will be under the key "automation_analysis"
        return _handle_ai_json_object_response(ai_response_text, "Automation Candidate Analysis", "automation_analysis")
    except Exception as e:
        app.logger.error(f"Error during GenAI call for automation analysis: {e}", exc_info=True)
        return create_response(error="Failed to generate automation analysis.", status_code=500)



@app.route('/api/health', methods=['GET'])
def health_check():
    app.logger.info("Health check endpoint called.")
    return create_response({"status": "Backend is running"})


@app.route('/api/suggest-test-cases-from-images', methods=['POST'])
def suggest_test_cases_from_images_endpoint():
    """
    Analyzes a ZIP of UI images and suggests test cases.
    EXPECTS A FLAT LIST OF TEST CASES, NOT NESTED SCENARIOS.
    """
    app.logger.info("Received request for /api/suggest-test-cases-from-images")
    if 'file' not in request.files:
        return create_response(error="No file part in request", status_code=400)
    
    file = request.files['file']
    if file.filename == '':
        return create_response(error="No selected file", status_code=400)
    
    if file and get_file_extension(file.filename) == 'zip':
        original_filename = secure_filename(file.filename)
        source_description = f"Image ZIP: {original_filename}"
        
        try:
            images_data = process_zip_file_for_images(file.stream)
            if not images_data:
                return create_response(error="No supported images (PNG/JPG) found in the ZIP file.", status_code=400)
            app.logger.info(f"Extracted {len(images_data)} images from ZIP file.")
            
            # --- NEW, SIMPLER PROMPT SPECIFICALLY FOR IMAGES (WITH "type") ---
            prompt_text = """
            Act as an expert Software Quality Assurance Engineer specializing in UI/UX testing.
            Analyze the following user interface screenshots. Based on the visual elements, layout, and text visible in these images, generate a flat list of detailed test cases.

            For each test case, provide the following details as key-value pairs:
            - "id": (string) A unique identifier like TC-UI-01.
            - "scenario": (string) The name of the screen or component being tested (e.g., "Login Screen", "Contact Form").
            - "type": (string, one of: "Positive" or "Negative") The nature of the test. "Positive" for happy paths, "Negative" for error conditions or invalid inputs.
            - "test_case_summary": (string) A concise description of the specific test.
            - "test_steps": (array of strings) The actions to perform.
            - "test_data": (array of strings) Example data used, if any.
            - "expected_result": (string) The expected visual or functional outcome.
            - "priority": (string, one of: "P1", "P2", "P3").
            - "severity": (string, one of: "High", "Medium", "Low").

            Return the output strictly as a single JSON array of these test case objects. Do NOT include any text outside the JSON array.
            """ 

            prompt_parts = [prompt_text]
            for img_data in images_data:
                prompt_parts.append(f"Analyzing image: {img_data['filename']}")
                prompt_parts.append(img_data['image'])
            
            ai_response_text = generate_text(prompt_parts)
            
            # Use the existing helper that expects an array of test cases
            return _handle_ai_json_array_response(ai_response_text, source_description)
            
        except (ValueError, IOError) as e:
            app.logger.error(f"Error processing ZIP file {original_filename}: {e}")
            return create_response(error=str(e), status_code=400)
        except Exception as e:
            app.logger.error(f"Unexpected error processing image ZIP: {e}", exc_info=True)
            return create_response(error="An internal server error occurred while processing the images.", status_code=500)
    else:
        return create_response(error="File type not allowed. Please upload a ZIP file.", status_code=400)


# --- Test Case Suggestion Endpoints (MODIFIED TO USE JSON HANDLERS) ---

@app.route('/api/suggest-test-cases', methods=['POST'])
def suggest_test_cases_from_text_endpoint():
    app.logger.info("Received request for /api/suggest-test-cases (text input)")
    data = request.get_json()
    if not data or 'requirements' not in data or not data['requirements'].strip():
        return create_response(error="Missing or empty 'requirements' field in request body", status_code=400)
    
    requirements_text = truncate_text(data['requirements'], MAX_AI_INPUT_CHARS)
    app.logger.info(f"Analyzing requirements text (first 100 chars): {requirements_text[:100]}...") # Log from your version
    
    prompt = _generate_json_test_case_prompt("Text Input", requirements_text)
    try:
        ai_response_text = generate_text(prompt)
        return _handle_ai_json_array_response(ai_response_text, "Text Input")
    except Exception as e:
        app.logger.error(f"Error during GenAI call for text input: {e}", exc_info=True) # Log from your version
        return create_response(error="Failed to generate suggestions due to an internal error.", status_code=500)


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
        app.logger.info(f"Processing uploaded file: {original_filename}") # Log from your version
        file_stream = file.stream
        file_ext = get_file_extension(original_filename)
        extracted_text = ""
        source_description = f"File: {original_filename}"

        try:
            if file_ext == 'pdf':
                extracted_text = parse_pdf(file_stream)
            elif file_ext == 'docx':
                extracted_text = parse_docx(file_stream)
            # Removed `else` that returned 500, as `allowed_file` should prevent this.

            if not extracted_text or not extracted_text.strip():
                 return create_response(error="Could not extract text from the file or file is empty.", status_code=400)

            app.logger.info(f"Extracted {len(extracted_text)} characters from {original_filename}") # Log from your version
            extracted_text = truncate_text(extracted_text, MAX_AI_INPUT_CHARS)
            
            prompt = _generate_json_test_case_prompt(source_description, extracted_text)
            ai_response_text = generate_text(prompt)
            return _handle_ai_json_array_response(ai_response_text, source_description)

        except ValueError as ve:
             app.logger.error(f"File parsing error for {original_filename}: {ve}") # Log from your version
             return create_response(error=str(ve), status_code=400)
        except Exception as e:
             app.logger.error(f"Error processing file {original_filename}: {e}", exc_info=True) # Log from your version
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
    app.logger.info(f"Processing Figma URL: {figma_url}") # Log from your version
    source_description = "" 

    try:
        file_key = extract_file_key_from_url(figma_url)
        if not file_key:
            return create_response(error="Could not extract valid File Key from the provided Figma URL.", status_code=400)
        app.logger.info(f"Extracted Figma file key: {file_key}") # Log from your version
        source_description = f"Figma File ({file_key})"

        figma_json_content = get_figma_file_content(file_key, figma_token)
        extracted_text = process_figma_data(figma_json_content)

        if not extracted_text or not extracted_text.strip():
             return create_response(error="Could not extract any text content from the Figma file via API.", status_code=400)
        app.logger.info(f"Extracted {len(extracted_text)} characters from Figma file {file_key}") # Log from your version
        extracted_text = truncate_text(extracted_text, MAX_AI_INPUT_CHARS)
        
        prompt = _generate_json_test_case_prompt(source_description, extracted_text, is_figma=True)
        ai_response_text = generate_text(prompt)
        return _handle_ai_json_array_response(ai_response_text, source_description)

    except ConnectionError as ce:
         app.logger.error(f"Figma API connection/request error: {ce}") # Log from your version
         return create_response(error=str(ce), status_code=502)
    except ValueError as ve:
         app.logger.error(f"Figma data processing error: {ve}", exc_info=True) # Log from your version
         return create_response(error=f"Error processing Figma data: {ve}", status_code=500)
    except Exception as e:
         app.logger.error(f"Unexpected error processing Figma URL {figma_url}: {e}", exc_info=True) # Log from your version
         return create_response(error="An internal server error occurred processing the Figma request.", status_code=500)


# --- Other AI Feature Endpoints (MODIFIED FOR JSON OUTPUT) ---

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
    app.logger.info(f"Analyzing defect for test: {failed_test}") # Log from your version

    prompt = f"""
    Act as an expert Software Debugging Analyst.
    Analyze the following defect information.
    Return a single JSON object with the following keys:
    - "potential_root_cause": (string) A plausible root cause.
    - "suggested_severity_level": (string, one of: "Low", "Medium", "High", "Critical") The suggested severity.
    - "severity_justification": (string) Justification for the suggested severity.
    - "defect_summary_draft": (string) A concise defect summary.
    Do NOT include any text outside of this single JSON object. Ensure all keys and string values are in double quotes.

    Example JSON output structure:
    {{
      "potential_root_cause": "Null pointer exception in PaymentProcessingService due to uninitialized user session data.",
      "suggested_severity_level": "High",
      "severity_justification": "Blocks core payment functionality for users without active sessions.",
      "defect_summary_draft": "Payment fails for users with no active session - NullPointer in PaymentProcessingService"
    }}

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
    JSON Defect Analysis:
    """
    try:
        ai_response_text = generate_text(prompt)
        # MODIFIED: Use the new JSON object response handler
        return _handle_ai_json_object_response(ai_response_text, f"Defect Analysis for {failed_test}", "analysis")
    except Exception as e:
        app.logger.error(f"Error during GenAI call for defect analysis: {e}", exc_info=True) # Log from your version
        return create_response(error="Failed to generate defect analysis due to an internal error.", status_code=500)


@app.route('/api/recommend-automation', methods=['POST'])
def recommend_automation_endpoint():
    app.logger.info("Received request for /api/recommend-automation")
    data = request.get_json()
    required_fields = ['test_case_description', 'execution_frequency', 'stability', 'manual_time_mins']
    if not data or not all(field in data for field in required_fields): # Your simplified check
        return create_response(error=f"Missing one or more required fields: {required_fields}", status_code=400)
    try:
        manual_time = int(data['manual_time_mins'])
        if manual_time <= 0: raise ValueError("Manual time must be positive.")
    except (ValueError, TypeError):
        return create_response(error="'manual_time_mins' must be a positive integer.", status_code=400)

    description = data['test_case_description'].strip()
    frequency = data['execution_frequency'].strip()
    stability = data['stability'].strip()
    if not description or not frequency or not stability:
         return create_response(error="Text fields (description, frequency, stability) cannot be empty.", status_code=400)
    app.logger.info(f"Analyzing automation potential for test: {description[:100]}...") # Log from your version
    description_truncated = truncate_text(description, MAX_AI_INPUT_CHARS // 2)

    prompt = f"""
    Act as an expert Test Automation Strategist.
    Evaluate the suitability of the following manual test case for automation.
    Return a single JSON object with the following keys:
    - "recommendation": (string, one of: "Yes", "No", "Maybe") The automation recommendation.
    - "justification": (string) Explanation for the recommendation, considering ROI, frequency, time saved, and stability.
    Do NOT include any text outside of this single JSON object. Ensure all keys and string values are in double quotes.

    Example JSON output structure:
    {{
      "recommendation": "Yes",
      "justification": "This test case is executed frequently (daily), covers a stable core feature, and automating it would save significant manual effort."
    }}

    Test Case Details:
    ---
    Description: {description_truncated}
    Execution Frequency: {frequency}
    Feature Stability: {stability}
    Estimated Manual Execution Time (minutes): {manual_time}
    ---
    JSON Automation Analysis:
    """
    try:
        ai_response_text = generate_text(prompt)
        # MODIFIED: Use the new JSON object response handler
        return _handle_ai_json_object_response(ai_response_text, f"Automation Rec for '{description[:30]}...'", "recommendation")
    except Exception as e:
        app.logger.error(f"Error during GenAI call for automation recommendation: {e}", exc_info=True) # Log from your version
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
    app.logger.info(f"Analyzing impact of change '{code_change_desc[:100]}...' on test '{test_case_desc[:100]}...'") # Log from your version

    prompt = f"""
    Act as an AI assisting with Test Impact Analysis.
    You are given a description of a code change and a description of an existing test case.
    Based *only* on the semantics and keywords in these two descriptions, estimate the likelihood that the test case needs to be reviewed or updated due to this code change.
    Return a single JSON object with the following keys:
    - "impact_likelihood": (string, one of: "High", "Medium", "Low", "None")
    - "reasoning": (string) Brief explanation linking keywords if possible.
    Do NOT include any text outside of this single JSON object. Ensure all keys and string values are in double quotes.

    Example JSON output structure:
    {{
      "impact_likelihood": "High",
      "reasoning": "Keywords 'login' and 'credentials' overlap significantly."
    }}

    Code Change Description:
    ---
    {code_change_desc}
    ---
    Test Case Description:
    ---
    {test_case_desc}
    ---
    JSON Impact Analysis:
    """
    try:
        ai_response_text = generate_text(prompt)
        # MODIFIED: Use the new JSON object response handler
        return _handle_ai_json_object_response(ai_response_text, "Code Change Impact Analysis", "impact_analysis")
    except Exception as e:
        app.logger.error(f"Error during GenAI call for code change impact: {e}", exc_info=True) # Log from your version
        return create_response(error="Failed to generate impact analysis due to an internal error.", status_code=500)

# --- Main Execution Guard ---
if __name__ == '__main__':
    app.logger.info("Starting Flask development server...")
    app.run(host='0.0.0.0', port=5001, debug=True)