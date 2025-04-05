const jwt = require('jsonwebtoken');
const logger = require('./logger'); // Import the logger module

// Secret key for signing the JWT (store this securely in an environment variable)
const SECRET_KEY = process.env.SECRET_KEY || 'YOUR-SECRET-KEY';
// Default expiration time for tokens (read from environment or fallback to '1h')
const DEFAULT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';

/**
 * Generates a JWT token for API access.
 * @param {Object} payload - The payload to include in the token (e.g., { scope: 'api_access' }).
 * @returns {Object} An object containing the token and its expiration time.
 */
function generateToken(payload) {
  try {
    logger.info('[generateToken] Generating JWT token...');
    const token = jwt.sign(payload, SECRET_KEY, { expiresIn: DEFAULT_EXPIRES_IN }); // Use the default expiration time

    // Decode the token to extract the expiration time
    const decoded = jwt.decode(token);
    const expiresIn = decoded.exp; // Expiration time in seconds since the epoch

    logger.info('[generateToken] JWT token generated successfully');
    return { token, expiresIn };
  } catch (error) {
    logger.error(`[generateToken] Error generating JWT token: ${error.message}`, error);
    throw error; // Re-throw the error to handle it in the calling function
  }
}

module.exports = { generateToken };