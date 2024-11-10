const { MongoClient } = require('mongodb');

class MongoDBService {
  constructor(uri, dbName, collectionName) {
    this.uri = uri;
    this.dbName = dbName;
    this.collectionName = collectionName;
    this.client = new MongoClient(this.uri, { useNewUrlParser: true, useUnifiedTopology: true });
    this.isConnected = false;
  }

  async connect() {
    if (!this.isConnected) {
      try {
        await this.client.connect();
        this.database = this.client.db(this.dbName);
        this.collection = this.database.collection(this.collectionName);
        this.isConnected = true;
        console.log(`[${new Date().toISOString()}] Connected to MongoDB: ${this.uri}`);
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Error connecting to MongoDB:`, error);
      }
    }
  }

  async insertData(data) {
    try {
      await this.connect();
      const result = await this.collection.insertOne(data);
      console.log(`[${new Date().toISOString()}] Data inserted with _id: ${result.insertedId}`);
      return result;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error inserting data into MongoDB:`, error);
    }
  }

  async insertMany(data) {
    try {
      await this.connect();
      const result = await this.collection.insertMany(data);
      console.log(`[${new Date().toISOString()}] Data inserted:`, result.insertedIds);
      return result;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error inserting multiple data into MongoDB:`, error);
    }
  }

  async readDataAll(query = {}) {
    try {
      await this.connect();
      const foundData = await this.collection.find(query).toArray();
      console.log(`[${new Date().toISOString()}] Found data:`, foundData);
      return foundData;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error reading data from MongoDB:`, error);
    }
  }

  async readData(query) {
    try {
      await this.connect();
      const foundData = await this.collection.findOne(query);
      console.log(`[${new Date().toISOString()}] Found data:`, foundData);
      return foundData;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error reading data from MongoDB:`, error);
    }
  }

  async deleteData(query) {
    try {
      await this.connect();
      const result = await this.collection.deleteOne(query);
      console.log(`[${new Date().toISOString()}] Data deleted with query:`, query);
      return result;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error deleting data from MongoDB:`, error);
    }
  }

  async deleteAllPlaylists() {
    try {
      await this.connect();
      const result = await this.collection.deleteMany({});
      console.log(`[${new Date().toISOString()}] All playlists removed`);
      return result;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error removing all playlists from MongoDB:`, error);
    }
  }

  async updateData(query, update) {
    try {
      await this.connect();
      const result = await this.collection.updateOne(query, { $set: update });
      console.log(`[${new Date().toISOString()}] Data updated with query:`, query, 'and update:', update);
      return result;
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error updating data in MongoDB:`, error);
    }
  } 

  async close() {
    if (this.isConnected) {
      try {
        await this.client.close();
        this.isConnected = false;
        console.log(`[${new Date().toISOString()}] MongoDB connection closed`);
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Error closing MongoDB connection:`, error);
      }
    }
  }
}

module.exports = MongoDBService;