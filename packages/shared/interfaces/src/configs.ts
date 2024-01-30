import mongoose from "mongoose";

export enum ENVIRONMENT {
  LOCAL="local",
  DEV="dev",
  PROD="prod"
}

interface IBaseServiceConfig {
  host: string;
  password: string;
  user: string;
  port: string;
}

export interface IMongoConfig extends IBaseServiceConfig {
  db: string;
  options: mongoose.ConnectOptions;
}

export interface IRabbitConfig extends IBaseServiceConfig {
  vhost: string;
  queueType: string;
  queues: {
    test: string;
  };
}

export interface ICoreConfig {
  port: number;
  env: ENVIRONMENT;
  serverName: string;
}
