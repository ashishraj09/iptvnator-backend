const { createLogger, format, transports } = require('winston');

// Read the log level from the environment variable or default to 'info'
const logLevel = process.env.LOG_LEVEL || 'info';

const logger = createLogger({
  level: logLevel, // Set the log level dynamically
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), // Add timestamp
    format.errors({ stack: true }), // Include stack trace for errors
    format.printf(({ timestamp, level, message, stack }) =>
      stack
        ? `${timestamp} [${level.toUpperCase()}]: ${message}\n${stack}` // Include stack trace for errors
        : `${timestamp} [${level.toUpperCase()}]: ${message}`
    )
  ),
  transports: [
    new transports.Console(), // Log to the console
    // new transports.File({ filename: 'application.log' }) // Log to a file
  ],
});

module.exports = logger;