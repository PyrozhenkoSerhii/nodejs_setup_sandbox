import mongoose from "mongoose";

export enum ENVIRONMENT {
  LOCAL="local",
  DEV="dev",
  PROD="prod"
}

export enum APP_NAME {
  SERVER="server"
}

export enum ESSENTIAL_SERVICE_NAME {
  MONGODB="MongoDBService",
  RABBITMQ="RabbitMqService"
}

export interface ICoreConfig {
  port: number;
  env: ENVIRONMENT;
  appName: string;
  allowedNodeIp: string;
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

export type RABBIT_QUEUE_NAME = "TEST"|"TEST2";

export interface IRabbitConfig extends IBaseServiceConfig {
  vhost: string;
  queueType: string;
  queues: {
    [key in RABBIT_QUEUE_NAME]: string;
  };
  queuesTTL: {
    [key in RABBIT_QUEUE_NAME]: number;
  }
  healthCheckSeconds: number;
  connectionTimeoutMs: number;
  dlx: {
    exchangeName: string;
    queueName: string;
    routingKey: string;
  },
}
