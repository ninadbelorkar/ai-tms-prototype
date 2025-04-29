# File: backend/utils/file_parser.py (Updated for PyPDF2)
# REMOVE or comment out: import fitz
import PyPDF2 # Import PyPDF2 instead
import docx
import io
import logging

def parse_pdf(file_stream) -> str:
    """Extracts text from a PDF file stream using PyPDF2."""
    text = ""
    try:
        # Read the stream into bytes first (often safer for libraries)
        file_bytes = file_stream.read()
        if not file_bytes:
            logging.warning("Attempted to parse an empty PDF file stream.")
            return ""

        # Create an in-memory stream for PyPDF2
        pdf_stream = io.BytesIO(file_bytes)

        # Use PyPDF2 PdfReader
        reader = PyPDF2.PdfReader(pdf_stream)
        num_pages = len(reader.pages)
        logging.info(f"PyPDF2 found {num_pages} pages in the PDF.")

        for i in range(num_pages):
            page = reader.pages[i]
            try:
                page_text = page.extract_text()
                if page_text:  # Check if text was actually extracted
                    text += page_text + "\n" # Add newline between pages
                else:
                    logging.warning(f"PyPDF2 extracted no text from page {i+1}.")
            except Exception as page_error:
                # Log error for specific page but continue if possible
                logging.error(f"Error extracting text from PDF page {i+1}: {page_error}", exc_info=False) # Set exc_info=False to avoid overly long logs

        logging.info(f"PyPDF2 parsed PDF bytes, extracted {len(text)} characters.")
        if not text.strip() and num_pages > 0:
             logging.warning("PyPDF2 extracted only whitespace or failed to extract text from any page.")
             # Optionally raise an error here if no text is unacceptable
             # raise ValueError("Could not extract any meaningful text from the PDF using PyPDF2.")

        return text
    except Exception as e:
        # Catch errors during PdfReader initialization or other issues
        logging.error(f"Error parsing PDF with PyPDF2: {e}", exc_info=True)
        raise ValueError(f"Could not parse PDF file using PyPDF2. Ensure it's a valid PDF. Error: {e}")

# --- Keep parse_docx and get_file_extension as they were ---
def parse_docx(file_stream) -> str:
    # ... (no changes needed here) ...
    text = ""
    try:
        document = docx.Document(file_stream)
        for para in document.paragraphs:
            text += para.text + "\n" # Add newline between paragraphs
        logging.info(f"Successfully parsed DOCX, extracted {len(text)} characters.")
        return text
    except Exception as e:
        logging.error(f"Error parsing DOCX: {e}", exc_info=True)
        raise ValueError(f"Could not parse DOCX file: {e}")

def get_file_extension(filename):
    # ... (no changes needed here) ...
    if '.' in filename:
        return filename.rsplit('.', 1)[1].lower()
    return None