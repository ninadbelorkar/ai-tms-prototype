# File: backend/utils/figma_client.py
import requests
import logging
import re

FIGMA_API_BASE_URL = "https://api.figma.com/v1"

def extract_file_key_from_url(figma_url: str) -> str | None:
    """Extracts the file key from various Figma URL formats (file or proto)."""
    # UPDATED Regex: Looks for either /file/ OR /proto/ followed by the key
    match = re.search(r"(?:/file/|/proto/)([a-zA-Z0-9]+)", figma_url)
    if match:
        file_key = match.group(1) # Get the captured key (the part in parentheses)
        logging.info(f"Extracted Figma key '{file_key}' from URL.")
        return file_key
    logging.warning(f"Could not extract Figma file key using regex from URL: {figma_url}")
    return None

def get_figma_file_content(file_key: str, token: str) -> dict:
    """Fetches the file content JSON from the Figma API."""
    headers = {"X-Figma-Token": token}
    url = f"{FIGMA_API_BASE_URL}/files/{file_key}"
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status() # Raises HTTPError for bad responses (4XX, 5XX)
        logging.info(f"Successfully fetched Figma file content for key: {file_key}")
        return response.json()
    except requests.exceptions.RequestException as e:
        logging.error(f"Figma API request failed: {e}", exc_info=True)
        # Handle specific errors if needed (e.g., 401 Unauthorized, 404 Not Found)
        status_code = e.response.status_code if e.response is not None else 500
        error_detail = f"Failed to fetch Figma file (Status: {status_code}). Check file key/URL and token permissions. Error: {e}"
        if status_code == 404:
            error_detail = f"Figma file not found (404). Check the file key/URL."
        elif status_code == 403 or status_code == 401:
             error_detail = f"Figma API access denied (403/401). Check your Personal Access Token."

        raise ConnectionError(error_detail) # Re-raise as a more specific error
    except Exception as e:
         logging.error(f"Unexpected error fetching Figma file: {e}", exc_info=True)
         raise ConnectionError(f"An unexpected error occurred while contacting Figma API: {e}")


def extract_text_from_figma_node(node: dict, extracted_texts: list):
    """Recursively extracts text from Figma nodes."""
    node_type = node.get("type")
    node_name = node.get("name", "") # Get node name for context

    # Add node name itself if it seems relevant (e.g., Frame names)
    if node_type in ["FRAME", "COMPONENT", "INSTANCE", "GROUP"] and node_name:
         extracted_texts.append(f"[{node_type}: {node_name}]") # Add context marker

    # Extract text characters directly if it's a TEXT node
    if node_type == "TEXT":
        characters = node.get("characters")
        if characters:
            extracted_texts.append(characters.strip())

    # Recursively process children if the node has them
    if "children" in node and isinstance(node["children"], list):
        for child in node["children"]:
            extract_text_from_figma_node(child, extracted_texts)


def process_figma_data(figma_json_data: dict) -> str:
    """Processes the Figma file JSON to extract relevant text."""
    if not figma_json_data or "document" not in figma_json_data:
        logging.warning("Invalid or empty Figma JSON data received.")
        return ""

    all_texts = []
    document_node = figma_json_data["document"]

    # Start traversal from the document node's children (usually pages)
    if "children" in document_node and isinstance(document_node["children"], list):
         for page_node in document_node["children"]:
             extract_text_from_figma_node(page_node, all_texts)

    # Join extracted text pieces with newlines for readability
    full_text = "\n".join(filter(None, all_texts)) # Filter out empty strings
    logging.info(f"Extracted {len(full_text)} characters from Figma data.")
    return full_text