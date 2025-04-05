const { Level } = require('level');
const logger = require('./logger');

/**
 * A service class for interacting with a LevelDB database.
 */
class LevelDBService {
  /**
   * Initializes the LevelDBService with the given database path.
   * @param {string} dbPath - The path to the LevelDB database.
   */
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = new Level(this.dbPath);
  }

  /**
   * Inserts a single key-value pair into the database.
   * @param {string} _id - The key to insert.
   * @param {Object} value - The value to associate with the key.
   */
  async insertData(_id, value) {
    try {
      await this.db.put(_id, JSON.stringify(value));
      logger.info(`[insertData] Data inserted with _id: ${_id}`, JSON.stringify(value));
    } catch (error) {
      logger.debug(`[insertData] Error inserting data into LevelDB: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Inserts multiple key-value pairs into the database in a batch operation.
   * @param {Array<Object>} data - An array of objects, each containing `_id` and value.
   */
  async insertMany(data) {
    const batch = [];
    for (const item of data) {
      batch.push({ type: 'put', key: item._id, value: JSON.stringify(item) });
    }

    try {
      await this.db.batch(batch);
      logger.info(`[insertMany] Multiple data inserted`);
    } catch (error) {
      logger.debug(`[insertMany] Error inserting multiple data into LevelDB: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Reads data from the database by key.
   * @param {string} _id - The key to read.
   * @returns {Object|null} The parsed value associated with the key, or null if not found.
   */
  async readData(_id) {
    try {
      const value = await this.db.get(_id); // Attempt to get the value by key

      // Check if the value is undefined
      if (value === undefined) {
        logger.warn(`[readData] Data not found for _id: ${_id}`);
        return null; // Return null if the value is undefined
      }

      logger.info(`[readData] Found data for _id ${_id}:`, JSON.parse(value));
      return JSON.parse(value); // Parse and return the JSON value
    } catch (error) {
      logger.debug(`[readData] Error reading data from LevelDB: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Reads all key-value pairs from the database.
   * @returns {Array<Object>} An array of all key-value pairs in the database.
   */
  async readDataAll() {
    const allData = [];
    try {
      for await (const [key, value] of this.db.iterator({ keys: true, values: true })) {
        allData.push({ _id: key, ...JSON.parse(value) }); // Parse each value as JSON
      }
      logger.info(`[readDataAll] Retrieved all data from LevelDB`, allData); // Log the array directly
      return allData;
    } catch (error) {
      logger.error(`[readDataAll] Error reading all data from LevelDB: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Deletes a single key-value pair from the database.
   * @param {string} _id - The key to delete.
   */
  async deleteData(_id) {
    try {
      await this.db.del(_id);
      logger.info(`[deleteData] Data deleted for _id: ${_id}`);
    } catch (error) {
      logger.debug(`[deleteData] Error deleting data from LevelDB: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Deletes all data from the database by iterating over all keys.
   */
  async deleteAllData() {
    try {
      logger.info(`[deleteAllData] Starting deletion of all data from LevelDB`);

      let keyCount = 0; // Counter for keys
      for await (const key of this.db.iterator({ keys: true, values: false })) {
        const cleanedKey = key.toString().replace(/,$/, '').trim(); // Remove trailing commas and trim whitespace
        logger.info(`[deleteAllData] Deleting key: ${cleanedKey}`);
        await this.deleteData(cleanedKey); // Call deleteData for each key
        keyCount++;
      }

      if (keyCount > 0) {
        logger.info(`[deleteAllData] Successfully deleted ${keyCount} keys from LevelDB`);
      } else {
        logger.info(`[deleteAllData] No data found to delete in LevelDB`);
      }
    } catch (error) {
      logger.debug(`[deleteAllData] Error deleting all data from LevelDB: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Updates a key-value pair in the database. If the key does not exist, it will be created.
   * @param {string} _id - The key to update.
   * @param {Object} value - The new value to associate with the key.
   */
  async updateData(_id, value) {
    try {
      await this.db.put(_id, JSON.stringify(value));
      logger.info(`[updateData] Data updated for _id: ${_id}`, JSON.stringify(value));
    } catch (error) {
      logger.debug(`[updateData] Error updating data in LevelDB: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Closes the LevelDB instance.
   */
  async close() {
    try {
      await this.db.close();
      logger.info(`[close] LevelDB connection closed`);
    } catch (error) {
      logger.debug(`[close] Error closing LevelDB connection: ${error.message}`, error);
      throw error;
    }
  }
}

module.exports = LevelDBService;