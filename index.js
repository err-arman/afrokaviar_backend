const express = require("express");
const app = express();
const port = 3000;
const fs = require("fs");
const path = require("path");
const ffmpegPath = "C:/ffmpeg/bin/ffmpeg.exe";
const ffmpeg = require("fluent-ffmpeg");
const { google } = require("googleapis");
require("dotenv").config(); // For managing environment variables
const createReadStream = require("fs").createReadStream;
const fetchChannel = require("./utils/getChannels.ts");

const credentials = require("./credentials.json");
const { file } = require("googleapis/build/src/apis/file/index");
const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly",
];
ffmpeg.setFfmpegPath(ffmpegPath);

// Target folder ID where files are uploaded
async function authorize() {
  const jwtClient = new google.auth.JWT(
    credentials.client_email,
    null,
    credentials.private_key,
    SCOPES
  );
  await jwtClient.authorize();
  return jwtClient;
}

// Get folder path information
async function getFolderPath(authClient, folderId) {
  const drive = google.drive({ version: "v3", auth: authClient });
  const folderPath = [];
  let currentFolderId = folderId;

  while (currentFolderId) {
    try {
      // Get current folder information
      const folder = await drive.files.get({
        fileId: currentFolderId,
        fields: "name,parents",
      });

      // Add folder to path
      folderPath.unshift(folder.data.name);

      // Check if this folder has parents
      if (folder.data.parents && folder.data.parents.length > 0) {
        currentFolderId = folder.data.parents[0];
      } else {
        // No more parents - we've reached the root
        break;
      }
    } catch (error) {
      console.error("Error getting folder info:", error.message);
      break;
    }
  }

  return folderPath.join(" > ");
}

async function uploadFile(authClient, filePaths) {
  const drive = google.drive({ version: "v3", auth: authClient });
  const uploadResults = [];

  for (const filePath of filePaths) {
    const fileMetadata = {
      name: path.basename(filePath),
      parents: [process.env.FOLDER_ID],
    };

    try {
      // Upload the file
      const file = await drive.files.create({
        resource: fileMetadata,
        media: {
          body: fs.createReadStream(`./file/${filePath}`),
        },
        fields: "id",
      });

      console.log(`File ${filePath} uploaded successfully. File ID:`, file.data.id);

      // Get folder information
      const folderInfo = await drive.files.get({
        fileId: process.env.FOLDER_ID,
        fields: "name",
      });

      // Get the complete folder path
      const folderPath = await getFolderPath(authClient, process.env.FOLDER_ID);

      console.log("File uploaded to folder:", folderInfo.data.name);
      console.log("Complete folder path:", folderPath);

      // Generate direct link to the file
      const fileLink = `https://drive.google.com/file/d/${file.data.id}/view`;
      console.log("File link:", fileLink);

      uploadResults.push({
        fileId: file.data.id,
        fileName: filePath,
        folderName: folderInfo.data.name,
        folderPath: folderPath,
        fileLink: fileLink,
      });
    } catch (error) {
      console.error(`Error uploading file ${filePath}:`, error.message);
      // Continue with next file even if one fails
    }
  }

  return uploadResults;
}
// Routes
app.get("/", async (req, res) => {
  try {
    const allChannel = await fetchChannel.fetchChannels();
    const takeScreenShot = allChannel.map((channel) => {
      return new Promise((resolve, reject) => {
        ffmpeg()
          .input(channel.channel_url)
          .inputOptions([
            "-headers",
            "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36\r\n",
          ])
          .screenshots({
            timestamps: ["00:00:01"],
            filename: `${channel.channel_name}.png`,
            folder: "./file",
            size: "1280x720",
          })
          .on("end", () => {
            console.log(`✅ Screenshot taken for ${channel.channel_name}`);
            resolve();
          })
          .on("error", (err) => {
            console.error(
              `❌ Error taking screenshot for ${channel.channel_name}`,
              err
            );
            // reject(err);
            resolve();
          });
      });
    });

    await Promise.all(takeScreenShot);

    // spread sheet start
    fetch(process.env.SPREADSHEET_POST_API, {
      method: "POST",
      mode: "no-cors",
      body: JSON.stringify([
        { name: "abc", channel_url: "abc.com" },
        { name: "xyz", channel_url: "xyz.com" },
      ]),
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then((res) => {
        console.log("res", res);
      })
      .catch((err) => {
        console.error("Error submitting to Google Sheet:", error);
      });

    // spreadsheet end

    // Read actual files from directory after screenshots are taken
    const filePaths = fs
      .readdirSync("./file")
      .filter((file) => file.endsWith(".png"));

    if (filePaths.length === 0) {
      throw new Error("No PNG files found in the file directory");
    }

    console.log("filePaths", filePaths);
    console.log("filepath.length", filePaths.length);
    // Upload and get file information
    const authClient = await authorize();
    const uploadResult = await uploadFile(authClient, filePaths);

    res.json({
      message: "Screenshot taken and uploaded successfully",
      fileInfo: uploadResult,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
