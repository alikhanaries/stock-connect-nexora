import mongoose from "mongoose";
import { config } from "#config/config.js";

let dbConnection = null;

const connect = async () => {
  if (dbConnection) {
    return dbConnection;
  }
  try {
    console.time("MongoDB Connection");
    dbConnection = await mongoose.connect(config.DB_URL);
    console.timeEnd("MongoDB Connection");
    return dbConnection;
  } catch (err) {
    console.error("MongoDB Connection Error:", err);
    throw err;
  }
};

const disconnect = async () => {
  if (dbConnection) {
    try {
      console.time("MongoDB Disconnection");
      await mongoose.disconnect();
      console.timeEnd("MongoDB Disconnection");
      dbConnection = null;
    } catch (err) {
      console.error("MongoDB Disconnection Error:", err);
      throw err;
    }
  }
};

export default { connect, disconnect };
