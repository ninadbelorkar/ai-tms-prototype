# File: backend/utils/image_parser.py

import zipfile
import io
from PIL import Image
import logging

# Supported image formats within the ZIP
SUPPORTED_IMAGE_FORMATS = ('png', 'jpeg', 'jpg')

def process_zip_file_for_images(file_stream):
    """
    Extracts supported images from a ZIP file stream.

    Args:
        file_stream: A file-like object representing the ZIP file.

    Returns:
        A list of dictionaries, where each dict is {'filename': str, 'image': PIL.Image}.
        Returns an empty list if no supported images are found.
    """
    images_data = []
    try:
        with zipfile.ZipFile(file_stream, 'r') as zf:
            for filename in zf.namelist():
                # Skip special macOS resource fork files and directories
                if filename.startswith('__MACOSX/') or filename.endswith('/'):
                    continue
                
                file_ext = filename.lower().rsplit('.', 1)[-1]
                if file_ext in SUPPORTED_IMAGE_FORMATS:
                    logging.info(f"Found supported image in ZIP: {filename}")
                    image_bytes = zf.read(filename)
                    image = Image.open(io.BytesIO(image_bytes))
                    images_data.append({'filename': filename, 'image': image})
                else:
                    logging.warning(f"Skipping unsupported file in ZIP: {filename}")
        return images_data
    except zipfile.BadZipFile:
        logging.error("Uploaded file is not a valid ZIP file.")
        raise ValueError("Uploaded file is not a valid ZIP file.")
    except Exception as e:
        logging.error(f"Error processing ZIP file: {e}", exc_info=True)
        raise IOError(f"An error occurred while reading the ZIP file: {e}")