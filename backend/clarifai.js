/* UUID */
import { v4 as uuidv4 } from "uuid"; // Random number generator

require('dotenv').config();
import express from "express";
const app = express();

import fs from "fs";
import path from "path";

import { ClarifaiStub } from "clarifai-nodejs-grpc";
import { grpc } from "clarifai-nodejs-grpc";
const stub = ClarifaiStub.grpc();

import { MongoClient } from "mongodb";

import { Queue } from "bullmq";
import { Worker } from "bullmq";
import { QueueEvents } from "bullmq";

// Create a BullMQ queue
const imageProcessingQueue = new Queue("imageProcessing", {
  connection: {
    // Redis connection options
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
  },
});

/* Bull-board */

import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter.js";
import { ExpressAdapter } from "@bull-board/express";

const serverAdapter = new ExpressAdapter();

const bullBoard = createBullBoard({
  queues: [new BullMQAdapter(imageProcessingQueue)],
  serverAdapter: serverAdapter,
});

serverAdapter.setBasePath("/bull-board");
app.use("/bull-board", serverAdapter.getRouter());

/* Routing */
import cors from "cors";
app.use(cors());

// Logging the rejected field from multer error
app.use((error, req, res, next) => {
  console.log("This is the rejected field ->", error.field);
});

const PORT = process.env.PORT || 3000;

// Define storage settings for multer
import multer from "multer";
// Store uploaded files in memory
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "../imageStorage");
  },
  filename: (req, file, cb) => {
    console.log(file);
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024, fieldSize: 52428800 },
});

