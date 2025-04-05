const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const logger = require('./logger'); // Import the logger module

// Secret key for signing the HMAC (store this securely in an environment variable)
const SECRET_KEY = process.env.SECRET_KEY || 'YOUR-SECRET-KEY';

/**
 * Middleware to authenticate API key using HMAC.
 */
function authenticateAPIKey(req, res, next) {
  logger.info('[authenticateAPIKey] Received headers:', JSON.stringify(req.headers, null, 2));
  const apiKey = req.headers['x-api-key'];
  const nonce = req.headers['x-nonce'];

  logger.info(`[authenticateAPIKey] API Key: ${apiKey}`);
  logger.info(`[authenticateAPIKey] Nonce: ${nonce}`);

  if (!apiKey || !nonce) {
    return res.status(401).json({ message: 'Missing x-api-key or x-nonce' });
  }

  try {
    // Generate the expected HMAC using the nonce and SECRET_KEY
    const expectedAPIKey = crypto
      .createHmac('sha256', SECRET_KEY)
      .update(nonce)
      .digest('hex');

    logger.info(`[authenticateAPIKey] Expected API Key: ${expectedAPIKey}`);

    // Compare the provided API key with the expected one
    if (apiKey !== expectedAPIKey) {
      return res.status(401).json({ message: 'Unauthorized: Invalid API key' });
    }

    // If the API key is valid, proceed
    next();
  } catch (error) {
    logger.error(`[authenticateAPIKey] Error during API key authentication: ${error.message}`, error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}

/**
 * Middleware to authenticate JWT token.
 */
function authenticateToken(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];

  if (!token) {
    logger.warn('[authenticateToken] No token provided');
    return res.status(401).json({ message: 'Unauthorized' });
  }

  logger.info('[authenticateToken] Token received, validating...');
  jwt.verify(token, SECRET_KEY, (error, decoded) => {
    if (error) {
      logger.error(`[authenticateToken] Token validation failed: ${error.message}`, error);
      return res.status(401).json({ message: 'Invalid token' });
    }

    logger.info('[authenticateToken] Token validated successfully');
    req.user = decoded;
    next();
  });
}

module.exports = { authenticateAPIKey, authenticateToken };