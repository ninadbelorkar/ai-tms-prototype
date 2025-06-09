// File: frontend/src/utils/clipboardUtils.js
export const copyToClipboard = async (text, onSuccess, onError) => {
    if (!navigator.clipboard) {
        // Fallback for older browsers (less common now)
        try {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.style.position = "fixed"; // Prevent scrolling to bottom
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            if (onSuccess) onSuccess();
        } catch (err) {
            console.error("Fallback: Oops, unable to copy", err);
            if (onError) onError("Failed to copy using fallback method.");
        }
        return;
    }

    try {
        await navigator.clipboard.writeText(text);
        if (onSuccess) onSuccess();
    } catch (err) {
        console.error('Failed to copy text: ', err);
        if (onError) onError("Failed to copy text to clipboard.");
    }
};