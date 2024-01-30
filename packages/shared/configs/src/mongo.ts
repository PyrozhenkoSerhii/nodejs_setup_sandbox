import { IMongoConfig } from "@shared/interfaces";

import { tryGetEnv } from "./get-env";

export const getMongoConfig = (): IMongoConfig => ({
  user: tryGetEnv("MONGODB_USERNAME"),
  password: tryGetEnv("MONGODB_PASSWORD"),
  host: tryGetEnv("MONGODB_HOST"),
  port: +tryGetEnv("MONGODB_PORT"),
  db: tryGetEnv("MONGODB_DATABASE"),
  options: {
    // to prevent mongodb from indexing collections automatically
    // is a way to go if we need to go to AWS DocumentDB or if we're concerned with performance
    autoIndex: false,
    // For how long mongo retries operations (queries, initial connection establishment) before erroring out
    // IMPORTANT: do not reduce it if replica set is used
    serverSelectionTimeoutMS: 1000,
    // the amount of time after which mongo considers a connection failed
    connectTimeoutMS: 2000,
    // How often we ping server to see if the connection is alive
    // This setting, together with the "connectTimeoutMS" is very important
    // to know if the server is healthy or not.
    // It will take "heartbeatFrequencyMS + serverSelectionTimeoutMS" at most to know that there's no connection
    // Same, it will take "heartbeatFrequencyMS + serverSelectionTimeoutMS"  to know that the connection appeared again, when reconnecting
    heartbeatFrequencyMS: 1000,
  },
});
