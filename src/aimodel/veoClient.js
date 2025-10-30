const { VertexAI } = require("@google-cloud/vertexai");

const vertex = new VertexAI({
  project: "storeiq-auth",
  location: "asia-south1", // updated to India region
});

const videoModel = vertex.getGenerativeModel({
  model: "veo-3.1-generate-preview",
});

module.exports = videoModel;