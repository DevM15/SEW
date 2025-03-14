const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { MongoClient, GridFSBucket, ObjectId } = require("mongodb");

const app = express();

// Middleware
// app.use(cors()); // Allow frontend to connect
app.use(
  cors({
    origin: "https://sewit.vercel.app", // Allow this domain only
    methods: "GET, POST, PUT, DELETE", // Allowed HTTP methods
    credentials: true, // Allow cookies
  })
);
//app.use(express.json()); // Parse JSON bodies
app.use(express.json({ limit: "50mb" })); // Increase JSON request size limit
app.use(express.urlencoded({ limit: "50mb", extended: true })); // Increase URL-encoded size limit

// MongoDB connection details
const uri =
  "mongodb+srv://devmistry1501:devmistry1501@cluster0.q361c.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"; // Replace with your MongoDB connection string
const client = new MongoClient(uri);

// Function to check if a room ID exists in the database
async function checkRoom(roomId) {
  try {
    // Connect to the MongoDB client
    await client.connect();

    // Access the database and collection
    const db = client.db("room_id");
    const collection = db.collection("room");
    const roomName = "roomId";
    // Check if the room ID exists
    const existingRoom = await collection.findOne({ roomName: roomId });
    console.log(existingRoom);

    if (existingRoom) {
      // Room ID already exists
      return "Room exists!";
    }
  } catch (error) {
    console.error("Error accessing the database:", error);
    return "An error occurred!";
  } finally {
    // Ensure the client is closed after the operation
    await client.close();
  }
}

// Function to fetch PDF Name by room ID
async function getPdfIdsByRoomId(roomId) {
  try {
    // Connect to MongoDB
    await client.connect();
    console.log("Connected to MongoDB!");

    // Access the database and the 'room' collection
    const db = client.db("room_id"); // Database name
    const collection = db.collection("room"); // Collection name

    // Query to fetch all PDF file names
    const output = await collection
      .find({ roomId: roomId }, { projection: { name: 1 } })
      .toArray();

    // Extract and return the names of the PDFs
    const pdfIds = output.map((pdf) => pdf.name);
    console.log("PDF IDs:", pdfIds, roomId);

    return pdfIds;
  } catch (error) {
    console.error("Error fetching PDF IDs:", error);
  } finally {
    // Close the MongoDB connection
    await client.close();
    console.log("MongoDB connection closed.");
  }
}

// Function to check and add a room ID to the database
async function checkAndAddRoom() {
  const roomId = Math.floor(Math.random() * 1000000).toString();

  try {
    // Connect to the MongoDB client
    await client.connect();

    // Access the database and collection
    const db = client.db("room_id");
    const collection = db.collection("pdfs.files");

    // Check if the room ID exists
    const existingRoom = await collection.findOne({ roomId: roomId });

    if (existingRoom) {
      // Room ID already exists
      checkAndAddRoom();
    } else {
      return roomId;
    }
  } catch (error) {
    console.error("Error accessing the database:", error);
    return "An error occurred!";
  } finally {
    // Ensure the client is closed after the operation
    await client.close();
  }
}

async function uploadPDF(arrayBuffer, fileName, roomId) {
  try {
    await client.connect();
    console.log("Connected to MongoDB Atlas");

    const db = client.db("room_id"); // Change this to your database name
    const bucket = new GridFSBucket(db, { bucketName: "pdfs" });

    console.log("Bucket initialized");

    // Convert ArrayBuffer to Buffer
    const buffer = Buffer.from(arrayBuffer);

    // Open upload stream
    const uploadStream = bucket.openUploadStream(fileName);

    // Store metadata (optional)
    const collection = db.collection("room");
    await collection.insertOne({
      pdfId: uploadStream.id,
      fileName,
      roomId,
      createdAt: new Date(), // Current timestamp
    });
    await collection.createIndex({ createdAt: 1 }, { expireAfterSeconds: 600 }); // 7 days

    console.log("Collection updated with PDF ID");

    // Write Buffer to GridFS
    uploadStream.end(buffer);

    console.log(`PDF uploaded successfully with ID: ${uploadStream.id}`);
    return uploadStream.id; // Return file ID for reference
  } catch (error) {
    console.error("Error uploading PDF:", error);
    throw error;
  } finally {
    // Ensure the client is closed after the operation
    //await client.close();
  }
}

// Routes

app.post("/api/download", async (req, res) => {
  const { pdfname } = req.body; // Extract the file Name from the URL

  try {
    await client.connect();
    const db = client.db("room_id"); // Replace with your database name
    const bucket = new GridFSBucket(db, { bucketName: "pdfs" });

    // Find the file's metadata in fs.files collection
    const fileDoc = await db
      .collection("pdfs.files")
      .findOne({ filename: pdfname });

    if (!fileDoc) {
      return res.status(404).json({ error: "File not found" });
    }

    const objectId = fileDoc._id; // Get the ObjectId of the file

    // Open a download stream for the file
    const downloadStream = bucket.openDownloadStream(objectId);

    // Set response headers for downloading a PDF
    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdfname}"`,
    });

    // Pipe the download stream directly to the response
    downloadStream.pipe(res);

    // Handle errors in the download stream
    downloadStream.on("error", (error) => {
      console.error("Error streaming file:", error);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Error downloading file.");
    });

    downloadStream.on("end", () => {
      console.log(`File '${pdfname}' streamed successfully.`);
    });
  } catch (error) {
    console.error("Error downloading file:", error);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Error connecting to database or retrieving file.");
  } finally {
  }
});

let db;
async function connectDB() {
  try {
    await client.connect();
    db = client.db("room_id"); // Select database
    console.log("Connected to MongoDB");
  } catch (err) {
    console.error("MongoDB connection error:", err);
  }
}
connectDB();
// Multer setup for handling file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.post("/upload", upload.single("pdf"), async (req, res) => {
  try {
    // Connect to the MongoDB client
    await client.connect();

    // Access the database and collection
    const db = client.db("room_id");
    const pdfCollection = db.collection("room"); // Select collection
    const roomd = req.body.roomId;

    const newPDF = {
      name: req.file.originalname,
      data: req.file.buffer, // Storing PDF as a binary buffer
      roomId: roomd, // Associate file with a room ID
    };
    await pdfCollection.insertOne(newPDF);
    await pdfCollection.createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: 10 }
    ); // 7 days
    res.json({ message: "PDF uploaded successfully!" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Error uploading PDF" });
  } finally {
    await client.close();
  }
});

app.post("/api/joinRoom", (req, res) => {
  const { roomId } = req.body;

  checkRoom(roomId)
    .then((result) => {
      console.log(result);
      return res.json({ message: result });
    })
    .catch((error) => {
      res.status(500).json({ error: "An error occurred while checking room." });
    });
});

app.post("/api/getPdfNames", async (req, res) => {
  const { roomId } = req.body; // Get the roomId from the request body
  getPdfIdsByRoomId(roomId)
    .then((pdfIds) => {
      res.json({ pdfIds: pdfIds });
    })
    .catch((error) => {
      res
        .status(500)
        .json({ error: "An error occurred while fetching PDF IDs." });
    });
});

app.get("/api/newRoom", (req, res) => {
  checkAndAddRoom()
    .then((roomId) => {
      res.json({ roomId: roomId });
    })
    .catch((error) => {
      res
        .status(500)
        .json({ error: "An error occurred while generating room ID." });
    });
});

// Start Server
app.listen(5000, () => {
  console.log("Backend is running on http://localhost:5000");
});
