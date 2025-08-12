from dotenv import load_dotenv
load_dotenv()
from flask import Flask, request, jsonify
from flask_cors import CORS
import logging
import os
import json
from werkzeug.utils import secure_filename
import re
from datetime import datetime, timezone
from utils.image_parser import process_zip_file_for_images
from utils.gemini_client import generate_text
from utils.file_parser import parse_pdf, parse_docx, get_file_extension
from utils.figma_client import extract_file_key_from_url, get_figma_file_content, process_figma_data
from mongoengine import connect, Document, StringField, ListField, DateTimeField, DynamicField, IntField, ReferenceField, ObjectIdField
from bson import ObjectId
# from flask_pymongo import PyMongo
from flask_bcrypt import Bcrypt
from flask_jwt_extended import create_access_token, get_jwt_identity, jwt_required, JWTManager, decode_token
from bson.errors import InvalidId
from werkzeug.exceptions import Forbidden, NotFound
from jira import JIRA
from requests_oauthlib import OAuth2Session
from flask import redirect, session


# --- Flask App Setup ---
app = Flask(__name__)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(name)s - %(message)s')
app.logger.setLevel(logging.INFO)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# --- App Configuration ---
app.secret_key = os.urandom(24) # A strong, random secret key for JWT

# --- Initialize Extensions ---
bcrypt = Bcrypt(app)
jwt = JWTManager(app)


# --- NEW JIRA OAUTH 2.0 ENDPOINTS ---

# The base URL for Jira's OAuth 2.0 authorization
authorization_base_url = 'https://auth.atlassian.com/authorize'
token_url = 'https://auth.atlassian.com/oauth/token'
# The scopes we requested in the developer console
jira_scopes = ['read:jira-work', 'read:jira-user', 'read:project:jira']

@app.route('/api/jira/auth')
# @jwt_required()
def jira_auth():
    """Step 1: Redirects the user to Jira to authorize the app."""

    # Because this is a browser redirect, we can't use headers.
    # We manually check for the JWT in the query string.
    token = request.args.get('jwt')
    if not token:
        return "Missing auth token.", 401
    try:
        # This verifies the token is valid and not expired
        decoded_token = decode_token(token)
        # We can also store the user_id in the session to link the Jira token later
        session['user_id_for_jira_auth'] = decoded_token['sub']
    except Exception as e:
        app.logger.error(f"Invalid JWT provided for Jira auth: {e}")
        return "Invalid or expired auth token.", 401


    jira_client_id = os.getenv('JIRA_CLIENT_ID')
    redirect_uri = os.getenv('JIRA_REDIRECT_URI')
    
    # Create an OAuth2 session object
    oauth = OAuth2Session(jira_client_id, redirect_uri=redirect_uri, scope=jira_scopes)
    
    # Generate the authorization URL
    authorization_url, state = oauth.authorization_url(
        authorization_base_url,
        audience='api.atlassian.com'
    )
    
    # Store the state in the user's session to prevent CSRF attacks
    session['oauth_state'] = state
    
    # Redirect the user's browser to the Jira authorization page
    return redirect(authorization_url)


@app.route('/api/jira/callback')
def jira_callback():
    """Step 2: Handles the callback from Jira after authorization."""
    jira_client_id = os.getenv('JIRA_CLIENT_ID')
    client_secret = os.getenv('JIRA_CLIENT_SECRET')
    redirect_uri = os.getenv('JIRA_REDIRECT_URI')

    # Create the session object, ensuring the state matches
    os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'

    
    try:
        oauth = OAuth2Session(jira_client_id, state=session.get('oauth_state'), redirect_uri=redirect_uri)
        token = oauth.fetch_token(token_url, client_secret=client_secret, authorization_response=request.url)
        
        # Get the user ID we stored in the session before the redirect
        user_id = session.get('user_id_for_jira_auth')
        if user_id:
            # --- SAVE TOKEN TO DATABASE ---
            user = User.objects.get(id=user_id)
            user.jira_oauth_token = token # Store the entire token object
            user.save()
            app.logger.info(f"Successfully stored Jira OAuth token for user {user_id} in the database.")
        else:
            app.logger.warning("Could not find user_id in session after Jira callback.")

    except Exception as e:
        app.logger.error(f"Error in Jira callback: {e}", exc_info=True)
        # Redirect to frontend with an error message if something goes wrong
        return redirect('http://localhost:3000/?error=jira_auth_failed')
    finally:
        # Clean up the session variable and the insecure transport flag
        session.pop('user_id_for_jira_auth', None)
        session.pop('oauth_state', None)
        os.environ.pop('OAUTHLIB_INSECURE_TRANSPORT', None)

    # Redirect back to the main frontend page
    return redirect('http://localhost:3000/')


def get_jira_oauth_session():
    """
    Helper to create an authenticated session by fetching the token from the logged-in user's DB record.
    """
    try:
        # Get the current user's ID from their JWT token
        current_user_id = get_jwt_identity()
        user = User.objects.get(id=current_user_id)
        
        # Check if the user has a Jira token saved
        if not user.jira_oauth_token:
            return None
            
        jira_client_id = os.getenv('JIRA_CLIENT_ID')
        client_secret = os.getenv('JIRA_CLIENT_SECRET')
        token = user.jira_oauth_token

        # Define a function that will be called to auto-refresh the token if it's expired
        def token_saver(new_token):
            app.logger.info(f"Jira token refreshed for user {user.id}. Saving new token to DB.")
            user.jira_oauth_token = new_token
            user.save()

        # Create the OAuth2Session with the token and auto-refresh capabilities
        return OAuth2Session(
            client_id=jira_client_id,
            token=token,
            auto_refresh_url=token_url,
            auto_refresh_kwargs={
                'client_id': jira_client_id,
                'client_secret': client_secret,
            },
            token_updater=token_saver
        )
    except Exception as e:
        app.logger.error(f"Error creating Jira OAuth session: {e}")
        return None


# --- Configuration ---
UPLOAD_ALLOWED_EXTENSIONS = {'pdf', 'docx', 'zip'}
MAX_AI_INPUT_CHARS = 18000


# --- Database Configuration ---
try:
    connect(host=os.getenv('MONGODB_URI'))
    app.logger.info("Successfully connected to MongoDB Atlas.")
except Exception as e:
    app.logger.error(f"Failed to connect to MongoDB Atlas: {e}", exc_info=True)


class User(Document):
    username = StringField(required=True, unique=True)
    email = StringField(required=True, unique=True)
    password = StringField(required=True)
    created_at = DateTimeField(default=lambda: datetime.now(timezone.utc))
    # We use DynamicField because the token object contains 'access_token',
    # 'refresh_token', 'expires_in', etc.
    jira_oauth_token = DynamicField()

    meta = {'collection': 'users'}

    def to_dict(self):
        """Converts User document to a JSON-serializable dictionary."""
        data = self.to_mongo().to_dict()
        # IMPORTANT: Convert the primary key _id from ObjectId to a string
        data['id'] = str(data.pop('_id'))
        # Remove the password for security
        data.pop('password', None)
        # Convert datetime to string
        if 'created_at' in data and isinstance(data['created_at'], datetime):
            data['created_at'] = data['created_at'].isoformat()
        return data


