const express = require("express");
const authRouter = require("./auth");
const aiRouter = require("./ai");
const videoRouter = require("./video");
const scriptHistoryRouter = require("./scriptHistory");

const statsRouter = require("./stats");
const router = express.Router();

// Apply body parsers only to routers that need them (not videoRouter)
const bodyParser = express.json;
const urlencoded = express.urlencoded;

// aiRouter and scriptHistoryRouter need body parsing
router.use("/auth", authRouter);
router.use("/", authRouter); // Expose /me at /api/me
router.use("/", bodyParser(), urlencoded({ extended: true }), aiRouter);
router.use("/", videoRouter); // No body parser for videoRouter (upload-video)
router.use("/scripts", bodyParser(), urlencoded({ extended: true }), scriptHistoryRouter);

router.use("/stats", statsRouter);

module.exports = router;