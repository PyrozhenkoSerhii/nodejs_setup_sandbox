import mongoose from "mongoose";

interface IBaseServiceConfig {
  host: string;
  password: string;
  user: string;
}

export interface IMongoConfig extends IBaseServiceConfig {
  db: string;
  port: string;
  options: mongoose.ConnectOptions;
}