// Define route handler for handling file uploads
// maxCount: 20 is the maximum number of files allowed to be upload.
app.post("/upload", upload.array("files", 20), async (req, res) => {
  try {
    // Retrieve the uploaded array of files from the request
    const imageFiles = req.files;

    if (!imageFiles) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    // Add file to BullMQ worker
    // Generate a unique job ID
    const jobID = uuidv4();

    // Check if a job with the same ID already exists
    const existingJob = await imageProcessingQueue.getJob(jobID);

    if (existingJob) {
      console.log(
        `Job with ID ${jobID} already exists. Skipping job creation.`
      );
      return;
    }

    // Add each file to the queue
    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      console.log("File received:", file.originalname);
      // Here you can process each file as needed
      imageProcessingQueue.add(jobID, { imageFile: file });
      console.log(`Successfully added ${file.originalname} to the queue!`);
    }

    // Send a response indicating successful upload
    res.status(200).json({ message: "Image uploaded successfully" });
  } catch (error) {
    console.error("Error uploading image:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Route for handling photo search
// TODO: accept multiple keywords
app.get("/search", async (req, res) => {
  let client;
  try {
    // Connect to MongoDB
    client = new MongoClient(process.env.MONGO_URL);
    await client.connect();

    // Get reference to database and collection
    const database = client.db("Obscurum-Photos");
    const collection = database.collection("list");

    const keywords = String(req.query.keywords);

    // Construct search query
    const searchQuery = {
      clarifaiTags: { $regex: keywords, $options: "i" },
    };

    // Execute search query
    const searchResults = await collection.find(searchQuery).toArray();

    // Convert binary image data to base64 for each photo
    const photos = searchResults.map((photo) => ({
      imageName: photo.imageName,
      base64Image: photo.imageBinaryData.toString("base64"), // Assuming imageBinaryData is Buffer
    }));

    // Send photos data to frontend
    res.json(photos);
  } catch (error) {
    console.error("Error searching for photos:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    if (client) {
      // Close MongoDB connection
      await client.close();
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// BullMQ worker for image processing tasks
const worker = new Worker(
  "imageProcessing",
  async (job) => {
    const { imageFile } = job.data;

    // Process the photo and convert image to binary
    console.log(`Worker doing job for ${imageFile.originalname}`);
    const imagePath = `${imageFile.path}`; // Combine directory path and image name
    const imageData = fs.readFileSync(imagePath);
    const imageBinaryData = imageData.toString("base64");

    // 1. Send photo to Clarifai

    const clarifaiTags = await Promise.all([
      generateClarifaiTags(imagePath, "aaa03c23b3724a16a56b629203edc62c"),
      generateClarifaiTags(imagePath, "color-recognition"),
    ]);

    const combinedTags = [].concat(...clarifaiTags);

    // Insert to MongoDB
    let client;
    try {
      // Connect to the MongoDB cluster
      client = new MongoClient(process.env.MONGO_URL);
      await client.connect();

      const database = client.db("Obscurum-Photos");
      const collection = database.collection("list");

      // Create a new image document and save it to MongoDB

      const imageDoc = {
        imageName: imageFile.originalname,
        imageBinaryData: imageBinaryData,
        clarifaiTags: combinedTags,
      };

      await collection
        .insertOne(imageDoc)
        .then(() => console.log(`Inserted image ${imageFile.originalname}`))
        .catch((err) => {
          console.error(`Error inserting image: ${file}`);
          console.error(`${err}`);
        });
    } finally {
      if (client) {
        await client.close();
      }
      await console.log(`Processing completed for ${imageFile.originalname}`);
    }
  },
  {
    connection: {
      // Redis connection options
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
      password: process.env.REDIS_PASSWORD,
    },
    removeOnFail: { count: 0 },
    concurrency: 10,
  }
);

// * * * Worker event listeners * * *
// Event listener for job completed event
// worker.on("completed", async (job, result) => {
//   await console.log(result);
//   await console.log(`Processing completed for photo: ${job.data.photo}`);
//   await job.remove();
// });

// worker.on("error", (err) => {
//   console.log(err);
// });

// * * * Queue event listeners * * *
const queueEvents = new QueueEvents("imageProcessing", {
  connection: {
    // Redis connection options
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
  },
});

queueEvents.on("completed", ({ jobId, returnvalue }) => {
  // Called every time a job is completed by any worker.
  console.log(`job ${jobId} completed`);
});

queueEvents.on("failed", ({ jobId, failedReason }) => {
  // Called whenever a job is moved to failed by any worker.
  console.log(`job ${jobId} failed`);
  console.log(failedReason);
});

queueEvents.on("progress", ({ jobId, data }) => {
  // jobId received a progress event
  console.log(`job ${jobId} progress:`);
  console.log(data);
});

// Event listener for queue empty event
imageProcessingQueue.on("completed", async () => {
  console.log("All jobs processed. Queue is empty.");
});

// Methods

async function printActiveCount() {
  const activeCount = await imageProcessingQueue.getActiveCount();
  console.log("Number of active jobs:", activeCount);
}

// Clean the queue to remove all items
async function removeAllItemsFromQueue() {
  try {
    await imageProcessingQueue.clean(0, "delayed");
    console.log("All items removed from the queue.");
  } catch (error) {
    console.error("Error removing items from the queue:", error);
  }
}

// Get all pending jobs (waiting list)
async function getPendingJobs() {
  const jobs = await imageProcessingQueue.getJobs(["waiting"]);
  return jobs;
}

/**
 * This function accesses each photo in a directory to extract
 * metadata, add metadata, find clarifai tags, then upload to MongoDB.
 * @param {*} directoryPath
 */

// const processFiles = async (directoryPath) => {
//   const startTime = new Date(); // Record start time

//   const files = fs.readdirSync(directoryPath);

//   for (const file of files) {
//     if (file.endsWith(".jpg") || file.endsWith(".png")) {
//       const imageFilePath = `${directoryPath}/${file}`;

//       // Generate a unique job ID
//       const jobID = uuidv4();

//       // Check if a job with the same ID already exists
//       const existingJob = await imageProcessingQueue.getJob(jobID);

//       if (existingJob) {
//         console.log(
//           `Job with ID ${jobID} already exists. Skipping job creation.`
//         );
//         return;
//       }

//       // Add the job to the queue
//       imageProcessingQueue.add(jobID, { imageName: file });
//       console.log(`Successfully added ${file} to the queue!`);
//     } else {
//       console.log(
//         `Cannot add ${file} to the queue! Accepted formats are .jpg and .png`
//       );
//     }
//   }
// };

/**
 * This method generates a list of AI-generated tags using a
 * model found in your Clarifai app.
 * @param {*} image
 * @param {*} model
 * @returns
 */
const generateClarifaiTags = async (image, model) => {
  const metadata = new grpc.Metadata();
  const imageBytes = fs.readFileSync(image);
  metadata.set("Authorization", "Key 293262f9fe0c4c359af912839acdf9e3");

  return new Promise((resolve, reject) => {
    stub.PostModelOutputs(
      {
        user_app_id: {
          user_id: process.env.CLARIFAI_USER_ID,
          app_id: CLARIFAI_APP_ID,
        },
        inputs: [
          { data: { image: { base64: imageBytes.toString("base64") } } },
        ],
        model_id: model,
      },
      metadata,
      (err, response) => {
        if (err) {
          reject(err);
          return;
        }

        if (response.status.code !== 10000) {
          reject(
            new Error("Received failed status: " + response.status.description)
          );
          return;
        }

        // visual classifier tags
        if (model == "aaa03c23b3724a16a56b629203edc62c") {
          const concepts = response.outputs[0].data.concepts;
          const list_of_concepts = concepts.map((concept) => concept.name);
          resolve(list_of_concepts);
        }
        // color tags
        else if (model == "color-recognition") {
          const colors = response.outputs[0].data.colors;
          const list_of_colors = colors.map((color) => color.w3c.name);
          resolve(list_of_colors);
        }
      }
    );
  });
};

// Run program
// processFiles(directoryPath);

// imageProcessingQueue.drain();
