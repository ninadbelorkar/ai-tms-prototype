// File: src/utils/clipboardUtils.js
export const copyToClipboard = (text, onSuccess, onError) => {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(onSuccess, onError);
    } else {
        // Fallback for older browsers
        try {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            onSuccess();
        } catch (err) {
            onError(err);
        }
    }
};