import mongoose from "mongoose";

const imageSchema = new mongoose.Schema({
  imageName: String,
  imageBinaryData: Buffer, // Field for storing binary data
  clarifaiTags: [String], // Array of clarifai tags
});

const Image = mongoose.model("Image", imageSchema);

module.exports = Image;
