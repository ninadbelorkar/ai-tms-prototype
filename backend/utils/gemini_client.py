import google.generativeai as genai
import os
import logging
from dotenv import load_dotenv

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Configuration ---

# Load environment variables from .env file located in the parent directory (backend/)
# Assumes this script is run from the context where the .env file is accessible relative to the execution path.
# If running app.py, it will load correctly. If running this file directly, ensure .env is discoverable.
load_dotenv()
API_KEY = os.getenv("GOOGLE_API_KEY")

if not API_KEY:
    logging.error("GOOGLE_API_KEY not found in environment variables. Ensure .env file exists and is loaded.")
    raise ValueError("Missing GOOGLE_API_KEY")

try:
    genai.configure(api_key=API_KEY)
except Exception as e:
    logging.error(f"Failed to configure Google GenAI SDK: {e}")
    raise

# Model Configuration (Adjust defaults as needed)
DEFAULT_GENERATION_CONFIG = {
    "temperature": 0.7, # Lower temperature -> more deterministic; Higher -> more creative/random
    "top_p": 0.95,
    "top_k": 40, # Limits the sampling pool
    "max_output_tokens": 8000, # Max length of the response
}

# Safety settings - adjust thresholds as needed (BLOCK_NONE, BLOCK_LOW_AND_ABOVE, BLOCK_MEDIUM_AND_ABOVE, BLOCK_ONLY_HIGH)
DEFAULT_SAFETY_SETTINGS = [
    {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
    {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
    {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
    {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
]

# Select the model - 'gemini-1.5-flash' is often faster and cheaper for many tasks
# 'gemini-1.0-pro' or 'gemini-1.5-pro' might be more powerful but slower/more expensive.
MODEL_NAME = "gemini-1.5-flash-latest" # Using flash as a good default

# --- Initialization ---
try:
    model = genai.GenerativeModel(
        model_name=MODEL_NAME,
        generation_config=DEFAULT_GENERATION_CONFIG,
        safety_settings=DEFAULT_SAFETY_SETTINGS
    )
    logging.info(f"Successfully initialized GenerativeModel: {MODEL_NAME}")
except Exception as e:
    logging.error(f"Failed to initialize GenerativeModel ({MODEL_NAME}): {e}")
    raise

# --- Core Function ---

def generate_text(prompt_parts: list) -> str:
    """
    Sends a prompt (text and/or images) to the Gemini model and returns the generated text.

    Args:
        prompt_parts: A list containing text strings and/or PIL.Image objects.

    Returns:
        The generated text content as a string, or an error message.
    """

    if not prompt_parts:
        logging.warning("generate_text called with empty prompt parts.")
        return "Error: Prompt cannot be empty."

    try:
        logging.info(f"Sending prompt to Gemini multimodal model ({MODEL_NAME})...")
        response = model.generate_content(prompt_parts)
        # logging.info(f"Received response from Gemini.")

        # --- Response Handling ---
        # Accessing response text - check Gemini API documentation for the most current structure
        # Use response.text if available and seems correct
        if hasattr(response, 'text') and response.text:
            return response.text

        # Fallback: Check candidates if .text isn't directly available or empty
        elif response.candidates and response.candidates[0].content.parts:
            return "".join(part.text for part in response.candidates[0].content.parts if hasattr(part, 'text'))

        # Handle cases where the response might be blocked due to safety settings or other issues
        # Check the prompt_feedback attribute if available
        if hasattr(response, 'prompt_feedback') and response.prompt_feedback.block_reason:
             block_reason = response.prompt_feedback.block_reason
             logging.warning(f"Gemini response blocked. Reason: {block_reason}")
             return f"Error: Content generation blocked due to {block_reason}."

        # If no text found after checks
        logging.warning("Gemini response received, but no text content found or extracted.")
        # Log the full response for debugging complex cases
        # logging.debug(f"Full Gemini Response: {response}")
        return "Error: Failed to extract valid text content from Gemini response."

    except Exception as e:
        # Catch potential API errors, network issues, etc.
        logging.error(f"Error calling Google GenAI: {e}", exc_info=True) # Log stack trace
        # Consider checking for specific exception types from the google-generativeai library
        return f"Error: Failed to generate content due to: {e}"

# --- Example Usage (for testing this module directly) ---
if __name__ == "__main__":
    print("Testing gemini_client.py...")
    # Ensure you have a .env file in the *backend* directory when running this directly
    # Or that GOOGLE_API_KEY is set in your shell environment
    load_dotenv()
    if not os.getenv("GOOGLE_API_KEY"):
         print("Error: GOOGLE_API_KEY not set. Cannot run test.")
    else:
        test_prompt = "What is the main purpose of a requirements.txt file in Python?"
        print(f"Sending test prompt: '{test_prompt}'")
        result = generate_text(test_prompt)
        print("\n--- Gemini Response ---")
        print(result)
        print("--- End of Response ---")

        # Test error case (empty prompt)
        print("\nTesting empty prompt...")
        result_empty = generate_text("")
        print(f"Empty prompt result: {result_empty}")