class Project(Document):
    name = StringField(required=True, max_length=150)
    github_repo_url = StringField()
    user = ReferenceField('User', required=True) # The link to the user
    created_at = DateTimeField(default=lambda: datetime.now(timezone.utc))
    meta = {'collection': 'projects'}


class TestCaseGeneration(Document): 
    project = ReferenceField('Project', required=True) # The field name is 'project'
    source_type = StringField(max_length=100)
    source_jira_issues = ListField(StringField())
    test_case_count = IntField(default=0)
    created_at = DateTimeField(default=lambda: datetime.now(timezone.utc))
    test_case_ids = ListField(ReferenceField('TestCase'))
    meta = {'collection': 'test_case_generations'}
    def to_dict(self):
        """Converts TestCaseGeneration document to a JSON-serializable dictionary."""
        data = self.to_mongo().to_dict()
        data['id'] = str(data.pop('_id')) # Convert main ID

        # Convert the project ReferenceField ObjectId to a string
        if 'project' in data and isinstance(data['project'], ObjectId):
            data['project'] = str(data['project'])

        # Convert the list of test_case_ids from ObjectIds to strings
        if 'test_case_ids' in data:
            data['test_case_ids'] = [str(oid) for oid in data['test_case_ids']]

        if 'created_at' in data and isinstance(data['created_at'], datetime):
            data['created_at'] = data['created_at'].isoformat()
            
        return data


class TestCase(Document):
    project = ReferenceField('Project', required=True) # The field name is 'project'
    generation_event = ReferenceField('TestCaseGeneration')
    source_jira_issue_key = StringField(max_length=20)
    case_id_string = StringField(max_length=50) # e.g., TC-LOGIN-01
    scenario = StringField(required=True, max_length=255)
    summary = StringField(required=True)
    pre_condition = StringField()
    test_steps = ListField(StringField(), required=True)
    test_data = DynamicField() # Can store string, list, or dict
    expected_result = StringField()
    priority = StringField(max_length=10)
    severity = StringField(max_length=20)
    created_at = DateTimeField(default=lambda: datetime.now(timezone.utc))
    
    # MongoEngine uses 'id' for the primary key (_id in the DB)
    meta = {'collection': 'test_cases'}

    def to_dict(self):
        """Converts TestCase document to a JSON-serializable dictionary."""
        data = self.to_mongo().to_dict()

        # Convert the main _id ObjectId to a string
        data['id'] = str(data.pop('_id'))

        # --- THIS IS THE CRITICAL FIX ---
        # Convert the generation_event ReferenceField ObjectId to a string if it exists
        if 'generation_event' in data and isinstance(data['generation_event'], ObjectId):
            data['generation_event'] = str(data['generation_event'])
    
        # Convert the project ReferenceField ObjectId to a string if it exists
        if 'project' in data and isinstance(data['project'], ObjectId):
            data['project'] = str(data['project'])
        # --- END OF FIX ---

        # Convert datetime to an ISO format string
        if 'created_at' in data and isinstance(data['created_at'], datetime):
            data['created_at'] = data['created_at'].isoformat()
    
        # Match the frontend's expected keys for easier rendering
        data['test_steps_json'] = data.get('test_steps', [])
        data['test_data_json'] = data.get('test_data', None)
        data['summary'] = data.get('summary', '') # Keep original field name
        data['test_case_summary'] = data.get('summary', '') # Add alias for compatibility

        return data

class AiAnalysis(Document):
    analysis_type = StringField(required=True, choices=['defect', 'automation', 'impact'])
    project = ReferenceField('Project', required=True) # The field name is 'project'
    source_info = StringField(max_length=255)
    analysis_json = DynamicField(required=True) # The structured AI JSON response
    created_at = DateTimeField(default=lambda: datetime.now(timezone.utc))

    meta = {'collection': 'ai_analyses'}

    def to_dict(self):
        data = self.to_mongo().to_dict()
        data['id'] = str(data.pop('_id'))
        if 'created_at' in data and isinstance(data['created_at'], datetime):
            data['created_at'] = data['created_at'].isoformat()
        
        # Match frontend's expected key
        data['analysis'] = data.pop('analysis_json', {})

        return data

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


