// src/aimodel/bytez.js
const Bytez = require("bytez.js");

if (!process.env.BYTEZ_API_KEY) {
  throw new Error("BYTEZ_API_KEY not set in environment");
}

const sdk = new Bytez(process.env.BYTEZ_API_KEY);
const videoModel = sdk.model("vdo/text-to-video-ms-1.7b");

module.exports = videoModel;
