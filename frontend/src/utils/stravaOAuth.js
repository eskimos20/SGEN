/**
 * Strava OAuth Popup Flow
 * Opens Strava authorization in a popup window and automatically captures the authorization code
 * Uses postMessage for secure cross-window communication
 */

export const openStravaAuthPopup = (authUrl) => {
  return new Promise((resolve, reject) => {
    // Calculate center position for popup
    const width = 500;
    const height = 700;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    // Open popup window
    const popup = window.open(
      authUrl,
      'Strava Authorization',
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`
    );

    if (!popup) {
      reject(new Error('Popup blocked. Please allow popups for this site.'));
      return;
    }

    // Listen for messages from the callback page
    const messageHandler = (event) => {
      // Verify origin for security
      if (event.origin !== window.location.origin) {
        return;
      }

      const { type, code, error, errorDescription } = event.data;
      if (type === 'STRAVA_AUTH_SUCCESS' && code) {
        // Success! Clean up and resolve
        window.removeEventListener('message', messageHandler);
        clearInterval(pollTimer);
        resolve(code);
      } else if (type === 'STRAVA_AUTH_ERROR') {
        // Error from Strava
        window.removeEventListener('message', messageHandler);
        clearInterval(pollTimer);
        reject(new Error(errorDescription || error || 'Authorization failed'));
      }
    };

    window.addEventListener('message', messageHandler);

    // Poll to detect if popup is closed manually
    const pollTimer = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollTimer);
        window.removeEventListener('message', messageHandler);
        reject(new Error('Authorization cancelled'));
      }
    }, 500);

    // Timeout after 5 minutes
    setTimeout(() => {
      if (!popup.closed) {
        clearInterval(pollTimer);
        window.removeEventListener('message', messageHandler);
        popup.close();
        reject(new Error('Authorization timeout'));
      }
    }, 5 * 60 * 1000);
  });
};
