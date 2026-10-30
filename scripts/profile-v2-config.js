// Public web-app configuration only. Never put service-account keys or tokens here.
window.NJHitzProfileV2 = Object.freeze({
  enabled: true,
  // Optional PUBLIC browser key, restricted to njhitz.org/www.njhitz.org and Drive API.
  // Leave empty until direct playback is tested. Never use a server key or OAuth token.
  driveVideoApiKey: 'AIzaSyBOewWEE65SDrYpKw1Gd_9U5SbGOX-MJvk',
  endpoint: 'https://script.google.com/macros/s/AKfycbz3eGOVLqW8lEYYfpn4jvDnoARyQr6C_9MdNmtawZN5trsi1zefQa_9fVAs0u6JoAmE/exec',
  firebase: {
    apiKey: 'AIzaSyAlQPCrwEOIhRfy1-Gs7g5hNl2O8mFWq6E',
    authDomain: 'nj-hitz-org.firebaseapp.com',
    projectId: 'nj-hitz-org',
    appId: '1:191365669190:web:71ed8b17d921727ee24547'
  }
});