def _verify_project_ownership(project_id: str, user_id: str):
    """Checks if a user owns a project using MongoEngine. Aborts if not."""
    try:
        # Find the project by its ID
        project = Project.objects.get(id=project_id, user=user_id)
        # Check if the project's user ID matches the logged-in user's ID
        if str(project.user.id) != user_id:
            raise Forbidden("You do not have permission to access this project.")
        # If the check passes, return the project object for potential reuse
        return project
    except Project.DoesNotExist:
        # If the project doesn't exist at all
        raise NotFound("Project not found.")
    except Exception as e:
        # Catch other potential errors like invalid ID format
        app.logger.error(f"Error during ownership verification: {e}")
        raise Forbidden("Invalid project ID or permission error.")


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
    It now groups test cases by scenario and is more demanding about depth and detail.
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
    
    CRITICAL INSTRUCTION: Ensure the entire response is a single, complete, and valid JSON array. Do not truncate the output. If the content is long, focus on the most critical scenarios first but ensure the JSON structure is perfectly valid and complete.

    Example of the required detail and structure:
    [
      {{
        "scenario_title": "User Registration: Email Field Validation",
        "positive_test_cases": [
          {{
            "id": "TC-REG-POS-01",
            "test_case_summary": "Register with a valid, standard email address.",
            "test_steps": ["Navigate to registration page", "Enter 'test@example.com' in email field", "Fill other required fields", "Click 'Register'"],
            "test_data": ["Email: test@example.com"],
            "expected_result": "Registration is successful. User is logged in or receives a confirmation email.",
            "priority": "P1",
            "severity": "High"
          }}
        ],
        "negative_test_cases": [
          {{
            "id": "TC-REG-NEG-01",
            "test_case_summary": "Attempt to register with an email missing the '@' symbol.",
            "test_steps": ["Navigate to registration page", "Enter 'test.example.com' in email field", "Fill other fields", "Click 'Register'"],
            "test_data": ["Email: test.example.com"],
            "expected_result": "An inline validation error message 'Please enter a valid email address' is displayed next to the email field.",
            "priority": "P1",
            "severity": "High"
          }},
          {{
            "id": "TC-REG-NEG-02",
            "test_case_summary": "Attempt to register with an empty email field.",
            "test_steps": ["Navigate to registration page", "Leave the email field empty", "Fill other required fields", "Click 'Register'"],
            "test_data": ["Email: (empty)"],
            "expected_result": "A validation error 'Email address is required' is displayed.",
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
    

def _handle_ai_json_object_response_internal(ai_response_text: str):
    """
    Parses AI response expecting a single JSON object.
    Returns a dictionary with parsed data or an error dict.
    """
    if ai_response_text.startswith("Error:"):
        return {"error": True, "raw_text": ai_response_text, "warning": "AI failed to generate a response."}
    
    try:
        cleaned_text = _clean_ai_response_for_json(ai_response_text)
        if not cleaned_text: raise json.JSONDecodeError("Cleaned AI response is empty.", cleaned_text, 0)
        
        parsed_data = json.loads(cleaned_text)
        if not isinstance(parsed_data, dict):
            raise json.JSONDecodeError("AI response did not parse into a JSON object.", cleaned_text, 0)
        
        # Success returns the parsed dictionary
        return {"data": parsed_data} 
    except json.JSONDecodeError as e:
        app.logger.error(f"JSONDecodeError (object expected): {e}")
        # Failure returns an error structure
        return {
            "error": True,
            "raw_text": ai_response_text,
            "warning": f"AI response was not valid JSON object. Error: {e}. Displaying raw text."
        }

# --- API Endpoints ---


@app.route('/api/project/<string:project_id>/generate-test-cases', methods=['POST'])
@jwt_required()
def generate_test_cases_endpoint(project_id):
    current_user_id = get_jwt_identity()
    project = _verify_project_ownership(project_id, current_user_id)

    data = request.get_json()
    requirements_text = data.get('requirements_text')
    source_description = data.get('source_description', 'Manual Input')
    # NEW: Get the list of Jira issues if they exist
    jira_issues = data.get('jira_issues', []) # Expects a list of objects [{key, summary}, ...]

    if not requirements_text or not requirements_text.strip():
        return create_response(error="Requirements text cannot be empty.", status_code=400)

    try:
        prompt = _generate_json_test_case_prompt(source_description, requirements_text)
        ai_response_text = generate_text([prompt])
        parsed_result = _handle_ai_json_response_internal(ai_response_text, expects_array=True)

        if "error" in parsed_result:
            return create_response({ "suggestions": parsed_result.get("raw_text"), "source": source_description, "warning": parsed_result.get("warning") }, status_code=200)

        # --- DATABASE LOGIC ---
        suggestions_list = parsed_result.get("data", [])
        all_tcs_flat = get_flattened_tcs_backend(suggestions_list)
        
        if not all_tcs_flat:
            return create_response({"suggestions": [], "source": source_description})

        generation_event = TestCaseGeneration(
            project=project,
            source_type=source_description,
            # NEW: Save the keys of the Jira issues used
            source_jira_issues=[issue.get('key') for issue in jira_issues],
            test_case_count=len(all_tcs_flat)
        )
        generation_event.save()

        saved_test_cases = []
        for tc_data in all_tcs_flat:
            new_case = TestCase(
                project=project,
                generation_event=generation_event,
                case_id_string=tc_data.get('id'),
                scenario=tc_data.get('scenario_title') or tc_data.get('scenario'),
                summary=tc_data.get('test_case_summary'),
                pre_condition=tc_data.get('pre_condition'),
                test_steps=tc_data.get('test_steps', []),
                test_data=tc_data.get('test_data', {}),
                expected_result=tc_data.get('expected_result'),
                priority=tc_data.get('priority'),
                severity=tc_data.get('severity')
            )
            new_case.save()
            saved_test_cases.append(new_case)
        
        generation_event.test_case_ids = [case.id for case in saved_test_cases]
        generation_event.save()
        
        app.logger.info(f"Saved Gen Event {generation_event.id} with {len(saved_test_cases)} test cases.")
        
        saved_test_cases_dicts = [case.to_dict() for case in saved_test_cases]
        return create_response({"suggestions": saved_test_cases_dicts, "source": source_description})

    except Exception as e:
        app.logger.error(f"Error in generate_test_cases_endpoint: {e}", exc_info=True)
        return create_response(error="Internal server error.", status_code=500)


@app.route('/api/jira/projects', methods=['GET'])
@jwt_required()
def get_jira_projects():
    """
    Fetches projects using the stored OAuth 2.0 token. This is the definitive method.
    """
    # get_jira_oauth_session() is a helper that retrieves the token from the user's session
    oauth_session = get_jira_oauth_session()
    
    # If the helper returns None, it means the user hasn't authenticated with Jira yet.
    if not oauth_session:
        # We return a 401 Unauthorized error with a specific message.
        # The frontend will use this to show the "Connect to Jira" button.
        return create_response(error="Jira not authenticated. Please connect to Jira.", status_code=401)
        
    try:
        # Step 1: Discover which Jira sites the user has access to.
        # An OAuth token is not tied to a single site, so we must ask first.
        accessible_resources_url = 'https://api.atlassian.com/oauth/token/accessible-resources'
        resources_response = oauth_session.get(accessible_resources_url)
        resources_response.raise_for_status() # Check for errors
        resources = resources_response.json()

        if not resources:
            app.logger.warning("OAuth successful, but no accessible Jira sites (cloudId) found for this user.")
            return create_response([]) # Return empty list, not an error

        # Step 2: Assume we use the first accessible site found.
        # In a multi-site enterprise app, you might let the user choose.
        cloud_id = resources[0]['id']
        
        # Step 3: Use the cloudId to fetch the projects for that specific site.
        projects_url = f"https://api.atlassian.com/ex/jira/{cloud_id}/rest/api/3/project"
        projects_response = oauth_session.get(projects_url)
        projects_response.raise_for_status()
        projects_data = projects_response.json()

        # The project data is a direct list in this API response
        project_list = [{"key": p.get("key"), "name": p.get("name")} for p in projects_data]
        
        app.logger.info(f"Successfully fetched {len(project_list)} projects for cloudId {cloud_id} via OAuth.")
        return create_response(project_list)
        
    except Exception as e:
        app.logger.error(f"Error fetching Jira projects via OAuth: {e}", exc_info=True)
        # Clear the potentially bad token from the session so the user can re-authenticate
        if 'jira_token' in session:
            session.pop('jira_token')
        return create_response(error="Could not fetch projects from Jira. Your connection may have expired. Please try connecting to Jira again.", status_code=500)



@app.route('/api/jira/issues', methods=['POST'])
@jwt_required()
def get_jira_issues():
    """
    Fetches issues (Stories, Tasks, etc.) for a specific Jira project key using OAuth.
    """
    # Step 1: Get the authenticated OAuth session
    oauth_session = get_jira_oauth_session()
    if not oauth_session:
        return create_response(error="Jira not authenticated. Please connect to Jira first.", status_code=401)
    
    data = request.get_json()
    project_key = data.get('project_key')
    if not project_key:
        return create_response(error="Project key is required.", status_code=400)
        
    try:
        # Step 2: Discover the cloudId for the user's Jira site
        accessible_resources_url = 'https://api.atlassian.com/oauth/token/accessible-resources'
        resources = oauth_session.get(accessible_resources_url).json()
        if not resources:
            raise Exception("No accessible Jira sites found for this user.")
        
        cloud_id = resources[0]['id']
        
        # Step 3: Build the JQL query and the API URL
        jql_query = f"project = '{project_key}' ORDER BY created DESC"
        search_url = f"https://api.atlassian.com/ex/jira/{cloud_id}/rest/api/3/search"
        
        payload = {
            "jql": jql_query,
            "maxResults": 50, # Limit results for performance
            "fields": [ # Specify only the fields we need to be efficient
                "summary",
                "description",
                "issuetype"
            ]
        }

        app.logger.info(f"Searching Jira issues with JQL: {jql_query}")
        
        # Step 4: Make the POST request to the search endpoint
        search_response = oauth_session.post(search_url, json=payload)
        search_response.raise_for_status()
        search_data = search_response.json()

        # Step 5: Format the results for the frontend
        issue_list = []
        for issue in search_data.get("issues", []):
            fields = issue.get("fields", {})
            issue_list.append({
                "key": issue.get("key"),
                "summary": fields.get("summary"),
                "description": fields.get("description") or "", # Ensure description is a string
                "issue_type": fields.get("issuetype", {}).get("name")
            })
            
        app.logger.info(f"Successfully fetched {len(issue_list)} issues for project {project_key}.")
        return create_response(issue_list)
        
    except Exception as e:
        app.logger.error(f"Error fetching Jira issues via OAuth for project {project_key}: {e}", exc_info=True)
        # Clear the potentially bad token from the session so the user can re-authenticate
        if 'jira_token' in session:
            session.pop('jira_token')
        return create_response(error="Could not fetch issues from Jira. Your connection may have expired. Please try connecting to Jira again.", status_code=500)
    


@app.route('/api/auth/register', methods=['POST'])
def register():
    """Registers a new user."""
    data = request.get_json()
    username = data.get('username')
    email = data.get('email')
    password = data.get('password')

    if not username or not email or not password:
        return create_response(error="Username, email, and password are required.", status_code=400)

    # Check if user already exists using MongoEngine syntax
    if User.objects(email=email).first():
        return create_response(error="Email address already in use.", status_code=409)
    if User.objects(username=username).first():
        return create_response(error="Username is already taken.", status_code=409)

    # Hash the password
    hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')

    # Create and save the new user document
    new_user = User(
        username=username,
        email=email,
        password=hashed_password
    )
    new_user.save()

    app.logger.info(f"New user registered: {email}, ID: {new_user.id}")
    return create_response({"message": "User registered successfully."}, status_code=201)


@app.route('/api/auth/login', methods=['POST'])
def login():
    """Logs in a user and returns a JWT access token."""
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    if not email or not password:
        return create_response(error="Email and password are required.", status_code=400)

    user = User.objects(email=email).first() # Use MongoEngine syntax

    if user and bcrypt.check_password_hash(user.password, password):
        access_token = create_access_token(identity=str(user.id))
        app.logger.info(f"User logged in successfully: {email}")
        return create_response({"access_token": access_token})
    else:
        app.logger.warning(f"Failed login attempt for email: {email}")
        return create_response(error="Invalid credentials.", status_code=401)


@app.route('/api/auth/profile', methods=['GET'])
@jwt_required()
def profile():
    """Returns the profile of the currently logged-in user."""
    current_user_id = get_jwt_identity()
    try:
        user = User.objects.get(id=current_user_id)
        
        # Now, we use the model's own to_dict() method, which handles all conversions and removes the password
        return create_response(user.to_dict())

    except User.DoesNotExist:
        return create_response(error="User not found.", status_code=404)
    except Exception as e:
        app.logger.error(f"Error fetching profile for user_id {current_user_id}: {e}", exc_info=True)
        return create_response(error="Error fetching profile.", status_code=500)

# Authentication
@app.route('/api/projects', methods=['POST'])
@jwt_required()
def create_project():
    current_user_id = get_jwt_identity()
    data = request.get_json()
    name = data.get('name')

    if not name or not name.strip():
        return create_response(error="Project name is required.", status_code=400)

    try:
        # Create a new Project document, linking it to the current user
        new_project = Project(
            user=current_user_id, # MongoEngine handles resolving the User document from the ID
            name=name.strip(),
            github_repo_url=data.get('github_repo_url', '').strip()
        )
        new_project.save()

        app.logger.info(f"User {current_user_id} created new project: {name}")
        
        # Prepare response data
        response_data = {
            "_id": str(new_project.id),
            "name": new_project.name,
            "github_repo_url": new_project.github_repo_url
        }
        return create_response(response_data, status_code=201)
    except Exception as e:
        app.logger.error(f"Error creating project: {e}", exc_info=True)
        return create_response(error="Failed to create project.", status_code=500)
    

@app.route('/api/projects', methods=['GET'])
@jwt_required()
def get_projects():
    current_user_id = get_jwt_identity()
    
    try:
        # Find all projects where the 'user' field matches the current user's ID
        user_projects = Project.objects(user=current_user_id).order_by('-created_at')

        project_list = []
        for project in user_projects:
            project_list.append({
                "_id": str(project.id),
                "name": project.name,
                "github_repo_url": project.github_repo_url
            })
            
        app.logger.info(f"User {current_user_id} fetched {len(project_list)} projects.")
        return create_response(project_list)
    except Exception as e:
        app.logger.error(f"Error fetching projects for user {current_user_id}: {e}", exc_info=True)
        return create_response(error="Failed to fetch projects.", status_code=500)
    

@app.route('/api/projects/<string:project_id>', methods=['GET'])
@jwt_required()
def get_project_details(project_id):
    """
    Fetches all data associated with a single project, including its
    test cases, analyses, and dashboard stats.
    """
    current_user_id = get_jwt_identity()
    # This verifies ownership and returns the project object if successful
    project = _verify_project_ownership(project_id, current_user_id) 

    try:
        # --- GATHER ALL DATA FOR THIS PROJECT ---
        
        # 1. Dashboard Stats (using the correct field name 'project')
        total_test_cases = TestCase.objects(project=project_id).count()
        total_defect_analyses = AiAnalysis.objects(project=project_id, analysis_type='defect').count()
        total_automation_analyses = AiAnalysis.objects(project=project_id, analysis_type='automation').count()
        
        # For raw aggregation pipelines, we still need to convert the string ID to an ObjectId
        project_oid = ObjectId(project_id)
        pipeline = [
            { "$match": { "project": project_oid, "severity": { "$ne": None, "$ne": "" } } },
            { "$group": { "_id": "$severity", "count": { "$sum": 1 } } },
            { "$sort": { "_id": 1 } }
        ]
        severity_distribution = list(TestCase.objects.aggregate(pipeline))
        
        severity_chart_data = {
            'labels': [item['_id'] for item in severity_distribution],
            'data': [item['count'] for item in severity_distribution]
        }
        
        recent_analyses = AiAnalysis.objects(project=project_id).order_by('-created_at').limit(5)
        recent_generations = TestCaseGeneration.objects(project=project_id).order_by('-created_at').limit(5)
        
        dashboard_stats = {
            "key_metrics": {
                "total_test_cases": total_test_cases,
                "total_defect_analyses": total_defect_analyses,
                "total_automation_analyses": total_automation_analyses
            },
            "severity_chart": severity_chart_data,
            "recent_analyses": [analysis.to_dict() for analysis in recent_analyses],
            "recent_generations": [gen.to_dict() for gen in recent_generations]
        }

        # 2. All Test Cases for this project
        all_test_cases = TestCase.objects(project=project_id).order_by('-created_at')
        
        # 3. Assemble the final response
        project_details_data = {
            "id": str(project.id),
            "name": project.name,
            "github_repo_url": project.github_repo_url,
            "dashboard_stats": dashboard_stats,
            "test_cases": [tc.to_dict() for tc in all_test_cases]
            # You can add a list of all analyses here too if needed for the UI
        }
        
        return create_response(project_details_data)

    except Exception as e:
        app.logger.error(f"Error fetching details for project {project_id}: {e}", exc_info=True)
        return create_response(error="Could not retrieve project details.", status_code=500)


@app.route('/api/project/<string:project_id>/analyze-defect', methods=['POST'])
@jwt_required()
def analyze_defect_endpoint(project_id):
    current_user_id = get_jwt_identity()
    project = _verify_project_ownership(project_id, current_user_id)  # Verify ownership
    """
    Analyzes defect information using Gemini and saves the result to MongoDB.
    """
    app.logger.info("Received request for /api/analyze-defect")
    data = request.get_json()

    if not data or not data.get('failed_test', '').strip():
        return create_response(error="The 'Failed Test Case / Scenario' field is required.", status_code=400)

    failed_test = data['failed_test']
    error_logs = truncate_text(data.get('error_logs', ''), MAX_AI_INPUT_CHARS // 2)
    steps = data.get('steps_reproduced', 'Not Provided').strip()
    source_info_text = f"Defect Analysis for: {failed_test}"
    
    prompt = f"""
    Act as an expert Software Debugging Analyst.
    Analyze the following defect information.
    Return a single JSON object with the keys: "potential_root_cause", "suggested_severity_level" (one of: "Low", "Medium", "High", "Critical"), "severity_justification", and "defect_summary_draft".
    Do NOT include any text outside this single JSON object.

    Information Provided:
    ---
    Failed Test Case/Scenario: {failed_test}
    Error Logs: ```{error_logs}```
    Steps to Reproduce: {steps}
    ---
    JSON Defect Analysis:
    """
    try:
        ai_response_text = generate_text([prompt])
        result = _handle_ai_json_object_response_internal(ai_response_text)

        analysis_to_save = {}
        is_fallback = False
        if "error" in result:
            is_fallback = True
            analysis_to_save = {"raw_text": result.get("raw_text"), "warning": result.get("warning")}
            app.logger.warning(f"Saving raw text fallback for defect analysis.")
        else:
            analysis_to_save = result["data"]

        new_analysis = AiAnalysis(
            project=project,
            analysis_type='defect',
            source_info=source_info_text,
            analysis_json=analysis_to_save
        )
        new_analysis.save()
        app.logger.info(f"Successfully saved defect analysis to MongoDB. DB ID: {new_analysis.id}")
        
        if is_fallback:
            # If it was a fallback, we still need to send the warning to the frontend
            return create_response({"analysis": analysis_to_save["raw_text"], "warning": analysis_to_save["warning"]}, status_code=200)
        else:
            return create_response(new_analysis.to_dict())

    except Exception as e:
        app.logger.error(f"Error in analyze_defect_endpoint: {e}", exc_info=True)
        return create_response(error="Failed to generate defect analysis due to an internal server error.", status_code=500)


@app.route('/api/project/<string:project_id>/dashboard-stats', methods=['GET'])
@jwt_required()
def get_dashboard_stats(project_id):
    current_user_id = get_jwt_identity()
    project = _verify_project_ownership(project_id, current_user_id)
    project=project_id

    try:
        # --- CORRECTED QUERIES ---
        total_test_cases = TestCase.objects(project=project_id).count()
        total_automation_analyses = AiAnalysis.objects(project=project_id, analysis_type='automation').count()
        total_defect_analyses = AiAnalysis.objects(project=project_id, analysis_type='defect').count()

        pipeline = [
            { "$match": { "project_id":  ObjectId(project_id), "severity": { "$ne": None, "$ne": "" } } },
            { "$group": { "_id": "$severity", "count": { "$sum": 1 } } },
            { "$sort": { "_id": 1 } }
        ]
        severity_distribution = list(TestCase.objects.aggregate(pipeline))

        recent_analyses = AiAnalysis.objects(project=project_id).order_by('-created_at').limit(5)
        recent_generations = TestCaseGeneration.objects(project=project_id).order_by('-created_at').limit(5)
        # --- END OF CORRECTIONS ---
        
        severity_chart_data = {
            'labels': [item['_id'] for item in severity_distribution],
            'data': [item['count'] for item in severity_distribution]
        }
        recent_generations_dicts = [gen.to_dict() for gen in recent_generations]
        recent_analyses_dicts = [analysis.to_dict() for analysis in recent_analyses]
        
        dashboard_data = {
            "key_metrics": {
                "total_test_cases": total_test_cases,
                "total_defect_analyses": total_defect_analyses,
                "total_automation_analyses": total_automation_analyses
            },
            "severity_chart": severity_chart_data,
            "recent_analyses": recent_analyses_dicts,
            "recent_generations": recent_generations_dicts
        }
        
        return create_response(dashboard_data)

    except Exception as e:
        app.logger.error(f"Error fetching dashboard stats from MongoDB: {e}", exc_info=True)
        return create_response(error="Could not retrieve dashboard statistics.", status_code=500)


#This endpoint will receive a list of existing test cases and return a list of IDs for those that should be automated
@app.route('/api/project/<string:project_id>/analyze-for-automation', methods=['POST'])
@jwt_required()
def analyze_for_automation_endpoint(project_id):
    current_user_id = get_jwt_identity()
    project = _verify_project_ownership(project_id, current_user_id)  # Verify ownership

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


@app.route('/api/project/<string:project_id>/suggest-test-cases-from-images', methods=['POST'])
@jwt_required()
def suggest_test_cases_from_images_endpoint(project_id):
    current_user_id = get_jwt_identity()
    project = _verify_project_ownership(project_id, current_user_id)  # Verify ownership
    app.logger.info("Received request for /api/suggest-test-cases-from-images")
    if 'file' not in request.files: return create_response(error="No file part in request", status_code=400)
    
    file = request.files['file']
    if file.filename == '': return create_response(error="No selected file", status_code=400)
    
    if file and get_file_extension(file.filename) == 'zip':
        original_filename = secure_filename(file.filename)
        source_description = f"Image ZIP: {original_filename}"
        
        try:
            images_data = process_zip_file_for_images(file.stream)
            if not images_data:
                return create_response(error="No supported images (PNG/JPG) found in the ZIP file.", status_code=400)
            app.logger.info(f"Extracted {len(images_data)} images from ZIP file.")
            
            prompt_text = """
            Act as an expert Software Quality Assurance Engineer specializing in UI/UX testing.
            Analyze the following user interface screenshots... generate a flat list of detailed test cases.
            For each test case, provide... "id", "scenario", "type" ("Positive" or "Negative"), "test_case_summary", "test_steps" (array), "test_data" (array), "expected_result", "priority" ("P1", "P2", "P3"), and "severity" ("High", "Medium", "Low").
            Return the output strictly as a single JSON array of these test case objects. Do NOT include any text outside the JSON array.
            """ 
            prompt_parts = [prompt_text]
            for img_data in images_data:
                prompt_parts.append(f"Analyzing image: {img_data['filename']}")
                prompt_parts.append(img_data['image'])
            
            ai_response_text = generate_text(prompt_parts)
            parsed_result = _handle_ai_json_response_internal(ai_response_text)

            if "error" in parsed_result:
                return create_response({
                    "suggestions": parsed_result.get("raw_text"),
                    "source": source_description,
                    "warning": parsed_result.get("warning")
                }, status_code=200)

            # --- DATABASE LOGIC ---
            suggestions_list = parsed_result.get("data", [])
            if not suggestions_list:
                return create_response({"suggestions": [], "source": source_description})

            generation_event = TestCaseGeneration(
                source_type=source_description,
                test_case_count=len(suggestions_list)
            )
            generation_event.save()

            saved_test_cases = []
            for tc_data in suggestions_list:
                new_case = TestCase(
                    project=project,
                    generation_event=generation_event,
                    case_id_string=tc_data.get('id'),
                    scenario=tc_data.get('scenario'),
                    summary=tc_data.get('test_case_summary'),
                    pre_condition=tc_data.get('pre_condition'),
                    test_steps=tc_data.get('test_steps', []),
                    test_data=tc_data.get('test_data', {}),
                    expected_result=tc_data.get('expected_result'),
                    priority=tc_data.get('priority'),
                    severity=tc_data.get('severity')
                )
                new_case.save()
                saved_test_cases.append(new_case)
            
            generation_event.test_case_ids = [case.id for case in saved_test_cases]
            generation_event.save()
            
            app.logger.info(f"Saved TestCaseGeneration event {generation_event.id} with {len(saved_test_cases)} test cases from images.")
            
            saved_test_cases_dicts = [case.to_dict() for case in saved_test_cases]
            for i, tc_dict in enumerate(saved_test_cases_dicts):
                tc_dict['type'] = suggestions_list[i].get('type')
                
            return create_response({"suggestions": saved_test_cases_dicts, "source": source_description})
            
        except Exception as e:
            app.logger.error(f"Unexpected error processing image ZIP: {e}", exc_info=True)
            return create_response(error="An internal server error occurred while processing the images.", status_code=500)
    else:
        return create_response(error="File type not allowed. Please upload a ZIP file.", status_code=400)


# --- Test Case Suggestion Endpoints (MODIFIED TO USE JSON HANDLERS) ---

@app.route('/api/project/<string:project_id>/suggest-test-cases', methods=['POST'])
@jwt_required()
def suggest_test_cases_from_text_endpoint(project_id):
    current_user_id = get_jwt_identity()
    project = _verify_project_ownership(project_id, current_user_id) # Verify ownership

    app.logger.info("Received request for /api/suggest-test-cases (text input)")
    data = request.get_json()
    if not data or 'requirements' not in data or not data['requirements'].strip():
        return create_response(error="Missing or empty 'requirements' field", status_code=400)
    
    source_description = "Text Input"
    requirements_text = truncate_text(data['requirements'], MAX_AI_INPUT_CHARS)
    prompt = _generate_json_test_case_prompt(source_description, requirements_text)
    
    try:
        ai_response_text = generate_text([prompt])
        parsed_result = _handle_ai_json_response_internal(ai_response_text, expects_array=True)

        if "error" in parsed_result:
            return create_response({
                "suggestions": parsed_result.get("raw_text"),
                "source": source_description,
                "warning": parsed_result.get("warning")
            }, status_code=200)

        # --- DATABASE LOGIC ---
        suggestions_list = parsed_result.get("data", [])
        all_tcs_flat = get_flattened_tcs_backend(suggestions_list)
        
        if not all_tcs_flat:
            return create_response({"suggestions": [], "source": source_description})

        generation_event = TestCaseGeneration(
            project=project,
            source_type=source_description,
            test_case_count=len(all_tcs_flat)
        )
        generation_event.save()

        saved_test_cases = []
        for tc_data in all_tcs_flat:
            new_case = TestCase(
                project=project,
                generation_event=generation_event,
                case_id_string=tc_data.get('id'),
                scenario=tc_data.get('scenario_title') or tc_data.get('scenario'),
                summary=tc_data.get('test_case_summary'),
                pre_condition=tc_data.get('pre_condition'),
                test_steps=tc_data.get('test_steps', []),
                test_data=tc_data.get('test_data', {}),
                expected_result=tc_data.get('expected_result'),
                priority=tc_data.get('priority'),
                severity=tc_data.get('severity')
            )
            new_case.save()
            saved_test_cases.append(new_case)
        
        generation_event.test_case_ids = [case.id for case in saved_test_cases]
        generation_event.save()
        
        app.logger.info(f"Saved TestCaseGeneration event {generation_event.id} with {len(saved_test_cases)} test cases from text.")
        
        saved_test_cases_dicts = [case.to_dict() for case in saved_test_cases]
        return create_response({"suggestions": saved_test_cases_dicts, "source": source_description})

    except Exception as e:
        app.logger.error(f"Error in suggest_test_cases_from_text_endpoint: {e}", exc_info=True)
        return create_response(error="Internal server error.", status_code=500)


@app.route('/api/project/<string:project_id>/test-case-generations/<string:generation_id>', methods=['DELETE'])
@jwt_required()
def delete_test_case_generation(project_id, generation_id):
    """Deletes a generation event and all associated test cases."""
    current_user_id = get_jwt_identity()
    # This verifies the user owns the project and gives us the project object.
    project = _verify_project_ownership(project_id, current_user_id)

    app.logger.info(f"Received DELETE request for TestCaseGeneration ID: {generation_id} in Project {project_id}")
    try:
        # --- THIS IS THE CRITICAL FIX ---
        # Find the generation event by its ID AND ensure it belongs to the correct project.
        generation_event = TestCaseGeneration.objects.get(id=generation_id, project=project)
        
        # Now that we've verified the event belongs to the project, proceed with deletion.
        
        # Delete all test cases linked to this event
        TestCase.objects(generation_event=generation_event).delete()
        
        # Delete the event itself
        generation_event.delete()
        
        app.logger.info(f"Successfully deleted event {generation_id} and its test cases.")
        return create_response({"message": "Test case generation event and all related test cases deleted."})
        
    except TestCaseGeneration.DoesNotExist:
        # This error now correctly means "not found within this specific project"
        return create_response(error="Generation event not found in this project.", status_code=404)
    except Exception as e:
        app.logger.error(f"Error deleting generation event {generation_id}: {e}", exc_info=True)
        return create_response(error="Failed to delete generation event.", status_code=500)


@app.route('/api/project/<string:project_id>/suggest-test-cases-from-file', methods=['POST'])
@jwt_required()
def suggest_test_cases_from_file_endpoint(project_id):
    current_user_id = get_jwt_identity()
    project = _verify_project_ownership(project_id, current_user_id)# Verify ownership

    app.logger.info("Received request for /api/suggest-test-cases-from-file")
    if 'file' not in request.files: return create_response(error="No file part", status_code=400)
    file = request.files['file']
    if file.filename == '': return create_response(error="No selected file", status_code=400)

    if file and get_file_extension(file.filename) in ('pdf', 'docx'):
        original_filename = secure_filename(file.filename)
        source_description = f"File: {original_filename}"
        try:
            file_ext = get_file_extension(original_filename)
            extracted_text = parse_pdf(file.stream) if file_ext == 'pdf' else parse_docx(file.stream)
            if not extracted_text.strip():
                return create_response(error="Could not extract text or file is empty.", status_code=400)
            
            extracted_text = truncate_text(extracted_text, MAX_AI_INPUT_CHARS)
            prompt = _generate_json_test_case_prompt(source_description, extracted_text)
            ai_response_text = generate_text([prompt])
            parsed_result = _handle_ai_json_response_internal(ai_response_text, expects_array=True)

            if "error" in parsed_result:
                return create_response({
                    "suggestions": parsed_result.get("raw_text"),
                    "source": source_description,
                    "warning": parsed_result.get("warning")
                }, status_code=200)

            # --- CORRECTED DATABASE LOGIC ---
            suggestions_list = parsed_result.get("data", [])
            all_tcs_flat = get_flattened_tcs_backend(suggestions_list)

            if not all_tcs_flat:
                app.logger.info("AI returned no test cases to save from file.")
                return create_response({"suggestions": [], "source": source_description})

            # 1. Create the parent TestCaseGeneration event
            generation_event = TestCaseGeneration(
                project=project,
                source_type=source_description,
                test_case_count=len(all_tcs_flat)
            )
            generation_event.save() # Save it to get an ID

            # 2. Create each TestCase and link it to the generation event
            saved_test_cases = []
            for tc_data in all_tcs_flat:
                new_case = TestCase(
                    project=project,
                    generation_event=generation_event,
                    case_id_string=tc_data.get('id'),
                    scenario=tc_data.get('scenario_title') or tc_data.get('scenario'),
                    summary=tc_data.get('test_case_summary'),
                    pre_condition=tc_data.get('pre_condition'),
                    test_steps=tc_data.get('test_steps', []),
                    test_data=tc_data.get('test_data', {}),
                    expected_result=tc_data.get('expected_result'),
                    priority=tc_data.get('priority'),
                    severity=tc_data.get('severity')
                )
                new_case.save()
                saved_test_cases.append(new_case)
            
            # 3. (Optional but good practice) Update the event with the list of TestCase IDs
            generation_event.test_case_ids = [case.id for case in saved_test_cases]
            generation_event.save()
            
            app.logger.info(f"Saved TestCaseGeneration event {generation_event.id} with {len(saved_test_cases)} test cases from file.")
            
            # 4. Prepare and return the response
            saved_test_cases_dicts = [case.to_dict() for case in saved_test_cases]
            # To maintain the original structure for the frontend, we return the original parsed list
            # but now the frontend knows the save was successful. Let's return the saved data
            # so the frontend has the correct DB IDs for immediate editing.
            return create_response({"suggestions": saved_test_cases_dicts, "source": source_description})

        except Exception as e:
             app.logger.error(f"Error processing file {original_filename}: {e}", exc_info=True)
             return create_response(error="Error processing file.", status_code=500)
    else: return create_response(error="File type not allowed.", status_code=400)

# You'll also need a backend version of the flattening helper
def get_flattened_tcs_backend(suggestions_data):
    if not suggestions_data or not isinstance(suggestions_data, list): return []
    if suggestions_data and suggestions_data[0] and suggestions_data[0].get('scenario_title'):
        flat_list = []
        for scenario in suggestions_data:
            positive_cases = scenario.get('positive_test_cases', [])
            negative_cases = scenario.get('negative_test_cases', [])
            for tc in positive_cases:
                tc['scenario_title'] = scenario.get('scenario_title')
                tc['type'] = 'Positive'
                flat_list.append(tc)
            for tc in negative_cases:
                tc['scenario_title'] = scenario.get('scenario_title')
                tc['type'] = 'Negative'
                flat_list.append(tc)
        return flat_list
    return suggestions_data

def _handle_ai_json_response_internal(ai_response_text: str, expects_array: bool = True):
    """
    Parses AI response expecting JSON.
    Returns a dictionary with parsed data or an error dict.
    """
    # <<< NEW DEBUG LOG >>>
    app.logger.info(f"--- FULL AI RESPONSE RECEIVED ---\n{ai_response_text}\n--- END OF RESPONSE ---")

    if ai_response_text.startswith("Error:"):
        return {"error": True, "raw_text": ai_response_text, "warning": "AI failed to generate a response."}
    
    try:
        cleaned_text = _clean_ai_response_for_json(ai_response_text)
        if not cleaned_text: raise json.JSONDecodeError("Cleaned AI response is empty.", cleaned_text, 0)
        
        parsed_data = json.loads(cleaned_text)
        
        if expects_array and not isinstance(parsed_data, list):
            raise json.JSONDecodeError("AI response did not parse into a JSON array.", cleaned_text, 0)
        if not expects_array and not isinstance(parsed_data, dict):
             raise json.JSONDecodeError("AI response did not parse into a JSON object.", cleaned_text, 0)

        return {"data": parsed_data} # Success
    except json.JSONDecodeError as e:
        app.logger.error(f"JSONDecodeError: {e}")
        return {
            "error": True,
            "raw_text": ai_response_text,
            "warning": f"AI response was not valid JSON. Error: {e}. Displaying raw text."
        }


@app.route('/api/project/<string:project_id>/test-cases/<string:case_id>', methods=['PUT'])
@jwt_required()
def update_test_case(project_id, case_id):
    current_user_id = get_jwt_identity()
    project = _verify_project_ownership(project_id, current_user_id)

    """Updates an existing test case in MongoDB."""
    app.logger.info(f"Received PUT request for TestCase ID: {case_id}")
    try:
        # Find the document by its unique MongoDB ID
        case = TestCase.objects.get(id=case_id, project=project)
        data = request.get_json()
        if not data:
            return create_response(error="Invalid request body.", status_code=400)
        
        # Update fields from the request data, using the correct model field names
        case.case_id_string = data.get('case_id_string', case.case_id_string)
        case.scenario = data.get('scenario', case.scenario)
        case.summary = data.get('summary', case.summary)
        case.pre_condition = data.get('pre_condition', case.pre_condition)
        case.test_steps = data.get('test_steps_json', case.test_steps) 
        case.test_data = data.get('test_data_json', case.test_data)
        case.expected_result = data.get('expected_result', case.expected_result)
        case.priority = data.get('priority', case.priority)
        case.severity = data.get('severity', case.severity)
        
        case.save() # Save the changes to MongoDB
        app.logger.info(f"Successfully updated TestCase with ID {case_id}")
        return create_response(case.to_dict())

    except TestCase.DoesNotExist:
        return create_response(error="Test Case not found.", status_code=404)
    except Exception as e:
        app.logger.error(f"Error updating TestCase {case_id}: {e}", exc_info=True)
        return create_response(error="Failed to update test case.", status_code=500)


@app.route('/api/test-cases/<string:case_id>', methods=['DELETE'])
def delete_test_case(case_id):
    """Deletes a specific test case from the database."""
    app.logger.info(f"Received DELETE request for TestCase ID: {case_id}")
    try:
        test_case_to_delete = TestCase.objects.get(id=case_id)
        test_case_to_delete.delete()
        app.logger.info(f"Successfully deleted TestCase with ID: {case_id}")
        return create_response({"message": f"Test case {case_id} deleted successfully."})
    except TestCase.DoesNotExist:
        return create_response(error="Test case not found.", status_code=404)
    except Exception as e:
        app.logger.error(f"Error deleting TestCase {case_id}: {e}", exc_info=True)
        return create_response(error="Failed to delete test case.", status_code=500)


@app.route('/api/ai-analyses/<string:analysis_id>', methods=['DELETE'])
def delete_ai_analysis(analysis_id):
    """Deletes a specific AI analysis from the database."""
    app.logger.info(f"Received DELETE request for AiAnalysis ID: {analysis_id}")
    try:
        # Find the document by its unique MongoDB ID
        analysis_to_delete = AiAnalysis.objects.get(id=analysis_id)
        # This removes the document from the MongoDB collection
        analysis_to_delete.delete()
        app.logger.info(f"Successfully deleted AiAnalysis with ID: {analysis_id}")
        # Return a success message
        return create_response({"message": f"Analysis {analysis_id} deleted successfully."})
        
    except AiAnalysis.DoesNotExist:
        return create_response(error="Analysis not found.", status_code=404)
    except Exception as e:
        app.logger.error(f"Error deleting AiAnalysis {analysis_id}: {e}", exc_info=True)
        return create_response(error="Failed to delete analysis.", status_code=500)



@app.route('/api/project/<string:project_id>/suggest-test-cases-from-figma', methods=['POST'])
@jwt_required()
def suggest_test_cases_from_figma_endpoint(project_id):
    current_user_id = get_jwt_identity()
    project = _verify_project_ownership(project_id, current_user_id) # Verify ownership
    app.logger.info("Received request for /api/suggest-test-cases-from-figma")
    data = request.get_json()
    if not data or not all(k in data and data[k].strip() for k in ['figma_url', 'figma_token']):
        return create_response(error="Missing figma_url or figma_token", status_code=400)
    
    figma_url, figma_token = data['figma_url'], data['figma_token']
    source_description = "Figma File" 

    try:
        file_key = extract_file_key_from_url(figma_url)
        if not file_key:
            return create_response(error="Could not extract valid File Key from the provided Figma URL.", status_code=400)
        source_description = f"Figma File ({file_key})"

        figma_json_content = get_figma_file_content(file_key, figma_token)
        extracted_text = process_figma_data(figma_json_content)

        if not extracted_text or not extracted_text.strip():
             return create_response(error="Could not extract any text content from the Figma file via API.", status_code=400)
        
        extracted_text = truncate_text(extracted_text, MAX_AI_INPUT_CHARS)
        prompt = _generate_json_test_case_prompt(source_description, extracted_text, is_figma=True)
        ai_response_text = generate_text([prompt])
        parsed_result = _handle_ai_json_response_internal(ai_response_text, expects_array=True)

        if "error" in parsed_result:
            return create_response({
                "suggestions": parsed_result.get("raw_text"),
                "source": source_description,
                "warning": parsed_result.get("warning")
            }, status_code=200)

        # --- DATABASE LOGIC ---
        suggestions_list = parsed_result.get("data", [])
        all_tcs_flat = get_flattened_tcs_backend(suggestions_list)
        
        if not all_tcs_flat:
            return create_response({"suggestions": [], "source": source_description})

        generation_event = TestCaseGeneration(
            source_type=source_description,
            test_case_count=len(all_tcs_flat)
        )
        generation_event.save()

        saved_test_cases = []
        for tc_data in all_tcs_flat:
            new_case = TestCase(
                project=project,
                generation_event=generation_event,
                case_id_string=tc_data.get('id'),
                scenario=tc_data.get('scenario_title') or tc_data.get('scenario'),
                summary=tc_data.get('test_case_summary'),
                pre_condition=tc_data.get('pre_condition'),
                test_steps=tc_data.get('test_steps', []),
                test_data=tc_data.get('test_data', {}),
                expected_result=tc_data.get('expected_result'),
                priority=tc_data.get('priority'),
                severity=tc_data.get('severity')
            )
            new_case.save()
            saved_test_cases.append(new_case)
        
        generation_event.test_case_ids = [case.id for case in saved_test_cases]
        generation_event.save()
        
        app.logger.info(f"Saved TestCaseGeneration event {generation_event.id} with {len(saved_test_cases)} test cases from Figma.")
        
        saved_test_cases_dicts = [case.to_dict() for case in saved_test_cases]
        return create_response({"suggestions": saved_test_cases_dicts, "source": source_description})

    except ConnectionError as ce:
         return create_response(error=str(ce), status_code=502)
    except ValueError as ve:
         return create_response(error=f"Error processing Figma data: {ve}", status_code=500)
    except Exception as e:
         app.logger.error(f"Unexpected error processing Figma URL {figma_url}: {e}", exc_info=True)
         return create_response(error="An internal server error occurred processing the Figma request.", status_code=500)


# --- Other AI Feature Endpoints (MODIFIED FOR JSON OUTPUT) ---

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
        ai_response_text = generate_text([prompt])
        # MODIFIED: Use the new JSON object response handler
        return _handle_ai_json_object_response(ai_response_text, f"Automation Rec for '{description[:30]}...'", "recommendation")
    except Exception as e:
        app.logger.error(f"Error during GenAI call for automation recommendation: {e}", exc_info=True) # Log from your version
        return create_response(error="Failed to generate recommendation due to an internal error.", status_code=500)


@app.route('/api/project/<string:project_id>/analyze-code-change-impact', methods=['POST'])
@jwt_required()
def analyze_code_change_impact_endpoint(project_id):
    current_user_id = get_jwt_identity()
    project = _verify_project_ownership(project_id, current_user_id)  # Verify ownership

    app.logger.info("Received request for /api/analyze-code-change-impact")
    data = request.get_json()
    required_fields = ['code_change_description', 'test_case_description']
    if not data or not all(field in data and data[field].strip() for field in required_fields):
        return create_response(error=f"Missing or empty required fields: {required_fields}", status_code=400)

    code_change_desc = truncate_text(data['code_change_description'], MAX_AI_INPUT_CHARS // 2)
    test_case_desc = truncate_text(data['test_case_description'], MAX_AI_INPUT_CHARS // 2)
    source_info_text = f"Impact analysis for: '{test_case_desc[:50]}...'"
    
    prompt = f"""
    Act as an AI assisting with Test Impact Analysis.
    Return a single JSON object with keys: "impact_likelihood" (string: "High", "Medium", "Low", or "None") and "reasoning" (string).
    Do NOT include any text outside this single JSON object.

    Example:
    {{ "impact_likelihood": "High", "reasoning": "Keywords overlap significantly." }}

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
        ai_response_text = generate_text([prompt])
        result = _handle_ai_json_object_response_internal(ai_response_text) 

        analysis_to_save = {}
        is_fallback = False
        if "error" in result:
            is_fallback = True
            analysis_to_save = {"raw_text": result.get("raw_text"), "warning": result.get("warning")}
            app.logger.warning(f"Saving raw text fallback for impact analysis.")
        else:
            analysis_to_save = result["data"]

        # --- SAVE TO DATABASE ---
        new_analysis = AiAnalysis(
            project=project,
            analysis_type='impact',
            source_info=source_info_text,
            analysis_json=analysis_to_save
        )
        new_analysis.save()
        app.logger.info(f"Successfully saved impact analysis to MongoDB. DB ID: {new_analysis.id}")
        
        if is_fallback:
            return create_response({"impact_analysis": analysis_to_save["raw_text"], "warning": analysis_to_save["warning"]}, status_code=200)
        else:
            return create_response(new_analysis.to_dict())

    except Exception as e:
        app.logger.error(f"Error during GenAI call for code change impact: {e}", exc_info=True)
        return create_response(error="Failed to generate impact analysis due to an internal error.", status_code=500)
    

# --- Main Execution Guard ---
if __name__ == '__main__':
    app.logger.info("Starting Flask development server...")
    app.run(host='0.0.0.0', port=5001, debug=True)