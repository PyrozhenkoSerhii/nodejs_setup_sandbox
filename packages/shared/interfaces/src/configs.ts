import mongoose from "mongoose";

export enum ENVIRONMENT {
  LOCAL="local",
  DEV="dev",
  PROD="prod"
}

export enum ESSENTIAL_SERVICE {
  MONGODB="MongoDBService",
  RABBITMQ="RabbitMqService"
}

interface IBaseServiceConfig {
  host: string;
  password: string;
  user: string;
  port: number;
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
  healthCheckSeconds: number;
}

export interface ICoreConfig {
  port: number;
  env: ENVIRONMENT;
  serverName: string;
  allowedNodeIp: string;
}
