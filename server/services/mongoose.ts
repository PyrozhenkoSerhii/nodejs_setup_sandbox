import { connect } from "mongoose";

export const connectToMongo = async () => {
  const uri = `mongodb://${process.env.MONGODB_USERNAME}:${process.env.MONGODB_PASSWORD}@mongodb_setup:27017/${process.env.MONGODB_DATABASE}`;
  console.log(uri);
  await connect(uri);
  console.log("connected");
};
