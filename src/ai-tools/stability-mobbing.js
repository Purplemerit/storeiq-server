const fs = require("fs");
const FormData = require("form-data");
const sharp = require("sharp");

const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

async function generateCompositeWithStability(sceneFile, maskFile, promptText) {
  const STABILITY_KEY = process.env.STABILITY_API_KEY;
  if (!STABILITY_KEY) throw new Error("Set STABILITY_API_KEY environment variable");

  const sceneBuffer = await sharp(sceneFile.path)
    .resize(1024, 1024, { fit: "inside" })
    .png()
    .toBuffer();

  const maskBuffer = await sharp(maskFile.path)
    .resize(1024, 1024, { fit: "inside" })
    .png()
    .toBuffer();

  const form = new FormData();
  form.append("image", sceneBuffer, { filename: "scene.png" });
  form.append("mask", maskBuffer, { filename: "mask.png" });
  form.append("prompt", promptText);
  form.append("width", "1024");
  form.append("height", "1024");
  form.append("steps", "30");
  form.append("cfg_scale", "7");
  form.append("samples", "1");

  const fetchFunc = await fetch;
  const response = await fetchFunc(
    "https://api.stability.ai/v2beta/stable-image/edit/inpaint",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STABILITY_KEY}`,
        Accept: "application/json",
        ...form.getHeaders(),
      },
      body: form,
    }
  );

  const data = await response.json();
  console.log("Full Stability response:", JSON.stringify(data, null, 2));

  // v2beta sometimes returns `data.image` instead of `data.artifacts[0].base64`
  const base64Image =
    data?.artifacts?.[0]?.base64 || data?.image || null;

  if (!base64Image) {
    throw new Error("Stability API did not return an image");
  }

  return `data:image/png;base64,${base64Image}`;
}

module.exports = { generateCompositeWithStability };
